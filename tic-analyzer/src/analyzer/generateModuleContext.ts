import * as fs from 'fs';
import * as path from 'path';
import type { ProjectModule } from './detectModules';
import type { RiskFinding } from './detectRisks';
import type { EndpointFound } from './detectEndpoints';
import type { DependencyGraph } from './buildDependencyGraph';
import { TokenBudget } from './tokenBudget';

export interface ModuleContextInput {
  module: ProjectModule;
  risks: RiskFinding[];
  endpoints: EndpointFound[];
  graph: DependencyGraph;
  projectName: string;
}

/** Gera context.md por módulo com token budget de 75k tokens (~300KB) */
export function generateModuleContext(input: ModuleContextInput, maxTokens = 75_000): string {
  const { module, risks, endpoints, graph } = input;
  const budget = new TokenBudget(maxTokens);
  const sections: string[] = [];

  const moduleRisks = risks.filter((r) => r.file.startsWith(module.path));
  const moduleEndpoints = endpoints.filter((e) => e.file.startsWith(module.path));
  const moduleFiles = module.files;

  // ── HEADER ───────────────────────────────────────────────────────────────────
  const header = `# Módulo: ${module.name}

**Caminho:** \`${module.path}\`
**Arquivos:** ${module.fileCount.toLocaleString()}
**Linguagens:** ${module.languages.join(', ')}
**Riscos detectados:** ${moduleRisks.length}
**Endpoints detectados:** ${moduleEndpoints.length}

---
`;
  budget.consume(header);
  sections.push(header);

  // ── ARQUIVOS PRINCIPAIS ───────────────────────────────────────────────────────
  const centralInModule = graph.centralFiles.filter((f) => f.startsWith(module.path));
  const fileListSection = [
    '## Arquivos do Módulo\n',
    ...moduleFiles.slice(0, 50).map((f) => {
      const isCentral = centralInModule.includes(f.relativePath);
      return `- \`${f.relativePath}\` (${f.lines} linhas)${isCentral ? ' ⭐' : ''}`;
    }),
    moduleFiles.length > 50 ? `\n> ...e mais ${moduleFiles.length - 50} arquivos` : '',
    ''
  ].filter(Boolean).join('\n');

  if (budget.fits(fileListSection)) {
    budget.consume(fileListSection);
    sections.push(fileListSection);
  } else {
    sections.push(budget.truncate(fileListSection));
  }

  // ── RISCOS ────────────────────────────────────────────────────────────────────
  if (moduleRisks.length > 0 && budget.remaining > 1000) {
    const riskLines: string[] = ['## Riscos Técnicos\n'];
    for (const r of moduleRisks.slice(0, 20)) {
      riskLines.push(`- **[${r.level.toUpperCase()}]** ${r.title} → \`${r.file}${r.line ? `:${r.line}` : ''}\``);
    }
    riskLines.push('');
    const risksSection = riskLines.join('\n');

    if (budget.fits(risksSection)) {
      budget.consume(risksSection);
      sections.push(risksSection);
    }
  }

  // ── ENDPOINTS ────────────────────────────────────────────────────────────────
  if (moduleEndpoints.length > 0 && budget.remaining > 1000) {
    const epSection = [
      '## Endpoints REST\n',
      '| Método | Path | Arquivo |',
      '| --- | --- | --- |',
      ...moduleEndpoints.map((e) => `| \`${e.method}\` | \`${e.path}\` | \`${e.file}:${e.line}\` |`),
      ''
    ].join('\n');

    if (budget.fits(epSection)) {
      budget.consume(epSection);
      sections.push(epSection);
    } else {
      sections.push(budget.truncate(epSection));
    }
  }

  // ── CONTEÚDO DOS ARQUIVOS CRÍTICOS (se budget permitir) ──────────────────────
  if (budget.remaining > 5000) {
    sections.push('## Conteúdo dos Arquivos Principais\n');
    budget.consume('## Conteúdo dos Arquivos Principais\n');

    const priorityFiles = [
      ...centralInModule.map((p) => module.files.find((f) => f.relativePath === p)).filter(Boolean),
      ...module.files.filter((f) => !centralInModule.includes(f.relativePath))
    ].slice(0, 10) as typeof module.files;

    for (const file of priorityFiles) {
      if (budget.remaining < 2000) break;

      let content: string;
      try { content = fs.readFileSync(file.absolutePath, 'utf8'); }
      catch { continue; }

      const fileBlock = `### \`${file.relativePath}\`\n\n\`\`\`${extToLang(file.extension)}\n${content}\n\`\`\`\n\n`;

      if (budget.fits(fileBlock)) {
        budget.consume(fileBlock);
        sections.push(fileBlock);
      } else {
        // Trunca o conteúdo do arquivo para caber
        const maxContentChars = budget.remaining * 4 - 200;
        if (maxContentChars > 500) {
          const truncatedContent = content.slice(0, maxContentChars) + '\n// ... (truncado — ver arquivo completo)';
          const truncatedBlock = `### \`${file.relativePath}\`\n\n\`\`\`${extToLang(file.extension)}\n${truncatedContent}\n\`\`\`\n\n`;
          budget.consume(truncatedBlock);
          sections.push(truncatedBlock);
        }
        break;
      }
    }
  }

  // ── FOOTER ────────────────────────────────────────────────────────────────────
  const footer = `---\n\n> Tokens estimados: ~${budget.usedTokens.toLocaleString()} | Budget: ${maxTokens.toLocaleString()}\n`;
  sections.push(footer);

  return sections.join('');
}

function extToLang(ext: string): string {
  const map: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'tsx', '.js': 'javascript', '.jsx': 'jsx',
    '.java': 'java', '.py': 'python', '.cs': 'csharp', '.go': 'go',
    '.rs': 'rust', '.php': 'php', '.rb': 'ruby', '.sql': 'sql',
    '.html': 'html', '.css': 'css', '.scss': 'scss', '.json': 'json',
    '.yaml': 'yaml', '.yml': 'yaml', '.md': 'markdown'
  };
  return map[ext] ?? '';
}
