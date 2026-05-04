/**
 * Gera .tic-code/reversa/plan.md — plano de análise baseado nas fases do Reversa.
 * Créditos: Reversa by Sandeco — MIT License (adapted)
 */

import type { ProjectSummary } from '../types';

interface PhaseItem {
  id: string;
  label: string;
  agent: string;
  status: '✅ Executado' | '🔄 Parcial' | '⏳ Pendente';
  deterministic: boolean;
  artifacts: string[];
  notes: string;
}

export function generateReversaPlan(summary: ProjectSummary): string {
  const phases: PhaseItem[] = buildPhases(summary);
  const totalFiles = summary.totalFiles;
  const totalLines = summary.totalLines;
  const riskCount = summary.risks.risks.filter((r) => {
    const l = r.file.toLowerCase();
    return !l.endsWith('package-lock.json') && !l.endsWith('yarn.lock') && !l.endsWith('.map');
  }).length;

  const moduleList = buildModuleNames(summary);

  const lines: string[] = [
    '# TIC Coder Lite — Plano de Programação Reversa',
    '',
    '> Gerado pelo TIC Coder Lite usando o motor Reversa (MIT by Sandeco).',
    `> Projeto: **${summary.workspaceName}** | Arquivos: ${totalFiles} | Linhas: ${totalLines.toLocaleString()} | Riscos: ${riskCount}`,
    '',
    '---',
    '',
    '## Módulos Identificados',
    '',
    moduleList.length > 0
      ? moduleList.map((m) => `- ${m}`).join('\n')
      : '- Módulos não detectados automaticamente. Execute análise completa.',
    '',
    '---',
    '',
    '## Fases da Pipeline',
    '',
    '| Fase | Agente | Status | Tipo |',
    '| --- | --- | --- | --- |',
    ...phases.map((p) => `| **${p.label}** | \`${p.agent}\` | ${p.status} | ${p.deterministic ? 'Determinístico' : 'IA/Manual'} |`),
    '',
    '---',
    '',
    ...phases.flatMap((p) => [
      `## ${p.label} — ${p.status}`,
      '',
      `**Agente:** \`${p.agent}\``,
      `**Tipo:** ${p.deterministic ? 'Executado deterministicamente pelo TIC Coder Lite' : 'Requer assistência de agente IA'}`,
      '',
      p.notes ? `> ${p.notes}` : '',
      '',
      '**Artefatos:**',
      ...p.artifacts.map((a) => `- \`${a}\``),
      '',
      '---',
      ''
    ]),
    '',
    '## Próximos Passos',
    '',
    '1. Revise `.tic-code/reverse-engineering/confidence-report.md` para entender lacunas 🔴',
    '2. Responda as perguntas em `.tic-code/reverse-engineering/questions.md`',
    '3. Use um agente de IA (Codex, Claude, Copilot) para expandir os SDDs em `.tic-code/reverse-engineering/sdd/`',
    '4. Revise e classifique regras de negócio em `.tic-code/reverse-engineering/business-rules.md`',
    '',
    '---',
    '',
    '## Escala de Confiança',
    '',
    '| Símbolo | Nome | Significado |',
    '| --- | --- | --- |',
    '| 🟢 | CONFIRMADO | Extraído diretamente do código com arquivo e linha |',
    '| 🟡 | INFERIDO | Deduzido por padrão/contexto — pode estar errado |',
    '| 🔴 | LACUNA | Não determinável estaticamente — requer validação humana |',
    '',
    '> Créditos: Metodologia Reversa by Sandeco (MIT).'
  ];

  return lines.filter((l) => l !== undefined).join('\n') + '\n';
}

