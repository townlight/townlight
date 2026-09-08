---
name: Bug report (umbrella docs / governance only)
about: Report a bug in the suite-wide documentation, ADRs, governance, or compatibility matrix
title: "[bug] "
labels: bug
---

> **Most bugs belong on a module repo, not here.** This umbrella repo holds documentation, ADRs, governance, the roadmap, and the compatibility matrix — no runtime code. If your bug is in a module's code, please file it on that module's repo:
>
> - civicrecords-ai → <https://github.com/townlight/sunshine/issues>
> - civiccore → <https://github.com/townlight/core/issues>
>
> If your bug is in **this umbrella repo's docs or governance artifacts**, continue below.

## What's wrong?

Brief description of the issue (one or two sentences).

## Where is it?

- File path (e.g. `docs/compatibility/index.md`, `README.md`):
- Section / heading / line number:

## Expected vs. actual

- **Expected:** what should it say or do?
- **Actual:** what does it say or do today?

## Why does it matter?

Who is harmed by the inaccuracy and how? (e.g. "evaluators reading the matrix will think civiccore is at 0.1.0 when it's at 0.2.0")

## Suggested fix (optional)

If you have a concrete fix in mind, paste it here.

## Checklist

- [ ] I've confirmed this is in the umbrella repo, not a module repo
- [ ] I've checked existing issues for duplicates
