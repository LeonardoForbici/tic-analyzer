import type { VisorShot } from './analyzeVisorScreenshots';
import { formatBytes } from './screenshotRecognition';

export function generateUiDocs(shots: VisorShot[]): { index: string; analysis: string; flows: string } {
  const ordered = [...shots].sort((a, b) => (a.flowStage ?? 9999) - (b.flowStage ?? 9999));
  return {
    index: renderIndex(ordered),
    analysis: renderAnalysis(ordered),
    flows: renderFlows(ordered)
  };
}

function renderIndex(shots: VisorShot[]): string {
  const rows = shots
    .map((shot) => `| ${cell(shot.fileName)} | ${cell(dimensions(shot))} | ${cell(shot.viewport)} | ${cell(shot.localVision?.screenName ?? shot.probableScreen)} | ${cell(shot.screenType)} | ${cell(shot.uiState)} | ${shot.recognitionScore} | ${cell(combinedConfidence(shot))} |`)
    .join('\n');

  return `# Screenshots Index

## Resumo
- Screenshots analisados: ${shots.length}
- Dimensoes confirmadas: ${shots.filter((shot) => shot.width && shot.height).length}
- Telas com inferencia forte: ${shots.filter((shot) => shot.confidence === 'CONFIRMED').length}
- Vision local Ollama: ${shots.filter((shot) => shot.localVision?.attempted).length} tentativa(s)
- Lacunas: ${shots.filter((shot) => combinedConfidence(shot) === 'GAP').length}

| Arquivo | Dimensao | Viewport | Tela provavel | Tipo | Estado | Score | Confianca |
|---|---|---|---|---|---|---:|---|
${rows || '| GAP | GAP | GAP | GAP | GAP | GAP | 0 | GAP |'}

## Observacao operacional
O Visor usa reconhecimento local deterministico: dimensoes reais da imagem, formato, assinatura visual, nome do arquivo, ordem e heuristicas de tela. OCR/modelo de visao nao e executado neste modo; qualquer texto visivel nao fornecido por nome/hints deve permanecer como GAP.
`;
}

function renderAnalysis(shots: VisorShot[]): string {
  if (!shots.length) {
    return '# UI Analysis\n\n- GAP: Nenhum screenshot importado para analise.\n';
  }

  const body = shots.map((shot) => `## ${cell(shot.localVision?.screenName ?? shot.probableScreen)}
- Arquivo: ${shot.fileName}
- Formato/dimensao: ${shot.format} ${dimensions(shot)} (${formatBytes(shot.sizeBytes)})
- Viewport/orientacao: ${shot.viewport} / ${shot.orientation}
- Tipo/estado: ${shot.screenType} / ${shot.uiState}
- Acao primaria inferida: ${shot.primaryAction ?? 'GAP'}
- Score/confianca: ${shot.recognitionScore} / ${combinedConfidence(shot)}
- Assinatura visual: ${shot.visualSignature}
- Descricao: ${shot.description}
${renderVisionBlock(shot)}

### Sinais
${list(shot.signals)}

### Termos candidatos
${list(shot.candidateTerms)}

### Rotas candidatas
${list(shot.routeCandidates)}

### Componentes candidatos
${list(shot.componentCandidates)}

### Lacunas e alertas
${list(shot.warnings)}
`).join('\n');

  return `# UI Analysis

${body}`;
}

function renderFlows(shots: VisorShot[]): string {
  if (!shots.length) {
    return '# User Flows\n\n- GAP: sem screenshots, fluxo nao identificavel.\n';
  }

  const sequence = shots
    .map((shot, index) => `${index + 1}. ${shot.fileName} -> ${shot.localVision?.screenName ?? shot.probableScreen} (${shot.screenType}/${shot.uiState})`)
    .join('\n');
  const groups = groupBy(shots, (shot) => shot.screenType);
  const grouped = [...groups.entries()]
    .map(([type, items]) => `- ${type}: ${items.map((item) => item.localVision?.screenName ?? item.probableScreen).join(' -> ')}`)
    .join('\n');
  const gaps = unique(shots.flatMap((shot) => [...shot.warnings, ...(shot.localVision?.warnings ?? [])])).join('\n');

  return `# User Flows

## Sequencia inferida
${sequence}

## Agrupamentos por tipo de tela
${grouped || '- GAP'}

## Lacunas
${gaps ? gaps.split('\n').map((item) => `- ${item}`).join('\n') : '- Nenhuma lacuna adicional detectada.'}

## Regra de confianca
Fluxos sao INFERIDOS por ordem/nome/metadados das screenshots. Confirme com evidencia de runtime ou navegacao real antes de tratar como regra de negocio.
`;
}

function dimensions(shot: VisorShot): string {
  return shot.width && shot.height ? `${shot.width}x${shot.height}` : 'GAP';
}

function combinedConfidence(shot: VisorShot): string {
  if (shot.localVision?.confidence === 'CONFIRMED') return 'CONFIRMED';
  if (shot.confidence === 'CONFIRMED' || shot.localVision?.confidence === 'INFERRED') return 'INFERRED';
  return shot.confidence;
}

function renderVisionBlock(shot: VisorShot): string {
  const vision = shot.localVision;
  if (!vision) return '';
  return `
### Vision local Ollama
- Modelo: ${vision.model ?? 'N/A'}
- Executado: ${vision.attempted ? 'sim' : 'nao'}
- Confianca: ${vision.confidence}
- Resumo: ${vision.summary ?? 'GAP'}
- Textos visiveis: ${vision.visibleText.join(', ') || 'GAP'}
- Elementos UI: ${vision.uiElements.join(', ') || 'GAP'}
- Acoes: ${vision.actions.join(', ') || 'GAP'}
`;
}

function list(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join('\n') : '- GAP';
}

function cell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const group = key(item);
    out.set(group, [...(out.get(group) ?? []), item]);
  }
  return out;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
