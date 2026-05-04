# How to use

## Activate Reversa

After installing, open the project in your AI agent and activate Reversa:

=== "Claude Code / Cursor / Gemini CLI"

    ```
    /reversa
    ```

=== "Codex and engines without slash commands"

    ```
    reversa
    ```

That's it. Reversa takes control and coordinates the entire analysis from there.

---

## What happens when you activate

Reversa checks whether an analysis is already in progress:

**First time:** it creates a personalized exploration plan for your project, presents it to you for approval, and starts the analysis at phase 1.

**Resumed session:** it reads the checkpoint saved in `.reversa/state.json` and continues exactly where it left off. It doesn't matter if you closed the editor, restarted your machine, or left it sleeping for three days.

---

## Typical flow of a complete analysis

```
You type /reversa
        ↓
Reversa creates the exploration plan
        ↓
You review and approve the plan
        ↓
Scout maps the project surface
        ↓
Reversa presents the Scout summary and you choose the documentation level
        ↓
Archaeologist analyzes module by module
        ↓
Detective and Architect interpret what was found
        ↓
Writer generates specifications (one at a time, with your approval)
        ↓
Reviewer reviews everything and raises validation questions
        ↓
Specifications ready in _reversa_sdd/
```

The process is incremental and conversational. You don't need to be present all the time: Reversa notifies you when it needs you.

---

## How long does it take?

Depends on project size, but a general rule:

| Project size | Estimate |
|--------------|----------|
| Small (< 10 modules) | 2 to 4 sessions |
| Medium (10 to 30 modules) | 5 to 10 sessions |
| Large (30+ modules) | 10+ sessions |

The Archaeologist analyzes one module per session on purpose, to conserve context. For large projects, you'll resume several times, but each resume is automatic and lossless.

---

## Tip: context overflow

If the session gets too long and context starts running out, Reversa saves the checkpoint automatically and warns you:

> "I'll pause here. Everything is saved. Type `/reversa` in a new session to continue."

No drama. No loss. Just continue later.

---

## Documentation level

After the Scout finishes, Reversa presents a summary of what it found (number of modules, integrations, whether a database is present) and asks which volume of documentation you want for the project:

| Level | When to use | What it generates |
|-------|-------------|-------------------|
| **Essential** | Simple projects, scripts, prototypes | Core artifacts: code analysis, domain, architecture, SDD specs |
| **Complete** | Medium projects, small teams (default) | Everything in essential + C4 diagrams, ERD, ADRs, OpenAPI, user stories and traceability matrices |
| **Detailed** | Enterprise systems, multiple teams | Everything in complete + per-function flowcharts, expanded ADRs, deployment diagram and mandatory cross-review |

The choice is saved in `.reversa/state.json` and all subsequent agents respect it automatically. If you need to adjust it after the analysis has started, just edit the `doc_level` field in that file.

---

## Activating a specific agent manually

If you want to run an agent standalone, without going through the orchestrator:

```
/reversa-scout
/reversa-detective
/reversa-data-master
```

Useful when you already have an analysis in progress and want to run a specific agent for a particular reason.
