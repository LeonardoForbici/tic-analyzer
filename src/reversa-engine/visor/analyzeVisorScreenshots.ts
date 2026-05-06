import * as fs from 'fs';
import * as path from 'path';

export interface VisorShot { fileName: string; width?: number; height?: number; probableScreen: string; description: string; }

export function analyzeVisorScreenshots(files: string[]): VisorShot[] {
  return files.map((f) => {
    const fileName = path.basename(f);
    let width: number | undefined; let height: number | undefined;
    try {
      const s = fs.statSync(f);
      width = s.size > 0 ? undefined : undefined;
    } catch {}
    return { fileName, width, height, probableScreen: fileName.replace(/[_-]+/g, ' ').replace(/\.[^.]+$/, ''), description: '🔴 LACUNA: sem OCR/metadados suficientes para descrição automática confiável.' };
  });
}
