# Townlight candidate — outside test guide

Status: prepared candidate; signed Windows installed acceptance remains pending.
The intended MSI is 1.7.0.1, desktop source 1.7.0-1 and runtime 0.2.0.
Use the exact candidate hash, signature and corresponding-source receipt once
those artifacts exist. Do not use a renamed historical download or treat source
tests as installation evidence. Publication requires Scott's separate approval.

The [current release contract](starter-set-release-contract.md) defines the
fresh-install boundary and required authorization, persistence and recovery
evidence. Testing uses isolated synthetic city data in Windows Sandbox through
the owned Sandbox launcher. Preserve the accepted release, host application,
existing profiles and recovery evidence. Never adopt an unmarked legacy database
or profile. No in-place naming upgrade or old-import shim is supported.

The full installed acceptance covers the agreed product workflows, Access review
and draft provenance/full exports, Notice draft → review → approval → proof →
archive and Records handoff, Code → Meetings, and Meetings → Station → Records.
Verify anonymous/unauthorized refusal, authorized staff actions, restart/readback,
backup/restore and the exact installed executable. Record failures and external
service limits. Reports must not contain passwords or bearer tokens.

The [original outside-test guide](../history/pre-naming-2026-11/docs/installer/starter-set-outside-test-guide.md)
is preserved byte for byte with its May 19 date, original package names, versions,
Linux/Windows package evidence and limited macOS claims. Those are historical
results, not evidence for this changed Windows candidate. No new Linux or macOS
release acceptance is claimed by this guide.
