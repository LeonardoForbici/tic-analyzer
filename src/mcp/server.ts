import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { Server } from '@modelcontextprotocol/sdk/server';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import type { ImpactIndex } from '../analyzer/buildImpactIndex';

export interface McpServerOptions {
  projectPath: string;
  port?: number;
}

export class TicAnalyzerMcpServer {
  private server: Server;
  private httpServer?: http.Server;
  private projectPath: string;
  private ticCodePath: string;

  constructor(options: McpServerOptions) {
    this.projectPath = options.projectPath;
    this.ticCodePath = path.join(options.projectPath, '.tic-code');
    this.server = new Server(
      { name: 'tic-analyzer', version: '2.0.0' },
      { capabilities: { tools: {} } }
    );
    this.registerTools();
  }

  private registerTools(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
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
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'list_modules':
          return { content: [{ type: 'text', text: this.readFile('index.md') }] };

        case 'get_quick_context':
          return { content: [{ type: 'text', text: this.readFile('quick-context.md') }] };

        case 'get_module': {
          const moduleName = (args as { name: string }).name;
          const contextPath = path.join(this.ticCodePath, 'modules', moduleName, 'context.md');
          if (!fs.existsSync(contextPath)) {
            const found = this.findModuleFuzzy(moduleName);
            if (found) return { content: [{ type: 'text', text: fs.readFileSync(found, 'utf8') }] };
            return { content: [{ type: 'text', text: `Módulo "${moduleName}" não encontrado. Disponíveis: ${this.listModuleNames().join(', ')}` }] };
          }
          return { content: [{ type: 'text', text: fs.readFileSync(contextPath, 'utf8') }] };
        }

        case 'search_module': {
          const query = ((args as { query: string }).query ?? '').toLowerCase();
          const modules = this.listModuleNames();
          const scored = modules.map((m) => ({ name: m, score: scoreMatch(m.toLowerCase(), query) }))
            .sort((a, b) => b.score - a.score);
          const best = scored[0];
          if (!best || best.score === 0) {
            return { content: [{ type: 'text', text: `Nenhum módulo encontrado para "${query}". Disponíveis: ${modules.join(', ')}` }] };
          }
          const contextPath = path.join(this.ticCodePath, 'modules', best.name, 'context.md');
          const content = fs.existsSync(contextPath) ? fs.readFileSync(contextPath, 'utf8') : `Contexto não encontrado.`;
          return { content: [{ type: 'text', text: `# Módulo: ${best.name}\n\n${content}` }] };
        }

        case 'get_multigraph': return { content: [{ type: 'text', text: this.readFile('multigraph.md') }] };
        case 'get_diagram': return { content: [{ type: 'text', text: this.readFile('diagram.md') }] };
        case 'get_openapi': return { content: [{ type: 'text', text: this.readFile('openapi.yaml') }] };
        case 'get_gaps': return { content: [{ type: 'text', text: this.readFile('gaps.md') }] };
        case 'get_permissions': return { content: [{ type: 'text', text: this.readFile('permissions.md') }] };
        case 'get_inheritance': return { content: [{ type: 'text', text: this.readFile('inheritance.md') }] };

        case 'get_business_rules': {
          const modName = (args as { name: string }).name;
          const rulesPath = path.join(this.ticCodePath, 'modules', modName, 'business-rules.md');
          if (!fs.existsSync(rulesPath)) {
            const found = this.findModuleFuzzy(modName);
            if (found) {
              const foundRules = found.replace('context.md', 'business-rules.md');
              if (fs.existsSync(foundRules)) return { content: [{ type: 'text', text: fs.readFileSync(foundRules, 'utf8') }] };
            }
            return { content: [{ type: 'text', text: `Nenhuma regra de negócio detectada para "${modName}".` }] };
          }
          return { content: [{ type: 'text', text: fs.readFileSync(rulesPath, 'utf8') }] };
        }

        case 'get_impact': {
          const fileArg = (args as { file: string }).file;
          const indexPath = path.join(this.ticCodePath, 'impact-index.json');
          if (!fs.existsSync(indexPath)) {
            return { content: [{ type: 'text', text: 'impact-index.json não encontrado. Execute a análise novamente.' }] };
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
            return { content: [{ type: 'text', text: `Nenhum dependente encontrado para "${fileArg}". Este arquivo não é importado por outros.` }] };
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

          return { content: [{ type: 'text', text: lines.join('\n') }] };
        }

        case 'get_metrics': {
          const modName = (args as { name?: string }).name;
          if (!modName) {
            return { content: [{ type: 'text', text: this.readFile('metrics-summary.md') }] };
          }
          const metricsPath = path.join(this.ticCodePath, 'modules', modName, 'metrics.md');
          if (!fs.existsSync(metricsPath)) {
            const found = this.findModuleFuzzy(modName);
            if (found) {
              const mPath = found.replace('context.md', 'metrics.md');
              if (fs.existsSync(mPath)) return { content: [{ type: 'text', text: fs.readFileSync(mPath, 'utf8') }] };
            }
            return { content: [{ type: 'text', text: `Métricas não encontradas para "${modName}". Use get_metrics() sem parâmetro para o resumo geral.` }] };
          }
          return { content: [{ type: 'text', text: fs.readFileSync(metricsPath, 'utf8') }] };
        }

        case 'get_hotspots': {
          const summaryPath = path.join(this.ticCodePath, 'metrics-summary.md');
          if (!fs.existsSync(summaryPath)) {
            return { content: [{ type: 'text', text: 'metrics-summary.md não encontrado. Execute a análise novamente.' }] };
          }
          const content = fs.readFileSync(summaryPath, 'utf8');
          // Extrai apenas a seção de hotspots (compacto)
          const hotspotsSection = content.split('## 📊')[0];
          return { content: [{ type: 'text', text: hotspotsSection || content.slice(0, 2000) }] };
        }

        case 'get_patterns': {
          const modArg = (args as { module?: string }).module;
          if (modArg) {
            const pPath = path.join(this.ticCodePath, 'modules', modArg, 'patterns.md');
            if (fs.existsSync(pPath)) return { content: [{ type: 'text', text: fs.readFileSync(pPath, 'utf8') }] };
            return { content: [{ type: 'text', text: `Nenhum padrão detectado para o módulo "${modArg}".` }] };
          }
          return { content: [{ type: 'text', text: this.readFile('patterns.md') }] };
        }

        case 'get_violations': {
          const summaryPath = path.join(this.ticCodePath, 'metrics-summary.md');
          if (!fs.existsSync(summaryPath)) {
            return { content: [{ type: 'text', text: 'Execute a análise novamente para detectar violações.' }] };
          }
          const content = fs.readFileSync(summaryPath, 'utf8');
          const violationsSection = content.split('## ⚠️ Violações Arquiteturais')[1] ?? 'Nenhuma violação detectada.';
          return { content: [{ type: 'text', text: `# Violações Arquiteturais\n\n${violationsSection.split('---')[0]}` }] };
        }

        default:
          return { content: [{ type: 'text', text: `Ferramenta desconhecida: ${name}` }] };
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

  async startHttp(port = 7432): Promise<void> {
    const app = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', projectPath: this.projectPath, version: '2.0.0' }));
        return;
      }
      if (req.url === '/mcp' || req.url?.startsWith('/mcp')) {
        const transport = new SSEServerTransport('/mcp', res);
        this.server.connect(transport).catch(console.error);
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
