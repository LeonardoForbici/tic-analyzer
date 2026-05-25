import * as fs from 'fs';
import * as path from 'path';
import type { ScannedFile } from './scanFiles';

export interface StackInfo {
  languages: Record<string, number>;
  frameworks: string[];
  packageManagers: string[];
  primaryLanguage: string;
}

const LANG_MAP: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript',
  '.js': 'JavaScript', '.jsx': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript',
  '.java': 'Java', '.kt': 'Kotlin', '.scala': 'Scala',
  '.py': 'Python', '.rb': 'Ruby', '.go': 'Go',
  '.rs': 'Rust', '.cs': 'C#', '.cpp': 'C++', '.c': 'C',
  '.php': 'PHP', '.swift': 'Swift', '.dart': 'Dart',
  '.sql': 'SQL', '.plsql': 'PL/SQL', '.pls': 'PL/SQL', '.pck': 'PL/SQL',
  '.pks': 'PL/SQL', '.pkb': 'PL/SQL', '.prc': 'PL/SQL', '.fnc': 'PL/SQL',
  '.trg': 'PL/SQL', '.pkg': 'PL/SQL',
  '.html': 'HTML', '.css': 'CSS', '.scss': 'SCSS'
};

export function detectStack(rootPath: string, files: ScannedFile[]): StackInfo {
  const langCount: Record<string, number> = {};

  for (const f of files) {
    const lang = LANG_MAP[f.extension];
    if (lang) langCount[lang] = (langCount[lang] ?? 0) + 1;
  }

  const languages = Object.fromEntries(
    Object.entries(langCount).sort((a, b) => b[1] - a[1])
  );

  const primaryLanguage = Object.keys(languages)[0] ?? 'Unknown';
  const frameworks = detectFrameworks(rootPath, files);
  const packageManagers = detectPackageManagers(rootPath);

  return { languages, frameworks, packageManagers, primaryLanguage };
}

function detectFrameworks(rootPath: string, files: ScannedFile[]): string[] {
  const fw: string[] = [];
  const allPaths = new Set(files.map((f) => f.relativePath));

  const hasPkg = (name: string) => {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(rootPath, 'package.json'), 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      return name in deps;
    } catch { return false; }
  };

  if (allPaths.has('package.json')) {
    if (hasPkg('react')) fw.push('React');
    if (hasPkg('vue')) fw.push('Vue');
    if (hasPkg('@angular/core')) fw.push('Angular');
    if (hasPkg('next')) fw.push('Next.js');
    if (hasPkg('nuxt')) fw.push('Nuxt');
    if (hasPkg('express')) fw.push('Express');
    if (hasPkg('fastify')) fw.push('Fastify');
    if (hasPkg('nestjs') || hasPkg('@nestjs/core')) fw.push('NestJS');
    if (hasPkg('electron')) fw.push('Electron');
  }

  if (files.some((f) => f.relativePath.includes('pom.xml') || f.relativePath.endsWith('.java'))) {
    const hasMaven = fs.existsSync(path.join(rootPath, 'pom.xml'));
    const hasGradle = fs.existsSync(path.join(rootPath, 'build.gradle')) || fs.existsSync(path.join(rootPath, 'build.gradle.kts'));
    if (hasMaven) fw.push('Maven');
    if (hasGradle) fw.push('Gradle');
    if (files.some((f) => f.relativePath.includes('Controller') || f.relativePath.includes('Service'))) {
      fw.push('Spring');
    }
  }

  if (files.some((f) => f.relativePath.endsWith('.py'))) {
    if (fs.existsSync(path.join(rootPath, 'requirements.txt'))) fw.push('Python');
    if (files.some((f) => f.relativePath.includes('django'))) fw.push('Django');
    if (files.some((f) => f.relativePath.includes('fastapi') || f.relativePath.includes('flask'))) fw.push('FastAPI/Flask');
  }

  return [...new Set(fw)];
}

function detectPackageManagers(rootPath: string): string[] {
  const managers: string[] = [];
  if (fs.existsSync(path.join(rootPath, 'package-lock.json'))) managers.push('npm');
  if (fs.existsSync(path.join(rootPath, 'yarn.lock'))) managers.push('yarn');
  if (fs.existsSync(path.join(rootPath, 'pnpm-lock.yaml'))) managers.push('pnpm');
  if (fs.existsSync(path.join(rootPath, 'pom.xml'))) managers.push('maven');
  if (fs.existsSync(path.join(rootPath, 'build.gradle'))) managers.push('gradle');
  if (fs.existsSync(path.join(rootPath, 'requirements.txt'))) managers.push('pip');
  if (fs.existsSync(path.join(rootPath, 'Cargo.toml'))) managers.push('cargo');
  if (fs.existsSync(path.join(rootPath, 'go.mod'))) managers.push('go modules');
  return managers;
}
