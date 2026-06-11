

Phase 11 slice

11a — Map & document
docs/roadmap/phase11-multi-repo.md: 

what stays shared vs per-service, extraction order
Low (mostly doc)

11b — Monorepo packages
packages/platform-quality-utils/ with exports for manifest-validation, notify, chaos report — still one repo
Medium, 2–3 PRs

11c — AGENTS.md
Root agent doc so future sessions need less context
Low

11d — Actual split
New repos, move services
High — do when job stable / you want the exercise
That matches your instinct (“in real life they’d be split”) without paying the cost of actually splitting yet.

How not to eat Claude credits in 2 minutes
One concern per branch / per agent chat — never “finish phase 7 and phase 11.”
Point at a template — “like perf-regression.ts” beats “build LLMOps alerting.”
You run CI locally — agent suggests; you npm run test:llmops and push.
Avoid full-repo “review everything” chats — those are what burn Pro fast.

Docs PRs without agent — PHASE-11.md is faster to write yourself.

Merge to main between PRs — smaller diffs, smaller context next time.
Use Ask mode for planning (like now), Agent mode only for implementation.
Rough budget: Phase 7 close-out = 1–2 agent sessions. 
Phase 11a doc = 0. 
Phase 11b first package = 2–3 sessions.
Full repo split = 10+ — not worth it pre-job.