/**
 * Gera .tic-code/reversa/state.json — estado da pipeline do motor Reversa.
 * Equivalente ao .reversa/state.json do Reversa original.
 * Créditos: Reversa by Sandeco — MIT License (adapted)
 */

import type { ProjectSummary } from '../types';
import type { ReversaState, ReversaPhase, ReversaPhaseId } from './reversaEngineTypes';

const ALL_PHASES: Array<{ id: ReversaPhaseId; label: string; agent: string }> = [
  { id: 'reconnaissance', label: 'Scout', agent: 'reversa-scout' },
  { id: 'excavation', label: 'Archaeologist', agent: 'reversa-archaeologist' },
  { id: 'interpretation', label: 'Detective', agent: 'reversa-detective' },
  { id: 'synthesis', label: 'Architect', agent: 'reversa-architect' },
  { id: 'generation', label: 'Writer', agent: 'reversa-writer' },
  { id: 'review', label: 'Reviewer', agent: 'reversa-reviewer' },
  { id: 'data', label: 'Data Master', agent: 'reversa-data-master' }
];

/**
 * Gera o state.json inicial para um projeto.
 * O TIC Coder Lite executa automaticamente as fases determinísticas
 * (reconnaissance + parte da excavation). As fases de IA são marcadas como pending.
 */
export function generateReversaState(summary: ProjectSummary): ReversaState {
  const now = new Date().toISOString();

  // Fases completadas deterministicamente pelo TIC Coder Lite
  const deterministicPhases: ReversaPhaseId[] = ['reconnaissance'];
  const runningPhase: ReversaPhaseId = 'excavation';

  const phases: ReversaPhase[] = ALL_PHASES.map((p) => {
    if (deterministicPhases.includes(p.id)) {
      return {
        ...p,
        status: 'completed',
        completedAt: now,
        artifacts: getPhaseArtifacts(p.id)
      };
    }
    if (p.id === runningPhase) {
      return {
        ...p,
        status: 'running',
        artifacts: getPhaseArtifacts(p.id)
      };
    }
    return { ...p, status: 'pending' };
  });

  const createdFiles = [
    '.tic-code/reversa/state.json',
    '.tic-code/reversa/config.json',
    '.tic-code/reversa/plan.md',
    '.tic-code/reversa/version',
    '.tic-code/reversa/context/surface.json',
    '.tic-code/reversa/context/modules.json',
    '.tic-code/reversa/context/graph.json',
    '.tic-code/reversa/context/risks.json',
    '.tic-code/reversa/context/workspace-summary.json',
    '.tic-code/reverse-engineering/inventory.md',
    '.tic-code/reverse-engineering/code-analysis.md',
    '.tic-code/reverse-engineering/architecture.md',
    '.tic-code/reverse-engineering/confidence-report.md',
    '.tic-code/reverse-engineering/gaps.md',
    '.tic-code/reverse-engineering/questions.md'
  ];

  return {
    version: '1.1.0',
    project: summary.workspaceName,
    engine: 'tic-coder-lite',
    docLevel: 'completo',
    outputFolder: '.tic-code/reverse-engineering',
    contextDir: '.tic-code/reversa/context',
    phase: runningPhase,
    completed: deterministicPhases,
    pending: ALL_PHASES.filter((p) => !deterministicPhases.includes(p.id) && p.id !== runningPhase).map((p) => p.id),
    phases,
    checkpoints: {
      scout: {
        completedAt: now,
        files: [
          '.tic-code/reverse-engineering/inventory.md',
          '.tic-code/reverse-engineering/dependencies.md',
          '.tic-code/reversa/context/surface.json'
        ]
      }
    },
    createdFiles,
    createdAt: now,
    updatedAt: now
  };
}

function getPhaseArtifacts(phaseId: ReversaPhaseId): string[] {
  const map: Partial<Record<ReversaPhaseId, string[]>> = {
    reconnaissance: [
      '.tic-code/reverse-engineering/inventory.md',
      '.tic-code/reverse-engineering/dependencies.md',
      '.tic-code/reversa/context/surface.json'
    ],
    excavation: [
      '.tic-code/reverse-engineering/code-analysis.md',
      '.tic-code/reverse-engineering/data-dictionary.md',
      '.tic-code/reversa/context/modules.json'
    ],
    interpretation: [
      '.tic-code/reverse-engineering/domain.md',
      '.tic-code/reverse-engineering/state-machines.md',
      '.tic-code/reverse-engineering/permissions.md',
      '.tic-code/reverse-engineering/business-rules.md'
    ],
    synthesis: [
      '.tic-code/reverse-engineering/architecture.md',
      '.tic-code/reverse-engineering/c4-context.md',
      '.tic-code/reverse-engineering/c4-containers.md'
    ],
    generation: [
      '.tic-code/reverse-engineering/operational-contracts.md',
      '.tic-code/reverse-engineering/traceability/code-spec-matrix.md'
    ],
    review: [
      '.tic-code/reverse-engineering/confidence-report.md',
      '.tic-code/reverse-engineering/gaps.md',
      '.tic-code/reverse-engineering/questions.md'
    ],
    data: [
      '.tic-code/reverse-engineering/erd-complete.md',
      '.tic-code/reverse-engineering/database/'
    ]
  };
  return map[phaseId] ?? [];
}
