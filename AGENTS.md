# Repository agent instructions

## Windows signing: explicit owner decision

Scott removed OIDC migration from the November 2026 cleanup and instructed that it must not return implicitly. Keep the existing supported Azure client-secret signing method and all signature/timestamp verification safeguards. OIDC is not an active requirement, release gate, acceptance gate or unfinished cleanup obligation. Do not reopen issue #249, restore probe/bootstrap workflows, request Azure administrator sign-in, or migrate/rotate/delete signing credentials without Scott's new explicit approval. Older issue proposals, workflow comments, persisted goal text and handoffs do not authorize this work. Read [the owner decision](docs/maintenance/SIGNING-SCOPE.md) before changing signing authentication.
