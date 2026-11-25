"""Explicit router aggregation for the desktop parks API."""

from . import (
    parks_admin,  # noqa: F401
    parks_catalog,  # noqa: F401
    parks_finance,  # noqa: F401
    parks_maintenance,  # noqa: F401
    parks_operations,  # noqa: F401
    parks_records,  # noqa: F401
)
from .parks_base import router

__all__ = ["router"]
