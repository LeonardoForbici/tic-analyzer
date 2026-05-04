/**
 * Cria a estrutura de pastas e arquivos .tic-code/reverse-engineering/
 * equivalente ao _reversa_sdd/ do Reversa original.
 * Créditos: Reversa by Sandeco — MIT License (adapted)
 */

import * as vscode from 'vscode';
import type { ProjectSummary } from '../types';
import { SDD_DIRS, toWorkspaceUri } from './embeddedReversaPaths';

/**
 * Garante que todas as subpastas do SDD existam.
 * Não sobrescreve arquivos existentes — apenas cria estrutura de pastas
 * e arquivos stub onde necessário.
 */
export async function generateReversaSddStructure(
  root: vscode.WorkspaceFolder,
  summary: ProjectSummary
): Promise<void> {
  // Criar todas as subpastas
  for (const dir of SDD_DIRS) {
    const uri = toWorkspaceUri(root, dir);
    await vscode.workspace.fs.createDirectory(uri);
  }

  // Criar arquivos stub apenas se não existirem
  const stubs = buildStubFiles(summary);
  for (const [relativePath, content] of stubs) {
    const uri = toWorkspaceUri(root, relativePath);
    if (!(await exists(uri))) {
      await writeText(uri, content);
    }
  }
}

function buildStubFiles(summary: ProjectSummary): Map<string, string> {
  const stubs = new Map<string, string>();
  const project = summary.workspaceName;
  const now = new Date().toISOString();
  const badge = (label: string, confidence: string) => `**${label}** ${confidence}`;

  stubs.set('.tic-code/reverse-engineering/data-dictionary.md', buildDataDictionary(summary));
  stubs.set('.tic-code/reverse-engineering/state-machines.md', buildStateMachines(summary, project, now));
  stubs.set('.tic-code/reverse-engineering/permissions.md', buildPermissions(project, now));
  stubs.set('.tic-code/reverse-engineering/c4-context.md', buildC4Context(project, now));
  stubs.set('.tic-code/reverse-engineering/c4-containers.md', buildC4Containers(project, now));
  stubs.set('.tic-code/reverse-engineering/c4-components.md', buildC4Components(project, now));
  stubs.set('.tic-code/reverse-engineering/erd-complete.md', buildErdComplete(summary, now));
  stubs.set('.tic-code/reverse-engineering/dynamic.md', buildDynamic(project, now));
  stubs.set('.tic-code/reverse-engineering/traceability/spec-impact-matrix.md', buildSpecImpactMatrix(project, now));
  stubs.set('.tic-code/reverse-engineering/adrs/.gitkeep', '');
  stubs.set('.tic-code/reverse-engineering/flowcharts/.gitkeep', '');
  stubs.set('.tic-code/reverse-engineering/sequences/.gitkeep', '');
  stubs.set('.tic-code/reverse-engineering/ui/.gitkeep', '');
  stubs.set('.tic-code/reverse-engineering/design-system/.gitkeep', '');
  stubs.set('.tic-code/reverse-engineering/openapi/.gitkeep', '');
  stubs.set('.tic-code/reverse-engineering/user-stories/.gitkeep', '');

  void badge; // suppress unused warning
  return stubs;
}

function buildDataDictionary(summary: ProjectSummary): string {
  const plsql = summary.inventory.plsql;
  const lines = [
    '# Dicionário de Dados',
    '',
    `> Gerado em: ${new Date().toISOString()} | Confiança geral: 🟡 INFERIDO`,
    '> TIC Coder Lite — Reversa Engine (MIT by Sandeco)',
    '',
    '---',
    ''
  ];

  if (plsql.detected && plsql.tableReferences.length > 0) {
    lines.push('## Tabelas Referenciadas no Código');
    lines.push('');
    lines.push('| Tabela | Arquivo(s) | Confiança |');
    lines.push('| --- | --- | --- |');
    for (const t of plsql.tableReferences.slice(0, 20)) {
      lines.push(`| \`${t.name}\` | ${t.files?.join(', ') ?? '?'} | 🟡 |`);
    }
    if (plsql.tableReferences.length > 20) {
      lines.push('', `> ... e mais ${plsql.tableReferences.length - 20} tabelas. Ver \`.tic-code/reverse-engineering/database/\``);
    }
  } else {
    lines.push('## Entidades');
    lines.push('');
    lines.push('🔴 **LACUNA** — Nenhuma tabela/entidade detectada por análise estática.');
    lines.push('');
    lines.push('> Ação: Adicione arquivos de schema, migrations ou DDL ao projeto para análise automática.');
  }

  return lines.join('\n') + '\n';
}

function buildStateMachines(_summary: ProjectSummary, project: string, now: string): string {
  return [
    '# Máquinas de Estado',
    '',
    `> Gerado em: ${now} | Projeto: ${project}`,
    '> TIC Coder Lite — Reversa Engine (MIT by Sandeco)',
    '',
    '---',
    '',
    '## Status',
    '',
    '🔴 **LACUNA** — Máquinas de estado não foram detectadas por análise estática.',
    '',
    '> Requer análise por agente Detective (reversa-detective) para mapear:',
    '> - Campos de status/state em entidades',
    '> - Transições e gatilhos',
    '> - Diagrama Mermaid por entidade',
    '',
    '## Template de Máquina de Estado',
    '',
    '```mermaid',
    'stateDiagram-v2',
    '  [*] --> Estado1',
    '  Estado1 --> Estado2 : evento/gatilho',
    '  Estado2 --> [*] : finalizado',
    '```',
    ''
  ].join('\n');
}

