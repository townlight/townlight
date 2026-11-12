"""Compatibility names for the standalone package's guarded public fetcher."""

from civic_data_connectors.fetch import fetch_meeting_document, fetch_public

__all__ = ["fetch_meeting_document", "fetch_public"]
