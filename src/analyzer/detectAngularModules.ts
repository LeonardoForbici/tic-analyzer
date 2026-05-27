import * as fs from 'fs';
import type { ScannedFile } from './scanFiles';

export interface AngularModule {
  name: string;
  file: string;
  line: number;
  declarations: string[];
  imports: string[];
  exports: string[];
  providers: string[];
  lazyRoutes: Array<{ path: string; modulePath: string }>;
}

export interface NgRxItem {
  file: string;
  line: number;
  type: 'action' | 'reducer' | 'effect' | 'selector' | 'store';
  name?: string;
}

const TS_EXTS = new Set(['.ts', '.tsx']);

export function detectAngularModules(files: ScannedFile[]): { modules: AngularModule[]; ngrx: NgRxItem[] } {
  const modules: AngularModule[] = [];
  const ngrx: NgRxItem[] = [];

  for (const file of files) {
    if (!TS_EXTS.has(file.extension)) continue;

    let content: string;
    try { content = fs.readFileSync(file.absolutePath, 'utf8'); }
    catch { continue; }

    if (content.includes('@NgModule')) {
      const mod = parseNgModule(content, file.relativePath);
      if (mod) modules.push(mod);
    }

    const hasNgRx = content.includes('createAction') || content.includes('createReducer') ||
      content.includes('@Effect') || content.includes('createEffect') ||
      content.includes('createSelector') || content.includes('StoreModule');

    if (hasNgRx) {
      ngrx.push(...extractNgRxItems(content, file.relativePath));
    }
  }

  return { modules, ngrx };
}

function parseNgModule(content: string, file: string): AngularModule | null {
  const atIdx = content.indexOf('@NgModule');
  if (atIdx === -1) return null;

  const lineNumber = content.slice(0, atIdx).split('\n').length;

  // Find the opening brace of the decorator object
  const braceStart = content.indexOf('{', atIdx);
  if (braceStart === -1) return null;

  // Walk to the matching closing brace
  let depth = 0;
  let braceEnd = braceStart;
  for (let i = braceStart; i < content.length; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') {
      depth--;
      if (depth === 0) { braceEnd = i; break; }
    }
  }

  const moduleBody = content.slice(braceStart, braceEnd + 1);

  const classMatch = content.slice(atIdx).match(/export\s+class\s+(\w+)/);
  const name = classMatch?.[1] ?? file.split('/').pop()?.replace(/\.ts$/, '') ?? 'UnknownModule';

  const extractArray = (key: string): string[] => {
    const re = new RegExp(`\\b${key}\\s*:\\s*\\[([^\\]]*(?:\\[[^\\]]*\\][^\\]]*)*)\\]`, 's');
    const m = moduleBody.match(re);
    if (!m) return [];
    return m[1]
      .split(',')
      .map((s) => s.replace(/\/\/[^\n]*/g, '').replace(/\s+/g, '').trim())
      .filter((s) => s.length > 0 && /^[A-Z]/.test(s));
  };

  // Lazy routes: loadChildren: () => import('path').then(m => m.Module)
  const lazyRoutes: Array<{ path: string; modulePath: string }> = [];
  const lazyRe = /path\s*:\s*['"`]([^'"`]*)['"`][^}]*?loadChildren\s*:\s*\(\s*\)\s*=>\s*import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/gs;
  let m;
  while ((m = lazyRe.exec(content)) !== null) {
    lazyRoutes.push({ path: m[1], modulePath: m[2] });
  }
  // Old style: loadChildren: 'path#ModuleName'
  const lazyOldRe = /path\s*:\s*['"`]([^'"`]*)['"`][^}]*?loadChildren\s*:\s*['"`]([^'"`]+)['"`]/gs;
  while ((m = lazyOldRe.exec(content)) !== null) {
    if (!lazyRoutes.some((r) => r.path === m![1])) {
      lazyRoutes.push({ path: m[1], modulePath: m[2] });
    }
  }

  return {
    name,
    file,
    line: lineNumber,
    declarations: extractArray('declarations'),
    imports: extractArray('imports'),
    exports: extractArray('exports'),
    providers: extractArray('providers'),
    lazyRoutes,
  };
}

