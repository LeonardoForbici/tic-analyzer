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

const SUBPROJECT_THRESHOLD = 80;
const MIN_GROUP_FILES = 5;
const MAX_DEPTH = 10;

// Infrastructure/non-domain segments — not meaningful module names
const INFRA_SEGS = new Set([
  'src', 'main', 'test', 'java', 'kotlin', 'resources', 'webapp',
  'dist', 'build', 'target', 'generated', 'out', 'output',
  'app', 'lib', 'internal', 'pkg', 'cmd',
  'assets', 'static', 'public', 'styles', 'environments', 'i18n',
  'locale', 'fonts', 'images', 'icons', 'themes', 'scss', 'less',
  // Java reverse-domain package segments
  'com', 'br', 'org', 'net', 'io', 'co', 'gov', 'edu', 'uk', 'de', 'fr', 'ru'
]);

// Top-level dirs that are source trees (not sub-project roots)
const KNOWN_SRC_DIRS = new Set([
  'src', 'app', 'lib', 'packages', 'modules', 'apps',
  'internal', 'pkg', 'cmd', 'source', 'sources'
]);

/**
 * Finds the depth (relative to a sub-project root) where >= 2 distinct
 * non-infrastructure groups each have >= MIN_GROUP_FILES files.
 * Returns 1 as fallback when no meaningful split is found.
 */
function findMeaningfulDepth(innerPaths: string[]): number {
  for (let depth = 1; depth <= MAX_DEPTH; depth++) {
    const groupCounts = new Map<string, number>();

    for (const p of innerPaths) {
      const parts = p.split('/');
      if (parts.length <= depth) continue;
      const prefix = parts.slice(0, depth).join('/');
      groupCounts.set(prefix, (groupCounts.get(prefix) ?? 0) + 1);
    }

    if (groupCounts.size === 0) break;

    const entries = [...groupCounts.entries()];

    // Count unique non-infra last-segments with enough files
    // (dedup by last segment so src/main/.../feat and src/test/.../feat count as one)
    const meaningfulSegs = new Set(
      entries
        .filter(([key, count]) => {
          const lastSeg = key.split('/').pop()!;
          return count >= MIN_GROUP_FILES && !INFRA_SEGS.has(lastSeg);
        })
        .map(([key]) => key.split('/').pop()!)
    );

    if (meaningfulSegs.size >= 2) return depth;

    // Single path at this depth (no branching yet) → keep going deeper
    if (groupCounts.size === 1) continue;

    // All groups are infra at this level → skip this level
    const allAreInfra = entries.every(([key]) => INFRA_SEGS.has(key.split('/').pop()!));
    if (allAreInfra) continue;

    // Multiple non-infra groups but not enough files — no point going deeper
    break;
  }

  return 1;
}

/** Derives a short, user-friendly name for a sub-project directory */
function shortSubProjectName(dirName: string): string {
  const KNOWN_SUFFIXES = [
    'frontend', 'backend', 'api', 'web', 'app', 'core', 'service', 'worker',
    'server', 'client', 'ui', 'gateway', 'proxy', 'admin', 'mobile', 'cli', 'bff'
  ];
  const parts = dirName.split(/[-_]/);
  for (let i = parts.length - 1; i >= 0; i--) {
    if (KNOWN_SUFFIXES.includes(parts[i].toLowerCase())) {
      return parts.slice(i).join('-');
    }
  }
  return parts[parts.length - 1] ?? dirName;
}

/**
 * Workspaces no padrão `<projeto>-backend` / `<projeto>-frontend` lado a lado
 * (ex.: cci-tws-pending-approval/pending-approval-backend): essas pastas são
 * SEMPRE subprojetos, independente do nº de arquivos.
 */
function looksLikeSubProject(dirName: string): boolean {
  return /(^|[-_.])(frontend|front|backend|back|api|web|ui|client|server|mobile|bff|gateway|admin)$/i.test(dirName);
}

/**
 * Detects modules inside a sub-project by finding the meaningful depth
 * where the project has multiple distinct domain groups.
 */
function detectSubProjectModules(
  subProjectDir: string,
  files: ScannedFile[]
): Map<string, ScannedFile[]> {
  const prefixLen = subProjectDir.length + 1;
  const innerPaths = files.map((f) => f.relativePath.slice(prefixLen));
  const depth = findMeaningfulDepth(innerPaths);

  const moduleMap = new Map<string, ScannedFile[]>();

  for (let idx = 0; idx < files.length; idx++) {
    const file = files[idx];
    const innerPath = innerPaths[idx];
    const parts = innerPath.split('/');

    const keyDepth = Math.min(depth, parts.length - 1);
    // keyDepth 0 = arquivo na RAIZ do subprojeto (ex.: frontend/package.json):
    // agrupa no módulo raiz do subprojeto — nunca usa o nome do arquivo como módulo.
    const innerKey = keyDepth > 0
      ? parts.slice(0, keyDepth).join('/')
      : '__root__';

    const fullKey = `${subProjectDir}/${innerKey}`;
    if (!moduleMap.has(fullKey)) moduleMap.set(fullKey, []);
    moduleMap.get(fullKey)!.push(file);
  }

  return moduleMap;
}

