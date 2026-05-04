import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export function checkExistingInstallation(projectRoot) {
  const statePath = join(projectRoot, '.reversa', 'state.json');

  if (!existsSync(statePath)) {
    return { installed: false };
  }

  try {
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    return { installed: true, version: state.version ?? '?', state };
  } catch {
    return { installed: false };
  }
}

export function checkFileConflict(filePath) {
  return existsSync(filePath);
}
