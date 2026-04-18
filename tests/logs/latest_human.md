# Test Results — security-oidc_lab

**Status:** ✅ HEALTHY
**Run:** 2026-04-18T19:53:52.312Z
**Commit:** `f6b37b3`
**Duration:** 917ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 25 | 25 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | mock IdP starts and listens | pass | 38ms | |
| ✅ | redirect_uri: exact match accepted | pass | 193ms | |
| ✅ | redirect_uri: all 13 attack variants blocked | pass | 35ms | |
| ✅ | state_entropy: 50 unique values, entropy >= 3.5 | pass | 150ms | |
| ✅ | state_entropy: server echoes state correctly | pass | 98ms | |
| ✅ | alg_none: server issues HS256 JWT | pass | 27ms | |
| ✅ | alg_none: forged token rejected (HTTP 401) | pass | 6ms | |
| ✅ | pkce: PKCE-required client rejects request without code_challenge | pass | 11ms | |
| ✅ | pkce: PKCE client accepts request with valid S256 challenge | pass | 7ms | |
| ✅ | token_rotation: refresh token rotates on use | pass | 11ms | |
| ✅ | token_rotation: replayed refresh token is rejected | pass | 11ms | |
| ✅ | bola_idor: vendor-a can access own resource | pass | 8ms | |
| ✅ | bola_idor: vendor-a cannot access vendor-b resource | pass | 8ms | |
| ✅ | scope_escalation: server strips unregistered scopes | pass | 4ms | |
| ✅ | scope_escalation: legitimate scopes are still granted | pass | 4ms | |
| ✅ | header_injection: secure endpoint rejects all injection headers | pass | 35ms | |
| ✅ | header_injection: vulnerable endpoint demonstrates bypass (X-Authenticated-User) | pass | 32ms | |
| ✅ | tls_fingerprint: chrome-115 comparison runs without error | pass | 3ms | |
| ✅ | tls_fingerprint: firefox-117 comparison runs without error | pass | 1ms | |
| ✅ | tls_fingerprint: config snippet is generated | pass | 0ms | |
| ✅ | tls_fingerprint: unknown profile returns error gracefully | pass | 0ms | |
| ✅ | full suite: riskScore LOW when all tests pass | pass | 184ms | |
| ✅ | chaos: unknown client returns error, no bypass | pass | 22ms | |
| ✅ | chaos: wrong secret causes token tests to skip gracefully | pass | 8ms | |
| ✅ | chaos: unreachable server returns structured result, no crash | pass | 7ms | |


