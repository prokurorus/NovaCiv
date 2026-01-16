# PROJECT_CONTEXT — NovaCiv (Canonical)

## Purpose
This file captures the stable, long-term operating context for NovaCiv:
- how the project should be managed
- what "clean ops" means
- what is allowed / forbidden in production
- how humans and ops-agent interact

This file is canonical and must be kept consistent with docs/PROJECT_STATE.md.

## Operating Principles
- Source of truth is GitHub `main`.
- VPS is pull-only. A dirty repo on VPS is an incident.
- No manual code edits on VPS (exception: `.env` and server configs only).
- Ops-agent must not expose secrets (tokens/keys) in outputs.
- Prefer "one big step" runbooks over ad-hoc manual commands.
- Changes happen via PRs; production changes are deployed by pull + targeted restart only.

## Interaction Style
- Keep responses short, structured, and actionable.
- Prefer checklists and single-pass runbooks.
- If uncertain, propose a read-only verification first.

## Memory Hierarchy
1) docs/START_HERE.md (entry point)
2) docs/PROJECT_STATE.md (canonical system state)
3) docs/PROJECT_CONTEXT.md (this file: canonical operating context)
4) /root/NovaCiv/_state/system_snapshot.{md,json} (runtime snapshots; non-canonical)

## Safety Baseline
- Never print env values.
- Never print tokens, keys, cookies, auth headers.
- Sanitize outputs consistently.

## Project File Access
### Baseline access (all collaborators)
- Read access to all files in this repository.
- No direct edits on production servers; changes flow via PRs to GitHub `main`.

### Elevated access (maintainers/ops)
- Write access to code and infrastructure files when needed.
- Production changes require PR review and pull-only deploy flow.

### Restricted access (ops/owners only)
- Secret-bearing files and configs (e.g., `.env`, credentials, tokens).
- Deployment and server-only configs when they include sensitive values.
