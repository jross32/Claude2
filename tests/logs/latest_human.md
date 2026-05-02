# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-05-02T06:40:47.060Z
**Commit:** `355d893`
**Duration:** 8314ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 5 | 5 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | POST /api/schema with graphqlCalls → 200 + schema object | pass | 65ms | |
| ✅ | Schema response includes typescript or jsonSchema fields | pass | 7ms | |
| ✅ | [chaos] POST /api/schema with no graphqlCalls → 400 | pass | 4ms | |
| ✅ | [chaos] POST /api/schema with empty array → does not 500 | pass | 5ms | |
| ✅ | [chaos] POST /api/schema with malformed call → does not 500 | pass | 5ms | |


