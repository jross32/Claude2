# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-04-16T10:16:25.564Z
**Commit:** `7ae76c8`
**Duration:** 2584ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 5 | 5 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | POST /api/schema with graphqlCalls → 200 + schema object | pass | 53ms | |
| ✅ | Schema response includes typescript or jsonSchema fields | pass | 6ms | |
| ✅ | [chaos] POST /api/schema with no graphqlCalls → 400 | pass | 4ms | |
| ✅ | [chaos] POST /api/schema with empty array → does not 500 | pass | 4ms | |
| ✅ | [chaos] POST /api/schema with malformed call → does not 500 | pass | 3ms | |


