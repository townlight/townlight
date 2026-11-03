# SPDX-License-Identifier: AGPL-3.0-only
import json
from pathlib import Path
from django.core.management.base import BaseCommand, CommandError
from website.townlight import sync

class Command(BaseCommand):
    help = 'Publish or withdraw one approved Townlight selection from a private JSON file.'
    def add_arguments(self, parser):
        parser.add_argument('selection')
    def handle(self, *args, **options):
        try:
            selection = json.loads(Path(options['selection']).read_text(encoding='utf-8'))
            sync(selection)
        except Exception as exc:
            raise CommandError('Townlight synchronization failed; existing publication was preserved.') from exc
        self.stdout.write('Townlight selection synchronized.')
