# Townlight Windows 1.8.0.1 installed acceptance

- Signed Windows x64 MSI SHA-256 `3085817377cf813debe558d280278e2b9d11311388aa41eb184c9ba80cfbb35a`
- Application source `9a2027ab81af6b8a36b8f0fe426a27fcea1fd41c`
- Product registration **Townlight**, version **1.8.0.1**
- Corresponding source SHA-256 `f2aac21de5ccc0a541f3d089d6d5744cb7c752a5d388b4c96770884f8c65aae5`
- Azure Trusted Signing publisher **Scott Converse**. Authenticode and SignTool verified the timestamped MSI. [MSI signing run](https://github.com/townlight/townlight/actions/runs/42681693472) · [desktop signing run](https://github.com/townlight/townlight/actions/runs/42677667469)

The application and MSI were built on Windows from the exact source above and signed by the manual Azure workflow on GitHub, following the exact-artifact promotion used for Windows 1.7.1.1. Routine GitHub Windows PR builds verify the source and lifecycle separately. Their MSI bytes are distinct from this release asset.

## New evidence for this MSI

| Path | Observed result |
| --- | --- |
| Clean Windows Sandbox | Installed exact signed bytes and completed first run with the full **Townlight Inspections candidate** profile, including Records activation. |
| Boards & Commissions | Clerk created a board, occupied and vacant seats, terms and attendance. The linked Meetings record opened at the recorded meeting. |
| Procurement | City staff created an RFP outline, entered proposals, scores and exceptions. Administrator recorded an existing human award decision and made one draft contract, including on retry. |
| Contracts | Followed the link to and from Procurement. Retained a signed PDF, read and downloaded exact fixture bytes, found the renewal by owner and independently registered an agreement. |
| Access boundaries | Signed-out requests and disallowed clerk and city-staff actions were denied. Existing administrator, city-staff and clerk roles governed the workflows. |
| Restart | Reopened the app, started required local services through System Health as administrator, and matched the original board, meeting, solicitation, contract and retained PDF. |
| Upgrade from public 1.7.2.1 | Normal MSI upgrade retained the city profile, administrator, existing module settings, meeting and exact bytes of a synthetic saved file. The old Windows registration was replaced. On launch, the app refreshed per-user Python to the signed bundle hash `2830069A2C2136C21A0ACC9C488C599F72976579A8AB3E1F00B6E194C71032D7`, and the database, HTTP service and work queue became healthy without a manual Start or Repair. |
| Installed publisher and CLI | Verified the installed desktop and reused signed Access CLI. The installed CLI returned its documented help. |

The disposable Sandbox used the Microsoft-signed WebView2 already present in the guest, selected through a launch-process environment override. It did not install a separate WebView2 prerequisite. See the staff guide for the Windows prerequisites.

The earlier private 1.8.0.1 build hit a stale per-user Python runtime during upgrade. This release uses the replacement bytes identified above. Earlier released application evidence applies to its original build and can be consulted for unaffected workflows, including the separately configured Station service. The new installed checks above did not retest those complete workflows or upgrade paths from releases older than 1.7.2.1.

[Staff guide](https://townlight.github.io/manuals/windows-staff-workflows.html) · [Suite manual](https://townlight.github.io/manuals/suite.html) · [Public 1.7.2.1 baseline](https://github.com/townlight/townlight/releases/tag/townlight-windows-v1.7.2.1)
