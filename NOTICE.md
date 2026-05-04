# TIC Coder Lite Notice

## Reversa

Reversa original copyright:

MIT License

Copyright (c) 2026 Sandeco

TIC Coder Lite includes and adapts the Reversa engine by Sandeco (MIT License) as its embedded reverse engineering motor.

### Components incorporated/adapted:

- **agents/** — Complete SKILL.md files for all Reversa agents (Scout, Archaeologist, Detective, Architect, Writer, Reviewer, Data Master, Visor, Reconstructor, Design System)
- **docs/agents/** — Agent documentation in PT/EN/ES
- **templates/** — SDD template and structural templates
- **lib/** — Engine manifest and configuration schemas
- **Confidence scale methodology** — 🟢 CONFIRMADO / 🟡 INFERIDO / 🔴 LACUNA
- **SDD generation pipeline** — Scout → Archaeologist → Detective → Architect → Writer → Reviewer → Data Master
- **Agent operational contracts** — Specs as operational contracts concept

### Path adaptations:

| Reversa Original | TIC Coder Lite |
| --- | --- |
| `.reversa/` | `.tic-code/reversa/` |
| `_reversa_sdd/` | `.tic-code/reverse-engineering/` |
| `/reversa` (slash command) | "TIC Coder Lite: Analisar Workspace" |
| `npx reversa install` | Install TIC Coder Lite extension |
| Reversa CLI | TIC Coder Lite VS Code Extension |

### What is NOT included:

- Reversa CLI runner (`bin/reversa.js`)
- Installation/update/uninstall flows
- `.reversa/` as direct workspace output
- `_reversa_sdd/` as output folder name
- External downloads
- Database connections
- SQL execution

TIC Coder Lite is a separate VS Code extension. The Reversa engine is used as an embedded methodology and asset base.

## InsightGraph

InsightGraph was used as an internal reference for concepts such as:

- local scan/analyze flow
- in-memory graph context
- impact graph ideas
- deterministic risk/fragility ideas
- Ollama URL/model fallback concepts

InsightGraph is not bundled as a runtime dependency of TIC Coder Lite.

## TIC Coder Lite

TIC Coder Lite by TIC / Leonardo Forbici.

TIC Coder Lite remains a separate VS Code extension focused on:

- Lite Mode: deterministic local scan without AI
- Standard AI Mode: export context for common AI coding tools
- Local AI Mode: optional Ollama enhancement
