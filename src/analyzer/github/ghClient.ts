/**
 * Interface comum de acesso ao GitHub, usada pela Frente A (agentes de
 * disparo) e Frente B (memória vinculada a PR/commit/issue real).
 *
 * Duas implementações possíveis:
 *  - Dentro de uma sessão de agente que já tem as tools `mcp__github__*`
 *    carregadas (como o Claude Code), é o AGENTE quem resolve PR/commit/
 *    issue e chama as tools do tic-analyzer (`remember`, `link_memory_github`)
 *    com os dados já estruturados — não há client aqui, o motor não faz
 *    chamada de rede nesse caminho.
 *  - Em processos sem essas tools (server/index.ts, cli/index.ts, a GitHub
 *    Action), `RestGhClient` (restGhClient.ts) implementa esta interface via
 *    @octokit/rest, autenticado por token.
 *
 * Este princípio preserva "zero tokens de IA / motor local": pipeline.ts e
 * computeDelta.ts nunca importam nem chamam um GhClient diretamente.
 */

export type GhRefKind = 'pr' | 'commit' | 'issue';

export interface GhRef {
  kind: GhRefKind;
  repo: string;
  number?: number;
  sha?: string;
  url: string;
  title?: string;
  state?: string;
  mergedAt?: string | null;
}

export interface CreatePrWithCopilotParams {
  title: string;
  body: string;
  base: string;
  problemStatement: string;
}

export interface GhClient {
  resolvePr(repo: string, number: number): Promise<GhRef | null>;
  resolveCommit(repo: string, sha: string): Promise<GhRef | null>;
  resolveIssue(repo: string, number: number): Promise<GhRef | null>;
  createIssue(repo: string, title: string, body: string, labels?: string[]): Promise<GhRef>;
  findOpenIssueByTitle(repo: string, title: string): Promise<GhRef | null>;
  assignCopilot(repo: string, issueNumber: number): Promise<GhRef>;
  createPrWithCopilot(repo: string, params: CreatePrWithCopilotParams): Promise<GhRef>;
  getWorkflowRunStatus(repo: string, runId: number): Promise<{ conclusion: string | null } | null>;
}
