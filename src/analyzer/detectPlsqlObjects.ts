import * as fs from 'fs';
import type { ScannedFile } from './scanFiles';

export type PlsqlObjectType = 'PROCEDURE' | 'FUNCTION' | 'PACKAGE' | 'PACKAGE_BODY' | 'TRIGGER' | 'TYPE';

export interface PlsqlObject {
  type: PlsqlObjectType;
  name: string;
  packageName?: string;   // se pertence a um package
  params?: string;        // assinatura de parâmetros
  returnType?: string;    // para FUNCTIONs
  file: string;
  line: number;
}

export interface PlsqlCall {
  callerObject: string;   // nome da procedure/function que faz a chamada
  calledObject: string;   // nome da procedure/function chamada
  calledPackage?: string;
  file: string;
  line: number;
  isDynamic: boolean;     // EXECUTE IMMEDIATE = true
}

const PLSQL_EXTS = new Set(['.sql', '.plsql', '.pls', '.pck', '.pks', '.pkb', '.prc', '.fnc', '.trg', '.pkg']);

export function detectPlsqlObjects(files: ScannedFile[]): { objects: PlsqlObject[]; calls: PlsqlCall[] } {
  const objects: PlsqlObject[] = [];
  const calls: PlsqlCall[] = [];

  const plsqlFiles = files.filter((f) => PLSQL_EXTS.has(f.extension));

  for (const file of plsqlFiles) {
    let content: string;
    try { content = fs.readFileSync(file.absolutePath, 'utf8'); }
    catch { continue; }

    const lines = content.split('\n');
    let currentPackage: string | undefined;
    let currentObject: string | undefined;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      const upper = line.toUpperCase().trim();

      // CREATE [OR REPLACE] PACKAGE [BODY] nome
      const pkgMatch = line.match(/CREATE\s+(?:OR\s+REPLACE\s+)?PACKAGE\s+(?:(BODY)\s+)?(\w+(?:\.\w+)?)/i);
      if (pkgMatch) {
        const isBody = !!pkgMatch[1];
        currentPackage = pkgMatch[2].toUpperCase();
        objects.push({ type: isBody ? 'PACKAGE_BODY' : 'PACKAGE', name: currentPackage, file: file.relativePath, line: lineNum });
        continue;
      }

      // CREATE [OR REPLACE] PROCEDURE [pkg.]nome [(params)] [AS|IS]
      const procMatch = line.match(/CREATE\s+(?:OR\s+REPLACE\s+)?PROCEDURE\s+((?:\w+\.)?(\w+))\s*(\([^)]*\))?/i);
      if (procMatch) {
        const fullName = procMatch[1].toUpperCase();
        const simpleName = procMatch[2].toUpperCase();
        const pkgPart = fullName.includes('.') ? fullName.split('.')[0] : currentPackage;
        const params = procMatch[3]?.replace(/\s+/g, ' ').slice(0, 100);
        currentObject = simpleName;
        objects.push({ type: 'PROCEDURE', name: simpleName, packageName: pkgPart, params, file: file.relativePath, line: lineNum });
        continue;
      }

      // PROCEDURE nome — dentro de package spec/body (sem CREATE)
      const pkgProcMatch = line.match(/^\s*PROCEDURE\s+(\w+)\s*(\([^)]*\))?/i);
      if (pkgProcMatch && currentPackage && !upper.startsWith('CREATE')) {
        const name = pkgProcMatch[1].toUpperCase();
        const params = pkgProcMatch[2]?.replace(/\s+/g, ' ').slice(0, 100);
        currentObject = name;
        objects.push({ type: 'PROCEDURE', name, packageName: currentPackage, params, file: file.relativePath, line: lineNum });
        continue;
      }

      // CREATE [OR REPLACE] FUNCTION [pkg.]nome [(params)] RETURN tipo
      const funcMatch = line.match(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+((?:\w+\.)?(\w+))\s*(\([^)]*\))?\s*RETURN\s+(\w+)/i);
      if (funcMatch) {
        const simpleName = funcMatch[2].toUpperCase();
        const pkgPart = funcMatch[1].includes('.') ? funcMatch[1].split('.')[0].toUpperCase() : currentPackage;
        const params = funcMatch[3]?.replace(/\s+/g, ' ').slice(0, 100);
        const returnType = funcMatch[4].toUpperCase();
        currentObject = simpleName;
        objects.push({ type: 'FUNCTION', name: simpleName, packageName: pkgPart, params, returnType, file: file.relativePath, line: lineNum });
        continue;
      }

      // FUNCTION nome — dentro de package
      const pkgFuncMatch = line.match(/^\s*FUNCTION\s+(\w+)\s*(\([^)]*\))?\s*RETURN\s+(\w+)/i);
      if (pkgFuncMatch && currentPackage && !upper.startsWith('CREATE')) {
        const name = pkgFuncMatch[1].toUpperCase();
        currentObject = name;
        objects.push({ type: 'FUNCTION', name, packageName: currentPackage, returnType: pkgFuncMatch[3].toUpperCase(), file: file.relativePath, line: lineNum });
        continue;
      }

      // CREATE [OR REPLACE] TRIGGER nome
      const trigMatch = line.match(/CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+(\w+)/i);
      if (trigMatch) {
        const name = trigMatch[1].toUpperCase();
        currentObject = name;
        objects.push({ type: 'TRIGGER', name, file: file.relativePath, line: lineNum });
        continue;
      }

      // Chamadas de procedure dentro de corpo: pkg.proc(...) ou proc(...)
      if (currentObject) {
        // pkg.procedure(args) — 🟢
        const callMatch = line.match(/(?:^|;\s*|THEN\s+|ELSE\s+|BEGIN\s+)(\w+)\.(\w+)\s*(?:\(|;)/i);
        if (callMatch && !upper.includes('CREATE') && !['IF', 'ELSIF', 'WHILE', 'FOR', 'LOOP'].includes(callMatch[1].toUpperCase())) {
          calls.push({ callerObject: currentObject, calledObject: callMatch[2].toUpperCase(), calledPackage: callMatch[1].toUpperCase(), file: file.relativePath, line: lineNum, isDynamic: false });
        }

        // EXECUTE IMMEDIATE — 🟡 SQL dinâmico
        if (/EXECUTE\s+IMMEDIATE/i.test(line)) {
          const dynMatch = line.match(/EXECUTE\s+IMMEDIATE\s+['"](.{0,60})/i);
          calls.push({ callerObject: currentObject, calledObject: dynMatch ? dynMatch[1].slice(0, 40) : 'DYNAMIC_SQL', file: file.relativePath, line: lineNum, isDynamic: true });
        }
      }

      // Resetar currentObject no END;
      if (/^\s*END\s*;/i.test(line) || /^\s*END\s+\w+\s*;/i.test(line)) {
        currentObject = undefined;
      }
    }
  }

  return { objects, calls };
}
