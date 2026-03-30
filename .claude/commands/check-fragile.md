Review all current changes to Fragile files before committing.

Fragile files (per CLAUDE.md): src/scraper.js, src/extractor.js, src/auth.js, public/index.html, public/js/app.js

1. Run `git diff` (staged + unstaged) and filter to Fragile files only.
2. If no Fragile files changed — say "No Fragile files modified. All clear." and stop.
3. For each changed Fragile file:
   - Summarize what changed in plain language
   - Flag specific risks (e.g. "browser.close() removed from finally block", "new selector added without null check", "event listener added without cleanup")
   - Recommend which test suites to run to verify (from: smoke, integration, evaluations, compatibility)
4. Do NOT commit anything — this is a review only.
