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

      // A03 — SQL concatenado em string (injection)
      if (/['"`]\s*(select|insert|update|delete|drop|alter)\b/i.test(line) && line.includes('+')) {
        risks.push({ level: 'critical', title: 'A03 SQL Injection: SQL concatenado em string', file: file.relativePath, line: lineNum });
      }

      // A03 — Runtime.exec / ProcessBuilder com concatenação (command injection)
      if (/Runtime\.getRuntime\(\)\.exec\s*\(/.test(line) || /new\s+ProcessBuilder\s*\(/.test(line)) {
        if (line.includes('+') || /\$\{/.test(line)) {
          risks.push({ level: 'critical', title: 'A03 Command Injection: Runtime.exec/ProcessBuilder com variável', file: file.relativePath, line: lineNum });
        }
      }

      // A03 — eval() com variáveis (JS/TS)
      if (/\beval\s*\([^'")\s]/.test(line) && !line.trim().startsWith('//')) {
        risks.push({ level: 'critical', title: 'A03 Code Injection: eval() com variável dinâmica', file: file.relativePath, line: lineNum });
      }

      // Empty catch
      if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(line) || /catch\s*\([^)]*\)\s*$/.test(line)) {
        risks.push({ level: 'medium', title: 'Bloco catch vazio', file: file.relativePath, line: lineNum });
      }

      // A02 — Algoritmos criptográficos fracos
      if (/\b(MD5|SHA1|SHA-1|DES|RC4|RC2)\b/.test(line) && !/\/\//.test(line.slice(0, line.search(/\b(MD5|SHA1)/))) ) {
        risks.push({ level: 'high', title: 'A02 Cryptographic Failure: algoritmo fraco (MD5/SHA1/DES)', file: file.relativePath, line: lineNum });
      }

      // A02 — Math.random() usado em contexto de segurança (token, password, secret, key, nonce, salt)
      if (/Math\.random\s*\(\)/.test(line) && /(?:token|password|secret|key|nonce|salt|seed|rand)/i.test(line)) {
        risks.push({ level: 'high', title: 'A02 Insecure Randomness: Math.random() em contexto de segurança', file: file.relativePath, line: lineNum });
      }

      // A05 — CORS permissivo
      if (/cors\s*\(\s*\{[^}]*origin\s*:\s*['"`]\*['"`]/.test(line) || /allowedOrigins.*\*/.test(line) || /setHeader.*Access-Control-Allow-Origin.*\*/.test(line)) {
        risks.push({ level: 'high', title: 'A05 Security Misconfiguration: CORS origin: * (permissão total)', file: file.relativePath, line: lineNum });
      }

      // A05 — SSL/TLS desabilitado explicitamente
      if (/ssl\s*:\s*false/i.test(line) || /verify\s*=\s*False/.test(line) || /rejectUnauthorized\s*:\s*false/.test(line) || /DISABLE_SSL/i.test(line)) {
        risks.push({ level: 'critical', title: 'A05 Security Misconfiguration: SSL/TLS desabilitado', file: file.relativePath, line: lineNum });
      }

      // A09 — Logging de dados sensíveis
      if (/(?:console\.log|System\.out\.print|logger\.\w+)\s*\(/.test(line) &&
          /(?:password|senha|token|secret|apikey|api_key|cpf|cnpj|credit.card|card.number)/i.test(line)) {
        risks.push({ level: 'high', title: 'A09 Security Logging: log de dado sensível (senha/token/CPF)', file: file.relativePath, line: lineNum });
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
