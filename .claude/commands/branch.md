---
description: Create and check out a new branch for the given task, using this repo's branch prefix conventions
---

## Task

$ARGUMENTS

## Flow

This command is pre-authorized to create and check out local branches as part of its normal
operation — no need to ask for confirmation before that step.

1. **Check current state**
   - Run `git status`. If there are uncommitted changes, stop and ask the user how to proceed
     (e.g. commit or stash them first) rather than switching branches out from under them.

2. **Pick a branch prefix**
   - Based on what kind of change the task above actually is:
     - `feature/` — new functionality or user-facing behavior
     - `fix/` — bug fixes
     - `chore/` — tooling, config, dependency, or dev-environment changes (hooks, workflows,
       slash commands, lint config, etc.) that aren't a feature or a fix
     - `ci/` — changes scoped only to CI/CD pipeline files (e.g. `.github/workflows/**`)
   - If the task doesn't clearly fit one category, prefer `feature/` for anything user-facing and
     `chore/` otherwise.

3. **Create and check out the branch**
   - Fetch the latest `main` (`git fetch origin main`).
   - Create a branch named `<prefix>/<slug>` from `origin/main`, where `<slug>` is a short
     kebab-case description of the task derived from the text above (e.g. "add dark mode toggle"
     -> `feature/add-dark-mode-toggle`, "add lint hook" -> `chore/add-lint-hook`).
   - Check out the new branch.
   - Report the branch name back to the user. Remind them that once the code is written, `/commit`
     will split the changes into logical commits, and `/pr` will push and open the PR.
