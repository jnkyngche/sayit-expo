---
description: Push the current branch and open a PR from its committed changes
---

## Task

$ARGUMENTS

## Flow

This command is pre-authorized to push the current branch and open a PR as part of its normal
operation — no need to ask for confirmation before those specific steps, since opening a PR (not
merging) is the intended, reversible end state of this flow.

1. **Verify state**
   - Run `git status` and `git log main..HEAD --oneline` (fetching `origin/main` first if needed).
   - If there are no commits ahead of `main`, or there are uncommitted changes, stop and tell the
     user — this command expects work already committed on the current branch (e.g. via `/commit`).
   - If the current branch is `main` itself, stop and ask the user which branch to push instead.

2. **Push**
   - Push the branch: `git push -u origin <current-branch>`.

3. **Open the PR**
   - Open the PR with `gh pr create --base main --title "..." --body "..."`, where the title and
     body are written **in Korean** and generated from the actual diff/commits on the branch
     (summary + test plan, following the repo's PR conventions if any exist).
   - Report the PR URL back to the user as the final step.
