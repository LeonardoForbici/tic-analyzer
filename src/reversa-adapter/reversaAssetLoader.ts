/**
 * Loader dos assets do Reversa empacotados em resources/reversa/
 *
 * Lê os SKILL.md dos agentes do Reversa e os usa como base metodológica
 * para gerar contratos operacionais, prompts e instruções de agentes no TIC Coder Lite.
 *
 * Créditos: Reversa by Sandeco — MIT License
 * Fonte: resources/reversa/agents/ e resources/reversa/docs/agents/
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

export interface ReversaAgentSkill {
  name: string;
  description: string;
  phase: string;
  content: string;
}

export interface ReversaAssets {
  agents: Record<string, ReversaAgentSkill>;
  confidenceScale: string;
  pipelineDocs: string;
}

const AGENT_NAMES = [
  'reversa',
  'reversa-scout',
  'reversa-archaeologist',
  'reversa-detective',
  'reversa-architect',
  'reversa-writer',
  'reversa-reviewer',
  'reversa-data-master',
  'reversa-reconstructor'
] as const;

export type ReversaAgentName = (typeof AGENT_NAMES)[number];

/** Retorna o caminho base para resources/reversa relativo à extensão */
function getResourcesBase(extensionUri?: vscode.Uri): string {
  if (extensionUri) {
    return path.join(extensionUri.fsPath, 'resources', 'reversa');
  }
  // Fallback: relativo ao arquivo compilado em dist/
  return path.join(__dirname, '..', 'resources', 'reversa');
}

/** Carrega um SKILL.md de agente específico */
function loadSkillMd(base: string, agentName: string): string {
  const skillPath = path.join(base, 'agents', agentName, 'SKILL.md');
  try {
    return fs.readFileSync(skillPath, 'utf8');
  } catch {
    return '';
  }
}

/** Extrai metadata do frontmatter YAML de um SKILL.md */
function extractMetadata(content: string): { name: string; description: string; phase: string } {
  const nameMatch = content.match(/^name:\s*(.+)$/m);
  const descMatch = content.match(/^description:\s*(.+)$/m);
  const phaseMatch = content.match(/^  phase:\s*(.+)$/m);
  return {
    name: nameMatch?.[1]?.trim() ?? '',
    description: descMatch?.[1]?.trim() ?? '',
    phase: phaseMatch?.[1]?.trim() ?? ''
  };
}

/** Extrai o corpo do SKILL.md (sem frontmatter YAML) */
function extractBody(content: string): string {
  if (!content.startsWith('---')) return content;
  const secondDash = content.indexOf('---', 3);
  if (secondDash < 0) return content;
  return content.slice(secondDash + 3).trim();
}

/** Adapta referências do Reversa para TIC Coder Lite */
export function adaptReversaReferences(text: string): string {
  return text
    .replace(/`\.reversa\/state\.json`/g, '`.tic-code/agent-context.md`')
    .replace(/`\.reversa\/context\//g, '`.tic-code/')
    .replace(/`\.reversa\//g, '`.tic-code/')
    .replace(/\.reversa\//g, '.tic-code/')
    .replace(/`_reversa_sdd\//g, '`.tic-code/reverse-engineering/')
    .replace(/_reversa_sdd\//g, '.tic-code/reverse-engineering/')
    .replace(/\/reversa\b/g, 'TIC Coder Lite: Analisar Workspace')
    .replace(/`npx reversa install`/g, '`Instalar Extensão TIC Coder Lite`')
    .replace(/`npx reversa update`/g, '`Atualizar TIC Coder Lite`')
    .replace(/npx reversa /g, 'TIC Coder Lite: ')
    .replace(/Reversa CLI/g, 'TIC Coder Lite VS Code Extension')
    .replace(/`reversa-scout`/g, 'Scanner (TIC Coder Lite)')
    .replace(/`reversa-archaeologist`/g, 'Archaeologist (TIC Coder Lite)')
    .replace(/`reversa-detective`/g, 'Detective (TIC Coder Lite)')
    .replace(/`reversa-architect`/g, 'Architect (TIC Coder Lite)')
    .replace(/`reversa-writer`/g, 'Writer (TIC Coder Lite)')
    .replace(/`reversa-reviewer`/g, 'Reviewer (TIC Coder Lite)')
    .replace(/`reversa-data-master`/g, 'Data Master (TIC Coder Lite)');
}

/** Carrega todos os assets do Reversa */
export function loadReversaAssets(extensionUri?: vscode.Uri): ReversaAssets {
  const base = getResourcesBase(extensionUri);

  const agents: Record<string, ReversaAgentSkill> = {};
  for (const agentName of AGENT_NAMES) {
    const raw = loadSkillMd(base, agentName);
    if (!raw) continue;
    const meta = extractMetadata(raw);
    agents[agentName] = {
      name: meta.name || agentName,
      description: meta.description,
      phase: meta.phase,
      content: adaptReversaReferences(extractBody(raw))
    };
  }

  // Escala de confiança (EN — base)
  let confidenceScale = '';
  try {
    confidenceScale = fs.readFileSync(path.join(base, 'docs', 'escala-confianca.md'), 'utf8');
  } catch {
    try {
      confidenceScale = fs.readFileSync(path.join(base, 'docs', 'escala-confianca.pt.md'), 'utf8');
    } catch {
      confidenceScale = '';
    }
  }

  // Pipeline
  let pipelineDocs = '';
  try {
    pipelineDocs = fs.readFileSync(path.join(base, 'docs', 'pipeline.md'), 'utf8');
  } catch {
    pipelineDocs = '';
  }

  return { agents, confidenceScale, pipelineDocs };
}

/** Retorna true se os assets do Reversa estão disponíveis */
export function reversaAssetsAvailable(extensionUri?: vscode.Uri): boolean {
  const base = getResourcesBase(extensionUri);
  return fs.existsSync(path.join(base, 'agents', 'reversa', 'SKILL.md'));
}
