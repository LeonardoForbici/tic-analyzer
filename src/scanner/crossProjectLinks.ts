/**
 * crossProjectLinks.ts
 *
 * Cruza frontend-api-index com backend-endpoint-index para gerar links entre projetos.
 * Análise estática 100% local — nenhuma execução ou request HTTP.
 */
import type { FrontendApiIndex } from './frontendApiIndex';
import type { BackendEndpoint, BackendEndpointIndex } from './backendEndpointIndex';
import type { BackendDatabaseIndex } from './backendDatabaseIndex';

export type CrossLinkConfidence = 'CONFIRMED' | 'INFERRED' | 'GAP';

export interface CrossProjectLink {
  fromProjectId: string;
  toProjectId: string;
  fromFile: string;
  toFile?: string;
  type: 'FRONTEND_CALLS_BACKEND' | 'BACKEND_USES_DATABASE' | 'SCREEN_IMPACTS_FILE';
  method: string;
  endpoint: string;
  confidence: CrossLinkConfidence;
  evidence: string[];
}

export interface CrossProjectGap {
  fromProjectId: string;
  fromFile: string;
  method: string;
  endpoint: string;
  reason: string;
}

export interface CrossProjectLinksResult {
  generatedAt: string;
  links: CrossProjectLink[];
  gaps: CrossProjectGap[];
  stats: {
    totalLinks: number;
    confirmedLinks: number;
    inferredLinks: number;
    gapLinks: number;
    frontendToBackend: number;
    backendToDatabase: number;
  };
}

/**
 * Matches frontend API calls to backend endpoints.
 * Returns CONFIRMED when path matches exactly, INFERRED when normalized match, GAP otherwise.
 */
export function buildCrossProjectLinks(
  frontendIndexes: FrontendApiIndex[],
  backendIndexes: BackendEndpointIndex[],
  backendDbIndexes: BackendDatabaseIndex[]
): CrossProjectLinksResult {
  const links: CrossProjectLink[] = [];
  const gaps: CrossProjectGap[] = [];

  // Build endpoint lookup map (normalized path → endpoint)
  const endpointMap = new Map<string, BackendEndpoint & { projectId: string }>();
  for (const idx of backendIndexes) {
    for (const ep of idx.endpoints) {
      const key = normalizeEndpointKey(ep.httpMethod, ep.fullPath);
      endpointMap.set(key, { ...ep, projectId: idx.projectId });
    }
  }

  // Match frontend calls to backend endpoints
  for (const frontendIdx of frontendIndexes) {
    for (const call of frontendIdx.calls) {
      const exactKey = normalizeEndpointKey(call.method, call.path);
      const exactMatch = endpointMap.get(exactKey);

      if (exactMatch) {
        links.push({
          fromProjectId: frontendIdx.projectId,
          toProjectId: exactMatch.projectId,
          fromFile: call.file,
          toFile: exactMatch.controllerFile,
          type: 'FRONTEND_CALLS_BACKEND',
          method: call.method,
          endpoint: call.path,
          confidence: 'CONFIRMED',
          evidence: [
            ...call.evidence,
            ...exactMatch.evidence
          ].slice(0, 4)
        });
        continue;
      }

      // Try normalized/pattern match (strip path params)
      const normalizedCallPath = normalizePathParams(call.path);
      let inferredMatch: (BackendEndpoint & { projectId: string }) | undefined;
      let inferredScore = 0;

      for (const [, ep] of endpointMap) {
        if (ep.httpMethod !== call.method && ep.httpMethod !== 'ANY') continue;
        const normalizedEpPath = normalizePathParams(ep.fullPath);
        const score = pathSimilarity(normalizedCallPath, normalizedEpPath);
        if (score > inferredScore && score > 0.7) {
          inferredScore = score;
          inferredMatch = ep;
        }
      }

      if (inferredMatch) {
        links.push({
          fromProjectId: frontendIdx.projectId,
          toProjectId: inferredMatch.projectId,
          fromFile: call.file,
          toFile: inferredMatch.controllerFile,
          type: 'FRONTEND_CALLS_BACKEND',
          method: call.method,
          endpoint: call.path,
          confidence: 'INFERRED',
          evidence: [
            `frontend: ${call.evidence[0] ?? call.path}`,
            `backend inferred: ${inferredMatch.fullPath}`
          ]
        });
        continue;
      }

      // No match found — record as GAP
      if (backendIndexes.some((b) => b.endpoints.length > 0)) {
        gaps.push({
          fromProjectId: frontendIdx.projectId,
          fromFile: call.file,
          method: call.method,
          endpoint: call.path,
          reason: 'GAP: endpoint chamado no frontend mas não encontrado no backend.'
        });
      }
    }
  }

  // Backend → Database links
  for (const dbIdx of backendDbIndexes) {
    for (const link of dbIdx.links) {
      links.push({
        fromProjectId: dbIdx.projectId,
        toProjectId: 'database',
        fromFile: link.fromFile,
        toFile: link.toFile,
        type: 'BACKEND_USES_DATABASE',
        method: link.type,
        endpoint: link.table ?? link.sqlObject ?? '',
        confidence: link.confidence,
        evidence: link.evidence
      });
    }
  }

  const confirmed = links.filter((l) => l.confidence === 'CONFIRMED').length;
  const inferred = links.filter((l) => l.confidence === 'INFERRED').length;
  const gapCount = gaps.length;
  const f2b = links.filter((l) => l.type === 'FRONTEND_CALLS_BACKEND').length;
  const b2d = links.filter((l) => l.type === 'BACKEND_USES_DATABASE').length;

  return {
    generatedAt: new Date().toISOString(),
    links,
    gaps,
    stats: {
      totalLinks: links.length,
      confirmedLinks: confirmed,
      inferredLinks: inferred,
      gapLinks: gapCount,
      frontendToBackend: f2b,
      backendToDatabase: b2d
    }
  };
}