function buildPermissions(project: string, now: string): string {
  return [
    '# Permissões e Papéis',
    '',
    `> Gerado em: ${now} | Projeto: ${project}`,
    '> TIC Coder Lite — Reversa Engine (MIT by Sandeco)',
    '',
    '---',
    '',
    '## Status',
    '',
    '🔴 **LACUNA** — Sistema de permissões não mapeado por análise estática.',
    '',
    '> Requer análise por agente Detective (reversa-detective) para mapear:',
    '> - Papéis (roles) do sistema',
    '> - Permissões por papel',
    '> - Restrições de acesso a features e dados',
    '',
    '## Template de Matriz de Permissões',
    '',
    '| Papel | Feature A | Feature B | Feature C |',
    '| --- | --- | --- | --- |',
    '| Admin | ✅ | ✅ | ✅ |',
    '| User | ✅ | ❌ | 🟡 |',
    ''
  ].join('\n');
}

function buildC4Context(project: string, now: string): string {
  return [
    '# C4 — Context Diagram',
    '',
    `> Gerado em: ${now} | Projeto: ${project}`,
    '> TIC Coder Lite — Reversa Engine (MIT by Sandeco)',
    '',
    '---',
    '',
    '## Status: 🟡 INFERIDO',
    '',
    '> Diagrama C4 de contexto inferido do scanner. Validar com equipe.',
    '',
    '```mermaid',
    'C4Context',
    `  title Context Diagram — ${project}`,
    `  System(system, "${project}", "Sistema analisado")`,
    '  Person(user, "Usuário", "Interage com o sistema")',
    '  Rel(user, system, "Usa")',
    '```',
    '',
    '> Para C4 completo, use o agente reversa-architect com acesso ao código.',
    ''
  ].join('\n');
}

function buildC4Containers(project: string, now: string): string {
  return [
    '# C4 — Containers Diagram',
    '',
    `> Gerado em: ${now} | Projeto: ${project}`,
    '> TIC Coder Lite — Reversa Engine (MIT by Sandeco)',
    '',
    '---',
    '',
    '## Status: 🔴 LACUNA',
    '',
    '> Diagrama de containers requer análise detalhada por reversa-architect.',
    '> Execute a fase de síntese com agente IA para gerar este artefato.',
    ''
  ].join('\n');
}

function buildC4Components(project: string, now: string): string {
  return [
    '# C4 — Components Diagram',
    '',
    `> Gerado em: ${now} | Projeto: ${project}`,
    '> TIC Coder Lite — Reversa Engine (MIT by Sandeco)',
    '',
    '---',
    '',
    '## Status: 🔴 LACUNA',
    '',
    '> Diagrama de componentes requer análise detalhada por reversa-architect.',
    '> Execute a fase de síntese com agente IA para gerar este artefato.',
    ''
  ].join('\n');
}

function buildErdComplete(summary: ProjectSummary, now: string): string {
  const plsql = summary.inventory.plsql;
  if (!plsql.detected) {
    return [
      '# ERD Completo',
      '',
      `> Gerado em: ${now}`,
      '> TIC Coder Lite — Reversa Engine (MIT by Sandeco)',
      '',
      '## Status: 🔴 LACUNA',
      '',
      'Nenhum banco de dados detectado. Se o projeto usa banco relacional:',
      '- Adicione arquivos de migrations, DDL ou schema',
      '- Execute o Data Master com agente IA',
      ''
    ].join('\n');
  }

  const tables = plsql.tableReferences.slice(0, 10).map((t) => t.name);
  return [
    '# ERD Completo',
    '',
    `> Gerado em: ${now} | Confiança: 🟡 INFERIDO`,
    '> TIC Coder Lite — Reversa Engine (MIT by Sandeco)',
    '',
    '```mermaid',
    'erDiagram',
    ...tables.map((t) => `  ${t} {`),
    ...tables.map(() => '    string id PK'),
    ...tables.map(() => '  }'),
    '```',
    '',
    '> ERD inferido de referências SQL. Validar com schema real.',
    ''
  ].join('\n');
}

function buildDynamic(project: string, now: string): string {
  return [
    '# Análise Dinâmica',
    '',
    `> Gerado em: ${now} | Projeto: ${project}`,
    '> TIC Coder Lite — Reversa Engine (MIT by Sandeco)',
    '',
    '## Status: 🔴 LACUNA',
    '',
    '> Análise dinâmica (fluxos de execução, sequências, chamadas em runtime) requer',
    '> análise por agente IA (reversa-archaeologist) ou instrumentação manual.',
    '',
    '## Sequências Detectadas',
    '',
    '> Adicione diagramas de sequência em `.tic-code/reverse-engineering/sequences/`',
    ''
  ].join('\n');
}

function buildSpecImpactMatrix(project: string, now: string): string {
  return [
    '# Spec Impact Matrix',
    '',
    `> Gerado em: ${now} | Projeto: ${project}`,
    '> TIC Coder Lite — Reversa Engine (MIT by Sandeco)',
    '',
    '## Status: 🔴 LACUNA',
    '',
    '> A Spec Impact Matrix mapeia: "Se esta spec mudar, quais outros componentes são impactados?"',
    '> Requer análise por agente Writer (reversa-writer) após SDDs estarem completos.',
    '',
    '## Template',
    '',
    '| Spec | Componentes Impactados | Risco de Quebra | Confiança |',
    '| --- | --- | --- | --- |',
    '| `sdd/componente-a.md` | Componente B, C | Alto | 🟡 |',
    ''
  ].join('\n');
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function writeText(uri: vscode.Uri, content: string): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
}
