# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-04-23T22:41:43.186Z
**Commit:** `e6327b9`
**Duration:** 5927ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 5 | 5 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | POST /api/schema with graphqlCalls → 200 + schema object | pass | 74ms | |
| ✅ | Schema response includes typescript or jsonSchema fields | pass | 5ms | |
| ✅ | [chaos] POST /api/schema with no graphqlCalls → 400 | pass | 4ms | |
| ✅ | [chaos] POST /api/schema with empty array → does not 500 | pass | 3ms | |
| ✅ | [chaos] POST /api/schema with malformed call → does not 500 | pass | 3ms | |


