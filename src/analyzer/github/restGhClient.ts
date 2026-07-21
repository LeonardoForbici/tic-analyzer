/**
 * Implementação de GhClient via @octokit/rest — usada por processos sem as
 * tools `mcp__github__*` carregadas (server/index.ts, cli/index.ts, a
 * GitHub Action de self-healing/PR review).
 *
 * Autentica via GITHUB_TOKEN ou TIC_GITHUB_TOKEN. `assignCopilot` e
 * `createPrWithCopilot` dependem do Copilot coding agent estar habilitado no
 * repositório/token usado — quando a permissão falta, lançam erro; o
 * dispatcher da Frente A (agents/ghDispatch.ts) captura essa falha e cai
 * para `mode: 'issue-only'` automaticamente (ver plano, Frente A2).
 */
import { Octokit } from '@octokit/rest';
import type { GhClient, GhRef, CreatePrWithCopilotParams } from './ghClient';

const COPILOT_BOT_LOGIN = 'copilot-swe-agent';

function splitRepo(repo: string): { owner: string; repo: string } {
  const [owner, name] = repo.split('/');
  if (!owner || !name) throw new Error(`repo slug inválido: "${repo}" (esperado "owner/repo")`);
  return { owner, repo: name };
}

export interface RestGhClientOptions {
  token?: string;
  /** Sobrescreve a baseUrl da API (uso em testes, contra um servidor HTTP local). */
  baseUrl?: string;
}

export function createRestGhClient(options: RestGhClientOptions = {}): GhClient {
  const auth = options.token ?? process.env.GITHUB_TOKEN ?? process.env.TIC_GITHUB_TOKEN;
  if (!auth) throw new Error('GhClient: nenhum token disponível (GITHUB_TOKEN ou TIC_GITHUB_TOKEN)');
  const octokit = new Octokit({ auth, baseUrl: options.baseUrl });

  return {
    async resolvePr(repoSlug, number) {
      const { owner, repo } = splitRepo(repoSlug);
      try {
        const { data } = await octokit.rest.pulls.get({ owner, repo, pull_number: number });
        const ref: GhRef = {
          kind: 'pr',
          repo: repoSlug,
          number: data.number,
          url: data.html_url,
          title: data.title,
          state: data.state,
          mergedAt: data.merged_at
        };
        return ref;
      } catch {
        return null;
      }
    },

    async resolveCommit(repoSlug, sha) {
      const { owner, repo } = splitRepo(repoSlug);
      try {
        const { data } = await octokit.rest.repos.getCommit({ owner, repo, ref: sha });
        const ref: GhRef = {
          kind: 'commit',
          repo: repoSlug,
          sha: data.sha,
          url: data.html_url,
          title: data.commit.message.split('\n')[0]
        };
        return ref;
      } catch {
        return null;
      }
    },

    async resolveIssue(repoSlug, number) {
      const { owner, repo } = splitRepo(repoSlug);
      try {
        const { data } = await octokit.rest.issues.get({ owner, repo, issue_number: number });
        const ref: GhRef = {
          kind: 'issue',
          repo: repoSlug,
          number: data.number,
          url: data.html_url,
          title: data.title,
          state: data.state
        };
        return ref;
      } catch {
        return null;
      }
    },

    async createIssue(repoSlug, title, body, labels) {
      const { owner, repo } = splitRepo(repoSlug);
      const { data } = await octokit.rest.issues.create({ owner, repo, title, body, labels });
      return { kind: 'issue', repo: repoSlug, number: data.number, url: data.html_url, title: data.title, state: data.state };
    },

    async findOpenIssueByTitle(repoSlug, title) {
      const { owner, repo } = splitRepo(repoSlug);
      const { data } = await octokit.rest.search.issuesAndPullRequests({
        q: `repo:${owner}/${repo} state:open in:title "${title}"`
      });
      const hit = data.items[0];
      if (!hit) return null;
      return { kind: 'issue', repo: repoSlug, number: hit.number, url: hit.html_url, title: hit.title, state: hit.state };
    },

    async assignCopilot(repoSlug, issueNumber) {
      const { owner, repo } = splitRepo(repoSlug);
      const { data } = await octokit.rest.issues.addAssignees({
        owner,
        repo,
        issue_number: issueNumber,
        assignees: [COPILOT_BOT_LOGIN]
      });
      return { kind: 'issue', repo: repoSlug, number: data.number, url: data.html_url, title: data.title, state: data.state };
    },

    async createPrWithCopilot(repoSlug, params: CreatePrWithCopilotParams) {
      // API do Copilot coding agent (GraphQL) ainda está em evolução — best
      // effort documentado. Se a mutation não existir/permissão faltar, o
      // dispatcher cai para issue-only automaticamente.
      const { owner, repo } = splitRepo(repoSlug);
      const repoInfo = await octokit.rest.repos.get({ owner, repo });
      const result = await octokit.graphql<{
        createPullRequestWithCopilot?: { pullRequest?: { number: number; url: string; title: string } };
      }>(
        `mutation($repoId: ID!, $base: String!, $title: String!, $body: String!, $problem: String!) {
          createPullRequestWithCopilot(input: {
            repositoryId: $repoId,
            baseRefName: $base,
            title: $title,
            body: $body,
            problemStatement: $problem
          }) {
            pullRequest { number url title }
          }
        }`,
        { repoId: repoInfo.data.node_id, base: params.base, title: params.title, body: params.body, problem: params.problemStatement }
      );
      const pr = result.createPullRequestWithCopilot?.pullRequest;
      if (!pr) throw new Error('createPullRequestWithCopilot não retornou PR — Copilot coding agent pode não estar habilitado neste repositório');
      return { kind: 'pr', repo: repoSlug, number: pr.number, url: pr.url, title: pr.title };
    },

    async getWorkflowRunStatus(repoSlug, runId) {
      const { owner, repo } = splitRepo(repoSlug);
      try {
        const { data } = await octokit.rest.actions.getWorkflowRun({ owner, repo, run_id: runId });
        return { conclusion: data.conclusion };
      } catch {
        return null;
      }
    }
  };
}
