# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-05-01T19:19:15.140Z
**Commit:** `549fc03`
**Duration:** 8265ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 5 | 5 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | POST /api/schema with graphqlCalls → 200 + schema object | pass | 77ms | |
| ✅ | Schema response includes typescript or jsonSchema fields | pass | 10ms | |
| ✅ | [chaos] POST /api/schema with no graphqlCalls → 400 | pass | 7ms | |
| ✅ | [chaos] POST /api/schema with empty array → does not 500 | pass | 4ms | |
| ✅ | [chaos] POST /api/schema with malformed call → does not 500 | pass | 4ms | |


