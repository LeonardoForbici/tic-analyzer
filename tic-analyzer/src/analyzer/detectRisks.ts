import * as fs from 'fs';
import type { ScannedFile } from './scanFiles';

export type RiskLevel = 'critical' | 'high' | 'medium' | 'low';

export interface RiskFinding {
  level: RiskLevel;
  title: string;
  file: string;
  line?: number;
  detail?: string;
}

const LARGE_FILE_LINES = 500;
const VERY_LARGE_FILE_LINES = 1500;

/** Detecta riscos determinísticos sem IA */
export function detectRisks(files: ScannedFile[]): RiskFinding[] {
  const risks: RiskFinding[] = [];

  for (const file of files) {
    // Arquivos muito grandes
    if (file.lines > VERY_LARGE_FILE_LINES) {
      risks.push({ level: 'critical', title: `Arquivo com mais de ${VERY_LARGE_FILE_LINES} linhas`, file: file.relativePath });
    } else if (file.lines > LARGE_FILE_LINES) {
      risks.push({ level: 'medium', title: `Arquivo com mais de ${LARGE_FILE_LINES} linhas`, file: file.relativePath });
    }

    // Lê conteúdo só para arquivos de código (não config/dados)
    const codeExts = new Set(['.ts', '.tsx', '.js', '.jsx', '.java', '.py', '.cs', '.go', '.rs', '.php', '.rb']);
    if (!codeExts.has(file.extension)) continue;

    let content: string;
    try { content = fs.readFileSync(file.absolutePath, 'utf8'); }
    catch { continue; }

    const lines = content.split('\n');

    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const trimmed = line.trim().toLowerCase();

      // TODO/FIXME
      if (/\b(todo|fixme|hack|xxx)\b/.test(trimmed)) {
        risks.push({ level: 'low', title: 'Marcador TODO/FIXME encontrado', file: file.relativePath, line: lineNum });
      }

      // SQL concatenado em string (risco de injeção)
      if (/['"`]\s*(select|insert|update|delete|drop|alter)\b/i.test(line) && line.includes('+')) {
        risks.push({ level: 'critical', title: 'SQL concatenado em string (risco de injeção)', file: file.relativePath, line: lineNum });
      }

      // Empty catch
      if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(line) || /catch\s*\([^)]*\)\s*$/.test(line)) {
        risks.push({ level: 'medium', title: 'Bloco catch vazio', file: file.relativePath, line: lineNum });
      }

      // Hardcoded credentials patterns
      if (/password\s*=\s*['"][^'"]{3,}/i.test(line) || /secret\s*=\s*['"][^'"]{3,}/i.test(line)) {
        risks.push({ level: 'critical', title: 'Possível credencial hardcoded', file: file.relativePath, line: lineNum });
      }
    });
  }

  // Deduplica por arquivo+título (mantém primeira ocorrência)
  const seen = new Set<string>();
  return risks.filter((r) => {
    const key = `${r.level}|${r.title}|${r.file}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
