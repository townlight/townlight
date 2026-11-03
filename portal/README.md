# Townlight Portal

Wagtail provides public city pages and a meeting archive. The optional Townlight bridge pulls explicitly approved releases from the private desktop runtime; the synthetic PrimeGov fixture remains available for demonstrations and never contacts a real tenant.

Townlight Beta 1 now includes the approved resident-facing design: a city-branded home and task finder, editable service guidance, searchable/filtered public meetings, recording playback, approved meeting document pages and optional provenance details. Pages are server-rendered and responsive; navigation and filters work without JavaScript. Existing component versions are retained.

## City presentation and editing

Edit the home in Wagtail for the city name/prefix, logo and hero image, heading/introduction, address/hours and synthetic-demo notice. Edit Service pages for kind, summary, body, next steps, optional questions, department/contact details and designated HTTPS service link. Normal page approval and privacy rules apply. The original illustrations are fallbacks; a city can supply approved imagery. Only live/public services appear in navigation and title search. The task finder accepts published page identities, not arbitrary redirect URLs.

`setup_demo` creates fictional Juniper Falls content only when no Townlight home is configured, and preserves existing content on subsequent runs. Its service links use `.example` domains and are explicitly illustrative. Upgrade a separate existing portal by backing up its database, media and private releases, running `migrate` and `collectstatic`, then editing its presentation fields; no page text is automatically replaced. City-approved contact, privacy and accessibility content is configured by the adopting city.

Residents use `/meetings/?period=upcoming|past|all` with `q`, `series` and `page` filters. Series uses actual public titles because the existing contract has no separate board taxonomy. `/search/?q=records` searches published page/meeting titles only. Native agenda, packet and minutes open at `/meetings/<pk>/documents/<agenda|packet|minutes>/`; they expose approved text, not imaginary PDF files. Withdrawal removes these document routes, playback, search results and the home feature together. Synthetic PrimeGov links retain their illustrative labels.

The public presentation adds no resident accounts, transactions, fee calculator, new vendor connector or live-stream host. See the [portal guide](../docs/portal/guide.md) for complete field specifications, examples and existing publication controls.

## Local setup

Use Python 3.13 and install the pinned dependencies with `python -m pip install --require-hashes -r requirements.lock`. Run `python manage.py migrate`, `python manage.py setup_demo`, and `python manage.py createsuperuser`; start with `python manage.py runserver 127.0.0.1:8000`. The public archive is `/meetings/` and the Wagtail admin is `/admin/`. Run `python manage.py test website` for portal tests.

Set a unique `TOWNLIGHT_SECRET_KEY`, `TOWNLIGHT_DEBUG=0`, allowed hosts, TLS and appropriate static/media service before deployment. Protect the database, private release directory and backups. `TOWNLIGHT_RELEASE_ROOT` selects an absolute private directory outside public media; its default is `private-releases` under the portal directory. `TOWNLIGHT_DB` selects the database path and `TOWNLIGHT_BRAND` the site name.

## Production deployment

Use `runserver` only for local demonstration. Set `TOWNLIGHT_DEBUG=0`, a unique `TOWNLIGHT_SECRET_KEY` of at least 50 characters, `TOWNLIGHT_ALLOWED_HOSTS`, HTTPS `TOWNLIGHT_BASE_URL`, HTTPS `TOWNLIGHT_CSRF_TRUSTED_ORIGINS` and `TOWNLIGHT_STATIC_ROOT`; run migrations and `python manage.py collectstatic`, then supervise `python serve.py --port 8000`. Waitress listens only on loopback. Stop the service and synchronization before backing up the SQLite database and private release directory together. Restore and verify both in an isolated environment.

Use a same-host TLS reverse proxy; enable `TOWNLIGHT_TRUST_TLS_PROXY=1` only when it strips client forwarded headers, supplies its own HTTPS scheme and sets the canonical Host. Serve collected static assets only and proxy all other routes. Do not expose the native desktop port or private release directory. For a minimal Nginx example and detailed operational guidance see [the portal guide](../docs/portal/guide.md).

