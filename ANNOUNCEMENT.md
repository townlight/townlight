# Townlight Windows public beta 1.9.2.1 is available

Windows 1.9.2.1 adds shared Meetings and Records use from a Windows workstation through the city host, reviewed council packet revisions, and queued delivery of explicitly approved packets and recording copies to the separately deployed Townlight Portal.

[Download the signed Windows x64 MSI](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.9.2.1/Townlight-Windows-x64-1.9.2.1.msi) · [Release, corresponding source and checksums](https://github.com/townlight/townlight/releases/tag/townlight-windows-v1.9.2.1) · [Acceptance and limits](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.9.2.1/ACCEPTANCE-Windows-1.9.2.1.md) · [Maintainer handoff](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.9.2.1/HANDOFF-Windows-1.9.2.1.md)

## Installed acceptance

The exact signed MSI was installed and exercised using synthetic data and a test portal on the physical Windows host and a clean Windows Sandbox guest on the same PC. The checks covered shared staff packet preparation, correction and approval; verified Station-to-Records transfer; approved portal delivery, retry and separate withdrawals; and same-machine cold recovery from a verified backup.

Acceptance used synthetic data and a test portal on the physical Windows host with a clean Windows Sandbox guest on the same PC. It does not establish two physical PCs, recovery on another computer or account, production portal or city network operation, direct MSI upgrade from an earlier version, new hardware or broadcast acceptance, or PDF/UA and full assistive-technology review.

The council packet PDF was printable and searchable. PDF/UA tagging and a full assistive-technology review were not verified.

## Install and upgrade

For a fresh installation, download the MSI and checksums from the release, verify its SHA-256 and timestamped Authenticode signature, and follow the first-run guide. Back up city data and settings before changing an existing installation. The published acceptance does not cover a direct MSI upgrade from an earlier version, so use the published recovery guidance and a verified backup.

## Portal deployment

The Windows MSI installs the desktop host and workstation application. It does not install the separately deployed Townlight Portal server or establish operation on a production portal or city network. Configure and test the portal separately before staff use.

Windows 1.9.1.1 and its C920 camera/microphone acceptance remain documented under that historical release and do not establish new hardware or broadcast acceptance for 1.9.2.1.
