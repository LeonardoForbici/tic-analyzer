/**
 * Gerador de relatório de confiança para Programação Reversa
 * Inspiração: Reviewer do Reversa by Sandeco (MIT)
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

  // Contagem por nível de confiança
  const confirmed = businessRules.filter((r) => r.confidence === 'confirmado').length;
  const inferred = businessRules.filter((r) => r.confidence === 'inferido').length;
  const gaps = businessRules.filter((r) => r.confidence === 'lacuna').length;

  lines.push('## Resumo de Confiança');
  lines.push('');
  lines.push('| Nível | Quantidade | Significado |');
  lines.push('| --- | --- | --- |');
  lines.push(`| 🟢 CONFIRMADO | ${confirmed} | Extraído diretamente do código |`);
  lines.push(`| 🟡 INFERIDO | ${inferred} | Deduzido por nome/padrão/fluxo |`);
  lines.push(`| 🔴 LACUNA | ${gaps} | Não confirmável, exige validação humana |`);
  lines.push('');

  // Score geral
  const total = confirmed + inferred + gaps;
  const score = total > 0 ? Math.round((confirmed / total) * 100) : 0;
  lines.push(`**Score de Cobertura:** ${score}% confirmado`);
  lines.push('');

  // Cobertura por categoria
  lines.push('## Cobertura por Categoria');
  lines.push('');

  const hasJava = inventory.javaSpring.detected;
  const hasTs = inventory.typeScript.detected;
  const hasPlSql = inventory.plsql.detected;
  const hasDb = inventory.database.detected;

  lines.push('| Categoria | Status |');
  lines.push('| --- | --- |');
  lines.push(`| Stack detectada | ${inventory.stack.filter((s) => s.detected).length > 0 ? '🟢 CONFIRMADO' : '🔴 LACUNA'} |`);
  lines.push(`| Backend Java/Spring | ${hasJava ? '🟢 CONFIRMADO' : '🔴 LACUNA'} |`);
  lines.push(`| Frontend TypeScript | ${hasTs ? '🟢 CONFIRMADO' : '🔴 LACUNA'} |`);
  lines.push(`| PL/SQL | ${hasPlSql ? '🟢 CONFIRMADO' : '—'} |`);
  lines.push(`| Banco de dados | ${hasDb ? '🟢 CONFIRMADO' : '—'} |`);
  lines.push(`| Riscos detectados | ${risks.length > 0 ? '🟢 CONFIRMADO' : '🟡 INFERIDO'} |`);
  lines.push(`| Regras de negócio | ${confirmed > 0 ? '🟡 INFERIDO (parcial)' : '🔴 LACUNA'} |`);
  lines.push(`| Permissões | ${hasJava && inventory.javaSpring.files.some((f) => f.annotations.some((a) => ['PreAuthorize', 'Secured'].includes(a))) ? '🟢 CONFIRMADO' : '🔴 LACUNA'} |`);
  lines.push('');

  // Principais limitações
  lines.push('## Limitações desta Análise');
  lines.push('');
  lines.push('- Esta análise é determinística — não lê o conteúdo de código, apenas metadados, nomes e estrutura.');
  lines.push('- Regras de negócio em comentários, documentação interna ou lógica complexa não são detectadas.');
  lines.push('- DTOs sem anotações explícitas podem não ser detectados corretamente.');
  lines.push('- Lógica condicional dentro de métodos não é analisada.');
  lines.push('');
  lines.push('> Para análise mais profunda, use 🤖 IA Padrão (Codex/Claude/Copilot) com os artefatos gerados como contexto,');
  lines.push('> ou 🧠 IA Local com Ollama para melhorar os textos sem enviar dados externos.');
  lines.push('');

  // Recomendações
  lines.push('## Recomendações para Agentes de IA');
  lines.push('');
  lines.push('1. Leia `.tic-code/reverse-engineering/` antes de alterar qualquer módulo.');
  lines.push('2. Não trate 🟡 INFERIDO como verdade confirmada.');
  lines.push('3. Para 🔴 LACUNA, pergunte ao usuário antes de prosseguir.');
  lines.push('4. Em projetos com PL/SQL, verifique triggers e procedures antes de alterar regras no backend.');
  lines.push('5. Consulte a matriz de rastreabilidade antes de refatorar módulos críticos.');

  return lines.join('\n');
}
