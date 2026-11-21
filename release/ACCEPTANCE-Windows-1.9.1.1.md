# Townlight Windows 1.9.1.1 acceptance

- Published source commit: `2334a42a6dca632b96dcae119c98d1182231c113`
- Signed Windows x64 MSI SHA-256: `ef86e746b02970767ec4aa72c0dbb966e1225689a4b24ffdb72484760cb86662`
- Station 0.4.4 source: `ddc717d65321b2e7de13bc15bcf7c3e788417150`
- The MSI and its embedded desktop executable carry independently verified timestamped Scott Converse signatures.

| Evidence | What passed |
|---|---|
| Exact signed release bytes | Station used the C920 and its built-in microphone from an administrative image of the signed MSI. The first preview captured 10.00 seconds of picture and 10.01 seconds of sound. Headless Edge played the preview past nine seconds. The operator stopped a 13.47-second 1080p/30 recording. Authenticated playback matched the recording hash and played after a local lossless remux. Anonymous read was denied. The installer icon and retained upgrade code also matched. |
| Exact merged source | Windows MSI build, real-runtime integration, install, first run, backup/restore and uninstall passed on the merged source. This workflow used its unsigned installer. |
| Earlier signed 1.9.1.1 iteration | Clean Windows first run, upgrade from the published 1.9.0.1 MSI, Meetings packet ordering and local delivery, the Code and Meetings ordinance decision and closeout, Records preparation and private handoff, a continuous recording over 2 GiB, backup/restore and uninstall retention. Only Station's preview behavior changed between that iteration and the published candidate. |
| Historical upgrade | The exact published signed 1.8.2.1 to 1.9.0.1 upgrade passed separately. It retained city settings, the staff profile and Records attachments. |

The exact signed hardware test used an isolated Station database and a synthetic Townlight meeting and staff authorization. The signed workflow uploaded the finished MSI before its downstream installed jobs were canceled by the automatic push workflow. Full installed clerk and endurance evidence is reused as identified above. A direct upgrade from 1.8.2.1 or older to 1.9.1.1 was not exercised. Back up city data and settings, close Townlight, and run the MSI using the same Windows account and profile when upgrading from 1.9.0.1.

[Signed build](https://github.com/townlight/townlight/actions/runs/44912347174) · [Merged-source Windows CI](https://github.com/townlight/townlight/actions/runs/44912721182) · [Earlier signed 1.9.1.1 acceptance](https://github.com/townlight/townlight/actions/runs/44890593559) · [Historical upgrade](https://github.com/townlight/townlight/actions/runs/44863028775)
