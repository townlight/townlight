<a id="civicsuite-continuity-and-succession"></a>

# Townlight Continuity And Succession

This document is the continuity gate for Townlight. It exists to make sure the suite can continue operating if the founding maintainer is unavailable.

`Phase 1` platform expansion begins only after the `Phase 0` continuity requirements described here are satisfied.

## Current Status

Status snapshot: **2026-04-29**

| Item | Status | Target |
|---|---|---|
| `SUCCESSION.md` on file | Complete | 2026-04-29 |
| Second GitHub org owner added | Complete (`scottconverse`, `APirateMonk`) | 2026-04-29 |
| Release and credential custody documented | Complete | 2026-04-29 |
| Recovery and handoff procedures documented | Complete | 2026-04-29 |
| `Phase 0` complete | Complete | 2026-04-29 |

## Scope

This document covers:

- GitHub org continuity
- release-signing and credential custody
- emergency access and handoff procedures
- release-critical repository ownership
- the minimum information a second maintainer needs to continue operations

This document does **not** replace repo-specific operational runbooks. It identifies the continuity requirements that must exist above them.

## Required Deliverables

`Phase 0` required all of the following:

1. A second GitHub org owner is active in `CivicSuite`.
2. Release-signing custody and package-publishing custody are documented.
3. Credential custody and emergency access expectations are documented.
4. Release-critical repos and their continuity roles are documented.
5. A second maintainer can continue releases and governance work without relying on unwritten knowledge.

## Release-Critical Repositories And Continuity Roles

These repos are continuity-critical:

- `civicsuite`
- `civiccore`
- `civicrecords-ai`
- any module repo currently in the shipping or productizing tiers

Current named continuity roles:

| Repo group | Primary maintainer | Continuity backup | Notes |
|---|---|---|---|
| `civicsuite` | `scottconverse` | `APirateMonk` | Umbrella governance, roadmap, compatibility, continuity truth source |
| `civiccore` | `scottconverse` | `APirateMonk` | Shared platform release path is GitHub-tag driven |
| `civicrecords-ai` | `scottconverse` | `APirateMonk` | Shipping flagship release path is GitHub-tag driven |
| shipping/productizing module repos | `scottconverse` | `APirateMonk` | Current continuity backup until repo-specific maintainer lines expand |

Each release-critical repo must always have:

- at least one documented primary maintainer
- at least one documented continuity backup
- a known release procedure
- a known rollback path
- a known documentation truth source

## Custody Expectations

The continuity model is shared custody, not single-person memory.

### GitHub Org Custody

- `CivicSuite` must have at least two org owners
- admin access must not depend on a single personal account
- branch-protection changes, repo transfers, and release-admin actions must be recoverable by a second owner

### Release Custody

- GitHub release permissions for shipping and productizing repos are available to both current org owners
- `civiccore` currently publishes from a tag-driven GitHub Actions workflow that runs `scripts/verify-release.sh`, builds wheel/sdist/checksums, and creates a GitHub release using the repository `GITHUB_TOKEN`
- `civiccore` does **not** currently require a separate PyPI secret or code-signing secret to ship
- `civicrecords-ai` currently publishes from a tag-driven GitHub Actions workflow that builds the unsigned Windows installer, writes a checksum, creates a draft GitHub release, uploads artifacts, and publishes the release using the repository `GITHUB_TOKEN`
- `civicrecords-ai` intentionally remains unsigned today, so there is no code-signing certificate custody requirement in the current release path
- if PyPI publication, signed installers, or other external release credentials are introduced later, this document must be updated before that release mode becomes canonical

### Credential Custody

- the current release path depends on GitHub org-owner access plus standard local maintainer auth; it does not depend on repo-stored secrets
- account recovery for each org owner remains outside the repo and must be maintained through the owner’s GitHub account recovery settings
- no continuity procedure requires writing secrets into repo docs
- if any future release path adds external secrets, custody location and recovery expectations must be documented without putting the secret itself in the repository

## Current Release And Recovery Path

The second maintainer can currently recover the suite release path without any hidden build server:

1. Read the umbrella roadmap, compatibility matrix, and current continuity status.
2. Work from the relevant repo on `main`.
3. Run the repo’s verification gate before release:
   - `civicsuite`: `bash scripts/verify-docs.sh`
   - `civiccore`: `bash scripts/verify-release.sh`
   - `civicrecords-ai`: `bash scripts/verify-release.sh`
4. Create and push the release tag from a repo owner account.
5. Let the tag-driven GitHub Actions workflow build and publish artifacts.
6. Verify the GitHub release artifacts and checksums before declaring the release complete.

For `civicrecords-ai`, the recovery maintainer must also remember that the Windows installer is intentionally unsigned in the current posture. A future signing program is roadmap work, not a current release dependency.

## Minimum Recovery Packet

The second maintainer must be able to locate, without asking:

- the canonical roadmap
- the compatibility matrix
- the release procedure for `civiccore`
- the release procedure for `civicrecords-ai`
- the current shipping/productizing/foundation taxonomy
- the current continuity status
- the repo containing each active suite runbook

Current pointers:

- roadmap: [`docs/roadmap/index.md`](docs/roadmap/index.md)
- compatibility matrix: [`docs/compatibility/index.md`](docs/compatibility/index.md)
- governance index: [`docs/governance/index.md`](docs/governance/index.md)
- charter: [`CHARTER.md`](CHARTER.md)

## Exit Criteria

`Phase 0` is complete as of 2026-04-29 because:

- a second GitHub org owner has been added
- current release and credential custody are documented
- continuity documentation is current
- the current suite release path no longer depends on one person’s implicit operational knowledge

Continuity remains a living requirement, but it is no longer blocking `Phase 1` platform work in the current suite state.
