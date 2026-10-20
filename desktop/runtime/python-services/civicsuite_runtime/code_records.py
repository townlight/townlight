import hashlib
import json
from datetime import date

from civiccode.section_lifecycle import SectionLifecycleRepository, SectionLifecycleError
from civiccode.source_registry import SourceRegistryRepository, SourceRegistryError, source_to_public_dict
from civiccode.citation_contract import build_citation_payload
from civiccode.public_exports import build_records_ready_export


def snapshot(context, source):
    public = source_to_public_dict(source)
    citation = build_citation_payload(
        section=context['section'],
        version=context['version'],
        title=context['title'],
        chapter=context['chapter'],
        source=public,
        as_of=context['as_of'],
    )
    export = build_records_ready_export(lookup=context, citation_payload=citation, source=public)
    text = json.dumps(export, ensure_ascii=False, sort_keys=True) + '\n'
    sha = hashlib.sha256(text.encode()).hexdigest()
    identity = 'townlight:code:export:' + hashlib.sha256(json.dumps([
        context['section']['section_id'],
        context['version']['version_id'],
        context['as_of'],
    ]).encode()).hexdigest()
    return dict(
        source_id=identity,
        kind='ordinance',
        title=export['title'],
        sha256=sha,
        version=context['version']['version_id'],
        visibility='public',
        text=text,
        excerpt=context['version']['body'][:500],
        citation=citation['citation']['citation_text'] + '; source=' + identity + '; sha256=' + sha,
        as_of=context['as_of'],
        section_id=context['section']['section_id'],
        section_number=context['section']['section_number'],
        version_context=export['version'],
        source_provenance=export['source_provenance'],
    )


def public_documents(database_url, query='', source_id=None, as_of=None):
    if not database_url.startswith('postgresql'):
        raise ValueError('database_url must be postgresql')
    if isinstance(as_of, str):
        as_of = date.fromisoformat(as_of)
    sections = SectionLifecycleRepository(db_url=database_url)
    sources = None
    try:
        sources = SourceRegistryRepository(db_url=database_url)
        results = []
        for section in sections.list_sections():
            try:
                context = sections.citation_context(section.section_number, as_of=as_of)
                source = sources.get(context['version']['source_id'])
                if not (source.public_visible and source.is_official and source.status == 'active'):
                    continue
                item = snapshot(context, source)
                if source_id and item['source_id'] != source_id:
                    continue
                if query and query.casefold() not in (item['title'] + ' ' + context['version']['body']).casefold():
                    continue
                results.append(item)
            except (SectionLifecycleError, SourceRegistryError):
                continue
        return results
    finally:
        sections.engine.dispose()
        if sources:
            sources.engine.dispose()
