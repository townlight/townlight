# Source and build identity â€” Townlight Beta 1

Use the signed suite MSI for the verified beta installation. Independent
development installs and routine unsigned CI builds are different artifacts.

The exact owned-source ZIP preserves the source shipped in the MSI, its installed
package metadata, native/browser sources and locks, pinned media engine, notices,
runtime payload lock and the correction/build scripts. Its SHA-256 is recorded in
[ACCEPTANCE.md](ACCEPTANCE.md). Do not substitute a newer branch or rebuild when
verifying that signed installer.

The publication repositories integrate that accepted source with the current
audited documentation and necessary source-only check corrections. Their
`release/BETA-1-PROVENANCE.json` files map original archive paths and hashes to
repository paths and publication hashes. The release tag is an integration and
distribution identity; it is not claimed to be the original signing/build commit.
Original signed bytes and source-archive bytes remain unchanged.

## Source locations

| Runtime | Repository/source |
|---|---|
| Shared Python foundation | `townlight/core`, `civiccore/` |
| Records | `townlight/sunshine`, `backend/app/` |
| Meetings / Code / Zoning | `townlight/meetings`, `townlight/ordinances`, `townlight/zone` |
| Planning / Permitting / Inspections | `townlight/plan`, `townlight/permit`, `townlight/inspect` |
| Access / Notice support | `townlight/access`, `townlight/notice` |
| Station service/operator/media | `townlight/station`, `beta-1/`; keep standalone CivicCast separate |
| Native desktop and Python bridge | `townlight/townlight`, `desktop/` and `desktop/runtime/python-services/` |
| Inspection voice dependency | `townlight/inspect`, `inspection-transcriber/src/textflowkit/` |

The original ZIP groups these under `installed-owned-source/`, `products/`,
`desktop/`, `station/` and `pinned-civiccast-media-source/`. Installed source takes
precedence when comparing the shipped runtime with package-tree copies. Station's
media-lock checks original bytes, including line endings; its repository uses a
narrow Git attributes rule to retain all 730 pinned media-file hashes.

## Build workflow

1. Use an isolated Windows x64 development workspace with the existing MSVC/Rust,
   Node/npm, Python/Hatchling and WiX toolchains required by the checked-in project
   locks/scripts. Preserve component versions; the suite label is Townlight Beta 1.
2. Obtain the exact source companion and the release's pinned repository refs.
   Read `BUILD.md` inside the source ZIP and retain its original tree. The archived
   correction scripts describe the original task-relative layout; their local
   path constants require rebasing to the isolated development workspace. The
   repository provenance maps that original layout to the canonical source trees.
3. Build the affected Python packages using their `pyproject.toml` and the archive's
   `correction-build/build_packages.py` sequence. The accepted runtime pairs Core
   1.3.0.dev1 and Records 1.8.0.dev1. Preserve explicit package staging order and
   the console-helper set in `stage_packages.py`.
4. Provision third-party runtime executables and model assets from the recorded
   runtime source manifests and verify `runtime-payload-lock.json`. Those vendor
   executables, model files and signing credentials are not owned source files.
   Retain vendor license/model notices. Do not copy an installed city profile.
5. Use `desktop/package.json`, its npm lock, `desktop/src-tauri/Cargo.lock`, Tauri
   configuration and existing Windows package scripts/workflows for native/browser
   builds and installer layout. The archived short-path WiX link script records
   the final candidate's packaging path correction and retained validation.
6. Run each repository's applicable existing checks and the installed synthetic
   acceptance before treating a newly built installer as a replacement candidate.
   A fresh source build is unsigned unless separately signed; it is not the exact
   accepted MSI and cannot inherit its signature or acceptance identity.

Signing is external and timestamped, so signed bytes are not claimed to be
reproducible compiler output. Never include credentials, real profiles or staff
session material in a source archive. Current owned code/docs are AGPL-3.0-only;
historical grants and third-party terms remain attached to their material.

## Source integration CI

The coordinated Beta 1 branch and main select the existing full
`inspections-preview` composition. `config/inspections-preview-sources.json`
pins the accepted sibling source cohort; its contract retains the candidate
component versions. These routine Windows CI builds remain unsigned and use the
separate Inspections candidate installer identity. They are regression artifacts,
not replacements for the published, previously signed Townlight MSI. Historical
Planning/Permitting profile contracts remain in the repository for their own tags.

The Inspections composition builds `inspection-transcriber` from the same pinned
Inspections checkout. Its unchanged signed Needle engine, Whistle model, original
notices and reuse manifest are supplied in
`Townlight-Beta-1-Inspection-Voice-Assets.zip`, pinned by SHA-256 in
`desktop/runtime/windows-runtime-sources.json`. This is an existing vendor build
input from the accepted candidate. The preparation script verifies the archive
and both executable/model hashes. CI uses its repository's read-only token to
retrieve this input while the coordinated release is draft; after publication a
normal source build uses the public release URL. It does not sign or rebuild the
accepted installer.
