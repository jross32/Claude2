# Test Results — unit

**Status:** ❌ FAILING
**Run:** 2026-04-15T08:11:44.247Z
**Commit:** `8399692`
**Duration:** 14ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 5 | 4 | 1 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | ScraperSession exposes initial live status snapshot | pass | 3ms | |
| ❌ | progress updates live counters and step metadata | fail | 1ms | |
| ✅ | pause and resume update state snapshot | pass | 2ms | |
| ✅ | credential and verification waits toggle flags without leaking secrets | pass | 2ms | |
| ✅ | markComplete and markError shape terminal snapshot fields | pass | 1ms | |

## Errors

### ❌ progress updates live counters and step metadata
```
Progress counters did not update correctly
Error: Progress counters did not update correctly
    at C:\Users\justi\Claude2\tests\unit\scraper-status.test.js:27:13
    at TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:28)
    at main (C:\Users\justi\Claude2\tests\unit\scraper-status.test.js:21:16)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
```
## Suggested Next Steps

- Run `/new-test` to dig into failing tests
- Check `tests/logs/raw/` for full history