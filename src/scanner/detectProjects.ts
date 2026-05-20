import type { DetectedProject, DetectedProjectKind } from '../types';
import type { RiskReport } from './detectRisks';
import type { ScanResult } from './scanWorkspace';

// Padrões de detecção por tipo de projeto
const DATABASE_DIRS = new Set(['db', 'database', 'sql', 'oracle', 'plsql', 'migrations']);
const PLSQL_EXTENSIONS = new Set(['.sql', '.pks', '.pkb', '.prc', '.fnc', '.pkg', '.trg', '.pls', '.plsql']);

const BACKEND_MARKERS = {
  files: ['pom.xml', 'build.gradle', 'application.yml', 'application.properties'],
  dirs: ['src/main/java', 'src/main/kotlin'],
  patterns: [/src\/main\/java/, /src\/main\/kotlin/]
};

const FRONTEND_MARKERS = {
  files: ['vite.config.ts', 'vite.config.js', 'next.config.js', 'angular.json', 'src/App.tsx', 'src/main.tsx', 'package.json'],
  dirs: ['src', 'public'],
  packagePatterns: ['react', 'vue', 'angular', 'next', 'svelte', 'astro', 'vite']
};

const PROJECT_ROOT_HINTS: Record<Exclude<DetectedProjectKind, 'unknown'>, string[]> = {
  backend: ['backend', 'api', 'server', 'service'],
  frontend: ['frontend', 'client', 'web', 'ui'],
  mobile: ['mobile', 'app'],
  infra: ['infra', 'deploy', 'k8s', 'helm', 'terraform'],
  shared: ['shared', 'libs', 'packages', 'common'],
  database: ['database', 'db', 'sql', 'oracle', 'plsql']
};

export function detectProjects(scan: ScanResult, risks?: RiskReport): DetectedProject[] {
  const projects = new Map<string, DetectedProject>();

  // Detectar Backend
  const backendProject = detectBackend(scan, risks);
  if (backendProject) {
    projects.set(backendProject.id, backendProject);
  }

  // Detectar Frontend
  const frontendProject = detectFrontend(scan, risks);
  if (frontendProject) {
    projects.set(frontendProject.id, frontendProject);
  }

  // Detectar Mobile
  const mobileProject = detectMobile(scan, risks);
  if (mobileProject) {
    projects.set(mobileProject.id, mobileProject);
  }

  // Detectar Infra
  const infraProject = detectInfra(scan, risks);
  if (infraProject) {
    projects.set(infraProject.id, infraProject);
  }

  // Detectar Shared
  const sharedProject = detectShared(scan, risks);
  if (sharedProject) {
    projects.set(sharedProject.id, sharedProject);
  }

  // Detectar Database
  const databaseProject = detectDatabase(scan, risks);
  if (databaseProject) {
    projects.set(databaseProject.id, databaseProject);
  }

  return [...projects.values()];
}

function detectBackend(scan: ScanResult, risks: RiskReport | undefined): DetectedProject | null {
  const evidence: string[] = [];
  const stack: string[] = [];

  // Procurar por arquivos marcadores
  for (const marker of BACKEND_MARKERS.files) {
    const files = scan.files.filter((f) => f.relativePath.toLowerCase().endsWith(marker));
    if (files.length > 0) {
      evidence.push(...files.map((f) => f.relativePath));
      if (marker === 'pom.xml') {
        stack.push('Java / Maven');
      } else if (marker === 'build.gradle') {
        stack.push('Java / Gradle');
      }
    }
  }

  // Procurar por diretórios
  const javaFiles = scan.files.filter((f) => {
    const rel = f.relativePath.toLowerCase();
    return /src\/main\/java/.test(rel) || /src\/main\/kotlin/.test(rel);
  });

  if (javaFiles.length > 0) {
    evidence.push(...javaFiles.slice(0, 10).map((f) => f.relativePath));
    if (!stack.includes('Java / Maven') && !stack.includes('Java / Gradle')) {
      stack.push('Java');
    }
  }

  if (evidence.length > 0) {
    const backendRoot = inferProjectRoot(evidence, 'backend');
    return {
      id: 'backend',
      name: 'Backend',
      rootPath: scan.rootPath,
      relativePath: backendRoot,
      kind: 'backend',
      stack,
      evidence: evidence.slice(0, 20),
      files: scan.files.filter((f) => f.relativePath.toLowerCase().includes('backend') || isBackendPath(f.relativePath))
        .length,
      risks: risks?.risks.filter((r) => r.file.includes('backend') || isBackendPath(r.file)).length ?? 0
    };
  }

  return null;
}

