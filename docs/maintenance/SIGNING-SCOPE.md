# Windows signing scope — owner decision, November 19, 2026

Scott explicitly removed OIDC migration from the organization cleanup requirements and instructed that it must not return implicitly.

Keep the existing supported Azure Artifact Signing client-secret authentication, account `scottconverse-signing`, profile `ScottConversePublic`, signer CN=Scott Converse, timestamps and independent signature verification. This decision does not remove signing or verification safeguards.

OIDC is optional future work, not a defect in the current supported signing method, a release requirement, an acceptance gate or an unfinished obligation of this cleanup. Do not reopen issue #249, reintroduce probe/bootstrap workflows, request Azure administrator sign-in, or rotate/delete shared credentials as part of this work. A future OIDC project requires Scott's new explicit approval.

The temporary probe workflow is removed. Failed probes created no federated credential and changed no Azure role, signer, secret, released MSI, release tag or evidence artifact. CivicCast's existing signing policy documents the same supported client-secret method.
