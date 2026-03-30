Start the full test-writing workflow for: $ARGUMENTS

Follow the Testing Protocol from CLAUDE.md exactly.

## Step 1 — Clarify if vague
If $ARGUMENTS is unclear or broad, ask these questions before writing anything:
- What specific behavior or function are you testing?
- Which module/file is involved?
- What does "working correctly" look like — what's the expected output?
- Do you have a specific failure case or bug in mind?

## Step 2 — Determine the suite
Pick the correct folder based on CLAUDE.md:
- `smoke/` — startup/server sanity
- `unit/` — single function in isolation
- `integration/` — modules talking to each other
- `evaluations/` — full end-to-end flow
- `regression/` — a specific bug that was fixed
- `performance/` — speed and memory baseline
- `stress/` — limits and breaking points
- `security/` — credential/session safety
- `compatibility/` — site-specific scrape correctness
- `api/` — REST endpoint contracts
- `snapshots/` — output drift detection
- `schema/` — data shape validation

## Step 3 — Write and run
- Write the test following the dual-output format (JSON + Markdown logs)
- Include chaos tests per the CLAUDE.md chaos table for this suite type
- Run it immediately after writing

## Step 4 — Drill on failure
If errors surface, write targeted follow-up tests. Keep drilling until the original test passes.

## Step 5 — Suggest branching
Suggest logical follow-up tests. Wait for yes/no before writing them.
