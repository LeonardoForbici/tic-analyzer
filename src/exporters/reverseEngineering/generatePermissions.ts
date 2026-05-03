/**
 * Gerador de permissões candidatas para Programação Reversa
 * Inspiração: Detective do Reversa by Sandeco (MIT)
 */

import type { ReverseEngineeringInput, PermissionCandidate } from './reverseEngineeringTypes';

export function generatePermissions(input: ReverseEngineeringInput): PermissionCandidate[] {
  const { inventory } = input;
  const candidates: PermissionCandidate[] = [];

  for (const file of inventory.javaSpring.files) {
    for (const annotation of file.annotations) {
      if (annotation === 'PreAuthorize' || annotation === 'Secured') {
        candidates.push({
          resource: file.className,
          action: 'acesso-geral',
          role: annotation,
          source: file.path,
          confidence: 'confirmado'
        });
      }
    }

    // Detectar por endpoints
    for (const endpoint of file.endpoints) {
      if (/admin|manage|config/i.test(endpoint)) {
        candidates.push({
          resource: `${file.className}:${endpoint}`,
          action: endpoint,
          role: 'ROLE_ADMIN (inferido)',
          source: file.path,
          confidence: 'inferido'
        });
      }
    }

    // Detectar por nome de arquivo (security, permission, auth)
    if (/security|permission|auth/i.test(file.path)) {
      candidates.push({
        resource: file.className,
        action: 'controle-acesso',
        role: 'detectado por nome',
        source: file.path,
        confidence: 'inferido'
      });
    }
  }

  // Deduplica
  const seen = new Set<string>();
  return candidates.filter((c) => {
    const key = `${c.resource}:${c.role}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 30);
}

export function renderPermissionsMd(permissions: PermissionCandidate[], projectName: string): string {
  const lines: string[] = [];
  lines.push(`# Permissões Candidatas: ${projectName}`);
  lines.push('');
  lines.push('> Detectadas por análise de annotations @PreAuthorize, @Secured, hasRole e padrões ROLE_*.');
  lines.push('> Gerado por TIC Coder Lite — Modo Lite.');
  lines.push('> Inspiração metodológica: Detective do Reversa by Sandeco (MIT).');
  lines.push('');
  lines.push('> ⚠️ Valide todas as permissões com o time de segurança antes de alterar controle de acesso.');
  lines.push('');

  if (permissions.length === 0) {
    lines.push('- Nenhuma permissão detectada 🔴 LACUNA');
    lines.push('');
    lines.push('**Perguntas:**');
    lines.push('- Quais papéis (roles) existem neste sistema?');
    lines.push('- Existe controle de acesso baseado em perfis ou permissões?');
    return lines.join('\n');
  }

  lines.push('| Recurso | Ação | Role/Permissão | Origem | Confiança |');
  lines.push('| --- | --- | --- | --- | --- |');

  for (const p of permissions) {
    const badge = p.confidence === 'confirmado' ? '🟢' : p.confidence === 'inferido' ? '🟡' : '🔴';
    lines.push(`| ${p.resource} | ${p.action} | ${p.role} | ${p.source} | ${badge} |`);
  }

  lines.push('');
  lines.push('## Lacunas de Permissão');
  lines.push('');
  lines.push('- Verificar se há endpoints sem controle de acesso 🔴 LACUNA');
  lines.push('- Verificar se há operações de escrita sem autenticação 🔴 LACUNA');

  return lines.join('\n');
}
