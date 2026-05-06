import type { TracerAnalysis } from './analyzeTracerInputs';

export function generateDynamicAnalysis(data: TracerAnalysis): { dynamic: string; runtimeEvidence: string } {
  const section = (title: string, values: string[]) => `## ${title}\n${values.length ? values.map((v) => `- ${v}`).join('\n') : '- 🔴 LACUNA: Não identificado nos logs.'}\n`;
  const dynamic = ['# Dynamic Analysis', section('Endpoints encontrados', data.endpoints), section('Stack traces', data.stackTraces), section('Erros recorrentes', data.recurringErrors), section('Queries SQL em logs', data.sqlQueries), section('Timestamps', data.timestamps), section('Classes/módulos citados', data.modules), section('Padrões de exceção', data.exceptionPatterns)].join('\n');
  const runtimeEvidence = ['# Runtime Evidence', section('Evidências de endpoint', data.endpoints), section('Evidências de exceção', data.exceptionPatterns), section('Evidências SQL', data.sqlQueries)].join('\n');
  return { dynamic, runtimeEvidence };
}
