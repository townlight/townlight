# Releasing the Townlight Records Windows MSI

This is the fail-closed release path for a tag such as
`townlight-records-v1.1.0-beta.2`.

## Version contract

The public release version is `1.1.0-beta.2`, and the annotated tag is
`townlight-records-v1.1.0-beta.2`.

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
   and verifies it, then bundles that exact executable into the MSI. The MSI
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
   git tag -a townlight-records-v1.1.0-beta.2 -m "Townlight Records 1.1.0-beta.2"
   git push origin townlight-records-v1.1.0-beta.2
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
