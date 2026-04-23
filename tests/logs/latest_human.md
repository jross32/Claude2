# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-04-23T22:42:05.079Z
**Commit:** `eca3e84`
**Duration:** 5929ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 8 | 8 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | GET /api/session/check with valid url → 200 + { exists: boolean } | pass | 96ms | |
| ✅ | GET /api/session/check for poolplayers.com → exists field present | pass | 54ms | |
| ✅ | DELETE /api/session with url → 200 + { cleared: boolean } | pass | 7ms | |
| ✅ | GET /api/site-credentials for unknown site → { found: false } | pass | 5ms | |
| ✅ | GET /api/site-credentials for poolplayers.com → { found: true, username: string } | pass | 4ms | |
| ✅ | [chaos] GET /api/session/check with no url → { exists: false } | pass | 4ms | |
| ✅ | [chaos] DELETE /api/session with no url → does not 500 | pass | 4ms | |
| ✅ | [chaos] GET /api/site-credentials with no url → does not 500 | pass | 4ms | |


