# Releasing the Townlight Records Windows MSI

## Current authorization: one signed connected Permitting beta

The first attempt, run40236604656, failed in a browser fixture before signing
and produced no signed candidate. Scott subsequently authorized diagnosing and
fixing that case, required CI, and completion of the signed release. Preserve
the failed run and its evidence; do not rerun it. After the corrected source
passes protected CI, use one new manual signing run from that merged source.

The record-selection browser case installs a complete desktop bridge before
navigation, serves `get_app_state`, and exercises startup again on reload before
any workflow writes. Its meeting/source selection assertions remain intact.
It no longer swaps an action-only bridge into preview startup or imposes a
separate five-second preview-readiness deadline. Focused diagnosis and trace
evidence are retained locally with the release checkpoint.

Scott authorized one signed Permitting candidate, tagging and publication on
October 25, 2026. The earlier private-only restriction is removed at his explicit
request. Select `permitting-preview` and `sign_for_publication=true` in one manual
`desktop-windows-msi.yml` run from protected merged main. Ordinary CI remains
unsigned; non-main publication signing is refused. Do not change default profiles,
module source pins, existing installers, historical releases or default downloads.

Use annotated tag
`townlight-records-meetings-code-zoning-planning-permitting-v1.6.0-beta.1` at the
exact successful signing source. Preserve the separate Permitting installer
identity and version 1.6.0-1/MSI 1.6.0.1. The installed product name remains
Townlight Permitting Candidate. Scope is staff intake, cited Code/Zoning,
server-derived review, private workpapers and an explicit separate Records copy;
official permit determinations, fees, inspections and writeback are outside scope.

Reuse connected installed acceptance from unsigned run40220651661 and all
unchanged functional evidence. Required CI validates the changed release path.
The one signing run must pass signed EXE/MSI verification, receipt/provenance and
dependent installed Windows lifecycle. Verify exact final signed installed
identity and the existing saved Records attachment without repeating writes.
Warn and wait before any restart. No Sandbox or broad suites.

The release workflow attaches only the exact successful main signing artifact
with valid timestamped EXE/MSI signatures, matching receipt, embedded provenance,
contract, three wheels and nine source pins. Read back draft assets and acceptance
notes before authorized publication as a prerelease with `make_latest=false`.
Verify anonymous delivery and historical/default-download preservation afterward.
No additional signing run or silent retry is authorized if the one candidate fails.

## Current authorization: Planning 1.5.1 fresh-install release

Scott confirmed there are no installed users and authorized push, protected merge,
tag and publication on October 24, 2026. Promote only the existing signed candidate
40116067286, source `7ccfea24cd1da385faedc75544fe32f957b94083`, to annotated tag
`townlight-records-meetings-code-zoning-planning-v1.5.1`. No rebuild, new signing,
local tests, Sandbox, upgrade environment or host changes are part of delivery.

The original frozen beta build contract and source pins are unchanged. The
separate `config/planning-staff-release.json` allows only this exact accepted
source/run/artifact/hash under the new public release classification. After
required CI and protected merge, dispatch the corrected attachment workflow from
that main commit with the stable tag as input; do not dispatch the build/signing
workflow. If the old tag-source workflow starts, cancel only that owned run.
Retain every original verification and immutable-release guard. Read back the
draft's exact original assets plus checksums/acceptance before publication;
publish non-prerelease with `make_latest=false`, then verify public delivery.

Historical 1.4/1.5.0 upgrades remain unverified and unsupported by this fresh-install
release. Preserve all original installers, tags, releases, receipts and existing
default download destinations. See [release scope and evidence](docs/installer/planning-1.5.1-fresh-install-release.md).
Earlier preparation statements below are historical and do not override this authorization.

## Historical preparation: opt-in staff Planning beta 1.5.0-beta.1

Only release-preparation steps 1–3 are authorized. The separate beta build
contract uses Planning 0.3.0, Records 1.7.4 and Core 1.2.1 with the existing
Planning preview selection and unchanged interface. Signing, tags, draft release
creation, publication and public download changes remain unauthorized. Historical
authorizations below apply to their named releases only. Signed 1.4 remains the
public download. See [staff beta preparation](docs/installer/planning-staff-beta-preparation.md)
for the frozen identity, provenance, required CI and concrete upgrade/Repair/recovery
procedure. Do not use the historical default signing command for Planning: a later
explicitly authorized manual main run must select `planning-staff-beta`.


