# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-04-15T08:15:34.595Z
**Commit:** `bb5cb9e`
**Duration:** 5950ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 8 | 8 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | GET /api/session/check with valid url → 200 + { exists: boolean } | pass | 38ms | |
| ✅ | GET /api/session/check for poolplayers.com → exists field present | pass | 28ms | |
| ✅ | DELETE /api/session with url → 200 + { cleared: boolean } | pass | 15ms | |
| ✅ | GET /api/site-credentials for unknown site → { found: false } | pass | 7ms | |
| ✅ | GET /api/site-credentials for poolplayers.com → { found: true, username: string } | pass | 7ms | |
| ✅ | [chaos] GET /api/session/check with no url → { exists: false } | pass | 5ms | |
| ✅ | [chaos] DELETE /api/session with no url → does not 500 | pass | 4ms | |
| ✅ | [chaos] GET /api/site-credentials with no url → does not 500 | pass | 3ms | |


