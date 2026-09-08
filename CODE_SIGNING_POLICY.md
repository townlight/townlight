# Code Signing Policy

This policy describes how CivicSuite release artifacts are code-signed.

## Windows — Azure Trusted Signing

CivicSuite Windows release artifacts are signed using **Azure Trusted Signing** (Authenticode,
Microsoft-rooted certificate). The private key is held in Azure's Hardware Security Module (HSM)
and never stored locally.

### What is signed

- Windows installer (MSI) artifacts published on GitHub Releases

### Build and signing process

- Artifacts are built in GitHub Actions (GitHub-hosted runners only)
- Routine pull-request and `main` CI builds an explicitly named, private `-UNSIGNED.msi` artifact for build, integration, install, backup/restore, and uninstall validation; its evidence forbids publication
- Publication signing occurs only in an explicit manual GitHub Actions run on `main`
- No local signing; no `.pfx` certificate files
- Signature, signer `CN=Scott Converse`, and timestamp are verified in-workflow using both `signtool /pa` and `Get-AuthenticodeSignature`
- The release workflow accepts only the signed artifact from a successful manual signing run whose head SHA equals the release tag; it independently repeats signature and evidence checks before upload
- All checksums are generated after signing

### Team roles

- Author (commit access): <https://github.com/scottconverse>
- Approver (approves release publication): <https://github.com/scottconverse>

## Distribution

Releases are published at: <https://github.com/townlight/townlight/releases>

## Privacy

This software will not transfer any information to other networked systems unless
specifically requested by the user.
