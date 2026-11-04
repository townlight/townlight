# Windows Native Wrapper

Payload source: `installer/generated/packages/city-core/windows`

Use `TownlightInstaller.iss` with Inno Setup to build a Windows installer that
wraps the generated operator package. The wrapper opens the readiness flow by
default and keeps privileged dependency installation outside silent mutation.

This beta wrapper is intentionally unsigned for the public Townlight
open-source path. Windows SmartScreen or Unknown Publisher warnings are
expected. Verify the release SHA256 checksum and official Townlight source
before running the installer, then use More info > Run anyway only if the
checksum and source match.