function extractNgRxItems(content: string, file: string): NgRxItem[] {
  const items: NgRxItem[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    const actionMatch = line.match(/(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*createAction\s*\(/);
    if (actionMatch) { items.push({ file, line: lineNum, type: 'action', name: actionMatch[1] }); continue; }

    const reducerMatch = line.match(/(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*createReducer\s*\(/);
    if (reducerMatch) { items.push({ file, line: lineNum, type: 'reducer', name: reducerMatch[1] }); continue; }

    const effectMatch = line.match(/(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*createEffect\s*\(/) ||
      (/@Effect\b/i.test(line) ? line.match(/(\w+)\s*=\s*this/) : null);
    if (effectMatch) { items.push({ file, line: lineNum, type: 'effect', name: effectMatch[1] }); continue; }

    const selectorMatch = line.match(/(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*createSelector\s*\(/);
    if (selectorMatch) { items.push({ file, line: lineNum, type: 'selector', name: selectorMatch[1] }); continue; }

    if (/StoreModule\.(forRoot|forFeature)\b/.test(line)) {
      items.push({ file, line: lineNum, type: 'store' });
    }
  }

  return items;
}

export function formatAngularModulesReport(modules: AngularModule[], ngrx: NgRxItem[]): string {
  if (modules.length === 0 && ngrx.length === 0) return '';

  const lines = ['# Módulos Angular e NgRx / Redux', ''];

  if (modules.length > 0) {
    lines.push(`## @NgModule — ${modules.length} módulo(s)`, '');
    for (const mod of modules) {
      lines.push(`### \`${mod.name}\``);
      lines.push(`*Arquivo: \`${mod.file}:${mod.line}\`*`, '');
      if (mod.declarations.length > 0) lines.push(`**Declarations (${mod.declarations.length}):** ${mod.declarations.slice(0, 10).join(', ')}${mod.declarations.length > 10 ? '...' : ''}`);
      if (mod.imports.length > 0) lines.push(`**Imports (${mod.imports.length}):** ${mod.imports.slice(0, 10).join(', ')}${mod.imports.length > 10 ? '...' : ''}`);
      if (mod.exports.length > 0) lines.push(`**Exports:** ${mod.exports.slice(0, 8).join(', ')}`);
      if (mod.providers.length > 0) lines.push(`**Providers:** ${mod.providers.slice(0, 8).join(', ')}`);
      if (mod.lazyRoutes.length > 0) {
        lines.push(`**Lazy Routes (${mod.lazyRoutes.length}):**`);
        mod.lazyRoutes.forEach((r) => lines.push(`  - \`/${r.path}\` → \`${r.modulePath}\``));
      }
      lines.push('');
    }
  }

  if (ngrx.length > 0) {
    const byType = {
      action: ngrx.filter((n) => n.type === 'action'),
      reducer: ngrx.filter((n) => n.type === 'reducer'),
      effect: ngrx.filter((n) => n.type === 'effect'),
      selector: ngrx.filter((n) => n.type === 'selector'),
      store: ngrx.filter((n) => n.type === 'store'),
    };

    lines.push('## NgRx / Redux Store', '');
    lines.push('| Tipo | Qtd |');
    lines.push('| --- | --- |');
    if (byType.store.length > 0) lines.push(`| StoreModule | ${byType.store.length} |`);
    if (byType.reducer.length > 0) lines.push(`| Reducers | ${byType.reducer.length} |`);
    if (byType.action.length > 0) lines.push(`| Actions | ${byType.action.length} |`);
    if (byType.effect.length > 0) lines.push(`| Effects | ${byType.effect.length} |`);
    if (byType.selector.length > 0) lines.push(`| Selectors | ${byType.selector.length} |`);
    lines.push('');

    // List all actions if not too many
    if (byType.action.length > 0 && byType.action.length <= 30) {
      lines.push('**Actions:**');
      byType.action.forEach((n) => lines.push(`- \`${n.name}\` — \`${n.file}:${n.line}\``));
      lines.push('');
    }

    // List reducers and effects
    if (byType.reducer.length > 0) {
      lines.push('**Reducers:**');
      byType.reducer.forEach((n) => lines.push(`- \`${n.name}\` — \`${n.file}:${n.line}\``));
      lines.push('');
    }

    if (byType.effect.length > 0) {
      lines.push('**Effects:**');
      byType.effect.slice(0, 20).forEach((n) => lines.push(`- \`${n.name ?? '?'}\` — \`${n.file}:${n.line}\``));
      lines.push('');
    }
  }

  return lines.join('\n');
}
