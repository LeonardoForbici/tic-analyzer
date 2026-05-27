import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { execSync } from 'child_process';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import type { ImpactIndex } from '../analyzer/buildImpactIndex';

interface CallGraphNode { id: string; label: string; layer: string; file: string; line?: number; }
interface CallGraphEdge { from: string; to: string; type: string; confidence: string; label?: string; }
interface PlsqlObj { type: string; name: string; packageName?: string; file: string; line: number; tablesRead: string[]; tablesWritten: string[]; }
interface TxBoundary { file: string; line: number; className: string; methodName?: string; propagation: string; readOnly: boolean; rollbackFor?: string; }
interface SearchIndexEntry { file: string; terms: string[]; snippet: string; }

export interface TokenEntry {
  timestamp: number;
  tool: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface TokenStats {
  totalCalls: number;
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byTool: Record<string, { calls: number; tokens: number; inputTokens: number; outputTokens: number }>;
  log: TokenEntry[];
  sessionStart: number;
}

export interface McpServerOptions {
  projectPath: string;
  port?: number;
  onToolCall?: (entry: TokenEntry) => void;
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export class TicAnalyzerMcpServer {
  private httpServer?: http.Server;
  private projectPath: string;
  private ticCodePath: string;
  private tokenLog: TokenEntry[] = [];
  private sessionStart = Date.now();
  private onToolCall?: (entry: TokenEntry) => void;
  private callGraphCache: { nodes: CallGraphNode[]; edges: CallGraphEdge[] } | null = null;
  private searchIndexCache: SearchIndexEntry[] | null = null;
  private invertedIndexCache: Map<string, string[]> | null = null;

  constructor(options: McpServerOptions) {
    this.projectPath = options.projectPath;
    this.ticCodePath = path.join(options.projectPath, '.tic-code');
    this.onToolCall = options.onToolCall;
  }

  private createServerInstance(): Server {
    const server = new Server(
      { name: 'tic-analyzer', version: '2.0.0' },
      { capabilities: { tools: {} } }
    );
    this.registerTools(server);
    return server;
  }

  getTokenStats(): TokenStats {
    const byTool: TokenStats['byTool'] = {};
    for (const entry of this.tokenLog) {
      if (!byTool[entry.tool]) byTool[entry.tool] = { calls: 0, tokens: 0, inputTokens: 0, outputTokens: 0 };
      byTool[entry.tool].calls++;
      byTool[entry.tool].tokens += entry.totalTokens;
      byTool[entry.tool].inputTokens += entry.inputTokens;
      byTool[entry.tool].outputTokens += entry.outputTokens;
    }
    return {
      totalCalls: this.tokenLog.length,
      totalTokens: this.tokenLog.reduce((s, e) => s + e.totalTokens, 0),
      totalInputTokens: this.tokenLog.reduce((s, e) => s + e.inputTokens, 0),
      totalOutputTokens: this.tokenLog.reduce((s, e) => s + e.outputTokens, 0),
      byTool,
      log: this.tokenLog.slice(-100),
      sessionStart: this.sessionStart
    };
  }

  clearTokenLog(): void {
    this.tokenLog = [];
    this.sessionStart = Date.now();
  }

  private registerTools(server: Server): void {
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'list_modules',
          description: 'Lista todos os módulos analisados do projeto.',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'get_module',
          description: 'Retorna o contexto completo de um módulo (~75k tokens).',
          inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] }
        },
        {
          name: 'get_quick_context',
          description: 'Retorna quick-context.md (~12k tokens). Use como ponto de partida.',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'search_module',
          description: 'Busca o módulo mais relevante para uma query.',
          inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }
        },
        {
          name: 'get_diagram',
          description: 'Retorna o diagrama Mermaid de módulos e dependências.',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'get_openapi',
          description: 'Retorna a especificação OpenAPI 3.0 dos endpoints detectados.',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'get_gaps',
          description: 'Retorna o relatório de gaps — lacunas 🔴 não inferíveis estaticamente.',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'get_permissions',
          description: 'Retorna a matriz de permissões: rotas × roles.',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'get_multigraph',
          description: 'Retorna o multi-grafo: Frontend → Endpoint → Backend → PL/SQL.',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'get_business_rules',
          description: 'Retorna regras de negócio de um módulo (validações, enums, guards, constantes).',
          inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] }
        },
        {
          name: 'get_impact',
          description: 'Retorna quais arquivos são afetados se o arquivo informado mudar. Use para análise de impacto de mudança. ~200 tokens por consulta.',
          inputSchema: {
            type: 'object',
            properties: {
              file: { type: 'string', description: 'Caminho relativo do arquivo (ex: "src/api/user.ts")' }
            },
            required: ['file']
          }
        },
        {
          name: 'get_metrics',
          description: 'Retorna métricas de qualidade de um módulo: complexidade ciclomática, hotspots, dívida técnica.',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Nome do módulo. Se omitido, retorna resumo do projeto.' }
            }
          }
        },
        {
          name: 'get_hotspots',
          description: 'Retorna os arquivos com maior dívida técnica e risco (hotspots) do projeto inteiro.',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'get_patterns',
          description: 'Retorna os padrões arquiteturais detectados (Repository, Service, Factory, etc). Opcionalmente filtra por módulo.',
          inputSchema: {
            type: 'object',
            properties: {
              module: { type: 'string', description: 'Nome do módulo para filtrar (opcional).' }
            }
          }
        },
        {
          name: 'get_violations',
          description: 'Retorna violações arquiteturais detectadas: dependências circulares, frontend importando backend, etc.',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'get_inheritance',
          description: 'Retorna a hierarquia de herança de classes do projeto.',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'get_diff_impact',
          description: 'Lê o git diff do projeto (HEAD + staged + untracked) e retorna o impacto consolidado de TODAS as mudanças pendentes. Use antes de fazer commit para saber o que será afetado.',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'get_db_schema',
          description: 'Retorna o schema de banco de dados detectado: tabelas/models de SQL migrations, Prisma, TypeORM, JPA, Django, Sequelize. Use table para filtrar uma tabela específica (~200 tokens). Sem parâmetro retorna resumo de todas as tabelas (~500 tokens).',
          inputSchema: {
            type: 'object',
            properties: {
              table: { type: 'string', description: 'Nome da tabela/model para filtrar (opcional).' }
            }
          }
        },
        {
          name: 'get_analysis_json',
          description: 'Retorna metadados estruturados da análise (contagens, top hotspots, violations, patterns) em JSON compacto. Útil para ferramentas externas. ~500 tokens.',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'get_plsql_object',
          description: 'Retorna detalhes de uma procedure, function, trigger ou view PL/SQL: parâmetros, tabelas lidas/escritas, chamadores e chamados. ~200 tokens.',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Nome da procedure, function, trigger ou view (ex: "PROC_CALCULA_SALDO" ou "PKG_FINANCEIRO.PROC_CALCULA")' }
            },
            required: ['name']
          }
        },
        {
          name: 'get_table_access',
          description: 'Retorna quais procedures/functions leem ou escrevem uma tabela Oracle. Útil para análise de impacto de alterações no schema. ~200 tokens.',
          inputSchema: {
            type: 'object',
            properties: {
              table: { type: 'string', description: 'Nome da tabela Oracle (ex: "TB_CLIENTE" ou "PEDIDOS")' }
            },
            required: ['table']
          }
        },
        {
          name: 'get_dead_plsql',
          description: 'Retorna procedures e functions PL/SQL que não são chamadas por nenhum outro código (Java, TS ou PL/SQL). Útil para identificar código morto antes de uma refatoração.',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'get_transactions',
          description: 'Retorna todos os @Transactional boundaries detectados no código Java/Spring: propagation, readOnly, rollbackFor, escopo de classe ou método.',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'get_batch_jobs',
          description: 'Retorna jobs e processos assíncronos detectados: @Scheduled (com cron/fixedRate), @Async, Quartz Jobs, Spring Batch. Estes não aparecem no multi-grafo HTTP.',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'get_angular_modules',
          description: 'Retorna módulos Angular (@NgModule com declarations/imports/lazy routes) e itens NgRx/Redux (actions, reducers, effects, selectors).',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'get_dead_components',
          description: 'Retorna componentes React (.tsx) e Angular (.component.ts/.directive.ts) com inDegree=0 no grafo de dependências — nenhum arquivo os importa.',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'find_path',
          description: 'Encontra o caminho mais curto (BFS) entre dois arquivos ou objetos PL/SQL no grafo de dependências. Use para descobrir como A se conecta a B. ~200 tokens.',
          inputSchema: {
            type: 'object',
            properties: {
              from: { type: 'string', description: 'Arquivo ou nó de origem (ex: "src/components/Login.tsx")' },
              to: { type: 'string', description: 'Arquivo ou nó de destino (ex: "src/api/auth.ts")' }
            },
            required: ['from', 'to']
          }
        },
        {
          name: 'trace_flow',
          description: 'Rastreia o fluxo vertical completo a partir de qualquer ponto de entrada: endpoint URL, arquivo, label de nó ou procedure PL/SQL. Retorna upstream (quem chama) e downstream (o que chama), tabelas acessadas e contexto @Transactional. ~1.5k tokens.',
          inputSchema: {
            type: 'object',
            properties: {
              entry: { type: 'string', description: 'Ponto de entrada: URL (/api/pagamentos), nome de arquivo (PedidoService.java), label de nó ou nome de procedure PL/SQL.' }
            },
            required: ['entry']
          }
        },
        {
          name: 'search_code',
          description: 'Busca semântica em todo o código-fonte por palavras-chave, nomes de classes, termos de negócio ou comentários. Retorna os 10 arquivos mais relevantes com score e snippet. ~400 tokens.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Termos de busca (ex: "validação pagamento", "SP_PROCESSAR", "checkout")' }
            },
            required: ['query']
          }
        },
        {
          name: 'get_concept_map',
          description: 'Mapa cruzado de um conceito de negócio em todos os artefatos: módulos, endpoints REST, procedures PL/SQL, tabelas, @Transactional e arquivos relacionados. ~800 tokens.',
          inputSchema: {
            type: 'object',
            properties: {
              concept: { type: 'string', description: 'Conceito de negócio (ex: "pagamento", "pedido", "usuario")' }
            },
            required: ['concept']
          }
        }
      ]
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const inputTokens = estimateTokens(JSON.stringify(args ?? {}));

      const respond = (result: { content: Array<{ type: string; text: string }> }) => {
        const outputTokens = result.content.reduce((s, c) => s + estimateTokens(c.type === 'text' ? c.text : ''), 0);
        const entry: TokenEntry = { timestamp: Date.now(), tool: name, inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
        this.tokenLog.push(entry);
        this.onToolCall?.(entry);
        return result;
      };

      switch (name) {
        case 'list_modules':
          return respond({ content: [{ type: 'text', text: this.readFile('index.md') }] });

        case 'get_quick_context':
          return respond({ content: [{ type: 'text', text: this.readFile('quick-context.md') }] });

        case 'get_module': {
          const moduleName = (args as { name: string }).name;
          const contextPath = path.join(this.ticCodePath, 'modules', moduleName, 'context.md');
          if (!fs.existsSync(contextPath)) {
            const found = this.findModuleFuzzy(moduleName);
            if (found) return respond({ content: [{ type: 'text', text: fs.readFileSync(found, 'utf8') }] });
            return respond({ content: [{ type: 'text', text: `Módulo "${moduleName}" não encontrado. Disponíveis: ${this.listModuleNames().join(', ')}` }] });
          }
          return respond({ content: [{ type: 'text', text: fs.readFileSync(contextPath, 'utf8') }] });
        }

        case 'search_module': {
          const query = ((args as { query: string }).query ?? '').toLowerCase();
          const modules = this.listModuleNames();
          const scored = modules.map((m) => ({ name: m, score: scoreMatch(m.toLowerCase(), query) }))
            .sort((a, b) => b.score - a.score);
          const best = scored[0];
          if (!best || best.score === 0) {
            return respond({ content: [{ type: 'text', text: `Nenhum módulo encontrado para "${query}". Disponíveis: ${modules.join(', ')}` }] });
          }
          const contextPath = path.join(this.ticCodePath, 'modules', best.name, 'context.md');
          const content = fs.existsSync(contextPath) ? fs.readFileSync(contextPath, 'utf8') : `Contexto não encontrado.`;
          return respond({ content: [{ type: 'text', text: `# Módulo: ${best.name}\n\n${content}` }] });
        }

        case 'get_multigraph': return respond({ content: [{ type: 'text', text: this.readFile('multigraph.md') }] });
        case 'get_diagram': return respond({ content: [{ type: 'text', text: this.readFile('diagram.md') }] });
        case 'get_openapi': return respond({ content: [{ type: 'text', text: this.readFile('openapi.yaml') }] });
        case 'get_gaps': return respond({ content: [{ type: 'text', text: this.readFile('gaps.md') }] });
        case 'get_permissions': return respond({ content: [{ type: 'text', text: this.readFile('permissions.md') }] });
        case 'get_inheritance': return respond({ content: [{ type: 'text', text: this.readFile('inheritance.md') }] });

        case 'get_business_rules': {
          const modName = (args as { name: string }).name;
          const rulesPath = path.join(this.ticCodePath, 'modules', modName, 'business-rules.md');
          if (!fs.existsSync(rulesPath)) {
            const found = this.findModuleFuzzy(modName);
            if (found) {
              const foundRules = found.replace('context.md', 'business-rules.md');
              if (fs.existsSync(foundRules)) return respond({ content: [{ type: 'text', text: fs.readFileSync(foundRules, 'utf8') }] });
            }
            return respond({ content: [{ type: 'text', text: `Nenhuma regra de negócio detectada para "${modName}".` }] });
          }
          return respond({ content: [{ type: 'text', text: fs.readFileSync(rulesPath, 'utf8') }] });
        }

        case 'get_impact': {
          const fileArg = (args as { file: string }).file;
          const indexPath = path.join(this.ticCodePath, 'impact-index.json');
          if (!fs.existsSync(indexPath)) {
            return respond({ content: [{ type: 'text', text: 'impact-index.json não encontrado. Execute a análise novamente.' }] });
          }
          const index: ImpactIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

          // Busca exata ou fuzzy
          let entry = index[fileArg];
          if (!entry) {
            const keys = Object.keys(index);
            const fuzzy = keys.find((k) => k.includes(fileArg) || fileArg.includes(k.split('/').pop() ?? ''));
            if (fuzzy) entry = index[fuzzy];
          }

          if (!entry) {
            return respond({ content: [{ type: 'text', text: `Nenhum dependente encontrado para "${fileArg}". Este arquivo não é importado por outros.` }] });
          }

          const lines = [
            `# Impacto de Mudança: \`${fileArg}\``,
            '',
            `| Métrica | Valor |`,
            `| --- | --- |`,
            `| Dependentes diretos | ${entry.directCount} |`,
            `| Dependentes transitivos | ${entry.transitiveCount} |`,
            '',
            '## Dependentes Diretos',
            ...entry.direct.map((f) => `- \`${f}\``),
            '',
            entry.transitive.length > 0 ? '## Impacto Transitivo (sample)' : '',
            ...entry.transitive.slice(0, 20).map((f) => `- \`${f}\``),
            entry.transitiveCount > 20 ? `- ... e mais ${entry.transitiveCount - 20} arquivos afetados` : ''
          ].filter((l) => l !== undefined);

          return respond({ content: [{ type: 'text', text: lines.join('\n') }] });
        }

        case 'get_metrics': {
          const modName = (args as { name?: string }).name;
          if (!modName) {
            return respond({ content: [{ type: 'text', text: this.readFile('metrics-summary.md') }] });
          }
          const metricsPath = path.join(this.ticCodePath, 'modules', modName, 'metrics.md');
          if (!fs.existsSync(metricsPath)) {
            const found = this.findModuleFuzzy(modName);
            if (found) {
              const mPath = found.replace('context.md', 'metrics.md');
              if (fs.existsSync(mPath)) return respond({ content: [{ type: 'text', text: fs.readFileSync(mPath, 'utf8') }] });
            }
            return respond({ content: [{ type: 'text', text: `Métricas não encontradas para "${modName}". Use get_metrics() sem parâmetro para o resumo geral.` }] });
          }
          return respond({ content: [{ type: 'text', text: fs.readFileSync(metricsPath, 'utf8') }] });
        }

        case 'get_hotspots': {
          const summaryPath = path.join(this.ticCodePath, 'metrics-summary.md');
          if (!fs.existsSync(summaryPath)) {
            return respond({ content: [{ type: 'text', text: 'metrics-summary.md não encontrado. Execute a análise novamente.' }] });
          }
          const content = fs.readFileSync(summaryPath, 'utf8');
          // Extrai apenas a seção de hotspots (compacto)
          const hotspotsSection = content.split('## 📊')[0];
          return respond({ content: [{ type: 'text', text: hotspotsSection || content.slice(0, 2000) }] });
        }

        case 'get_patterns': {
          const modArg = (args as { module?: string }).module;
          if (modArg) {
            const pPath = path.join(this.ticCodePath, 'modules', modArg, 'patterns.md');
            if (fs.existsSync(pPath)) return respond({ content: [{ type: 'text', text: fs.readFileSync(pPath, 'utf8') }] });
            return respond({ content: [{ type: 'text', text: `Nenhum padrão detectado para o módulo "${modArg}".` }] });
          }
          return respond({ content: [{ type: 'text', text: this.readFile('patterns.md') }] });
        }

        case 'get_diff_impact': {
          const indexPath = path.join(this.ticCodePath, 'impact-index.json');
          if (!fs.existsSync(indexPath)) {
            return respond({ content: [{ type: 'text', text: 'impact-index.json não encontrado. Execute a análise primeiro.' }] });
          }

          const run = (cmd: string) => {
            try { return execSync(cmd, { cwd: this.projectPath, encoding: 'utf8', timeout: 5000 }).trim(); }
            catch { return ''; }
          };

          const staged    = run('git diff --name-only --cached HEAD');
          const unstaged  = run('git diff --name-only HEAD');
          const untracked = run('git ls-files --others --exclude-standard');

          const changedFiles = [...new Set([
            ...staged.split('\n'),
            ...unstaged.split('\n'),
            ...untracked.split('\n')
          ])].filter(Boolean);

          if (changedFiles.length === 0) {
            return respond({ content: [{ type: 'text', text: '✅ Nenhuma mudança detectada no git (working tree limpa).' }] });
          }

          const index: ImpactIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
          const directAll = new Set<string>();
          const transitiveAll = new Set<string>();
          const lines: string[] = [
            `# Impacto das Mudanças Atuais (git diff)`,
            '',
            `${changedFiles.length} arquivo(s) modificado(s):`,
            ''
          ];

          for (const file of changedFiles) {
            let entry = index[file];
            if (!entry) {
              const fuzzy = Object.keys(index).find((k) => k.includes(file) || file.endsWith(k.split('/').pop() ?? '__'));
              if (fuzzy) entry = index[fuzzy];
            }
            if (entry) {
              lines.push(`**\`${file}\`** — direto: ${entry.directCount} | transitivo: ${entry.transitiveCount}`);
              entry.direct.slice(0, 5).forEach((f) => { lines.push(`  • ${f}`); directAll.add(f); });
              entry.transitive.forEach((f) => transitiveAll.add(f));
            } else {
              lines.push(`**\`${file}\`** — sem dependentes`);
            }
          }

          changedFiles.forEach((f) => { directAll.delete(f); transitiveAll.delete(f); });

          lines.push('');
          lines.push('---');
          lines.push(`**Impacto consolidado desta mudança:**`);
          lines.push(`- Arquivos diretamente afetados: **${directAll.size}**`);
          lines.push(`- Arquivos transitivamente afetados: **${transitiveAll.size}**`);

          return respond({ content: [{ type: 'text', text: lines.join('\n') }] });
        }

        case 'get_db_schema': {
          const tableArg = (args as { table?: string }).table;
          const summaryPath = path.join(this.ticCodePath, 'db-schema-summary.md');
          const fullPath = path.join(this.ticCodePath, 'db-schema.md');
          if (!fs.existsSync(summaryPath)) {
            return respond({ content: [{ type: 'text', text: 'Schema de banco não detectado. Verifique se o projeto possui migrations SQL, schema.prisma, TypeORM entities, JPA entities, ou Django models.' }] });
          }
          if (!tableArg) {
            return respond({ content: [{ type: 'text', text: fs.readFileSync(summaryPath, 'utf8') }] });
          }
          // Return single table section from full report
          const full = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
          const sectionRe = new RegExp(`## \`?${tableArg}\`?[\\s\\S]*?(?=\\n## |\n*$)`, 'i');
          const section = full.match(sectionRe)?.[0];
          if (!section) {
            const jsonPath = path.join(this.ticCodePath, 'db-schema.json');
            if (fs.existsSync(jsonPath)) {
              const schema = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
              const found = schema.tables?.find((t: { name: string }) => t.name.toLowerCase().includes(tableArg.toLowerCase()));
              if (found) return respond({ content: [{ type: 'text', text: `# Tabela: ${found.name}\nFonte: ${found.sourceFile} (${found.sourceType})\nColunas: ${found.columns.map((c: { name: string; type: string }) => c.name).join(', ')}` }] });
            }
            return respond({ content: [{ type: 'text', text: `Tabela "${tableArg}" não encontrada. Use get_db_schema() para ver todas.` }] });
          }
          return respond({ content: [{ type: 'text', text: section.trim() }] });
        }

        case 'get_analysis_json': {
          const analysisPath = path.join(this.ticCodePath, 'analysis.json');
          if (!fs.existsSync(analysisPath)) {
            return respond({ content: [{ type: 'text', text: 'analysis.json não encontrado. Execute a análise novamente.' }] });
          }
          const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
          // Return compact summary without verbose arrays
          const compact = {
            ...analysis,
            modules: analysis.modules?.length,
            endpoints: analysis.endpoints?.length,
            impact: { indexedFiles: analysis.impact?.indexedFiles, topImpact: analysis.impact?.topImpact?.slice(0, 5) }
          };
          return respond({ content: [{ type: 'text', text: JSON.stringify(compact, null, 2) }] });
        }

        case 'get_violations': {
          const summaryPath = path.join(this.ticCodePath, 'metrics-summary.md');
          if (!fs.existsSync(summaryPath)) {
            return respond({ content: [{ type: 'text', text: 'Execute a análise novamente para detectar violações.' }] });
          }
          const content = fs.readFileSync(summaryPath, 'utf8');
          const violationsSection = content.split('## ⚠️ Violações Arquiteturais')[1] ?? 'Nenhuma violação detectada.';
          return respond({ content: [{ type: 'text', text: `# Violações Arquiteturais\n\n${violationsSection.split('---')[0]}` }] });
        }

        case 'get_plsql_object': {
          const objName = ((args as { name: string }).name ?? '').toUpperCase().trim();
          const objsPath = path.join(this.ticCodePath, 'plsql-objects.json');
          const callsPath = path.join(this.ticCodePath, 'call-graph.json');
          if (!fs.existsSync(objsPath)) {
            return respond({ content: [{ type: 'text', text: 'plsql-objects.json não encontrado. Execute a análise novamente.' }] });
          }
          type Obj = { type: string; name: string; packageName?: string; params?: string; returnType?: string; file: string; line: number; tablesRead: string[]; tablesWritten: string[] };
          const allObjs: Obj[] = JSON.parse(fs.readFileSync(objsPath, 'utf8'));

          // Fuzzy match: exact name or pkg.name
          const [pkgPart, namePart] = objName.includes('.') ? objName.split('.').slice(-2) : [undefined, objName];
          const found = allObjs.find((o) =>
            o.name === namePart &&
            (!pkgPart || o.packageName === pkgPart)
          ) ?? allObjs.find((o) => o.name.includes(namePart));

          if (!found) {
            const available = [...new Set(allObjs.filter((o) => o.type === 'PROCEDURE' || o.type === 'FUNCTION').map((o) => o.packageName ? `${o.packageName}.${o.name}` : o.name))].slice(0, 20).join(', ');
            return respond({ content: [{ type: 'text', text: `Objeto PL/SQL "${objName}" não encontrado.\nDisponíveis: ${available}` }] });
          }

          // Find callers and callees from call-graph
          type Edge = { from: string; to: string; type: string; label?: string };
          const callersOf: string[] = [];
          const calleesOf: string[] = [];
          if (fs.existsSync(callsPath)) {
            const cg = JSON.parse(fs.readFileSync(callsPath, 'utf8'));
            const dbNodeId = `db_${found.name}`;
            for (const edge of (cg.edges as Edge[])) {
              if (edge.type === 'PLSQL_CALL' || edge.type === 'DB_CALL') {
                if (edge.to.includes(found.name)) callersOf.push(edge.from);
                if (edge.from.includes(found.name)) calleesOf.push(edge.label ?? edge.to);
              }
              void dbNodeId;
            }
          }

          const lines = [
            `# PL/SQL: ${found.packageName ? `${found.packageName}.${found.name}` : found.name}`,
            '',
            `| Campo | Valor |`,
            `| --- | --- |`,
            `| Tipo | ${found.type} |`,
            `| Package | ${found.packageName ?? '—'} |`,
            `| Arquivo | \`${found.file}:${found.line}\` |`,
            found.params ? `| Parâmetros | \`${found.params}\` |` : '',
            found.returnType ? `| Retorno | ${found.returnType} |` : '',
            '',
          ];

          if (found.tablesRead.length > 0) {
            lines.push('## Tabelas Lidas (SELECT/FROM/CURSOR)');
            found.tablesRead.forEach((t) => lines.push(`- \`${t}\``));
            lines.push('');
          }
          if (found.tablesWritten.length > 0) {
            lines.push('## Tabelas Escritas (INSERT/UPDATE/DELETE/MERGE)');
            found.tablesWritten.forEach((t) => lines.push(`- \`${t}\``));
            lines.push('');
          }
          if (callersOf.length > 0) {
            lines.push('## Chamado Por');
            callersOf.slice(0, 10).forEach((c) => lines.push(`- \`${c}\``));
            lines.push('');
          }
          if (calleesOf.length > 0) {
            lines.push('## Chama');
            calleesOf.slice(0, 10).forEach((c) => lines.push(`- \`${c}\``));
            lines.push('');
          }
          if (found.tablesRead.length === 0 && found.tablesWritten.length === 0) {
            lines.push('> Nenhuma tabela detectada. Pode usar SQL dinâmico (EXECUTE IMMEDIATE) ou não acessar tabelas diretamente.');
          }

          return respond({ content: [{ type: 'text', text: lines.filter((l) => l !== '').join('\n') }] });
        }

        case 'get_table_access': {
          const tableName = ((args as { table: string }).table ?? '').toUpperCase().trim();
          const objsPath = path.join(this.ticCodePath, 'plsql-objects.json');
          if (!fs.existsSync(objsPath)) {
            return respond({ content: [{ type: 'text', text: 'plsql-objects.json não encontrado. Execute a análise novamente.' }] });
          }
          type ObjTA = { type: string; name: string; packageName?: string; file: string; line: number; tablesRead: string[]; tablesWritten: string[] };
          const allObjs: ObjTA[] = JSON.parse(fs.readFileSync(objsPath, 'utf8'));

          const readers = allObjs.filter((o) => o.tablesRead.some((t) => t.includes(tableName)));
          const writers = allObjs.filter((o) => o.tablesWritten.some((t) => t.includes(tableName)));

          if (readers.length === 0 && writers.length === 0) {
            // Try partial match
            const allTables = new Set([
              ...allObjs.flatMap((o) => o.tablesRead),
              ...allObjs.flatMap((o) => o.tablesWritten),
            ]);
            const similar = [...allTables].filter((t) => t.includes(tableName.slice(0, 4))).slice(0, 10).join(', ');
            return respond({ content: [{ type: 'text', text: `Nenhuma procedure/function acessa a tabela "${tableName}". Tabelas similares: ${similar || 'nenhuma'}` }] });
          }

          const fmt = (o: ObjTA) => `\`${o.packageName ? `${o.packageName}.${o.name}` : o.name}\` (\`${o.file}:${o.line}\`)`;
          const lines = [`# Acesso à Tabela: \`${tableName}\``, ''];

          if (readers.length > 0) {
            lines.push(`## Lê (SELECT / CURSOR) — ${readers.length}`);
            readers.slice(0, 20).forEach((o) => lines.push(`- ${fmt(o)}`));
            lines.push('');
          }
          if (writers.length > 0) {
            lines.push(`## Escreve (INSERT / UPDATE / DELETE / MERGE) — ${writers.length}`);
            writers.slice(0, 20).forEach((o) => lines.push(`- ${fmt(o)}`));
            lines.push('');
          }

          return respond({ content: [{ type: 'text', text: lines.join('\n') }] });
        }

        case 'get_dead_plsql': {
          const deadPath = path.join(this.ticCodePath, 'dead-plsql.json');
          if (!fs.existsSync(deadPath)) {
            return respond({ content: [{ type: 'text', text: 'dead-plsql.json não encontrado. Execute a análise novamente.' }] });
          }
          type DeadObj = { type: string; name: string; packageName?: string; file: string; line: number };
          const dead: DeadObj[] = JSON.parse(fs.readFileSync(deadPath, 'utf8'));

          if (dead.length === 0) {
            return respond({ content: [{ type: 'text', text: '✅ Nenhuma procedure ou function órfã detectada. Todo o código PL/SQL é referenciado.' }] });
          }

          const lines = [
            `# Código PL/SQL Morto — ${dead.length} objetos não referenciados`,
            '',
            '> ⚠️ Estas procedures/functions não são chamadas por nenhum código Java, TypeScript ou outro PL/SQL detectado.',
            '> Podem ser entry points externos (DBLinks, jobs, chamadas diretas) — confirme antes de remover.',
            '',
            '| Tipo | Nome | Arquivo |',
            '| --- | --- | --- |',
            ...dead.slice(0, 50).map((o) => `| ${o.type} | \`${o.packageName ? `${o.packageName}.${o.name}` : o.name}\` | \`${o.file}:${o.line}\` |`),
          ];
          if (dead.length > 50) lines.push(`\n*... e mais ${dead.length - 50} objetos*`);

          return respond({ content: [{ type: 'text', text: lines.join('\n') }] });
        }

        case 'get_transactions':
          return respond({ content: [{ type: 'text', text: this.readFile('transactions.md') }] });

        case 'get_batch_jobs':
          return respond({ content: [{ type: 'text', text: this.readFile('batch-jobs.md') }] });

        case 'get_angular_modules':
          return respond({ content: [{ type: 'text', text: this.readFile('angular-modules.md') }] });

        case 'get_dead_components': {
          const dcPath = path.join(this.ticCodePath, 'dead-components.json');
          if (!fs.existsSync(dcPath)) {
            return respond({ content: [{ type: 'text', text: 'dead-components.json não encontrado. Execute a análise novamente.' }] });
          }
          type DC = { file: string; type: 'react' | 'angular' };
          const dc: DC[] = JSON.parse(fs.readFileSync(dcPath, 'utf8'));
          if (dc.length === 0) {
            return respond({ content: [{ type: 'text', text: '✅ Nenhum componente sem importadores detectado.' }] });
          }
          const react = dc.filter((d) => d.type === 'react');
          const angular = dc.filter((d) => d.type === 'angular');
          const dcLines = [
            `# Componentes Sem Uso — ${dc.length} detectados`,
            '',
            '> Nenhum outro arquivo importa estes componentes. Podem ser pages acessadas por router (não por import direto).',
            '',
          ];
          if (react.length > 0) {
            dcLines.push(`## React (.tsx) — ${react.length}`);
            react.slice(0, 30).forEach((d) => dcLines.push(`- \`${d.file}\``));
            if (react.length > 30) dcLines.push(`*... e mais ${react.length - 30}*`);
            dcLines.push('');
          }
          if (angular.length > 0) {
            dcLines.push(`## Angular (.component/.directive/.pipe) — ${angular.length}`);
            angular.slice(0, 30).forEach((d) => dcLines.push(`- \`${d.file}\``));
            if (angular.length > 30) dcLines.push(`*... e mais ${angular.length - 30}*`);
          }
          return respond({ content: [{ type: 'text', text: dcLines.join('\n') }] });
        }

        case 'find_path': {
          const fromArg = ((args as { from: string }).from ?? '').trim();
          const toArg = ((args as { to: string }).to ?? '').trim();
          const graphPath = path.join(this.ticCodePath, 'dep-graph.json');
          if (!fs.existsSync(graphPath)) {
            return respond({ content: [{ type: 'text', text: 'dep-graph.json não encontrado. Execute a análise novamente.' }] });
          }

          type GNode = { id: string; path: string };
          type GEdge = { from: string; to: string };
          const depGraph: { nodes: GNode[]; edges: GEdge[] } = JSON.parse(fs.readFileSync(graphPath, 'utf8'));

          // Fuzzy-find start and end nodes
          const findNode = (query: string): string | null => {
            const q = query.toLowerCase();
            const exact = depGraph.nodes.find((n) => n.path === query || n.id === query);
            if (exact) return exact.id;
            const partial = depGraph.nodes.find((n) => n.path.toLowerCase().includes(q) || n.path.toLowerCase().endsWith(q));
            return partial?.id ?? null;
          };

          const fromId = findNode(fromArg);
          const toId = findNode(toArg);

          if (!fromId) return respond({ content: [{ type: 'text', text: `Arquivo de origem não encontrado: "${fromArg}". Verifique o caminho relativo.` }] });
          if (!toId) return respond({ content: [{ type: 'text', text: `Arquivo de destino não encontrado: "${toArg}". Verifique o caminho relativo.` }] });
          if (fromId === toId) return respond({ content: [{ type: 'text', text: '✅ Origem e destino são o mesmo arquivo.' }] });

          // Build adjacency list
          const adj = new Map<string, string[]>();
          for (const edge of depGraph.edges) {
            if (!adj.has(edge.from)) adj.set(edge.from, []);
            adj.get(edge.from)!.push(edge.to);
          }

          // BFS
          const visited = new Set<string>([fromId]);
          const parent = new Map<string, string>();
          const queue = [fromId];
          let found = false;

          while (queue.length > 0 && !found) {
            const current = queue.shift()!;
            for (const next of adj.get(current) ?? []) {
              if (visited.has(next)) continue;
              visited.add(next);
              parent.set(next, current);
              if (next === toId) { found = true; break; }
              queue.push(next);
            }
          }

          if (!found) {
            return respond({ content: [{ type: 'text', text: `Nenhum caminho encontrado entre "${fromArg}" e "${toArg}".\nEsses arquivos podem não se conectar por dependências de import.` }] });
          }

          // Reconstruct path
          const pathNodes: string[] = [];
          let cur = toId;
          while (cur !== fromId) {
            const nodeInfo = depGraph.nodes.find((n) => n.id === cur);
            pathNodes.unshift(nodeInfo?.path ?? cur);
            cur = parent.get(cur)!;
          }
          pathNodes.unshift(depGraph.nodes.find((n) => n.id === fromId)?.path ?? fromId);

          const pathLines = [
            `# Caminho: \`${fromArg}\` → \`${toArg}\``,
            '',
            `**${pathNodes.length - 1} salto(s)**`,
            '',
            ...pathNodes.map((p, i) => `${i + 1}. \`${p}\``),
          ];

          return respond({ content: [{ type: 'text', text: pathLines.join('\n') }] });
        }

        case 'trace_flow': {
          const entry = ((args as { entry: string }).entry ?? '').trim();
          return respond({ content: [{ type: 'text', text: this.traceFlowTool(entry) }] });
        }

        case 'search_code': {
          const query = ((args as { query: string }).query ?? '').trim();
          return respond({ content: [{ type: 'text', text: this.searchCodeTool(query) }] });
        }

        case 'get_concept_map': {
          const concept = ((args as { concept: string }).concept ?? '').trim();
          return respond({ content: [{ type: 'text', text: this.getConceptMapTool(concept) }] });
        }

        default:
          return respond({ content: [{ type: 'text', text: `Ferramenta desconhecida: ${name}` }] });
      }
    });
  }

  private readFile(relativePath: string): string {
    const fullPath = path.join(this.ticCodePath, relativePath);
    if (!fs.existsSync(fullPath)) {
      return `Arquivo não encontrado: ${fullPath}\nExecute o TIC Analyzer para gerar os artefatos.`;
    }
    return fs.readFileSync(fullPath, 'utf8');
  }

  private listModuleNames(): string[] {
    const modulesDir = path.join(this.ticCodePath, 'modules');
    if (!fs.existsSync(modulesDir)) return [];
    return fs.readdirSync(modulesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  }

  private findModuleFuzzy(name: string): string | null {
    const lower = name.toLowerCase();
    const modulesDir = path.join(this.ticCodePath, 'modules');
    if (!fs.existsSync(modulesDir)) return null;
    for (const entry of fs.readdirSync(modulesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name.toLowerCase().includes(lower)) {
        const contextPath = path.join(modulesDir, entry.name, 'context.md');
        if (fs.existsSync(contextPath)) return contextPath;
      }
    }
    return null;
  }

  // ── trace_flow ──────────────────────────────────────────────────────────────

  private loadCallGraph(): { nodes: CallGraphNode[]; edges: CallGraphEdge[] } | null {
    if (this.callGraphCache) return this.callGraphCache;
    const p = path.join(this.ticCodePath, 'call-graph.json');
    if (!fs.existsSync(p)) return null;
    this.callGraphCache = JSON.parse(fs.readFileSync(p, 'utf8')) as { nodes: CallGraphNode[]; edges: CallGraphEdge[] };
    return this.callGraphCache;
  }

  private traceFlowTool(entry: string): string {
    const cg = this.loadCallGraph();
    if (!cg) return 'call-graph.json não encontrado. Execute a análise novamente.';

    const lower = entry.toLowerCase();
    const isUrl = entry.startsWith('/');

    const matchedNodeIds = new Set<string>();
    for (const node of cg.nodes) {
      if (
        node.label.toLowerCase().includes(lower) ||
        node.file.toLowerCase().includes(lower) ||
        node.id.toLowerCase().includes(lower)
      ) {
        matchedNodeIds.add(node.id);
      }
    }
    if (isUrl) {
      for (const edge of cg.edges) {
        if (edge.type === 'HTTP_CALL' && edge.label?.toLowerCase().includes(lower)) {
          matchedNodeIds.add(edge.from);
          matchedNodeIds.add(edge.to);
        }
      }
    }

    if (matchedNodeIds.size === 0) {
      return `Nenhum nó encontrado para "${entry}" no call-graph.\n\nNós disponíveis (amostra): ${cg.nodes.slice(0, 15).map((n) => n.label).join(', ')}`;
    }

    // BFS forward (downstream)
    const downstream = new Set<string>();
    const downQueue = [...matchedNodeIds];
    while (downQueue.length > 0) {
      const cur = downQueue.shift()!;
      for (const edge of cg.edges) {
        if (edge.from === cur && !downstream.has(edge.to) && !matchedNodeIds.has(edge.to)) {
          downstream.add(edge.to);
          downQueue.push(edge.to);
        }
      }
    }

    // BFS backward (upstream)
    const upstream = new Set<string>();
    const upQueue = [...matchedNodeIds];
    while (upQueue.length > 0) {
      const cur = upQueue.shift()!;
      for (const edge of cg.edges) {
        if (edge.to === cur && !upstream.has(edge.from) && !matchedNodeIds.has(edge.from)) {
          upstream.add(edge.from);
          upQueue.push(edge.from);
        }
      }
    }

    const nodeMap = new Map<string, CallGraphNode>(cg.nodes.map((n) => [n.id, n]));

    // Load PL/SQL data
    const plsqlPath = path.join(this.ticCodePath, 'plsql-objects.json');
    const plsqlMap = new Map<string, PlsqlObj>();
    if (fs.existsSync(plsqlPath)) {
      const objs: PlsqlObj[] = JSON.parse(fs.readFileSync(plsqlPath, 'utf8'));
      for (const obj of objs) plsqlMap.set(obj.name.toUpperCase(), obj);
    }

    // Load transactions
    const txPath = path.join(this.ticCodePath, 'transactions.json');
    const transactions: TxBoundary[] = fs.existsSync(txPath)
      ? JSON.parse(fs.readFileSync(txPath, 'utf8'))
      : [];

    const seedNode = nodeMap.get([...matchedNodeIds][0]);
    const lines: string[] = [];
    lines.push(`## Trace: ${seedNode?.label ?? entry} (${seedNode?.layer ?? 'unknown'})`);
    if (seedNode?.file) lines.push(`Arquivo: \`${seedNode.file}${seedNode.line ? ':' + seedNode.line : ''}\``);
    lines.push('');

    // Upstream
    const upstreamNodes = [...upstream].map((id) => nodeMap.get(id)).filter(Boolean) as CallGraphNode[];
    if (upstreamNodes.length > 0) {
      lines.push('### ← Chamado por (upstream)');
      for (const n of upstreamNodes.slice(0, 10)) {
        const edge = cg.edges.find((e) => e.to === n.id && (matchedNodeIds.has(e.from) || upstream.has(e.from)));
        lines.push(`- \`${n.file || n.label}\`${edge ? ` — ${edge.type} ${edge.confidence}` : ''}`);
      }
      lines.push('');
    }

    // Downstream
    const downNodes = [...downstream].map((id) => nodeMap.get(id)).filter(Boolean) as CallGraphNode[];
    const downFrontend = downNodes.filter((n) => n.layer === 'frontend');
    const downBackend = downNodes.filter((n) => n.layer === 'backend');
    const downDb = downNodes.filter((n) => n.layer === 'database');

    if (downNodes.length > 0) {
      lines.push('### → Chama (downstream)');
      if (downFrontend.length > 0) {
        lines.push('**Frontend:**');
        downFrontend.slice(0, 5).forEach((n) => lines.push(`- \`${n.file || n.label}\``));
      }
      if (downBackend.length > 0) {
        lines.push('**Backend:**');
        downBackend.slice(0, 8).forEach((n) => lines.push(`- \`${n.file || n.label}\``));
      }
      if (downDb.length > 0) {
        lines.push('**Backend → Banco:**');
        for (const n of downDb.slice(0, 10)) {
          const plsql = plsqlMap.get(n.label.toUpperCase());
          const edge = cg.edges.find((e) => e.to === n.id);
          lines.push(`- \`${n.label}\` — ${plsql?.type ?? 'PROCEDURE'} (${edge?.type ?? 'DB_CALL'} ${edge?.confidence ?? '🟡'})`);
          if (plsql?.tablesRead?.length) lines.push(`  - Lê: ${plsql.tablesRead.slice(0, 6).join(', ')}`);
          if (plsql?.tablesWritten?.length) lines.push(`  - Escreve: ${plsql.tablesWritten.slice(0, 6).join(', ')}`);
        }
      }
      lines.push('');
    }

    // Consolidated table access
    const allDbIds = new Set([...matchedNodeIds, ...downstream].filter((id) => nodeMap.get(id)?.layer === 'database'));
    const allReads = new Set<string>();
    const allWrites = new Set<string>();
    for (const id of allDbIds) {
      const node = nodeMap.get(id);
      if (!node) continue;
      const plsql = plsqlMap.get(node.label.toUpperCase());
      if (plsql) {
        plsql.tablesRead.forEach((t) => allReads.add(t));
        plsql.tablesWritten.forEach((t) => allWrites.add(t));
      }
    }
    if (allReads.size > 0 || allWrites.size > 0) {
      const allTables = new Set([...allReads, ...allWrites]);
      lines.push('### Tabelas Acessadas');
      lines.push('| Tabela | Leitura | Escrita |');
      lines.push('|--------|---------|---------|');
      for (const table of allTables) {
        lines.push(`| ${table} | ${allReads.has(table) ? '✓' : '-'} | ${allWrites.has(table) ? '✓' : '-'} |`);
      }
      lines.push('');
    }

    // @Transactional for matched backend files
    const backendFiles = new Set([
      ...[...matchedNodeIds].map((id) => nodeMap.get(id)).filter((n) => n?.layer === 'backend').map((n) => n!.file),
      ...downBackend.map((n) => n.file),
    ].filter(Boolean) as string[]);
    const relevantTx = transactions.filter((tx) => backendFiles.has(tx.file));
    if (relevantTx.length > 0) {
      lines.push('### @Transactional');
      for (const tx of relevantTx.slice(0, 5)) {
        const method = tx.methodName ? `.${tx.methodName}` : '';
        const extra = [tx.propagation, tx.readOnly ? 'readOnly' : '', tx.rollbackFor ? `rollbackFor=${tx.rollbackFor}` : ''].filter(Boolean).join(', ');
        lines.push(`- \`${tx.file}:${tx.line}\` — ${tx.className}${method} (${extra})`);
      }
    }

    return lines.join('\n');
  }

  // ── search_code ─────────────────────────────────────────────────────────────

  private loadSearchIndex(): SearchIndexEntry[] {
    if (this.searchIndexCache) return this.searchIndexCache;
    const p = path.join(this.ticCodePath, 'search-index.json');
    if (!fs.existsSync(p)) return [];
    this.searchIndexCache = JSON.parse(fs.readFileSync(p, 'utf8')) as SearchIndexEntry[];
    return this.searchIndexCache;
  }

  private loadInvertedIndex(): Map<string, string[]> {
    if (this.invertedIndexCache) return this.invertedIndexCache;
    const entries = this.loadSearchIndex();
    const inv = new Map<string, string[]>();
    for (const entry of entries) {
      for (const term of entry.terms) {
        if (!inv.has(term)) inv.set(term, []);
        inv.get(term)!.push(entry.file);
      }
    }
    this.invertedIndexCache = inv;
    return inv;
  }

  private tokenizeQuery(query: string): string[] {
    const raw = query.match(/[a-zA-Z]{3,}/g) ?? [];
    const tokens = new Set<string>();
    for (const word of raw) {
      const parts = word
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
        .replace(/([a-z\d])([A-Z])/g, '$1_$2')
        .split('_')
        .map((t) => t.toLowerCase())
        .filter((t) => t.length >= 3);
      parts.forEach((p) => tokens.add(p));
      tokens.add(word.toLowerCase());
    }
    return [...tokens];
  }

  private searchCodeTool(query: string): string {
    if (!query) return 'Informe um query para busca.';

    const entries = this.loadSearchIndex();
    if (entries.length === 0) {
      return 'search-index.json não encontrado. Execute a análise novamente para gerar o índice de busca.';
    }

    const queryTokens = this.tokenizeQuery(query);
    if (queryTokens.length === 0) return 'Query muito curta. Use pelo menos 3 caracteres.';

    const inv = this.loadInvertedIndex();
    const scores = new Map<string, number>();
    for (const token of queryTokens) {
      for (const f of inv.get(token) ?? []) scores.set(f, (scores.get(f) ?? 0) + 2);
      for (const [term, files] of inv) {
        if (term !== token && term.startsWith(token)) {
          for (const f of files) scores.set(f, (scores.get(f) ?? 0) + 1);
        }
      }
    }

    if (scores.size === 0) {
      return `Nenhum arquivo encontrado para "${query}". Tente termos mais gerais.`;
    }

    const entryMap = new Map<string, SearchIndexEntry>(entries.map((e) => [e.file, e]));
    const top10 = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

    const lines: string[] = [
      `## Resultados para: "${query}"`,
      `*${top10.length} de ${scores.size} arquivos relevantes*`,
      ''
    ];
    for (const [file, score] of top10) {
      const entry = entryMap.get(file);
      lines.push(`### \`${file}\` (score: ${score})`);
      if (entry?.snippet) lines.push(`> ${entry.snippet}`);
      lines.push('');
    }
    lines.push(`*Tokens da query: ${queryTokens.join(', ')}*`);
    return lines.join('\n');
  }

  // ── get_concept_map ─────────────────────────────────────────────────────────

  private getConceptMapTool(concept: string): string {
    if (!concept) return 'Informe um conceito para mapear.';
    const lower = concept.toLowerCase();
    const lines: string[] = [`## Mapa do Conceito: "${concept}"`, ''];

    // Modules + endpoints from analysis.json
    const analysisPath = path.join(this.ticCodePath, 'analysis.json');
    if (fs.existsSync(analysisPath)) {
      type AnalysisModule = { name: string; fileCount: number };
      type AnalysisEndpoint = { method: string; path: string; file: string; line: number; controller?: string };
      const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8')) as {
        modules?: AnalysisModule[];
        endpoints?: AnalysisEndpoint[];
      };
      const matchedModules = (analysis.modules ?? []).filter((m) => m.name.toLowerCase().includes(lower));
      if (matchedModules.length > 0) {
        lines.push(`### Módulos (${matchedModules.length})`);
        matchedModules.slice(0, 8).forEach((m) => lines.push(`- \`${m.name}\` — ${m.fileCount} arquivos`));
        lines.push('');
      }
      const matchedEndpoints = (analysis.endpoints ?? []).filter(
        (e) => e.path.toLowerCase().includes(lower) || (e.controller?.toLowerCase().includes(lower) ?? false)
      );
      if (matchedEndpoints.length > 0) {
        lines.push(`### Endpoints REST (${matchedEndpoints.length})`);
        lines.push('| Método | Rota | Arquivo |');
        lines.push('|--------|------|---------|');
        matchedEndpoints.slice(0, 8).forEach((e) =>
          lines.push(`| ${e.method} | \`${e.path}\` | \`${e.file}:${e.line}\` |`)
        );
        lines.push('');
      }
    }

    // PL/SQL objects
    const plsqlPath = path.join(this.ticCodePath, 'plsql-objects.json');
    let cachedPlsql: PlsqlObj[] | null = null;
    if (fs.existsSync(plsqlPath)) {
      cachedPlsql = JSON.parse(fs.readFileSync(plsqlPath, 'utf8')) as PlsqlObj[];
      const matched = cachedPlsql.filter((o) =>
        o.name.toLowerCase().includes(lower) ||
        (o.packageName?.toLowerCase().includes(lower) ?? false) ||
        o.tablesRead.some((t) => t.toLowerCase().includes(lower)) ||
        o.tablesWritten.some((t) => t.toLowerCase().includes(lower))
      );
      if (matched.length > 0) {
        lines.push(`### Procedures PL/SQL (${matched.length})`);
        lines.push('| Nome | Lê | Escreve |');
        lines.push('|------|----|---------|');
        matched.slice(0, 8).forEach((o) => {
          const name = o.packageName ? `${o.packageName}.${o.name}` : o.name;
          lines.push(`| \`${name}\` | ${o.tablesRead.slice(0, 3).join(', ') || '—'} | ${o.tablesWritten.slice(0, 3).join(', ') || '—'} |`);
        });
        lines.push('');
      }
    }

    // DB schema tables
    const dbSchemaPath = path.join(this.ticCodePath, 'db-schema.json');
    if (fs.existsSync(dbSchemaPath)) {
      type DbTable = { name: string; columns: unknown[] };
      const schema = JSON.parse(fs.readFileSync(dbSchemaPath, 'utf8')) as { tables?: DbTable[] };
      const matchedTables = (schema.tables ?? []).filter((t) => t.name.toLowerCase().includes(lower));
      if (matchedTables.length > 0) {
        lines.push(`### Tabelas (${matchedTables.length})`);
        const plsqlObjs = cachedPlsql ?? [];
        matchedTables.slice(0, 8).forEach((t) => {
          const accessors = plsqlObjs.filter(
            (o) => o.tablesRead.includes(t.name) || o.tablesWritten.includes(t.name)
          ).length;
          lines.push(`- \`${t.name}\`${accessors > 0 ? ` — acessada por ${accessors} procedure(s)` : ''}`);
        });
        lines.push('');
      }
    }

    // @Transactional
    const txPath = path.join(this.ticCodePath, 'transactions.json');
    if (fs.existsSync(txPath)) {
      const txs: TxBoundary[] = JSON.parse(fs.readFileSync(txPath, 'utf8'));
      const matched = txs.filter(
        (t) =>
          t.className.toLowerCase().includes(lower) ||
          (t.methodName?.toLowerCase().includes(lower) ?? false) ||
          t.file.toLowerCase().includes(lower)
      );
      if (matched.length > 0) {
        lines.push(`### @Transactional (${matched.length})`);
        matched.slice(0, 5).forEach((t) => {
          const method = t.methodName ? `.${t.methodName}` : '';
          lines.push(`- \`${t.file}:${t.line}\` — ${t.className}${method} (${t.propagation}${t.readOnly ? ', readOnly' : ''})`);
        });
        lines.push('');
      }
    }

    // Angular modules
    const angularPath = path.join(this.ticCodePath, 'angular-modules.json');
    if (fs.existsSync(angularPath)) {
      type AngularMod = { name: string; file: string; lazyRoutes?: Array<{ path: string }> };
      const angular = JSON.parse(fs.readFileSync(angularPath, 'utf8')) as { modules?: AngularMod[] };
      const matched = (angular.modules ?? []).filter(
        (m) => m.name.toLowerCase().includes(lower) || (m.lazyRoutes ?? []).some((r) => r.path.toLowerCase().includes(lower))
      );
      if (matched.length > 0) {
        lines.push(`### Módulos Angular (${matched.length})`);
        matched.slice(0, 5).forEach((m) => lines.push(`- \`${m.name}\` (\`${m.file}\`)`));
        lines.push('');
      }
    }

    // Search index cross-reference
    const siEntries = this.loadSearchIndex();
    if (siEntries.length > 0) {
      const queryTokens = this.tokenizeQuery(concept);
      const inv = this.loadInvertedIndex();
      const scores = new Map<string, number>();
      for (const token of queryTokens) {
        for (const f of inv.get(token) ?? []) scores.set(f, (scores.get(f) ?? 0) + 1);
      }
      const topFiles = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
      if (topFiles.length > 0) {
        lines.push('### Arquivos Relacionados');
        topFiles.forEach(([file, score]) => lines.push(`- \`${file}\` (score ${score})`));
        lines.push('');
      }
    }

    if (lines.length <= 2) {
      return `Nenhum artefato encontrado para o conceito "${concept}". Tente termos mais genéricos ou verifique se a análise foi executada.`;
    }

    return lines.join('\n');
  }

  async startHttp(port = 7432): Promise<void> {
    const app = http.createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', projectPath: this.projectPath, version: '2.0.0' }));
        return;
      }
      if (req.url === '/mcp' || req.url?.startsWith('/mcp')) {
        try {
          const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
          const serverInstance = this.createServerInstance();
          await serverInstance.connect(transport);
          let body: unknown;
          if (req.method === 'POST') {
            body = await new Promise((resolve, reject) => {
              let data = '';
              req.on('data', (chunk) => { data += chunk; });
              req.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
              req.on('error', reject);
            });
          }
          await transport.handleRequest(req, res, body);
        } catch (err) {
          if (!res.headersSent) { res.writeHead(500); res.end(String(err)); }
        }
        return;
      }
      res.writeHead(404);
      res.end('Not found');
    });
    this.httpServer = app;
    return new Promise((resolve, reject) => {
      app.listen(port, '127.0.0.1', () => {
        console.log(`TIC Analyzer MCP Server v2.0.0 em http://localhost:${port}/mcp`);
        resolve();
      });
      app.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.httpServer) this.httpServer.close(() => resolve());
      else resolve();
    });
  }

  isRunning(): boolean {
    return this.httpServer?.listening ?? false;
  }
}

function scoreMatch(moduleName: string, query: string): number {
  if (moduleName === query) return 100;
  if (moduleName.startsWith(query)) return 80;
  if (moduleName.includes(query)) return 60;
  const queryWords = query.split(/[\s-_]/);
  const matches = queryWords.filter((w) => w.length > 2 && moduleName.includes(w));
  if (matches.length > 0) return 40 * (matches.length / queryWords.length);
  return 0;
}
