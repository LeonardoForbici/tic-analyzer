import type { ScannedFile } from './scanFiles';

export interface ProjectModule {
  name: string;
  path: string;
  files: ScannedFile[];
  fileCount: number;
  languages: string[];
  estimatedTokens: number;
}

const LANG_MAP: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript', '.js': 'JavaScript', '.jsx': 'JavaScript',
  '.java': 'Java', '.kt': 'Kotlin', '.py': 'Python', '.cs': 'C#',
  '.go': 'Go', '.rs': 'Rust', '.php': 'PHP', '.rb': 'Ruby',
  '.sql': 'SQL', '.plsql': 'PL/SQL', '.pls': 'PL/SQL', '.pck': 'PL/SQL'
};

/** Agrupa arquivos em módulos pelo primeiro nível de diretório sob src/ ou raiz */
export function detectModules(files: ScannedFile[], maxModules = 25): ProjectModule[] {
  const moduleMap = new Map<string, ScannedFile[]>();

  for (const file of files) {
    const parts = file.relativePath.split('/');
    let key = parts[0];

    // Se primeiro dir é src/app/lib/packages, vai um nível mais fundo
    if (['src', 'app', 'lib', 'packages', 'modules', 'apps'].includes(key) && parts.length > 2) {
      key = `${parts[0]}/${parts[1]}`;
    }

    // Ignora arquivos na raiz (sem diretório)
    if (parts.length === 1) {
      key = '__root__';
    }

    if (!moduleMap.has(key)) moduleMap.set(key, []);
    moduleMap.get(key)!.push(file);
  }

  const modules: ProjectModule[] = [];

  for (const [key, moduleFiles] of moduleMap.entries()) {
    if (key === '__root__' && moduleFiles.length < 5) continue;

    const langSet = new Set<string>();
    let totalChars = 0;

    for (const f of moduleFiles) {
      const lang = LANG_MAP[f.extension];
      if (lang) langSet.add(lang);
      totalChars += f.sizeBytes;
    }

    const estimatedTokens = Math.ceil(totalChars / 4);

    modules.push({
      name: key.split('/').pop() ?? key,
      path: key,
      files: moduleFiles,
      fileCount: moduleFiles.length,
      languages: [...langSet],
      estimatedTokens
    });
  }

  // Ordena por número de arquivos (módulos maiores primeiro)
  modules.sort((a, b) => b.fileCount - a.fileCount);

  return modules.slice(0, maxModules);
}
