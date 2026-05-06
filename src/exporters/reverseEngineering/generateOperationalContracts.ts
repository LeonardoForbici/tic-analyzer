/**
 * Gerador de contratos operacionais por módulo para Programação Reversa
 * Inspiração: Architect / Reversa Reconstructor do Reversa by Sandeco (MIT)
 *
 * Contratos operacionais descrevem COMO cada módulo funciona do ponto de vista
 * de um agente de IA que precisa trabalhar com o código de forma segura.
 */

import type { ReverseEngineeringInput, OperationalContract, BusinessRuleCandidate } from './reverseEngineeringTypes';
import { classifyFileToModule } from './generateCodeAnalysis';

/**
 * Metadados estáticos de módulos para o TIC Coder Lite.
 * Complementados com dados detectados dinamicamente.
 */
const KNOWN_MODULE_METADATA: Record<string, {
  responsibility: string;
  inputs: string[];
  outputs: string[];
  agentInstructions: string[];
}> = {
  'Scanner': {
    responsibility: 'Varre o workspace, detecta arquivos, calcula métricas e constrói o grafo de dependências.',
    inputs: ['Pasta raiz do workspace', 'Configuração de ignore rules', 'Token de cancelamento'],
    outputs: ['ScanResult (lista de arquivos)', 'LightweightGraph (nós e arestas)', 'ArchitectureInventory'],
    agentInstructions: [
      'Não altere ignoreRules.ts sem entender o impacto nos arquivos detectados.',
      'Modificações em buildGraph.ts afetam a análise de dependências e circularidade.',
      'scanFiles.ts define quais extensões são suportadas — adicionar extensões pode aumentar o tempo de análise.'
    ]
  },
  'Programação Reversa': {
    responsibility: 'Orquestra a geração de todos os artefatos SDD em .tic-code/reverse-engineering/.',
    inputs: ['ProjectSummary', 'ScanResult', 'ArchitectureInventory', 'RiskReport', 'LightweightGraph'],
    outputs: [
      'business-rules.md', 'operational-contracts.md', 'code-analysis.md',
      'domain.md', 'confidence-report.md', 'gaps.md', 'questions.md',
      'traceability/code-spec-matrix.md', 'traceability/risk-impact-matrix.md'
    ],
    agentInstructions: [
      'generateReverseEngineering.ts é o orquestrador — modifique-o para adicionar novos artefatos.',
      'Cada gerador é independente — mudanças em um não afetam os outros diretamente.',
      'Nunca gere regras de negócio a partir de riscos técnicos (TODO, any, lock files).',
      'Leia reverseEngineeringTypes.ts para entender os tipos antes de modificar geradores.'
    ]
  },
  'Exportadores': {
    responsibility: 'Escreve os artefatos gerados no sistema de arquivos do workspace via VS Code API.',
    inputs: ['Dados gerados pelos geradores de programação reversa', 'Caminho raiz do workspace'],
    outputs: ['Arquivos .md em .tic-code/', 'Arquivos de contexto para agentes de IA'],
    agentInstructions: [
      'writeTicCodeFolder.ts é o entry point principal — modifique para adicionar novos artefatos.',
      'Use vscode.workspace.fs para escrita (não fs do Node) para manter compatibilidade com VS Code.',
      'Valide que o diretório existe antes de escrever (createDirectory).'
    ]
  },
  'WebView': {
    responsibility: 'Renderiza o painel overview do TIC Coder Lite dentro do VS Code.',
    inputs: ['ProjectSummary', 'RiskReport', 'LightweightGraph'],
    outputs: ['HTML do painel WebView', 'Visualização do grafo de dependências', 'Busca de banco de dados'],
    agentInstructions: [
      'webviewAssets.ts gera conteúdo HTML/CSS/JS — não é código de negócio, é UI.',
      'Não marque strings HTML/CSS desta pasta como SQL crítico — são templates de UI.',
      'overviewPanel.ts gerencia o ciclo de vida do WebView — não feche sem limpar o painel.',
      'Mensagens entre WebView e extension passam por onDidReceiveMessage/postMessage.'
    ]
  },
  'IA Local': {
    responsibility: 'Integração opcional com Ollama para melhorar textos gerados localmente.',
    inputs: ['Artefatos de programação reversa gerados', 'URL e modelo Ollama configurados'],
    outputs: ['Textos enriquecidos com contexto de IA local'],
    agentInstructions: [
      'IA Local é OPCIONAL — o TIC Coder Lite funciona completamente sem ela.',
      'Nunca torne a IA Local obrigatória ou bloqueie o fluxo principal se ela falhar.',
      'checkOllamaStatus.ts verifica disponibilidade antes de qualquer chamada.',
      'Não introduza modelos grandes (>7B) como padrão — comece com qwen2.5-coder:3b.'
    ]
  },
  'Reversa Adapter': {
    responsibility: 'Exporta o contexto gerado para formatos compatíveis com agentes de IA externos.',
    inputs: ['ProjectSummary', 'RiskReport'],
    outputs: [
      'AGENTS.md (Codex)', 'CLAUDE.md (Claude)', '.github/copilot-instructions.md (Copilot)',
      '.cursorrules (Cursor)', 'GEMINI.md (Gemini)'
    ],
    agentInstructions: [
      'Cada arquivo de saída tem formato diferente — veja o gerador específico antes de modificar.',
      'safeWriter.ts garante escrita segura sem sobrescrever conteúdo customizado do usuário.',
      'Não introduza dependências externas, RAG, banco ou servidor neste módulo.'
    ]
  },
  'Comandos VS Code': {
    responsibility: 'Registra e executa os comandos do TIC Coder Lite no VS Code.',
    inputs: ['Contexto do VS Code (workspace, configuração)', 'Eventos de ativação'],
    outputs: ['Análise do projeto', 'Exportação para IA', 'Abertura do painel overview'],
    agentInstructions: [
      'Comandos são registrados em extension.ts — adicione ao package.json também.',
      'analyzeProject.ts é o comando principal — cuidado ao alterar o fluxo de análise.',
      'Sempre mostre progresso ao usuário para operações longas (vscode.window.withProgress).'
    ]
  },
  'Utilitários': {
    responsibility: 'Funções auxiliares compartilhadas por todos os módulos.',
    inputs: ['Variados — cada utilitário tem sua entrada'],
    outputs: ['Funções puras e helpers reutilizáveis'],
    agentInstructions: [
      'Utilitários são usados por todo o projeto — mudanças podem ter impacto amplo.',
      'config.ts lê configurações do VS Code — use getConfig() em vez de acessar a API diretamente.',
      'outputChannel.ts gerencia o canal de log — prefira-o a console.log.'
    ]
  }
};

