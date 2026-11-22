# Repository agent instructions

## Windows signing: explicit owner decision

Scott removed OIDC migration from the November 2026 cleanup and instructed that it must not return implicitly. Keep the existing supported Azure client-secret signing method and all signature/timestamp verification safeguards. OIDC is not an active requirement, release gate, acceptance gate or unfinished cleanup obligation. Do not reopen issue #249, restore probe/bootstrap workflows, request Azure administrator sign-in, or migrate/rotate/delete signing credentials without Scott's new explicit approval. Older issue proposals, workflow comments, persisted goal text and handoffs do not authorize this work. Read [the owner decision](docs/maintenance/SIGNING-SCOPE.md) before changing signing authentication.

## Townlight worker routing and background waits

- Use DeepSeek V4.1 Flash 1017 through Ollama as the implementation worker for Townlight code, tests, and substantial documentation edits. Set `think: "low"` for direct Ollama calls, or `model_reasoning_effort="low"` in the existing DeepSeek Codex integration. Keep assignments bounded and follow the authorized data-sharing scope.
- Codex coordinates, plans, makes architecture decisions, handles authorized administrative work, and audits diffs and evidence. Codex may write implementation code only after it has inspected three failed DeepSeek attempts on the same problem. If DeepSeek is unavailable or cannot receive the material, report the blocker and get Scott's approval before assigning the work to an OpenAI worker. Never silently fall back.
- Do not run continuous Codex loops, recurring status prompts, or repeated Codex polling for CI, builds, deploys, or other background jobs. Prefer a native completion event or authorized GitHub auto-merge. If neither is available, make a targeted check when there is reason to expect a result. Do not spin up another agent or chat to watch. An explicit stop ends owned monitoring immediately.
