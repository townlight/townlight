# Releasing the Townlight Records Windows MSI

## Connected Records–Meetings candidate: 1.2.0-beta.1

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
of the beta.3-to-connected upgrade. Final signing, exact-byte acceptance and
publication remain pending. Optional native AI minutes/transcription are not
claimed. Shared Rust handlers with remaining Code/city-core callers are retained.

Use the existing main-only fail-closed signing and draft-attachment workflows
below. Both EXE and MSI must verify as `CN=Scott Converse`, with timestamps and
matching source/run/hash receipts. Do not rebuild after accepting the final
signed bytes or move a published tag. After successful acceptance, the owner has
already authorized publication; no additional approval prompt is required.

## Active update: 1.1.0-beta.3

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
