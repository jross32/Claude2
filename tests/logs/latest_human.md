# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-05-01T19:27:11.046Z
**Commit:** `1ef2b7c`
**Duration:** 7830ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 5 | 5 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | POST /api/schema with graphqlCalls → 200 + schema object | pass | 71ms | |
| ✅ | Schema response includes typescript or jsonSchema fields | pass | 8ms | |
| ✅ | [chaos] POST /api/schema with no graphqlCalls → 400 | pass | 3ms | |
| ✅ | [chaos] POST /api/schema with empty array → does not 500 | pass | 4ms | |
| ✅ | [chaos] POST /api/schema with malformed call → does not 500 | pass | 4ms | |


