# Test Results — security-pingfed_lab

**Status:** ✅ HEALTHY
**Run:** 2026-05-01T19:15:31.341Z
**Commit:** `18b95fc`
**Duration:** 795ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 16 | 16 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | mock PingFederate starts | pass | 35ms | |
| ✅ | redirect_uri: all bypass variants blocked (PA_LEGACY_VENDOR) | pass | 186ms | |
| ✅ | redirect_uri: open redirect blocked on PA_ client | pass | 31ms | |
| ✅ | state_entropy: 50 unique states, entropy OK | pass | 137ms | |
| ✅ | alg_none: PingFed issues signed JWT (alg header RS256) | pass | 32ms | |
| ✅ | alg_none: forged token rejected by /idp/userinfo.openid | pass | 7ms | |
| ✅ | pkce: PA_VENDOR_PORTAL requires PKCE — no code_challenge rejected | pass | 10ms | |
| ✅ | pkce: PA_LEGACY_VENDOR has no PKCE (documented as upgrade target) | pass | 8ms | |
| ✅ | token_rotation: PingFed rotates refresh tokens correctly | pass | 11ms | |
| ✅ | bola_idor: PA_VENDOR_A cannot access PA_VENDOR_B report | pass | 10ms | |
| ✅ | scope_escalation: PA_LIMITED cannot escalate to vendor:reports | pass | 5ms | |
| ✅ | header_injection: /pa/protected rejects all X-PingAccess-* header injections | pass | 42ms | |
| ✅ | header_injection: /pa/misconfigured shows X-Authenticated-User bypass (vuln demo) | pass | 43ms | |
| ✅ | full suite (all 8 tests): risk score LOW against mock PingFed | pass | 195ms | |
| ✅ | chaos: non-PA_ client_id returns PingFed-format error | pass | 23ms | |
| ✅ | chaos: replayed refresh token triggers session invalidation | pass | 7ms | |


