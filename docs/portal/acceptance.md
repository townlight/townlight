# Townlight Beta 1 portal acceptance

Local synthetic acceptance, 2 November 2026. This records the repository portal integration and candidate native wheel; it does not describe a public deployment or a rebuilt Windows installer.

The real-service run used isolated PostgreSQL databases, the actual Meetings and Records implementations, the accepted Python Station worker with its separate CivicCast-derived media source, and the Wagtail portal. A newly built `civicsuite-runtime` wheel was installed into an isolated package directory and imported by the native HTTP service. No city credentials, installed applications, real vendor tenants, YouTube uploads or broadcasts were used.

Verified outcomes:

- Actual Meetings HTTP creation of a meeting, agenda, packet and public archive, followed by actual Station processing of synthetic media and hash-verified canonical output.
- Actual Records HTTP handoff, reviewed release copy, exemption decision, current response approval, verified response/package exports and fulfillment.
- Authorized release discovery and explicit publication. Missing proof, insufficient role, missing approval, unfulfilled request, closed archive and incorrect selected hash were refused.
- Public pages and exported bytes contain the approved public archive title and release copy, excluding the internal-title marker, requester data, local paths and session proof. The independent-public-title regression uses the actual archive repository API because the HTTP wrapper does not expose a separate title field.
- Repeated synchronization updates one identity; unavailable native services preserve the previous public projection. An explicit withdrawal makes both meeting and release URLs return 404.
- Headless Chromium decoded and played the approved MP4, performed Wagtail superuser release lookup with approval initially unchecked, and submitted explicit publication approval.
- The production Waitress entry enforced HTTPS redirection and served approved byte ranges behind the configured loopback TLS proxy.
- A separate copied synthetic rendering fixture reproduced and corrected mobile video/packet overflow. At a 390-pixel viewport the document width is 390 pixels and the video is 358 pixels wide; desktop video remains 640 pixels wide. This rendering check did not alter the workflow receipts.
- Portable public export retained the same approved release hash. All owned test services terminated and temporary proof/browser credential input files were removed.

The portal's 16 Django tests passed, including synthetic PrimeGov import/update/cancellation/withdrawal, source privacy, CMS editorial approval, time zones, native bundle integrity, private streamed files, permissions, explicit selection, production settings and unconsumed-response cleanup. No missing Django migration was found. The existing 42 suite-state/module/Windows workflow contract tests passed, along with documentation truth, voice, secret-pattern, deployment-profile, installer-plan, stage and public-status checks. The installer-plan check ran in a shorter isolated workspace because Windows rejected deeply nested generated paths in the main worktree; its generator side effects were excluded from this candidate.

Independent source review found an internal-title disclosure and verified its correction to the public archive title. It also reviewed the final release lookup boundary. Parent review checked actual code, package contents and executed receipts rather than accepting worker completion claims.

Evidence identities and executed assertions are retained in [the synthetic acceptance receipt](receipts/synthetic-acceptance.json). The portable [verification instructions](verification.md) describe reproducing the run with explicit local inputs. Remote PR CI has not run for this unpublished branch; normal required GitHub checks remain part of a later authorized publication.

Acceptance limits remain explicit: media was short and synthetic; the existing Records receipt limits both original and release copy to 2,147,483,647 bytes. The portal's larger transport bound does not remove that limit. Authorization uses an active native session, not a durable service token. Real PrimeGov access/migration, hosting commissioning and physical city equipment were not exercised or added to this scope. Superseded-copy and incomplete-recording guards were traced in source but not individually forced in the real-service run. The existing signed installer remains unchanged and does not contain the new bridge; the guide describes separate candidate runtime deployment.
