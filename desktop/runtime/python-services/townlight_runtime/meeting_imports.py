"""Historical Townlight reader entry point, implemented by the pinned standalone SDK."""

from civic_data_connectors.compat import (
    CONTRACT_VERSION,
    MAX_INPUT_BYTES,
    SOURCE_FORMATS,
    ImportInputError,
    main,
    preview_export,
    read_json,
    source_formats,
    source_namespace,
)

__all__ = [
    "CONTRACT_VERSION", "MAX_INPUT_BYTES", "SOURCE_FORMATS", "ImportInputError",
    "main", "preview_export", "read_json", "source_formats", "source_namespace",
]

if __name__ == "__main__":
    raise SystemExit(main())
