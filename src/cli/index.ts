#!/usr/bin/env node
/**
 * CLI headless do TIC Analyzer — roda o mesmo engine do app Electron em
 * terminal/CI, sem janela. Usado pelo GitHub Action de PR review.
 *
 *   tic-analyzer analyze <path> [--json] [--no-ai-files]
 *   tic-analyzer health <path>
 *   tic-analyzer pr-review --base <dir> --head <dir> [--out report.md]
 *                          [--gate new-high-risks,health-drop:5]
 *
 * Exit codes: 0 ok · 1 gate de qualidade falhou · 2 erro de execução.
 */
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { runPipeline } from '../analyzer/pipeline';
import { loadSnapshots } from '../analyzer/store/snapshots';
import { compareAnalyses, evaluateGates, formatPrComment, appendPrHistory } from './prReview';
import { TicAnalyzerMcpServer } from '../mcp/server';
import { buildAgentBrief } from '../mcp/agentBrief';
import { openIndexDb, INDEX_DB_FILE } from '../analyzer/store/indexDb';
import { loadActivity } from '../analyzer/store/activityLog';
import { loadArchRules } from '../analyzer/checkArchRules';
import { dispatchAlerts } from '../analyzer/notify';
import { renderExecutiveHtml, buildExecReportData } from '../analyzer/generateExecutiveReport';
import { upsertProject, loadPortfolio } from '../analyzer/store/portfolioStore';

interface Args {
  positional: string[];
  flags: Map<string, string | true>;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const name = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { flags.set(name, next); i++; }
      else flags.set(name, true);
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function usage(): never {
  console.error(`Uso:
  tic-analyzer analyze <path> [--json] [--no-ai-files]   Roda a análise completa
  tic-analyzer health <path>                              Mostra o health score (última análise)
  tic-analyzer pr-review --base <dir> --head <dir>        Compara duas análises e gera report.md
               [--out report.md] [--gate new-high-risks,new-violations,health-drop:5]
               [--changed arquivo1,arquivo2 | --base-ref <ref>]
  tic-analyzer serve <path> [--port 7432] [--host 0.0.0.0] [--token <segredo>]
               [--no-analyze] [--watch <minutos>] [--debounce <seg>]   MCP server vivo (máquina dedicada).
               --host 0.0.0.0 expõe na rede — USE --token (ou TIC_TOKEN).
               File-watch reativo + push SSE em /events + alertas (.tic-rules.json → alerts).
               --debounce N (default 15s) espera N s após o último save; --watch N = rede de segurança periódica
  tic-analyzer report <path> [--out report.html]          Relatório executivo (HTML) para liderança
  tic-analyzer portfolio [--json]                          Lista o portfólio (todos os projetos analisados)`);
  process.exit(2);
}

async function cmdAnalyze(args: Args): Promise<number> {
  const target = args.positional[0];
  if (!target) usage();
  const projectPath = path.resolve(target);
  if (!fs.existsSync(projectPath)) {
    console.error(`Pasta não encontrada: ${projectPath}`);
    return 2;
  }
  const asJson = args.flags.has('json');
  let lastPhase = '';
  const result = await runPipeline(
    projectPath,
    (p) => {
      if (asJson) return;
      if (p.phase !== lastPhase || p.percent === 100) {
        process.stderr.write(`[${String(p.percent).padStart(3)}%] ${p.phase}: ${p.detail}\n`);
        lastPhase = p.phase;
      }
    },
    { skipAiFiles: args.flags.has('no-ai-files') }
  );
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.success) {
    console.log(`\n✓ Análise concluída: ${result.totalFiles.toLocaleString()} arquivos, ${result.totalLines.toLocaleString()} linhas`);
    console.log(`  Health: ${result.healthScore}/100 (${result.healthGrade}) · impacto: ${result.impactEdges?.toLocaleString()} arestas · módulos: ${result.modulesGenerated}`);
    console.log(`  Saída: ${result.outputPath}`);
  } else {
    console.error(`✗ Análise falhou: ${result.error}`);
  }
  if (result.success) upsertProject(projectPath); // registra no portfólio global
  return result.success ? 0 : 2;
}

/** Lista o portfólio global (todos os projetos analisados). */
function cmdPortfolio(args: Args): number {
  const projects = loadPortfolio();
  if (args.flags.has('json')) { console.log(JSON.stringify(projects, null, 2)); return 0; }
  if (projects.length === 0) { console.log('Portfólio vazio. Rode `tic-analyzer analyze <path>` em um ou mais projetos.'); return 0; }
  console.log(`\nPortfólio — ${projects.length} projeto(s) (pior saúde primeiro):\n`);
  for (const p of projects) {
    const cost = p.debtCost !== null ? ` · dívida ${p.currency} ${p.debtCost.toLocaleString()}` : '';
    console.log(`  ${(p.healthScore ?? '—')}/100 ${p.healthGrade ?? ''}  ${p.name}  (${p.totalFiles.toLocaleString()} arq · ${p.risks.critical}🔴/${p.risks.high}🟠 · drift ${p.archErrors}${cost})`);
  }
  return 0;
}

