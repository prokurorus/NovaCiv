# START HERE — NovaCiv

## What is live (prod)
- PM2 processes: `nova-ops-agent`, `nova-video`
- Source of Truth: GitHub `main`
- VPS mode: pull-only

## What must NOT run on prod
- `nova-news-worker` (deploy separately when needed)

## Project memory
- Canonical state: `docs/PROJECT_STATE.md`
- Ops docs: `docs/OPS.md`, `docs/RUNBOOKS.md`
- Server snapshots: `/root/NovaCiv/_state/system_snapshot.{md,json}`

## First checks if something breaks
1) Get snapshot (via ops-agent: `snapshot`)
2) Check status (`report:status`)
3) Inspect PM2 logs (targeted)

## Rules
- Dirty repo on VPS = incident
- No manual edits on VPS (except `.env` / server configs)
