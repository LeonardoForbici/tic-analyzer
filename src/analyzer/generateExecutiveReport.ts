/**
 * Relatório executivo — HTML self-contained (Tailwind + Mermaid CDN, mesmo
 * molde de renderArchReviewHtml) para mandar à diretoria. Vocabulário de
 * negócio: saúde, tendência, custo da dívida, riscos e risco de conhecimento.
 * No app vira PDF via webContents.printToPDF; via CLI sai como HTML.
 */
interface ExecReportData {
  projectName: string;
  health?: { score: number; grade: string; breakdown?: Record<string, { penalty: number; max: number }> };
  snapshots?: Array<{ timestamp: string; score: number }>;
  roi?: { currency: string; remediationHours: number; devDays: number; debtCost: number; hoursSaved: number; savedCost: number; net: number; byModule: Array<{ module: string; cost: number }> };
  risks?: { total: number; critical: number; high: number; items?: Array<{ level: string; title: string; file: string }> };
  archViolations?: { errorCount: number; warnCount: number };
  ownership?: { knowledgeRisk?: Array<{ file: string; author: string; reason: string }>; modules?: Array<{ module: string; primaryOwner: string; busFactor: number; difficulty: string }> };
  activity?: Array<{ ts: string; title: string; severity: string }>;
}

const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const gradeColor = (s: number) => (s >= 90 ? '#16a34a' : s >= 75 ? '#65a30d' : s >= 60 ? '#d97706' : s >= 40 ? '#ea580c' : '#dc2626');

