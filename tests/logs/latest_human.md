# Test Results — security-pingfed_lab

**Status:** ✅ HEALTHY
**Run:** 2026-05-01T14:34:33.849Z
**Commit:** `25c6f1a`
**Duration:** 840ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 16 | 16 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | mock PingFederate starts | pass | 33ms | |
| ✅ | redirect_uri: all bypass variants blocked (PA_LEGACY_VENDOR) | pass | 200ms | |
| ✅ | redirect_uri: open redirect blocked on PA_ client | pass | 86ms | |
| ✅ | state_entropy: 50 unique states, entropy OK | pass | 122ms | |
| ✅ | alg_none: PingFed issues signed JWT (alg header RS256) | pass | 27ms | |
| ✅ | alg_none: forged token rejected by /idp/userinfo.openid | pass | 7ms | |
| ✅ | pkce: PA_VENDOR_PORTAL requires PKCE — no code_challenge rejected | pass | 10ms | |
| ✅ | pkce: PA_LEGACY_VENDOR has no PKCE (documented as upgrade target) | pass | 13ms | |
| ✅ | token_rotation: PingFed rotates refresh tokens correctly | pass | 14ms | |
| ✅ | bola_idor: PA_VENDOR_A cannot access PA_VENDOR_B report | pass | 12ms | |
| ✅ | scope_escalation: PA_LIMITED cannot escalate to vendor:reports | pass | 6ms | |
| ✅ | header_injection: /pa/protected rejects all X-PingAccess-* header injections | pass | 34ms | |
| ✅ | header_injection: /pa/misconfigured shows X-Authenticated-User bypass (vuln demo) | pass | 34ms | |
| ✅ | full suite (all 8 tests): risk score LOW against mock PingFed | pass | 189ms | |
| ✅ | chaos: non-PA_ client_id returns PingFed-format error | pass | 31ms | |
| ✅ | chaos: replayed refresh token triggers session invalidation | pass | 10ms | |


