Check the current test health of the project.

1. Read `tests/logs/latest_ai.json` — if it doesn't exist, say "No test runs found yet. Run `/run-tests smoke` first." and stop.
2. Output a summary table:

| Suite | Total | ✅ Pass | ❌ Fail | ⏭️ Skip | Duration |
|-------|-------|---------|---------|---------|----------|

3. For any failing tests, show the test name and error message in a code block.
4. Note if any suite duration is >20% slower than its previous average.
5. End with a one-line verdict: **HEALTHY** / **FAILING** / **DEGRADED**
