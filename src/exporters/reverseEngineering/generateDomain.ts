/**
 * Gerador de domínio candidato para Programação Reversa
 * Inspiração: Detective do Reversa by Sandeco (MIT)
 */

import type { ReverseEngineeringInput, DomainCandidate } from './reverseEngineeringTypes';

/** Palavras-chave de domínio típicas em sistemas empresariais */
const DOMAIN_KEYWORDS = [
  'financeiro', 'fiscal', 'estoque', 'venda', 'compra', 'pedido', 'fatura',
  'boleto', 'pagamento', 'receber', 'pagar', 'nota', 'nfe', 'sped',
  'usuario', 'cliente', 'fornecedor', 'produto', 'servico', 'contrato',
  'projeto', 'tarefa', 'sprint', 'kanban', 'chamado', 'ticket',
  'relatorio', 'dashboard', 'bi', 'analytics', 'metrica',
  'auth', 'login', 'permissao', 'role', 'perfil', 'acesso',
  'email', 'notificacao', 'mensagem', 'chat', 'log', 'audit',
  'order', 'invoice', 'payment', 'receipt', 'billing',
  'user', 'account', 'customer', 'product', 'service',
  'report', 'dashboard', 'metric', 'analytics',
  'auth', 'permission', 'role', 'profile',
  'notification', 'message', 'event', 'audit'
];

export function generateDomain(input: ReverseEngineeringInput): DomainCandidate[] {
  const { scan, inventory } = input;
  const domainMap = new Map<string, { evidence: string[]; entities: string[] }>();

  // Extrair candidatos de pacotes Java (com.empresa.dominio)
  for (const file of inventory.javaSpring.files) {
    const pathParts = file.path.split('/');
    for (const part of pathParts) {
      const keyword = matchesDomainKeyword(part);
      if (keyword) {
        const entry = domainMap.get(keyword) ?? { evidence: [], entities: [] };
        entry.evidence.push(file.path);
        entry.entities.push(file.className);
        domainMap.set(keyword, entry);
      }
    }
  }

  // Extrair candidatos de caminhos de arquivos TS/JS
  const tsFiles = scan.files.filter((f) => ['.ts', '.tsx', '.js', '.jsx'].includes(f.extension));
  for (const file of tsFiles) {
    const parts = file.relativePath.split('/');
    for (const part of parts) {
      const keyword = matchesDomainKeyword(part);
      if (keyword) {
        const entry = domainMap.get(keyword) ?? { evidence: [], entities: [] };
        if (!entry.evidence.includes(file.relativePath)) {
          entry.evidence.push(file.relativePath);
        }
        domainMap.set(keyword, entry);
      }
    }
  }

  // Extrair de entidades PL/SQL
  for (const entity of inventory.plsql.entities) {
    const keyword = matchesDomainKeyword(entity.name);
    if (keyword) {
      const entry = domainMap.get(keyword) ?? { evidence: [], entities: [] };
      entry.evidence.push(entity.file);
      entry.entities.push(entity.name);
      domainMap.set(keyword, entry);
    }
  }

  // Tabelas PL/SQL
  for (const table of inventory.plsql.tableReferences) {
    const keyword = matchesDomainKeyword(table.name);
    if (keyword) {
      const entry = domainMap.get(keyword) ?? { evidence: [], entities: [] };
      entry.entities.push(table.name);
      domainMap.set(keyword, entry);
    }
  }

  const candidates: DomainCandidate[] = [];
  for (const [name, { evidence, entities }] of domainMap.entries()) {
    if (evidence.length === 0 && entities.length === 0) continue;
    candidates.push({
      name,
      evidence: [...new Set(evidence)].slice(0, 5),
      entities: [...new Set(entities)].slice(0, 10),
      confidence: evidence.length > 2 ? 'confirmado' : 'inferido'
    });
  }

  return candidates.sort((a, b) => b.evidence.length - a.evidence.length).slice(0, 20);
}

export function renderDomainMd(domains: DomainCandidate[], projectName: string): string {
  const lines: string[] = [];
  lines.push(`# Domínio: ${projectName}`);
  lines.push('');
  lines.push('> Candidatos de domínio inferidos a partir de nomes de pacotes, classes, entidades, tabelas e caminhos.');
  lines.push('> Gerado por TIC Coder Lite — Modo Lite.');
  lines.push('> Inspiração metodológica: Detective do Reversa by Sandeco (MIT).');
  lines.push('');
  lines.push('## ⚠️ Atenção');
  lines.push('');
  lines.push('Estes são **candidatos** de domínio detectados por análise determinística.');
  lines.push('🟡 INFERIDO não é verdade confirmada. Valide com o especialista de negócios.');
  lines.push('');

  if (domains.length === 0) {
    lines.push('- Nenhum candidato de domínio detectado 🔴 LACUNA');
    lines.push('');
    lines.push('**Pergunta:** Quais são os domínios de negócio deste sistema?');
    return lines.join('\n');
  }

  for (const domain of domains) {
    const badge = domain.confidence === 'confirmado' ? '🟢 CONFIRMADO' : '🟡 INFERIDO';
    lines.push(`## ${capitalize(domain.name)} ${badge}`);
    lines.push('');
    if (domain.entities.length > 0) {
      lines.push(`Entidades / artefatos detectados: ${domain.entities.slice(0, 5).join(', ')}`);
      lines.push('');
    }
    if (domain.evidence.length > 0) {
      lines.push('Evidências:');
      for (const ev of domain.evidence) {
        lines.push(`- ${ev}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

function matchesDomainKeyword(text: string): string | null {
  const lower = text.toLowerCase().replace(/[-_]/g, '');
  for (const kw of DOMAIN_KEYWORDS) {
    if (lower.includes(kw.replace(/[-_]/g, ''))) {
      return kw;
    }
  }
  return null;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
