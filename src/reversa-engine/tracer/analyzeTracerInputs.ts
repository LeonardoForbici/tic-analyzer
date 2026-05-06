export interface TracerAnalysis {
  endpoints: string[]; stackTraces: string[]; recurringErrors: string[]; sqlQueries: string[]; timestamps: string[]; modules: string[]; exceptionPatterns: string[];
}

export function analyzeTracerInputs(lines: string[]): TracerAnalysis {
  const pick = (arr: string[]) => [...new Set(arr)].slice(0, 50);
  return {
    endpoints: pick(lines.map((l) => l.match(/(GET|POST|PUT|PATCH|DELETE)\s+([^\s]+)/i)?.[0]).filter(Boolean) as string[]),
    stackTraces: pick(lines.filter((l) => /\bat\s+\S+\(.*:\d+:\d+\)|Traceback/i.test(l))),
    recurringErrors: pick(lines.filter((l) => /error|fail|fatal/i.test(l))),
    sqlQueries: pick(lines.filter((l) => /(select|insert|update|delete)\s+.+\s+(from|into|set)\s+/i.test(l))),
    timestamps: pick(lines.map((l) => l.match(/\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/i)?.[0]).filter(Boolean) as string[]),
    modules: pick(lines.map((l) => l.match(/([A-Z][A-Za-z0-9_$.]+\.(ts|js|java|cs|py))/)?.[1]).filter(Boolean) as string[]),
    exceptionPatterns: pick(lines.filter((l) => /(Exception|Error|ORA-\d+|SQLSTATE)/.test(l)))
  };
}
