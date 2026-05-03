/**
 * Gerador de gaps para Programação Reversa
 * Inspiração: Reviewer do Reversa by Sandeco (MIT)
 */

import type { ReverseEngineeringInput, GapItem } from './reverseEngineeringTypes';

export function generateGaps(input: ReverseEngineeringInput): GapItem[] {
  const { inventory, risks, plsql } = input;
  const gaps: GapItem[] = [];
  let id = 1;

  // Gap: sem documentação de arquitetura
  gaps.push({
    id: `GAP-${id++}`,
    domain: 'arquitetura',
    description: 'Sem documentação formal de arquitetura detectada',
    kind: 'geral',
    question: 'Existe um documento de arquitetura (ADR, C4, wiki) para este sistema?',
    sourceFiles: []
  });

  // Gap: endpoints sem controle de acesso
  const controllersWithoutAuth = inventory.javaSpring.files.filter(
    (f) => f.kind === 'controller' && !f.annotations.some((a) => ['PreAuthorize', 'Secured'].includes(a))
  );
  if (controllersWithoutAuth.length > 0) {
    gaps.push({
      id: `GAP-${id++}`,
      domain: 'permissao',
      description: `${controllersWithoutAuth.length} controller(s) sem anotação de controle de acesso detectada`,
      kind: 'permissao',
      question: 'Todos os endpoints estão protegidos por autenticação/autorização?',
      sourceFiles: controllersWithoutAuth.map((f) => f.path).slice(0, 5)
    });
  }

  // Gap: PL/SQL com WHEN OTHERS sem RAISE
  const plsqlRisks = risks.filter((r) => r.category === 'plsql');
  if (plsqlRisks.length > 0) {
    gaps.push({
      id: `GAP-${id++}`,
      domain: 'plsql',
      description: `${plsqlRisks.length} risco(s) crítico(s) em PL/SQL`,
      kind: 'plsql',
      question: 'Os handlers WHEN OTHERS em PL/SQL relançam (RAISE) os erros ou os suprimem silenciosamente?',
      sourceFiles: plsqlRisks.map((r) => r.file).slice(0, 5)
    });
  }

  // Gap: triggers sem documentação
  const triggersWithoutDocs = plsql.entities.filter((e) => e.kind === 'trigger');
  if (triggersWithoutDocs.length > 0) {
    gaps.push({
      id: `GAP-${id++}`,
      domain: 'plsql',
      description: `${triggersWithoutDocs.length} trigger(s) detectada(s) — regras de negócio no banco podem não estar documentadas`,
      kind: 'plsql',
      question: 'Quais regras de negócio cada trigger implementa? Estão documentadas?',
      sourceFiles: triggersWithoutDocs.map((e) => e.file).slice(0, 5)
    });
  }

  // Gap: alto acoplamento
  const highCouplingRisks = risks.filter((r) => r.title.toLowerCase().includes('import') && r.level === 'high');
  if (highCouplingRisks.length > 0) {
    gaps.push({
      id: `GAP-${id++}`,
      domain: 'arquitetura',
      description: 'Classes com alto volume de importações — possível alto acoplamento',
      kind: 'geral',
      question: 'Esses módulos de alto acoplamento podem ser refatorados para reduzir dependências?',
      sourceFiles: highCouplingRisks.map((r) => r.file).slice(0, 5)
    });
  }

  // Gap: sem testes detectados
  const testFiles = input.scan.files.filter((f) =>
    /test|spec|__tests__/.test(f.relativePath.toLowerCase())
  );
  if (testFiles.length === 0) {
    gaps.push({
      id: `GAP-${id++}`,
      domain: 'qualidade',
      description: 'Nenhum arquivo de teste detectado',
      kind: 'geral',
      question: 'Existe cobertura de testes unitários ou de integração neste projeto?',
      sourceFiles: []
    });
  }

  // Gap: integrações externas não documentadas
  const integrationHints = inventory.stack.filter(
    (s) => s.detected && (s.id.includes('api') || s.id.includes('client') || s.id.includes('http'))
  );
  if (integrationHints.length > 0 || inventory.typeScript.sourceFiles.services.length > 0) {
    gaps.push({
      id: `GAP-${id++}`,
      domain: 'integracao',
      description: 'Possíveis integrações externas detectadas sem contrato documentado',
      kind: 'integracao',
      question: 'Quais sistemas externos esta aplicação integra? Existem contratos de API documentados?',
      sourceFiles: inventory.typeScript.sourceFiles.services.slice(0, 5)
    });
  }

  return gaps;
}

export function renderGapsMd(gaps: GapItem[], projectName: string): string {
  const lines: string[] = [];
  lines.push(`# Gaps e Incertezas: ${projectName}`);
  lines.push('');
  lines.push('> Áreas importantes que o código sugere mas não confirma.');
  lines.push('> Gerado por TIC Coder Lite — Modo Lite.');
  lines.push('> Inspiração metodológica: Reviewer do Reversa by Sandeco (MIT).');
  lines.push('');

  if (gaps.length === 0) {
    lines.push('- Nenhum gap identificado. Excelente cobertura! 🟢');
    return lines.join('\n');
  }

  const byKind: Record<string, GapItem[]> = {};
  for (const gap of gaps) {
    (byKind[gap.kind] ??= []).push(gap);
  }

  const kindLabels: Record<string, string> = {
    'regra-negocio': '📋 Regras de Negócio',
    integracao: '🔌 Integrações',
    permissao: '🔐 Permissões',
    estado: '🔄 Estados',
    plsql: '🗄️ PL/SQL',
    geral: '⚠️ Geral',
    qualidade: '🧪 Qualidade'
  };

  for (const [kind, kindGaps] of Object.entries(byKind)) {
    lines.push(`## ${kindLabels[kind] ?? kind}`);
    lines.push('');
    for (const gap of kindGaps) {
      lines.push(`### ${gap.id}: ${gap.description} 🔴 LACUNA`);
      lines.push('');
      lines.push(`**Pergunta:** ${gap.question}`);
      if (gap.sourceFiles.length > 0) {
        lines.push('');
        lines.push('Arquivos relacionados:');
        for (const f of gap.sourceFiles) {
          lines.push(`- ${f}`);
        }
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
