# Test Results — unit-tool-improvements

**Status:** ❌ FAILING
**Run:** 2026-04-19T00:24:14.237Z
**Commit:** `abb088e`
**Duration:** 71ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 4 | 3 | 1 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | fix-1: pause/resume/submit — description quality | pass | 21ms | |
| ✅ | fix-2: openWorld flags for extract_entities, find_graphql_endpoints, find_site_issues | pass | 18ms | |
| ✅ | fix-3: schedule persistence survives module reload | pass | 15ms | |
| ❌ | fix-4: http_fetch — POST method + body + sessionId cookie jar in schema | fail | 7ms | |

## Errors

### ❌ fix-4: http_fetch — POST method + body + sessionId cookie jar in schema
```
Score 67% — http_fetch missing capabilities
Error: Score 67% — http_fetch missing capabilities
    at C:\Users\justi\Claude2\tests\unit\tool-improvements.test.js:141:24
    at TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:28)
    at main (C:\Users\justi\Claude2\tests\unit\tool-improvements.test.js:125:10)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
```
## Suggested Next Steps

- Run `/new-test` to dig into failing tests
- Check `tests/logs/raw/` for full history