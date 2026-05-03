/**
 * Gerador de regras de negócio candidatas para Programação Reversa
 * Inspiração: Detective do Reversa by Sandeco (MIT)
 */

import type { ReverseEngineeringInput, BusinessRuleCandidate } from './reverseEngineeringTypes';

/** Nomes de método que sugerem regras de negócio */
const RULE_METHOD_PATTERNS = [
  /\b(calcul|validat|verif|check|process|approv|reject|cancel|block|allow|deny|grant|revoke|bill|invoice|pay|charge)/i
];

export function generateBusinessRules(input: ReverseEngineeringInput): BusinessRuleCandidate[] {
  const { inventory, plsql } = input;
  const rules: BusinessRuleCandidate[] = [];
  let ruleId = 1;

  // Regras a partir de annotations de segurança Java
  for (const file of inventory.javaSpring.files) {
    for (const annotation of file.annotations) {
      if (['PreAuthorize', 'Secured'].includes(annotation)) {
        rules.push({
          id: `BR-${ruleId++}`,
          domain: inferDomain(file.path),
          rule: `Acesso a ${file.className} requer autorização (@${annotation})`,
          evidence: [file.path],
          sourceFiles: [file.path],
          confidence: 'confirmado'
        });
      }
    }

    // Endpoints com múltiplos métodos HTTP
    if (file.endpoints.length > 5) {
      rules.push({
        id: `BR-${ruleId++}`,
        domain: inferDomain(file.path),
        rule: `${file.className} expõe ${file.endpoints.length} endpoint(s) HTTP — verificar controle de acesso`,
        evidence: [file.path],
        sourceFiles: [file.path],
        confidence: 'inferido'
      });
    }

    // Métodos com nomes que sugerem regras
    for (const ep of file.endpoints) {
      for (const pattern of RULE_METHOD_PATTERNS) {
        if (pattern.test(ep)) {
          rules.push({
            id: `BR-${ruleId++}`,
            domain: inferDomain(file.path),
            rule: `Operação de negócio detectada: ${ep} em ${file.className}`,
            evidence: [file.path],
            sourceFiles: [file.path],
            confidence: 'inferido'
          });
          break;
        }
      }
    }
  }

  // Regras PL/SQL — muito importantes
  for (const entity of plsql.entities) {
    if (entity.kind === 'trigger') {
      rules.push({
        id: `BR-${ruleId++}`,
        domain: inferDomain(entity.name),
        rule: `Trigger ${entity.name}${entity.targetTable ? ` executa em ${entity.targetTable}` : ''} — regra de negócio no banco`,
        evidence: [`${entity.file}:${entity.line}`],
        sourceFiles: [entity.file],
        confidence: 'confirmado'
      });
    }

    if (entity.kind === 'procedure' || entity.kind === 'function') {
      for (const pattern of RULE_METHOD_PATTERNS) {
        if (pattern.test(entity.name)) {
          rules.push({
            id: `BR-${ruleId++}`,
            domain: inferDomain(entity.name),
            rule: `${entity.kind === 'function' ? 'Função' : 'Procedure'} PL/SQL: ${entity.name} — operação de negócio no banco`,
            evidence: [`${entity.file}:${entity.line}`],
            sourceFiles: [entity.file],
            confidence: 'inferido'
          });
          break;
        }
      }
    }
  }

  // Regras a partir de risks (exceções, SQL concatenado, etc.)
  for (const risk of input.risks) {
    if (risk.level === 'high' || risk.level === 'critical') {
      rules.push({
        id: `BR-${ruleId++}`,
        domain: inferDomain(risk.file),
        rule: `Risco ${risk.level.toUpperCase()} detectado: ${risk.title}`,
        evidence: [risk.file + (risk.line ? `:${risk.line}` : '')],
        sourceFiles: [risk.file],
        confidence: 'confirmado'
      });
    }
  }

  // Deduplica por rule
  const seen = new Set<string>();
  return rules.filter((r) => {
    if (seen.has(r.rule)) return false;
    seen.add(r.rule);
    return true;
  }).slice(0, 50);
}

export function renderBusinessRulesMd(rules: BusinessRuleCandidate[], projectName: string): string {
  const lines: string[] = [];
  lines.push(`# Regras de Negócio Candidatas: ${projectName}`);
  lines.push('');
  lines.push('> Gerado por TIC Coder Lite — Modo Lite.');
  lines.push('> Inspiração metodológica: Detective do Reversa by Sandeco (MIT).');
  lines.push('');
  lines.push('## ⚠️ Atenção');
  lines.push('');
  lines.push('Estas são **regras candidatas** detectadas por análise determinística.');
  lines.push('🟡 INFERIDO significa que a regra foi deduzida — **não trate como verdade** sem validar com o especialista de negócios.');
  lines.push('');

  if (rules.length === 0) {
    lines.push('- Nenhuma regra de negócio candidata detectada 🔴 LACUNA');
    lines.push('');
    lines.push('**Sugestão:** Forneça fontes mais ricas (Java Spring, PL/SQL, annotations de segurança) para detecção automática.');
    return lines.join('\n');
  }

  // Agrupar por domínio
  const byDomain = new Map<string, BusinessRuleCandidate[]>();
  for (const rule of rules) {
    const d = rule.domain || 'geral';
    const list = byDomain.get(d) ?? [];
    list.push(rule);
    byDomain.set(d, list);
  }

  for (const [domain, domainRules] of byDomain.entries()) {
    lines.push(`## ${capitalize(domain)}`);
    lines.push('');
    for (const rule of domainRules) {
      const badge = rule.confidence === 'confirmado' ? '🟢 CONFIRMADO' : rule.confidence === 'inferido' ? '🟡 INFERIDO' : '🔴 LACUNA';
      lines.push(`### ${rule.id}: ${rule.rule} ${badge}`);
      lines.push('');
      if (rule.evidence.length > 0) {
        lines.push('Evidências:');
        for (const ev of rule.evidence) {
          lines.push(`- ${ev}`);
        }
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

function inferDomain(path: string): string {
  const parts = path.toLowerCase().split(/[\/\._\-]/);
  const domains = [
    'financeiro', 'fiscal', 'estoque', 'venda', 'compra', 'pedido', 'fatura', 'boleto',
    'pagamento', 'usuario', 'cliente', 'fornecedor', 'produto', 'auth', 'permissao',
    'order', 'invoice', 'payment', 'user', 'customer', 'product', 'auth', 'permission'
  ];
  for (const part of parts) {
    for (const d of domains) {
      if (part.includes(d)) return d;
    }
  }
  return 'geral';
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