## Connected Records–Meetings–Code–Zoning: 1.4.0-beta.1

Scott authorized push, merge after required checks, existing Azure signing,
final exact signed fresh/upgrade/recovery verification, and publication only on
passing acceptance on October 21, 2026. No further product scope is authorized.

Use tag `townlight-records-meetings-code-zoning-v1.4.0-beta.1`, desktop version
`1.4.0-1`, MSI ProductVersion `1.4.0.1`. Preserve application/upgrade identity.
The payload is `zoning-beta`; Records remains the default and existing saved
selections are not changed. Release source pins are recorded in the canonical
suite state and both desktop CI jobs. Do not reprovision Azure or change signer.

The existing main-only workflow signs the EXE before MSI bundling and signs the
MSI afterward, verifying the embedded EXE against the signing receipt. Use
`--no-binary-patching` to preserve the signature. The tag/draft workflow attaches
that exact successful main signing run, never an unsigned PR artifact.

Reuse applicable Z4 evidence but verify the final signed bytes installed fresh
and over populated signed 1.3, with connected sources and recovery. Stop workflow
consumers and PostgreSQL before Repair refreshes the changed runtime; preserve
data. This is not an unattended upgrade. See
[Zoning acceptance](docs/installer/townlight-zoning-beta1-acceptance.md).

The published 1.3 release remains the public download until this sequence passes.

## Connected Records–Meetings–Code: 1.3.0-beta.1

Scott authorized push, merge after required checks, signing, final installed and
upgrade verification, then publication only on passing acceptance, October 20,
2026. No further product scope is authorized.

Use tag `townlight-records-meetings-code-v1.3.0-beta.1`, desktop version
`1.3.0-1`, MSI ProductVersion `1.3.0.1`. Preserve application identity and
upgrade code. Build and real-runtime CI prepare `city-core` from exact merged
Records, Meetings and Code pins. Operators explicitly choose city-core; the
Records-only default and existing saved selections remain unchanged.

Use the existing main-only signing and draft-attachment procedures below,
substituting the new tag. Verify inner EXE and MSI signatures and hashes and
the exact final installed fresh/upgrade behavior. Accepted pre-retirement C4
evidence supports unchanged behavior but is not proof of new signed bytes.
Publication is already authorized if these gates pass. Do not reprovision Azure,
overwrite predecessor releases or introduce new approval policy.

Evidence: [connected Code acceptance](docs/installer/townlight-records-meetings-code-beta1-acceptance.md).

Final signed source is `0c0e098dd3db8bb3f0b55af8f3095bfa3bd3520c`, signing
run 39520756994. Exact signed fresh and populated signed 1.2 upgrade acceptance
passed on October 20, 2026. Documentation-only release follow-ups do not change
the tag target, installer identity, signed bytes or accepted runtime evidence.

## Historical connected Records–Meetings release: 1.2.0-beta.1

Scott approved the connected release sequence on October 19, 2026: push,
merge after required checks, sign, verify the final installer and the supported
Records beta.3 upgrade, then publish only if acceptance passes. This is not
authorization to begin Code or change Azure credentials.

Use tag `townlight-records-meetings-v1.2.0-beta.1` and synchronized desktop
version `1.2.0-1` (MSI ProductVersion `1.2.0.1`). Preserve the existing upgrade
code and application/data identities. Both build and real-runtime CI prepare
the `meetings-beta` payload from exact Records and Meetings source commits.
The default Records setup remains available; operators choose **Townlight
Records + Meetings** explicitly. The profile includes Core, Records, Meetings,
Notice and Access, not Code.

The earlier local unsigned M4 candidate passed mapped installed behavior,
privacy, restart with operator service start, backup/restore, repair and ordinary
uninstall retention. It is supporting evidence, not a signed release or proof
of the beta.3-to-connected upgrade. Final signing and exact-byte fresh workflow,
populated beta.3 upgrade, recovery and retained-data uninstall acceptance passed
on October 19, 2026. See the [acceptance record](docs/installer/townlight-records-meetings-beta1-acceptance.md)
for source, hashes, signing run and public-delivery verification. Optional native
AI minutes/transcription are not claimed. Shared Rust handlers with remaining
Code/city-core callers are retained.

