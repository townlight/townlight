"""Private HTTPS proxy ingress for the bounded Windows staff client.

The runtime and Station remain on loopback. A city-managed proxy publishes
only /staff/v1/ and terminates TLS. Never proxy the native or Station ports.
"""

import base64
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import tempfile
import time

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from starlette.concurrency import run_in_threadpool
from starlette.responses import Response

from townlight_records.auth.desktop_session import NativeDesktopPrincipal, shared_staff_scope
from townlight_runtime.native_accounts import ROLES
from townlight_runtime.shared_operations import ALLOCATION, SharedOperations


UUID = r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}"
COUNCIL_FILE = re.compile(rf"/desktop/v1/meetings/packets/{UUID}/council-file/{UUID}/[A-Za-z0-9][A-Za-z0-9._-]*")
READ = re.compile(rf"/desktop/v1/(?:records-state|requests/{UUID}(?:/view)?|meetings/meetings/{UUID}(?:/proceedings)?|meetings/agenda-items/{UUID}|portal/(?:publications/{UUID}|selections))")
WRITE = re.compile(rf"/desktop/v1/(?:meetings/(?:clerk/catalog|meetings|agenda-items|agenda-items/{UUID}/(?:reviews|meeting)|meetings/{UUID}/(?:packet-snapshots|council-source)|packets/{UUID}/(?:deliver|council-preview|council-approval))|requests(?:/{UUID}/(?:actions|station-recordings))?|portal/publications/(?:(?:packet|recording)|{UUID}/(?:packet|recording)/withdraw))")
RECORDS_FILE = re.compile(rf"/desktop/v1/requests/{UUID}/documents(?:/{UUID}/release-copy)?")
RECORDS_ACTIONS = {"draft-records-response", "approve-records-response", "fulfill-records-request"}
MAX_BODY = 24 * 1024 * 1024
MAX_FILE = 16 * 1024 * 1024
SESSION_SECONDS = 12 * 60 * 60
PASSCODE_HASHER = PasswordHasher()
PRIVATE_PATH_KEYS = {"original_path", "stored_path", "release_original_path", "release_stored_path",
                     "export_path", "output_path", "folder", "bundle_path"}


class SignIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(min_length=1, max_length=320)
    passcode: str = Field(min_length=1, max_length=1024)


