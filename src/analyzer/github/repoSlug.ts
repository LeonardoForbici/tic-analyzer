/**
 * Infere "owner/repo" a partir do remote git do projeto analisado — usado
 * pela Frente A (agentes de disparo) e Frente B (memória vinculada a PR
 * real) para saber em qual repositório abrir issue/PR ou resolver refs,
 * sem exigir configuração manual na maioria dos casos.
 */
import { execSync } from 'child_process';

const SSH_FORM = /^git@([^:]+):(.+?)(?:\.git)?$/;
const HTTPS_FORM = /^https?:\/\/[^/]+\/(.+?)(?:\.git)?$/;

/** Extrai "owner/repo" de uma URL de remote git (SSH ou HTTPS). */
export function parseRemoteUrl(remoteUrl: string): string | null {
  const trimmed = remoteUrl.trim();
  const ssh = trimmed.match(SSH_FORM);
  if (ssh) return ssh[2].replace(/\.git$/, '');
  const https = trimmed.match(HTTPS_FORM);
  if (https) return https[1].replace(/\.git$/, '');
  return null;
}

/** Roda `git remote get-url origin` no projeto e extrai "owner/repo". Retorna null se não for possível. */
export function inferRepoSlug(projectPath: string): string | null {
  try {
    const url = execSync('git remote get-url origin', { cwd: projectPath, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    return parseRemoteUrl(url);
  } catch {
    return null;
  }
}