function detectFrontend(scan: ScanResult, risks: RiskReport | undefined): DetectedProject | null {
  const evidence: string[] = [];
  const stack: string[] = [];

  // Procurar por arquivos marcadores
  for (const marker of FRONTEND_MARKERS.files) {
    const files = scan.files.filter((f) => f.relativePath.toLowerCase().endsWith(marker));
    if (files.length > 0) {
      evidence.push(...files.map((f) => f.relativePath));
      if (marker === 'vite.config.ts' || marker === 'vite.config.js') {
        stack.push('Vite');
      } else if (marker === 'next.config.js') {
        stack.push('Next.js');
      } else if (marker === 'angular.json') {
        stack.push('Angular');
      }
    }
  }

  // Procurar por package.json com dependências de frontend (sem ler conteúdo)
  const packageJsonFiles = scan.files.filter((f) => f.relativePath.toLowerCase().endsWith('package.json'));
  if (packageJsonFiles.length > 0 && !stack.includes('JavaScript')) {
    stack.push('JavaScript / TypeScript');
    evidence.push(...packageJsonFiles.slice(0, 3).map((f) => f.relativePath));
  }

  if (evidence.length > 0) {
    const frontendRoot = inferProjectRoot(evidence, 'frontend');
    return {
      id: 'frontend',
      name: 'Frontend',
      rootPath: scan.rootPath,
      relativePath: frontendRoot,
      kind: 'frontend',
      stack: stack.length > 0 ? stack : ['JavaScript / TypeScript'],
      evidence: evidence.slice(0, 20),
      files: scan.files.filter(
        (f) => f.relativePath.toLowerCase().includes('frontend') || f.relativePath.toLowerCase().includes('src')
      ).length,
      risks: risks?.risks.filter((r) => r.file.includes('frontend') || r.file.includes('src')).length ?? 0
    };
  }

  return null;
}

function detectMobile(scan: ScanResult, risks: RiskReport | undefined): DetectedProject | null {
  const evidence: string[] = [];
  const stack: string[] = [];

  // Procurar por react-native
  const rnFiles = scan.files.filter((f) => f.relativePath.toLowerCase().includes('react-native.config.js'));
  if (rnFiles.length > 0) {
    evidence.push(...rnFiles.map((f) => f.relativePath));
    stack.push('React Native');
  }

  // Procurar por Expo
  const appJsonFiles = scan.files.filter((f) => f.relativePath.toLowerCase().endsWith('app.json'));
  if (appJsonFiles.length > 0) {
    evidence.push(...appJsonFiles.map((f) => f.relativePath));
    if (!stack.includes('Expo')) {
      stack.push('Expo');
    }
  }

  // Procurar por Flutter
  const flutterFiles = scan.files.filter((f) => f.relativePath.toLowerCase().includes('pubspec.yaml'));
  if (flutterFiles.length > 0) {
    evidence.push(...flutterFiles.map((f) => f.relativePath));
    stack.push('Flutter');
  }

  const libDirFiles = scan.files.filter((f) => f.relativePath.toLowerCase().includes('/lib/'));
  if (libDirFiles.length > 3 && flutterFiles.length > 0) {
    evidence.push(...libDirFiles.slice(0, 5).map((f) => f.relativePath));
  }

  if (evidence.length > 0) {
    const mobileRoot = inferProjectRoot(evidence, 'mobile');
    return {
      id: 'mobile',
      name: 'Mobile',
      rootPath: scan.rootPath,
      relativePath: mobileRoot,
      kind: 'mobile',
      stack,
      evidence: evidence.slice(0, 20),
      files: scan.files.filter((f) => isMobilePath(f.relativePath)).length,
      risks: risks?.risks.filter((r) => isMobilePath(r.file)).length ?? 0
    };
  }

  return null;
}