export function renderExecutiveHtml(d: ExecReportData): string {
  const h = d.health;
  const roi = d.roi;
  const money = (n: number) => `${roi?.currency ?? 'R$'} ${n.toLocaleString()}`;
  const now = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  const trend = (d.snapshots ?? []).slice(-20);
  const trendPath = (() => {
    if (trend.length < 2) return '';
    const w = 600, ht = 80;
    const xs = (i: number) => (i / (trend.length - 1)) * w;
    const ys = (v: number) => ht - (v / 100) * ht;
    return trend.map((s, i) => `${i === 0 ? 'M' : 'L'} ${xs(i).toFixed(0)} ${ys(s.score).toFixed(0)}`).join(' ');
  })();

  const kpi = (label: string, value: string, sub = '', color = '#4f46e5') =>
    `<div class="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
      <div class="text-xs uppercase tracking-wide text-slate-500 mb-1">${esc(label)}</div>
      <div class="text-3xl font-extrabold" style="color:${color}">${esc(value)}</div>
      ${sub ? `<div class="text-xs text-slate-500 mt-1">${esc(sub)}</div>` : ''}
    </div>`;

  const riskRows = (d.risks?.items ?? []).filter((r) => r.level === 'critical' || r.level === 'high').slice(0, 10)
    .map((r) => `<tr class="border-t border-slate-100"><td class="py-1 pr-3">${r.level === 'critical' ? '🔴' : '🟠'}</td><td class="py-1 pr-3">${esc(r.title)}</td><td class="py-1 text-slate-500 font-mono text-xs">${esc(r.file)}</td></tr>`).join('');

  const knowledgeRows = (d.ownership?.knowledgeRisk ?? []).slice(0, 8)
    .map((k) => `<tr class="border-t border-slate-100"><td class="py-1 pr-3 font-mono text-xs">${esc(k.file)}</td><td class="py-1 pr-3">${esc(k.author)}</td><td class="py-1 text-slate-500">${esc(k.reason)}</td></tr>`).join('');

  const costRows = (roi?.byModule ?? []).slice(0, 8)
    .map((m) => `<tr class="border-t border-slate-100"><td class="py-1 pr-3">${esc(m.module)}</td><td class="py-1 text-right">${money(m.cost)}</td></tr>`).join('');

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Relatório Executivo — ${esc(d.projectName)}</title>
<script src="https://cdn.tailwindcss.com"></script>
</head><body class="bg-slate-100 text-slate-800 font-sans p-10 max-w-4xl mx-auto">

<header class="flex justify-between items-end mb-8 pb-6 border-b-2 border-slate-300">
  <div>
    <div class="text-sm text-slate-500">Relatório Executivo · TIC Analyzer</div>
    <h1 class="text-3xl font-extrabold">${esc(d.projectName)}</h1>
    <div class="text-sm text-slate-500 mt-1">${now}</div>
  </div>
  ${h ? `<div class="text-center"><div class="text-5xl font-black" style="color:${gradeColor(h.score)}">${h.score}</div><div class="text-sm text-slate-500">Health · grade ${esc(h.grade)}</div></div>` : ''}
</header>

<section class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
  ${roi ? kpi('Custo da dívida', money(roi.debtCost), `${roi.devDays} dev-days para sanear`, '#dc2626') : ''}
  ${roi ? kpi('Horas economizadas', `${roi.hoursSaved} h`, `${money(roi.savedCost)} em investigação evitada`, '#16a34a') : ''}
  ${d.risks ? kpi('Riscos críticos/altos', String((d.risks.critical ?? 0) + (d.risks.high ?? 0)), `${d.risks.total} no total`, '#ea580c') : ''}
  ${d.archViolations ? kpi('Drift de arquitetura', String(d.archViolations.errorCount + d.archViolations.warnCount), `${d.archViolations.errorCount} bloqueantes`, '#d97706') : ''}
</section>

${trendPath ? `<section class="bg-white rounded-xl p-5 shadow-sm border border-slate-200 mb-8">
  <h2 class="font-bold mb-3">Tendência de saúde (${trend.length} análises)</h2>
  <svg viewBox="0 0 600 80" class="w-full h-20"><path d="${trendPath}" fill="none" stroke="${gradeColor(h?.score ?? 70)}" stroke-width="2"/></svg>
</section>` : ''}

${roi && costRows ? `<section class="bg-white rounded-xl p-5 shadow-sm border border-slate-200 mb-8">
  <h2 class="font-bold mb-3">💰 Custo da dívida por módulo</h2>
  <table class="w-full text-sm"><tbody>${costRows}</tbody></table>
</section>` : ''}

${riskRows ? `<section class="bg-white rounded-xl p-5 shadow-sm border border-slate-200 mb-8">
  <h2 class="font-bold mb-3">⚠️ Principais riscos</h2>
  <table class="w-full text-sm"><tbody>${riskRows}</tbody></table>
</section>` : ''}

${knowledgeRows ? `<section class="bg-white rounded-xl p-5 shadow-sm border border-slate-200 mb-8">
  <h2 class="font-bold mb-3">🧠 Risco de conhecimento (bus-factor)</h2>
  <p class="text-xs text-slate-500 mb-2">Arquivos importantes com um único autor — se a pessoa sair, o conhecimento vai junto.</p>
  <table class="w-full text-sm"><tbody>${knowledgeRows}</tbody></table>
</section>` : ''}

<footer class="text-center text-xs text-slate-400 mt-10 pt-6 border-t border-slate-200">
  Gerado localmente pelo TIC Analyzer · zero tokens de IA · valores em tempo/custo são estimativas baseadas no débito técnico e na taxa-hora configurada.
</footer>
</body></html>`;
}

/** Monta os dados do relatório a partir dos artefatos `.tic-code/`. */
export function buildExecReportData(read: (file: string) => any): ExecReportData {
  const analysis = read('analysis.json') ?? {};
  const snapshots = read('snapshots.json') ?? [];
  const activity = read('activity.json') ?? [];
  return {
    projectName: analysis.project?.name ?? 'Projeto',
    health: analysis.health,
    snapshots: Array.isArray(snapshots) ? snapshots : [],
    roi: analysis.roi,
    risks: analysis.risks,
    archViolations: analysis.archViolations,
    ownership: analysis.ownership,
    activity: Array.isArray(activity) ? activity.slice(-10) : []
  };
}
