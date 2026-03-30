Commit and push all current changes using the autosave script.

Commit message to use: $ARGUMENTS
(If $ARGUMENTS is empty, the script will use an auto-generated timestamp message.)

Run: `node autosave.js "$ARGUMENTS"`

Then show:
- The list of files that were staged and committed
- The commit message that was used
- Confirmation that the push succeeded, or the full error if it failed
