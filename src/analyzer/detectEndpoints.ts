import * as fs from 'fs';
import type { ScannedFile } from './scanFiles';

export interface EndpointFound {
  method: string;
  path: string;
  file: string;
  line: number;
  controller?: string;
}

/**
 * Detecta endpoints REST em qualquer backend Java (Spring, JAX-RS/Jakarta,
 * Micronaut, servlets) e em TypeScript/JS (Express/NestJS/Fastify) e Python
 * (FastAPI/Flask). Combina o base path declarado na classe (`@RequestMapping`,
 * `@Path`, `@WebServlet`) com o path de cada método.
 */
export function detectEndpoints(files: ScannedFile[]): EndpointFound[] {
  const endpoints: EndpointFound[] = [];

  // Anotações REST que marcam um arquivo como portador de endpoints, mesmo que
  // o nome do arquivo não contenha controller/route/handler/resource.
  const REST_HINT = /@(RestController|Controller|RequestMapping|Path|GetMapping|PostMapping|PutMapping|PatchMapping|DeleteMapping|WebServlet|Get|Post|Put|Patch|Delete)\b/;

  const codeFiles = files.filter((f) => {
    if (!['.java', '.kt', '.ts', '.js', '.py'].includes(f.extension)) return false;
    const p = f.relativePath.toLowerCase();
    if (p.includes('controller') || p.includes('route') || p.includes('router') ||
        p.includes('handler') || p.includes('resource') || p.includes('endpoint') ||
        p.includes('api') || p.includes('servlet') || p.includes('web')) return true;
    // Caso contrário, inspeciona o conteúdo por anotações REST (Java/Kotlin).
    if (f.extension === '.java' || f.extension === '.kt') {
      try { return REST_HINT.test(fs.readFileSync(f.absolutePath, 'utf8')); }
      catch { return false; }
    }
    return false;
  });

  for (const file of codeFiles) {
    let content: string;
    try { content = fs.readFileSync(file.absolutePath, 'utf8'); }
    catch { continue; }

    const isJava = file.extension === '.java' || file.extension === '.kt';
    if (isJava) collectJavaEndpoints(content, file.relativePath, endpoints);
    else collectScriptEndpoints(content, file.relativePath, endpoints);
  }

  return endpoints.slice(0, 400); // limita para não explodir o contexto
}

function joinPaths(base: string, sub: string): string {
  const b = (base || '').replace(/\/+$/, '');
  let s = sub || '';
  if (s && !s.startsWith('/')) s = '/' + s;
  const joined = (b + s).replace(/\/{2,}/g, '/').replace(/\*+$/, '');
  return joined || '/';
}

/** Varredura stateful de Java/Kotlin: combina base path da classe + método. */
function collectJavaEndpoints(content: string, file: string, out: EndpointFound[]): void {
  const lines = content.split('\n');
  let classBase = ''; // base path da classe atual (@RequestMapping/@Path/@WebServlet)
  let pendingBase = ''; // anotação de mapping lida antes de saber se é classe ou método

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const lineNum = idx + 1;

    // base path em anotações de nível de classe
    const reqMap = line.match(/@RequestMapping\s*\(\s*(?:(?:value|path)\s*=\s*)?["']([^"']+)["']/i);
    const jaxPath = line.match(/@Path\s*\(\s*["']([^"']+)["']/i);
    const servlet = line.match(/@WebServlet\s*\(\s*(?:(?:value|urlPatterns)\s*=\s*)?\{?\s*["']([^"']+)["']/i);
    const mappingHere = reqMap?.[1] ?? jaxPath?.[1] ?? servlet?.[1];

    // declaração de classe → fixa o base path acumulado
    if (/\b(class|interface)\s+\w+/.test(line)) {
      classBase = pendingBase;
      pendingBase = '';
    }

    // Spring method-level: @GetMapping("/x"), @PostMapping(value="/x")
    const springM = line.match(/@(Get|Post|Put|Patch|Delete|Request)Mapping\s*\(\s*(?:(?:value|path)\s*=\s*)?["']([^"']+)["']/i);
    if (springM) {
      const method = springM[1].toUpperCase() === 'REQUEST' ? 'ANY' : springM[1].toUpperCase();
      out.push({ method, path: joinPaths(classBase, springM[2]), file, line: lineNum });
      continue;
    }
    // Spring sem path: @GetMapping → usa só o base da classe
    const springBare = line.match(/@(Get|Post|Put|Patch|Delete)Mapping\b\s*(?:\(\s*\))?\s*$/i);
    if (springBare && classBase) {
      out.push({ method: springBare[1].toUpperCase(), path: classBase, file, line: lineNum });
      continue;
    }

    // JAX-RS / Micronaut method-level: @GET @Path("/x") or @Get("/x")
    const jaxMethod = line.match(/@(GET|POST|PUT|PATCH|DELETE|HEAD)\b/);
    if (jaxMethod) {
      // procura @Path na mesma linha ou nas próximas 2 linhas
      let sub = '';
      for (let k = 0; k <= 2 && idx + k < lines.length; k++) {
        const pm = lines[idx + k].match(/@Path\s*\(\s*["']([^"']+)["']/i);
        if (pm) { sub = pm[1]; break; }
      }
      out.push({ method: jaxMethod[1].toUpperCase(), path: joinPaths(classBase, sub), file, line: lineNum });
      continue;
    }
    // Micronaut: @Get("/x"), @Post("/x")
    const micronaut = line.match(/@(Get|Post|Put|Patch|Delete)\s*\(\s*(?:(?:value|uri)\s*=\s*)?["']([^"']+)["']/);
    if (micronaut) {
      out.push({ method: micronaut[1].toUpperCase(), path: joinPaths(classBase, micronaut[2]), file, line: lineNum });
      continue;
    }
    // Servlet: doGet/doPost/doPut/doDelete → usa o urlPattern da classe
    const servletM = line.match(/\b(?:protected|public)\s+void\s+do(Get|Post|Put|Delete)\s*\(/);
    if (servletM && classBase) {
      out.push({ method: servletM[1].toUpperCase(), path: classBase, file, line: lineNum });
      continue;
    }

    // acumula mapping de classe lido antes da declaração `class`
    if (mappingHere && !springM) pendingBase = joinPaths('', mappingHere);
  }
}

/** Express/NestJS/Fastify/FastAPI/Flask. */
function collectScriptEndpoints(content: string, file: string, out: EndpointFound[]): void {
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    const lineNum = idx + 1;

    const expressMatch = line.match(/\.(get|post|put|patch|delete|head)\s*\(\s*['"`]([^'"`]+)['"`]/i);
    if (expressMatch) {
      out.push({ method: expressMatch[1].toUpperCase(), path: expressMatch[2], file, line: lineNum });
      return;
    }
    const nestMatch = line.match(/@(Get|Post|Put|Patch|Delete)\s*\(\s*['"`]?([^'"`\)]*?)['"`]?\s*\)/i);
    if (nestMatch) {
      out.push({ method: nestMatch[1].toUpperCase(), path: nestMatch[2] || '/', file, line: lineNum });
      return;
    }
    const fastApiMatch = line.match(/@\w+\.(get|post|put|patch|delete|route)\s*\(\s*['"]([^'"]+)['"]/i);
    if (fastApiMatch) {
      out.push({ method: fastApiMatch[1].toUpperCase(), path: fastApiMatch[2], file, line: lineNum });
    }
  });
}
