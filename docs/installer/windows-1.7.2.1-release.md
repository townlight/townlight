# Townlight Windows 1.7.2.1 product-name release

Status: preparation; not yet signed, installed-accepted or published.

Scott authorized the Windows product-name correction and separate release on
November 5, 2026. This changes `Townlight Windows Fix Candidate` to `Townlight`
in installer/product display metadata. Desktop version advances from 1.7.1-1 to
1.7.2-1; MSI version advances from 1.7.1.1 to 1.7.2.1. All eleven component source
pins remain unchanged. This is a Windows release only.

The released [1.7.1.1 beta](https://github.com/townlight/townlight/releases/tag/townlight-v1.7.1-beta.1)
remains intact, including SHA-256
`7553bb3ca457360a99878953f86d54211d77a250129a6744d9d637a2fb4be9e3`.
Its historical receipts are not rewritten.

## Identity and upgrade boundary

- New visible product/display name: `Townlight`.
- Existing application identifier retained: `org.townlight.windows.fixes.candidate`.
- Existing MSI UpgradeCode retained: `{0B97EFAE-2A2E-4E88-A81C-3AAD1A52C2CC}`.
- New MSI ProductCode must differ from 1.7.1.1's
  `{980400D4-336D-49F2-A9A0-4B69F9D4FAE5}`.
- Existing compatibility profile path retained: `%LOCALAPPDATA%\CivicSuite`.

The unchanged UpgradeCode identifies the released 1.7.1.1 product family; a new
code would leave the old registration installed instead of establishing an
upgrade. The base configuration's different older installer family remains
separate. A matching UpgradeCode is preparation evidence, not proof of a successful
upgrade. Only exact signed installed acceptance can establish that claim.

## Required delivery evidence

1. Required Windows build, runtime integration and installed lifecycle CI passes
   on the actual change, followed by normal protected merge.
2. One manual main-branch signed Windows candidate; independent valid Scott
   Converse EXE/MSI signatures and timestamps, exact source and checksums.
3. Fresh installation registers `Townlight` version 1.7.2.1 in Add/Remove Programs;
   installed EXE matches the signed candidate.
4. Install the unchanged signed 1.7.1.1, establish real saved records and retained
   configuration, close its owned processes, then upgrade using the exact signed
   1.7.2.1. Verify one correct product registration, executable identity, retained
   profile/configuration and readback of the previously saved record.
5. Uninstall the new product; verify registration and program removal while
   preserving user data. No broad legacy-upgrade claim follows from this test.
6. Publish a new annotated tag/release with corresponding source, checksums,
   acceptance and signing receipts; independently verify public download bytes
   and signature. Retain 1.7.1.1. Update current release links and pickup handoff.

The full prior functional evidence and its limitations remain applicable where
inputs are unchanged; this release does not add features or expand acceptance.

## Preserved runtime inputs

The legacy fresh-pip recipe does not reproduce the accepted runtime: the first
CI artifact omitted Station media and smaller-preview provenance, changed Python
dependencies, and regenerated a non-portable unsigned Access console launcher.
It was not signed or published. Sandbox application control rejected that
unsigned helper before startup; no policy was weakened.

For this name-only release, runtime preparation verifies the exact signed
1.7.1.1 MSI hash and publisher and preserves its complete runtime payload,
including Station media and the already signed portable Access launcher.
All eleven component source pins and the suite runtime source tree must match.
Only the three preview provenance records and their lock entries are refreshed
to the new umbrella identity. `accepted-runtime-reuse.json` identifies the input
MSI, unchanged component pins, native hashes and changed metadata. The desktop
and new MSI are built and Azure-signed by the normal hosted publication workflow;
the accepted helper signature and exact embedded bytes are independently checked.

The launcher implementation is included at
`desktop/runtime/launchers/access-db-status.rs` for corresponding source. Its
native bytes are reused from the accepted MSI, not rebuilt or re-signed here.

