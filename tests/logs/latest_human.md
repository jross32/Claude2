# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-05-01T15:35:32.861Z
**Commit:** `4b2457a`
**Duration:** 8836ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 8 | 8 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | GET /api/session/check with valid url → 200 + { exists: boolean } | pass | 45ms | |
| ✅ | GET /api/session/check for poolplayers.com → exists field present | pass | 7ms | |
| ✅ | DELETE /api/session with url → 200 + { cleared: boolean } | pass | 6ms | |
| ✅ | GET /api/site-credentials for unknown site → { found: false } | pass | 6ms | |
| ✅ | GET /api/site-credentials for poolplayers.com → { found: true, username: string } | pass | 5ms | |
| ✅ | [chaos] GET /api/session/check with no url → { exists: false } | pass | 5ms | |
| ✅ | [chaos] DELETE /api/session with no url → does not 500 | pass | 5ms | |
| ✅ | [chaos] GET /api/site-credentials with no url → does not 500 | pass | 8ms | |


