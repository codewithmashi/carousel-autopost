# Carousel topic queue — @codewithmashi

The 08:07 task reads this top-down, takes the first topic **not** marked `[x]` in the
`## Queue` section, builds it, and marks it done. Keep 4+ queued so the task never
falls back to auto-picked trending topics.

Format: `- [ ] <pillar> · <topic> · <how the PROOF slide is grounded>`
Pillars: `receipts` · `teardown` · `tools` · `business`

**Only take topics from `## Queue`.** The `## Parked` section at the bottom holds
ideas that need Mashi's own numbers or a real project to point at — an autonomous
build cannot ground those and must never invent them.

**Rule that holds regardless of who picks the topic:** the proof slide is never an invented
number. Each line below names how its proof is grounded — a verifiable fact, a structural
before/after, or a scoping breakdown that is professional judgement rather than a measurement.

## Queue

- [ ] teardown · What founders think slows a mobile launch vs. what actually does · PROOF: before/after of where the weeks really go

- [ ] business · Why fixed-price kills mobile projects, and what to quote instead · PROOF: structural — the shape of the risk, not a client number

- [ ] teardown · "Works on iOS and Android" is two products wearing one name · PROOF: structural — what has to be decided, built and tested twice

- [ ] business · The app store rules that are product decisions, not paperwork · PROOF: verifiable — account deletion, privacy labels and payment rules are requirements, not admin

- [ ] teardown · Login is not a screen — what "add sign-in" pulls in behind it · PROOF: structural — resets, sessions, deletion, and the store rules that attach to each

- [ ] business · What an app costs after launch, when nobody is adding features · PROOF: structural — the recurring line items that exist at zero new work

- [ ] tools · Push notifications: why "just send a notification" is a delivery chain · PROOF: structural before/after — every hop between your server and a lock screen

- [ ] teardown · The offline question nobody asks until the demo is on hotel wifi · PROOF: structural before/after — the same screen under two network assumptions

- [ ] business · Why app review belongs in your launch date, not after it · PROOF: verifiable — review is a gate you do not control the timing of

- [ ] tools · The accounts you must own before the first line of code is written · PROOF: verifiable — developer accounts and signing identity, and what happens when the agency owns them

- [ ] teardown · Why the design that looks right in Figma breaks on a real phone · PROOF: structural — the things a static mockup cannot show you

- [ ] business · "We own the code" — what a real handover has to include · PROOF: structural checklist — accounts, certificates, keys and secrets, not just the repo

- [ ] tools · Crash reporting: the difference between "it broke" and a fix · PROOF: structural before/after — the same bug report with and without a stack trace

- [ ] teardown · Demo-grade vs production-grade, on the same feature list · PROOF: structural before/after — what changes when real users arrive

- [ ] business · Every app needs a way to be turned off · PROOF: structural — forced upgrade and kill switches exist because you cannot recall a shipped version

- [ ] tools · The analytics you cannot add retroactively · PROOF: structural — which questions become unanswerable if you did not instrument first

## Parked — needs Mashi's own numbers or a real project

These are `receipts` ideas. They are deliberately not in the queue: an autonomous
build has no way to ground them and the standing rule is that it must never invent
a figure or a story. Move one up into `## Queue` once the real detail is filled in.

- receipts · A build where one scoping answer visibly changed the timeline — needs the project and what actually changed
- receipts · Something that shipped broken and what fixing it cost — needs the real incident
- receipts · A client who asked for one thing and needed another — needs the real story
- receipts · Before/after of a rebuild — needs the real app and the real difference

## Done

- [x] tools · Build vs buy for auth, payments and push in an MVP · slug `build-vs-buy-auth-payments-push` · queued 2026-09-02 for the Mon/Wed/Fri publisher; proof is a structural before/after (FOREVER — integration ends, maintenance does not), not a figure

- [x] business · The five questions that separate a 6-week build from a 6-month one · slug `five-questions-six-week-build` · queued 2026-08-31 for the Mon/Wed/Fri publisher; proof is the structural scoping delta (SAME APP), not a figure

- [x] business · "We'll add real-time later" — why later costs multiples of doing it once · slug `real-time-later-costs-more` · queued 2026-08-29 for the Mon/Wed/Fri publisher; proof is a structural before/after (RETROFIT), not a figure

- [x] teardown · Why MVPs get rebuilt in year one · slug `mvp-rebuilt-year-one` · published 2026-08-28, first deck in Bold Editorial

- [x] tools · Flutter rebuild waste · 16ms frame budget (factual constant) · slug `flutter-rebuild-audit` · published 2026-08-28 — Mashi's verdict: not good, too narrow/dev-tactical for the channel
