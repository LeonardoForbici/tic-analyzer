"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAgentContextMd = generateAgentContextMd;
const generateCodeAnalysis_1 = require("./reverseEngineering/generateCodeAnalysis");
function generateAgentContextMd(summary) {
    const stack = summary.inventory.stack
        .filter((signal) => signal.detected)
        .map((signal) => `- ${signal.name}: ${signal.evidence.join(', ') || 'detectado por convenção'}`)
        .join('\n');
    const criticalModules = findCriticalModules(summary)
        .map((item) => `- ${item.module}: ${item.reason}`)
        .join('\n');
    const highRiskFiles = findHighRiskFiles(summary)
        .map((item) => `- ${item.file}: ${item.reason}`)
        .join('\n');
    const dependencies = findImportantDependencies(summary.graph)
        .map((item) => `- ${item.label}: ${item.degree} conexão(ões)`)
        .join('\n');
    const risks = summary.risks.risks
        .slice(0, 12)
        .map((risk) => `- ${risk.level.toUpperCase()} ${risk.title} (${risk.file}${risk.line ? `:${risk.line}` : ''})`)
        .join('\n');
    const readingOrder = buildReadingOrder(summary)
        .map((file, index) => `${index + 1}. ${file}`)
        .join('\n');
    const plsql = summary.inventory.plsql;
    const plsqlPackages = plsql.entities
        .filter((entity) => entity.kind === 'package' || entity.kind === 'package_body')
        .slice(0, 20)
        .map((entity) => `- ${entity.name} (${entity.kind}) em ${entity.file}:${entity.line}`)
        .join('\n');
    const plsqlRoutines = plsql.entities
        .filter((entity) => entity.kind === 'procedure' || entity.kind === 'function')
        .slice(0, 20)
        .map((entity) => `- ${entity.name} em ${entity.file}:${entity.line}`)
        .join('\n');
    const plsqlTriggers = plsql.entities
        .filter((entity) => entity.kind === 'trigger')
        .slice(0, 20)
        .map((entity) => `- ${entity.name}${entity.targetTable ? ` ON ${entity.targetTable}` : ''} em ${entity.file}:${entity.line}`)
        .join('\n');
    const plsqlTables = plsql.tableReferences
        .slice(0, 20)
        .map((table) => `- ${table.name}: ${table.reads} leitura(s), ${table.writes} escrita(s)`)
        .join('\n');
    const plsqlRiskLines = summary.risks.risks
        .filter((risk) => risk.category === 'plsql')
        .slice(0, 20)
        .map((risk) => `- ${risk.level.toUpperCase()} ${risk.title} (${risk.file}${risk.line ? `:${risk.line}` : ''})`)
        .join('\n');
    return `# Contexto para IA do TIC Coder Lite

Gerado em: ${new Date().toISOString()}
Projeto: ${summary.workspaceName}
Raiz: ${summary.rootPath}

## Objetivo

Este arquivo é um contexto operacional para Codex, Claude Code, Copilot, Cursor e agentes locais de IA antes de alterar código. Ele é gerado localmente a partir de scan determinístico, stack, grafo e dados de risco.

## Modos do TIC Coder Lite

1. Modo Lite: scanner determinístico, grafo, riscos e contexto. Sem IA, sem banco, sem Docker e sem servidor.
2. IA Padrão: exporta contexto para ferramentas de IA existentes. Codex usa AGENTS.md, Claude Code usa CLAUDE.md, Copilot usa .github/copilot-instructions.md, Cursor usa .cursorrules, Gemini usa GEMINI.md.
3. IA Local: melhoria opcional com Ollama. Modelo inicial recomendado: qwen2.5-coder:3b. Pode ser desativada e não exige modelos grandes de 60GB.

## Stack Detectada

${stack || '- Nenhum sinal de stack detectado'}

## Resumo do Projeto

- Arquivos analisados: ${summary.totalFiles}
- Linhas analisadas: ${summary.totalLines}
- Nós do grafo: ${summary.graph.stats.nodeCount}
- Arestas do grafo: ${summary.graph.stats.edgeCount}
- Riscos detectados: ${summary.risks.summary.total}

## Módulos Críticos

${criticalModules || '- Nenhum módulo crítico identificado'}

## Arquivos de Alto Risco

${highRiskFiles || '- Nenhum arquivo de alto risco identificado'}

## Dependências Importantes

${dependencies || '- Nenhuma dependência importante identificada'}

## Principais Riscos

${risks || '- Nenhum risco determinístico detectado'}

## Banco / PL/SQL

- Arquivos PL/SQL: ${plsql.files.length}
- Packages: ${plsql.counts.package}
- Package bodies: ${plsql.counts.package_body}
- Procedures: ${plsql.counts.procedure}
- Functions: ${plsql.counts.function}
- Triggers: ${plsql.counts.trigger}
- Tabelas referenciadas: ${plsql.tableReferences.length}

### Packages detectados

${plsqlPackages || '- Nenhum package detectado.'}

### Procedures e functions criticas

${plsqlRoutines || '- Nenhuma procedure/function detectada.'}

### Triggers

${plsqlTriggers || '- Nenhum trigger detectado.'}

### Tabelas mais referenciadas

${plsqlTables || '- Nenhuma tabela referenciada.'}

### Riscos transacionais e PL/SQL

${plsqlRiskLines || '- Nenhum risco PL/SQL detectado.'}

### Aviso para IA

- Regras de negocio criticas podem estar escondidas no banco.
- Packages, procedures e triggers podem executar validacoes que nao aparecem no backend/frontend.
- Nao altere COMMIT, ROLLBACK, autonomous transaction, triggers ou SQL dinamico sem validacao humana.
- Use .tic-code/projects/database/agent-context.md para o contexto focado em PL/SQL.

## Ordem Recomendada de Leitura

${readingOrder || '1. README.md\n2. package.json\n3. .tic-code/inventory.md\n4. .tic-code/architecture.md\n5. .tic-code/risks.md'}

## Instruções para Agentes de IA

- Leia este arquivo, .tic-code/inventory.md, .tic-code/architecture.md e .tic-code/risks.md antes de editar.
- Trate fatos confirmados como verdade local do projeto, a menos que os fontes tenham mudado após este scan.
- Abra os arquivos citados antes de modificar comportamento.
- Prefira edições estreitas ao redor do módulo e das dependências envolvidas no pedido.
- Rode novamente a análise do TIC Coder Lite após mudanças relevantes de código.
- Mantenha arquivos gerados dentro de .tic-code, salvo quando o usuário pedir exportação para outro lugar.
- Lembrete: fatos do Modo Lite funcionam sem IA; IA Padrão só exporta contexto; IA Local é opcional.

## Programação Reversa / SDD

Antes de alterar código, leia também:

- .tic-code/reverse-engineering/inventory.md
- .tic-code/reverse-engineering/architecture.md
- .tic-code/reverse-engineering/operational-contracts.md
- .tic-code/reverse-engineering/business-rules.md
- .tic-code/reverse-engineering/confidence-report.md
- .tic-code/reverse-engineering/gaps.md
- .tic-code/reverse-engineering/questions.md
- .tic-code/reverse-engineering/traceability/code-spec-matrix.md
- .tic-code/reverse-engineering/traceability/risk-impact-matrix.md

### Instruções para Agentes (Programação Reversa)

- Não trate 🟡 INFERIDO como verdade absoluta.
- Valide itens 🟡 INFERIDO antes de alterar regra crítica.
- Pergunte ao usuário sobre itens 🔴 LACUNA antes de prosseguir.
- Nunca altere módulo crítico sem consultar riscos e a matriz de impacto.
- Em projetos com PL/SQL, verifique triggers, procedures e packages antes de alterar regra de negócio no backend.
- Consulte .tic-code/reverse-engineering/plsql-analysis.md antes de alterar qualquer tabela referenciada por trigger.

### Níveis de Confiança

- 🟢 CONFIRMADO: extraído diretamente do código, SQL, anotação ou arquivo.
- 🟡 INFERIDO: deduzido por nome, padrão, fluxo ou grafo.
- 🔴 LACUNA: não confirmável, exige validação humana.

## Não Fazer Sem Validação Humana

- Não remova APIs públicas, endpoints, scripts de banco, migrations ou checagens de segurança apenas por inferência.
- Não renomeie módulos, pacotes, rotas ou variáveis de ambiente sem validar chamadores.
- Não assuma que uma fronteira de módulo inferida é uma regra arquitetural intencional.
- Não trate risco do grafo como prova de bug; use como sinal de prioridade para inspeção.
- Não adicione serviços externos, bancos, runtimes de IA, RAG ou servidores aos fluxos do TIC Coder Lite.

## Créditos

- Reversa by Sandeco, MIT License. Programação Reversa do TIC Coder Lite foi inspirada metodologicamente no Reversa.
- TIC Coder Lite by TIC / Leonardo Forbici.
- InsightGraph concepts used as internal reference, not bundled as dependency.
`;
}
function findCriticalModules(summary) {
    const riskByModule = new Map();
    const nodeByPath = new Map(summary.graph.nodes.map((node) => [node.path, node]));
    for (const risk of summary.risks.risks) {
        // Excluir lock files — não são módulos de domínio
        const lower = risk.file.toLowerCase();
        if (lower.endsWith('package-lock.json') || lower.endsWith('yarn.lock') || lower.endsWith('pnpm-lock.yaml'))
            continue;
        const graphModule = nodeByPath.get(risk.file)?.module;
        const module = (graphModule && graphModule !== 'unknown' && graphModule !== 'external')
            ? graphModule
            : (0, generateCodeAnalysis_1.classifyFileToModule)(risk.file).name;
        const weight = risk.level === 'critical' ? 4 : risk.level === 'high' ? 3 : risk.level === 'medium' ? 2 : 1;
        riskByModule.set(module, (riskByModule.get(module) ?? 0) + weight);
    }
    const graphCentrality = Object.entries(summary.graph.stats.modules)
        .map(([module, count]) => ({ module, count }))
        .filter((item) => item.module !== 'external');
    const fromRisks = [...riskByModule.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([module, score]) => ({ module, reason: `${score} ponto(s) ponderados de risco` }));
    const fromGraph = graphCentrality
        .slice(0, 5)
        .map((item) => ({ module: item.module, reason: `${item.count} nó(s) no grafo` }));
    return dedupeByModule([...fromRisks, ...fromGraph]).slice(0, 8);
}
function findHighRiskFiles(summary) {
    const fromRisks = summary.risks.risks
        .filter((risk) => {
        const lower = risk.file.toLowerCase();
        return ((risk.level === 'critical' || risk.level === 'high') &&
            !lower.endsWith('package-lock.json') &&
            !lower.endsWith('yarn.lock') &&
            !lower.endsWith('pnpm-lock.yaml'));
    })
        .map((risk) => ({ file: risk.file, reason: `risco ${risk.level}: ${risk.title}` }));
    const fromGraph = summary.graph.nodes
        .filter((node) => node.riskLevel === 'high' && node.module !== 'external')
        .map((node) => ({ file: node.path, reason: 'alta centralidade no grafo' }));
    return dedupeByFile([...fromRisks, ...fromGraph]).slice(0, 12);
}
function findImportantDependencies(graph) {
    const degree = new Map();
    for (const edge of graph.edges) {
        degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
        degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
    }
    return graph.nodes
        .filter((node) => node.module === 'external')
        .map((node) => ({ ...node, degree: degree.get(node.id) ?? 0 }))
        .sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label))
        .slice(0, 12);
}
function buildReadingOrder(summary) {
    return dedupeStrings([
        ...summary.keyFiles,
        '.tic-code/inventory.md',
        '.tic-code/architecture.md',
        '.tic-code/risks.md',
        '.tic-code/projects/database/agent-context.md',
        ...summary.inventory.plsql.entities.slice(0, 12).map((entity) => entity.file),
        ...summary.graph.stats.centralFiles.map((file) => file.path),
        ...summary.risks.risks.slice(0, 8).map((risk) => risk.file)
    ]).slice(0, 18);
}
function dedupeByModule(items) {
    const seen = new Set();
    return items.filter((item) => {
        if (seen.has(item.module)) {
            return false;
        }
        seen.add(item.module);
        return true;
    });
}
function dedupeByFile(items) {
    const seen = new Set();
    return items.filter((item) => {
        if (seen.has(item.file)) {
            return false;
        }
        seen.add(item.file);
        return true;
    });
}
function dedupeStrings(values) {
    return [...new Set(values.filter(Boolean))];
}
//# sourceMappingURL=generateAgentContextMd.js.map