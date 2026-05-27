import * as fs from 'fs';
import type { ScannedFile } from './scanFiles';

export type BatchJobType = 'scheduled' | 'async' | 'quartz' | 'spring-batch';

export interface BatchJob {
  file: string;
  line: number;
  className?: string;
  methodName?: string;
  type: BatchJobType;
  cron?: string;
  fixedRate?: string;
  fixedDelay?: string;
}

const JAVA_EXTS = new Set(['.java', '.kt']);
const TRIGGER_KEYWORDS = ['@Scheduled', '@Async', 'implements Job', 'QuartzJobBean', 'Tasklet', 'ItemProcessor', 'ItemReader', 'ItemWriter', 'implements Step'];

export function detectBatchJobs(files: ScannedFile[]): BatchJob[] {
  const jobs: BatchJob[] = [];

  for (const file of files) {
    if (!JAVA_EXTS.has(file.extension)) continue;

    let content: string;
    try { content = fs.readFileSync(file.absolutePath, 'utf8'); }
    catch { continue; }

    if (!TRIGGER_KEYWORDS.some((kw) => content.includes(kw))) continue;

    const lines = content.split('\n');
    let currentClass = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      const classMatch = line.match(/class\s+(\w+)/);
      if (classMatch) currentClass = classMatch[1];

      // @Scheduled
      if (/@Scheduled\b/i.test(line)) {
        const context = lines.slice(i, Math.min(lines.length, i + 5)).join(' ');
        const cron = context.match(/cron\s*=\s*["']([^"']+)["']/i)?.[1];
        const fixedRate = context.match(/fixedRate(?:String)?\s*=\s*["']?(\d+)["']?/i)?.[1];
        const fixedDelay = context.match(/fixedDelay(?:String)?\s*=\s*["']?(\d+)["']?/i)?.[1];
        const methodName = findNextMethodName(lines, i);
        jobs.push({ file: file.relativePath, line: lineNum, className: currentClass, methodName, type: 'scheduled', cron, fixedRate, fixedDelay });
        continue;
      }

      // @Async
      if (/@Async\b/i.test(line)) {
        const methodName = findNextMethodName(lines, i);
        jobs.push({ file: file.relativePath, line: lineNum, className: currentClass, methodName, type: 'async' });
        continue;
      }

      // Quartz: implements Job / extends QuartzJobBean
      if (/implements\s+[\w,\s]*\bJob\b/.test(line) || /extends\s+QuartzJobBean\b/.test(line)) {
        jobs.push({ file: file.relativePath, line: lineNum, className: currentClass, type: 'quartz' });
        continue;
      }

      // Spring Batch: Tasklet / ItemProcessor / ItemReader / ItemWriter
      if (
        /implements\s+[\w,\s]*\bTasklet\b/.test(line) ||
        /extends\s+ItemProcessor\b/.test(line) ||
        /extends\s+ItemReader\b/.test(line) ||
        /extends\s+ItemWriter\b/.test(line) ||
        /implements\s+[\w,\s]*\bItemProcessor\b/.test(line) ||
        /implements\s+[\w,\s]*\bItemReader\b/.test(line) ||
        /implements\s+[\w,\s]*\bItemWriter\b/.test(line)
      ) {
        jobs.push({ file: file.relativePath, line: lineNum, className: currentClass, type: 'spring-batch' });
      }
    }
  }

  return jobs;
}

function findNextMethodName(lines: string[], fromIdx: number): string | undefined {
  for (let j = fromIdx + 1; j < Math.min(lines.length, fromIdx + 8); j++) {
    const next = lines[j].trim();
    if (!next || next.startsWith('@') || next.startsWith('//') || next.startsWith('*')) continue;
    const m = next.match(/(?:public|protected|private)?\s*(?:static\s+)?(?:[\w<>[\],\s]+)\s+(\w+)\s*\(/);
    if (m && m[1] !== 'class') return m[1];
    break;
  }
  return undefined;
}

export function formatBatchJobsReport(jobs: BatchJob[]): string {
  if (jobs.length === 0) return '';

  const byType: Record<BatchJobType, BatchJob[]> = { scheduled: [], async: [], quartz: [], 'spring-batch': [] };
  for (const j of jobs) byType[j.type].push(j);

  const lines = [
    '# Batch Jobs e Processos Assíncronos',
    '',
    `**${jobs.length} entry points** fora do fluxo REST detectados`,
    '',
    '> Estes não aparecem no multi-grafo HTTP — são disparados por schedule ou chamada assíncrona.',
    '',
  ];

  if (byType.scheduled.length > 0) {
    lines.push(`## @Scheduled — ${byType.scheduled.length} jobs agendados`, '');
    lines.push('| Classe | Método | Agendamento | Arquivo |');
    lines.push('| --- | --- | --- | --- |');
    for (const j of byType.scheduled) {
      const sched = j.cron ? `cron \`${j.cron}\`` : j.fixedRate ? `fixedRate ${j.fixedRate}ms` : j.fixedDelay ? `fixedDelay ${j.fixedDelay}ms` : '?';
      lines.push(`| \`${j.className ?? '?'}\` | \`${j.methodName ?? '?'}\` | ${sched} | \`${j.file}:${j.line}\` |`);
    }
    lines.push('');
  }

  if (byType.async.length > 0) {
    lines.push(`## @Async — ${byType.async.length} métodos assíncronos`, '');
    lines.push('| Classe | Método | Arquivo |');
    lines.push('| --- | --- | --- |');
    for (const j of byType.async) {
      lines.push(`| \`${j.className ?? '?'}\` | \`${j.methodName ?? '?'}\` | \`${j.file}:${j.line}\` |`);
    }
    lines.push('');
  }

  if (byType.quartz.length > 0) {
    lines.push(`## Quartz Jobs — ${byType.quartz.length}`, '');
    byType.quartz.forEach((j) => lines.push(`- \`${j.className ?? '?'}\` — \`${j.file}:${j.line}\``));
    lines.push('');
  }

  if (byType['spring-batch'].length > 0) {
    lines.push(`## Spring Batch — ${byType['spring-batch'].length}`, '');
    byType['spring-batch'].forEach((j) => lines.push(`- \`${j.className ?? '?'}\` — \`${j.file}:${j.line}\``));
    lines.push('');
  }

  return lines.join('\n');
}
