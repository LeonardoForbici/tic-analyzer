import type { ProjectSummary } from '../types';
import type { ReversaState, ReversaAgentStatus } from './reversaEngineTypes';

function mkAgent(now: string, base: Partial<ReversaAgentStatus> & Pick<ReversaAgentStatus, 'id'|'name'|'role'|'executionMode'|'generatedFiles'>): ReversaAgentStatus {
  return {
    status: 'completed',
    requiredInputs: [],
    receivedInputs: [],
    errors: [],
    warnings: [],
    confidenceSummary: { confirmed: 1, inferred: 0, gaps: 0 },
    startedAt: now,
    finishedAt: now,
    lastRunAt: now,
    ...base
  };
}

export function generateReversaState(summary: ProjectSummary): ReversaState {
  const now = new Date().toISOString();
  const tracerPending = mkAgent(now, {
    id: 'tracer', name: 'Tracer', role: 'Análise dinâmica read-only', executionMode: 'user-input',
    status: 'pending', requiredInputs: ['Importar arquivos .log/.txt/.json/.ndjson em .tic-code/reversa/inputs/tracer/'],
    generatedFiles: ['.tic-code/reverse-engineering/dynamic.md', '.tic-code/reverse-engineering/traceability/runtime-evidence.md'],
    warnings: ['Aguardando importação de logs/traces.']
  });
  const visorPending = mkAgent(now, {
    id: 'visor', name: 'Visor', role: 'Documentação de UI via screenshots', executionMode: 'user-input',
    status: 'pending', requiredInputs: ['Importar screenshots .png/.jpg/.jpeg/.webp em .tic-code/reversa/inputs/visor/'],
    generatedFiles: ['.tic-code/reverse-engineering/ui/screenshots-index.md', '.tic-code/reverse-engineering/ui/ui-analysis.md', '.tic-code/reverse-engineering/ui/user-flows.md', '.tic-code/reverse-engineering/ui/screenshots-analysis.json'],
    warnings: ['Aguardando importação de screenshots.']
  });

  const agents: Record<string, ReversaAgentStatus> = {
    reversa: mkAgent(now, { id: 'reversa', name: 'Reversa', role: 'Orquestrador da metodologia', executionMode: 'deterministic', generatedFiles: ['.tic-code/reversa/state.json', '.tic-code/reversa/config.json', '.tic-code/reversa/plan.md', '.tic-code/reversa/context/surface.json', '.tic-code/reversa/_config/files-manifest.json'] }),
    scout: mkAgent(now, { id: 'scout', name: 'Scout', role: 'Inventário e superfície', executionMode: 'deterministic', generatedFiles: ['.tic-code/reversa/context/surface.json', '.tic-code/reverse-engineering/inventory.md', '.tic-code/reverse-engineering/dependencies.md'] }),
    archaeologist: mkAgent(now, { id: 'archaeologist', name: 'Archaeologist', role: 'Análise profunda por módulo', executionMode: 'deterministic', generatedFiles: ['.tic-code/reversa/context/modules.json', '.tic-code/reverse-engineering/code-analysis.md', '.tic-code/reverse-engineering/sdd/core.md'] }),
    detective: mkAgent(now, { id: 'detective', name: 'Detective', role: 'Regras, estados e permissões', executionMode: 'deterministic', generatedFiles: ['.tic-code/reverse-engineering/domain.md', '.tic-code/reverse-engineering/business-rules.md', '.tic-code/reverse-engineering/state-machines.md', '.tic-code/reverse-engineering/permissions.md', '.tic-code/reverse-engineering/gaps.md', '.tic-code/reverse-engineering/questions.md'] }),
    architect: mkAgent(now, { id: 'architect', name: 'Architect', role: 'Arquitetura, C4 e ERD', executionMode: 'deterministic', generatedFiles: ['.tic-code/reverse-engineering/architecture.md', '.tic-code/reverse-engineering/c4-context.md', '.tic-code/reverse-engineering/c4-containers.md', '.tic-code/reverse-engineering/c4-components.md', '.tic-code/reverse-engineering/erd-complete.md', '.tic-code/reverse-engineering/adrs/retroactive-architecture.md'] }),
    writer: mkAgent(now, { id: 'writer', name: 'Writer', role: 'SDD e contratos operacionais', executionMode: 'deterministic', generatedFiles: ['.tic-code/reverse-engineering/operational-contracts.md', '.tic-code/reverse-engineering/openapi/README.md', '.tic-code/reverse-engineering/user-stories/README.md'] }),
    reviewer: mkAgent(now, { id: 'reviewer', name: 'Reviewer', role: 'Revisão e consistência', executionMode: 'deterministic', generatedFiles: ['.tic-code/reverse-engineering/confidence-report.md', '.tic-code/reverse-engineering/review-report.md', '.tic-code/reverse-engineering/traceability/risk-impact-matrix.md'] }),
    tracer: tracerPending,
    visor: visorPending,
    dataMaster: mkAgent(now, { id: 'dataMaster', name: 'Data Master', role: 'Análise de banco de dados', executionMode: 'deterministic', generatedFiles: ['.tic-code/reverse-engineering/data-dictionary.md','.tic-code/reverse-engineering/database-analysis.md','.tic-code/reverse-engineering/plsql-analysis.md','.tic-code/reverse-engineering/database/README.md','.tic-code/reverse-engineering/database/tables.md','.tic-code/reverse-engineering/database/views.md','.tic-code/reverse-engineering/database/procedures.md','.tic-code/reverse-engineering/database/functions.md','.tic-code/reverse-engineering/database/triggers.md','.tic-code/reverse-engineering/database/packages.md'] }),
    designSystem: mkAgent(now, { id: 'designSystem', name: 'Design System', role: 'Tokens e componentes de UI', executionMode: 'deterministic', generatedFiles: ['.tic-code/reverse-engineering/design-system/tokens.md', '.tic-code/reverse-engineering/design-system/components.md', '.tic-code/reverse-engineering/design-system/themes.md'] }),
    chronicler: mkAgent(now, { id: 'chronicler', name: 'Chronicler', role: 'Histórico e changelog', executionMode: 'deterministic', generatedFiles: ['.tic-code/reversa/chronicler/session.md', '.tic-code/reversa/chronicler/history.json', '.tic-code/reverse-engineering/changelog.md'] })
  };

  return {
    version: '1.2.0', project: summary.workspaceName, engine: 'tic-coder-lite', docLevel: 'completo',
    outputFolder: '.tic-code/reverse-engineering', contextDir: '.tic-code/reversa/context',
    phase: 'review', completed: ['reconnaissance', 'excavation', 'interpretation', 'synthesis', 'generation', 'review', 'data'], pending: [], phases: [], agents,
    checkpoints: {}, createdFiles: Object.values(agents).flatMap((a) => a.generatedFiles), createdAt: now, updatedAt: now,
    agentFiles: ['AGENTS.md', 'CLAUDE.md', '.github/copilot-instructions.md', '.cursorrules', 'GEMINI.md']
  };
}
