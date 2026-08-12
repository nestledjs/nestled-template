---
name: Fleet upstream request
about: An edge case a downstream repo's convergence hit that needs a fix here, then re-promotion
title: "[fleet-upstream] "
labels: fleet-upstream
---

<!--
Use this when converging a product repo onto the template and you hit something that belongs UPSTREAM
(a template-derived bug, a doctor false-positive, a missing template feature, a new gotcha). Do NOT
just patch it in the downstream repo — that drift gets reverted by the next convergence. Apply a
minimal local workaround, record it in that repo's docs/DECISIONS.md as "temporary, pending upstream",
open this issue, and move on. See the fleet convergence playbook §0.
-->

## What / where
<!-- The edge case: which check, feature, or tooling, and the file(s) involved. -->

## The fix
<!-- What should change in nestled-dev-template. -->

## Which repo hit it + local workaround
<!-- Repo name; the temporary local workaround applied (link its DECISIONS.md entry). -->

## Closeout checklist
- [ ] Change made in `nestled-dev-template`
- [ ] `promote-template` → `nestled-template` (PR)
- [ ] Flows down (verified by the next repo's §2 divergence scan)
- [ ] Downstream `DECISIONS.md` "pending upstream" note removed once adopted
