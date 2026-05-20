import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ScannedFile } from './scanFiles';

export type ImportLanguage = 'typescript' | 'javascript' | 'java' | 'json' | 'unknown';
export type ImportKind = 'import' | 'export' | 'dynamic-import' | 'require' | 'java-import' | 'package-dependency';

export interface ParsedImport {
  sourcePath: string;
  specifier: string;
  kind: ImportKind;
  language: ImportLanguage;
  lineNumber: number;
  rawText: string;
}

export async function parseImports(rootPath: string, file: ScannedFile): Promise<ParsedImport[]> {
  const absolutePath = path.join(rootPath, file.relativePath);
  const content = await readText(absolutePath);

  if (!content) {
    return [];
  }

  if (['.ts', '.tsx', '.js', '.jsx'].includes(file.extension)) {
    return parseTypeScriptImports(file.relativePath, content, file.extension === '.js' || file.extension === '.jsx' ? 'javascript' : 'typescript');
  }

  if (file.extension === '.java') {
    return parseJavaImports(file.relativePath, content);
  }

  if (file.relativePath.endsWith('package.json')) {
    return parsePackageJsonDependencies(file.relativePath, content);
  }

  return [];
}

export function parseTypeScriptImports(sourcePath: string, content: string, language: ImportLanguage = 'typescript'): ParsedImport[] {
  const imports: ParsedImport[] = [];
  const patterns: Array<{ kind: ImportKind; pattern: RegExp }> = [
    { kind: 'import', pattern: /\bimport\s+(?!type\b)(?:[^'"`]*?\s+from\s+)?["'`]([^"'`]+)["'`]/g },
    { kind: 'export', pattern: /\bexport\s+(?!type\b)(?:[^'"`]*?\s+from\s+)["'`]([^"'`]+)["'`]/g },
    { kind: 'dynamic-import', pattern: /\bimport\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g },
    { kind: 'require', pattern: /\brequire\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g }
  ];

  for (const { kind, pattern } of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const lineNumber = content.slice(0, match.index).split('\n').length;
      const rawText = match[0].replace(/\s+/g, ' ').trim().slice(0, 100);
      imports.push({ sourcePath, specifier: match[1], kind, language, lineNumber, rawText });
    }
  }

  return dedupeImports(imports);
}

export function parseJavaImports(sourcePath: string, content: string): ParsedImport[] {
  const imports: ParsedImport[] = [];
  const pattern = /^\s*import\s+(?:static\s+)?([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\.\*)+)\s*;/gm;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    const lineNumber = content.slice(0, match.index).split('\n').length;
    const rawText = match[0].replace(/\s+/g, ' ').trim().slice(0, 100);
    imports.push({ sourcePath, specifier: match[1], kind: 'java-import', language: 'java', lineNumber, rawText });
  }

  return dedupeImports(imports);
}

export function parsePackageJsonDependencies(sourcePath: string, content: string): ParsedImport[] {
  let packageJson: Record<string, unknown>;
  try {
    packageJson = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return [];
  }

  const dependencies = {
    ...readDependencyBlock(packageJson.dependencies),
    ...readDependencyBlock(packageJson.devDependencies),
    ...readDependencyBlock(packageJson.peerDependencies),
    ...readDependencyBlock(packageJson.optionalDependencies)
  };

  return Object.keys(dependencies)
    .sort()
    .map((specifier) => ({
      sourcePath,
      specifier,
      kind: 'package-dependency' as const,
      language: 'json' as const,
      lineNumber: 0,
      rawText: specifier
    }));
}

export function extractJavaPackage(content: string): string | undefined {
  return content.match(/^\s*package\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*;/m)?.[1];
}

export function extractJavaClassName(content: string): string | undefined {
  return content.match(/\b(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/)?.[1];
}

export function packageNameFromSpecifier(specifier: string): string {
  if (specifier.startsWith('@')) {
    const [scope, name] = specifier.split('/');
    return name ? `${scope}/${name}` : specifier;
  }

  return specifier.split('/')[0];
}

async function readText(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

function readDependencyBlock(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  );
}

function dedupeImports(imports: ParsedImport[]): ParsedImport[] {
  const seen = new Set<string>();
  return imports.filter((item) => {
    const key = `${item.sourcePath}|${item.kind}|${item.specifier}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
