Add a regression test for this bug: $ARGUMENTS

If $ARGUMENTS is empty — ask: "What bug are you adding a regression test for? Describe what was broken and what the fix was."

Once you have the description:
1. Create a descriptively named test file in `tests/regression/`
   - Format: `[what-was-broken].test.js` (e.g. `data-href-links-not-captured.test.js`)
2. Write a comment block at the top describing the original bug and when it was fixed.
3. Write the test to:
   a. Reproduce the original failure condition
   b. Verify it now passes correctly
4. Run the test immediately.
5. Output results to `tests/logs/`.
6. If the test itself fails — something may still be broken. Report it clearly and dig in.