function buildPhases(summary: ProjectSummary): PhaseItem[] {
  const hasPlSql = summary.inventory.plsql.detected || summary.inventory.plsql.files.length > 0;

  return [
    {
      id: 'reconnaissance',
      label: 'Scout — Reconhecimento',
      agent: 'reversa-scout',
      status: '✅ Executado',
      deterministic: true,
      artifacts: [
        '.tic-code/reverse-engineering/inventory.md',
        '.tic-code/reverse-engineering/dependencies.md',
        '.tic-code/reversa/context/surface.json',
        '.tic-code/reversa/context/workspace-summary.json'
      ],
      notes: 'Mapeamento de superfície executado pelo scanner determinístico do TIC Coder Lite.'
    },
    {
      id: 'excavation',
      label: 'Archaeologist — Escavação',
      agent: 'reversa-archaeologist',
      status: '🔄 Parcial',
      deterministic: true,
      artifacts: [
        '.tic-code/reverse-engineering/code-analysis.md',
        '.tic-code/reversa/context/modules.json',
        '.tic-code/reversa/context/graph.json'
      ],
      notes: 'Análise estática de código executada. Fluxos de controle e algoritmos requerem agente IA para análise profunda.'
    },
    {
      id: 'interpretation',
      label: 'Detective — Interpretação',
      agent: 'reversa-detective',
      status: summary.risks.risks.length > 0 ? '🔄 Parcial' : '⏳ Pendente',
      deterministic: false,
      artifacts: [
        '.tic-code/reverse-engineering/domain.md',
        '.tic-code/reverse-engineering/business-rules.md',
        '.tic-code/reverse-engineering/state-machines.md',
        '.tic-code/reverse-engineering/permissions.md'
      ],
      notes: 'Regras de negócio implícitas requerem análise por agente IA. Regras candidatas detectadas estaticamente.'
    },
    {
      id: 'synthesis',
      label: 'Architect — Síntese',
      agent: 'reversa-architect',
      status: '🔄 Parcial',
      deterministic: true,
      artifacts: [
        '.tic-code/reverse-engineering/architecture.md',
        '.tic-code/reverse-engineering/c4-context.md',
        '.tic-code/reverse-engineering/c4-containers.md',
        '.tic-code/reverse-engineering/c4-components.md'
      ],
      notes: 'Arquitetura detectada pelo grafo de dependências. Diagramas C4 completos requerem agente IA.'
    },
    {
      id: 'generation',
      label: 'Writer — Geração de Specs',
      agent: 'reversa-writer',
      status: '🔄 Parcial',
      deterministic: true,
      artifacts: [
        '.tic-code/reverse-engineering/operational-contracts.md',
        '.tic-code/reverse-engineering/traceability/code-spec-matrix.md',
        '.tic-code/reverse-engineering/sdd/ (pendente — requer agente IA)'
      ],
      notes: 'Contratos operacionais gerados estaticamente. SDDs detalhados por componente requerem agente IA.'
    },
    {
      id: 'review',
      label: 'Reviewer — Revisão',
      agent: 'reversa-reviewer',
      status: '✅ Executado',
      deterministic: true,
      artifacts: [
        '.tic-code/reverse-engineering/confidence-report.md',
        '.tic-code/reverse-engineering/gaps.md',
        '.tic-code/reverse-engineering/questions.md'
      ],
      notes: 'Relatório de confiança e lacunas gerado deterministicamente.'
    },
    {
      id: 'data',
      label: 'Data Master — Banco de Dados',
      agent: 'reversa-data-master',
      status: hasPlSql ? '🔄 Parcial' : '⏳ Pendente',
      deterministic: hasPlSql,
      artifacts: [
        '.tic-code/reverse-engineering/erd-complete.md',
        '.tic-code/reverse-engineering/database/'
      ],
      notes: hasPlSql
        ? 'PL/SQL detectado. Análise de banco parcialmente disponível em database-analysis.md.'
        : 'Nenhum banco de dados detectado. Execute se o projeto tiver banco relacional.'
    }
  ];
}

function buildModuleNames(summary: ProjectSummary): string[] {
  if (summary.inventory.modules.length > 0) {
    return summary.inventory.modules.slice(0, 12).map((m) => `**${m.kind}** — ${m.files.length} arquivo(s)`);
  }
  // Derivar de pastas de nível 2
  const folderSet = new Set<string>();
  for (const file of summary.scan.files) {
    const parts = file.relativePath.replace(/\\/g, '/').split('/');
    if (parts.length >= 2) {
      const key = parts.slice(0, 2).join('/');
      if (!key.startsWith('node_modules') && !key.startsWith('dist') && !key.startsWith('.')) {
        folderSet.add(key);
      }
    }
  }
  return [...folderSet].slice(0, 10).map((f) => `\`${f}/\``);
}