/** Agrupa arquivos em módulos — detecta sub-projetos e módulos internos automaticamente */
export function detectModules(files: ScannedFile[], maxModules = 25): ProjectModule[] {
  // Pass 1: group by top-level directory
  const topLevelMap = new Map<string, ScannedFile[]>();

  for (const file of files) {
    const parts = file.relativePath.split('/');
    const key = parts.length === 1 ? '__root__' : parts[0];
    if (!topLevelMap.has(key)) topLevelMap.set(key, []);
    topLevelMap.get(key)!.push(file);
  }

  // Track which top-level dirs became sub-projects (for name prefixing)
  const subProjectDirs = new Set<string>();

  // Pass 2: build final module map
  const moduleMap = new Map<string, ScannedFile[]>();

  for (const [topKey, topFiles] of topLevelMap.entries()) {
    if (topKey === '__root__') {
      if (topFiles.length >= 5) moduleMap.set('__root__', topFiles);
      continue;
    }

    // Sub-project: pasta de topo grande OU com nome de subprojeto
    // (<projeto>-backend / <projeto>-frontend) que não é source tree comum
    if (!KNOWN_SRC_DIRS.has(topKey) && (topFiles.length >= SUBPROJECT_THRESHOLD || looksLikeSubProject(topKey))) {
      const subModules = detectSubProjectModules(topKey, topFiles);
      if (subModules.size > 1) {
        subProjectDirs.add(topKey);
        for (const [k, v] of subModules) moduleMap.set(k, v);
        continue;
      }
      // Fallback: sem sub-módulos significativos — a pasta inteira vira um
      // módulo, com nome curto quando é subprojeto (pending-approval-backend → backend)
      if (looksLikeSubProject(topKey)) {
        subProjectDirs.add(topKey);
        moduleMap.set(`${topKey}/__root__`, topFiles);
      } else {
        moduleMap.set(topKey, topFiles);
      }
      continue;
    }

    // Default: apply existing src/app/lib one-level-deeper logic
    for (const file of topFiles) {
      const parts = file.relativePath.split('/');
      let key = parts[0];
      if (KNOWN_SRC_DIRS.has(key) && parts.length > 2) {
        key = `${parts[0]}/${parts[1]}`;
      }
      if (parts.length === 1) key = '__root__';
      if (!moduleMap.has(key)) moduleMap.set(key, []);
      moduleMap.get(key)!.push(file);
    }
  }

  // Build module list
  const moduleList: ProjectModule[] = [];

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

    let name: string;
    if (key === '__root__') {
      name = '__root__';
    } else {
      const keyParts = key.split('/');
      const topDir = keyParts[0];
      const lastSeg = keyParts[keyParts.length - 1];
      name = subProjectDirs.has(topDir) && keyParts.length > 1
        ? (lastSeg === '__root__' ? shortSubProjectName(topDir) : `${shortSubProjectName(topDir)}/${lastSeg}`)
        : lastSeg;
    }

    moduleList.push({
      name,
      path: key,
      files: moduleFiles,
      fileCount: moduleFiles.length,
      languages: [...langSet],
      estimatedTokens
    });
  }

  moduleList.sort((a, b) => b.fileCount - a.fileCount);

  // Merge modules that ended up with the same display name (e.g. src/main vs
  // src/test) — mas só quando vêm do MESMO topo: "frontend/application" e
  // "backend/application" são módulos diferentes (senão arquivos frontend
  // acabam dentro de um módulo classificado backend).
  const mergeInto = (target: ProjectModule, mod: ProjectModule) => {
    target.files.push(...mod.files);
    target.fileCount += mod.fileCount;
    target.estimatedTokens += mod.estimatedTokens;
    for (const lang of mod.languages) {
      if (!target.languages.includes(lang)) target.languages.push(lang);
    }
  };

  const merged = new Map<string, ProjectModule>();
  for (const mod of moduleList) {
    const existing = merged.get(mod.name);
    if (existing && existing.path.split('/')[0] === mod.path.split('/')[0]) {
      mergeInto(existing, mod);
      continue;
    }
    let name = mod.name;
    if (existing) {
      // Mesmo display name, topos diferentes → desambigua com o topo
      name = `${mod.path.split('/')[0]}/${mod.name}`;
      if (merged.has(name)) { mergeInto(merged.get(name)!, mod); continue; }
    }
    merged.set(name, { ...mod, name, files: [...mod.files] });
  }

  // Funde módulos minúsculos (< MIN_GROUP_FILES) no módulo raiz do seu topo —
  // elimina "módulos" de 1-2 arquivos que poluem o grafo hierárquico.
  const finalList = [...merged.values()].sort((a, b) => b.fileCount - a.fileCount);
  const byName = new Map(finalList.map((m) => [m.name, m]));
  const result: ProjectModule[] = [];
  for (const mod of finalList) {
    if (mod.fileCount >= MIN_GROUP_FILES || finalList.length === 1) { result.push(mod); continue; }
    const topDir = mod.path.split('/')[0];
    const host =
      byName.get(shortSubProjectName(topDir)) ??
      byName.get(topDir) ??
      byName.get('__root__') ??
      result.find((m) => m.path.split('/')[0] === topDir && m !== mod);
    if (host && host !== mod && host.fileCount >= MIN_GROUP_FILES) {
      mergeInto(host, mod);
    } else {
      result.push(mod); // sem destino melhor: mantém
    }
  }

  return result
    .sort((a, b) => b.fileCount - a.fileCount)
    .slice(0, maxModules);
}
