/**
 * Adapta conteúdo do Reversa para o contexto do TIC Coder Lite.
 * Aplica substituições de paths e referências de CLI.
 * Créditos: Reversa by Sandeco — MIT License (adapted)
 */

/** Aplica todas as substituições obrigatórias de paths/comandos */
export function adaptReversaContent(content: string): string {
  return content
    // Pastas principais
    .replace(/`\.reversa\/state\.json`/g, '`.tic-code/reversa/state.json`')
    .replace(/`\.reversa\/context\//g, '`.tic-code/reversa/context/')
    .replace(/`\.reversa\//g, '`.tic-code/reversa/')
    .replace(/\.reversa\/context\//g, '.tic-code/reversa/context/')
    .replace(/\.reversa\//g, '.tic-code/reversa/')
    .replace(/`_reversa_sdd\//g, '`.tic-code/reverse-engineering/')
    .replace(/_reversa_sdd\//g, '.tic-code/reverse-engineering/')
    // Comandos CLI
    .replace(/`\/reversa\b([^`]*)`/g, '`TIC Coder Lite: Analisar Workspace$1`')
    .replace(/\/reversa\b/g, 'TIC Coder Lite: Analisar Workspace')
    .replace(/`npx reversa install`/g, '`TIC Coder Lite: Analisar Workspace`')
    .replace(/`npx reversa update`/g, '`Atualizar TIC Coder Lite`')
    .replace(/`npx reversa ([^`]+)`/g, '`TIC Coder Lite: $1`')
    .replace(/npx reversa /g, 'TIC Coder Lite: ')
    .replace(/Reversa CLI/g, 'TIC Coder Lite VS Code Extension')
    // Agents (keep readable)
    .replace(/`reversa-scout`/g, 'Scout (TIC Coder Lite)')
    .replace(/`reversa-archaeologist`/g, 'Archaeologist (TIC Coder Lite)')
    .replace(/`reversa-detective`/g, 'Detective (TIC Coder Lite)')
    .replace(/`reversa-architect`/g, 'Architect (TIC Coder Lite)')
    .replace(/`reversa-writer`/g, 'Writer (TIC Coder Lite)')
    .replace(/`reversa-reviewer`/g, 'Reviewer (TIC Coder Lite)')
    .replace(/`reversa-data-master`/g, 'Data Master (TIC Coder Lite)')
    .replace(/`reversa-visor`/g, 'Visor (TIC Coder Lite)')
    .replace(/`reversa-reconstructor`/g, 'Reconstructor (TIC Coder Lite)');
}

/** Remove frontmatter YAML (---...---) de um SKILL.md */
export function stripFrontmatter(content: string): string {
  if (!content.startsWith('---')) return content;
  const end = content.indexOf('---', 3);
  if (end < 0) return content;
  return content.slice(end + 3).trim();
}

/** Extrai metadados do frontmatter */
export function extractFrontmatter(content: string): Record<string, string> {
  if (!content.startsWith('---')) return {};
  const end = content.indexOf('---', 3);
  if (end < 0) return {};
  const yaml = content.slice(3, end).trim();
  const result: Record<string, string> = {};
  for (const line of yaml.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx < 0) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !key.startsWith(' ') && !key.startsWith('#')) {
      result[key] = value;
    }
  }
  return result;
}

/** Adapta e limpa um SKILL.md completo para exibição/uso no TIC Coder Lite */
export function adaptSkillMd(raw: string): { meta: Record<string, string>; body: string } {
  const meta = extractFrontmatter(raw);
  const body = adaptReversaContent(stripFrontmatter(raw));
  return { meta, body };
}
