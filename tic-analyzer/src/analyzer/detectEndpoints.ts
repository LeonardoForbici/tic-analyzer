import * as fs from 'fs';
import type { ScannedFile } from './scanFiles';

export interface EndpointFound {
  method: string;
  path: string;
  file: string;
  line: number;
  controller?: string;
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

/** Detecta endpoints REST em arquivos Java/Spring, TypeScript (Express/NestJS/Fastify) */
export function detectEndpoints(files: ScannedFile[]): EndpointFound[] {
  const endpoints: EndpointFound[] = [];
  const codeFiles = files.filter((f) =>
    ['.java', '.kt', '.ts', '.js', '.py'].includes(f.extension) &&
    (f.relativePath.toLowerCase().includes('controller') ||
     f.relativePath.toLowerCase().includes('route') ||
     f.relativePath.toLowerCase().includes('router') ||
     f.relativePath.toLowerCase().includes('handler') ||
     f.relativePath.toLowerCase().includes('resource'))
  );

  for (const file of codeFiles) {
    let content: string;
    try { content = fs.readFileSync(file.absolutePath, 'utf8'); }
    catch { continue; }

    const lines = content.split('\n');

    lines.forEach((line, idx) => {
      const lineNum = idx + 1;

      // Java/Spring: @GetMapping, @PostMapping, @RequestMapping
      const springMatch = line.match(/@(Get|Post|Put|Patch|Delete|Request)Mapping\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/i);
      if (springMatch) {
        const method = springMatch[1].toUpperCase() === 'REQUEST' ? 'ANY' : springMatch[1].toUpperCase();
        endpoints.push({ method, path: springMatch[2], file: file.relativePath, line: lineNum });
        return;
      }

      // TypeScript/Express: router.get('/path', ...) or app.post('/path', ...)
      const expressMatch = line.match(/\.(get|post|put|patch|delete|head)\s*\(\s*['"`]([^'"`]+)['"`]/i);
      if (expressMatch) {
        endpoints.push({
          method: expressMatch[1].toUpperCase(),
          path: expressMatch[2],
          file: file.relativePath,
          line: lineNum
        });
        return;
      }

      // NestJS: @Get(), @Post() etc decorators
      const nestMatch = line.match(/@(Get|Post|Put|Patch|Delete)\s*\(\s*['"`]?([^'"`\)]*?)['"`]?\s*\)/i);
      if (nestMatch) {
        endpoints.push({
          method: nestMatch[1].toUpperCase(),
          path: nestMatch[2] || '/',
          file: file.relativePath,
          line: lineNum
        });
        return;
      }

      // FastAPI/Flask: @app.route, @router.get
      const fastApiMatch = line.match(/@\w+\.(get|post|put|patch|delete|route)\s*\(\s*['"]([^'"]+)['"]/i);
      if (fastApiMatch) {
        endpoints.push({
          method: fastApiMatch[1].toUpperCase(),
          path: fastApiMatch[2],
          file: file.relativePath,
          line: lineNum
        });
      }
    });
  }

  return endpoints.slice(0, 200); // limita para não explodir o contexto
}
