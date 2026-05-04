/**
 * Gerador de domínio candidato para Programação Reversa
 * Inspiração: Detective do Reversa by Sandeco (MIT)
 *
 * Domínios são inferidos a partir de:
 * - Nomes de DIRETÓRIOS (não de arquivos individuais)
 * - Nomes de entidades, tabelas, packages PL/SQL
 * - Classes de domínio Java
 * Nunca de substrings aleatórias de nomes de arquivo.
 */

import type { ReverseEngineeringInput, DomainCandidate } from './reverseEngineeringTypes';

/**
 * Mapeamento de pasta → domínio para VS Code Extensions / TypeScript.
 * Se o projeto usa essa estrutura, inferimos domínios confiáveis.
 */
const FOLDER_DOMAIN_MAP: Record<string, string> = {
  scanner: 'Scanner',
  'local-ai': 'IA Local',
  'reversa-adapter': 'Reversa Adapter',
  webview: 'WebView',
  commands: 'Comandos',
  exporters: 'Exportadores',
  'reverse-engineering': 'Programação Reversa',
  reverseengineering: 'Programação Reversa',
  utils: 'Utilitários',
  types: 'Tipos Centrais'
};

/**
 * Palavras-chave de domínio de negócio com correspondência EXATA de palavra.
 * Somente incluídas se forem nomes de pasta / classe / entidade — não substrings.
 */
const BUSINESS_DOMAIN_KEYWORDS = [
  'financeiro', 'fiscal', 'estoque', 'venda', 'compra', 'pedido', 'fatura',
  'boleto', 'pagamento', 'receber', 'pagar', 'nota', 'nfe', 'sped',
  'usuario', 'cliente', 'fornecedor', 'produto', 'servico', 'contrato',
  'projeto', 'tarefa', 'sprint', 'kanban', 'chamado', 'ticket',
  'order', 'invoice', 'payment', 'receipt', 'billing',
  'user', 'account', 'customer', 'product', 'service',
  'notification', 'message', 'event', 'audit',
  'auth', 'login', 'acesso'
];

