/**
 * Gerador de regras de negócio candidatas para Programação Reversa
 * Inspiração: Detective do Reversa by Sandeco (MIT)
 *
 * REGRA FUNDAMENTAL: Regras de negócio NUNCA vêm de:
 * - package-lock.json / yarn.lock / pnpm-lock.yaml
 * - arquivos grandes sem contexto de negócio
 * - TODO/FIXME, uso de "any", dependências externas, métricas técnicas
 * Esses itens pertencem a risks.md, code-analysis.md ou risk-impact-matrix.md.
 */

import type { ReverseEngineeringInput, BusinessRuleCandidate } from './reverseEngineeringTypes';

/** Nomes de método que sugerem regras de negócio */
const RULE_METHOD_PATTERNS = [
  /\b(calcul|validat|verif|check|process|approv|reject|cancel|block|allow|deny|grant|revoke|bill|invoice|pay|charge)/i
];

/** Arquivos que nunca devem gerar regras de negócio */
function isExcludedFromBusinessRules(file: string): boolean {
  const lower = file.toLowerCase();
  const basename = lower.split('/').pop() ?? lower;
  return (
    basename === 'package-lock.json' ||
    basename === 'yarn.lock' ||
    basename === 'pnpm-lock.yaml' ||
    lower.endsWith('.min.js') ||
    lower.endsWith('.map') ||
    lower.includes('node_modules/') ||
    lower.includes('/dist/') ||
    lower.includes('/build/') ||
    lower.includes('/out/') ||
    lower.includes('.git/') ||
    lower.includes('.tic-code/')
  );
}

export function generateBusinessRules(input: ReverseEngineeringInput): BusinessRuleCandidate[] {
  const { inventory, plsql } = input;
  const rules: BusinessRuleCandidate[] = [];
  let ruleId = 1;

  // ── Java/Spring: annotations de segurança ──────────────────────────────────
  for (const file of inventory.javaSpring.files) {
    if (isExcludedFromBusinessRules(file.path)) continue;

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

  // ── PL/SQL: triggers, procedures e functions de negócio ────────────────────
  for (const entity of plsql.entities) {
    if (isExcludedFromBusinessRules(entity.file)) continue;

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

  // ── TypeScript/JS: guards de acesso e services de domínio ─────────────────
  const tsFiles = (input.files ?? []).filter(
    (f) => ['.ts', '.tsx', '.js', '.jsx'].includes(f.extension) && !isExcludedFromBusinessRules(f.relativePath)
  );
  for (const file of tsFiles.slice(0, 50)) {
    const lower = file.relativePath.toLowerCase();
    const basename = lower.split('/').pop() ?? '';

    if (/guard|auth|permission|role/.test(basename)) {
      rules.push({
        id: `BR-${ruleId++}`,
        domain: inferDomain(file.relativePath),
        rule: `Guard de acesso detectado: ${file.relativePath}`,
        evidence: [file.relativePath],
        sourceFiles: [file.relativePath],
        confidence: 'inferido'
      });
    }

    if (basename.endsWith('.service.ts') || basename.endsWith('.service.js')) {
      const isGenericUtil = /util|helper|logger|config|common/.test(basename);
      if (!isGenericUtil) {
        rules.push({
          id: `BR-${ruleId++}`,
          domain: inferDomain(file.relativePath),
          rule: `Service de domínio: ${file.relativePath}`,
          evidence: [file.relativePath],
          sourceFiles: [file.relativePath],
          confidence: 'inferido'
        });
      }
    }
  }

  // ── NUNCA adicionar riscos técnicos como regras de negócio ─────────────────
  // Riscos pertencem a risks.md e risk-impact-matrix.md, não aqui.

  const seen = new Set<string>();
  return rules
    .filter((r) => {
      if (seen.has(r.rule)) return false;
      seen.add(r.rule);
      return true;
    })
    .slice(0, 50);
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
  lines.push('> ℹ️ Riscos técnicos (TODO/FIXME, uso de `any`, arquivos grandes, SQL concatenado) **não são regras de negócio**.');
  lines.push('> Consulte `risks.md` e `traceability/risk-impact-matrix.md` para riscos técnicos.');
  lines.push('');

  const confirmed = rules.filter((r) => r.confidence === 'confirmado');
  const inferred = rules.filter((r) => r.confidence === 'inferido');

  if (rules.length === 0) {
    lines.push('## Resultado da Análise');
    lines.push('');
    lines.push('**Nenhuma regra de negócio confirmada foi detectada nesta análise determinística.**');
    lines.push('');
    lines.push('### Lacunas');
    lines.push('');
    lines.push('- 🔴 LACUNA: Não há annotations de segurança Java detectadas');
    lines.push('- 🔴 LACUNA: Não há triggers PL/SQL detectados');
    lines.push('- 🔴 LACUNA: Não há guards de autorização TypeScript detectados');
    lines.push('');
    lines.push('### Perguntas para o Especialista de Negócio');
    lines.push('');
    lines.push('1. Quais são as regras de validação de entrada mais críticas?');
    lines.push('2. Existem fluxos de aprovação/rejeição de dados?');
    lines.push('3. Há restrições de acesso por perfil de usuário?');
    lines.push('4. Existem cálculos ou fórmulas de negócio embutidas no código?');
    return lines.join('\n');
  }

  const byDomain = new Map<string, BusinessRuleCandidate[]>();
  for (const rule of rules) {
    const d = rule.domain || 'geral';
    const list = byDomain.get(d) ?? [];
    list.push(rule);
    byDomain.set(d, list);
  }

  lines.push(`**Resumo:** ${confirmed.length} confirmadas 🟢 | ${inferred.length} inferidas 🟡`);
  lines.push('');

  for (const [domain, domainRules] of byDomain.entries()) {
    lines.push(`## ${capitalize(domain)}`);
    lines.push('');
    for (const rule of domainRules) {
      const badge =
        rule.confidence === 'confirmado' ? '🟢 CONFIRMADO' :
        rule.confidence === 'inferido' ? '🟡 INFERIDO' : '🔴 LACUNA';
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

  lines.push('---');
  lines.push('');
  lines.push('## Lacunas e Perguntas para Validação');
  lines.push('');
  lines.push('- 🔴 Regras embutidas em comentários, lógica condicional complexa ou documentação interna não são detectadas automaticamente.');
  lines.push('- 🔴 Valide cada regra 🟡 INFERIDO com o especialista de negócios antes de usar como referência.');

  return lines.join('\n');
}

function inferDomain(path: string): string {
  const parts = path.toLowerCase().split(/[\/\._\-]/);
  const domains = [
    'financeiro', 'fiscal', 'estoque', 'venda', 'compra', 'pedido', 'fatura', 'boleto',
    'pagamento', 'usuario', 'cliente', 'fornecedor', 'produto', 'auth',
    'order', 'invoice', 'payment', 'user', 'customer', 'product'
  ];
  for (const part of parts) {
    if (part.length < 3) continue;
    for (const d of domains) {
      if (part === d || part.startsWith(d)) return d;
    }
  }
  return 'geral';
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
