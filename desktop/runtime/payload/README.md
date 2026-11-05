<a id="townlight-windows-runtime-payload"></a>

# Townlight Windows Runtime Payload

This directory is the build-time payload root for the Windows Local 1.0 desktop
installer. Release packaging places portable runtime files here before the
Tauri MSI bundle is built:

- `postgres/` contains portable PostgreSQL 17 with pgvector.
- `python/` contains bundled CPython plus Townlight Core and city-core services.
- `ollama/` contains the native Ollama runtime.
- `station/` contains the paired Station media tools and corresponding notices.

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

For the Windows 1.7.2.1 installer-name correction, use the normal hosted
`prepare-runtime-payload` entry point with both profiles set to
`inspections-preview`. It invokes `prepare-accepted-runtime.ps1`, verifies the
signed 1.7.1.1 public MSI by SHA-256 and publisher, and preserves its complete
runtime. `bind-accepted-runtime.py` refuses changed component pins or suite
runtime source, refreshes all three preview provenance records and their lock
hashes, and records unchanged native bytes in `accepted-runtime-reuse.json`.
This preserves the accepted Station subtree, dependencies and signed Access
launcher that the legacy fresh-pip recipe does not reproduce. Future changes to
the component cohort require an explicit new runtime assembly decision.

The prepared receipt lists any newly generated native files that still require
signing. A prepared payload is only a build input. The new installer signature,
hash, corresponding source and installed acceptance are separate evidence.