Use the existing main-only fail-closed signing and draft-attachment workflows
below. Both EXE and MSI must verify as `CN=Scott Converse`, with timestamps and
matching source/run/hash receipts. Do not rebuild after accepting the final
signed bytes or move a published tag. After successful acceptance, the owner has
already authorized publication; no additional approval prompt is required.

## Historical Records update: 1.1.0-beta.3

Scott approved push, merge, signing, exact signed-installer verification and
publication conditional on passing acceptance on October 18, 2026. This
approval covers Records only. Do not begin Meetings or alter Azure credentials.

The new tag is `townlight-records-v1.1.0-beta.3`; synchronized desktop manifests
use `1.1.0-3` (WiX ProductVersion `1.1.0.3`). Use these values in the historical
command examples below. Do not move or overwrite any beta.2 tags/assets.
Publication still requires the successful main signing run, independently
verified inner EXE and MSI, and acceptance of those exact bytes. The owner has
authorized publication if those gates pass; another approval prompt is not
required. Prior unsigned acceptance is supporting evidence, not permission to
publish an unsigned file.

This update makes Python/PostgreSQL the active Records authority following
explicit migration, with no legacy JSON fallback. Upgrade instructions and
recovery boundaries are in USER-MANUAL.md. Exact signed acceptance passed on
October 19, 2026 at 02:31:39 MDT (08:31:39 UTC); see
[the beta.3 acceptance record](docs/installer/townlight-records-beta3-acceptance.md).
The signed source is `7129b079a9c77b3f21b384c6e5beeb9fc4f45979`, from successful
main signing run `39211809039`. Documentation-only follow-up commits do not
change the release tag or accepted MSI/EXE bytes. Preserve all prior tags/assets.

## Historical beta.2 release and retained procedure