function detectInfra(scan: ScanResult, risks: RiskReport | undefined): DetectedProject | null {
  const evidence: string[] = [];
  const stack: string[] = [];

  // Procurar por Dockerfile
  const dockerFiles = scan.files.filter((f) => f.relativePath.toLowerCase() === 'dockerfile');
  if (dockerFiles.length > 0) {
    evidence.push(...dockerFiles.map((f) => f.relativePath));
    stack.push('Docker');
  }

  // Procurar por docker-compose
  const composeFiles = scan.files.filter(
    (f) =>
      f.relativePath.toLowerCase().includes('docker-compose.yml') ||
      f.relativePath.toLowerCase().includes('docker-compose.yaml')
  );
  if (composeFiles.length > 0) {
    evidence.push(...composeFiles.map((f) => f.relativePath));
    if (!stack.includes('Docker')) {
      stack.push('Docker');
    }
  }

  // Procurar por Kubernetes
  const k8sFiles = scan.files.filter((f) => f.relativePath.toLowerCase().includes('/k8s/'));
  if (k8sFiles.length > 0) {
    evidence.push(...k8sFiles.slice(0, 5).map((f) => f.relativePath));
    stack.push('Kubernetes');
  }

  // Procurar por Helm
  const helmFiles = scan.files.filter((f) => f.relativePath.toLowerCase().includes('/helm/'));
  if (helmFiles.length > 0) {
    evidence.push(...helmFiles.slice(0, 5).map((f) => f.relativePath));
    stack.push('Helm');
  }

  // Procurar por Terraform
  const terraformFiles = scan.files.filter((f) => f.relativePath.toLowerCase().endsWith('.tf'));
  if (terraformFiles.length > 0) {
    evidence.push(...terraformFiles.slice(0, 5).map((f) => f.relativePath));
    stack.push('Terraform');
  }

  // Procurar por GitHub Actions
  const ghFiles = scan.files.filter((f) => f.relativePath.toLowerCase().includes('.github/workflows'));
  if (ghFiles.length > 0) {
    evidence.push(...ghFiles.slice(0, 5).map((f) => f.relativePath));
    if (!stack.includes('GitHub Actions')) {
      stack.push('GitHub Actions');
    }
  }

  if (evidence.length > 0) {
    const infraRoot = inferProjectRoot(evidence, 'infra');
    return {
      id: 'infra',
      name: 'Infraestrutura',
      rootPath: scan.rootPath,
      relativePath: infraRoot,
      kind: 'infra',
      stack,
      evidence: evidence.slice(0, 20),
      files: scan.files.filter((f) => isInfraPath(f.relativePath)).length,
      risks: risks?.risks.filter((r) => isInfraPath(r.file)).length ?? 0
    };
  }

  return null;
}

