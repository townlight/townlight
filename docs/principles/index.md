# Suite-Wide Design Principles

The five non-negotiables every module inherits from Townlight Core (verbatim
from `specs/01_catalog.md` section 3):

1. **Clerk-first, staff-first** before flashy resident features. Resident
   features land after staff workflows are stable.
2. **Modular install, no forced monolith.** Cities pick what they need.
   Townlight Core is the only prerequisite.
3. **Calm government UI, not startup UI.** Aesthetic target: trust through
   clarity.
4. **Public-facing features only where they clearly help trust and
   transparency.**
5. **Every workflow must degrade gracefully without AI.** Core functions
   work when the LLM is down.

The full set of product, AI, governance, technical, and licensing
principles is in [`../../specs/01_catalog.md`](../../specs/01_catalog.md)
section 3 (subsections 3.1 through 3.5).
