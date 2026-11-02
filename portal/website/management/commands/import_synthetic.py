import json
from pathlib import Path
from django.core.management.base import BaseCommand, CommandError
from website.importing import import_fixture
class Command(BaseCommand):
    help = "Import invented PrimeGov fixture through a MockTransport only."
    def add_arguments(self, parser): parser.add_argument("fixture")
    def handle(self, *args, **options):
        try: count = import_fixture(json.loads(Path(options["fixture"]).read_text(encoding="utf-8")))
        except Exception as exc: raise CommandError(str(exc)) from exc
        self.stdout.write(f"Processed {count} explicit instructions")
