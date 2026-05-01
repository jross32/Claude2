# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-05-01T14:31:01.657Z
**Commit:** `16ff40f`
**Duration:** 7718ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 5 | 5 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | POST /api/schema with graphqlCalls → 200 + schema object | pass | 75ms | |
| ✅ | Schema response includes typescript or jsonSchema fields | pass | 9ms | |
| ✅ | [chaos] POST /api/schema with no graphqlCalls → 400 | pass | 6ms | |
| ✅ | [chaos] POST /api/schema with empty array → does not 500 | pass | 6ms | |
| ✅ | [chaos] POST /api/schema with malformed call → does not 500 | pass | 6ms | |