function cmdHealth(args: Args): number {
  const target = args.positional[0];
  if (!target) usage();
  const ticCodeDir = path.join(path.resolve(target), '.tic-code');
  const snaps = loadSnapshots(ticCodeDir);
  if (snaps.length === 0) {
    console.error('Nenhum snapshot encontrado. Rode `tic-analyzer analyze` primeiro.');
    return 2;
  }
  const cur = snaps[snaps.length - 1];
  const prev = snaps.length > 1 ? snaps[snaps.length - 2] : null;
  console.log(`Health score: ${cur.score}/100 (grade ${cur.grade})`);
  if (prev) console.log(`Δ vs anterior: ${cur.score - prev.score >= 0 ? '+' : ''}${Math.round((cur.score - prev.score) * 10) / 10}`);
  for (const [dim, b] of Object.entries(cur.breakdown).sort((a, b) => b[1].penalty - a[1].penalty)) {
    console.log(`  ${dim.padEnd(11)} -${b.penalty} (máx ${b.max}, bruto ${b.raw})`);
  }
  return 0;
}

async function cmdPrReview(args: Args): Promise<number> {
  const baseDir = args.flags.get('base');
  const headDir = args.flags.get('head');
  if (typeof baseDir !== 'string' || typeof headDir !== 'string') usage();

  let changedFiles: string[] = [];
  const changedArg = args.flags.get('changed');
  if (typeof changedArg === 'string') {
    changedFiles = changedArg.split(',').map((f) => f.trim()).filter(Boolean);
  } else {
    const baseRef = typeof args.flags.get('base-ref') === 'string' ? (args.flags.get('base-ref') as string) : null;
    try {
      const cmd = baseRef ? `git diff --name-only ${baseRef}...HEAD` : 'git diff --name-only HEAD~1..HEAD';
      changedFiles = execSync(cmd, { cwd: path.resolve(headDir), encoding: 'utf8', timeout: 15000 })
        .trim().split('\n').filter(Boolean);
    } catch (err) {
      console.error(`Aviso: não foi possível ler o git diff (${err}). Use --changed para informar os arquivos.`);
    }
  }

  const resolvedHead = path.resolve(headDir as string);
  const result = compareAnalyses(path.resolve(baseDir as string), resolvedHead, changedFiles);
  const gateSpec = typeof args.flags.get('gate') === 'string' ? (args.flags.get('gate') as string) : '';
  const gate = gateSpec ? evaluateGates(result, gateSpec) : undefined;
  const markdown = formatPrComment(result, gate);
  appendPrHistory(resolvedHead, result, gate);

  // --brief-out: AGENT-BRIEF (skill triage) da entidade mais crítica quebrada,
  // pronto para virar corpo de issue (gate falhou → issue bug/needs-triage)
  const briefOut = args.flags.get('brief-out');
  if (typeof briefOut === 'string') {
    const entity = result.newRuleViolations[0]?.from ?? result.newRisks[0]?.file ?? result.impacts[0]?.file;
    const db = entity ? openIndexDb(path.join(resolvedHead, '.tic-code', INDEX_DB_FILE)) : null;
    if (db && entity) {
      try {
        const brief = buildAgentBrief(db, path.join(resolvedHead, '.tic-code'), entity, {
          category: 'bug',
          summary: gate?.failed ? `Resolver quality gate do PR: ${gate.reasons.join('; ')}` : undefined
        });
        if (brief) fs.writeFileSync(path.resolve(briefOut), brief, 'utf8');
      } finally { db.close(); }
    }
  }

  const out = args.flags.get('out');
  if (typeof out === 'string') {
    fs.writeFileSync(path.resolve(out), markdown, 'utf8');
    console.error(`Report escrito em ${out}`);
  } else {
    console.log(markdown);
  }

  if (gate?.failed) {
    console.error(`✗ Quality gate falhou: ${gate.reasons.join('; ')}`);
    return 1;
  }
  return 0;
}

/**
 * Modo servidor (enterprise): a máquina dedicada analisa o projeto e serve o
 * MCP para o time inteiro — todos os assistentes consultam o MESMO índice.
 * Com --watch N, re-analisa periodicamente (incremental via file-cache).
 */
