---
description: Split the current diff into logically coherent commits, and reorganize earlier commits on this branch when continuing work
---

## Task

$ARGUMENTS

## Flow

Follow these steps in order. This command is pre-authorized to create local commits (including
`git reset --soft` for reorganizing earlier commits) as part of its normal operation — no need to
ask for confirmation before those specific steps. This command does **not** push or open a PR; use
`/pr` for that once the work is committed. It also does not write code — use `/branch` first if you
need a new branch for the task.

1. **Verify state**
   - Run `git status`. If there are no staged or unstaged changes and nothing to reorganize, stop
     and tell the user there's nothing to commit.
   - If the current branch is `main`, stop and tell the user to run `/branch` first — this command
     assumes work is happening on a feature/fix/chore branch, not directly on `main`.

2. **Commit by logical change, not by file**
   - Review the full diff (`git diff`, `git status`).
   - Group the changes into logically coherent commits (one concern per commit — e.g. "add
     component", "wire up state", "update styles" — even if a group touches multiple files, and
     even if one file's changes get split across commits via `git add -p` when it mixes concerns).
     Avoid the trap of one commit per file when several files belong to the same concern.
   - Write a concise commit message per commit **in Korean**, describing *why*, following this
     repo's existing commit style, ending with:
     ```
     Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
     ```
   - Report back to the user what was committed and remind them to run `/pr` when ready to push
     and open a pull request.

3. **Reorganizing earlier commits when continuing work on the same branch**
   - If this task continues work on a branch from a previous `/commit` run and something committed
     earlier is now unnecessary or needs to change, don't just pile a new commit on top to undo
     or redo it — that leaves messy, confusing history.
   - Instead, run `git reset --soft <commit-before-the-ones-to-redo>` (find the target with
     `git log`, or use `git merge-base main HEAD` to unwind everything back to the branch point)
     to turn those commits back into staged changes, make the needed edits, then re-stage and
     re-commit following the grouping rules in step 2.
   - If none of the commits being reorganized have been pushed yet, proceed directly.
   - If any of them were already pushed (e.g. a previous `/commit` + `/pr` cycle on this branch),
     rewriting them means the next push will need `--force-with-lease`. Stop and ask the user for
     confirmation before force-pushing, per this repo's git safety rules.
