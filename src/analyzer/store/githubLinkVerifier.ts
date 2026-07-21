/**
 * Confirma, contra a API real do GitHub, os `githubLinks` sem `verifiedAt`
 * gravados em memory.json (ex.: pelo outcome automático de
 * computeDelta.ts::computePredictionFeedback, que anexa o SHA 100% local
 * sem checar se o commit/PR realmente existe no remoto).
 *
 * Best-effort e sob demanda (nunca chamado de dentro da pipeline/computeDelta,
 * que são funções puras/offline) — via comando CLI `tic-analyzer verify-links`
 * ou um cron separado. Falhas de rede/token não quebram nada: a entrada
 * simplesmente continua sem `verifiedAt` até a próxima tentativa.
 */
import { loadMemory, updateMemoryEntry, type MemoryEntry, type GithubLink } from './memoryStore';
import type { GhClient } from '../github/ghClient';

export interface VerifyLinksResult {
  checked: number;
  verified: number;
  failed: number;
}

export async function verifyGithubLinks(ticCodeDir: string, client: GhClient): Promise<VerifyLinksResult> {
  const entries = loadMemory(ticCodeDir);
  const result: VerifyLinksResult = { checked: 0, verified: 0, failed: 0 };
  const cache = new Map<string, boolean>();

  for (const entry of entries) {
    const links = entry.githubLinks;
    if (!links?.length) continue;
    const unverified = links.filter((l) => !l.verifiedAt);
    if (unverified.length === 0) continue;

    let changed = false;
    for (const link of unverified) {
      result.checked++;
      const cacheKey = `${link.kind}::${link.repo}::${link.number ?? link.sha}`;
      let exists = cache.get(cacheKey);
      if (exists === undefined) {
        exists = await resolveExists(client, link);
        cache.set(cacheKey, exists);
      }
      if (exists) {
        link.verifiedAt = new Date().toISOString();
        result.verified++;
        changed = true;
      } else {
        result.failed++;
      }
    }
    if (changed) updateMemoryEntry(ticCodeDir, entry.id, { githubLinks: links });
  }

  return result;
}

async function resolveExists(client: GhClient, link: GithubLink): Promise<boolean> {
  try {
    if (link.kind === 'pr' && link.number !== undefined) return (await client.resolvePr(link.repo, link.number)) !== null;
    if (link.kind === 'issue' && link.number !== undefined) return (await client.resolveIssue(link.repo, link.number)) !== null;
    if (link.kind === 'commit' && link.sha) return (await client.resolveCommit(link.repo, link.sha)) !== null;
    return false;
  } catch {
    return false;
  }
}

// Reexport de conveniência para quem só quer o tipo sem importar memoryStore diretamente.
export type { MemoryEntry };