/** Generate markdown traceability report */
export function buildCrossProjectLinksMd(result: CrossProjectLinksResult): string {
  const f2bLinks = result.links.filter((l) => l.type === 'FRONTEND_CALLS_BACKEND');
  const b2dLinks = result.links.filter((l) => l.type === 'BACKEND_USES_DATABASE');

  const f2bRows = f2bLinks.map((l) =>
    `| ${l.fromProjectId} | ${esc(l.fromFile)} | ${l.method} ${esc(l.endpoint)} | ${l.toProjectId} | ${esc(l.toFile ?? 'N/A')} | ${l.confidence} | ${esc(l.evidence.join(' / '))} |`
  ).join('\n');

  const noF2bMsg = result.gaps.length > 0
    ? `> 🔴 GAP: ${result.gaps.length} chamada(s) de frontend sem endpoint backend correspondente. Ver seção Lacunas.`
    : `> 🔴 GAP: Nenhum projeto frontend detectado ou nenhuma chamada HTTP encontrada. Verifique se o frontend está no workspace e usa padrões reconhecidos (axios, fetch, HttpClient).`;

  const b2dRows = b2dLinks.map((l) =>
    `| ${esc(l.fromFile)} | ${esc(l.method)} | ${esc(l.endpoint)} | ${l.confidence} | ${esc(l.evidence.join(' / '))} |`
  ).join('\n');

  const gapRows = result.gaps.map((g) =>
    `- **${g.method} ${esc(g.endpoint)}** em \`${esc(g.fromFile)}\` — ${g.reason}`
  ).join('\n');

  return `# Pontes entre Projetos

> Gerado em: ${result.generatedAt}
> Total de links: ${result.stats.totalLinks} | CONFIRMADO: ${result.stats.confirmedLinks} | INFERIDO: ${result.stats.inferredLinks} | LACUNA: ${result.stats.gapLinks}

## Frontend → Backend

| Projeto Frontend | Arquivo Frontend | Método/Endpoint | Projeto Backend | Controller | Confiança | Evidência |
|---|---|---|---|---|---|---|
${f2bRows || noF2bMsg}

## Backend → Database

| Arquivo Backend | Tipo de Acesso | Tabela/Objeto | Confiança | Evidência |
|---|---|---|---|---|
${b2dRows || '| — | — | — | — | — |'}

## Lacunas

${gapRows || '- Nenhuma lacuna detectada.'}
`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeEndpointKey(method: string, endpointPath: string): string {
  return `${method.toUpperCase()}:${normalizePath(endpointPath)}`;
}

function normalizePath(p: string): string {
  // Replace path params {id}, :id with __PARAM__
  return p
    .replace(/\{[^}]+\}/g, '__PARAM__')
    .replace(/:[A-Za-z_]+/g, '__PARAM__')
    .replace(/\/+$/, '')
    .toLowerCase();
}

function normalizePathParams(p: string): string {
  return normalizePath(p);
}

/** Simple path similarity: segment intersection ratio */
function pathSimilarity(a: string, b: string): number {
  const segA = a.split('/').filter(Boolean);
  const segB = b.split('/').filter(Boolean);
  if (segA.length === 0 && segB.length === 0) return 1;
  const maxLen = Math.max(segA.length, segB.length);
  if (maxLen === 0) return 0;
  let matches = 0;
  for (let i = 0; i < Math.min(segA.length, segB.length); i++) {
    if (segA[i] === segB[i] || segA[i] === '__PARAM__' || segB[i] === '__PARAM__') {
      matches++;
    }
  }
  return matches / maxLen;
}

function esc(s: string): string {
  return s.replace(/\|/g, '\\|');
}
