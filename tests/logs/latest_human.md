# Test Results — security-pingfed_lab

**Status:** ✅ HEALTHY
**Run:** 2026-04-18T20:30:58.094Z
**Commit:** `dd72609`
**Duration:** 828ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 16 | 16 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | mock PingFederate starts | pass | 37ms | |
| ✅ | redirect_uri: all bypass variants blocked (PA_LEGACY_VENDOR) | pass | 265ms | |
| ✅ | redirect_uri: open redirect blocked on PA_ client | pass | 33ms | |
| ✅ | state_entropy: 50 unique states, entropy OK | pass | 102ms | |
| ✅ | alg_none: PingFed issues signed JWT (alg header RS256) | pass | 25ms | |
| ✅ | alg_none: forged token rejected by /idp/userinfo.openid | pass | 6ms | |
| ✅ | pkce: PA_VENDOR_PORTAL requires PKCE — no code_challenge rejected | pass | 10ms | |
| ✅ | pkce: PA_LEGACY_VENDOR has no PKCE (documented as upgrade target) | pass | 8ms | |
| ✅ | token_rotation: PingFed rotates refresh tokens correctly | pass | 11ms | |
| ✅ | bola_idor: PA_VENDOR_A cannot access PA_VENDOR_B report | pass | 9ms | |
| ✅ | scope_escalation: PA_LIMITED cannot escalate to vendor:reports | pass | 4ms | |
| ✅ | header_injection: /pa/protected rejects all X-PingAccess-* header injections | pass | 36ms | |
| ✅ | header_injection: /pa/misconfigured shows X-Authenticated-User bypass (vuln demo) | pass | 37ms | |
| ✅ | full suite (all 8 tests): risk score LOW against mock PingFed | pass | 198ms | |
| ✅ | chaos: non-PA_ client_id returns PingFed-format error | pass | 24ms | |
| ✅ | chaos: replayed refresh token triggers session invalidation | pass | 10ms | |


