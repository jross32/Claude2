# Test Results — security-oidc_lab

**Status:** ✅ HEALTHY
**Run:** 2026-04-18T10:37:33.985Z
**Commit:** `eecf803`
**Duration:** 875ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 13 | 13 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | mock IdP starts and listens | pass | 43ms | |
| ✅ | exact-match redirect_uri is accepted | pass | 202ms | |
| ✅ | open redirect attempt is blocked | pass | 40ms | |
| ✅ | all 13 attack variants are blocked (no bypasses) | pass | 37ms | |
| ✅ | state values are unique across 50 requests | pass | 106ms | |
| ✅ | state entropy meets minimum threshold (>= 3.5 bits/char) | pass | 102ms | |
| ✅ | server echoes state parameter correctly | pass | 106ms | |
| ✅ | server issues a valid HS256 JWT | pass | 34ms | |
| ✅ | forged alg:none JWT is rejected (HTTP 401) | pass | 8ms | |
| ✅ | full suite: all three tests pass with risk score LOW | pass | 143ms | |
| ✅ | chaos: unknown client_id returns error, not bypass | pass | 30ms | |
| ✅ | chaos: wrong client_secret causes alg:none test to skip gracefully | pass | 4ms | |
| ✅ | chaos: unreachable server returns structured error, not crash | pass | 11ms | |


