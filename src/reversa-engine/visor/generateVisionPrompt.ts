/**
 * Gera .tic-code/reverse-engineering/ui/vision-prompt.md
 *
 * Prompt pronto para o usuário colar em IA com visão (Claude, Gemini, GPT-4V)
 * junto com as imagens, e receber mapeamento UI → código.
 *
 * Fluxo para Copilot (que NÃO aceita imagem):
 *   → O ui-analysis.md já contém dados textuais enriquecidos.
 *   → O Copilot usa esses dados para entender a tela sem ver a imagem.
 *
 * Fluxo para Claude/Gemini/GPT (que ACEITAM imagem):
 *   → O usuário copia vision-prompt.md + arrasta as imagens no chat.
 *   → A IA paga mapeia visualmente e escreve de volta nos artefatos.
 */

import type { VisorShot } from './analyzeVisorScreenshots';

export function generateVisionPrompt(shots: VisorShot[], projectName: string): string {
  const imageList = shots
    .map((shot, i) => `${i + 1}. **${shot.fileName}** — inferido como: ${shot.probableScreen} (${shot.screenType}/${shot.uiState})`)
    .join('\n');

  const routeHints = shots
    .flatMap((shot) => shot.routeCandidates.slice(0, 3))
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 15)
    .map((r) => `- \`${r}\``)
    .join('\n');

  const componentHints = shots
    .flatMap((shot) => shot.componentCandidates.slice(0, 3))
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 15)
    .map((c) => `- \`${c}\``)
    .join('\n');

  const lines: string[] = [
    '# Vision Prompt — Análise Visual de Screenshots',
    '',
    `> **Projeto:** ${projectName}`,
    '> **Gerado por:** TIC Coder Lite — Agente Visor',
    '>',
    '> **Como usar:**',
    '> 1. Abra Claude (claude.ai), Gemini ou ChatGPT',
    '> 2. Cole este prompt inteiro no chat',
    '> 3. Arraste/anexe as imagens listadas abaixo',
    '> 4. A IA vai mapear cada tela → componentes → rotas → arquivos de código',
    '>',
    '> ⚠️ **Copilot (VS Code) não aceita imagens.** Para Copilot, use `ui-analysis.md` que já',
    '> contém todos os metadados textuais necessários para trabalhar sem visão.',
    '',
    '---',
    '',
    '## Contexto',
    '',
    'Sou o agente Visor do TIC Coder Lite, trabalhando em engenharia reversa do projeto.',
    'O scanner determinístico já rodou e gerou metadados sobre as screenshots.',
    'Agora preciso que você **olhe as imagens anexadas** e complete a análise visual.',
    '',
    '## Screenshots para Análise',
    '',
    imageList || '- Nenhuma screenshot disponível',
    '',
    '## Localização das Imagens',
    '',
    '```',
    `.tic-code/reversa/inputs/visor/`,
    '```',
    '',
    '---',
    '',
    '## Sua Tarefa',
    '',
    'Para **cada imagem** que você conseguir ver, responda:',
    '',
    '### 1. Identificação da Tela',
    '- Nome real da tela (baseado no que você VÊ)',
    '- Tipo: auth / dashboard / list / detail / form / modal / settings / error / outro',
    '- Estado atual: vazio / loading / com dados / erro / sucesso',
    '',
    '### 2. Textos Visíveis',
    '- Liste TODOS os textos que você consegue ler na imagem',
    '- Labels de campos, botões, menus, títulos, mensagens',
    '',
    '### 3. Elementos de UI',
    '- Botões, campos de input, tabelas, menus, modais, sidebars',
    '- Hierarquia visual (header → body → footer)',
    '',
    '### 4. Mapeamento para Código',
    '- Rotas prováveis (ex: `/users`, `/orders/123`)',
    '- Componentes prováveis (ex: `UserListPage`, `OrderDetailView`)',
    '- Arquivos de código mais prováveis baseados na estrutura do projeto',
    '',
    '### 5. Ações do Usuário',
    '- O que o usuário pode fazer nesta tela?',
    '- Qual é a ação primária?',
    '- Para onde ele navega a partir daqui?',
    '',
    '---',
    '',
    '## Hints do Scanner (use para comparar com o que você VÊ)',
    '',
    '### Rotas candidatas por nome de arquivo:',
    '',
    routeHints || '- Nenhuma inferida',
    '',
    '### Componentes candidatos por nome de arquivo:',
    '',
    componentHints || '- Nenhum inferido',
    '',
    '---',
    '',
    '## Formato de Resposta',
    '',
    'Após analisar, escreva suas conclusões em formato compatível com:',
    '',
    '- `.tic-code/reverse-engineering/ui/ui-analysis.md` — análise completa por tela',
    '- `.tic-code/reverse-engineering/ui/user-flows.md` — fluxo de navegação entre telas',
    '',
    'Use a escala de confiança:',
    '- 🟢 CONFIRMADO — você leu claramente na imagem',
    '- 🟡 INFERIDO — você deduziu pelo layout/contexto',
    '- 🔴 LACUNA — a imagem não permite determinar',
    '',
    '---',
    '',
    '## Regras',
    '',
    '- ❌ Não invente texto que não está visível na imagem',
    '- ❌ Não assuma regras de negócio baseado apenas no layout',
    '- ✅ Se não conseguir ler algo, marque como 🔴 LACUNA',
    '- ✅ Compare com os hints do scanner e confirme ou corrija',
    '',
    '---',
    '',
    '*Gerado pelo TIC Coder Lite — Agente Visor*'
  ];

  return lines.join('\n') + '\n';
}
