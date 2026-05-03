/**
 * Gerador de perguntas para Programação Reversa
 * Inspiração: Reviewer do Reversa by Sandeco (MIT)
 */

import type { ReverseEngineeringInput, QuestionItem, GapItem } from './reverseEngineeringTypes';

export function generateQuestions(input: ReverseEngineeringInput, gaps: GapItem[]): QuestionItem[] {
  const { inventory, plsql } = input;
  const questions: QuestionItem[] = [];
  let id = 1;

  // Perguntas de gaps
  for (const gap of gaps) {
    questions.push({
      id: `Q-${id++}`,
      domain: gap.domain,
      question: gap.question,
      context: gap.description,
      priority: gap.kind === 'plsql' ? 'alta' : gap.kind === 'permissao' ? 'alta' : 'media'
    });
  }

  // Perguntas de domínio de negócio
  questions.push({
    id: `Q-${id++}`,
    domain: 'negocio',
    question: 'Quais são os principais casos de uso deste sistema?',
    context: 'Necessário para gerar especificações operacionais completas',
    priority: 'alta'
  });

  // Perguntas sobre PL/SQL quando detectado
  if (plsql.detected) {
    questions.push({
      id: `Q-${id++}`,
      domain: 'plsql',
      question: 'Existe lógica de negócio crítica implementada apenas no banco (PL/SQL)?',
      context: `${plsql.counts.procedure} procedures e ${plsql.counts.trigger} triggers detectadas`,
      priority: 'alta'
    });

    if (plsql.counts.trigger > 0) {
      questions.push({
        id: `Q-${id++}`,
        domain: 'plsql',
        question: 'As triggers existentes podem ser substituídas por lógica de aplicação?',
        context: `${plsql.counts.trigger} triggers detectadas`,
        priority: 'media'
      });
    }
  }

  // Perguntas de autenticação/permissão
  const hasAuth = inventory.javaSpring.files.some(
    (f) => f.annotations.some((a) => ['PreAuthorize', 'Secured'].includes(a))
  );
  if (!hasAuth && inventory.javaSpring.detected) {
    questions.push({
      id: `Q-${id++}`,
      domain: 'seguranca',
      question: 'Como é implementado o controle de acesso neste sistema?',
      context: 'Nenhuma anotação @PreAuthorize ou @Secured detectada nos controllers',
      priority: 'alta'
    });
  }

  // Perguntas de integração
  if (inventory.typeScript.sourceFiles.services.length > 3) {
    questions.push({
      id: `Q-${id++}`,
      domain: 'integracao',
      question: 'Quais APIs externas são consumidas por este frontend?',
      context: `${inventory.typeScript.sourceFiles.services.length} services detectados no frontend`,
      priority: 'media'
    });
  }

  // Perguntas sobre escalabilidade
  const largeFiles = input.scan.files.filter((f) => f.lines > 1000);
  if (largeFiles.length > 0) {
    questions.push({
      id: `Q-${id++}`,
      domain: 'qualidade',
      question: `Os ${largeFiles.length} arquivo(s) com mais de 1000 linhas são candidatos a refatoração?`,
      context: largeFiles.slice(0, 3).map((f) => f.relativePath).join(', '),
      priority: 'baixa'
    });
  }

  return questions;
}

export function renderQuestionsMd(questions: QuestionItem[], projectName: string): string {
  const lines: string[] = [];
  lines.push(`# Perguntas para Validação Humana: ${projectName}`);
  lines.push('');
  lines.push('> Estas perguntas foram geradas automaticamente por TIC Coder Lite — Modo Lite.');
  lines.push('> Responda-as antes de usar IA para alterar módulos críticos.');
  lines.push('> Inspiração metodológica: Reviewer do Reversa by Sandeco (MIT).');
  lines.push('');

  const alta = questions.filter((q) => q.priority === 'alta');
  const media = questions.filter((q) => q.priority === 'media');
  const baixa = questions.filter((q) => q.priority === 'baixa');

  if (alta.length > 0) {
    lines.push('## 🔴 Prioridade Alta');
    lines.push('');
    for (const q of alta) {
      lines.push(`### ${q.id}: ${q.question}`);
      lines.push('');
      lines.push(`Contexto: ${q.context}`);
      lines.push(`Domínio: ${q.domain}`);
      lines.push('');
    }
  }

  if (media.length > 0) {
    lines.push('## 🟡 Prioridade Média');
    lines.push('');
    for (const q of media) {
      lines.push(`### ${q.id}: ${q.question}`);
      lines.push('');
      lines.push(`Contexto: ${q.context}`);
      lines.push(`Domínio: ${q.domain}`);
      lines.push('');
    }
  }

  if (baixa.length > 0) {
    lines.push('## 🟢 Prioridade Baixa');
    lines.push('');
    for (const q of baixa) {
      lines.push(`### ${q.id}: ${q.question}`);
      lines.push('');
      lines.push(`Contexto: ${q.context}`);
      lines.push(`Domínio: ${q.domain}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}
