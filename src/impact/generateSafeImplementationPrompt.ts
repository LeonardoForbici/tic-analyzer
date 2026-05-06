import { ScreenImpactResult } from './impactTypes';

export function generateSafeImplementationPrompt(result: ScreenImpactResult): string {
  return `# Prompt Seguro de Implementação\n\nMudança:\n${result.input.changeDescription}\n\nAntes de alterar, leia:\n${result.impactEstimate.recommendedFilesToReview.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n\nRiscos:\n${result.impactEstimate.risks.map((x) => `- ${x}`).join('\n') || '- Nenhum'}\n\nLacunas:\n${result.gaps.map((x) => `- ${x}`).join('\n') || '- Nenhuma'}\n\nPerguntas:\n${result.questions.map((x) => `- ${x}`).join('\n')}\n\nRegras:\n- não alterar backend se impacto for visual\n- não alterar SQL sem validar Data Master\n- não alterar permissões sem validar permissions.md\n- manter comportamento existente\n- usar confidence scale\n`;
}
