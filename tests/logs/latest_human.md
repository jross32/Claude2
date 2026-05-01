# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-05-01T15:34:56.806Z
**Commit:** `b27c3e5`
**Duration:** 7257ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 5 | 5 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | POST /api/schema with graphqlCalls → 200 + schema object | pass | 107ms | |
| ✅ | Schema response includes typescript or jsonSchema fields | pass | 11ms | |
| ✅ | [chaos] POST /api/schema with no graphqlCalls → 400 | pass | 7ms | |
| ✅ | [chaos] POST /api/schema with empty array → does not 500 | pass | 6ms | |
| ✅ | [chaos] POST /api/schema with malformed call → does not 500 | pass | 6ms | |