export function generateDomain(input: ReverseEngineeringInput): DomainCandidate[] {
  const { scan, inventory } = input;
  const domainMap = new Map<string, { evidence: string[]; entities: string[]; confidence: 'confirmado' | 'inferido' }>();

  // ── 1. Detectar domínios por pasta (TS/JS/Java) — preferida ───────────────
  const dirCounts = new Map<string, string[]>();
  for (const file of scan.files) {
    const parts = file.relativePath.replace(/\\/g, '/').split('/');
    // Pegar os nomes de PASTA, não o arquivo final
    for (let i = 0; i < parts.length - 1; i++) {
      const dir = parts[i].toLowerCase();
      const list = dirCounts.get(dir) ?? [];
      list.push(file.relativePath);
      dirCounts.set(dir, list);
    }
  }

  // Mapear pastas para domínios conhecidos
  for (const [dir, files] of dirCounts.entries()) {
    const mapped = FOLDER_DOMAIN_MAP[dir];
    if (mapped) {
      const entry = domainMap.get(mapped) ?? { evidence: [], entities: [], confidence: 'confirmado' };
      for (const f of files.slice(0, 5)) {
        if (!entry.evidence.includes(f)) entry.evidence.push(f);
      }
      domainMap.set(mapped, entry);
    }

    // Palavras de negócio só em nomes de DIRETÓRIO (não arquivo)
    for (const keyword of BUSINESS_DOMAIN_KEYWORDS) {
      if (dir === keyword || dir.startsWith(keyword + '-') || dir.endsWith('-' + keyword)) {
        const entry = domainMap.get(keyword) ?? { evidence: [], entities: [], confidence: 'inferido' };
        for (const f of files.slice(0, 3)) {
          if (!entry.evidence.includes(f)) entry.evidence.push(f);
        }
        domainMap.set(keyword, entry);
      }
    }
  }

  // ── 2. Pacotes Java — caminhos de pacote têm semântica de domínio forte ───
  for (const file of inventory.javaSpring.files) {
    const pathParts = file.path.replace(/\\/g, '/').split('/');
    for (const part of pathParts.slice(0, -1)) { // pastas apenas
      const lower = part.toLowerCase();
      const mapped = FOLDER_DOMAIN_MAP[lower];
      if (mapped) {
        const entry = domainMap.get(mapped) ?? { evidence: [], entities: [], confidence: 'confirmado' };
        if (!entry.evidence.includes(file.path)) entry.evidence.push(file.path);
        if (file.className && !entry.entities.includes(file.className)) entry.entities.push(file.className);
        domainMap.set(mapped, entry);
      } else {
        for (const keyword of BUSINESS_DOMAIN_KEYWORDS) {
          if (lower === keyword || lower.startsWith(keyword)) {
            const entry = domainMap.get(keyword) ?? { evidence: [], entities: [], confidence: 'confirmado' };
            if (!entry.evidence.includes(file.path)) entry.evidence.push(file.path);
            if (file.className && !entry.entities.includes(file.className)) entry.entities.push(file.className);
            domainMap.set(keyword, entry);
          }
        }
      }
    }
  }

  // ── 3. Entidades PL/SQL: nome exato de tabela/procedure/package ───────────
  for (const entity of inventory.plsql.entities) {
    const name = entity.name.toLowerCase();
    for (const keyword of BUSINESS_DOMAIN_KEYWORDS) {
      if (name === keyword || name.startsWith(keyword + '_') || name.endsWith('_' + keyword)) {
        const label = keyword.charAt(0).toUpperCase() + keyword.slice(1);
        const entry = domainMap.get(label) ?? { evidence: [], entities: [], confidence: 'confirmado' };
        if (!entry.evidence.includes(entity.file)) entry.evidence.push(entity.file);
        if (!entry.entities.includes(entity.name)) entry.entities.push(entity.name);
        domainMap.set(label, entry);
      }
    }
  }

  // ── 4. Tabelas PL/SQL ─────────────────────────────────────────────────────
  for (const table of inventory.plsql.tableReferences) {
    const name = table.name.toLowerCase();
    for (const keyword of BUSINESS_DOMAIN_KEYWORDS) {
      if (name.startsWith(keyword + '_') || name === keyword) {
        const label = keyword.charAt(0).toUpperCase() + keyword.slice(1);
        const entry = domainMap.get(label) ?? { evidence: [], entities: [], confidence: 'confirmado' };
        if (!entry.entities.includes(table.name)) entry.entities.push(table.name);
        domainMap.set(label, entry);
      }
    }
  }

  // ── Montar candidatos finais ───────────────────────────────────────────────
  const candidates: DomainCandidate[] = [];
  for (const [name, { evidence, entities, confidence }] of domainMap.entries()) {
    if (evidence.length === 0 && entities.length === 0) continue;
    candidates.push({
      name,
      evidence: [...new Set(evidence)].slice(0, 5),
      entities: [...new Set(entities)].slice(0, 10),
      confidence: evidence.length >= 2 ? confidence : 'inferido'
    });
  }

  return candidates
    .sort((a, b) => b.evidence.length - a.evidence.length)
    .slice(0, 25);
}

export function renderDomainMd(domains: DomainCandidate[], projectName: string): string {
  const lines: string[] = [];
  lines.push(`# Domínio: ${projectName}`);
  lines.push('');
  lines.push('> Candidatos de domínio inferidos a partir de nomes de **diretórios**, classes, entidades e tabelas.');
  lines.push('> Gerado por TIC Coder Lite — Modo Lite.');
  lines.push('> Inspiração metodológica: Detective do Reversa by Sandeco (MIT).');
  lines.push('');
  lines.push('## ⚠️ Atenção');
  lines.push('');
  lines.push('Estes são **candidatos** de domínio. 🟡 INFERIDO não é verdade confirmada.');
  lines.push('Valide com o especialista de negócios ou com o código-fonte real.');
  lines.push('');
  lines.push('> ℹ️ Domínios são detectados por pasta e nome de entidade — não por substring de nome de arquivo.');
  lines.push('');

  if (domains.length === 0) {
    lines.push('- Nenhum candidato de domínio detectado 🔴 LACUNA');
    lines.push('');
    lines.push('**Pergunta:** Quais são os domínios de negócio deste sistema?');
    return lines.join('\n');
  }

  for (const domain of domains) {
    const badge = domain.confidence === 'confirmado' ? '🟢 CONFIRMADO' : '🟡 INFERIDO';
    lines.push(`## ${domain.name} ${badge}`);
    lines.push('');
    if (domain.entities.length > 0) {
      lines.push(`Artefatos detectados: ${domain.entities.slice(0, 5).join(', ')}`);
      lines.push('');
    }
    if (domain.evidence.length > 0) {
      lines.push('Evidências (arquivos):');
      for (const ev of domain.evidence.slice(0, 3)) {
        lines.push(`- ${ev}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