function detectShared(scan: ScanResult, risks: RiskReport | undefined): DetectedProject | null {
  const evidence: string[] = [];
  const stack: string[] = [];

  // Procurar por libs, packages, shared
  const sharedDirs = ['libs', 'packages', 'shared'];
  for (const dir of sharedDirs) {
    const files = scan.files.filter((f) => f.relativePath.toLowerCase().includes(`/${dir}/`));
    if (files.length > 0) {
      evidence.push(...files.slice(0, 5).map((f) => f.relativePath));
      break;
    }
  }

  // Procurar por src/index.ts em pasta shared
  const indexFiles = scan.files.filter((f) => {
    const rel = f.relativePath.toLowerCase();
    return (rel.includes('shared') || rel.includes('libs') || rel.includes('packages')) && rel.includes('src/index');
  });

  if (indexFiles.length > 0) {
    evidence.push(...indexFiles.map((f) => f.relativePath));
    stack.push('Shared Library');
  }

  if (evidence.length > 0) {
    const sharedRoot = inferProjectRoot(evidence, 'shared');
    return {
      id: 'shared',
      name: 'Shared / Libs',
      rootPath: scan.rootPath,
      relativePath: sharedRoot,
      kind: 'shared',
      stack: stack.length > 0 ? stack : ['JavaScript / TypeScript'],
      evidence: evidence.slice(0, 20),
      files: scan.files.filter((f) => isSharedPath(f.relativePath)).length,
      risks: risks?.risks.filter((r) => isSharedPath(r.file)).length ?? 0
    };
  }

  return null;
}

function detectDatabase(scan: ScanResult, risks: RiskReport | undefined): DetectedProject | null {
  const databaseFiles = scan.files.filter((file) => isDatabaseFile(file.relativePath, file.extension));
  const migrationFiles = scan.files.filter((file) => {
    const lower = file.relativePath.toLowerCase();
    return lower.includes('migrat') || lower.includes('flyway') || lower.includes('liquibase') || lower.includes('changelog');
  });

  if (databaseFiles.length > 0) {
    const stack = ['Oracle PL/SQL'];
    if (migrationFiles.length > 0) {
      stack.push('SQL / Migrations');
    }

    const evidence = [
      ...databaseFiles.slice(0, 15).map((file) => file.relativePath),
      ...migrationFiles.slice(0, 5).map((file) => file.relativePath)
    ];

    return {
      id: 'database',
      name: 'Database / PL/SQL',
      rootPath: scan.rootPath,
      relativePath: inferProjectRoot(databaseFiles.map((file) => file.relativePath), 'database'),
      kind: 'database',
      stack,
      evidence,
      files: databaseFiles.length,
      risks: risks?.risks.filter((risk) => risk.category === 'plsql').length ?? 0
    };
  }

  return null;
}

// Funções auxiliares
function isDatabaseFile(relativePath: string, extension: string): boolean {
  const first = relativePath.split('/')[0]?.toLowerCase();
  return PLSQL_EXTENSIONS.has(extension.toLowerCase()) || DATABASE_DIRS.has(first);
}

function inferProjectRoot(files: string[], kind: Exclude<DetectedProjectKind, 'unknown'>): string {
  const normalized = files.map(normalizeRelativePath);
  const hints = PROJECT_ROOT_HINTS[kind];
  const hintedRoots = normalized
    .map((file) => rootFromHints(file, hints))
    .filter((root): root is string => root !== null);

  if (hintedRoots.length === 1) {
    return hintedRoots[0];
  }

  if (hintedRoots.length > 1) {
    return commonProjectRoot(hintedRoots);
  }

  return commonProjectRoot(normalized);
}

function commonProjectRoot(files: string[]): string {
  if (files.length === 0) return '.';
  if (files.length === 1) {
    return files[0].split('/').slice(0, -1).join('/') || '.';
  }

  const segments = files.map((f) => f.split('/'));
  let common = 0;
  for (let i = 0; i < Math.min(...segments.map((s) => s.length)); i++) {
    if (segments.every((s) => s[i] === segments[0][i])) {
      common = i + 1;
    } else {
      break;
    }
  }

  return common > 0 ? segments[0].slice(0, common).join('/') : '.';
}

function rootFromHints(filePath: string, hints: string[]): string | null {
  const segments = normalizeRelativePath(filePath).split('/').filter(Boolean);
  const hintIndex = segments.findIndex((segment) => hints.includes(segment.toLowerCase()));
  if (hintIndex <= 0) {
    return null;
  }
  return segments.slice(0, hintIndex + 1).join('/');
}

function normalizeRelativePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\/+/, '');
}

function isBackendPath(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.includes('backend') ||
    lower.includes('src/main/java') ||
    lower.includes('src/main/kotlin') ||
    lower.includes('api') ||
    lower.includes('server')
  );
}

function isMobilePath(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.includes('mobile') ||
    lower.includes('android') ||
    lower.includes('ios') ||
    lower.includes('lib/') ||
    lower.includes('react-native')
  );
}

function isInfraPath(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.includes('docker') ||
    lower.includes('k8s') ||
    lower.includes('helm') ||
    lower.includes('terraform') ||
    lower.includes('.github/workflows') ||
    lower.includes('infra')
  );
}

function isSharedPath(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.includes('shared') || lower.includes('libs') || lower.includes('packages');
}

// ─── Multi-Project Root Detection ────────────────────────────────────────────

/**
 * Detecta múltiplos projetos reais a partir de raízes separadas no workspace.
 * Para monorepos com workspace/ ├── frontend/ ├── backend/ ├── database/
 * gera um projeto por raiz reconhecida, em vez de agregar tudo em "frontend" / "backend".
 *
 * Mantém compatibilidade com detectProjects() que retorna projetos consolidados.
 */
export function detectMultipleProjects(scan: ScanResult, risks?: RiskReport): DetectedProject[] {
  const projects: DetectedProject[] = [];

  // Collect top-level directories that have identifying files
  const topDirSet = new Set<string>();
  for (const file of scan.files) {
    const firstSegment = file.relativePath.split('/')[0];
    if (firstSegment && !firstSegment.startsWith('.')) {
      topDirSet.add(firstSegment);
    }
  }
  const topDirs = [...topDirSet];

  // If workspace has only one top-level source dir, fall back to simple detection
  const meaningfulTopDirs = topDirs.filter((d) => {
    const dirFiles = scan.files.filter((f) => f.relativePath.startsWith(`${d}/`));
    return dirFiles.length >= 2;
  });

  if (meaningfulTopDirs.length <= 1) {
    return detectProjects(scan, risks);
  }

  // Scan each top-level directory for project markers
  for (const dir of meaningfulTopDirs) {
    const dirFiles = scan.files.filter((f) => f.relativePath.startsWith(`${dir}/`));
    if (dirFiles.length === 0) continue;

    const dirKind = classifyTopLevelDir(dir, dirFiles);
    if (dirKind === 'unknown') continue;

    const stack = inferStackForDir(dir, dirFiles);
    const fileCount = dirFiles.length;
    const riskCount = risks?.risks.filter((r) => r.file.startsWith(`${dir}/`)).length ?? 0;
    const evidence = dirFiles.slice(0, 5).map((f) => f.relativePath);

    // Use the canonical kind as the ID so that cross-project bridge IDs
    // ('frontend', 'backend', …) match the project IDs rendered by the UI,
    // which prefers the detectProjects() canonical set. For workspaces with
    // multiple dirs of the same kind (rare), the first wins and later ones
    // are aliased to the same ID – bridges still display correctly.
    const canonicalId = projects.some((p) => p.id === dirKind)
      ? `${dirKind}-${slugify(dir)}`
      : dirKind;

    projects.push({
      id: canonicalId,
      name: dir,
      rootPath: scan.rootPath,
      relativePath: dir,
      kind: dirKind,
      stack,
      evidence,
      files: fileCount,
      risks: riskCount
    });
  }

  // If we found multi-project roots, return them; else fall back to simple detection
  if (projects.length > 1) {
    return projects;
  }
  return detectProjects(scan, risks);
}

