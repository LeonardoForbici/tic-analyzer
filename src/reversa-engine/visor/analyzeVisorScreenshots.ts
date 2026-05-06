export function analyzeVisorScreenshots(files: string[]): string[] { return files.map((f) => `Tela provável: ${f.split('/').pop()}`); }
