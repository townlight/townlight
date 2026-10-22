"""Explicit Planning composition for source acceptance; profile activation is P5.

Use the installed providers already configured by the runtime. No caller supplies
URLs, provider code, native identity or publication permission.
"""
from dataclasses import asdict


def configure(records_app, planning_app, database_url):
    enabled = records_app.state.desktop_enabled_modules
    required = {"civicplan", "civicclerk", "civiczone", "civicaccess", "civicrecords-ai"}
    if not required.issubset(enabled):
        raise RuntimeError("Planning connections require all enabled source modules.")

    def source_provider(module, attribute):
        def resolve(**kwargs):
            if module not in records_app.state.desktop_enabled_modules:
                raise RuntimeError("Connected source module unavailable.")
            provider = getattr(records_app.state, attribute, None)
            if not callable(provider):
                raise RuntimeError("Connected source provider unavailable.")
            return provider(**kwargs)
        return resolve

    providers = {
        "meetings": source_provider("civicclerk", "desktop_meetings_sources"),
        "zoning": source_provider("civiczone", "desktop_zoning_sources"),
    }

    def access_rewrite(text):
        if "civicaccess" not in records_app.state.desktop_enabled_modules:
            raise RuntimeError("Access support unavailable.")
        from civicaccess.plain_language import rewrite_plain_language
        return asdict(rewrite_plain_language(text))

    def public_documents(query="", source_id=None):
        if "civicplan" not in records_app.state.desktop_enabled_modules:
            raise RuntimeError("Planning source module unavailable.")
        from civicplan.migrations import source_engine
        from civicplan.source_store import PlanSourceRepository
        from civicplan.workflow_store import WorkflowRepository
        engine = source_engine(database_url)
        try:
            return WorkflowRepository(PlanSourceRepository(engine), providers).public_documents(
                query=query, source_id=source_id)
        finally:
            engine.dispose()

    planning_app.state.planning_providers = providers
    planning_app.state.planning_access_rewrite = access_rewrite
    records_app.state.desktop_planning_sources = public_documents
