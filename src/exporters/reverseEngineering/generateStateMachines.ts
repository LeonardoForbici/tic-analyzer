/**
 * Gerador de máquinas de estado candidatas para Programação Reversa
 * Inspiração: Detective do Reversa by Sandeco (MIT)
 */

import type { ReverseEngineeringInput, StateMachineCandidate, StateTransition } from './reverseEngineeringTypes';

const STATUS_FIELD_PATTERN = /\b(status|estado|situacao|situation|phase|fase|stage)\b/i;

export function generateStateMachines(input: ReverseEngineeringInput): StateMachineCandidate[] {
  const { inventory, plsql } = input;
  const candidates: StateMachineCandidate[] = [];

  // Detectar enums de status em Java/Spring
  const entityFiles = inventory.javaSpring.files.filter(
    (f) => f.kind === 'entity' || f.path.toLowerCase().includes('status') || f.path.toLowerCase().includes('enum')
  );

  for (const file of entityFiles) {
    const entityName = file.className;

    // Se o arquivo de entity tem referências a status
    if (STATUS_FIELD_PATTERN.test(file.path) || file.className.toLowerCase().includes('status')) {
      // Inferir transições baseadas em convenções comuns
      const states = inferStatesFromName(entityName);
      if (states.length > 1) {
        candidates.push({
          entity: entityName,
          states,
          transitions: buildTransitions(states, [file.path]),
          sourceFiles: [file.path],
          confidence: 'inferido'
        });
      }
    }
  }

  // Detectar máquinas de estado em PL/SQL (triggers + procedures que mudam status)
  const triggersByTable = new Map<string, string[]>();
  for (const entity of plsql.entities) {
    if (entity.kind === 'trigger' && entity.targetTable) {
      const list = triggersByTable.get(entity.targetTable) ?? [];
      list.push(entity.file);
      triggersByTable.set(entity.targetTable, list);
    }
  }

  for (const [table, files] of triggersByTable.entries()) {
    const states = inferStatesFromTableName(table);
    if (states.length > 1) {
      candidates.push({
        entity: `Tabela ${table}`,
        states,
        transitions: buildTransitions(states, files),
        sourceFiles: files,
        confidence: 'inferido'
      });
    }
  }

  // Buscar em tabelas com colunas de status
  for (const table of plsql.tableReferences) {
    if (STATUS_FIELD_PATTERN.test(table.name)) {
      const states = ['ATIVO', 'INATIVO', 'CANCELADO'];
      candidates.push({
        entity: `Tabela ${table.name}`,
        states,
        transitions: buildTransitions(states, table.files),
        sourceFiles: table.files,
        confidence: 'inferido'
      });
    }
  }

  return candidates.slice(0, 15);
}

export function renderStateMachinesMd(machines: StateMachineCandidate[], projectName: string): string {
  const lines: string[] = [];
  lines.push(`# Máquinas de Estado Candidatas: ${projectName}`);
  lines.push('');
  lines.push('> Detectadas por análise determinística de enums, campos status, triggers e procedures.');
  lines.push('> Gerado por TIC Coder Lite — Modo Lite.');
  lines.push('> Inspiração metodológica: Detective do Reversa by Sandeco (MIT).');
  lines.push('');
  lines.push('> ⚠️ Todas as transições abaixo são 🟡 INFERIDAS — valide com o especialista antes de alterar fluxos.');
  lines.push('');

  if (machines.length === 0) {
    lines.push('- Nenhuma máquina de estado candidata detectada 🔴 LACUNA');
    lines.push('');
    lines.push('**Perguntas:**');
    lines.push('- Quais entidades possuem campo de status neste sistema?');
    lines.push('- Quais são os estados possíveis de cada entidade principal?');
    return lines.join('\n');
  }

  for (const machine of machines) {
    const badge = machine.confidence === 'confirmado' ? '🟢 CONFIRMADO' : '🟡 INFERIDO';
    lines.push(`## ${machine.entity} ${badge}`);
    lines.push('');
    lines.push(`Estados detectados: ${machine.states.join(', ')}`);
    lines.push('');

    if (machine.transitions.length > 0) {
      lines.push('### Diagrama de estados (Mermaid)');
      lines.push('');
      lines.push('```mermaid');
      lines.push('stateDiagram-v2');
      for (const t of machine.transitions) {
        const confidence = t.confidence === 'confirmado' ? '' : ' %% 🟡 INFERIDO';
        lines.push(`  ${t.from} --> ${t.to}${confidence}`);
      }
      lines.push('```');
      lines.push('');
    }

    if (machine.sourceFiles.length > 0) {
      lines.push('Evidências:');
      for (const f of machine.sourceFiles.slice(0, 5)) {
        lines.push(`- ${f}`);
      }
      lines.push('');
    }

    lines.push('**Perguntas de validação:**');
    lines.push(`- Todas as transições possíveis para ${machine.entity} estão mapeadas?`);
    lines.push(`- Há transições reversas (ex.: CANCELADO → ATIVO)?`);
    lines.push('');
  }

  return lines.join('\n');
}

function inferStatesFromName(entityName: string): string[] {
  const lower = entityName.toLowerCase();

  if (lower.includes('fatura') || lower.includes('invoice') || lower.includes('boleto')) {
    return ['ABERTA', 'PAGA', 'VENCIDA', 'CANCELADA'];
  }
  if (lower.includes('pedido') || lower.includes('order')) {
    return ['PENDENTE', 'EM_ANDAMENTO', 'APROVADO', 'REJEITADO', 'CANCELADO', 'FINALIZADO'];
  }
  if (lower.includes('usuario') || lower.includes('user') || lower.includes('conta') || lower.includes('account')) {
    return ['ATIVO', 'INATIVO', 'BLOQUEADO', 'SUSPENSO'];
  }
  if (lower.includes('status') || lower.includes('estado')) {
    return ['ATIVO', 'INATIVO', 'CANCELADO'];
  }

  return [];
}

function inferStatesFromTableName(tableName: string): string[] {
  return inferStatesFromName(tableName);
}

function buildTransitions(states: string[], files: string[]): StateTransition[] {
  const transitions: StateTransition[] = [];

  for (let i = 0; i < states.length - 1; i++) {
    transitions.push({
      from: states[i]!,
      to: states[i + 1]!,
      evidence: files.slice(0, 2),
      confidence: 'inferido'
    });
  }

  // Adicionar transição para cancelado se aplicável
  if (states.includes('CANCELADO') || states.includes('CANCELADA')) {
    const cancelState = states.find((s) => s.startsWith('CANCEL')) ?? '';
    for (const s of states) {
      if (!s.startsWith('CANCEL') && !s.startsWith('FINALIZ') && !s.startsWith('PAGO') && !s.startsWith('PAGA')) {
        transitions.push({
          from: s,
          to: cancelState,
          evidence: files.slice(0, 2),
          confidence: 'inferido'
        });
      }
    }
  }

  return transitions;
}
