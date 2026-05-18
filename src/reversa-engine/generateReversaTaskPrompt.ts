/**
 * Gera .tic-code/reversa/reversa-task.md — prompt ativo para IA paga (Claude, Copilot, Gemini, etc.)
 * completar a engenharia reversa lendo os artefatos gerados pelo scanner determinístico.
 *
 * Créditos: Reversa by Sandeco — MIT License (adapted)
 */

import type { ProjectSummary } from '../types';

export function generateReversaTaskPrompt(summary: ProjectSummary): string {
  const projectName = summary.workspaceName;
  const totalFiles = summary.totalFiles;
  const totalLines = summary.totalLines;
  const riskCount = summary.risks.risks.filter((r) => {
    const l = r.file.toLowerCase();
    return !l.endsWith('package-lock.json') && !l.endsWith('yarn.lock') && !l.endsWith('.map');
  }).length;

  const stack = buildStack(summary);
  const centralFiles = buildCentralFiles(summary);
  const modules = buildModules(summary);
  const hasPlSql = summary.inventory.plsql.detected || summary.inventory.plsql.files.length > 0;

  const lines: string[] = [
    '# TIC Coder Lite — Prompt de Tarefa para Agente de IA',
    '',
    '> **Como usar:** Cole este arquivo no seu chat (Claude, Copilot, Gemini, GPT) ou deixe o agente ler',
    '> automaticamente via `CLAUDE.md`, `AGENTS.md` ou `.github/copilot-instructions.md`.',
    '>',
    '> O scanner determinístico já rodou. Sua missão agora é **completar as lacunas 🔴** com análise semântica.',
    '',
    '---',
    '',
    '## Contexto do Projeto',
    '',
    `- **Nome:** ${projectName}`,
    `- **Raiz:** ${summary.rootPath}`,
    `- **Arquivos analisados:** ${totalFiles}`,
    `- **Linhas analisadas:** ${totalLines.toLocaleString()}`,
    `- **Riscos detectados:** ${riskCount}`,
    `- **Stack:** ${stack}`,
    '',
    '### Módulos',
    '',
    modules,
    '',
    '### Arquivos mais centrais (grafo de dependências)',
    '',
    centralFiles,
    '',
    '---',
    '',
    '## Sua Missão',
    '',
    'O TIC Coder Lite executou o scanner estático e gerou artefatos base em `.tic-code/reverse-engineering/`.',
    'Esses artefatos contêm lacunas 🔴 que só análise semântica do código real pode resolver.',
    '',
    '**Execute as fases abaixo em ordem. Após cada fase, informe o que foi concluído e o que ficou como lacuna.**',
    '',
    '---',
    '',
    '## Fase 1 — Detective: Regras de Negócio e Domínio',
    '',
    '**Leia antes de começar:**',
    '',
    '- `.tic-code/reverse-engineering/gaps.md` — todas as lacunas identificadas',
    '- `.tic-code/reverse-engineering/business-rules.md` — regras candidatas (🟡 INFERIDO)',
    '- `.tic-code/reverse-engineering/domain.md` — domínio identificado estaticamente',
    '- `.tic-code/reverse-engineering/questions.md` — perguntas abertas',
    '',
    '**Execute:**',
    '',
    '1. Para cada módulo em `.tic-code/reverse-engineering/code-analysis.md`, leia os **arquivos fonte reais**',
    '2. Identifique regras de negócio implícitas: validações, cálculos, guards de acesso, transições de estado',
    '3. Classifique cada regra:',
    '   - 🟢 CONFIRMADO — extraído diretamente do código com arquivo e linha',
    '   - 🟡 INFERIDO — deduzido por padrão/contexto (documente a evidência)',
    '   - 🔴 LACUNA — impossível determinar sem especialista de negócio',
    '4. Para lacunas, adicione perguntas objetivas em `.tic-code/reverse-engineering/questions.md`',
    '',
    '**Escreva em:**',
    '',
    '- `.tic-code/reverse-engineering/business-rules.md` — expandir com análise semântica',
    '- `.tic-code/reverse-engineering/domain.md` — completar entidades e domínios',
    '- `.tic-code/reverse-engineering/state-machines.md` — inferir máquinas de estado',
    '- `.tic-code/reverse-engineering/permissions.md` — mapear controle de acesso',
    '',
    '---',
    '',
    '## Fase 2 — Architect: Arquitetura Completa',
    '',
    '**Leia antes de começar:**',
    '',
    '- `.tic-code/reversa/context/graph.json` — grafo de dependências com nós e arestas',
    '- `.tic-code/reverse-engineering/architecture.md` — arquitetura detectada estaticamente',
    '- `.tic-code/reversa/context/surface.json` — superfície do projeto (stack, entrypoints)',
    '',
    '**Execute:**',
    '',
    '1. Identifique o padrão arquitetural dominante (MVC, Clean, Hexagonal, Monolito, etc.)',
    '2. Complete os diagramas C4 — use Mermaid quando possível:',
    '   - C4 Context: sistema + atores externos',
    '   - C4 Container: serviços, banco, UI',
    '   - C4 Component: módulos internos e suas responsabilidades',
    '3. Documente decisões de design significativas como ADRs',
    '',
    '**Escreva em:**',
    '',
    '- `.tic-code/reverse-engineering/c4-context.md`',
    '- `.tic-code/reverse-engineering/c4-containers.md`',
    '- `.tic-code/reverse-engineering/c4-components.md`',
    '- `.tic-code/reverse-engineering/architecture.md` (completar seções 🔴)',
    '',
    '---',
    '',
    '## Fase 3 — Writer: SDDs por Módulo',
    '',
    '**Leia antes de começar:**',
    '',
    '- `.tic-code/reversa/context/modules.json` — lista de módulos com arquivo e dependências',
    '- `.tic-code/reverse-engineering/operational-contracts.md` — contratos existentes',
    '- `.tic-code/reverse-engineering/code-analysis.md` — análise estática por módulo',
    '',
    '**Execute:**',
    '',
    '1. Identifique os 5 módulos mais críticos (maior grau no grafo, maior risco)',
    '2. Para cada um, leia o código fonte real e gere um SDD contendo:',
    '   - Responsabilidade única do módulo',
    '   - Entradas e saídas (com tipos)',
    '   - Dependências diretas',
    '   - Regras de negócio internas',
    '   - Riscos e pontos de atenção',
    '   - Exemplos de uso',
    '',
    '**Escreva em:**',
    '',
    '- `.tic-code/reverse-engineering/sdd/{nome-do-modulo}.md` para cada módulo crítico',
    '',
    '---',
    '',
    ...(hasPlSql ? [
      '## Fase 4 — Data Master: Banco de Dados e PL/SQL',
      '',
      '> ⚠️ PL/SQL detectado neste projeto. Esta fase é obrigatória.',
      '',
      '**Leia antes de começar:**',
      '',
      '- `.tic-code/reverse-engineering/plsql-analysis.md` — análise estática de PL/SQL',
      '- `.tic-code/reverse-engineering/database-analysis.md` — tabelas e referências SQL',
      '- `.tic-code/reverse-engineering/data-dictionary.md` — dicionário de dados',
      '',
      '**Execute:**',
      '',
      '1. Para cada trigger detectado, documente: tabela alvo, evento, lógica de negócio',
      '2. Para cada procedure/function, documente: parâmetros, retorno, efeitos colaterais',
      '3. Identifique SQL concatenado em string (risco CRITICAL) e documente o impacto',
      '4. Complete o ERD com as tabelas e relacionamentos',
      '',
      '**Escreva em:**',
      '',
      '- `.tic-code/reverse-engineering/database/tables.md`',
      '- `.tic-code/reverse-engineering/database/procedures.md`',
      '- `.tic-code/reverse-engineering/database/triggers.md`',
      '- `.tic-code/reverse-engineering/erd-complete.md`',
      '',
      '---',
      ''
    ] : []),
    `## Fase ${hasPlSql ? 5 : 4} — Reviewer: Consolidar e Fechar Lacunas`,
    '',
    '**Execute:**',
    '',
    '1. Revise todos os artefatos gerados/atualizados',
    '2. Atualize `.tic-code/reverse-engineering/confidence-report.md`:',
    '   - Percentual de cobertura por agente',
    '   - Lista final de lacunas 🔴 irresolvíveis',
    '3. Atualize `.tic-code/reverse-engineering/traceability/code-spec-matrix.md` com os novos mapeamentos',
    '4. Gere um resumo executivo em `.tic-code/reverse-engineering/review-report.md`',
    '',
    '---',
    '',
    '## Regras Fundamentais',
    '',
    '- ❌ Não invente regras de negócio — só documente o que você vê no código',
    '- ❌ Não altere código-fonte durante esta análise',
    '- ❌ Não sobrescreva artefatos existentes sem verificar o conteúdo atual',
    '- ✅ Se não conseguir confirmar, marque como 🟡 INFERIDO com evidência (arquivo:linha)',
    '- ✅ Se for impossível determinar, marque como 🔴 LACUNA e adicione a `questions.md`',
    '- ✅ Preserve todos os arquivos em `.tic-code/` — expanda e complemente, não substitua',
    '',
    '---',
    '',
    `*Gerado pelo TIC Coder Lite em ${new Date().toISOString()}*`
  ];

  return lines.join('\n') + '\n';
}

