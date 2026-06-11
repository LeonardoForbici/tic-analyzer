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
import { compareAnalyses, evaluateGates, formatPrComment } from './prReview';

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
               [--changed arquivo1,arquivo2 | --base-ref <ref>]`);
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
  return result.success ? 0 : 2;
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

  const result = compareAnalyses(path.resolve(baseDir as string), path.resolve(headDir as string), changedFiles);
  const gateSpec = typeof args.flags.get('gate') === 'string' ? (args.flags.get('gate') as string) : '';
  const gate = gateSpec ? evaluateGates(result, gateSpec) : undefined;
  const markdown = formatPrComment(result, gate);

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

(async () => {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  switch (command) {
    case 'analyze': process.exit(await cmdAnalyze(args));
    case 'health': process.exit(cmdHealth(args));
    case 'pr-review': process.exit(await cmdPrReview(args));
    default: usage();
  }
})().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(2);
});