## Publication

Configure `TOWNLIGHT_NATIVE_ORIGIN` to the trusted private native runtime origin (HTTPS or loopback HTTP), `TOWNLIGHT_NATIVE_PROOF_FILE` to an absolute server-only file containing the native session proof, and optionally `TOWNLIGHT_DISPLAY_TIMEZONE` to an IANA zone (default `UTC`). Restrict the proof file to the portal service account. A native principal needs both Meetings and Records permissions. The proof is not sent to the browser.

A Wagtail superuser opens **Townlight publication** in the admin, enters the Records request UUID, selects **Find approved releases**, and chooses the intended result. The form fills the IDs and expected hash but leaves explicit approval unchecked. Review the selection and public content, select publish or withdraw, and explicitly approve. Wagtail editors cannot use this cross-module publisher. An operator can instead run `python manage.py sync_townlight selection.json` with a private local selection file:

```json
{"action":"publish","approve_publication":true,"archive_id":"00000000-0000-4000-8000-000000000001","meeting_id":"00000000-0000-4000-8000-000000000002","recording_id":"00000000-0000-4000-8000-000000000003","request_id":"00000000-0000-4000-8000-000000000004","release_copy_id":"00000000-0000-4000-8000-000000000005","expected_release_sha256":"0000000000000000000000000000000000000000000000000000000000000000"}
```

These example identifiers are placeholders. Use `action: "withdraw"` with the same selection fields to explicitly hide an existing archive projection and its release URL. A failed sync leaves the previous publication intact. Repeating a successful sync updates the same archive identity. Publication requires a public non-closed Meetings archive, completed matching Station recording, fulfilled Records request, current approved response and completed verified artifacts, and the latest eligible managed release copy. The separate explicit approval authorizes export; a prepared release copy alone is not public.

`python manage.py export_public <empty-directory>` exports published public pages, meeting metadata and approved release bytes with hashes. `/source/` offers allowlisted portal source and the native bridge when run from this repository checkout. Full corresponding Townlight source is maintained at https://github.com/townlight/townlight; operators must make the exact deployed version and modifications available, including the bridge and dependencies. The portal code is AGPL-3.0-only; vendored CivicCast code retains Apache-2.0 terms in `UPSTREAM.md` and `LICENSE-CIVICCAST-APACHE-2.0`.

The runtime and portal stream release bytes through private temporary and release files. `TOWNLIGHT_PORTAL_MAX_BYTES` sets the maximum on both services; its default is 8 GiB, with an upper bound of 64 GiB. Provide enough private disk space for the bundle, staged copy, and retained prior releases. Back up the private release directory with the portal database.

The lookup calls authenticated `GET /desktop/v1/portal/selections?request_id=<UUID>` and returns `{"selections":[{"title":"<public archive title>","selection":{...}}]}`. Each selection contains all publication fields with `approve_publication: false`; selecting a choice sends `request_id`, `release_copy_id`, and `archive_id` as query parameters and fills the form. Both Meetings and Records permissions remain required.

Use an active native sign-in authorized for both modules. The active profile's `config/local-session.json` contains `session_hash`, an active session proof rather than a durable service token. Copy it without printing into an absolute file in a directory already restricted to the portal service account; replace the private path placeholders:

```powershell
[System.IO.File]::WriteAllText('<protected-absolute-path>\portal-proof.txt', (Get-Content -LiteralPath '<active-profile>\config\local-session.json' -Raw | ConvertFrom-Json).session_hash, [System.Text.UTF8Encoding]::new($false))
```

Refresh the proof after session expiry, sign-out, account change or credential change.

The default 8 GiB portal transport limit is not the end-to-end recording limit: the inherited Records managed-file receipt limits both originals and release copies to 2,147,483,647 bytes. At 6,000 kbps video, roughly 47 minutes approaches 2 GiB before audio and container overhead. Plan duration and bitrate before capture; for example, 2,000 kbps video plus audio for two hours is roughly 1.9 GB depending on actual rates and overhead. Measure the file and leave margin. No automatic transcoding is performed.
