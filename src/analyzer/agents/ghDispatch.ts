/**
 * Lado impuro do dispatcher — fala com o GitHub de verdade via GhClient
 * (Fase 0.2). Recebe a decisão já tomada por `decideDispatch` (puro) e o
 * corpo do brief já montado pelo caller (reaproveitando `buildAgentBrief`/
 * `buildDiagnosis` de mcp/agentBrief.ts — este módulo não abre o index.db).
 *
 * Self-healing nunca auto-mergeia: só cria issue/PR. O gate humano/CI
 * continua obrigatório — ver action.yml e o workflow self-heal.yml.
 */
import type { GhClient } from '../github/ghClient';
import type { AgentTriggerConfig } from '../triggers/evaluateTriggers';
import type { DispatchDecision } from './dispatcher';
import { appendDispatchRecord, type DispatchRecord } from '../store/dispatchLog';

export interface DispatchToGithubOptions {
  repo: string;
  brief: string;
  /** Branch base para create-pr-with-copilot (default 'main'). */
  base?: string;
}

export async function dispatchToGithub(
  ticCodeDir: string,
  client: GhClient,
  decision: DispatchDecision,
  config: AgentTriggerConfig,
  options: DispatchToGithubOptions
): Promise<DispatchRecord> {
  const trigger = decision.match.event.type;
  const title = `[TIC] ${decision.match.event.title}`;

  if (!decision.shouldDispatch) {
    return appendDispatchRecord(ticCodeDir, {
      entity: decision.entity, trigger, repo: options.repo, mode: config.mode, status: 'skipped', reason: decision.reason
    });
  }

  try {
    const existing = await client.findOpenIssueByTitle(options.repo, title);
    const issue = existing ?? await client.createIssue(options.repo, title, options.brief, ['bug', 'needs-triage']);

    if (config.mode === 'issue-only') {
      return appendDispatchRecord(ticCodeDir, {
        entity: decision.entity, trigger, repo: options.repo, mode: config.mode,
        issueNumber: issue.number, status: 'dispatched', reason: 'issue criada (modo issue-only)'
      });
    }

    if (config.mode === 'assign-copilot') {
      try {
        await client.assignCopilot(options.repo, issue.number!);
        return appendDispatchRecord(ticCodeDir, {
          entity: decision.entity, trigger, repo: options.repo, mode: config.mode,
          issueNumber: issue.number, status: 'dispatched', reason: 'Copilot atribuído à issue'
        });
      } catch (err) {
        // Fallback automático: sem permissão para atribuir Copilot, fica no issue-only.
        return appendDispatchRecord(ticCodeDir, {
          entity: decision.entity, trigger, repo: options.repo, mode: 'issue-only',
          issueNumber: issue.number, status: 'dispatched',
          reason: `assign-copilot falhou (${(err as Error).message}) — caiu para issue-only`
        });
      }
    }

    // create-pr-with-copilot
    try {
      const pr = await client.createPrWithCopilot(options.repo, {
        title, body: options.brief, base: options.base ?? 'main', problemStatement: options.brief
      });
      return appendDispatchRecord(ticCodeDir, {
        entity: decision.entity, trigger, repo: options.repo, mode: config.mode,
        issueNumber: issue.number, prNumber: pr.number, status: 'dispatched', reason: 'PR criado via Copilot coding agent'
      });
    } catch (err) {
      // Fallback automático: Copilot coding agent indisponível → tenta assign-copilot na issue.
      try {
        await client.assignCopilot(options.repo, issue.number!);
        return appendDispatchRecord(ticCodeDir, {
          entity: decision.entity, trigger, repo: options.repo, mode: 'assign-copilot',
          issueNumber: issue.number, status: 'dispatched',
          reason: `create-pr-with-copilot falhou (${(err as Error).message}) — caiu para assign-copilot`
        });
      } catch (err2) {
        return appendDispatchRecord(ticCodeDir, {
          entity: decision.entity, trigger, repo: options.repo, mode: 'issue-only',
          issueNumber: issue.number, status: 'dispatched',
          reason: `create-pr-with-copilot e assign-copilot falharam — caiu para issue-only (${(err2 as Error).message})`
        });
      }
    }
  } catch (err) {
    return appendDispatchRecord(ticCodeDir, {
      entity: decision.entity, trigger, repo: options.repo, mode: config.mode,
      status: 'failed', reason: (err as Error).message
    });
  }
}
