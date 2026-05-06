import type { VisorShot } from './analyzeVisorScreenshots';

export function generateUiDocs(shots: VisorShot[]): { index: string; analysis: string; flows: string } {
  const rows = shots.map((s) => `| ${s.fileName} | ${s.width ?? '🔴 LACUNA'}x${s.height ?? '🔴 LACUNA'} | ${s.probableScreen} | ${s.description} |`).join('\n');
  const index = `# Screenshots Index\n\n| Arquivo | Dimensão | Tela provável | Descrição |\n|---|---|---|---|\n${rows || '| 🔴 LACUNA | 🔴 LACUNA | 🔴 LACUNA | Nenhum screenshot importado. |'}\n`;
  const analysis = `# UI Analysis\n\n${shots.length ? shots.map((s) => `## ${s.probableScreen}\n- Arquivo: ${s.fileName}\n- Descrição: ${s.description}`).join('\n\n') : '- 🔴 LACUNA: Nenhum screenshot importado para análise.'}\n`;
  const flows = `# User Flows\n\n${shots.length ? '- Fluxos inferidos a partir dos nomes dos screenshots (determinístico/manual).\n' : '- 🔴 LACUNA: sem screenshots, fluxo não identificável.'}`;
  return { index, analysis, flows };
}
