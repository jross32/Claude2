# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-04-15T08:15:14.267Z
**Commit:** `96f9de3`
**Duration:** 6801ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 5 | 5 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | POST /api/schema with graphqlCalls → 200 + schema object | pass | 53ms | |
| ✅ | Schema response includes typescript or jsonSchema fields | pass | 29ms | |
| ✅ | [chaos] POST /api/schema with no graphqlCalls → 400 | pass | 5ms | |
| ✅ | [chaos] POST /api/schema with empty array → does not 500 | pass | 5ms | |
| ✅ | [chaos] POST /api/schema with malformed call → does not 500 | pass | 3ms | |


