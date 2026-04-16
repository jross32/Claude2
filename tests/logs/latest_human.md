# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-04-16T10:08:53.776Z
**Commit:** `8d3051d`
**Duration:** 3002ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 5 | 5 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | POST /api/schema with graphqlCalls → 200 + schema object | pass | 50ms | |
| ✅ | Schema response includes typescript or jsonSchema fields | pass | 12ms | |
| ✅ | [chaos] POST /api/schema with no graphqlCalls → 400 | pass | 3ms | |
| ✅ | [chaos] POST /api/schema with empty array → does not 500 | pass | 3ms | |
| ✅ | [chaos] POST /api/schema with malformed call → does not 500 | pass | 3ms | |


