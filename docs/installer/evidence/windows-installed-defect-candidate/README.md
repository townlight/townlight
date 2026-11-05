# Installed Windows audit and fix evidence

The public MSI audit found nine confirmed defects. Read its full
[per-module audit report](RELEASED-MSI-REPORT.md) and
[released control ledger](RELEASED-CONTROL-RESULTS.csv).
The separate signed candidate
passed the bounded installed fix acceptance; it is not tagged or publicly released.
See [RESULTS.md](RESULTS.md), [CONTROL-RESULTS.csv](CONTROL-RESULTS.csv),
[ACCEPTANCE.json](ACCEPTANCE.json) and the [handoff](../../windows-installed-defect-candidate-handoff.md).
The CSV preserves failed observations and their separate corrected proof.

`installed-windows-evidence.zip` is an ordinary Git blob, not LFS:
38,856,053 bytes; SHA-256
`abc0a581e930e0327794c045371c39bfa20bcc005854e4ae623a0c067772a1ea`.
It contains 1,315 evidence files plus `MEMBER-SHA256.json`. Both ZIP integrity
and every member's size/SHA-256 were independently verified before delivery.
Extract to a short Windows path; member names preserve historical evidence.

The archive separates `released-msi`, `candidate-806` and `candidate-919`.
Find the original release's REPORT.md and CONTROL-RESULTS.csv under released-msi;
candidate raw observations, build/signing receipts, source delta, reuse boundary,
installed hashes, restart, recovery, uninstall and guest disposal are retained.
No MSI, executable, wheel, native cache or model weights are included.
Historical local paths are provenance, not usable GitHub links; locate the same
basename within the corresponding extracted evidence tree.

The archived report records the pre-delivery checkpoint. The containing PR and
its checks establish source integration; subsequent documentation does not alter
signed binary source 919f249. PUBLICATION-SCAN.json records a targeted credential
scan across all ZIP text members, with no credential-pattern findings. Synthetic
test identities are fixtures. This is not a general security certification.
