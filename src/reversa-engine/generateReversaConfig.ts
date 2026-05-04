/**
 * Gera .tic-code/reversa/config.json — configuração do motor Reversa.
 * Créditos: Reversa by Sandeco — MIT License (adapted)
 */

import type { ProjectSummary } from '../types';
import type { ReversaConfig } from './reversaEngineTypes';
import { getTicCoderLiteConfig } from '../utils/config';

export function generateReversaConfig(summary: ProjectSummary): ReversaConfig {
  const cfg = getTicCoderLiteConfig();
  const detectedEngines = (summary.detectedAgentEngines ?? [])
    .filter((e) => e.detected)
    .map((e) => e.id);

  return {
    projectName: summary.workspaceName,
    rootPath: summary.rootPath,
    outputDir: '.tic-code/reverse-engineering',
    contextDir: '.tic-code/reversa/context',
    reversaDir: '.tic-code/reversa',
    engines: detectedEngines.length > 0 ? detectedEngines : ['github-copilot'],
    localAi: {
      enabled: cfg.localAi?.enabled ?? false,
      defaultModel: 'qwen2.5-coder:3b',
      qualityModel: 'qwen2.5-coder:7b'
    },
    createdAt: new Date().toISOString()
  };
}

/** Renderiza o manifest YAML para .tic-code/reversa/_config/manifest.yaml */
export function renderManifestYaml(summary: ProjectSummary): string {
  const config = generateReversaConfig(summary);
  return [
    '# TIC Coder Lite — Reversa Engine Manifest',
    `# Generated: ${config.createdAt}`,
    '# Credits: Reversa by Sandeco (MIT)',
    '',
    `project: "${config.projectName}"`,
    `root_path: "${config.rootPath}"`,
    `output_dir: "${config.outputDir}"`,
    `context_dir: "${config.contextDir}"`,
    `reversa_dir: "${config.reversaDir}"`,
    '',
    'engines:',
    ...config.engines.map((e) => `  - ${e}`),
    '',
    'local_ai:',
    `  enabled: ${config.localAi.enabled}`,
    `  default_model: "${config.localAi.defaultModel}"`,
    `  quality_model: "${config.localAi.qualityModel}"`,
    ''
  ].join('\n');
}
