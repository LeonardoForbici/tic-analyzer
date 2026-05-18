/**
 * What-If Impact Analyzer
 *
 * Dado uma hipótese de mudança ("e se eu mudar campo X de Double para BigDecimal?"),
 * percorre o grafo de dependências, o project-graph, os índices de endpoints/SQL
 * e os artefatos de engenharia reversa para mapear TODOS os pontos impactados.
 */

import * as vscode from 'vscode';
import type { LightweightGraph } from '../scanner/buildGraph';
import type {
  WhatIfQuery,
  WhatIfImpactResult,
  WhatIfImpactNode,
  WhatIfImpactLayer,
  WhatIfBreakRisk,
  WhatIfConfidence,
  WhatIfChangeKind,
  WhatIfBusinessRuleImpact
} from './whatIfTypes';

// ── Parsing de hipótese natural ───────────────────────────────────────────────

const TYPE_CHANGE_PATTERNS = [
  /(?:mudar?|alterar?|trocar?|change|convert)\s+(?:o\s+)?(?:tipo\s+)?(?:do\s+)?(?:campo\s+)?[`"']?(\w+)[`"']?\s+(?:de|from)\s+[`"']?(\w+)[`"']?\s+(?:para|to)\s+[`"']?(\w+)[`"']/i,
  /[`"']?(\w+)[`"']?\s+(?:de|from)\s+[`"']?(\w+)[`"']?\s+(?:para|to)\s+[`"']?(\w+)[`"']/i
];

const RENAME_PATTERNS = [
  /(?:renomear?|rename)\s+(?:o\s+)?(?:campo|field|método|method|classe|class|componente|component)?\s*[`"']?(\w+)[`"']?\s+(?:para|to)\s+[`"']?(\w+)[`"']/i
];

const REMOVE_PATTERNS = [
  /(?:remov|delet|exclu|eliminat|remov)\w*\s+(?:o\s+)?(?:campo|field|endpoint|método|method|classe|class)\s*[`"']?(\w+)[`"']/i
];

const ENDPOINT_PATTERNS = [
  /(?:endpoint|rota|route|api)\s+(?:GET|POST|PUT|PATCH|DELETE)?\s*[`"']?([/\w-]+)[`"']/i
];

export function parseWhatIfHypothesis(hypothesis: string): WhatIfQuery {
  for (const pattern of TYPE_CHANGE_PATTERNS) {
    const match = hypothesis.match(pattern);
    if (match) {
      return {
        hypothesis,
        targetSymbol: match[1],
        changeKind: 'field-type-change',
        fromValue: match[2],
        toValue: match[3]
      };
    }
  }

  for (const pattern of RENAME_PATTERNS) {
    const match = hypothesis.match(pattern);
    if (match) {
      return {
        hypothesis,
        targetSymbol: match[1],
        changeKind: 'field-rename',
        fromValue: match[1],
        toValue: match[2]
      };
    }
  }

  for (const pattern of REMOVE_PATTERNS) {
    const match = hypothesis.match(pattern);
    if (match) {
      return {
        hypothesis,
        targetSymbol: match[1],
        changeKind: 'field-remove'
      };
    }
  }

  for (const pattern of ENDPOINT_PATTERNS) {
    const match = hypothesis.match(pattern);
    if (match) {
      return {
        hypothesis,
        targetSymbol: match[1],
        changeKind: 'endpoint-change'
      };
    }
  }

  // Extrair qualquer palavra entre backticks ou aspas como símbolo
  const backtickMatch = hypothesis.match(/[`"'](\w+)[`"']/);
  if (backtickMatch) {
    return {
      hypothesis,
      targetSymbol: backtickMatch[1],
      changeKind: 'generic'
    };
  }

  // Última tentativa: palavras CamelCase ou snake_case como símbolo
  const camelMatch = hypothesis.match(/\b([A-Z][a-zA-Z0-9]+|[a-z]+[A-Z][a-zA-Z0-9]*|[a-z]+_[a-z]+)\b/);
  return {
    hypothesis,
    targetSymbol: camelMatch?.[1],
    changeKind: 'generic'
  };
}

// ── Analisador principal ──────────────────────────────────────────────────────

export async function analyzeWhatIfImpact(
  root: vscode.WorkspaceFolder,
  hypothesis: string,
  graph: LightweightGraph
): Promise<WhatIfImpactResult> {
  const query = parseWhatIfHypothesis(hypothesis);
  const impactedNodes: WhatIfImpactNode[] = [];
  const gaps: string[] = [];
  const questions: string[] = [];

  if (!query.targetSymbol) {
    gaps.push('🔴 LACUNA: Não foi possível identificar o símbolo-alvo na hipótese. Use backticks ou seja mais específico.');
    return buildResult(query, impactedNodes, [], gaps, questions);
  }

  const symbol = query.targetSymbol;

  // 1. Buscar nos arquivos do workspace
  const allFiles = await vscode.workspace.findFiles(
    '**/*.{ts,tsx,js,jsx,java,py,cs,sql,pks,pkb,prc,fnc,trg,json,xml,yaml,yml}',
    '**/{node_modules,.git,dist,build,out,.tic-code}/**',
    10000
  );

  for (const fileUri of allFiles) {
    try {
      const content = Buffer.from(await vscode.workspace.fs.readFile(fileUri)).toString('utf8');
      const relativePath = vscode.workspace.asRelativePath(fileUri);

      const hits = findSymbolHits(content, symbol, query);
      if (hits.length === 0) continue;

      const layer = inferLayer(relativePath);
      const breakRisk = inferBreakRisk(layer, query.changeKind, hits);
      const confidence = inferConfidence(hits, content, symbol);

      impactedNodes.push({
        file: relativePath,
        layer,
        reason: buildReason(query, hits, layer),
        evidence: hits.slice(0, 5),
        breakRisk,
        confidence,
        recommendedAction: buildRecommendedAction(query, layer, breakRisk)
      });
    } catch {
      // arquivo inacessível — ignorar
    }
  }

  // 2. Cruzar com grafo de dependências — propagação transitiva
  const directFiles = new Set(impactedNodes.map((n) => n.file));
  const transitiveNodes = findTransitiveDependents(graph, directFiles, symbol);
  for (const node of transitiveNodes) {
    if (!directFiles.has(node.file)) {
      impactedNodes.push(node);
    }
  }

  // 3. Carregar regras de negócio do artefato
  const businessRuleImpacts = await loadBusinessRuleImpacts(root, symbol, query);

  // 4. Gaps e perguntas
  if (impactedNodes.length === 0) {
    gaps.push(`🔴 LACUNA: Nenhuma ocorrência de "${symbol}" encontrada no código.`);
    gaps.push('🔴 Verifique se o símbolo está no escopo do workspace e não foi filtrado.');
  }

  const sqlNodes = impactedNodes.filter((n) => n.layer === 'sql');
  if (sqlNodes.length > 0) {
    questions.push(`Existem stored procedures ou triggers que fazem cast/aritmética com "${symbol}"?`);
    questions.push('A mudança de tipo afeta índices ou constraints no banco?');
  }

  if (query.changeKind === 'field-type-change') {
    questions.push(`A mudança de ${query.fromValue} → ${query.toValue} altera o comportamento de serialização JSON/XML?`);
    questions.push('Existem comparações numéricas com == ou != que precisariam de .compareTo()?');
    questions.push('Há operações de arredondamento que precisam ser revistas?');
  }

  if (impactedNodes.some((n) => n.layer === 'frontend')) {
    questions.push('O frontend exibe este campo formatado? A mudança de tipo afeta a formatação?');
  }

  return buildResult(query, impactedNodes, businessRuleImpacts, gaps, questions);
}

// ── Helpers de busca ──────────────────────────────────────────────────────────

function findSymbolHits(content: string, symbol: string, query: WhatIfQuery): string[] {
  const hits: string[] = [];
  const lines = content.split('\n');

  const patterns: RegExp[] = [
    new RegExp(`\\b${escapeRegex(symbol)}\\b`, 'g')
  ];

  // Para mudança de tipo: busca também o tipo antigo
  if (query.changeKind === 'field-type-change' && query.fromValue) {
    patterns.push(new RegExp(`\\b${escapeRegex(query.fromValue)}\\b`, 'g'));
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      if (pattern.test(line)) {
        hits.push(`linha ${i + 1}: ${line.trim().slice(0, 120)}`);
        break;
      }
    }
    if (hits.length >= 20) break;
  }

  return hits;
}

function findTransitiveDependents(
  graph: LightweightGraph,
  directFiles: Set<string>,
  _symbol: string
): WhatIfImpactNode[] {
  const transitive: WhatIfImpactNode[] = [];
  const visited = new Set<string>(directFiles);

  // Encontrar arquivos que importam os arquivos diretamente impactados
  for (const edge of graph.edges) {
    if (directFiles.has(edge.targetPath) && !visited.has(edge.sourcePath)) {
      visited.add(edge.sourcePath);
      const layer = inferLayer(edge.sourcePath);
      transitive.push({
        file: edge.sourcePath,
        layer,
        reason: `Importa/depende de \`${edge.targetPath}\` que foi diretamente impactado`,
        evidence: [`grafo: ${edge.from} → ${edge.to} (${edge.type})`],
        breakRisk: 'LOW',
        confidence: 'INFERRED',
        recommendedAction: 'Revisar se usa o símbolo afetado direta ou indiretamente'
      });
    }
  }

  return transitive;
}

async function loadBusinessRuleImpacts(
  root: vscode.WorkspaceFolder,
  symbol: string,
  _query: WhatIfQuery
): Promise<WhatIfBusinessRuleImpact[]> {
  const impacts: WhatIfBusinessRuleImpact[] = [];
  try {
    const uri = vscode.Uri.joinPath(root.uri, '.tic-code', 'reverse-engineering', 'business-rules.md');
    const content = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
    const lines = content.split('\n');
    for (const line of lines) {
      if (line.toLowerCase().includes(symbol.toLowerCase()) && line.startsWith('###')) {
        const ruleMatch = line.match(/###\s+(BR-\d+):\s+(.+)/);
        if (ruleMatch) {
          impacts.push({
            ruleId: ruleMatch[1],
            rule: ruleMatch[2].replace(/🟢.*|🟡.*|🔴.*/g, '').trim(),
            impactDescription: `A regra menciona o símbolo "${symbol}" — valide se a mudança altera o comportamento`,
            confidence: 'INFERRED'
          });
        }
      }
    }
  } catch {
    // business-rules.md não existe ainda — ok
  }
  return impacts;
}

// ── Inferências de camada e risco ─────────────────────────────────────────────

function inferLayer(filePath: string): WhatIfImpactLayer {
  const lower = filePath.toLowerCase();
  if (/\.(sql|pks|pkb|prc|fnc|trg)$/.test(lower)) return 'sql';
  if (/controller|resource|endpoint|handler/.test(lower)) return 'backend';
  if (/service|bo|usecase/.test(lower)) return 'service';
  if (/repository|dao|mapper/.test(lower)) return 'repository';
  if (/\.spec\.|\.test\.|__tests__/.test(lower)) return 'test';
  if (/component|page|screen|view|\.tsx$|\.jsx$/.test(lower)) return 'frontend';
  if (/config|env|settings|application\./.test(lower)) return 'config';
  if (/contract|dto|schema|openapi|swagger/.test(lower)) return 'contract';
  if (/business|rule|domain/.test(lower)) return 'business-rule';
  return 'unknown';
}

function inferBreakRisk(
  layer: WhatIfImpactLayer,
  changeKind: WhatIfChangeKind,
  hits: string[]
): WhatIfBreakRisk {
  if (layer === 'sql') return 'CRITICAL';
  if (layer === 'backend' && changeKind === 'field-type-change') return 'HIGH';
  if (layer === 'contract' && changeKind === 'field-type-change') return 'HIGH';
  if (layer === 'service' && hits.length > 3) return 'HIGH';
  if (layer === 'test') return 'MEDIUM';
  if (layer === 'frontend') return 'MEDIUM';
  if (layer === 'config') return 'LOW';
  return 'LOW';
}

function inferConfidence(hits: string[], _content: string, symbol: string): WhatIfConfidence {
  if (hits.some((h) => h.includes(symbol))) return 'CONFIRMED';
  if (hits.length > 0) return 'INFERRED';
  return 'GAP';
}

function buildReason(query: WhatIfQuery, hits: string[], layer: WhatIfImpactLayer): string {
  const count = hits.length;
  if (query.changeKind === 'field-type-change') {
    return `${count} ocorrência(s) de "${query.targetSymbol}" ou tipo "${query.fromValue}" na camada ${layer}`;
  }
  if (query.changeKind === 'field-rename') {
    return `${count} referência(s) ao símbolo "${query.targetSymbol}" que precisaria ser renomeado`;
  }
  if (query.changeKind === 'field-remove') {
    return `${count} uso(s) do símbolo "${query.targetSymbol}" que quebraria com a remoção`;
  }
  return `${count} referência(s) ao símbolo "${query.targetSymbol}"`;
}

function buildRecommendedAction(
  query: WhatIfQuery,
  layer: WhatIfImpactLayer,
  risk: WhatIfBreakRisk
): string {
  if (layer === 'sql') return `⚠️ Revisar cast, cálculos e comparações com "${query.targetSymbol}" no SQL/PLSQL`;
  if (layer === 'test') return `Atualizar asserções e mocks que dependem do tipo/valor de "${query.targetSymbol}"`;
  if (layer === 'contract') return `Verificar serialização e contrato de API — mudança de tipo pode quebrar clientes`;
  if (layer === 'frontend') return `Verificar formatação e binding de "${query.targetSymbol}" na UI`;
  if (risk === 'CRITICAL' || risk === 'HIGH') return `Revisar e testar obrigatoriamente antes de commitar`;
  return `Revisar uso de "${query.targetSymbol}" neste arquivo`;
}

// ── Montagem do resultado ─────────────────────────────────────────────────────

function buildResult(
  query: WhatIfQuery,
  nodes: WhatIfImpactNode[],
  businessRules: WhatIfBusinessRuleImpact[],
  gaps: string[],
  questions: string[]
): WhatIfImpactResult {
  const layerSummary = {} as Record<WhatIfImpactLayer, number>;
  for (const node of nodes) {
    layerSummary[node.layer] = (layerSummary[node.layer] ?? 0) + 1;
  }

  const criticalCount = nodes.filter((n) => n.breakRisk === 'CRITICAL').length;
  const highCount = nodes.filter((n) => n.breakRisk === 'HIGH').length;

  const overallRisk: WhatIfBreakRisk =
    criticalCount > 0 ? 'CRITICAL' :
    highCount > 2 ? 'HIGH' :
    nodes.length > 10 ? 'HIGH' :
    nodes.length > 4 ? 'MEDIUM' : 'LOW';

  const impactScore = Math.min(100,
    criticalCount * 30 +
    highCount * 15 +
    nodes.filter((n) => n.breakRisk === 'MEDIUM').length * 8 +
    gaps.length * 10
  );

  const effort =
    overallRisk === 'CRITICAL' ? { minHours: 8, maxHours: 40, label: '8h a 40h+' } :
    overallRisk === 'HIGH' ? { minHours: 4, maxHours: 16, label: '4h a 16h' } :
    overallRisk === 'MEDIUM' ? { minHours: 1, maxHours: 6, label: '1h a 6h' } :
    { minHours: 0.5, maxHours: 2, label: '30min a 2h' };

  return {
    query,
    generatedAt: new Date().toISOString(),
    impactedNodes: nodes.sort((a, b) => riskOrder(a.breakRisk) - riskOrder(b.breakRisk)),
    impactedBusinessRules: businessRules,
    layerSummary,
    overallRisk,
    impactScore,
    gaps,
    questions,
    effortEstimate: effort
  };
}

function riskOrder(risk: WhatIfBreakRisk): number {
  const map: Record<WhatIfBreakRisk, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  return map[risk];
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
