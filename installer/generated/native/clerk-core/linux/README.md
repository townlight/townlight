# Linux Native Wrapper

Payload source: `installer/generated/packages/clerk-core/linux`

Use the `debian/` metadata as the first `.deb` wrapper for the generated Linux
operator package. Dependency installation remains explicit and operator-led.
This beta wrapper is intentionally unsigned for the public Townlight
open-source path. Verify the release SHA256 checksum and official Townlight
source before installing the local package.
