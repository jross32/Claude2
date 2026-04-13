# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-04-13T21:58:03.765Z
**Commit:** `9a2892c`
**Duration:** 2113ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 8 | 8 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | GET /api/session/check with valid url → 200 + { exists: boolean } | pass | 23ms | |
| ✅ | GET /api/session/check for poolplayers.com → exists field present | pass | 13ms | |
| ✅ | DELETE /api/session with url → 200 + { cleared: boolean } | pass | 4ms | |
| ✅ | GET /api/site-credentials for unknown site → { found: false } | pass | 4ms | |
| ✅ | GET /api/site-credentials for poolplayers.com → { found: true, username: string } | pass | 5ms | |
| ✅ | [chaos] GET /api/session/check with no url → { exists: false } | pass | 5ms | |
| ✅ | [chaos] DELETE /api/session with no url → does not 500 | pass | 3ms | |
| ✅ | [chaos] GET /api/site-credentials with no url → does not 500 | pass | 3ms | |


