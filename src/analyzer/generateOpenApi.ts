import * as fs from 'fs';
import * as path from 'path';
import type { EndpointFound } from './detectEndpoints';
import type { StackInfo } from './detectStack';

export function generateOpenApi(outputDir: string, endpoints: EndpointFound[], stack: StackInfo): void {
  if (endpoints.length === 0) return;

  const lines: string[] = [
    'openapi: "3.0.3"',
    'info:',
    `  title: "${stack.primaryLanguage} API — TIC Analyzer"`,
    '  version: "0.0.0"',
    `  description: "🟡 Gerado automaticamente por análise estática. Sem corpo de request/response (não detectado)."`,
    'paths:'
  ];

  // Agrupar por path
  const byPath = new Map<string, EndpointFound[]>();
  for (const ep of endpoints) {
    const arr = byPath.get(ep.path) ?? [];
    arr.push(ep);
    byPath.set(ep.path, arr);
  }

  for (const [routePath, eps] of byPath) {
    // Converter {param} do Spring para OpenAPI (já é compatível), :param do Express para {param}
    const openApiPath = routePath.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '{$1}');
    lines.push(`  "${openApiPath}":`);

    for (const ep of eps) {
      const method = ep.method.toLowerCase();
      lines.push(`    ${method}:`);
      lines.push(`      tags:`);
      lines.push(`        - "${ep.file.split('/')[0] ?? 'default'}"`);
      lines.push(`      summary: "🟡 ${ep.method} ${ep.path}"`);
      lines.push(`      description: "Detectado em ${ep.file}:${ep.line}"`);
      lines.push(`      operationId: "${sanitizeId(ep.method + '_' + routePath)}"`);

      // Path params
      const params = [...routePath.matchAll(/\{([^}]+)\}|:([a-zA-Z_][a-zA-Z0-9_]*)/g)];
      if (params.length > 0) {
        lines.push('      parameters:');
        for (const p of params) {
          const name = p[1] ?? p[2];
          lines.push(`        - name: "${name}"`);
          lines.push('          in: path');
          lines.push('          required: true');
          lines.push('          schema:');
          lines.push('            type: string');
      }
      }

      lines.push('      responses:');
      lines.push('        "200":');
      lines.push(`          description: "🟡 Resposta não mapeada estaticamente"`);
    }
  }

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'openapi.yaml'), lines.join('\n'), 'utf8');
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').toLowerCase();
}
