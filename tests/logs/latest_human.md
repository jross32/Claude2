# Test Results — unit

**Status:** ✅ HEALTHY
**Run:** 2026-04-13T21:57:40.840Z
**Commit:** `0c3827b`
**Duration:** 19ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 12 | 12 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | inferSchema returns object with jsonSchema and typescript | pass | 3ms | |
| ✅ | jsonSchema has $schema and definitions | pass | 1ms | |
| ✅ | typescript field is a non-empty string | pass | 0ms | |
| ✅ | definitions contains an entry for each valid call | pass | 0ms | |
| ✅ | typescript output contains interface or type keyword | pass | 0ms | |
| ✅ | inferred schema for user object is object type at top level | pass | 0ms | |
| ✅ | works with a single GraphQL call | pass | 0ms | |
| ✅ | [chaos] null input → jsonSchema null + fallback typescript string | pass | 0ms | |
| ✅ | [chaos] empty array → jsonSchema null + fallback string | pass | 1ms | |
| ✅ | [chaos] call with no response body → gracefully skipped | pass | 0ms | |
| ✅ | [chaos] call with null response data → gracefully handled | pass | 1ms | |
| ✅ | [chaos] malformed body string → operation name falls back gracefully | pass | 0ms | |


