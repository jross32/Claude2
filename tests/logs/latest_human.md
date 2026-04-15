# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-04-15T21:01:00.317Z
**Commit:** `6b87f78`
**Duration:** 6242ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 5 | 5 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | POST /api/schema with graphqlCalls → 200 + schema object | pass | 82ms | |
| ✅ | Schema response includes typescript or jsonSchema fields | pass | 7ms | |
| ✅ | [chaos] POST /api/schema with no graphqlCalls → 400 | pass | 5ms | |
| ✅ | [chaos] POST /api/schema with empty array → does not 500 | pass | 4ms | |
| ✅ | [chaos] POST /api/schema with malformed call → does not 500 | pass | 4ms | |