class FileUpload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    file_name: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9 ._-]{0,199}$")
    content_base64: str = Field(min_length=4, max_length=4 * ((MAX_FILE + 2) // 3))
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


@dataclass(frozen=True)
class Account:
    email: str
    name: str
    role: str
    verifier: str


@dataclass(frozen=True)
class Grant:
    account: Account
    expires: int


def find_account(profile_root: Path, email: str) -> Account | None:
    config = profile_root / "config"
    try:
        admin = json.loads((config / "first-admin.json").read_bytes())
        staff = json.loads((config / "staff-users.json").read_bytes()) if (config / "staff-users.json").is_file() else []
        if not isinstance(admin, dict) or admin.get("role") != "local-admin" or not isinstance(staff, list):
            return None
        matches = [entry for entry in [admin, *staff] if isinstance(entry, dict)
                   and isinstance(entry.get("email"), str) and entry["email"].strip().lower() == email]
        if len(matches) != 1:
            return None
        entry = matches[0]
        role, name, verifier = entry.get("role"), entry.get("display_name"), entry.get("passcode_hash")
        if (role not in ROLES or (entry is not admin and entry.get("active") is not True)
                or not isinstance(name, str) or not isinstance(verifier, str)
                or entry.get("passcode_algorithm") != "argon2id-v1"):
            return None
        return Account(email, name, role, verifier)
    except (OSError, TypeError, ValueError):
        return None


def verify(verifier: str, passcode: str) -> bool:
    try:
        return PASSCODE_HASHER.verify(verifier, passcode)
    except (InvalidHashError, VerificationError):
        return False


def token_digest(proof: str) -> str:
    return hashlib.sha256(proof.encode("ascii")).hexdigest()


class SharedStaff:
    def __init__(self, profile_root: Path):
        self.profile_root = profile_root
        self.grants: dict[str, Grant] = {}
        self.attempts: dict[str, tuple[int, float]] = {}
        self.dummy_verifier = PASSCODE_HASHER.hash(secrets.token_urlsafe(24))

    async def sign_in(self, login: SignIn) -> tuple[str, Grant]:
        now = time.monotonic()
        self.attempts = {key: value for key, value in self.attempts.items() if value[1] > now}
        email = login.email.strip().lower()
        count, until = self.attempts.get(email, (0, now + 60))
        if count >= 5 or sum(attempts for attempts, _ in self.attempts.values()) >= 60:
            raise HTTPException(429, "Wait before retrying sign-in.")
        # Count before verification yields so simultaneous attempts share the limit.
        self.attempts[email] = (count + 1, until)
        account = find_account(self.profile_root, email)
        valid = await run_in_threadpool(verify, account.verifier if account else self.dummy_verifier, login.passcode)
        if not valid or account is None or find_account(self.profile_root, email) != account:
            raise HTTPException(401, "Sign in with an authorized Townlight account.")
        self.attempts.pop(email, None)
        now_unix = int(time.time())
        self.grants = {key: grant for key, grant in self.grants.items() if grant.expires > now_unix}
        if len(self.grants) >= 256:
            raise HTTPException(503, "Too many active staff sessions.")
        proof = secrets.token_hex(32)
        grant = Grant(account, now_unix + SESSION_SECONDS)
        self.grants[token_digest(proof)] = grant
        return proof, grant

    def resolve(self, proof: str | None) -> NativeDesktopPrincipal | None:
        if proof is None or re.fullmatch(r"[0-9a-f]{64}", proof) is None:
            return None
        digest = token_digest(proof)
        grant = self.grants.get(digest)
        if grant is None:
            return None
        account = grant.account
        if grant.expires <= time.time() or find_account(self.profile_root, account.email) != account:
            self.grants.pop(digest, None)
            return None
        return NativeDesktopPrincipal(account.email, account.name, account.role, grant.expires)


def json_response(content: dict, *, status: int = 200) -> JSONResponse:
    return JSONResponse(content, status_code=status, headers={"Cache-Control": "no-store"})


def identity(principal: NativeDesktopPrincipal) -> dict:
    return {"email": principal.email, "display_name": principal.display_name, "role": principal.role}


async def bounded_body(request: Request, limit: int) -> bytes:
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > limit:
            raise HTTPException(413, "Request exceeds the shared staff limit.")
        body.extend(chunk)
    return bytes(body)


def stage_records_file(profile_root: Path, principal: NativeDesktopPrincipal, path: str, upload: FileUpload) -> dict:
    from townlight_records.requests.files import managed_records_root

    contents = base64.b64decode(upload.content_base64, validate=True)
    if not 0 < len(contents) <= MAX_FILE or hashlib.sha256(contents).hexdigest() != upload.sha256:
        raise ValueError("Uploaded bytes failed their integrity check.")
    root = managed_records_root(profile_root)
    key_input = f"{principal.email}\n{path}\n{upload.file_name}\n{upload.sha256}".encode()
    key = hashlib.sha256(key_input).hexdigest()
    directory = root / "staff-uploads" / key
    directory.mkdir(parents=True, exist_ok=True)
    if not directory.resolve().is_relative_to(root):
        raise ValueError("The upload folder is not inside the managed Records store.")
    # A fixed leaf avoids Windows device names, alternate streams and path aliases.
    suffix = Path(upload.file_name).suffix
    destination = directory / (f"upload{suffix}" if len(suffix) <= 12 else "upload")
    with tempfile.NamedTemporaryFile(dir=directory, prefix="pending-", delete=False) as file:
        temporary = Path(file.name)
        file.write(contents)
    try:
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)
    return {"original_path": f"staff upload: {upload.file_name}", "stored_path": str(destination),
            "file_name": upload.file_name, "sha256": upload.sha256, "size_bytes": len(contents)}


def safe_result(value):
    if isinstance(value, list):
        return [safe_result(item) for item in value]
    if isinstance(value, dict):
        result = {key: "" if key in PRIVATE_PATH_KEYS else safe_result(item) for key, item in value.items()}
        draft = value.get("response_draft")
        if "request_id" in value and isinstance(draft, str):
            result["response_draft_sha256"] = hashlib.sha256(draft.encode()).hexdigest()
        return result
    return value


def install_shared_staff(app: FastAPI, domain_app: FastAPI, profile_root: Path):
    staff = SharedStaff(profile_root)
    operations = SharedOperations(profile_root)

    @app.post("/staff/v1/session", include_in_schema=False)
    async def sign_in(request: Request):
        try:
            login = SignIn.model_validate_json(await bounded_body(request, 4096))
        except ValidationError:
            raise HTTPException(422, "Provide a Townlight email and passcode.") from None
        proof, _ = await staff.sign_in(login)
        principal = staff.resolve(proof)
        if principal is None:
            raise HTTPException(401, "Sign in with an authorized Townlight account.")
        return json_response({**identity(principal), "proof": proof})

    @app.get("/staff/v1/session", include_in_schema=False)
    async def session(request: Request):
        principal = staff.resolve(request.headers.get("x-townlight-session"))
        if principal is None:
            raise HTTPException(401, "Sign in with an authorized Townlight account.")
        return json_response(identity(principal))

    @app.delete("/staff/v1/session", include_in_schema=False)
    async def sign_out(request: Request):
        proof = request.headers.get("x-townlight-session")
        if staff.resolve(proof) is not None:
            staff.grants.pop(token_digest(proof), None)
        return json_response({"signed_out": True})

    @app.api_route("/staff/v1/api/{target:path}", methods=["GET", "POST"], include_in_schema=False)
    async def staff_api(target: str, request: Request):
        path = f"/{target}"
        allowed = READ if request.method == "GET" else WRITE
        council_file = request.method == "GET" and COUNCIL_FILE.fullmatch(path) is not None
        records_upload = request.method == "POST" and RECORDS_FILE.fullmatch(path) is not None
        query = request.url.query
        if council_file:
            pairs = request.query_params.multi_items()
            parameters = dict(pairs)
            allowed_query = (len(pairs) == 3
                             and re.fullmatch(r"[0-9a-f]{64}", parameters.get("manifest_sha256", ""))
                             and re.fullmatch(r"[0-9]{1,16}", parameters.get("offset", ""))
                             and parameters.get("approved") in {"true", "false"})
        else:
            allowed_query = (not query or path == "/desktop/v1/portal/selections"
                             and re.fullmatch(rf"request_id={UUID}", query))
        if (allowed.fullmatch(path) is None and not council_file and not records_upload
                or not allowed_query):
            return json_response({"detail": "This operation is only available on the city host."}, status=404)
        proof = request.headers.get("x-townlight-session")
        principal = staff.resolve(proof)
        if principal is None:
            raise HTTPException(401, "Sign in with an authorized Townlight account.")
        body = await bounded_body(request, MAX_BODY)
        if records_upload or path.endswith(("/actions", "/packet-snapshots")):
            try:
                data = json.loads(body)
                if not isinstance(data, dict):
                    raise ValueError
            except ValueError:
                raise HTTPException(422, "Invalid request.") from None
            if path.endswith("/actions") and (not isinstance(data.get("action"), str) or data["action"] not in RECORDS_ACTIONS):
                raise HTTPException(403, "This Records operation is not available from a staff client.")
            if path.endswith("/actions") and data["action"] in {"draft-records-response", "approve-records-response"}:
                payload = data.get("payload")
                expected = payload.get("expectedResponseSha256") if isinstance(payload, dict) else None
                if not isinstance(expected, str) or re.fullmatch(r"[0-9a-f]{64}", expected) is None:
                    raise HTTPException(422, "Refresh the request before saving or approving its response.")
            if path.endswith("/packet-snapshots") and data.get("source_files") not in (None, []):
                raise HTTPException(422, "Use shared packet file upload, not a host path.")
            if records_upload:
                if not principal.allows_module("townlight_records"):
                    raise HTTPException(403, "This role cannot prepare Records evidence.")
                try:
                    if "file" in data:
                        raise ValueError
                    upload = FileUpload.model_validate(data.pop("upload", None))
                    data["file"] = await run_in_threadpool(stage_records_file, profile_root, principal, path, upload)
                    if path.endswith("/release-copy"):
                        data["added_by"] = principal.display_name
                    body = json.dumps(data).encode()
                except (OSError, ValueError):
                    raise HTTPException(422, "The uploaded Records file could not be verified or stored.") from None
        operation = None
        if request.method == "POST" and ALLOCATION.fullmatch(path):
            operation = request.headers.get("x-townlight-operation")
            if operation is None or re.fullmatch(UUID, operation) is None:
                raise HTTPException(422, "A shared allocation requires a client operation identity.")
            fingerprint = hashlib.sha256(f"{principal.role}\n{path}\n".encode() + body).hexdigest()
            replay = await run_in_threadpool(operations.begin, principal.email, operation, fingerprint)
            if replay is not None:
                if replay.reason is not None:
                    return json_response({"detail": "The previous shared write must be reconciled before retrying.",
                                          "code": replay.reason}, status=409)
                return Response(replay.body, status_code=replay.status, media_type="application/json",
                                headers={"Cache-Control": "no-store"})

        # Dispatch the existing route in the same process and request context.
        # HTTP never supplies the trusted actor or role.
        async def receive():
            return {"type": "http.request", "body": body, "more_body": False}

        response: dict = {}
        output = bytearray()

        async def send(message):
            if message["type"] == "http.response.start":
                response.update(message)
            elif message["type"] == "http.response.body":
                output.extend(message.get("body", b""))

        scope = {**request.scope, "path": path, "raw_path": path.encode("ascii"), "root_path": "",
                 "headers": [(b"content-type", b"application/json"), (b"x-townlight-session", proof.encode("ascii"))]}
        with shared_staff_scope(profile_root, proof, principal):
            await domain_app(scope, receive, send)
        status = response["status"]
        if status >= 400:
            failure = {"detail": "The city host did not accept this operation."}
            if status == 409:
                failure["code"] = "revision-conflict"
                try:
                    details = json.loads(output).get("detail", {})
                    if isinstance(details, dict):
                        revision = details.get("current_revision")
                        if type(revision) is int and revision >= 0:
                            failure["current_revision"] = revision
                        digest = details.get("current_response_sha256")
                        if isinstance(digest, str) and re.fullmatch(r"[0-9a-f]{64}", digest):
                            failure["current_response_sha256"] = digest
                except ValueError:
                    pass
            result = json_response(failure, status=status)
        else:
            payload = json.loads(output)
            if records_upload and isinstance(payload, dict):
                payload["message"] = "Evidence stored and verified by the city host."
            result = JSONResponse(safe_result(payload), status_code=status, headers={"Cache-Control": "no-store"})
        if operation is not None and status < 500:
            await run_in_threadpool(operations.complete, principal.email, operation, status, result.body)
        return result

    # Station's existing read callback runs on host loopback. Carry a valid
    # shared identity for exactly that callback when Records fetches media.
    @app.middleware("http")
    async def station_read_context(request: Request, call_next):
        if (request.url.path == "/desktop/v1/station/context" and request.method == "GET"
                and request.query_params.get("capability") == "read"):
            proof = request.headers.get("x-townlight-session")
            principal = staff.resolve(proof)
            if principal is not None:
                with shared_staff_scope(profile_root, proof, principal):
                    return await call_next(request)
        return await call_next(request)
