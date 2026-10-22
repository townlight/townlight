# Townlight opt-in staff Planning beta preparation

Status: prepared and unreleased. Scope: release-preparation steps 1–3 authorized
October 22, 2026. No signing, tag, draft release, publication or download-pointer
change is authorized by this document. Signed 1.4 remains the public download.

## Frozen scope and identity

The proposed desktop release is **1.5.0-beta.1**, with desktop version `1.5.0-1`
and MSI ProductVersion `1.5.0.1`. Its future tag is
`townlight-records-meetings-code-zoning-planning-v1.5.0-beta.1`; it has not been
created. This is an opt-in staff beta, not general availability or a public portal.
Permitting, Inspections and the wider land-use profile remain disabled.

`config/planning-staff-beta.json` is the build contract. Its separate source
manifest pins Core, Records, Meetings, Code, Zoning, Planning, Notice and Access.
Planning package `0.3.0` and Records package `1.7.4` are distinct, unreleased
bundled package identities; these numeric versions do not claim stable release
readiness or authorize module publication. Core stays at `1.2.1`. The six module
pins outside Planning and Records are reused without product changes.

The installed selection remains `planning-preview`, displayed as **Townlight
Planning development preview**. Keeping this existing label and selection is
intentional under the interface freeze. Staff opt in explicitly; Records remains
the default, and saved selections remain intact. Known density, hierarchy and
overflow limitations remain. Functional evidence does not establish usability
for broad public deployment. Conclusions still require staff planning judgment.

Application ID `org.civicsuite.desktop`, MSI upgrade code
`a63fc1d3-5437-5f55-89a2-fef93fb1f930`, package/API identifiers and data roots are
unchanged. Preserve historical releases, receipts, source histories and signed
1.4 bytes. The P5/P6 development candidate contract and source pins remain intact.

## Build and provenance boundaries

The MSI workflow accepts explicit `product_profile=planning-staff-beta`. Automatic
selection uses that contract on `planning/staff-beta-prep`; ordinary main-branch
automatic builds retain `zoning-beta`. The original candidate branch still
selects the unsigned `planning-preview` contract. Both executable build and MSI
bundling use the selected version overlay. Integration CI uses the beta contract
by default, or the development contract when explicitly requested.

Runtime packaging retains the existing `planning-preview` composition and uses
`PlanningBuildProfile=planning-staff-beta` to select the release source/version
contract. All eight sources must be clean at their exact pins; installed
dependencies cannot be reused as unproven inputs. Records and Planning wheels
are built from those clean commits. The existing
`python/planning-candidate-provenance.json` filename is retained for compatibility;
its `build_profile` and `development_only` fields distinguish beta and development
builds. It records source commits, wheel hashes, contract/manifest hashes,
installed package versions and the umbrella source commit. The runtime lock and
MSI evidence identify the resulting payload and artifact.

Routine PR/main builds remain visibly UNSIGNED and non-publishable. The old
development candidate refuses signing. A future beta signing run requires an
explicit manual main-branch dispatch with the beta profile, using the existing
Azure signer and unchanged EXE/MSI signature, timestamp and receipt gates. No
such dispatch is part of this preparation. A future release attachment must
match the exact tag/source/run, beta composition, package/source provenance and
embedded signed bytes. Published releases and existing assets cannot be replaced.

## Supported upgrade procedure for the future accepted installer

These instructions describe the path demonstrated by the P6 unsigned candidate;
they do not certify a newly built or signed beta installer.

1. Retain the original signed 1.4 installer, current coherent backup, profile and
   recovery records. Verify the new installer's identity against its own accepted
   release evidence when that installer becomes available.
2. Finish pending work, stop Townlight services and close the old application.
   Allow PostgreSQL to stop cleanly; do not force-kill it to make a backup.
3. Install the new MSI and reopen the existing profile. Existing Records work and
   selection are retained. The MSI update alone does **not** refresh the cached
   per-user Python runtime.
4. Explicitly select **Townlight Planning development preview**. Activation checks
   payload availability, fences operations, stops writers and creates/verifies a
   coherent pre-selection backup before changing a populated profile. Retain the
   activation receipt and backup. Missing prerequisites or a failed backup block
   activation; do not bypass the failure.
5. Use **System Health → Python-services Repair** to refresh the cached runtime,
   apply explicit migrations and start the selected services. Wait for completion
   and refreshed health state before starting another maintenance operation.
   A busy/maintenance refusal means wait and retry, not launch parallel repairs.
6. Sign in as authorized staff, reopen retained Records work, then check the
   Planning source/history, reviewed analysis and intended snapshot audience.
   Save the separately edited public summary only after human review. A Planning
   attachment never approves or releases a Records response automatically.

For recovery, preserve the current state and use the known prior installer with
its corresponding pre-upgrade coherent backup. Do not open a newly migrated
database with older code or drop Planning tables to simulate a downgrade. Restore
retains displaced folders as additional recovery copies; an old-folder cleanup
notice is not permission to delete them. Unexpected verification, rename or
secret errors still block recovery. Start services after recovery and verify the
retained work before considering cleanup.

## Evidence and remaining gates

P5 functional/native evidence and P6's exact unsigned MSI fresh/populated-signed-1.4
upgrade evidence are supporting proof for the tested versions and environment.
This preparation changes package identities and release wiring; it does not
relabel that artifact or certify final signed bytes. P6's disposable guests used
established per-user WebView and a guest-only unsigned-code policy adjustment.

For this preparation, run affected contract checks and repository-required CI on
the final source. Reuse unchanged privacy, audit, revocation, recovery and UI
evidence; no broad local reruns or extra installed journeys are required here.
Stop with reviewable source PRs and their checks, before merge/sign/tag/publication.

Later, only with the corresponding authorization: sign one final candidate;
verify exact MSI/embedded EXE/source receipts; perform one fresh installation and
one populated signed-1.4 upgrade under normal supported Windows security and
prerequisite conditions, checking launch, opt-in, reviewed export, restart and
retained work. Publication, a new tag and post-delivery verification remain later
actions. Keep signed 1.4 as the public download until those gates are completed.
