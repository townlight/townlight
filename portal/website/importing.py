"""Synthetic fixture-only boundary around the vendored CivicCast adapter."""
import hashlib, json, re
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
import httpx
from django.db import transaction
from vendor.civiccast.agenda_import.primegov import PrimeGovSource
from .models import Meeting

def safe_url(value):
    if not isinstance(value, str) or len(value) > 2000 or any(ord(c) < 33 for c in value):
        raise ValueError("Unsafe URL")
    u = urlsplit(value)
    # Synthetic-only public links. No credentials, IPs, local hosts, or ports.
    if u.scheme != "https" or not u.hostname or not u.hostname.endswith(".example") or u.username or u.password or u.port:
        raise ValueError("Only synthetic HTTPS .example URLs are permitted")
    return value

def import_fixture(data):
    if not isinstance(data, dict) or set(data) != {"tenant", "timezone", "revision", "meetings", "html"}: raise ValueError("Invalid fixture shape")
    tenant, tz, revision = data["tenant"], data["timezone"], data["revision"]
    if not isinstance(tenant, str) or not re.fullmatch(r"[a-z][a-z0-9-]{0,40}", tenant): raise ValueError("Invalid synthetic tenant")
    if not isinstance(revision, str) or not 1 <= len(revision) <= 120: raise ValueError("Invalid revision")
    try: zone = ZoneInfo(tz)
    except (ZoneInfoNotFoundError, TypeError): raise ValueError("Invalid timezone")
    rows, html = data["meetings"], data["html"]
    if not isinstance(rows, list) or not isinstance(html, dict): raise ValueError("Invalid fixture")
    ids = set(); prepared = []
    for row in rows:
        if not isinstance(row, dict) or not set(row) <= {"id", "title", "dateTime", "documentList", "cancelled", "withdrawn", "recording"}: raise ValueError("Invalid meeting fields")
        ident = str(row.get("id", "")); title = row.get("title")
        if not ident or len(ident)>120 or ident in ids or not isinstance(title, str) or not title.strip() or len(title)>400: raise ValueError("Invalid or duplicate meeting identity")
        ids.add(ident)
        if type(row.get("cancelled", False)) is not bool or type(row.get("withdrawn", False)) is not bool: raise ValueError("Invalid status")
        try:
            dt = datetime.fromisoformat(row["dateTime"])
            if dt.tzinfo is None: dt = dt.replace(tzinfo=zone)
            dt = dt.astimezone(timezone.utc)
        except (KeyError, ValueError, TypeError): raise ValueError("Invalid meeting time")
        docs = row.get("documentList")
        if not isinstance(docs, list): raise ValueError("Invalid document list")
        public_docs=[]; native_docs=[]
        for doc in docs:
            if not isinstance(doc, dict) or not set(doc) <= {"id", "title", "templateId", "templateName", "compileOutputType", "link", "private"}: raise ValueError("Invalid document")
            if type(doc.get("private", False)) is not bool: raise ValueError("Invalid document privacy")
            if doc.get("private", False): continue
            native_docs.append(doc)
            if doc.get("link"):
                public_docs.append({"title": str(doc.get("title") or "Document"), "url": safe_url(doc["link"])})
        recording = safe_url(row["recording"]) if row.get("recording") else ""
        clean_row = {k:v for k,v in row.items() if k != "documentList"}; clean_row["documentList"] = native_docs
        prepared.append((clean_row, dt, public_docs, recording))
    clean_rows = [r[0] for r in prepared]
    def handler(request):
        if request.url.host != tenant + ".primegov.com": return httpx.Response(404)
        if request.url.path == "/api/v2/PublicPortal/ListUpcomingMeetings": return httpx.Response(200, json=clean_rows)
        if request.url.path == "/Portal/Meeting":
            content = html.get(request.url.params.get("meetingTemplateId"))
            return httpx.Response(200, text=content) if isinstance(content, str) else httpx.Response(404)
        return httpx.Response(404)
    adapter = PrimeGovSource(transport=httpx.MockTransport(handler))
    normalized=[]
    for row, dt, docs, recording in prepared:
        # A withdrawal is an explicit instruction and does not need a document fetch.
        if row.get("withdrawn"):
            normalized.append((row, dt, docs, recording, None, "", "")); continue
        if row.get("cancelled") and not any(d.get("compileOutputType") == 3 for d in row["documentList"]):
            body = json.dumps({"meeting": row}, sort_keys=True, ensure_ascii=False)
            normalized.append((row, dt, docs, recording, [], body, None)); continue
        agenda = adapter.fetch_agenda(tenant, str(row["id"]))
        # Never persist a URL provided by the vendor without validation. Adapter's
        # synthetic source URL is constructed internally and is not fetched live.
        item_list=[]
        for item in agenda.items:
            item_list.append({"order":item.order, "number":item.number, "title":item.title, "doc_url":safe_url(item.doc_url) if item.doc_url else ""})
        template = parse_qs(urlsplit(agenda.source_doc_url).query).get("meetingTemplateId", [None])[0]
        if template is None: raise ValueError("Synthetic HTML agenda required")
        body = json.dumps({"meeting":row, "agenda_html":html[template]}, sort_keys=True, ensure_ascii=False)
        normalized.append((row, dt, docs, recording, item_list, body, template))
    with transaction.atomic():
        for row, dt, docs, recording, items, body, template in normalized:
            key = dict(vendor="primegov", tenant=tenant, external_id=str(row["id"]))
            if row.get("withdrawn"):
                Meeting.objects.filter(**key).update(published=False)
                continue
            Meeting.objects.update_or_create(**key, defaults={"title":row["title"], "scheduled_start":dt, "display_timezone":tz, "cancelled":row.get("cancelled", False), "published":True, "agenda":items, "documents":docs, "recording_url":recording, "source_url":(f"https://{tenant}.primegov.com/Portal/Meeting?meetingTemplateId={template}" if template else f"https://{tenant}.primegov.com/api/v2/PublicPortal/ListUpcomingMeetings"), "source_body":body, "source_digest":hashlib.sha256(body.encode()).hexdigest(), "revision":revision})
    return len(normalized)
