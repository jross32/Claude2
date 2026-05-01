# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-05-01T19:16:35.328Z
**Commit:** `62a9639`
**Duration:** 8536ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 5 | 5 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | POST /api/schema with graphqlCalls → 200 + schema object | pass | 91ms | |
| ✅ | Schema response includes typescript or jsonSchema fields | pass | 11ms | |
| ✅ | [chaos] POST /api/schema with no graphqlCalls → 400 | pass | 6ms | |
| ✅ | [chaos] POST /api/schema with empty array → does not 500 | pass | 5ms | |
| ✅ | [chaos] POST /api/schema with malformed call → does not 500 | pass | 5ms | |


