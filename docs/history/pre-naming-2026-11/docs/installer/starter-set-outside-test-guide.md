# Starter-Set Outside Test Guide

Status: outside-party test path for the Townlight Core + Townlight Records +
Townlight Meetings starter set.

Last verified: 2026-05-19.

This guide is for outside testers who want to install, verify, repair, and
remove the current starter set on Linux or Windows. It is not a procurement or
production-readiness claim. Townlight is still in recovery/productization, but
this path is the maintained installable package for real-world testing.

## Supported Test Targets

| Platform | Current evidence | Notes |
|---|---|---|
| Linux | Full package lifecycle proof | Ubuntu LTS or a compatible Docker Engine host is the primary runtime target. |
| Windows 10/11 | Full package lifecycle proof | Uses Docker Desktop with WSL 2 and the same containerized Linux services. Windows SmartScreen or Unknown Publisher warnings are expected. |
| macOS | Archive/readiness proof only | macOS archives are built, but lifecycle testing is intentionally on hold until a Darwin/macOS Docker Desktop host is used. |

## Before Running

Install or enable these first:

- Docker Engine on Linux, or Docker Desktop with WSL 2 on Windows.
- Enough free RAM and disk for local containers. The starter-set package should
  be tested before any city use on the exact machine class that will run it.
- Optional Ollama/model setup if the tester wants local LLM behavior beyond
  basic service health.

Download the release archive from the official Townlight release source,
`installer-clerk-core-v0.1.0` on this repo's Releases page, then verify
the SHA256 checksum from the published `SHA256SUMS.txt` before running any
launcher.

## Unsigned Windows Warning

The public Townlight beta installer is intentionally unsigned because this is a
small free open-source project. On Windows, SmartScreen or Unknown Publisher warnings are normal even for a legitimate archive.

Only bypass the warning after both checks pass:

1. The SHA256 checksum matches the published checksum.
2. The archive came from the official Townlight release source.

After that, use **More info** and **Run anyway** when Windows prompts. This is
the expected trust path for the public beta.

## Windows Commands

From the extracted `CivicSuite-clerk-core-windows` directory:

```powershell
.\start-civicsuite-installer.ps1 -Readiness
.\start-civicsuite-installer.ps1 -Plan
.\start-civicsuite-installer.ps1 -Install
.\start-civicsuite-installer.ps1 -Verify
.\start-civicsuite-installer.ps1 -Repair
.\start-civicsuite-installer.ps1 -Backup
.\start-civicsuite-installer.ps1 -Restore
.\start-civicsuite-installer.ps1 -Uninstall
```

Module selection examples:

```powershell
.\start-civicsuite-installer.ps1 -Plan -Module civicrecords-ai
.\start-civicsuite-installer.ps1 -Install -Module civicrecords-ai -Module civicclerk
.\start-civicsuite-installer.ps1 -Verify -Module civicrecords-ai -Module civicclerk
```

Mutating workflow proof:

```powershell
.\start-civicsuite-installer.ps1 -Install -StaffMode bearer -WorkflowProof
.\start-civicsuite-installer.ps1 -Verify -StaffMode bearer -WorkflowProof
```

## Linux Commands

From the extracted `CivicSuite-clerk-core-linux` directory:

```bash
bash ./start-civicsuite-installer.sh readiness
bash ./start-civicsuite-installer.sh plan
bash ./start-civicsuite-installer.sh install
bash ./start-civicsuite-installer.sh verify
bash ./start-civicsuite-installer.sh repair
bash ./start-civicsuite-installer.sh backup
bash ./start-civicsuite-installer.sh restore
bash ./start-civicsuite-installer.sh uninstall
```

Module selection examples:

```bash
bash ./start-civicsuite-installer.sh plan --module civicrecords-ai
bash ./start-civicsuite-installer.sh install --module civicrecords-ai --module civicclerk
bash ./start-civicsuite-installer.sh verify --module civicrecords-ai --module civicclerk
```

Mutating workflow proof:

```bash
bash ./start-civicsuite-installer.sh install --staff-mode bearer --workflow-proof
bash ./start-civicsuite-installer.sh verify --staff-mode bearer --workflow-proof
```

## Expected Proof

The default `clerk-core` profile installs Townlight Core first and then starts
Townlight Records and Townlight Meetings. A passing verify run must prove:

- Townlight Records API health returns `status=ok` and `version=1.7.3`.
- Townlight Records web responds.
- Townlight Meetings API health returns `status=ok`, `version=1.0.4`, and
  `civiccore=1.2.0`.
- Townlight Meetings web responds.
- Townlight Meetings staff auth is protected by default and anonymous staff writes are
  denied.
- Optional workflow proof creates and fetches a real Townlight Records records
  request, runs search, submits review, drafts a staff-reviewable response, and
  marks the request ready for release.
- Optional workflow proof also runs Townlight Meetings agenda intake/review/promotion,
  meeting creation, packet finalization, notice posting proof, motion/vote
  capture, citation-gated minutes draft creation, automatic-minutes-posting
  refusal, and public archive calendar/search visibility through
  bearer-protected staff auth.

The package cleanroom evidence report is written under
`installer/reports/<run-id>/installer-package-cleanroom.json` when using the
repo-level cleanroom runner.

Maintainers should use the extracted-package runner for release evidence:

```powershell
python scripts\run-installer-package-cleanroom.py --archive installer\dist\CivicSuite-clerk-core-windows-0.1.0.zip --platform windows --staff-mode bearer --workflow-proof
```

The workflow-proof report must show `workflow_proof_requested=true`,
`civicclerk_staff_mode=bearer`, and `evidence_classification=matching_host_lifecycle`
when it is used as matching Windows or Linux lifecycle proof.
For the current public-use starter baseline, run `26210542979` proves the Linux
matching-host extracted package lifecycle with workflow proof, backup, restore,
and uninstall. Run `26115385258` proves suite verifier truth, including
`[civicrecords-ai] PASS 1.6.1` and `[clerk-core-workflow-proof] PASS`.
For the 2026-05-21 final package evidence branch,
`local-windows-package-lifecycle-public-use-final-45eaccf` proves Windows
matching-host install, repair, verify, workflow proof, backup, restore, and
uninstall on the regenerated package.

## Current Limits

- macOS support is beta-level archive/readiness proof in this package. Full
  matching-host macOS lifecycle evidence still requires a Darwin/macOS Docker
  Desktop host run before any macOS lifecycle certification claim.
- Townlight Records and Townlight Meetings are co-installed and contract-verified against
  Townlight Core, but this guide does not claim live workflow-record exchange
  between the two modules yet.
- This is outside-party testable software, not a municipal procurement-ready
  1.0 certification.
