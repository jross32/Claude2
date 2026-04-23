# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-04-23T22:38:05.690Z
**Commit:** `c184952`
**Duration:** 3638ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 5 | 5 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | POST /api/schema with graphqlCalls → 200 + schema object | pass | 30ms | |
| ✅ | Schema response includes typescript or jsonSchema fields | pass | 4ms | |
| ✅ | [chaos] POST /api/schema with no graphqlCalls → 400 | pass | 5ms | |
| ✅ | [chaos] POST /api/schema with empty array → does not 500 | pass | 4ms | |
| ✅ | [chaos] POST /api/schema with malformed call → does not 500 | pass | 3ms | |


