import * as fs from 'fs';
import type { ScannedFile } from './scanFiles';

export type ConfidenceMark = '🟢' | '🟡';

export interface FrontendCall {
  method: string;
  urlPattern: string;
  file: string;
  line: number;
  confidence: ConfidenceMark;
}

const FRONTEND_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);

export function detectFrontendCalls(files: ScannedFile[]): FrontendCall[] {
  const calls: FrontendCall[] = [];
  const seen = new Set<string>();

  const frontendFiles = files.filter((f) =>
    FRONTEND_EXTS.has(f.extension) &&
    !f.relativePath.includes('node_modules') &&
    !f.relativePath.includes('.spec.') &&
    !f.relativePath.includes('.test.')
  );

  for (const file of frontendFiles) {
    let content: string;
    try { content = fs.readFileSync(file.absolutePath, 'utf8'); }
    catch { continue; }

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // fetch('/api/...') — 🟢
      const fetchMatch = line.match(/fetch\s*\(\s*['"`]([^'"`\s]+)['"`]/);
      if (fetchMatch) {
        const method = guessMethodFromContext(line, lines, i);
        push(calls, seen, { method, urlPattern: fetchMatch[1], file: file.relativePath, line: lineNum, confidence: '🟢' });
      }

      // fetch(baseUrl + '/path') ou fetch(`${base}/path`) — 🟡
      const fetchDynMatch = line.match(/fetch\s*\(\s*(?:\w+\s*\+\s*['"`]([^'"`]+)['"`]|`[^`]*\$\{[^}]+\}([^`]*)`)/);
      if (fetchDynMatch && !fetchMatch) {
        const partial = fetchDynMatch[1] ?? fetchDynMatch[2] ?? '';
        if (partial.startsWith('/')) {
          const method = guessMethodFromContext(line, lines, i);
          push(calls, seen, { method, urlPattern: partial, file: file.relativePath, line: lineNum, confidence: '🟡' });
        }
      }

      // axios.get/post/put/delete/patch('/api/...') — 🟢
      const axiosMatch = line.match(/axios\.(get|post|put|delete|patch|head)\s*\(\s*['"`]([^'"`\s]+)['"`]/i);
      if (axiosMatch) {
        push(calls, seen, { method: axiosMatch[1].toUpperCase(), urlPattern: axiosMatch[2], file: file.relativePath, line: lineNum, confidence: '🟢' });
      }

      // axios({ method: 'get', url: '/api/...' }) — 🟢
      const axiosObjMethod = line.match(/method\s*:\s*['"`](get|post|put|delete|patch)['"`]/i);
      const axiosObjUrl = line.match(/url\s*:\s*['"`]([^'"`\s]+)['"`]/);
      if (axiosObjMethod && axiosObjUrl) {
        push(calls, seen, { method: axiosObjMethod[1].toUpperCase(), urlPattern: axiosObjUrl[1], file: file.relativePath, line: lineNum, confidence: '🟢' });
      }

      // Angular HttpClient: this.http.get('/api/...') — 🟢
      const httpClientMatch = line.match(/(?:this\.)?http\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`\s]+)['"`]/i);
      if (httpClientMatch) {
        push(calls, seen, { method: httpClientMatch[1].toUpperCase(), urlPattern: httpClientMatch[2], file: file.relativePath, line: lineNum, confidence: '🟢' });
      }

      // this.http.get(this.apiUrl + '/path') — 🟡
      const httpClientDyn = line.match(/(?:this\.)?http\.(get|post|put|delete|patch)\s*\(\s*(?:this\.\w+\s*\+\s*)?['"`]([/][^'"`\s]+)['"`]/i);
      if (httpClientDyn && !httpClientMatch) {
        push(calls, seen, { method: httpClientDyn[1].toUpperCase(), urlPattern: httpClientDyn[2], file: file.relativePath, line: lineNum, confidence: '🟡' });
      }

      // XMLHttpRequest — 🟡
      const xhrOpen = line.match(/\.open\s*\(\s*['"`](GET|POST|PUT|DELETE|PATCH)['"`]\s*,\s*['"`]([^'"`\s]+)['"`]/i);
      if (xhrOpen) {
        push(calls, seen, { method: xhrOpen[1].toUpperCase(), urlPattern: xhrOpen[2], file: file.relativePath, line: lineNum, confidence: '🟢' });
      }
    }
  }

  return calls.slice(0, 500);
}

function guessMethodFromContext(line: string, lines: string[], idx: number): string {
  // Olha nas linhas próximas por method: 'POST' etc.
  const context = lines.slice(Math.max(0, idx - 2), Math.min(lines.length, idx + 5)).join(' ');
  if (/method\s*:\s*['"`]?(POST)/i.test(context)) return 'POST';
  if (/method\s*:\s*['"`]?(PUT)/i.test(context)) return 'PUT';
  if (/method\s*:\s*['"`]?(DELETE)/i.test(context)) return 'DELETE';
  if (/method\s*:\s*['"`]?(PATCH)/i.test(context)) return 'PATCH';
  return 'GET';
}

function push(calls: FrontendCall[], seen: Set<string>, call: FrontendCall): void {
  const key = `${call.method}|${call.urlPattern}|${call.file}:${call.line}`;
  if (!seen.has(key)) {
    seen.add(key);
    calls.push(call);
  }
}
