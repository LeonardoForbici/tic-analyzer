/**
 * Gerador de relatório de confiança para Programação Reversa
 * Inspiração: Reviewer do Reversa by Sandeco (MIT)
 *
 * Cobertura separada por categoria. Nunca diz 100% se há lacunas.
 */

import type { ReverseEngineeringInput } from './reverseEngineeringTypes';
import type { BusinessRuleCandidate } from './reverseEngineeringTypes';

export function renderConfidenceReportMd(
  input: ReverseEngineeringInput,
  businessRules: BusinessRuleCandidate[],
  projectName: string
): string {
  const { inventory, risks } = input;
  const lines: string[] = [];

  lines.push(`# Relatório de Confiança: ${projectName}`);
  lines.push('');
  lines.push('> Gerado por TIC Coder Lite — Modo Lite (análise determinística sem IA).');
  lines.push('> Inspiração metodológica: Reviewer do Reversa by Sandeco (MIT).');
  lines.push('');

  const confirmed = businessRules.filter((r) => r.confidence === 'confirmado').length;
  const inferred = businessRules.filter((r) => r.confidence === 'inferido').length;
  const gaps = businessRules.filter((r) => r.confidence === 'lacuna').length;
  const total = confirmed + inferred + gaps;

  // ── Resumo de regras de negócio ───────────────────────────────────────────
  lines.push('## Resumo de Regras de Negócio');
  lines.push('');
  lines.push('| Nível | Quantidade | Significado |');
  lines.push('| --- | --- | --- |');
  lines.push(`| 🟢 CONFIRMADO | ${confirmed} | Extraído diretamente do código (annotations, triggers) |`);
  lines.push(`| 🟡 INFERIDO | ${inferred} | Deduzido por nome/padrão/fluxo — requer validação |`);
  lines.push(`| 🔴 LACUNA | ${gaps} | Não confirmável, exige validação humana |`);
  lines.push('');

  // Score consciente: nunca diz 100% se há lacunas ou se total é baixo
  const hasGaps = gaps > 0 || total === 0 || !inventory.javaSpring.detected;
  const baseScore = total > 0 ? Math.round((confirmed / total) * 100) : 0;
  const effectiveScore = hasGaps ? Math.min(baseScore, 85) : baseScore;

  const scoreEmoji = effectiveScore >= 80 ? '🟢' : effectiveScore >= 50 ? '🟡' : '🔴';
  lines.push(`**Score de Regras de Negócio:** ${scoreEmoji} ${effectiveScore}% (${confirmed} de ${total} confirmadas)`);
  if (hasGaps && effectiveScore === 85 && baseScore > 85) {
    lines.push('> ⚠️ Score limitado a 85% porque há lacunas de cobertura detectadas.');
  }
  lines.push('');

  // ── Cobertura por categoria ───────────────────────────────────────────────
  lines.push('## Cobertura por Categoria');
  lines.push('');
  lines.push('| Categoria | Status | Observação |');
  lines.push('| --- | --- | --- |');

  // Estrutura do projeto
  const stackCount = inventory.stack.filter((s) => s.detected).length;
  lines.push(`| Estrutura do projeto | ${stackCount > 0 ? '🟢 CONFIRMADO' : '🔴 LACUNA'} | ${stackCount} stack(s) detectada(s) |`);

  // Stack
  const stackNames = inventory.stack.filter((s) => s.detected).map((s) => s.name).join(', ');
  lines.push(`| Stack | ${stackCount > 0 ? '🟢 CONFIRMADO' : '🔴 LACUNA'} | ${stackNames || 'não detectada'} |`);

  // Módulos
  const moduleCount = inventory.modules.length;
  lines.push(`| Módulos | ${moduleCount > 0 ? '🟢 CONFIRMADO' : '🟡 INFERIDO'} | ${moduleCount} módulo(s) detectado(s) |`);

  // Regras de negócio
  const brStatus = confirmed > 0 ? '🟡 INFERIDO (parcial)' : '🔴 LACUNA';
  lines.push(`| Regras de negócio | ${brStatus} | ${confirmed} confirmadas, ${inferred} inferidas |`);

  // Permissões / RBAC
  const hasPermissions = inventory.javaSpring.detected &&
    inventory.javaSpring.files.some((f) => f.annotations.some((a) => ['PreAuthorize', 'Secured'].includes(a)));
  lines.push(`| Permissões / RBAC | ${hasPermissions ? '🟢 CONFIRMADO' : '🔴 LACUNA'} | ${hasPermissions ? 'annotations de segurança detectadas' : 'não detectado'} |`);

  // APIs / Endpoints
  const endpoints = inventory.javaSpring.files.reduce((n, f) => n + f.endpoints.length, 0);
  lines.push(`| APIs / Endpoints | ${endpoints > 0 ? '🟢 CONFIRMADO' : '🔴 LACUNA'} | ${endpoints} endpoint(s) mapeado(s) |`);

  // Banco / PL/SQL
  const hasPlSql = inventory.plsql.detected;
  lines.push(`| Banco / PL/SQL | ${hasPlSql ? '🟢 CONFIRMADO' : '—'} | ${hasPlSql ? `${inventory.plsql.entities.length} entidade(s) PL/SQL` : 'não aplicável'} |`);

  // Fluxos ponta-a-ponta
  lines.push(`| Fluxos ponta-a-ponta | 🔴 LACUNA | Não detectável via análise estática determinística |`);

  // Riscos
  const criticalRisks = risks.filter((r) => r.level === 'critical' || r.level === 'high').length;
  lines.push(`| Riscos técnicos | ${risks.length > 0 ? '🟢 CONFIRMADO' : '🟡 INFERIDO'} | ${risks.length} risco(s) total, ${criticalRisks} crítico(s)/alto(s) |`);

  lines.push('');

  // ── Lacunas identificadas ─────────────────────────────────────────────────
  lines.push('## Lacunas desta Análise 🔴');
  lines.push('');
  if (!inventory.javaSpring.detected) {
    lines.push('- 🔴 Sem código Java/Spring — regras de negócio via annotations não detectáveis');
  }
  if (!hasPlSql) {
    lines.push('- 🔴 Sem PL/SQL — triggers, procedures e packages não analisados');
  }
  if (confirmed === 0) {
    lines.push('- 🔴 Nenhuma regra de negócio confirmada — apenas inferências baseadas em nomes');
  }
  if (endpoints === 0) {
    lines.push('- 🔴 Nenhum endpoint de API detectado');
  }
  lines.push('- 🔴 Lógica condicional interna de métodos não é analisada (análise estática)');
  lines.push('- 🔴 Regras em comentários, documentação ou variáveis de configuração não são detectadas');
  lines.push('');

  // ── Limitações ─────────────────────────────────────────────────────────────
  lines.push('## Limitações desta Análise');
  lines.push('');
  lines.push('- Esta análise é determinística — lê metadados, nomes e estrutura, não o conteúdo lógico do código.');
  lines.push('- DTOs sem anotações explícitas podem não ser detectados corretamente.');
  lines.push('- Fluxos ponta-a-ponta e integrações externas não são inferidos automaticamente.');
  lines.push('');
  lines.push('> Para análise mais profunda, use 🤖 IA Padrão (Codex/Claude/Copilot) com os artefatos gerados como contexto,');
  lines.push('> ou 🧠 IA Local com Ollama para melhorar os textos sem enviar dados externos.');
  lines.push('');

  // ── Recomendações ──────────────────────────────────────────────────────────
  lines.push('## Recomendações para Agentes de IA');
  lines.push('');
  lines.push('1. Leia `.tic-code/reverse-engineering/` antes de alterar qualquer módulo.');
  lines.push('2. Não trate 🟡 INFERIDO como verdade confirmada — valide antes de agir.');
  lines.push('3. Para 🔴 LACUNA, pergunte ao usuário antes de prosseguir.');
  lines.push('4. Consulte `operational-contracts.md` antes de refatorar um módulo específico.');
  lines.push('5. Consulte `traceability/code-spec-matrix.md` para entender impactos antes de mudar APIs.');
  lines.push('6. Consulte `traceability/risk-impact-matrix.md` para entender riscos antes de mudar código crítico.');

  return lines.join('\n');
}
