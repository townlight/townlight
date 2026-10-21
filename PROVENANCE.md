# Townlight — Bundled Module Provenance

## Connected 1.4.0-beta.1 signed provenance

Accepted umbrella source: `5b22235f88a45da6e33fe7075654f724609a3921`. Tag: `townlight-records-meetings-code-zoning-v1.4.0-beta.1`.
Desktop **1.4.0-1**; Windows ProductVersion **1.4.0.1**.
[Signed acceptance](docs/installer/townlight-zoning-beta1-signed-acceptance.md) · [Published release](https://github.com/townlight/townlight/releases/tag/townlight-records-meetings-code-zoning-v1.4.0-beta.1).

MSI SHA-256: `04f393d230106236619ace0cb97fa9bb6163af06407e46b634c8ce12d1101717`

Installed EXE SHA-256: `95f04d661e83fb8c92fd6a29827de0bfd2a442477164a1256c98c74a08b0d147`

These source pins describe the signed installer, not subsequent documentation heads:

| Module | Repository | Accepted source commit |
|---|---|---|
| Townlight Core | townlight/core | `b4d0156bdc6883c1c3ef167abe0379f9ca32b258` |
| Townlight Records | townlight/sunshine | `45042345b5ca90ff837ae99275058b1ace733c9a` |
| Townlight Meetings | townlight/meetings | `3dd73d0619943beb8ce2965abe7a41dfe596e9be` |
| Townlight Code | townlight/ordinances | `868891bd990588a8337832915e4d91af39ea22cd` |
| Townlight Notice | townlight/notice | `79b8d07199ee77cd425b31c0e0a44f3a0832b810` |
| Townlight Access | townlight/access | `b9100edc80ca496d6061f1cdb3eb39a60ff5f31a` |
| Townlight Zoning | townlight/zone | `6ff3af1039e248c0dcd596f9abe2db7f58adaa7d` |

Standalone module versions remain separate from the connected desktop version.
No package version, dependency, source pin or signed artifact is changed by this
documentation cleanup. See the signed record for manual upgrade steps and limits.

## Historical connected 1.3.0-beta.1 provenance

Signed source `0c0e098dd3db8bb3f0b55af8f3095bfa3bd3520c`, annotated tag
`townlight-records-meetings-code-v1.3.0-beta.1`, MSI 1.3.0-1 / ProductVersion 1.3.0.1.
[Signing run 39520756994](https://github.com/townlight/townlight/actions/runs/39520756994)
and independent MSI/actual installed EXE verification passed. Exact signed fresh
connected workflows, populated signed Records–Meetings 1.2 upgrade, recovery,
offline operation and retained-data uninstall passed. See the
[acceptance record](docs/installer/townlight-records-meetings-code-beta1-acceptance.md).

| Module | Repository | Accepted source commit |
|---|---|---|
| Townlight Core | townlight/core | `b4d0156bdc6883c1c3ef167abe0379f9ca32b258` |
| Townlight Records | townlight/sunshine | `0218fa51bb0707e0ac63f58475308a77eb8e45ee` |
| Townlight Meetings | townlight/meetings | `3dd73d0619943beb8ce2965abe7a41dfe596e9be` |
| Townlight Code | townlight/ordinances | `868891bd990588a8337832915e4d91af39ea22cd` |
| Townlight Notice | townlight/notice | `79b8d07199ee77cd425b31c0e0a44f3a0832b810` |
| Townlight Access | townlight/access | `b9100edc80ca496d6061f1cdb3eb39a60ff5f31a` |

Explicit city-core uses one Python/PostgreSQL domain path. Rust retains native
integration, supervision and historical import/recovery, not the retired JSON
business writer. Optional native Meetings AI minutes/transcription is not
claimed. Later documentation commits do not replace signed source or bytes.

## Historical connected 1.2.0-beta.1 provenance

Signed source `8627868bd9d894be90b6ece1ce5ae4dc41e82f2f`, annotated tag
`townlight-records-meetings-v1.2.0-beta.1`, MSI `1.2.0-1` / ProductVersion
`1.2.0.1`. [Signing run39356961713](https://github.com/townlight/townlight/actions/runs/39356961713)
and exact signed fresh workflow, populated Records beta.3 upgrade, recovery and
retained-data uninstall passed. See the
[acceptance record](docs/installer/townlight-records-meetings-beta1-acceptance.md).

| Module | Repository | Accepted source commit |
|---|---|---|
| Townlight Core | townlight/core | `b4d0156bdc6883c1c3ef167abe0379f9ca32b258` |
| Townlight Records | townlight/sunshine | `2f0b7b755cade85673066fdd59ef3593a3052c83` |
| Townlight Meetings | townlight/meetings | `3dd73d0619943beb8ce2965abe7a41dfe596e9be` |
| Townlight Notice | townlight/notice | `79b8d07199ee77cd425b31c0e0a44f3a0832b810` |
| Townlight Access | townlight/access | `b9100edc80ca496d6061f1cdb3eb39a60ff5f31a` |

The connected profile is explicit; Records-only remains the default. Both
connected domain workflows use Python/PostgreSQL after activation. Rust retains
native integration, supervision and unmigrated compatibility handlers. Code and
optional native Meetings AI/transcription are not claimed. Documentation-only
follow-up commits do not replace the signed source or accepted bytes.

## Historical Records beta.3 public beta provenance

Signed source `7129b079a9c77b3f21b384c6e5beeb9fc4f45979`, tag
`townlight-records-v1.1.0-beta.3`, MSI version `1.1.0-3` / `1.1.0.3`.
[Signing run 39211809039](https://github.com/townlight/townlight/actions/runs/39211809039)
and exact signed fresh/upgrade acceptance passed. See the
[acceptance record](docs/installer/townlight-records-beta3-acceptance.md).

| Module | Repository | Accepted source commit |
|---|---|---|
| Townlight Core | townlight/core | `b4d0156bdc6883c1c3ef167abe0379f9ca32b258` |
| Townlight Records | townlight/sunshine | `62cee04abaec7f908f222e21c5a09b4b7977a575` |
| Townlight Notice | townlight/notice | `79b8d07199ee77cd425b31c0e0a44f3a0832b810` |
| Townlight Access | townlight/access | `b9100edc80ca496d6061f1cdb3eb39a60ff5f31a` |

Records is Python/PostgreSQL-authoritative after explicit activation. Rust keeps
native integration and unmigrated city-core compatibility. The signed bytes
remain tied to the source above; documentation-only commits do not replace them.

## Historical Records beta.2 rc.3 public beta provenance

Published 2026-10-08 at 06:47:25 MDT (12:47:25 UTC), with owner approval. It installs
Core, Records, Notice, and Access. The Records domain workflow still executes
in Rust until the blocking convergence gate passes.

The signed candidate source is `22ee2dea9a6038dc1ab1acf45bfe873ae59affe0`,
from merged [PR #256](https://github.com/townlight/townlight/pull/256). Signing run
[37736131162](https://github.com/townlight/townlight/actions/runs/37736131162)
passed and matches the independent signature, receipt, and installed acceptance
[record](docs/installer/townlight-records-beta2-rc3-acceptance.md). The owner approved publication of the unchanged signed bytes. The replacement tag is
`townlight-records-v1.1.0-beta.2-rc.3`; earlier drafts and tags are preserved.
Documentation-only follow-up commits do not change this signed source or bytes.

| Module | Repository | Accepted source commit |
|---|---|---|
| Townlight Core | townlight/core | `b4d0156bdc6883c1c3ef167abe0379f9ca32b258` |
| Townlight Records | townlight/sunshine | `ff99d8c7e692ba1f75e1781f517bb54f5c618b48` |
| Townlight Notice | townlight/notice | `79b8d07199ee77cd425b31c0e0a44f3a0832b810` |
| Townlight Access | townlight/access | `b9100edc80ca496d6061f1cdb3eb39a60ff5f31a` |

The Records pin advances by one post-transfer cleanup commit from beta.1,
correcting repository URLs and frontend dependency locks. The source commit
pins, rather than older module release tags, identify the bundled source.

The public version is `1.1.0-beta.2`; synchronized desktop manifests use
`1.1.0-2`. The publication lane signs the desktop EXE before MSI packaging and
then signs the MSI. Its receipt records source commit, run, unsigned/signed
hashes, and signing identities for both. Independent installed-artifact and
clean-machine acceptance passed on these exact bytes before approved publication.

## Historical CivicSuite v1.0.2 provenance

The material below describes the retired predecessor release, not the current
Records candidate.

**Last updated:** 2026-07-02
**Scope:** the CivicSuite Windows Local v1.0.2 city-core MSI artifact and the source it bundles.
**Companion to:** [STATUS.md](STATUS.md), [`installer/modules.json`](installer/modules.json) (`source_commit` pins).

## Why this file exists

The Windows Local MSI does not install the published GitHub *release* of each
module. It bundles module source **pinned by commit** (`source_commit` in
`installer/modules.json`). For some modules the bundled commit is **ahead of**
the latest published release tag. This file discloses exactly which commits the
MSI ships and how they relate to the published releases, so a city can verify
the trust path instead of assuming "release tag == what runs."

This is a deliberate, disclosed state for the released city-core public beta: the
bundled commits carry fixes that are not yet cut as formal release tags. It is
**not** a claim that the published release tags contain this code.

## City-core bundled commits vs published releases

The MSI (city-core profile: Townlight Core, Townlight Records, Townlight Meetings, Townlight Code,
Townlight Notice, Townlight Access) bundles these exact commits. The "Bundled vs published" column
states whether the pinned commit is ahead of, or equal to, the latest published
release tag for that repo.

| Module | Repo | Bundled `source_commit` | Published release tag | Bundled vs published |
|---|---|---|---|---|
| Townlight Core | CivicSuite/civiccore | `1a53f0680fffce34efeb939cbeb9915b6e208d6c` | **v1.2.0** | **AHEAD of v1.2.0 (undisclosed until this note)** |
| Townlight Records | CivicSuite/civicrecords-ai | `e2208827b660faa7d3fc1eab2271a8eae18526ee` | **v1.7.3** | **AHEAD of v1.7.3 (undisclosed until this note)** |
| Townlight Meetings | CivicSuite/civicclerk | `fa1874edfe977bfc36ddea2939df6464b5bc16be` | **v1.0.4** | **AHEAD of v1.0.4 (undisclosed until this note)** |
| Townlight Code | CivicSuite/civiccode | `a960bba0a2249d118b593dd61bee3a65a69a9d77` | **v1.0.8** | **AHEAD of v1.0.8 (undisclosed until this note)** |
| Townlight Notice | CivicSuite/civicnotice | `2bf0c9d7b764af84cd042657a972e84213a261d5` | [v0.2.0](https://github.com/townlight/notice/releases/tag/v0.2.0) (published 2026-07-03 from the 2026-06-19 tag) | **at v0.2.0** — the pin is exactly the commit the v0.2.0 tag points to |
| Townlight Access | CivicSuite/civicaccess | `7b24516fd89584d84c12394b9385eddd1e8c6897` | v0.4.0 | **at v0.4.0** — the pin is exactly the commit the v0.4.0 tag points to |

> Short commit forms used elsewhere: civicrecords-ai `e2208827`, civicclerk
> `fa1874ed`, civiccore `1a53f06`, civiccode `a960bba0`, civicnotice `2bf0c9d`,
> civicaccess `7b24516f`.

### Specifically disclosed (the four ahead-of-release modules)

- **Townlight Records** ships commit `e2208827`, which is **ahead of** the latest
  published release **v1.7.3**. The MSI's installed code is therefore newer than
  anything available under the `v1.7.3` release tag on GitHub.
- **Townlight Meetings** ships commit `fa1874ed`, which is **ahead of** the latest
  published release **v1.0.4**. The MSI's installed code is therefore newer than
  anything available under the `v1.0.4` release tag on GitHub.
- **Townlight Code** ships commit `a960bba0`, which is **ahead of** the latest
  published release **v1.0.8**. The MSI's installed code is therefore newer than
  anything available under the `v1.0.8` release tag on GitHub.
- **Townlight Core** ships commit `1a53f068`, which is **ahead of** the latest
  published release **v1.2.0**. The MSI's installed code is therefore newer than
  anything available under the `v1.2.0` release tag on GitHub.

These four cases were previously undisclosed. Until each repo cuts a release tag
at (or above) its bundled commit, the trust path for these modules is the
`source_commit` pin in `installer/modules.json` plus the MSI checksum/manifest
from the release evidence — **not** the `v1.7.3` / `v1.0.4` / `v1.0.8` /
`v1.2.0` release tags.

## How to verify what the MSI actually ships

1. Read `installer/modules.json` and record each module's `source_commit`.
2. Confirm those commits exist in the corresponding `CivicSuite/<repo>` history.
3. Verify the MSI checksum / release manifest from the active PR/release evidence
   (see STATUS.md, "Active City-Core Target (GA candidate / open public beta)").
4. For Townlight Records, Townlight Meetings, Townlight Code, and Townlight Core, do **not** rely
   on the published release tag as the source of truth — use the pinned commit
   above.

## Restoring a clean trust path (follow-up, not blocking this disclosure)

The durable fix is to cut release tags at or above the bundled commits (e.g. a
`v1.7.4` for civicrecords-ai, a `v1.0.5` for civicclerk, a `v1.0.9` for
civiccode, and a `v1.2.1` for civiccore that include `e2208827` / `fa1874ed` /
`a960bba0` / `1a53f068`), then re-pin `installer/modules.json` to those tagged
commits so "what ships" once again equals "a published release." Until then,
this file is the authoritative disclosure of the gap.
