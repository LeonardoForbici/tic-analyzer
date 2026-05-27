import * as fs from 'fs';
import type { ScannedFile } from './scanFiles';

export interface TransactionBoundary {
  file: string;
  line: number;
  className: string;
  methodName?: string;
  propagation: string;
  readOnly: boolean;
  rollbackFor?: string;
  scope: 'class' | 'method';
}

const JAVA_EXTS = new Set(['.java', '.kt']);

export function detectTransactions(files: ScannedFile[]): TransactionBoundary[] {
  const boundaries: TransactionBoundary[] = [];

  for (const file of files) {
    if (!JAVA_EXTS.has(file.extension)) continue;

    let content: string;
    try { content = fs.readFileSync(file.absolutePath, 'utf8'); }
    catch { continue; }

    if (!content.includes('@Transactional')) continue;

    const lines = content.split('\n');
    let currentClass = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      const classMatch = line.match(/(?:public\s+|protected\s+|private\s+)?(?:abstract\s+)?class\s+(\w+)/);
      if (classMatch) currentClass = classMatch[1];

      if (!/@Transactional\b/i.test(line)) continue;

      const context = lines.slice(i, Math.min(lines.length, i + 6)).join(' ');

      const propagation = context.match(/propagation\s*=\s*(?:Propagation\.)?(\w+)/i)?.[1] ?? 'REQUIRED';
      const readOnly = /readOnly\s*=\s*true/i.test(context);
      const rollbackFor = context.match(/rollbackFor\s*=\s*(\w[\w.]+)/i)?.[1];

      // Determine if annotation is on class or method
      let scope: 'class' | 'method' = 'method';
      let methodName: string | undefined;
      for (let j = i + 1; j < Math.min(lines.length, i + 8); j++) {
        const next = lines[j].trim();
        if (!next || next.startsWith('@') || next.startsWith('//') || next.startsWith('*')) continue;
        const classLine = next.match(/(?:abstract\s+)?class\s+(\w+)/);
        if (classLine) { scope = 'class'; break; }
        const methodLine = next.match(/(?:public|protected|private)?\s*(?:static\s+)?(?:[\w<>,\[\] ]+)\s+(\w+)\s*\(/);
        if (methodLine) { methodName = methodLine[1]; scope = 'method'; break; }
        break;
      }

      boundaries.push({ file: file.relativePath, line: lineNum, className: currentClass, methodName, propagation: propagation.toUpperCase(), readOnly, rollbackFor, scope });
    }
  }

  return boundaries;
}

export function formatTransactionsReport(boundaries: TransactionBoundary[]): string {
  if (boundaries.length === 0) return '';

  const lines = [
    '# @Transactional Boundaries',
    '',
    `**${boundaries.length} anotações @Transactional** detectadas`,
    '',
    '| Classe | Método | Propagation | ReadOnly | Arquivo |',
    '| --- | --- | --- | --- | --- |',
  ];

  for (const b of boundaries.slice(0, 60)) {
    const method = b.methodName ?? (b.scope === 'class' ? '*(class level)*' : '?');
    lines.push(`| \`${b.className}\` | \`${method}\` | ${b.propagation} | ${b.readOnly ? '✓' : ''} | \`${b.file}:${b.line}\` |`);
  }
  if (boundaries.length > 60) lines.push(`\n*... e mais ${boundaries.length - 60}*`);

  const requiresNew = boundaries.filter((b) => b.propagation === 'REQUIRES_NEW');
  if (requiresNew.length > 0) {
    lines.push('', '## ⚠️ Propagation REQUIRES_NEW — sub-transações independentes', '');
    lines.push('> Mudanças committam mesmo se a transação pai falhar. Verifique rollback manual.');
    lines.push('');
    requiresNew.forEach((b) => lines.push(`- \`${b.className}.${b.methodName ?? '?'}\` — \`${b.file}:${b.line}\``));
  }

  const readOnlyCount = boundaries.filter((b) => b.readOnly).length;
  if (readOnlyCount > 0) {
    lines.push('', `## ℹ️ readOnly=true (${readOnlyCount})`, '');
    lines.push('> Otimização de performance — banco pode usar snapshot isolation.');
  }

  return lines.join('\n');
}