function classifyTopLevelDir(dir: string, files: import('./scanFiles').ScannedFile[]): import('../types').DetectedProjectKind {
  const lower = dir.toLowerCase();
  const relPaths = files.map((f) => f.relativePath.toLowerCase());

  // Backend signals
  const hasJava = relPaths.some((r) => r.endsWith('.java'));
  const hasPom = relPaths.some((r) => r.endsWith('pom.xml'));
  const hasGradle = relPaths.some((r) => r.endsWith('build.gradle'));
  const hasSrcMainJava = relPaths.some((r) => r.includes('src/main/java'));
  if (hasJava || hasPom || hasGradle || hasSrcMainJava) return 'backend';

  // Frontend signals
  const hasReact = relPaths.some((r) => r.endsWith('.tsx') || r.endsWith('.jsx'));
  const hasVite = relPaths.some((r) => r.endsWith('vite.config.ts') || r.endsWith('vite.config.js'));
  const hasNextConfig = relPaths.some((r) => r.endsWith('next.config.js'));
  const hasAngular = relPaths.some((r) => r.endsWith('angular.json'));
  const hasPackageJson = relPaths.some((r) => r.endsWith('package.json'));

  // A Node.js project whose directory name signals backend/API must not be
  // captured by the (hasPackageJson && !hasJava) frontend catch-all below.
  const isNodeBackendByName =
    hasPackageJson && !hasJava &&
    (lower.includes('backend') || lower.includes('-api') ||
     lower.includes('_api') || lower.endsWith('api') ||
     lower.includes('-service') || lower.includes('_service') ||
     lower.includes('server'));
  if (isNodeBackendByName) return 'backend';

  if (
    lower.includes('frontend') || lower.includes('client') || lower.includes('web') || lower.includes('ui') ||
    hasReact || hasVite || hasNextConfig || hasAngular ||
    (hasPackageJson && !hasJava)
  ) return 'frontend';

  // Database signals
  const hasSql = files.some((f) => ['.sql', '.pks', '.pkb', '.prc', '.fnc', '.pkg', '.trg', '.pls', '.plsql'].includes(f.extension));
  if (hasSql || lower === 'database' || lower === 'db' || lower === 'sql') return 'database';

  // Mobile signals
  const hasFlutter = relPaths.some((r) => r.endsWith('pubspec.yaml'));
  const hasMobile = lower.includes('mobile') || lower.includes('app') || hasFlutter;
  if (hasMobile) return 'mobile';

  // Shared/libs
  if (lower === 'shared' || lower === 'libs' || lower === 'packages' || lower === 'common') return 'shared';

  // Infra
  const hasDocker = relPaths.some((r) => r.endsWith('dockerfile') || r.includes('docker-compose'));
  if (lower === 'infra' || lower === 'deploy' || hasDocker) return 'infra';

  return 'unknown';
}

function inferStackForDir(_dir: string, files: import('./scanFiles').ScannedFile[]): string[] {
  const stack: string[] = [];
  const relPaths = files.map((f) => f.relativePath.toLowerCase());

  if (relPaths.some((r) => r.endsWith('pom.xml'))) stack.push('Java / Maven');
  else if (relPaths.some((r) => r.endsWith('build.gradle'))) stack.push('Java / Gradle');
  else if (relPaths.some((r) => r.endsWith('.java'))) stack.push('Java');

  if (relPaths.some((r) => r.endsWith('vite.config.ts') || r.endsWith('vite.config.js'))) stack.push('Vite');
  if (relPaths.some((r) => r.endsWith('next.config.js'))) stack.push('Next.js');
  if (relPaths.some((r) => r.endsWith('angular.json'))) stack.push('Angular');
  if (relPaths.some((r) => r.endsWith('.tsx') || r.endsWith('.jsx'))) stack.push('React');
  if (relPaths.some((r) => r.endsWith('package.json'))) {
    if (stack.length === 0) stack.push('JavaScript / TypeScript');
  }
  if (relPaths.some((r) => r.endsWith('pubspec.yaml'))) stack.push('Flutter');
  if (files.some((f) => ['.sql', '.pks', '.pkb'].includes(f.extension))) stack.push('SQL / PL-SQL');

  return stack.length > 0 ? stack : ['Unknown'];
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

