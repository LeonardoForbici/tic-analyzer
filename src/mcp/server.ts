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
import { openIndexDb, INDEX_DB_FILE } from '../analyzer/store/indexDb';
import { queryImpact, queryFindPath, querySearch, queryCallGraph, queryCrossTierTrace, queryTableColumns, queryVectorSearch, embeddingsCount } from './queries';
import { queryImpactOf, queryBlastRadius, type ImpactOfResult, type BlastRadiusResult } from '../analyzer/store/impactQueries';
import { queryGraphLevel } from '../analyzer/store/graphQueries';
import { buildAgentBrief, buildDiagnosis } from './agentBrief';
import { loadTriage, transitionTriageItem, type TriageState, type TriageCategory, type TriagePriority } from '../analyzer/store/triageStore';
import { loadActivity } from '../analyzer/store/activityLog';
import { suggestReviewers } from '../analyzer/computeOwnership';
import { loadPortfolio } from '../analyzer/store/portfolioStore';
import { getEmbedder } from '../analyzer/semantic/embeddings';

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
  private sseClients = new Set<http.ServerResponse>();
  private projectPath: string;
  private ticCodePath: string;
  private tokenLog: TokenEntry[] = [];
  private sessionStart = Date.now();
  private onToolCall?: (entry: TokenEntry) => void;
  private callGraphCache: { nodes: CallGraphNode[]; edges: CallGraphEdge[] } | null = null;
  private searchIndexCache: SearchIndexEntry[] | null = null;
  private invertedIndexCache: Map<string, string[]> | null = null;

  /** Caminho do índice SQLite consultável (escala sem o teto de 3000 nós). */
  private get indexDbPath(): string {
    return path.join(this.ticCodePath, INDEX_DB_FILE);
  }

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
          description: 'Retorna o contexto de um módulo. detail="summary" (default, ~1k tokens) traz o início do contexto; detail="full" traz tudo.',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              detail: { type: 'string', enum: ['summary', 'full'], description: 'summary (default) ou full' }
            },
            required: ['name']
          }
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
          description: 'Retorna o multi-grafo: Frontend → Endpoint → Backend → PL/SQL. detail="summary" (default) traz contagens + amostra; detail="full" traz o grafo inteiro.',
          inputSchema: {
            type: 'object',
            properties: { detail: { type: 'string', enum: ['summary', 'full'], description: 'summary (default) ou full' } }
          }
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
          name: 'get_impact_of',
          description: 'Impacto cross-tier de QUALQUER entidade: arquivo, método, procedure/function PL/SQL, tabela ou coluna. Atravessa camadas (coluna → procedure → DAO Java → endpoint → tela React). Aceita nome livre ("PKG_CLIENTE.SALVAR", "CLIENTES", "CLIENTES.CPF", "UserService.java") ou id canônico ("table:CLIENTES"). ~400-800 tokens.',
          inputSchema: {
            type: 'object',
            properties: {
              entity: { type: 'string', description: 'Nome ou id da entidade (arquivo/procedure/tabela/coluna).' },
              max_depth: { type: 'number', description: 'Profundidade máxima de saltos (opcional).' }
            },
            required: ['entity']
          }
        },
        {
          name: 'get_blast_radius',
          description: 'Resumo ULTRA-COMPACTO do impacto de uma entidade (~200 tokens): contagens por tipo/módulo + top 20 afetados por criticidade. Use PRIMEIRO, antes de get_impact_of ou de ler arquivos, para decidir se precisa de detalhe.',
          inputSchema: {
            type: 'object',
            properties: {
              entity: { type: 'string', description: 'Nome ou id da entidade (arquivo/procedure/tabela/coluna).' }
            },
            required: ['entity']
          }
        },
        {
          name: 'get_table_impact',
          description: 'Atalho: impacto de mudar uma tabela ou coluna do banco — quais procedures, triggers, DAOs Java e telas são afetados. ~300 tokens.',
          inputSchema: {
            type: 'object',
            properties: {
              table: { type: 'string', description: 'Nome da tabela (ex: "CLIENTES").' },
              column: { type: 'string', description: 'Coluna específica (opcional, ex: "CPF").' }
            },
            required: ['table']
          }
        },
        {
          name: 'get_graph_level',
          description: 'Grafo hierárquico agregado (app → layer → module → file → symbol). Sem "expanded": visão por camadas. Expanda passando ids (ex: ["layer:backend","module:cliente"]). Peso da aresta = nº de dependências arquivo→arquivo agregadas. ~300-600 tokens.',
          inputSchema: {
            type: 'object',
            properties: {
              expanded: { type: 'array', items: { type: 'string' }, description: 'Ids expandidos: layer:<nome>, module:<nome>, file:<rel_path>.' }
            }
          }
        },
        {
          name: 'get_arch_rules',
          description: 'Regras de arquitetura do projeto (.tic-rules.json) e violações atuais (architecture drift). ~300 tokens.',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'get_arch_suggestions',
          description: 'Oportunidades de melhoria arquitetural (skill improve-codebase-architecture): módulos pass-through (deletion test), acoplamento alto, god modules e circulares — com sugestão de padrão. ~400 tokens.',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'get_risk_prediction',
          description: 'Manutenção preditiva: onde o próximo bug tende a nascer (churn do git × complexidade × acoplamento), com score 0-100 e motivos. ~300 tokens.',
          inputSchema: { type: 'object', properties: { limit: { type: 'number', description: 'Top N (default 10).' } } }
        },
        {
          name: 'get_agent_brief',
          description: 'AGENT-BRIEF (skill triage de mattpocock/skills): brief completo e acionável de uma entidade — Category, Summary, Current/Desired behavior, Key interfaces, Acceptance criteria e Out of scope — preenchido pelo grafo de impacto. Pronto para issue ou para um agente implementar. ~600 tokens.',
          inputSchema: {
            type: 'object',
            properties: { entity: { type: 'string', description: 'Arquivo/procedure/tabela/coluna ou id de item de triagem.' } },
            required: ['entity']
          }
        },
        {
          name: 'get_diagnosis',
          description: 'Diagnose disciplinado (skill diagnose): para um sintoma entre duas entidades, devolve as 6 fases — feedback loop primeiro, reprodução pelo caminho do grafo, 3-5 hipóteses falsificáveis ranqueadas por risco preditivo, instrumentação 1-a-1 com prefixo de log, fix+regressão e post-mortem. ~700 tokens.',
          inputSchema: {
            type: 'object',
            properties: {
              from: { type: 'string', description: 'Entidade onde o sintoma aparece (ex: tela, endpoint).' },
              to: { type: 'string', description: 'Entidade suspeita do outro lado (ex: procedure, tabela). Opcional.' }
            },
            required: ['from']
          }
        },
        {
          name: 'get_zoom_out',
          description: 'Zoom-out (skill zoom-out): visão macro por fronteiras de domínio. Sem parâmetro = sistema inteiro (Mermaid de camadas/módulos). Com entity = onde aquela parte se encaixa: módulo dono, quem a chama (agregado por módulo) e conexões — vocabulário de domínio, sem arquivos soltos. ~400 tokens.',
          inputSchema: { type: 'object', properties: { entity: { type: 'string', description: 'Entidade para zoom-out focado (opcional).' } } }
        },
        {
          name: 'get_out_of_scope',
          description: 'Catálogo de decisões out-of-scope registradas (.tic-rules.json) — o que o time já decidiu NÃO fazer, para não rediscutir. ~150 tokens.',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'list_triage',
          description: 'Fila de triagem (skill triage): itens com categoria (bug/enhancement), estado (needs-triage/needs-info/ready-for-agent/ready-for-human/wontfix) e prioridade. Filtre por state/category. ~300 tokens.',
          inputSchema: {
            type: 'object',
            properties: {
              state: { type: 'string', description: 'Filtrar por estado (opcional).' },
              category: { type: 'string', description: 'Filtrar por categoria (opcional).' }
            }
          }
        },
        {
          name: 'update_triage',
          description: 'Transiciona um item da fila de triagem (transições validadas pela máquina de estados da skill). Ex: update_triage(id, state="ready-for-agent").',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              state: { type: 'string', description: 'Novo estado (opcional).' },
              category: { type: 'string', description: 'bug | enhancement (opcional).' },
              priority: { type: 'string', description: 'critical|high|medium|low (opcional).' }
            },
            required: ['id']
          }
        },
        {
          name: 'get_portfolio',
          description: 'Portfólio: compara TODOS os projetos analisados (saúde, riscos, drift, custo da dívida), pior saúde primeiro. Responde "qual repositório está pior?" numa visão executiva. ~300 tokens.',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'get_roi',
          description: 'ROI: custo da dívida técnica em tempo e dinheiro (dev-days + moeda), horas/custo economizados pelos PRs, e top módulos por custo. O argumento de tempo&custo para liderança. ~250 tokens.',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'get_ownership',
          description: 'Ownership e bus-factor: quem domina cada módulo, % de cobertura, arquivos de conhecimento em risco (1 só autor + alto impacto) e dificuldade de onboarding por módulo. Sem entity = visão geral; com entity = dono do arquivo/módulo. ~300 tokens.',
          inputSchema: { type: 'object', properties: { entity: { type: 'string', description: 'Arquivo ou módulo (opcional).' } } }
        },
        {
          name: 'suggest_reviewers',
          description: 'Roteamento de revisor: dado um conjunto de arquivos mudados, sugere quem deve revisar (dono provável por autoria git). ~150 tokens.',
          inputSchema: { type: 'object', properties: { files: { type: 'array', items: { type: 'string' }, description: 'Caminhos relativos dos arquivos mudados.' } }, required: ['files'] }
        },
        {
          name: 'get_activity',
          description: 'Linha do tempo de atividade do projeto (sistema vivo): o que mudou nas últimas análises — health subiu/caiu, riscos novos, violações de regra, predições confirmadas. Use para "o que mudou recentemente?". ~300 tokens.',
          inputSchema: { type: 'object', properties: { limit: { type: 'number', description: 'Quantos eventos recentes (default 20).' } } }
        },
        {
          name: 'get_health',
          description: 'Health score do projeto (0-100, grade A-E) com breakdown por dimensão (dívida, riscos, violações, dead code, acoplamento) e delta vs análise anterior. ~200 tokens.',
          inputSchema: { type: 'object', properties: {} }
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
          name: 'get_table_columns',
          description: 'Lineage coluna-a-coluna: quais COLUNAS de uma tabela são lidas/escritas e por quais arquivos (extraído de SQL real via parser AST multi-dialeto). Útil para impacto de alteração de coluna. ~200 tokens.',
          inputSchema: {
            type: 'object',
            properties: {
              table: { type: 'string', description: 'Nome da tabela (ex: "CLIENTE", "PEDIDO")' }
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
          const { name: moduleName, detail } = args as { name: string; detail?: 'summary' | 'full' };
          const contextPath = path.join(this.ticCodePath, 'modules', moduleName, 'context.md');
          const found = fs.existsSync(contextPath) ? contextPath : this.findModuleFuzzy(moduleName);
          if (!found) {
            return respond({ content: [{ type: 'text', text: `Módulo "${moduleName}" não encontrado. Disponíveis: ${this.listModuleNames().join(', ')}` }] });
          }
          const full = fs.readFileSync(found, 'utf8');
          return respond(textResult(detail === 'full' ? full : summarizeDoc(full, `get_module("${moduleName}", detail="full")`)));
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

        case 'get_multigraph': {
          const detail = (args as { detail?: 'summary' | 'full' } | undefined)?.detail;
          const full = this.readFile('multigraph.md');
          return respond(textResult(detail === 'full' ? full : summarizeDoc(full, 'get_multigraph(detail="full")')));
        }
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

          // Consulta o índice SQLite (sem teto de 3000 nós). Fallback: JSON.
          const impactDb = openIndexDb(this.indexDbPath);
          if (impactDb) {
            try {
              const r = queryImpact(impactDb, fileArg);
              if (!r) {
                return respond({ content: [{ type: 'text', text: `Nenhum dependente encontrado para "${fileArg}". Este arquivo não é importado por outros.` }] });
              }
              const lines = [
                `# Impacto de Mudança: \`${fileArg}\``,
                '',
                `| Métrica | Valor |`,
                `| --- | --- |`,
                `| Dependentes diretos | ${r.directCount} |`,
                `| Dependentes transitivos | ${r.transitiveCount} |`,
                '',
                '## Dependentes Diretos',
                ...r.direct.map((f) => `- \`${f}\``),
                '',
                r.transitive.length > 0 ? '## Impacto Transitivo (sample)' : '',
                ...r.transitive.slice(0, 20).map((f) => `- \`${f}\``),
                r.transitiveCount > 20 ? `- ... e mais ${r.transitiveCount - 20} arquivos afetados` : ''
              ].filter((l) => l !== undefined);
              return respond({ content: [{ type: 'text', text: lines.join('\n') }] });
            } finally {
              impactDb.close();
            }
          }

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

        case 'get_impact_of': {
          const { entity, max_depth } = args as { entity: string; max_depth?: number };
          const db = openIndexDb(this.indexDbPath);
          if (!db) return respond(noIndexDb());
          try {
            const r = queryImpactOf(db, entity, { maxDepth: max_depth });
            if (!r) return respond(textResult(`Entidade "${entity}" não encontrada no grafo de impacto. Tente o caminho do arquivo, "PKG.PROCEDURE", "TABELA" ou "TABELA.COLUNA".`));
            return respond(textResult(formatImpactOf(r)));
          } finally { db.close(); }
        }

        case 'get_blast_radius': {
          const { entity } = args as { entity: string };
          const db = openIndexDb(this.indexDbPath);
          if (!db) return respond(noIndexDb());
          try {
            const r = queryBlastRadius(db, entity);
            if (!r) return respond(textResult(`Entidade "${entity}" não encontrada no grafo de impacto.`));
            return respond(textResult(formatBlastRadius(r)));
          } finally { db.close(); }
        }

        case 'get_table_impact': {
          const { table, column } = args as { table: string; column?: string };
          const db = openIndexDb(this.indexDbPath);
          if (!db) return respond(noIndexDb());
          try {
            const id = column ? `column:${table.toUpperCase()}.${column.toUpperCase()}` : `table:${table.toUpperCase()}`;
            const r = queryBlastRadius(db, id);
            if (!r) {
              // fallback: resolução por nome livre
              const fuzzy = queryBlastRadius(db, column ? `${table}.${column}` : table);
              if (fuzzy) return respond(textResult(formatBlastRadius(fuzzy)));
              return respond(textResult(`Tabela/coluna "${column ? `${table}.${column}` : table}" não encontrada no grafo de impacto.`));
            }
            return respond(textResult(formatBlastRadius(r)));
          } finally { db.close(); }
        }

        case 'get_graph_level': {
          const expanded = ((args as { expanded?: string[] } | undefined)?.expanded ?? []).filter((e) => typeof e === 'string');
          const db = openIndexDb(this.indexDbPath);
          if (!db) return respond(noIndexDb());
          try {
            const hasModules = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='modules'").get();
            const hasLayer = hasModules && (db.prepare('PRAGMA table_info(files)').all() as any[]).some((c: any) => c.name === 'layer');
            if (!hasLayer) return respond(textResult('index.db antigo (sem agregação por módulo/camada). Execute a análise novamente.'));
            const level = queryGraphLevel(db, { expanded });
            const lines = [
              `# Grafo agregado${expanded.length ? ` (expandido: ${expanded.join(', ')})` : ' (visão por camadas)'}`,
              '',
              '## Nós',
              ...level.nodes.slice(0, 80).map((n) => `- [${n.kind}] \`${n.id.slice(n.id.indexOf(':') + 1)}\` — ${n.childCount > 0 ? `${n.childCount} filhos, ` : ''}in ${n.inWeight} / out ${n.outWeight}`),
              level.nodes.length > 80 ? `- ... e mais ${level.nodes.length - 80} nós` : '',
              '',
              '## Arestas (peso = dependências agregadas)',
              ...level.edges
                .sort((a, b) => b.weight - a.weight)
                .slice(0, 60)
                .map((e) => `- \`${e.from.slice(e.from.indexOf(':') + 1)}\` → \`${e.to.slice(e.to.indexOf(':') + 1)}\` (${e.weight}${e.resolvedWeight < e.weight ? `, ${e.resolvedWeight} resolvidas` : ''})`),
              level.edges.length > 60 ? `- ... e mais ${level.edges.length - 60} arestas` : '',
              '',
              '> Para detalhar: get_graph_level(expanded=[..., "module:<nome>"]).'
            ].filter(Boolean);
            return respond(textResult(lines.join('\n')));
          } finally { db.close(); }
        }

        case 'get_arch_rules': {
          const data = this.readJson('arch-violations.json');
          if (!data) return respond(textResult('arch-violations.json não encontrado. Execute a análise novamente.'));
          const rules = (data.rules ?? []) as any[];
          const violations = (data.violations ?? []) as any[];
          const lines = [
            `# Regras de Arquitetura (${rules.length} regra(s), ${violations.length} violação(ões))`,
            '',
            ...(rules.length === 0
              ? ['Sem `.tic-rules.json` na raiz do projeto — exemplo disponível em `.tic-code/tic-rules.example.json`.']
              : rules.map((r: any) => {
                const v = violations.filter((x: any) => x.ruleId === r.id);
                return `- ${v.length === 0 ? '✅' : '❌'} **${r.id}** (${r.severity})${r.description ? ` — ${r.description}` : ''}${v.length > 0 ? ` · ${v.length} violação(ões)` : ''}`;
              })),
            '',
            ...(violations.length > 0 ? ['## Violações', ...violations.slice(0, 20).map((v: any) => `- ${v.severity === 'error' ? '🔴' : '🟡'} ${v.ruleId}: \`${v.from}\` → \`${v.to}\``)] : [])
          ];
          return respond(textResult(lines.join('\n')));
        }

        case 'get_arch_suggestions': {
          const data = this.readJson('arch-suggestions.json');
          if (!data || !Array.isArray(data) || data.length === 0) {
            return respond(textResult('Nenhum candidato a melhoria arquitetural encontrado (ou análise desatualizada). 🎉'));
          }
          const lines = [
            '# Oportunidades de melhoria arquitetural (deepening)',
            '',
            ...data.map((c: any, i: number) => [
              `## ${i + 1}. [${c.strength}] ${c.kind} — ${c.files.map((f: string) => `\`${f}\``).join(', ')}`,
              `- **Problema:** ${c.problem}`,
              `- **Solução:** ${c.solution}`,
              `- **Benefícios:** ${c.benefits}`
            ].join('\n')),
            '',
            '> Relatório HTML completo: botão "Relatório de arquitetura" no app. Não proponha interfaces ainda — escolha um candidato e faça o grilling.'
          ];
          return respond(textResult(lines.join('\n')));
        }

        case 'get_risk_prediction': {
          const limit = (args as { limit?: number } | undefined)?.limit ?? 10;
          const data = this.readJson('risk-prediction.json');
          if (!data || !Array.isArray(data) || data.length === 0) {
            return respond(textResult('Sem predição de risco (projeto sem histórico git ou análise desatualizada).'));
          }
          const lines = [
            '# Predição de risco — onde o próximo bug tende a nascer',
            '',
            '| Arquivo | Score | Motivos |',
            '| --- | --- | --- |',
            ...data.slice(0, limit).map((p: any) => `| \`${p.file}\` | ${p.score} | ${(p.reasons ?? []).join(', ')} |`),
            '',
            '> Score = churn 90d (40%) + commits de fix (20%) + complexidade (20%) + acoplamento (20%), normalizados.'
          ];
          return respond(textResult(lines.join('\n')));
        }

        case 'get_agent_brief': {
          const { entity } = args as { entity: string };
          const db = openIndexDb(this.indexDbPath);
          if (!db) return respond(noIndexDb());
          try {
            // Aceita id de item de triagem (resolve para a entidade dele)
            const triage = loadTriage(this.ticCodePath).find((t) => t.id === entity);
            const target = triage?.entity ?? triage?.title ?? entity;
            const archData = this.readJson('arch-violations.json');
            const brief = buildAgentBrief(db, this.ticCodePath, target, {
              category: triage?.category,
              summary: triage?.title,
              detail: triage?.detail,
              outOfScope: archData?.outOfScope ?? []
            });
            if (!brief) return respond(textResult(`Entidade "${entity}" não encontrada no grafo de impacto.`));
            return respond(textResult(brief));
          } finally { db.close(); }
        }

        case 'get_diagnosis': {
          const { from, to } = args as { from: string; to?: string };
          const db = openIndexDb(this.indexDbPath);
          if (!db) return respond(noIndexDb());
          try {
            const diag = buildDiagnosis(db, this.ticCodePath, from, to);
            if (!diag) return respond(textResult(`Entidade "${from}" não encontrada no grafo.`));
            return respond(textResult(diag));
          } finally { db.close(); }
        }

        case 'get_zoom_out': {
          const entity = (args as { entity?: string } | undefined)?.entity;
          if (!entity) {
            return respond(textResult(this.readFile('zoom-out.md')));
          }
          const db = openIndexDb(this.indexDbPath);
          if (!db) return respond(noIndexDb());
          try {
            const r = queryImpactOf(db, entity, { maxDepth: 3 });
            if (!r) return respond(textResult(`Entidade "${entity}" não encontrada.`));
            const file = r.entity.startsWith('file:') ? r.entity.slice(5) : null;
            const home = file ? (db.prepare('SELECT module, layer FROM files WHERE rel_path = ?').get(file) as any) : null;
            const byModule = Object.entries(r.byModule).sort((a, b) => b[1] - a[1]).slice(0, 8);
            const lines = [
              `# Zoom-out: \`${r.entity.slice(r.entity.indexOf(':') + 1)}\``,
              '',
              home ? `Pertence ao módulo **${home.module ?? '—'}** (camada ${home.layer ?? '—'}).` : `Entidade da camada de dados/banco.`,
              '',
              '## Quem depende desta parte (agregado por módulo)',
              ...(byModule.length > 0 ? byModule.map(([m, c]) => `- **${m}** — ${c} ponto(s) de dependência`) : ['- Ninguém depende diretamente (folha do grafo).']),
              '',
              `No total, ${r.totalVisited} entidade(s) em até 3 saltos (${Object.entries(r.byKind).map(([k, v]) => `${k}: ${v}`).join(', ')}).`,
              '',
              '> Visão macro do sistema inteiro: get_zoom_out() sem parâmetro. Detalhe: get_blast_radius/get_impact_of.'
            ];
            return respond(textResult(lines.join('\n')));
          } finally { db.close(); }
        }

        case 'get_out_of_scope': {
          const data = this.readJson('arch-violations.json');
          const decisions = (data?.outOfScope ?? []) as any[];
          if (decisions.length === 0) return respond(textResult('Nenhuma decisão out-of-scope registrada. Adicione em `.tic-rules.json` → `outOfScope`.'));
          return respond(textResult([
            '# Decisões out-of-scope registradas (não rediscutir sem motivo novo)',
            '',
            ...decisions.map((d: any) => `- **${d.id}**${d.date ? ` (${d.date})` : ''}: ${d.decision}${d.reason ? ` — _${d.reason}_` : ''}`)
          ].join('\n')));
        }

        case 'list_triage': {
          const { state, category } = (args ?? {}) as { state?: string; category?: string };
          let items = loadTriage(this.ticCodePath);
          if (state) items = items.filter((i) => i.state === state);
          if (category) items = items.filter((i) => i.category === category);
          if (items.length === 0) return respond(textResult('Fila de triagem vazia para esse filtro.'));
          const lines = [
            `# Fila de triagem (${items.length} item(ns))`,
            '',
            '| Id | Título | Categoria | Estado | Prioridade |',
            '| --- | --- | --- | --- | --- |',
            ...items.slice(0, 30).map((i) => `| \`${i.id}\` | ${i.title} | ${i.category} | ${i.state} | ${i.priority} |`),
            '',
            '> Brief completo de um item: get_agent_brief(id). Transição: update_triage(id, state=...).'
          ];
          return respond(textResult(lines.join('\n')));
        }

        case 'update_triage': {
          const { id, state, category, priority } = args as { id: string; state?: string; category?: string; priority?: string };
          const r = transitionTriageItem(this.ticCodePath, id, {
            state: state as TriageState | undefined,
            category: category as TriageCategory | undefined,
            priority: priority as TriagePriority | undefined
          });
          if (!r.ok) return respond(textResult(`❌ ${r.error}`));
          return respond(textResult(`✅ Item \`${id}\` atualizado: estado=${r.item!.state}, categoria=${r.item!.category}, prioridade=${r.item!.priority}`));
        }

        case 'get_portfolio': {
          const projects = loadPortfolio();
          if (projects.length === 0) return respond(textResult('Portfólio vazio. Analise um ou mais projetos para popular a visão executiva.'));
          const lines = [
            `# Portfólio — ${projects.length} projeto(s) (pior saúde primeiro)`,
            '',
            '| Projeto | Health | Arquivos | Críticos/Altos | Drift | Custo dívida |',
            '| --- | --- | --- | --- | --- | --- |',
            ...projects.map((p) => `| ${p.name} | ${p.healthScore ?? '—'}${p.healthGrade ? ` ${p.healthGrade}` : ''} | ${p.totalFiles.toLocaleString()} | ${p.risks.critical}/${p.risks.high} | ${p.archErrors} | ${p.debtCost !== null ? `${p.currency} ${p.debtCost.toLocaleString()}` : '—'} |`)
          ];
          return respond(textResult(lines.join('\n')));
        }

        case 'get_roi': {
          const roi = this.readJson('roi.json');
          if (!roi) return respond(textResult('roi.json não encontrado. Execute a análise novamente.'));
          const m = (n: number) => `${roi.currency} ${n.toLocaleString()}`;
          const lines = [
            '# ROI — tempo & custo',
            '',
            `- **Dívida técnica:** ${roi.devDays} dev-days para sanear (${m(roi.debtCost)} · ${roi.remediationHours}h @ ${m(roi.hourlyRate)}/h)`,
            `- **Economizado pelos PRs:** ${roi.hoursSaved}h (${m(roi.savedCost)}) em investigação de impacto evitada`,
            `- **Saldo:** ${m(roi.net)} ${roi.net >= 0 ? '(a ferramenta já se pagou)' : ''}`,
            '',
            '## Custo da dívida por módulo',
            ...(roi.byModule ?? []).slice(0, 10).map((x: any) => `- ${x.module}: ${m(x.cost)} (${x.hours}h)`),
            '',
            '> Estimativas ancoradas no débito técnico e na taxa-hora configurada (.tic-rules.json → roi).'
          ];
          return respond(textResult(lines.join('\n')));
        }

        case 'get_ownership': {
          const own = this.readJson('ownership.json');
          if (!own) return respond(textResult('ownership.json não encontrado (projeto sem git ou análise desatualizada).'));
          const entity = (args as { entity?: string } | undefined)?.entity;
          if (entity) {
            const fileOwner = own.fileOwner ?? {};
            const exact = fileOwner[entity];
            const mod = (own.modules ?? []).find((m: any) => m.module === entity);
            if (mod) return respond(textResult(`Módulo **${mod.module}**: dono **${mod.primaryOwner}** (${mod.ownershipPct}%), ${mod.authorCount} autor(es), bus-factor ${mod.busFactor}, onboarding ~${mod.onboardingHours}h (${mod.difficulty}).`));
            if (exact) return respond(textResult(`\`${entity}\` — dono provável: **${exact}**.`));
            const partial = Object.keys(fileOwner).find((f) => f.endsWith(entity));
            return respond(textResult(partial ? `\`${partial}\` — dono provável: **${fileOwner[partial]}**.` : `Sem dados de ownership para "${entity}".`));
          }
          const lines = [
            '# Ownership & bus-factor',
            '',
            '## Onboarding por módulo (mais difícil primeiro)',
            ...(own.modules ?? []).slice(0, 10).map((m: any) => `- **${m.module}** — dono ${m.primaryOwner} (${m.ownershipPct}%), bus-factor ${m.busFactor}, ~${m.onboardingHours}h (${m.difficulty})`),
            '',
            '## 🧠 Conhecimento em risco (1 só autor + alto impacto)',
            ...(own.knowledgeRisk ?? []).slice(0, 10).map((k: any) => `- \`${k.file}\` — só **${k.author}** (${k.reason})`),
            ...(own.startHere?.length ? ['', `**Comece por aqui (onboarding):** ${own.startHere.join(', ')}`] : [])
          ];
          return respond(textResult(lines.join('\n')));
        }

        case 'suggest_reviewers': {
          const files = ((args as { files?: string[] }).files ?? []).filter((f) => typeof f === 'string');
          const own = this.readJson('ownership.json');
          if (!own?.fileOwner) return respond(textResult('Sem dados de ownership (projeto sem git ou análise desatualizada).'));
          const out = suggestReviewers(own.fileOwner, files);
          if (out.length === 0) return respond(textResult('Nenhum dono identificado para os arquivos informados.'));
          return respond(textResult([
            '# Revisores sugeridos',
            '',
            ...out.map((r) => `- **${r.author}** — ${r.files.length} arquivo(s): ${r.files.slice(0, 5).map((f) => `\`${f}\``).join(', ')}`)
          ].join('\n')));
        }

        case 'get_activity': {
          const limit = (args as { limit?: number } | undefined)?.limit ?? 20;
          const events = loadActivity(this.ticCodePath, limit);
          if (events.length === 0) return respond(textResult('Nenhuma atividade registrada ainda. Rode uma análise.'));
          const icon = (s: string) => (s === 'critical' ? '🔴' : s === 'warn' ? '🟠' : 'ℹ️');
          const lines = [
            `# Atividade recente (${events.length} evento(s))`,
            '',
            ...[...events].reverse().map((e) => `- ${icon(e.severity)} \`${new Date(e.ts).toLocaleString('pt-BR')}\` **${e.title}**${e.detail ? ` — ${e.detail}` : ''}`)
          ];
          return respond(textResult(lines.join('\n')));
        }

        case 'get_health': {
          const snapPath = path.join(this.ticCodePath, 'snapshots.json');
          if (!fs.existsSync(snapPath)) {
            return respond(textResult('snapshots.json não encontrado. Execute a análise novamente (versão atual gera health score).'));
          }
          let snaps: any[] = [];
          try { snaps = JSON.parse(fs.readFileSync(snapPath, 'utf8')); } catch { /* corrompido */ }
          if (!Array.isArray(snaps) || snaps.length === 0) {
            return respond(textResult('Nenhum snapshot de health disponível. Execute a análise.'));
          }
          const cur = snaps[snaps.length - 1];
          const prev = snaps.length > 1 ? snaps[snaps.length - 2] : null;
          const delta = prev ? Math.round((cur.score - prev.score) * 10) / 10 : null;
          const lines = [
            `# Health Score: ${cur.score}/100 (grade ${cur.grade})`,
            delta !== null ? `Δ vs análise anterior: ${delta > 0 ? '+' : ''}${delta} (era ${prev.score})` : '(primeira análise — sem histórico)',
            `Analisado em: ${cur.timestamp}${cur.gitSha ? ` · git ${String(cur.gitSha).slice(0, 8)}` : ''}`,
            '',
            '## Penalidades por dimensão',
            '| Dimensão | Penalidade | Bruto |',
            '| --- | --- | --- |',
            ...Object.entries(cur.breakdown as Record<string, { penalty: number; raw: number; max: number }>)
              .sort((a, b) => b[1].penalty - a[1].penalty)
              .map(([k, v]) => `| ${k} | -${v.penalty} (máx ${v.max}) | ${v.raw} |`),
            '',
            `Contagens: riscos ${cur.counts.risks} · violações ${cur.counts.violations} · hotspots ${cur.counts.hotspots} · dead code ${cur.counts.deadComponents + cur.counts.deadPlsql} · arestas resolvidas ${cur.counts.resolvedEdges}/${cur.counts.totalEdges}`,
            `Histórico: ${snaps.length} análise(s) em snapshots.json`
          ];
          return respond(textResult(lines.join('\n')));
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

          // Caminho preferido: grafo de impacto unificado (atravessa PL/SQL,
          // tabelas e colunas — não só imports). Fallback: impact-index.json.
          const diffDb = openIndexDb(this.indexDbPath);
          if (diffDb) {
            try {
              const hasImpact = !!diffDb.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='impact_edges'").get();
              if (hasImpact) {
                const lines: string[] = [
                  '# Impacto das Mudanças Atuais (git diff, cross-tier)',
                  '',
                  `${changedFiles.length} arquivo(s) modificado(s):`,
                  ''
                ];
                const allAffected = new Set<string>();
                const kindTotals: Record<string, number> = {};
                for (const file of changedFiles.slice(0, 30)) {
                  const r = queryBlastRadius(diffDb, file, 5);
                  if (!r || r.totalAffected === 0) {
                    lines.push(`**\`${file}\`** — sem dependentes mapeados`);
                    continue;
                  }
                  lines.push(`**\`${file}\`** — ${r.totalAffected} afetados (${countsLine(r.byKind)})`);
                  for (const t of r.top.slice(0, 3)) lines.push(`  • \`${shortId(t.id)}\` (${t.dependents} dependentes)`);
                  for (const [k, v] of Object.entries(r.byKind)) kindTotals[k] = (kindTotals[k] ?? 0) + v;
                  const full = queryImpactOf(diffDb, file);
                  for (const n of full?.affected ?? []) allAffected.add(n.id);
                }
                for (const f of changedFiles) allAffected.delete(`file:${f}`);
                if (changedFiles.length > 30) lines.push(`... e mais ${changedFiles.length - 30} arquivos modificados (analisados os 30 primeiros)`);
                lines.push('', '---', `**Impacto consolidado (união, sem duplicatas): ${allAffected.size} entidades**`);
                lines.push('> Detalhe por entidade: get_impact_of(entity) / get_blast_radius(entity).');
                return respond({ content: [{ type: 'text', text: lines.join('\n') }] });
              }
            } finally {
              diffDb.close();
            }
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

          // Consulta o índice SQLite (grafo completo, sem teto). Fallback: JSON.
          const pathDb = openIndexDb(this.indexDbPath);
          if (pathDb) {
            try {
              const res = queryFindPath(pathDb, fromArg, toArg);
              if ('error' in res) return respond({ content: [{ type: 'text', text: res.error }] });
              if (res.pathFiles && res.pathFiles.length === 1) {
                return respond({ content: [{ type: 'text', text: '✅ Origem e destino são o mesmo arquivo.' }] });
              }
              if (!res.pathFiles) {
                return respond({ content: [{ type: 'text', text: `Nenhum caminho encontrado entre "${fromArg}" e "${toArg}".\nEsses arquivos podem não se conectar por dependências de import.` }] });
              }
              const pathLines = [
                `# Caminho: \`${fromArg}\` → \`${toArg}\``,
                '',
                `**${res.pathFiles.length - 1} salto(s)**`,
                '',
                ...res.pathFiles.map((p, i) => `${i + 1}. \`${p}\``)
              ];
              return respond({ content: [{ type: 'text', text: pathLines.join('\n') }] });
            } finally {
              pathDb.close();
            }
          }

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
          const unified = this.crossTierTraceTool(entry);
          return respond({ content: [{ type: 'text', text: unified ?? this.traceFlowTool(entry) }] });
        }

        case 'get_table_columns': {
          const table = ((args as { table: string }).table ?? '').trim();
          if (!table) return respond({ content: [{ type: 'text', text: 'Informe o nome da tabela.' }] });
          const db = openIndexDb(this.indexDbPath);
          if (!db) return respond({ content: [{ type: 'text', text: 'index.db não encontrado. Execute a análise novamente.' }] });
          try {
            const lin = queryTableColumns(db, table);
            if (!lin) return respond({ content: [{ type: 'text', text: `Nenhum acesso de coluna detectado para a tabela "${table}".` }] });
            const fmt = (arr: Array<{ column: string; from: string }>) =>
              arr.length ? arr.map((c) => `- \`${c.column}\` (em \`${c.from}\`)`).join('\n') : '_(nenhuma)_';
            const text = [
              `# Lineage de colunas: \`${lin.table}\``,
              '',
              `## ✍️ Escritas (${lin.writes.length})`,
              fmt(lin.writes),
              '',
              `## 👁️ Leituras (${lin.reads.length})`,
              fmt(lin.reads)
            ].join('\n');
            return respond({ content: [{ type: 'text', text }] });
          } finally {
            db.close();
          }
        }

        case 'search_code': {
          const query = ((args as { query: string }).query ?? '').trim();
          const semantic = await this.searchSemanticTool(query);
          return respond({ content: [{ type: 'text', text: semantic ?? this.searchCodeTool(query) }] });
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

  private readJson(relativePath: string): any | null {
    try {
      return JSON.parse(fs.readFileSync(path.join(this.ticCodePath, relativePath), 'utf8'));
    } catch {
      return null;
    }
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

    // Fonte preferencial: índice SQLite (fonte única). Fallback: call-graph.json.
    const db = openIndexDb(this.indexDbPath);
    if (db) {
      try {
        const cg = queryCallGraph(db);
        if (cg.nodes.length > 0) {
          this.callGraphCache = cg as { nodes: CallGraphNode[]; edges: CallGraphEdge[] };
          return this.callGraphCache;
        }
      } finally {
        db.close();
      }
    }

    const p = path.join(this.ticCodePath, 'call-graph.json');
    if (!fs.existsSync(p)) return null;
    this.callGraphCache = JSON.parse(fs.readFileSync(p, 'utf8')) as { nodes: CallGraphNode[]; edges: CallGraphEdge[] };
    return this.callGraphCache;
  }

  /**
   * Trace cross-tier unificado (Fase 3): caminha sobre o grafo intra-código
   * (resolvido) + o cross-tier (HTTP/DB/PL-SQL) no index.db, devolvendo a cadeia
   * ininterrupta de impacto. Retorna null se não há DB ou o entry não casa
   * (cai para o traceFlowTool legado).
   */
  private crossTierTraceTool(entry: string): string | null {
    if (!entry) return null;
    const db = openIndexDb(this.indexDbPath);
    if (!db) return null;
    try {
      const trace = queryCrossTierTrace(db, entry);
      if (!trace.entry) return null;

      const tierIcon: Record<string, string> = { frontend: '🖥️', backend: '☕', database: '🗄️', code: '📄' };
      const lines: string[] = [
        `# Trace cross-tier: \`${trace.entry.label}\``,
        '',
        `Camada de origem: ${tierIcon[trace.entry.layer] ?? ''} ${trace.entry.layer}`,
        ''
      ];

      if (trace.samplePath.length > 1) {
        lines.push('## Cadeia de impacto (chamador → … → alterado)');
        lines.push('');
        lines.push('```');
        trace.samplePath.forEach((n, i) => {
          const arrow = i === 0 ? '' : '  ↓ ';
          lines.push(`${arrow}${tierIcon[n.layer] ?? ''} ${n.label}`);
        });
        lines.push('```');
        lines.push('');
      }

      const byLayer = (layer: string) => trace.upstream.filter((n) => n.layer === layer);
      const tiers: Array<[string, string]> = [
        ['frontend', 'Frontend afetado'],
        ['backend', 'Backend afetado'],
        ['code', 'Código afetado'],
        ['database', 'Banco afetado']
      ];
      lines.push(`## Quem quebra se \`${trace.entry.label}\` mudar (${trace.upstream.length})`);
      lines.push('');
      for (const [layer, title] of tiers) {
        const items = byLayer(layer);
        if (items.length === 0) continue;
        lines.push(`### ${tierIcon[layer] ?? ''} ${title} (${items.length})`);
        for (const n of items.slice(0, 25)) lines.push(`- \`${n.label}\``);
        if (items.length > 25) lines.push(`- … e mais ${items.length - 25}`);
        lines.push('');
      }
      if (trace.upstream.length === 0) lines.push('_Nenhum chamador encontrado — este ponto não é alcançado por outras camadas._');

      return lines.join('\n').trim();
    } finally {
      db.close();
    }
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

  /**
   * Busca semântica via embeddings locais (Fase 4). Retorna null quando não há
   * embeddings no índice ou o modelo não está disponível — aí o caller usa FTS.
   */
  private async searchSemanticTool(query: string): Promise<string | null> {
    if (!query) return null;
    const db = openIndexDb(this.indexDbPath);
    if (!db) return null;
    try {
      if (embeddingsCount(db) === 0) return null;
      const embedder = await getEmbedder();
      if (!embedder) return null;
      const [qvec] = await embedder([query]);
      const hits = queryVectorSearch(db, qvec, 10);
      if (hits.length === 0) return null;
      const lines = [
        `## Resultados semânticos para: "${query}"`,
        `*${hits.length} arquivos por similaridade vetorial (embeddings locais)*`,
        ''
      ];
      for (const h of hits) lines.push(`### \`${h.file}\` (similaridade: ${h.score})`);
      return lines.join('\n');
    } finally {
      db.close();
    }
  }

  private searchCodeTool(query: string): string {
    if (!query) return 'Informe um query para busca.';

    const queryTokensFts = this.tokenizeQuery(query);
    if (queryTokensFts.length === 0) return 'Query muito curta. Use pelo menos 3 caracteres.';

    // Busca preferencial via FTS5 no índice SQLite. Fallback: índice invertido JSON.
    const searchDb = openIndexDb(this.indexDbPath);
    if (searchDb) {
      try {
        const hits = querySearch(searchDb, queryTokensFts, 10);
        if (hits.length === 0) {
          return `Nenhum arquivo encontrado para "${query}". Tente termos mais gerais.`;
        }
        const lines: string[] = [
          `## Resultados para: "${query}"`,
          `*${hits.length} arquivos relevantes (FTS5/BM25)*`,
          ''
        ];
        for (const hit of hits) {
          lines.push(`### \`${hit.file}\` (score: ${hit.score})`);
          if (hit.snippet) lines.push(`> ${hit.snippet}`);
          lines.push('');
        }
        lines.push(`*Tokens da query: ${queryTokensFts.join(', ')}*`);
        return lines.join('\n');
      } finally {
        searchDb.close();
      }
    }

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

  /**
   * @param host '127.0.0.1' (padrão, app local) ou '0.0.0.0' (modo servidor —
   *             máquina dedicada servindo o time). Em rede, exija `authToken`.
   * @param authToken se definido, toda chamada precisa de
   *                  `Authorization: Bearer <token>` (exceto /health).
   */
  async startHttp(port = 7432, host = '127.0.0.1', authToken?: string): Promise<void> {
    const app = http.createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, Authorization');
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      if (authToken && req.url !== '/health') {
        // EventSource não envia headers → /events aceita ?token= na query
        const url = new URL(req.url ?? '/', 'http://localhost');
        const queryToken = url.searchParams.get('token');
        const auth = req.headers.authorization ?? '';
        if (auth !== `Bearer ${authToken}` && queryToken !== authToken) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'unauthorized: use Authorization: Bearer <token> (ou ?token= para /events)' }));
          return;
        }
      }
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', projectPath: this.projectPath, version: '2.0.0' }));
        return;
      }
      // ── SSE: push ao vivo (analysis-complete + eventos de atividade) ──────────
      if (req.url === '/events' || req.url?.startsWith('/events')) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive'
        });
        res.write('retry: 5000\n\n');
        this.sseClients.add(res);
        const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* fechado */ } }, 25_000);
        req.on('close', () => { clearInterval(ping); this.sseClients.delete(res); });
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
      app.listen(port, host, () => {
        const where = host === '127.0.0.1' ? 'localhost' : host;
        console.log(`TIC Analyzer MCP Server v2.0.0 em http://${where}:${port}/mcp${authToken ? ' (auth: Bearer token)' : ''}`);
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

  /** Push de um evento para todos os clientes SSE conectados em /events. */
  emit(event: unknown): void {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of this.sseClients) {
      try { res.write(payload); } catch { this.sseClients.delete(res); }
    }
  }

  sseClientCount(): number {
    return this.sseClients.size;
  }
}

