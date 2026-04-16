# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-04-16T11:02:50.676Z
**Commit:** `060c823`
**Duration:** 4358ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 5 | 5 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | POST /api/schema with graphqlCalls → 200 + schema object | pass | 61ms | |
| ✅ | Schema response includes typescript or jsonSchema fields | pass | 14ms | |
| ✅ | [chaos] POST /api/schema with no graphqlCalls → 400 | pass | 6ms | |
| ✅ | [chaos] POST /api/schema with empty array → does not 500 | pass | 5ms | |
| ✅ | [chaos] POST /api/schema with malformed call → does not 500 | pass | 4ms | |