function buildStack(summary: ProjectSummary): string {
  const detected = summary.inventory.stack.filter((s) => s.detected).map((s) => s.name);
  return detected.length > 0 ? detected.join(', ') : 'Não detectado automaticamente';
}

function buildCentralFiles(summary: ProjectSummary): string {
  const files = summary.graph.stats.centralFiles.slice(0, 8);
  if (files.length === 0) return '- Não detectados';
  return files.map((f) => `- \`${f.path}\``).join('\n');
}

function buildModules(summary: ProjectSummary): string {
  if (summary.inventory.modules.length > 0) {
    return summary.inventory.modules
      .slice(0, 10)
      .map((m) => `- **${m.kind}** (${m.files.length} arquivo(s))`)
      .join('\n');
  }
  const folderMap = new Map<string, number>();
  for (const file of summary.scan.files) {
    const parts = file.relativePath.replace(/\\/g, '/').split('/');
    if (parts.length >= 2) {
      const folder = parts[0];
      if (!folder.startsWith('node_modules') && !folder.startsWith('dist') && !folder.startsWith('.')) {
        folderMap.set(folder, (folderMap.get(folder) ?? 0) + 1);
      }
    }
  }
  const top = [...folderMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  return top.length > 0
    ? top.map(([folder, count]) => `- \`${folder}/\` — ${count} arquivo(s)`).join('\n')
    : '- Módulos não detectados automaticamente';
}
