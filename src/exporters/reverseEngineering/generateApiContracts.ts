/**
 * Gerador de contratos de API para Programação Reversa
 * Inspiração: Writer / Architect do Reversa by Sandeco (MIT)
 */

import type { ReverseEngineeringInput, ApiContract } from './reverseEngineeringTypes';

export function generateApiContracts(input: ReverseEngineeringInput): ApiContract[] {
  const { inventory } = input;
  const contracts: ApiContract[] = [];

  // Extrair de controllers Java/Spring
  for (const file of inventory.javaSpring.files) {
    if (file.kind !== 'controller') continue;

    for (const endpoint of file.endpoints) {
      const [method, ...pathParts] = endpoint.split(' ');
      const path = pathParts.join(' ') || '/';
      const risks: string[] = [];

      if (!file.annotations.some((a) => ['PreAuthorize', 'Secured'].includes(a))) {
        risks.push('Sem controle de acesso detectado 🔴 LACUNA');
      }

      contracts.push({
        method: method ?? 'GET',
        path,
        controller: file.className,
        requestDto: inferRequestDto(file.className, endpoint),
        responseDto: inferResponseDto(file.className, endpoint),
        service: inferService(file.className),
        risks,
        confidence: 'confirmado'
      });
    }
  }

  // Extrair de routes TypeScript (Express/NestJS/Next)
  const tsServices = inventory.typeScript.sourceFiles.services;
  for (const serviceFile of tsServices) {
    const serviceName = serviceFile.split('/').pop()?.replace(/\.(ts|js)$/, '') ?? serviceFile;
    contracts.push({
      method: 'GET|POST',
      path: `/${toCamelCase(serviceName.replace(/service/i, '').replace(/\./g, ''))}`,
      controller: serviceName,
      service: serviceName,
      risks: ['Contrato não completamente inferível 🔴 LACUNA'],
      confidence: 'inferido'
    });
  }

  return contracts.slice(0, 50);
}

export function renderApiContractsMd(contracts: ApiContract[], projectName: string): string {
  const lines: string[] = [];
  lines.push(`# Contratos de API: ${projectName}`);
  lines.push('');
  lines.push('> Gerado por TIC Coder Lite — Modo Lite.');
  lines.push('> Inspiração metodológica: Architect / Writer do Reversa by Sandeco (MIT).');
  lines.push('');

  const confirmed = contracts.filter((c) => c.confidence === 'confirmado');
  const inferred = contracts.filter((c) => c.confidence !== 'confirmado');

  if (contracts.length === 0) {
    lines.push('- Nenhum contrato de API detectado 🔴 LACUNA');
    lines.push('');
    lines.push('**Perguntas:**');
    lines.push('- Quais são os endpoints públicos desta API?');
    lines.push('- Existe documentação OpenAPI/Swagger?');
    return lines.join('\n');
  }

  if (confirmed.length > 0) {
    lines.push('## Endpoints Confirmados 🟢 CONFIRMADO');
    lines.push('');
    lines.push('| Método | Path | Controller | DTO Request | DTO Response | Riscos |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const c of confirmed) {
      lines.push(`| ${c.method} | ${c.path} | ${c.controller} | ${c.requestDto ?? '-'} | ${c.responseDto ?? '-'} | ${c.risks.join('; ') || '-'} |`);
    }
    lines.push('');
  }

  if (inferred.length > 0) {
    lines.push('## Endpoints Inferidos 🟡 INFERIDO');
    lines.push('');
    lines.push('| Método | Path | Controller/Service | Riscos |');
    lines.push('| --- | --- | --- | --- |');
    for (const c of inferred) {
      lines.push(`| ${c.method} | ${c.path} | ${c.controller} | ${c.risks.join('; ') || '-'} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function inferRequestDto(className: string, endpoint: string): string | undefined {
  if (/POST|PUT|PATCH/.test(endpoint.split(' ')[0] ?? '')) {
    const base = className.replace(/Controller$/, '');
    return `${base}Request (🟡 INFERIDO)`;
  }
  return undefined;
}

function inferResponseDto(className: string, _endpoint: string): string | undefined {
  const base = className.replace(/Controller$/, '');
  return `${base}Response (🟡 INFERIDO)`;
}

function inferService(className: string): string {
  return className.replace(/Controller$/, 'Service');
}

function toCamelCase(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