export function generateOperationalContracts(
  input: ReverseEngineeringInput,
  businessRules: BusinessRuleCandidate[]
): OperationalContract[] {
  const { scan, graph, risks } = input;
  const contracts: OperationalContract[] = [];

  // Agrupar arquivos por módulo
  const moduleFiles = new Map<string, { kind: string; files: string[] }>();
  for (const file of (input.files ?? scan.files)) {
    const lower = file.relativePath.toLowerCase();
    if (
      lower.includes('node_modules/') ||
      lower.includes('/dist/') ||
      lower.includes('/build/') ||
      lower.endsWith('.map') ||
      lower.endsWith('.min.js') ||
      lower.endsWith('package-lock.json') ||
      lower.endsWith('yarn.lock')
    ) {
      continue;
    }
    const { name, kind } = classifyFileToModule(file.relativePath);
    const entry = moduleFiles.get(name) ?? { kind, files: [] };
    if (entry.files.length < 20) entry.files.push(file.relativePath);
    moduleFiles.set(name, entry);
  }

  // Calcular dependências internas via grafo
  for (const [moduleName, { kind, files }] of moduleFiles.entries()) {
    if (files.length === 0) continue;

    const fileSet = new Set(files);
    const nodeIds = new Set(graph.nodes.filter((n) => fileSet.has(n.path)).map((n) => n.id));

    // Dependências internas: módulos que este módulo importa
    const internalDepFiles = new Set<string>();
    for (const edge of graph.edges.filter((e) => nodeIds.has(e.from) && e.type === 'IMPORTS')) {
      const targetNode = graph.nodes.find((n) => n.id === edge.to);
      if (targetNode && !fileSet.has(targetNode.path)) {
        internalDepFiles.add(targetNode.path);
      }
    }

    const internalDepsModules = [...new Set(
      [...internalDepFiles].map((f) => classifyFileToModule(f).name)
    )].filter((m) => m !== moduleName);

    // Riscos relacionados a este módulo
    const moduleRisks = risks
      .filter((r) => {
        const lower = r.file.toLowerCase();
        return (
          fileSet.has(r.file) ||
          files.some((f) => r.file.startsWith(f.split('/').slice(0, -1).join('/')))
        ) &&
          !lower.endsWith('package-lock.json') &&
          !lower.endsWith('yarn.lock');
      })
      .slice(0, 5)
      .map((r) => `${r.level.toUpperCase()}: ${r.title} (${r.file}${r.line ? ':' + r.line : ''})`);

    // Regras de negócio relacionadas a este módulo
    const moduleRules = businessRules
      .filter((br) => br.sourceFiles.some((f) => fileSet.has(f)))
      .slice(0, 5)
      .map((br) => `${br.id}: ${br.rule} ${br.confidence === 'confirmado' ? '🟢' : '🟡'}`);

    // Metadados estáticos conhecidos
    const meta = KNOWN_MODULE_METADATA[moduleName];

    // Lacunas
    const gaps: string[] = [];
    if (moduleRules.length === 0) {
      gaps.push('Regras de negócio não confirmadas para este módulo');
    }
    if (internalDepsModules.length === 0 && files.length > 3) {
      gaps.push('Dependências internas não rastreadas no grafo');
    }

    contracts.push({
      module: moduleName,
      kind,
      responsibility: meta?.responsibility ?? `Módulo "${moduleName}" — responsabilidade não documentada`,
      inputs: meta?.inputs ?? ['Não documentado'],
      outputs: meta?.outputs ?? ['Não documentado'],
      mainFiles: files.slice(0, 10),
      internalDeps: internalDepsModules.slice(0, 8),
      externalDeps: collectExternalDeps(files, input),
      knownRules: moduleRules,
      risks: moduleRisks,
      gaps,
      agentInstructions: meta?.agentInstructions ?? [
        `Leia os arquivos principais de "${moduleName}" antes de fazer alterações.`,
        'Verifique o acoplamento no grafo antes de mover ou renomear arquivos.'
      ]
    });
  }

  return contracts.sort((a, b) => b.mainFiles.length - a.mainFiles.length);
}

