<a id="townlight-windows-runtime-payload"></a>

# Townlight Windows Runtime Payload

This directory is the build-time payload root for the Windows Local 1.0 desktop
installer. Release packaging places portable runtime files here before the
Tauri MSI bundle is built:

- `postgres/` contains portable PostgreSQL 17 with pgvector.
- `python/` contains bundled CPython plus Townlight Core and city-core services.
- `ollama/` contains the native Ollama runtime.
- `station/` contains the complete accepted Station media subtree, including the
  media tools, runtime, CivicCast media source, and notices.

For `inspections-preview`, `prepare-runtime-payload.ps1` restores `station/`
from the pinned signed Windows 1.8.1.1 MSI. The script checks the published MSI
SHA-256 and requires a `Valid` Authenticode signature from Scott Converse
before administrative extraction. It validates the extracted media files
against the pinned Station `townlight_station/media-lock.json`, copies the full
subtree without changing file bytes, and adds the six required Station files to
the generated payload lock. The MSI source and extraction are build inputs;
they do not change the compiled `windows-runtime-payloads.json` manifest.

The desktop supervisor copies these payloads into the local Townlight runtime
profile during install or repair and refuses to report required services as
installed when required files are missing.

For the coordinated fresh-install candidate, bind the clean umbrella commit to
an external state receipt with `scripts/candidate_verifier.py --bind-local-desktop`.
Build the full cohort with `scripts/demo_wheels.py --all-products --state` using
that receipt and the exact component checkouts. Run
`desktop/scripts/assemble-coordinated-payload.py --help` for the input paths.
The assembler requires the pinned signed accepted MSI and its verified extracted
file inventory and historical service exclusions. Keep these receipts with the
corresponding source; they describe the immutable previous artifact. Assembly
refuses to overlay a populated payload and never uses the host's installed app.
Use a short checkout path for the Windows bundle.

The prepared receipt lists any newly generated native files that still require
signing. A prepared payload is only a build input. The new installer signature,
hash, corresponding source and installed acceptance are separate evidence.
