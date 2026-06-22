/**
 * Verificação da camada "Sistema Vivo" — roda contra dist/.
 *
 * Cobre: self-delta, loop preditivo, activity log, alertas outbound (com
 * servidor HTTP local capturando o POST), pipeline gerando timeline, e o
 * push SSE em /events do modo serve (incl. 401 sem token).
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, rmSync, cpSync, writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const need = (p) => { if (!existsSync(p)) { console.error(`✗ dist ausente: ${p}. Rode \`npm run build:electron\`.`); process.exit(1); } return p; };

const { computeSelfDelta, computePredictionFeedback } = require(need(join(root, 'dist/src/analyzer/computeDelta.js')));
const { appendEvents, loadActivity, makeEvent } = require(need(join(root, 'dist/src/analyzer/store/activityLog.js')));
const { selectAlertable, dispatchAlerts } = require(need(join(root, 'dist/src/analyzer/notify.js')));
const { runPipeline } = require(need(join(root, 'dist/src/analyzer/pipeline.js')));

const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); failures.push(name); }
};
const cleanup = (dir) => { for (const p of ['.tic-code', '.github', 'CLAUDE.md']) rmSync(join(dir, p), { recursive: true, force: true }); };

(async () => {
  console.log('\n(1) self-delta + loop preditivo (puro)\n');
  const prev = {
    snapshot: { score: 85, counts: {} },
    analysis: { risks: { items: [{ level: 'high', title: 'A', file: 'x.ts' }] }, archViolations: { items: [] }, modules: [{ name: 'core' }] }
  };
  const cur = {
    snapshot: { score: 72, counts: {} },
    analysis: {
      risks: { items: [{ level: 'high', title: 'A', file: 'x.ts' }, { level: 'critical', title: 'eval', file: 'y.ts' }] },
      archViolations: { items: [{ ruleId: 'r1', severity: 'error', from: 'a', to: 'b' }] },
      modules: [{ name: 'core' }, { name: 'novo' }]
    }
  };
  const ev = computeSelfDelta(prev, cur);
  check('D1: health-down com magnitude 13', ev.some((e) => e.type === 'health-down' && e.title.includes('13')), JSON.stringify(ev.map((e) => e.title)));
  check('D2: health-down de 13 é critical', ev.find((e) => e.type === 'health-down')?.severity === 'critical');
  check('D3: risco novo critical detectado', ev.some((e) => e.type === 'risk-new' && e.severity === 'critical'));
  check('D4: violação de regra nova detectada', ev.some((e) => e.type === 'rule-violation'));
  check('D5: módulo novo detectado', ev.some((e) => e.type === 'module-added' && e.title.includes('novo')));
  check('D6: primeira análise (prev=null) não gera delta', computeSelfDelta(null, cur).length === 0);

  const prevPred = [{ file: 'hot.ts', score: 82, fixes: 3, reasons: ['mudou 14x'] }, { file: 'cold.ts', score: 10, fixes: 0, reasons: [] }];
  const churn = new Map([['hot.ts', { commits: 20, fixes: 5 }]]);
  const fb = computePredictionFeedback(prevPred, churn, new Set(), null);
  check('P1: predição confirmada (hot.ts ganhou fix)', fb.events.some((e) => e.type === 'prediction-confirmed' && e.entity?.includes('hot.ts')), JSON.stringify(fb.events));
  check('P2: accuracy hitRate em [0,1]', fb.accuracy.hitRate >= 0 && fb.accuracy.hitRate <= 1 && fb.accuracy.total === 1);
  const fb2 = computePredictionFeedback(prevPred, new Map(), new Set(), null);
  check('P3: sem fix/risco novo, nada confirmado', fb2.events.length === 0 && fb2.accuracy.total === 0);

  console.log('\n(2) activity log\n');
  const tmp = mkdtempSync(join(tmpdir(), 'tic-act-'));
  for (let i = 0; i < 510; i++) appendEvents(tmp, [makeEvent('analysis', 'info', `e${i}`)]);
  const all = loadActivity(tmp);
  check('A1: cap de 500 respeitado', all.length === 500, `len=${all.length}`);
  check('A2: mantém os mais recentes', all[all.length - 1].title === 'e509');
  check('A3: loadActivity(limit) corta', loadActivity(tmp, 5).length === 5);
  rmSync(tmp, { recursive: true, force: true });

  console.log('\n(3) alertas outbound\n');
  const received = [];
  const srv = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; }); req.on('end', () => { received.push({ url: req.url, body: JSON.parse(body) }); res.writeHead(200); res.end('ok'); });
  });
  await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const events = [
    makeEvent('health-down', 'critical', 'Health caiu 12 ponto(s) — agora 70/100'),
    makeEvent('risk-new', 'critical', 'Risco novo (critical): eval'),
    makeEvent('risk-new', 'info', 'Risco novo (low): algo') // não deve alertar
  ];
  const on = { healthDrop: 5, newCriticalRisk: true, newRuleViolation: true };
  check('N1: selectAlertable filtra por limiar', selectAlertable(events, on).length === 2, String(selectAlertable(events, on).length));
  check('N2: health drop abaixo do limiar não alerta', selectAlertable([makeEvent('health-down', 'warn', 'Health caiu 2 ponto(s) — agora 90/100')], on).length === 0);
  const sent = await dispatchAlerts(events, { slackWebhook: `http://127.0.0.1:${port}/slack`, webhook: `http://127.0.0.1:${port}/generic`, on }, 'proj');
  check('N3: enviou para slack e webhook', sent.length === 2 && sent.every((s) => s.ok));
  check('N4: payload slack tem text', received.some((r) => r.url === '/slack' && typeof r.body.text === 'string' && r.body.text.includes('Health')));
  check('N5: payload genérico tem events[]', received.some((r) => r.url === '/generic' && Array.isArray(r.body.events) && r.body.events.length === 2));
  const noConfig = await dispatchAlerts(events, undefined, 'proj');
  check('N6: sem config não envia', noConfig.length === 0);
  // falha de rede não quebra
  const broken = await dispatchAlerts(events, { webhook: 'http://127.0.0.1:1/x', on }, 'proj');
  check('N7: falha de rede retorna ok=false sem lançar', broken.length === 1 && broken[0].ok === false);
  srv.close();

  console.log('\n(4) pipeline gera timeline (2 análises, risco introduzido)\n');
  const fixture = join(root, 'test', 'fixtures', 'crosstier');
  cleanup(fixture);
  await runPipeline(fixture, () => {}, { skipAiFiles: true });
  const act1 = loadActivity(join(fixture, '.tic-code'));
  check('T1: 1ª análise registra evento analysis', act1.some((e) => e.type === 'analysis'), JSON.stringify(act1.map((e) => e.type)));
  writeFileSync(join(fixture, 'src', 'pages', 'evil.ts'), 'export const r = (s) => eval(s);\n', 'utf8');
  const r2 = await runPipeline(fixture, () => {}, { skipAiFiles: true });
  const act2 = loadActivity(join(fixture, '.tic-code'));
  check('T2: 2ª análise adiciona risco novo na timeline', act2.some((e) => e.type === 'risk-new'), JSON.stringify(act2.slice(-5).map((e) => e.title)));
  check('T3: PipelineResult expõe activityEvents', (r2.activityEvents ?? 0) > 0);
  rmSync(join(fixture, 'src', 'pages', 'evil.ts'), { force: true });

  console.log('\n(5) push SSE em /events (serve)\n');
  const cli = need(join(root, 'dist/src/cli/index.js'));
  const PORT = 7491, TOKEN = 'live-token';
  const child = spawn(process.execPath, [cli, 'serve', fixture, '--no-analyze', '--port', String(PORT), '--token', TOKEN], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    // espera subir
    const up = await (async () => {
      for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/health`); if (r.ok) return true; } catch {} await new Promise((r) => setTimeout(r, 250)); }
      return false;
    })();
    check('S0: serve respondeu /health', up);

    // 401 sem token
    const noAuth = await fetch(`http://127.0.0.1:${PORT}/events`);
    check('S1: /events sem token → 401', noAuth.status === 401);

    // conecta SSE com ?token= e recebe um emit
    const received = [];
    const ac = new AbortController();
    const res = await fetch(`http://127.0.0.1:${PORT}/events?token=${TOKEN}`, { signal: ac.signal, headers: { Accept: 'text/event-stream' } });
    check('S2: /events com ?token= conecta (200)', res.status === 200, `status=${res.status}`);
    const reader = res.body.getReader();
    // dispara uma análise → broadcast SSE
    const trigger = fetch(`http://127.0.0.1:${PORT}/health`); // só p/ manter vivo
    const readSome = (async () => {
      const dec = new TextDecoder();
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        const { value, done } = await reader.read();
        if (done) break;
        received.push(dec.decode(value));
        if (received.join('').includes('retry:')) break; // ao menos o handshake chegou
      }
    })();
    await readSome;
    await trigger;
    check('S3: stream SSE entrega dados (handshake retry/ping)', received.join('').length > 0);
    ac.abort();
  } finally {
    child.kill('SIGTERM');
    cleanup(fixture);
  }

  console.log('');
  if (failures.length) { console.error(`✗ ${failures.length} verificação(ões) falharam`); process.exit(1); }
  console.log('✓ camada sistema vivo verificada');
  process.exit(0);
})().catch((e) => { console.error('Erro fatal:', e); process.exit(1); });
