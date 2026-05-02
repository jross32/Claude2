# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-05-02T06:41:22.312Z
**Commit:** `36e02c3`
**Duration:** 7974ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 8 | 8 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | GET /api/session/check with valid url → 200 + { exists: boolean } | pass | 42ms | |
| ✅ | GET /api/session/check for poolplayers.com → exists field present | pass | 8ms | |
| ✅ | DELETE /api/session with url → 200 + { cleared: boolean } | pass | 7ms | |
| ✅ | GET /api/site-credentials for unknown site → { found: false } | pass | 6ms | |
| ✅ | GET /api/site-credentials for poolplayers.com → { found: true, username: string } | pass | 5ms | |
| ✅ | [chaos] GET /api/session/check with no url → { exists: false } | pass | 6ms | |
| ✅ | [chaos] DELETE /api/session with no url → does not 500 | pass | 4ms | |
| ✅ | [chaos] GET /api/site-credentials with no url → does not 500 | pass | 6ms | |


