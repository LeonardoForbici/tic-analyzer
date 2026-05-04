/**
 * Copia assets do Reversa (agents/docs/templates) para .tic-code/reversa/
 * Nunca sobrescreve arquivos existentes customizados pelo usuário.
 * Créditos: Reversa by Sandeco — MIT License (adapted)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { getReversaResourcesBase, REVERSA_DIR, toWorkspaceUri } from './embeddedReversaPaths';

/** Copia os assets essenciais do Reversa para .tic-code/reversa/_agents/ e _docs/ */
export async function copyEmbeddedReversa(
  root: vscode.WorkspaceFolder,
  extensionUri: vscode.Uri
): Promise<string[]> {
  const base = getReversaResourcesBase(extensionUri);
  const copied: string[] = [];

  // Copiar manifest
  const manifestSrc = path.join(base, 'lib', 'manifest.json');
  if (fs.existsSync(manifestSrc)) {
    const dst = toWorkspaceUri(root, `${REVERSA_DIR}/_config/manifest.json`);
    await ensureDir(vscode.Uri.joinPath(dst, '..'));
    if (!(await exists(dst))) {
      await vscode.workspace.fs.writeFile(dst, fs.readFileSync(manifestSrc));
      copied.push(dst.fsPath);
    }
  }

  // Copiar SDD template
  const sddTemplateSrc = path.join(base, 'templates', 'sdd-template.md');
  if (fs.existsSync(sddTemplateSrc)) {
    const dst = toWorkspaceUri(root, `${REVERSA_DIR}/_config/sdd-template.md`);
    await ensureDir(vscode.Uri.joinPath(dst, '..'));
    if (!(await exists(dst))) {
      await vscode.workspace.fs.writeFile(dst, fs.readFileSync(sddTemplateSrc));
      copied.push(dst.fsPath);
    }
  }

  return copied;
}

/** Cria pasta e todos os pais se necessário */
async function ensureDir(uri: vscode.Uri): Promise<void> {
  await vscode.workspace.fs.createDirectory(uri);
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}
