# Carousel topic queue — @codewithmashi

The 08:07 task reads this top-down, takes the first topic **not** marked `[x]`, builds it,
and marks it done. Keep 4+ queued so the task never falls back to auto-picked trending topics.

Format: `- [ ] <pillar> · <topic> · <how the PROOF slide is grounded>`
Pillars: `receipts` · `teardown` · `tools` · `business`

**Rule that holds regardless of who picks the topic:** the proof slide is never an invented
number. Each line below names how its proof is grounded — a verifiable fact, a structural
before/after, or a scoping breakdown that is professional judgement rather than a measurement.

## Queue

- [ ] business · "We'll add real-time later" — why later costs multiples of doing it once · PROOF: before/after of the work involved, framed as scoping judgement

- [ ] business · The five questions that separate a 6-week build from a 6-month one · PROOF: the questions themselves are the payload; result slide is the scoping delta

- [ ] tools · Build vs buy for auth, payments and push in an MVP · PROOF: integration time vs. build time — verifiable, checkable claims about known SDKs

- [ ] teardown · What founders think slows a mobile launch vs. what actually does · PROOF: before/after of where the weeks really go

- [ ] business · Why fixed-price kills mobile projects, and what to quote instead · PROOF: structural — the shape of the risk, not a client number

## Done

- [x] teardown · Why MVPs get rebuilt in year one · slug `mvp-rebuilt-year-one` · published 2026-08-28, first deck in Bold Editorial

- [x] tools · Flutter rebuild waste · 16ms frame budget (factual constant) · slug `flutter-rebuild-audit` · published 2026-08-28 — Mashi's verdict: not good, too narrow/dev-tactical for the channel
