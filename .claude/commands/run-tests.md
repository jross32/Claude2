Run the test suite specified in: $ARGUMENTS

Available suites: smoke, unit, integration, evaluations, regression, performance, stress, security, compatibility, api, snapshots, schema

If $ARGUMENTS is empty — list the suites above and ask which to run.

If a suite is specified:
1. Verify `tests/$ARGUMENTS/` exists — if not, say so and offer to create it.
2. Run all test files in that suite.
3. Save timestamped results to `tests/logs/raw/[suite]-[timestamp].json`.
4. Overwrite `tests/logs/latest_ai.json` and `tests/logs/latest_human.md`.
5. Show the human-readable summary (table + per-test results).
6. If any tests failed, follow the CLAUDE.md testing protocol: dig into failures with targeted follow-up tests, suggest branching tests, wait for yes/no.
