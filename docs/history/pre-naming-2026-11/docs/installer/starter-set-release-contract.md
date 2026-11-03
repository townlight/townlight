# Starter-Set Release Contract

Status: maintained installer contract for the Townlight Core + Townlight Records +
Townlight Meetings starter set.

Last verified: 2026-05-21.

## Scope

The starter set is the first operator-facing Townlight install target:

- Townlight Core installs first and remains non-selectable because every module
  depends on it.
- Townlight Records and Townlight Meetings are selectable modules in the custom profile
  and are both included by default in the `clerk-core` profile.
- Windows and Linux package lifecycle proof are required for the Clerk-Core public-use gate.
- macOS archives and wrapper manifests are generated and supported at beta
  archive/readiness level; full matching-host macOS lifecycle evidence still
  requires a Darwin/macOS Docker Desktop host before any macOS lifecycle certification claim.

Outside-party testing instructions live in
[`starter-set-outside-test-guide.md`](starter-set-outside-test-guide.md).

This contract does not promote the rest of the suite as product-ready. Later
modules must earn their own installer proof before they become part of an
operator default profile.

## Version Pair

The maintained starter-set pair for this slice is:

| Component | Release | Contract |
|---|---:|---|
| Townlight Core | 1.2.0 current platform release | Installs first in the umbrella installer and provides the shared platform baseline. |
| Townlight Records | 1.7.3 | Selectable records module; runtime line consumes Townlight Core 1.2.0 shared ingestion. |
| Townlight Meetings | 1.0.4 | Selectable meetings module; `/health` must report `version=1.0.4` and `civiccore=1.2.0`. |

The Townlight Core 1.2.0 release is the current shared-platform release for new
suite planning. Townlight Records v1.7.3 and Townlight Meetings v1.0.4 consume the
published Townlight Core v1.2.0 wheel, so their runtime proof must verify the module
health surfaces instead of assuming the umbrella platform version is the same as
the module dependency pin.

## Installer Contract

The umbrella installer contract is enforced by
`python scripts/verify-installer-plan.py`:

- `clerk-core` resolves to `civiccore`, `civicrecords-ai`, `civicclerk` in that
  order.
- `custom --module civicrecords-ai --module civicclerk` still resolves
  Townlight Core first.
- Generated Linux, Windows, and macOS archives exclude local state such as
  virtual environments, test reports, `.agent-runs`, `.env`, build outputs, and
  module-local generated artifacts.
- Generated package README and launcher files warn that the public installer is
  intentionally unsigned, explain expected OS warnings, and require SHA256 plus
  official-source verification before bypassing those warnings.

## Runtime Contract

The maintained runtime proof path is
`python scripts/run-clerk-core-installer.py install`, followed by `verify`,
`repair`, `backup`, `restore`, and `uninstall` on the same host class.

The `verify` mode must check:

- Townlight Records API health.
- Townlight Records web health.
- Townlight Meetings API health.
- Townlight Meetings web health.
- Townlight Meetings protected-default staff auth, including denied anonymous staff
  writes.
- Starter-set Townlight Core contract: Townlight Records reports v1.7.3, and
  Townlight Meetings reports v1.0.4 with Townlight Core v1.2.0.

The maintained mutating workflow proof path is:

```powershell
python scripts\run-clerk-core-installer.py install --staff-mode bearer --workflow-proof
python scripts\run-clerk-core-installer.py verify --staff-mode bearer --workflow-proof
python scripts\run-clerk-core-installer.py backup
python scripts\run-clerk-core-installer.py restore
python scripts\run-clerk-core-installer.py uninstall
```

That proof must create and fetch a real Townlight Records records request through
first-admin JWT auth, exercise the search surface, submit the request for review, draft
a response letter that remains staff-reviewable, and mark the request ready for
release. It must also prove the Townlight Meetings agenda intake/review/promotion,
meeting, packet assembly/finalization, notice checklist/posting proof,
motion/vote capture, citation-gated minutes draft, automatic-minutes-posting
guardrail, and public archive calendar/search path through bearer-protected
staff auth. Reports must not persist the Townlight Records admin password or bearer
token.

Proof phrase lock: bearer-protected staff auth. Reports must not persist the Townlight Records admin password or bearer token.

Backup proof must create PostgreSQL custom dump files for each selected starter
module and a `backup-manifest.json` with SHA256 digests. Restore proof must
validate those dumps by restoring each one into a temporary restore-probe
database and deleting that probe database after the check completes.

## Package Cleanroom Contract

The maintained outside-test proof must also run from the extracted
distributable archive, not only from the source tree. The package cleanroom
runner is the repo-level command for that proof:

```powershell
python scripts\run-installer-package-cleanroom.py --archive installer\dist\CivicSuite-clerk-core-windows-0.1.0.zip --platform windows --staff-mode bearer --workflow-proof
```

For Linux, use the matching Linux archive on a Linux Docker host:

```bash
python scripts/run-installer-package-cleanroom.py --archive installer/dist/CivicSuite-clerk-core-linux-0.1.0.tar.gz --platform linux --staff-mode bearer --workflow-proof
```

A package workflow-proof report must record
`evidence_classification=matching_host_lifecycle`, `workflow_proof_requested=true`,
and `civicclerk_staff_mode=bearer` when it is used as Linux or Windows lifecycle
evidence. Main installer-cleanroom run `26115385070` proved the Linux
matching-host package lifecycle after PR #153, including workflow proof,
backup, restore, and uninstall from the extracted archive. Windows archive
readiness now records cleanup-lock evidence without converting a passed
readiness/plan run into a failed lifecycle claim. Windows package workflow proof has been run on a Windows 11 host with
Docker Desktop and WSL 2. macOS remains archive/readiness only until a
Darwin/macOS Docker Desktop host runs the same lifecycle class.

This is a release contract for the starter-set installer and module runtime
pairing. It is not yet a claim that Townlight Records and Townlight Meetings exchange workflow records with each other through a live cross-module business API.
That workflow-level handoff remains a follow-on productization slice after the
installer can reliably install, verify, repair, and remove the starter set on
Linux and Windows.