function collectExternalDeps(_files: string[], input: ReverseEngineeringInput): string[] {
  const externalDeps: string[] = [];
  const stackItems = input.inventory.stack.filter((s) => s.detected);
  for (const s of stackItems.slice(0, 5)) {
    externalDeps.push(s.name);
  }
  return externalDeps;
}

export function renderOperationalContractsMd(contracts: OperationalContract[], projectName: string): string {
  const lines: string[] = [];
  lines.push(`# Contratos Operacionais: ${projectName}`);
  lines.push('');
  lines.push('> Gerado por TIC Coder Lite — Modo Lite.');
  lines.push('> Inspiração metodológica: Reversa Architect / Reconstructor by Sandeco (MIT).');
  lines.push('');
  lines.push('> ℹ️ Contratos operacionais descrevem **o que cada módulo faz** do ponto de vista de um agente de IA.');
  lines.push('> Leia o contrato do módulo antes de fazer alterações nele.');
  lines.push('');

  if (contracts.length === 0) {
    lines.push('- Nenhum contrato operacional detectado 🔴 LACUNA');
    return lines.join('\n');
  }

  // Índice
  lines.push('## Índice de Módulos');
  lines.push('');
  for (const contract of contracts) {
    const anchor = contract.module.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    lines.push(`- [${contract.module}](#contrato-operacional-${anchor})`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Contratos por módulo
  for (const contract of contracts) {
    lines.push(`## Contrato Operacional: ${contract.module}`);
    lines.push('');
    lines.push('**Responsabilidade:**');
    lines.push(`- ${contract.responsibility}`);
    lines.push('');

    lines.push('**Entradas:**');
    for (const input of contract.inputs) {
      lines.push(`- ${input}`);
    }
    lines.push('');

    lines.push('**Saídas:**');
    for (const output of contract.outputs) {
      lines.push(`- ${output}`);
    }
    lines.push('');

    if (contract.mainFiles.length > 0) {
      lines.push('**Arquivos principais:**');
      for (const file of contract.mainFiles.slice(0, 10)) {
        lines.push(`- \`${file}\``);
      }
      lines.push('');
    }

    if (contract.internalDeps.length > 0) {
      lines.push('**Dependências internas:**');
      for (const dep of contract.internalDeps) {
        lines.push(`- ${dep}`);
      }
      lines.push('');
    }

    if (contract.externalDeps.length > 0) {
      lines.push('**Dependências externas:**');
      for (const dep of contract.externalDeps) {
        lines.push(`- ${dep}`);
      }
      lines.push('');
    }

    if (contract.knownRules.length > 0) {
      lines.push('**Regras conhecidas:**');
      for (const rule of contract.knownRules) {
        lines.push(`- ${rule}`);
      }
      lines.push('');
    } else {
      lines.push('**Regras conhecidas:** 🔴 Nenhuma regra de negócio confirmada para este módulo.');
      lines.push('');
    }

    if (contract.risks.length > 0) {
      lines.push('**Riscos técnicos:**');
      for (const risk of contract.risks) {
        lines.push(`- ${risk}`);
      }
      lines.push('');
    }

    if (contract.gaps.length > 0) {
      lines.push('**Lacunas:**');
      for (const gap of contract.gaps) {
        lines.push(`- 🔴 ${gap}`);
      }
      lines.push('');
    }

    if (contract.agentInstructions.length > 0) {
      lines.push('**Instruções para agentes de IA:**');
      for (const instruction of contract.agentInstructions) {
        lines.push(`- ${instruction}`);
      }
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}
