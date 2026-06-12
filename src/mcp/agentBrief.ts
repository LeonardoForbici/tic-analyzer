/**
 * Geradores das skills de engenharia (github.com/mattpocock/skills):
 *
 *  - buildAgentBrief  → template EXATO do AGENT-BRIEF.md da skill `triage`
 *                       (Category · Summary · Current behavior · Desired behavior ·
 *                        Key interfaces · Acceptance criteria · Out of scope)
 *  - buildDiagnosis   → as 6 fases da skill `diagnose` (feedback loop PRIMEIRO,
 *                       reproduce, 3–5 hipóteses falsificáveis, instrument 1-a-1,
 *                       fix+regression, cleanup+post-mortem)
 *
 * Tudo preenchido pelo grafo (index.db) — interfaces e comportamento, não
 * caminhos/linhas (princípio de durabilidade da skill).
 */
import * as fs from 'fs';
import * as path from 'path';
import type Database from 'better-sqlite3';
import { queryImpactOf, queryBlastRadius, resolveImpactId } from '../analyzer/store/impactQueries';
import { TRIAGE_DISCLAIMER } from '../analyzer/store/triageStore';
import type { OutOfScopeDecision } from '../analyzer/checkArchRules';

const shortId = (id: string) => id.slice(id.indexOf(':') + 1);

function symbolsOf(db: Database.Database, file: string): Array<{ kind: string; simple_name: string }> {
  return db.prepare('SELECT kind, simple_name FROM symbols WHERE file = ? LIMIT 12').all(file) as any[];
}

export interface BriefContext {
  category?: 'bug' | 'enhancement';
  summary?: string;
  detail?: string;
  outOfScope?: OutOfScopeDecision[];
}

/** AGENT-BRIEF fiel ao template da skill triage, preenchido pelo grafo. */
export function buildAgentBrief(db: Database.Database, ticCodeDir: string, entity: string, ctx: BriefContext = {}): string | null {
  const impact = queryImpactOf(db, entity);
  if (!impact) return null;
  const blast = queryBlastRadius(db, impact.entity, 10);

  const entityFile = impact.entity.startsWith('file:') ? impact.entity.slice(5) : null;
  const interfaces: string[] = [];
  if (entityFile) {
    for (const s of symbolsOf(db, entityFile)) {
      interfaces.push(`- \`${s.simple_name}\` (${s.kind}) — verifique se o contrato muda para os ${impact.totalVisited} dependentes`);
    }
  }
  const methodRows = entityFile
    ? (db.prepare('SELECT DISTINCT to_method FROM method_edges WHERE to_file = ? AND to_method IS NOT NULL LIMIT 8').all(entityFile) as any[])
    : [];
  for (const m of methodRows) {
    interfaces.push(`- \`${m.to_method}()\` — chamado por outros arquivos; assinatura/retorno não podem quebrar silenciosamente`);
  }
  if (interfaces.length === 0) {
    interfaces.push(`- \`${shortId(impact.entity)}\` — contrato observável pelos ${impact.totalVisited} dependentes (sem AST detalhado disponível)`);
  }

  // Acceptance criteria: derivados do blast radius (comportamento verificável)
  const criteria = (blast?.top ?? []).slice(0, 6).map(
    (t) => `- [ ] \`${shortId(t.id)}\` (${t.kind}) continua funcionando — depende de \`${shortId(impact.entity)}\``
  );
  criteria.push('- [ ] Análise do TIC não reporta riscos critical/high novos nem violações de regra novas');

  const outOfScope = (ctx.outOfScope ?? []).map((d) => `- ${d.decision}${d.reason ? ` (${d.reason})` : ''} _[decisão registrada: ${d.id}]_`);
  if (outOfScope.length === 0) outOfScope.push('- Refatorações adjacentes não listadas nos critérios acima');

  const modulesLine = Object.entries(impact.byModule).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([m, c]) => `${m} (${c})`).join(', ');

  return [
    TRIAGE_DISCLAIMER,
    '',
    '## Agent Brief',
    '',
    `**Category:** ${ctx.category ?? 'bug'}`,
    `**Summary:** ${ctx.summary ?? `Tratar mudança em \`${shortId(impact.entity)}\` sem quebrar os ${impact.totalVisited} dependentes cross-tier`}`,
    '',
    '**Current behavior:**',
    ctx.detail ?? `\`${shortId(impact.entity)}\` é usado por ${impact.totalVisited} entidades (${Object.entries(impact.byKind).map(([k, v]) => `${k}: ${v}`).join(', ')}).${modulesLine ? ` Módulos afetados: ${modulesLine}.` : ''}`,
    '',
    '**Desired behavior:**',
    'Após a mudança, todos os dependentes listados nos critérios continuam com o comportamento atual (mesmos contratos, mesmos efeitos no banco). Especifique aqui o NOVO comportamento esperado antes de entregar ao agente.',
    '',
    '**Key interfaces:**',
    ...interfaces,
    '',
    '**Acceptance criteria:**',
    ...criteria,
    '',
    '**Out of scope:**',
    ...outOfScope,
    '',
    `> Contexto adicional: \`get_blast_radius("${shortId(impact.entity)}")\` · \`get_impact_of("${shortId(impact.entity)}")\` · módulos em \`.tic-code/modules/<nome>/context.md\``,
    '> Em sessão interativa, faça as perguntas em aberto UMA DE CADA VEZ (regra da skill grill-with-docs).'
  ].join('\n');
}