// ── Helpers das tools de impacto cross-tier ──────────────────────────────────

function textResult(text: string): { content: Array<{ type: string; text: string }> } {
  return { content: [{ type: 'text', text }] };
}

function noIndexDb(): { content: Array<{ type: string; text: string }> } {
  return textResult('index.db não encontrado. Execute a análise novamente (a versão atual gera o grafo de impacto unificado).');
}

const KIND_LABEL: Record<string, string> = {
  file: 'Arquivos', method: 'Métodos', plsql: 'PL/SQL', table: 'Tabelas', column: 'Colunas'
};

function shortId(id: string): string {
  if (id.startsWith('file:')) return id.slice(5);
  if (id.startsWith('method:')) return id.slice(7);
  return id.slice(id.indexOf(':') + 1);
}

function countsLine(byKind: Record<string, number>): string {
  return Object.entries(byKind)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${KIND_LABEL[k] ?? k}: ${v}`)
    .join(' | ');
}

function formatImpactOf(r: ImpactOfResult): string {
  const lines = [
    `# Impacto de \`${r.entity}\``,
    '',
    `**${r.totalVisited} entidades afetadas** — ${countsLine(r.byKind)}`,
    r.truncated ? '⚠️ Resultado truncado (>2000 nós). Use get_blast_radius para o resumo ou max_depth para limitar.' : ''
  ];
  if (Object.keys(r.byModule).length > 0) {
    lines.push('', '## Por módulo', ...Object.entries(r.byModule).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([m, c]) => `- ${m}: ${c}`));
  }
  const byDepth = new Map<number, ImpactOfResult['affected']>();
  for (const n of r.affected) {
    const arr = byDepth.get(n.depth) ?? [];
    arr.push(n);
    byDepth.set(n.depth, arr);
  }
  for (const [depth, nodes] of [...byDepth.entries()].sort((a, b) => a[0] - b[0]).slice(0, 6)) {
    lines.push('', `## ${depth} salto(s)`);
    for (const n of nodes.slice(0, 25)) {
      lines.push(`- ${n.confidence === 'inferred' ? '🟡' : '🟢'} \`${shortId(n.id)}\`${n.module ? ` (${n.module})` : ''}`);
    }
    if (nodes.length > 25) lines.push(`- ... e mais ${nodes.length - 25} nesta profundidade`);
  }
  if (r.candidates?.length) {
    lines.push('', `> Outras entidades com esse nome: ${r.candidates.map(shortId).join(', ')}`);
  }
  return lines.filter((l) => l !== '').join('\n').replace(/\n{3,}/g, '\n\n');
}

