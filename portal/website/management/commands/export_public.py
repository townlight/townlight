import hashlib, json
import shutil
from pathlib import Path
from django.core.management.base import BaseCommand, CommandError
from wagtail.models import Site
from website.models import Meeting
from website.townlight import release_file
from vendor.civiccore.manifest import ExportManifest, ManifestFile, validate_manifest
class Command(BaseCommand):
    help = "Export published public pages and meetings into a portable JSON bundle."
    def add_arguments(self, parser): parser.add_argument("directory")
    def handle(self, *args, **options):
        root=Path(options["directory"])
        if root.exists() and any(root.iterdir()): raise CommandError("Export directory must be empty")
        root.mkdir(parents=True, exist_ok=True)
        site=Site.objects.get(is_default_site=True)
        pages=[]
        for page in site.root_page.get_descendants(inclusive=True).live().public().specific():
            if page.__class__.__name__ not in ("HomePage", "ServicePage"): continue
            pages.append({"type":page.__class__.__name__, "title":page.title, "url":page.url, "content":getattr(page, "intro", getattr(page, "body", ""))})
        meetings=list(Meeting.objects.filter(published=True).values("id", "vendor", "tenant", "external_id", "title", "scheduled_start", "display_timezone", "cancelled", "agenda", "documents", "recording_url", "source_url", "source_digest", "revision", "source_body"))
        files=[]
        for meeting in meetings:
            if meeting['vendor'] != 'townlight': meeting.pop('source_body', None)
        for item in Meeting.objects.filter(published=True, vendor='townlight'):
            try:
                source=release_file(item)
                with source.open('rb') as stream: digest=hashlib.file_digest(stream, 'sha256').hexdigest()
                size=source.stat().st_size
            except (OSError, ValueError) as error: raise CommandError('Release unavailable') from error
            if not size or digest != item.revision: raise CommandError('Release integrity check failed')
            name=f'releases/{item.pk}.bin'
            (root/'releases').mkdir(exist_ok=True)
            shutil.copyfile(source, root/name)
            files.append(ManifestFile(path=name, byte_size=size, sha256=item.revision, media_type=item.release_media_type))
        content=json.dumps({"pages":pages,"meetings":meetings}, default=str, ensure_ascii=False, indent=2).encode("utf-8")
        (root/"content.json").write_bytes(content)
        manifest=ExportManifest(module_name="townlight-portal", module_version="0.1.0", civiccore_version="vendored", generated_files=[ManifestFile(path="content.json", byte_size=len(content), sha256=hashlib.sha256(content).hexdigest(), media_type="application/json"), *files], limitations=["External links are references only; remote content is not included."])
        (root/"manifest.json").write_text(manifest.model_dump_json(indent=2), encoding="utf-8")
        validate_manifest(root/"manifest.json", base_path=root)
        self.stdout.write(f"Exported {len(pages)} pages and {len(meetings)} meetings")