/** Diagnose fiel às 6 fases da skill, com hipóteses vindas do grafo. */
export function buildDiagnosis(db: Database.Database, ticCodeDir: string, from: string, to?: string): string | null {
  const fromRes = resolveImpactId(db, from);
  if (!fromRes.id) return null;
  const toRes = to ? resolveImpactId(db, to) : { id: null as string | null, candidates: [] };

  // Caminho provável: BFS no grafo de impacto do destino até a origem (quem
  // depende de `to` inclui `from`? usa profundidade do impacto como trilha).
  const impact = queryImpactOf(db, toRes.id ?? fromRes.id, { maxNodes: 1500 });
  const pathNodes: Array<{ id: string; depth: number; confidence: string }> = [];
  if (impact) {
    const target = fromRes.id;
    const hit = impact.affected.find((n) => n.id === target);
    const maxDepth = hit?.depth ?? Math.min(4, Math.max(...impact.affected.map((n) => n.depth), 1));
    for (let d = 1; d <= maxDepth; d++) {
      const atDepth = impact.affected.filter((n) => n.depth === d);
      const pick = atDepth.find((n) => n.id === target) ?? atDepth[0];
      if (pick) pathNodes.push({ id: pick.id, depth: d, confidence: pick.confidence });
    }
  }

  // Suspeitos: nós do caminho ranqueados pelo score preditivo + arestas inferred
  const riskByFile = loadRiskMap(ticCodeDir);
  const suspects = pathNodes
    .map((n) => {
      const file = n.id.startsWith('file:') ? n.id.slice(5) : null;
      const risk = file ? riskByFile.get(file) : undefined;
      return { ...n, riskScore: risk?.score ?? 0, reasons: risk?.reasons ?? (n.confidence === 'inferred' ? ['resolução heurística (inferred) — alvo incerto'] : []) };
    })
    .sort((a, b) => b.riskScore - a.riskScore);

  const tag = `[TIC-DIAG-${Date.now().toString(36).slice(-4)}]`;
  const hypotheses = suspects.slice(0, 5).map((s, i) => {
    const name = shortId(s.id);
    const why = s.reasons.length > 0 ? ` (${s.reasons.join(', ')})` : '';
    return `${i + 1}. **Se \`${name}\` é a causa**${why}, **então** adicionar validação/log na sua fronteira e re-rodar o loop **elimina (ou expõe) o bug**.`;
  });
  while (hypotheses.length < 3 && pathNodes[hypotheses.length]) {
    const n = pathNodes[hypotheses.length];
    hypotheses.push(`${hypotheses.length + 1}. **Se \`${shortId(n.id)}\` é a causa**, **então** isolá-lo com um stub no seam elimina o bug.`);
  }

  const instrumentation = suspects.slice(0, 5).map((s, i) => {
    const file = s.id.startsWith('file:') ? s.id.slice(5) : null;
    const method = file
      ? (db.prepare('SELECT from_method FROM method_edges WHERE from_file = ? AND from_method IS NOT NULL LIMIT 1').get(file) as any)?.from_method
      : null;
    return `- Hipótese ${i + 1} → instrumente \`${shortId(s.id)}\`${method ? ` (método \`${method}\`)` : ''} com log prefixado \`${tag}\` — **um por vez**, observando entrada/saída`;
  });

  const fromLabel = shortId(fromRes.id);
  const toLabel = toRes.id ? shortId(toRes.id) : '(sintoma)';
  const endpoint = (db.prepare("SELECT label FROM cg_nodes WHERE layer = 'backend' LIMIT 1").get() as any)?.label;

  return [
    TRIAGE_DISCLAIMER,
    '',
    `# Diagnose: \`${fromLabel}\`${toRes.id ? ` ⇄ \`${toLabel}\`` : ''}`,
    '',
    '## 1. Feedback loop (construa PRIMEIRO — sinal pass/fail determinístico)',
    '- Preferência da skill, nesta ordem:',
    `  1. Teste unitário/integração que falhe reproduzindo o sintoma em \`${fromLabel}\``,
    endpoint ? `  2. Script HTTP contra o endpoint detectado (\`${endpoint}\`) com payload fixo + diff da resposta` : '  2. Script HTTP contra o endpoint da cadeia com payload fixo',
    '  3. Invocação CLI com fixture + snapshot diff',
    '- Itere no PRÓPRIO loop: mais rápido, mais determinístico. Um loop de 2s é um superpoder.',
    '',
    '## 2. Reproduce',
    pathNodes.length > 0
      ? `Caminho provável do sintoma (${pathNodes.length} salto(s)):\n${pathNodes.map((n) => `- ${'  '.repeat(n.depth - 1)}↳ \`${shortId(n.id)}\` ${n.confidence === 'inferred' ? '🟡' : '🟢'}`).join('\n')}`
      : 'Sem caminho mapeado no grafo — confirme as entidades com get_blast_radius.',
    '- Confirme: a falha bate com o sintoma relatado e reproduz entre execuções.',
    '',
    '## 3. Hypothesize (ranqueadas e falsificáveis — valide o ranking com quem conhece o domínio)',
    ...hypotheses,
    '',
    '## 4. Instrument (1 variável por vez; cada probe ligada a UMA hipótese)',
    ...instrumentation,
    `- Todos os logs com o prefixo \`${tag}\` para remoção fácil depois.`,
    '',
    '## 5. Fix + regression test',
    '- Escreva o teste de regressão ANTES do fix, no seam correto (que exercita o padrão real do bug no call site).',
    '',
    '## 6. Cleanup + post-mortem',
    '- [ ] Repro original não reproduz mais',
    '- [ ] Teste de regressão passa',
    `- [ ] Instrumentação \`${tag}\` removida e código descartável apagado`,
    '- [ ] Hipótese correta documentada na mensagem do commit',
    '- **O que teria prevenido este bug?** Se a resposta for arquitetural, leve o achado para `get_arch_suggestions` (skill improve-codebase-architecture).'
  ].join('\n');
}

function loadRiskMap(ticCodeDir: string): Map<string, { score: number; reasons: string[] }> {
  const map = new Map<string, { score: number; reasons: string[] }>();
  try {
    const items = JSON.parse(fs.readFileSync(path.join(ticCodeDir, 'risk-prediction.json'), 'utf8'));
    if (Array.isArray(items)) for (const i of items) map.set(i.file, { score: i.score, reasons: i.reasons ?? [] });
  } catch { /* sem predição */ }
  return map;
}
