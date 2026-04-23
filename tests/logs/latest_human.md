# Test Results — security-pingfed_lab

**Status:** ✅ HEALTHY
**Run:** 2026-04-23T22:41:10.719Z
**Commit:** `635904f`
**Duration:** 1267ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 16 | 16 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | mock PingFederate starts | pass | 36ms | |
| ✅ | redirect_uri: all bypass variants blocked (PA_LEGACY_VENDOR) | pass | 466ms | |
| ✅ | redirect_uri: open redirect blocked on PA_ client | pass | 54ms | |
| ✅ | state_entropy: 50 unique states, entropy OK | pass | 180ms | |
| ✅ | alg_none: PingFed issues signed JWT (alg header RS256) | pass | 34ms | |
| ✅ | alg_none: forged token rejected by /idp/userinfo.openid | pass | 5ms | |
| ✅ | pkce: PA_VENDOR_PORTAL requires PKCE — no code_challenge rejected | pass | 9ms | |
| ✅ | pkce: PA_LEGACY_VENDOR has no PKCE (documented as upgrade target) | pass | 10ms | |
| ✅ | token_rotation: PingFed rotates refresh tokens correctly | pass | 11ms | |
| ✅ | bola_idor: PA_VENDOR_A cannot access PA_VENDOR_B report | pass | 9ms | |
| ✅ | scope_escalation: PA_LIMITED cannot escalate to vendor:reports | pass | 4ms | |
| ✅ | header_injection: /pa/protected rejects all X-PingAccess-* header injections | pass | 42ms | |
| ✅ | header_injection: /pa/misconfigured shows X-Authenticated-User bypass (vuln demo) | pass | 48ms | |
| ✅ | full suite (all 8 tests): risk score LOW against mock PingFed | pass | 302ms | |
| ✅ | chaos: non-PA_ client_id returns PingFed-format error | pass | 28ms | |
| ✅ | chaos: replayed refresh token triggers session invalidation | pass | 18ms | |