async function cmdServe(args: Args): Promise<number> {
  const target = args.positional[0];
  if (!target) usage();
  const projectPath = path.resolve(target);
  if (!fs.existsSync(projectPath)) {
    console.error(`Pasta não encontrada: ${projectPath}`);
    return 2;
  }
  const port = Number(args.flags.get('port') ?? 7432);
  const host = typeof args.flags.get('host') === 'string' ? (args.flags.get('host') as string) : '127.0.0.1';
  const token = typeof args.flags.get('token') === 'string' ? (args.flags.get('token') as string) : process.env.TIC_TOKEN;
  if (host !== '127.0.0.1' && host !== 'localhost' && !token) {
    console.error('⚠️  --host expõe o índice do código na rede. Defina --token <segredo> (ou TIC_TOKEN).');
    return 2;
  }

  const ticCodeDir = path.join(projectPath, '.tic-code');
  const server = new TicAnalyzerMcpServer({ projectPath });

  // Após cada análise: push SSE dos eventos novos + alertas outbound.
  const broadcast = async (beforeCount: number) => {
    const events = loadActivity(ticCodeDir);
    const fresh = events.slice(beforeCount);
    for (const e of fresh) server.emit(e);
    server.emit({ type: 'analysis-complete', ts: new Date().toISOString() });
    const cfg = loadArchRules(projectPath);
    if (cfg?.alerts) {
      const sent = await dispatchAlerts(fresh, cfg.alerts, path.basename(projectPath));
      for (const s of sent) if (s.ok) console.error(`[alert] ${s.channel}: ${s.count} evento(s) enviado(s)`);
    }
  };

  const analyzeOnce = async (): Promise<boolean> => {
    const before = loadActivity(ticCodeDir).length;
    const r = await runPipeline(projectPath, (p) => {
      if (p.percent === 100) process.stderr.write(`[analyze] ${p.phase}: ${p.detail}\n`);
    }, { skipAiFiles: args.flags.has('no-ai-files') });
    if (r.success) {
      console.error(`[analyze] ok — health ${r.healthScore}/100, ${r.totalFiles.toLocaleString()} arquivos`);
      await broadcast(before);
    } else {
      console.error(`[analyze] falhou: ${r.error}`);
    }
    return r.success;
  };

  if (!args.flags.has('no-analyze')) {
    if (!(await analyzeOnce())) return 2;
  }

  await server.startHttp(port, host, token);

  // ── File-watch reativo (olhos do sistema vivo): reage a SAVES, debounced ────
  const debounceMs = Number(args.flags.get('debounce') ?? 15) * 1000;
  const IGNORE = /(^|[\\/])(\.tic-code|\.git|node_modules|dist|build|target|out)([\\/]|$)/;
  let timer: NodeJS.Timeout | null = null;
  let analyzing = false;
  const trigger = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (analyzing) { trigger(); return; }
      analyzing = true;
      void analyzeOnce().finally(() => { analyzing = false; });
    }, debounceMs);
  };
  try {
    fs.watch(projectPath, { recursive: true }, (_e, filename) => {
      if (filename && !IGNORE.test(String(filename))) trigger();
    });
    console.error(`[watch] file-watch reativo ativo (debounce ${debounceMs / 1000}s) · SSE em /events`);
  } catch {
    // Plataforma/Node sem recursive: cai para o periódico abaixo
    console.error('[watch] file-watch recursivo indisponível — usando apenas --watch periódico');
  }

  const watchMin = Number(args.flags.get('watch') ?? 0);
  if (watchMin > 0) {
    console.error(`[watch] rede de segurança: re-análise a cada ${watchMin} min`);
    setInterval(() => { void analyzeOnce(); }, watchMin * 60_000);
  }

  await new Promise(() => {}); // roda até ser interrompido (Ctrl+C / serviço)
  return 0;
}

/** Relatório executivo em HTML (headless/CI). PDF só no app (precisa do Electron). */
function cmdReport(args: Args): number {
  const target = args.positional[0];
  if (!target) usage();
  const ticCodeDir = path.join(path.resolve(target), '.tic-code');
  if (!fs.existsSync(path.join(ticCodeDir, 'analysis.json'))) {
    console.error('Análise não encontrada. Rode `tic-analyzer analyze` primeiro.');
    return 2;
  }
  const read = (f: string) => { try { return JSON.parse(fs.readFileSync(path.join(ticCodeDir, f), 'utf8')); } catch { return null; } };
  const html = renderExecutiveHtml(buildExecReportData(read));
  const out = typeof args.flags.get('out') === 'string' ? path.resolve(args.flags.get('out') as string) : path.join(ticCodeDir, 'executive-report.html');
  fs.writeFileSync(out, html, 'utf8');
  console.error(`Relatório executivo (HTML) escrito em ${out}`);
  return 0;
}

(async () => {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  switch (command) {
    case 'analyze': process.exit(await cmdAnalyze(args));
    case 'health': process.exit(cmdHealth(args));
    case 'pr-review': process.exit(await cmdPrReview(args));
    case 'serve': process.exit(await cmdServe(args));
    case 'report': process.exit(cmdReport(args));
    case 'portfolio': process.exit(cmdPortfolio(args));
    default: usage();
  }
})().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(2);
});