The rc.3 public beta was published with owner approval on 2026-10-08 at
06:47:25 MDT (12:47:25 UTC), using the exact signed, installed-tested bytes.
[Published release](https://github.com/townlight/townlight/releases/tag/townlight-records-v1.1.0-beta.2-rc.3).
The procedure below remains the fail-closed release path for a tag such as
`townlight-records-v1.1.0-beta.2`.

The first beta.2 draft failed clean-machine startup acceptance. Preserve its
tag and artifact evidence; do not move the tag or replace its bytes silently.
The rc.2 draft is dormant and preserved. Installed acceptance found that
replacing response text retained the previous response's approval. The narrow
correction requires fresh approval only when manual or AI response text changes;
failed generation and unrelated request edits preserve the existing approval.
The replacement candidate uses `townlight-records-v1.1.0-beta.2-rc.3` at
its exact signed source SHA. This candidate suffix does not change the
public beta version or the MSI-safe `1.1.0-2` mapping below. Substitute that
replacement tag in the tagging and draft-staging commands; publish only
after exact-byte installed acceptance and Scott's completed-package approval.

## Version contract

The public release version is `1.1.0-beta.2`, and the replacement annotated tag is
`townlight-records-v1.1.0-beta.2-rc.3`. Do not move the original or rc.2 tags.

Windows Installer cannot consume that textual prerelease directly. The
synchronized build manifests therefore use the MSI-safe prerelease
`1.1.0-2`, which Tauri maps to WiX ProductVersion `1.1.0.2`. The following
files must agree on `1.1.0-2`:

- `desktop/package.json` and `desktop/package-lock.json`
- `desktop/src-tauri/Cargo.toml` and the desktop entry in `Cargo.lock`
- `desktop/src-tauri/tauri.conf.json`

This numeric compatibility mapping does not change the public beta label. The
tag-to-artifact trust boundary is the exact commit SHA, signed run, artifact
hash, and Authenticode evidence—not textual equality between the public tag
and WiX ProductVersion.

Public display strings use Townlight. Internal artifact names and stable
application identifiers may retain `civicsuite` as documented compatibility
identities.

## Candidate and publication gates

1. Land the exact Core and Sunshine changes that the candidate consumes.
2. Pin their accepted commits in the Townlight installer registry and workflow.
3. Open or update the Townlight release PR. PR CI must build the MSI, run the
   real embedded-runtime integration, install it, launch the installed
   executable, exercise first run, repair, backup/restore, and uninstall, and
   prove that the artifact is unsigned and non-publishable.
4. Review and merge only after all required PR checks are green. Development
   work may continue while human review happens, but the signed candidate must
   come from the final merged `main` SHA.
5. Dispatch the publication-signing lane on that exact `main` commit:

   ```powershell
   gh workflow run desktop-windows-msi.yml --repo townlight/townlight --ref main -f sign_for_publication=true
   ```

   This is the only lane that reads the Townlight organization Azure secrets.
   It builds the desktop EXE without bundling, hashes its unsigned bytes, signs
   and verifies it, then bundles that exact executable into the MSI using
   Tauri CLI 2.12.0 with `--no-binary-patching`. This flag is mandatory: the
   default bundler rewrites the EXE's bundle-type marker and would invalidate
   its signature. Hashes before and after bundling must match. The MSI
   is hashed before signing and independently verified afterward. It signs
   through Azure Artifact Signing with the fixed account/profile and
   must independently pass `signtool verify /pa /v` and
   `Get-AuthenticodeSignature`, require `CN=Scott Converse`, and require an
   RFC3161 timestamp.
6. Download that exact signed artifact and verify it independently. Record the
   unsigned and signed SHA-256 values, signer subject, certificate thumbprint,
   timestamp status, workflow run URL, and evidence-file cross-check. Check both
   MSI and installed executable against Townlight-signing-receipt.json. The
   pipeline also extracts the MSI and proves it contains the exact signed EXE.
7. Run the signed clean-machine beta journey: signature, install, launch,
   first-run setup, explicit demo-town load, complete request-to-release
   workflow, offline restart/use, repair, backup/restore, upgrade preservation
   where applicable, and uninstall with no unintended user-data leakage.
8. Create an annotated tag at the signed run's exact SHA:

   ```powershell
   git tag -a townlight-records-v1.1.0-beta.2-rc.3 <signed-run-head-sha> -m "Townlight Records 1.1.0-beta.2 rc.3"
   git push origin townlight-records-v1.1.0-beta.2-rc.3
   ```

9. `release-windows-msi.yml` accepts only a successful manual signing run on
   `main` whose head SHA matches the tag, then rechecks the signature, signer,
   timestamp, MSI hash, embedded EXE signature/hash, signing receipt source/run,
   and `PublicationAllowed=true` evidence before attaching
   the MSI, evidence, and signing receipt to a **draft prerelease**. The workflow must not make the draft
   public.
10. Scott reviews the evidence and release notes and decides whether to publish
    the draft as a prerelease. Never publish an unsigned artifact.

## Signing identity

- Endpoint: `https://wcus.codesigning.azure.net`
- Account: `scottconverse-signing`
- Certificate profile: `ScottConversePublic`
- Required signer subject: `CN=Scott Converse`

The Azure credentials already exist as Townlight organization secrets. Do not
print, copy, rotate, or reprovision them as part of a routine release.


### Inspections connected installed candidate

The explicit `inspections/connected-workflow` branch selects `inspections-preview`, desktop 1.7.0-1 / MSI 1.7.0.1, using `config/inspections-msi-candidate.json` and ten exact source pins. Its separate Townlight Inspections Candidate product preserves accepted installations and default downloads. Ordinary PR CI produces an unsigned artifact. This task authorizes installed acceptance only; no signing, tag, merge or publication is requested.

Acceptance uses fictional inspector notes, staff photo observations/transcripts and original evidence; actual imported Code citations; durable revision/repeat-case history; explicit staff review; a private report/notice workpaper; and an exact separately edited Records copy attached explicitly to an existing Records request. Approval and release remain separate. No official enforcement, scheduling, image analysis, transcription or system-of-record writeback is asserted. Reuse the accepted six-product/recovery evidence and check only changed behavior plus required CI. Preserve the MSI, receipts and fictional data while removing owned regenerable copies after acceptance.
