import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { Server } from '@modelcontextprotocol/sdk/server';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

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
      { name: 'tic-analyzer', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    this.registerTools();
  }

  private registerTools(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'list_modules',
          description: 'Lista todos os módulos analisados do projeto com arquivo de contexto para cada um.',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'get_module',
          description: 'Retorna o contexto completo de um módulo específico (~75k tokens). Use quando precisar de detalhes de um módulo.',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Nome do módulo (ex: "auth", "payment", "core")' }
            },
            required: ['name']
          }
        },
        {
          name: 'get_quick_context',
          description: 'Retorna o quick-context.md do projeto — visão geral compacta (~12k tokens). Use como ponto de partida.',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'search_module',
          description: 'Busca o módulo mais relevante para uma query. Útil quando não se sabe o nome exato do módulo.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Termo de busca (ex: "autenticação", "pagamento", "relatório")' }
            },
            required: ['query']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'list_modules': return { content: [{ type: 'text', text: this.readFile('index.md') }] };

        case 'get_quick_context': return { content: [{ type: 'text', text: this.readFile('quick-context.md') }] };

        case 'get_module': {
          const moduleName = (args as { name: string }).name;
          const contextPath = path.join(this.ticCodePath, 'modules', moduleName, 'context.md');

          if (!fs.existsSync(contextPath)) {
            // Tenta busca case-insensitive
            const found = this.findModuleFuzzy(moduleName);
            if (found) {
              return { content: [{ type: 'text', text: fs.readFileSync(found, 'utf8') }] };
            }
            const available = this.listModuleNames().join(', ');
            return { content: [{ type: 'text', text: `Módulo "${moduleName}" não encontrado. Módulos disponíveis: ${available}` }] };
          }

          return { content: [{ type: 'text', text: fs.readFileSync(contextPath, 'utf8') }] };
        }

        case 'search_module': {
          const query = ((args as { query: string }).query ?? '').toLowerCase();
          const modules = this.listModuleNames();
          const scored = modules.map((m) => ({
            name: m,
            score: scoreMatch(m.toLowerCase(), query)
          })).sort((a, b) => b.score - a.score);

          const best = scored[0];
          if (!best || best.score === 0) {
            return { content: [{ type: 'text', text: `Nenhum módulo encontrado para "${query}". Módulos disponíveis: ${modules.join(', ')}` }] };
          }

          const contextPath = path.join(this.ticCodePath, 'modules', best.name, 'context.md');
          const content = fs.existsSync(contextPath) ? fs.readFileSync(contextPath, 'utf8') : `Contexto do módulo "${best.name}" não encontrado.`;
          return { content: [{ type: 'text', text: `# Módulo encontrado: ${best.name}\n\n${content}` }] };
        }

        default:
          return { content: [{ type: 'text', text: `Ferramenta desconhecida: ${name}` }] };
      }
    });
  }

  private readFile(relativePath: string): string {
    const fullPath = path.join(this.ticCodePath, relativePath);
    if (!fs.existsSync(fullPath)) {
      return `Arquivo não encontrado: ${fullPath}\nExecute o TIC Analyzer para gerar os artefatos de análise.`;
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

  /** Inicia como servidor HTTP/SSE para Claude Code (configurado via URL) */
  async startHttp(port = 7432): Promise<void> {
    const app = http.createServer((req, res) => {
      // CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', projectPath: this.projectPath }));
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
        console.log(`TIC Analyzer MCP Server rodando em http://localhost:${port}/mcp`);
        resolve();
      });
      app.on('error', reject);
    });
  }

  /** Para o servidor HTTP */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.httpServer) {
        this.httpServer.close(() => resolve());
      } else {
        resolve();
      }
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

  // Correspondência por palavras
  const queryWords = query.split(/[\s-_]/);
  const matches = queryWords.filter((w) => w.length > 2 && moduleName.includes(w));
  if (matches.length > 0) return 40 * (matches.length / queryWords.length);

  return 0;
}