/**
 * Resumo de documento markdown grande: corta em ~4000 chars num limite de
 * seção e informa explicitamente como pedir o restante (a IA não fica cega).
 */
function summarizeDoc(content: string, fullHint: string): string {
  const LIMIT = 4000;
  if (content.length <= LIMIT) return content;
  let cut = content.lastIndexOf('\n#', LIMIT);
  if (cut < LIMIT / 2) cut = content.lastIndexOf('\n\n', LIMIT);
  if (cut < LIMIT / 2) cut = LIMIT;
  const omitted = content.length - cut;
  return `${content.slice(0, cut)}\n\n---\n> ⚠️ Resumo truncado (~${Math.ceil(omitted / 4).toLocaleString()} tokens omitidos). Conteúdo completo: \`${fullHint}\`.`;
}

function formatBlastRadius(r: BlastRadiusResult): string {
  const lines = [
    `# Blast radius de \`${r.entity}\``,
    '',
    `**${r.totalAffected} entidades afetadas**${r.truncated ? ' (truncado em 2000 — há mais)' : ''} — ${countsLine(r.byKind)}`
  ];
  if (Object.keys(r.byModule).length > 0) {
    lines.push(`Módulos: ${Object.entries(r.byModule).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([m, c]) => `${m} (${c})`).join(', ')}`);
  }
  if (r.top.length > 0) {
    lines.push('', '## Mais críticos (por nº de dependentes)', '| Entidade | Tipo | Saltos | Dependentes |', '| --- | --- | --- | --- |');
    for (const t of r.top) {
      lines.push(`| \`${shortId(t.id)}\` | ${t.kind} | ${t.depth} | ${t.dependents} |`);
    }
  }
  lines.push('', '> Detalhe completo: get_impact_of(entity). Lineage de colunas: get_table_columns(tabela).');
  if (r.candidates?.length) lines.push(`> Outras entidades com esse nome: ${r.candidates.map(shortId).join(', ')}`);
  return lines.join('\n');
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
