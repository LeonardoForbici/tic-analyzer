/**
 * Tabela global de símbolos construída a partir dos `FileSymbols` de todos os
 * arquivos. Indexa tipos por FQN (Java) e por nome simples, e pré-computa o mapa
 * interface→implementadores (chave para resolver chamadas via DI/interface).
 */
import type { FileSymbols, TypeDeclSym } from './extractSymbols';

export interface TypeEntry {
  file: string;
  fqn: string;
  decl: TypeDeclSym;
}

export class SymbolTable {
  /** FQN Java (`pacote.Tipo`) → entrada. */
  readonly byFqn = new Map<string, TypeEntry>();
  /** Nome simples → FQNs (pode haver homônimos em pacotes diferentes). */
  readonly bySimpleName = new Map<string, string[]>();
  /** FQN da interface → FQNs dos implementadores. */
  readonly implementorsByInterface = new Map<string, string[]>();
  /** Arquivos analisados, por relativePath. */
  readonly files = new Map<string, FileSymbols>();

  static build(allSymbols: FileSymbols[]): SymbolTable {
    const table = new SymbolTable();
    for (const fs of allSymbols) {
      table.files.set(fs.file, fs);
      if (fs.lang !== 'java') continue;
      for (const decl of fs.types) {
        const fqn = fs.packageName ? `${fs.packageName}.${decl.simpleName}` : decl.simpleName;
        table.byFqn.set(fqn, { file: fs.file, fqn, decl });
        const list = table.bySimpleName.get(decl.simpleName) ?? [];
        list.push(fqn);
        table.bySimpleName.set(decl.simpleName, list);
      }
    }
    table.computeImplementors();
    return table;
  }

  private computeImplementors(): void {
    for (const entry of this.byFqn.values()) {
      const { decl } = entry;
      const parents = [...decl.implementsNames, ...(decl.extendsName ? [decl.extendsName] : [])];
      for (const parentSimple of parents) {
        for (const parentFqn of this.bySimpleName.get(parentSimple) ?? []) {
          const target = this.byFqn.get(parentFqn);
          if (!target || (target.decl.kind !== 'interface' && !target.decl.isAbstract)) continue;
          const list = this.implementorsByInterface.get(parentFqn) ?? [];
          list.push(entry.fqn);
          this.implementorsByInterface.set(parentFqn, list);
        }
      }
    }
  }

  /**
   * Resolve um nome simples de tipo para FQNs candidatos, no contexto de um
   * arquivo (usando imports explícitos e mesmo pacote antes do índice global).
   */
  resolveTypeName(simpleName: string, fromFile: FileSymbols): string[] {
    // 1. import explícito que termina no nome simples
    for (const imp of fromFile.imports) {
      if (imp.isWildcard) continue;
      const last = imp.source.split('.').pop();
      if (last === simpleName && this.byFqn.has(imp.source)) return [imp.source];
    }
    // 2. mesmo pacote
    if (fromFile.packageName) {
      const samePkg = `${fromFile.packageName}.${simpleName}`;
      if (this.byFqn.has(samePkg)) return [samePkg];
    }
    // 3. import wildcard `a.b.*` cujo pacote contém o tipo `a.b.SimpleName`
    for (const imp of fromFile.imports) {
      if (!imp.isWildcard) continue;
      const pkg = imp.source.replace(/\.\*$/, '');
      const fqn = `${pkg}.${simpleName}`;
      if (this.byFqn.has(fqn)) return [fqn];
    }
    // 4. índice global por nome simples
    return this.bySimpleName.get(simpleName) ?? [];
  }
}
