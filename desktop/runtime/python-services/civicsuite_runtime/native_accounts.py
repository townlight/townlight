"""Explicit native account provisioning for migration/setup, not HTTP login.

Never copy native passcode verifiers into the web authentication store. Existing
unmapped SQL accounts are collisions, not permission to overwrite their roles.
"""
import json
import secrets
import uuid

import sqlalchemy as sa
from fastapi_users.password import PasswordHelper
from app.models.user import User, UserRole
from civicsuite_runtime.records_import import stable_id, unique_object

metadata = sa.MetaData()
accounts = sa.Table("native_account_links", metadata,
    sa.Column("email", sa.Text, primary_key=True),
    sa.Column("user_id", sa.Uuid, sa.ForeignKey(User.id), nullable=False, unique=True),
    sa.Column("native_role", sa.Text, nullable=False))
ROLES = {"local-admin", "city-staff", "clerk", "records-staff", "code-staff"}


def account_snapshot(root):
    admin_path = root / "config" / "first-admin.json"
    staff_path = root / "config" / "staff-users.json"
    raw = {admin_path:admin_path.read_bytes()}
    if staff_path.exists():
        raw[staff_path] = staff_path.read_bytes()
    admin = json.loads(raw[admin_path], object_pairs_hook=unique_object)
    staff = json.loads(raw[staff_path], object_pairs_hook=unique_object) if staff_path in raw else []
    if not isinstance(admin, dict) or admin.get("role") != "local-admin" or not isinstance(staff, list):
        raise ValueError("Invalid native account configuration.")
    result = []
    for index, item in enumerate([admin, *staff]):
        email = item.get("email")
        role = item.get("role")
        active = True if index == 0 else item.get("active")
        if (not isinstance(email, str) or not email.strip() or len(email.strip()) > 320
                or role not in ROLES or type(active) is not bool
                or not isinstance(item.get("display_name"), str)):
            raise ValueError("Invalid native account fields.")
        result.append(dict(email=email.strip().lower(), role=role, active=active, name=item["display_name"]))
    if len({item["email"] for item in result}) != len(result):
        raise ValueError("Duplicate native account identity.")
    return raw, result


async def provision_accounts(session, root):
    """Caller owns the fenced setup/import transaction. No commit or activation."""
    raw, native = account_snapshot(root)
    result = {}
    for item in native:
        link = (await session.execute(sa.select(accounts).where(accounts.c.email == item["email"]))).mappings().first()
        user = await session.scalar(sa.select(User).where(sa.func.lower(User.email) == item["email"]))
        role = UserRole.ADMIN if item["role"] == "local-admin" else UserRole.STAFF
        if link is None:
            if user is not None:
                raise ValueError("Native identity collides with an unmapped SQL account; no roles changed.")
            user = User(id=uuid.UUID(stable_id(root, "native-user", item["email"])), email=item["email"],
                hashed_password=PasswordHelper().hash(secrets.token_urlsafe(48)),
                full_name=item["name"], role=role, is_active=item["active"],
                is_superuser=False, is_verified=True, must_change_password=False)
            session.add(user)
            await session.flush()
            await session.execute(accounts.insert().values(email=item["email"], user_id=user.id, native_role=item["role"]))
        else:
            if user is None or user.id != link["user_id"]:
                raise ValueError("Native identity link no longer matches its SQL account.")
            user.role, user.is_active, user.full_name = role, item["active"], item["name"]
            await session.execute(accounts.update().where(accounts.c.email == item["email"]).values(native_role=item["role"]))
        result[item["email"]] = user.id
    if any(path.read_bytes() != content for path, content in raw.items()):
        raise ValueError("Native accounts changed during provisioning; transaction must roll back.")
    return result
