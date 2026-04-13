# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-04-13T22:28:04.217Z
**Commit:** `7b4408e`
**Duration:** 2668ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 5 | 5 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | POST /api/schema with graphqlCalls → 200 + schema object | pass | 48ms | |
| ✅ | Schema response includes typescript or jsonSchema fields | pass | 5ms | |
| ✅ | [chaos] POST /api/schema with no graphqlCalls → 400 | pass | 5ms | |
| ✅ | [chaos] POST /api/schema with empty array → does not 500 | pass | 8ms | |
| ✅ | [chaos] POST /api/schema with malformed call → does not 500 | pass | 4ms | |


