# Portal verification and isolated acceptance

The existing signed Beta 1 installer predates the portal endpoints. The candidate wheel must be built and installed in a separately prepared matching runtime as described in [the portal guide](guide.md); do not modify a host installation as a verification shortcut. Preserve activation, profile and database contracts. The portal and native services should use a private origin and an active authorized session proof. Use a synthetic request and release for test environments, and do not publish confidential material or proofs in receipts.

For an integration check, use the Wagtail publication lookup with a valid Records request UUID or call `GET /desktop/v1/portal/selections?request_id=<UUID>` on the private native origin using the server-side `X-Townlight-Session` proof. An authenticated 200 response contains a `selections` array; an empty array does not prove a matching eligible source is ready. Select a reviewed result and confirm that `approve_publication` is false until the operator separately approves. Exercise publication, resident page and release, then explicit withdrawal; distinguish source, test and installed evidence in the result. Never expose the native runtime port.

## Isolated synthetic runner

`scripts/portal-e2e.py` is a Windows-oriented isolated, synthetic real-service test harness. Use a harness Python environment containing `httpx`, `psycopg2` and `cryptography`. From the suite repository root, inspect its current options with:

```powershell
python scripts/portal-e2e.py --help
```

Use explicit paths appropriate to the test machine. The output directory must not already exist; the harness creates databases, test identities and owned local services under that directory. The module root contains `sunshine/backend`, `core`, `meetings`, `access` and `notice`; the Station root contains the Station Python source. The media source is a separate Python source tree with `pyproject.toml`. Provide a PostgreSQL bin directory containing Windows executables, Python environments with the harness and relevant service dependencies, and a dedicated browser executable and Playwright module. Example placeholders, not production paths:

```powershell
python scripts/portal-e2e.py `
  --station-root '<station-source>' --modules-root '<module-source-root>' `
  --native-runtime-root '<native-runtime-source>' --services-python '<services-python.exe>' `
  --media-python '<media-python.exe>' --portal-python '<portal-python.exe>' `
  --postgres-bin '<postgres-bin>' --media-source '<media-source>' `
  --ffmpeg '<ffmpeg.exe>' --ffprobe '<ffprobe.exe>' --node '<node.exe>' `
  --playwright '<playwright-module-directory>' --chromium '<chromium.exe>' `
  --output '<new-isolated-output-directory>'
```

The runner uses synthetic test configuration and identities and records its inputs and owned processes. Its results are test evidence for those inputs; they do not by themselves prove an installed wheel, signed installer, real city deployment or public site. Consult `--help` and the current script for the exact supported options and prerequisites. Stop only services owned by the run and preserve its evidence. Verification of the separately prepared wheel and normal activation requires its own matching-runtime evidence.
