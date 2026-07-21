/**
 * Verificação da Frente A (agentes de disparo) — roda contra dist/.
 *
 * Cobre: evaluateTriggers (puro), decideDispatch (puro — rate-limit,
 * idempotência, circuit breaker) e runAgentDispatch fim-a-fim contra um
 * GhClient fake (sem rede real) + dispatchLog.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const need = (p) => { if (!existsSync(p)) { console.error(`✗ dist ausente: ${p}. Rode \`npm run build:server\`.`); process.exit(1); } return p; };

const { evaluateTriggers } = require(need(join(root, 'dist/src/analyzer/triggers/evaluateTriggers.js')));
const { decideDispatch } = require(need(join(root, 'dist/src/analyzer/agents/dispatcher.js')));
const { runAgentDispatch } = require(need(join(root, 'dist/src/analyzer/agents/runAgentDispatch.js')));
const { loadDispatchLog } = require(need(join(root, 'dist/src/analyzer/store/dispatchLog.js')));
const { appendMemory } = require(need(join(root, 'dist/src/analyzer/store/memoryStore.js')));
const { makeEvent } = require(need(join(root, 'dist/src/analyzer/store/activityLog.js')));

const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); failures.push(name); }
};

console.log('\n(1) evaluateTriggers (puro)\n');

const events = [
  makeEvent('health-down', 'critical', 'Health caiu 15 ponto(s) — agora 60/100'),
  makeEvent('health-down', 'warn', 'Health caiu 2 ponto(s) — agora 80/100'),
  makeEvent('risk-new', 'critical', 'Risco novo (critical): eval()', undefined, 'file:x.ts'),
  makeEvent('risk-new', 'warn', 'Risco novo (medium): y', undefined, 'file:y.ts'),
  makeEvent('rule-violation', 'critical', 'Regra violada', undefined, 'file:z.ts'),
  makeEvent('ci-failure', 'critical', 'CI falhou'),
  makeEvent('build-failure', 'critical', 'Build falhou')
];

const t1 = evaluateTriggers(events, { healthDrop: 10 });
check('E1: healthDrop 10 pega a queda de 15 mas não a de 2', t1.length === 1 && t1[0].event.title.includes('15'));

const t2 = evaluateTriggers(events, { newCriticalRisk: true });
check('E2: newCriticalRisk pega só o critical', t2.length === 1 && t2[0].entity === 'file:x.ts');

const t3 = evaluateTriggers(events, { newRuleViolation: true });
check('E3: newRuleViolation pega a violação critical', t3.length === 1 && t3[0].entity === 'file:z.ts');

const t4 = evaluateTriggers(events, { ciFailure: true, buildFailure: true });
check('E4: ciFailure + buildFailure pegam os dois sintéticos', t4.length === 2);

const t5 = evaluateTriggers(events, {});
check('E5: sem "on" configurado, nada dispara', t5.length === 0);

console.log('\n(2) decideDispatch (puro) — guardrails\n');

const matchA = { event: makeEvent('risk-new', 'critical', 'Risco A', undefined, 'file:a.ts'), entity: 'file:a.ts' };
const matchB = { event: makeEvent('risk-new', 'critical', 'Risco B', undefined, 'file:b.ts'), entity: 'file:b.ts' };
const matchC = { event: makeEvent('risk-new', 'critical', 'Risco C', undefined, 'file:c.ts'), entity: 'file:c.ts' };
const now = new Date('2026-07-21T12:00:00Z');

// R1: sem histórico, tudo dispara
const d1 = decideDispatch([matchA, matchB], new Map(), [], { enabled: true, on: {}, mode: 'issue-only' }, now);
check('R1: sem histórico, ambos elegíveis', d1.every((d) => d.shouldDispatch));

// R2: rate-limit diário
const d2 = decideDispatch([matchA, matchB, matchC], new Map(), [], { enabled: true, on: {}, mode: 'issue-only', maxDispatchesPerDay: 2 }, now);
check('R2: com maxDispatchesPerDay=2, só os 2 primeiros disparam', d2.filter((d) => d.shouldDispatch).length === 2);
check('R2b: o 3º é bloqueado por limite diário', d2[2].shouldDispatch === false && d2[2].reason.includes('limite diário'));

// R3: idempotência — já disparado hoje para a mesma entity+trigger
const recentDispatches = [{ id: '1', ts: now.toISOString(), entity: 'file:a.ts', trigger: 'risk-new', mode: 'issue-only', status: 'dispatched' }];
const d3 = decideDispatch([matchA], new Map(), recentDispatches, { enabled: true, on: {}, mode: 'issue-only' }, now);
check('R3: já disparado hoje para a mesma entity/trigger → skip', d3[0].shouldDispatch === false && d3[0].reason.includes('idempotência'));

// R4: circuit breaker — 2+ falhas recentes na memória para a entidade
const failedMemory = new Map([['file:a.ts', [
  { id: 'm1', ts: now.toISOString(), entity: 'file:a.ts', kind: 'outcome', summary: 'x', result: 'failed' },
  { id: 'm2', ts: now.toISOString(), entity: 'file:a.ts', kind: 'outcome', summary: 'y', result: 'failed' }
]]]);
const d4 = decideDispatch([matchA], failedMemory, [], { enabled: true, on: {}, mode: 'issue-only' }, now);
check('R4: 2 falhas anteriores → circuit breaker bloqueia', d4[0].shouldDispatch === false && d4[0].reason.includes('circuit breaker'));

// R5: 1 falha só não deve disparar o circuit breaker
const oneFailure = new Map([['file:a.ts', [{ id: 'm1', ts: now.toISOString(), entity: 'file:a.ts', kind: 'outcome', summary: 'x', result: 'failed' }]]]);
const d5 = decideDispatch([matchA], oneFailure, [], { enabled: true, on: {}, mode: 'issue-only' }, now);
check('R5: só 1 falha anterior ainda permite disparo', d5[0].shouldDispatch === true);

console.log('\n(3) runAgentDispatch fim-a-fim contra GhClient fake (sem rede)\n');

const dir = mkdtempSync(join(tmpdir(), 'tic-agents-'));
const ticCodeDir = join(dir, '.tic-code');

const createdIssues = [];
const fakeClient = {
  async resolvePr() { return null; },
  async resolveCommit() { return null; },
  async resolveIssue() { return null; },
  async findOpenIssueByTitle() { return null; },
  async createIssue(repo, title, body, labels) {
    const issue = { kind: 'issue', repo, number: createdIssues.length + 1, url: `http://mock/issues/${createdIssues.length + 1}`, title, state: 'open' };
    createdIssues.push({ repo, title, body, labels });
    return issue;
  },
  async assignCopilot() { throw new Error('sem permissão para atribuir Copilot (mock)'); },
  async createPrWithCopilot() { throw new Error('Copilot coding agent indisponível (mock)'); },
  async getWorkflowRunStatus() { return null; }
};

const match = { event: makeEvent('risk-new', 'critical', 'Risco crítico em service.ts', undefined, 'file:service.ts'), entity: 'file:service.ts' };
const config = { enabled: true, on: { newCriticalRisk: true }, mode: 'issue-only', repo: 'acme/widgets', maxDispatchesPerDay: 5 };

const result1 = await runAgentDispatch(dir, ticCodeDir, [match], config, fakeClient);
check('D1: runAgentDispatch cria 1 issue (modo issue-only)', createdIssues.length === 1 && result1.records[0].status === 'dispatched');
check('D2: dispatch-log.json grava o record', loadDispatchLog(ticCodeDir).length === 1);

// D3: idempotência via dispatch-log real — mesma entity/trigger no mesmo dia não redispara
const result2 = await runAgentDispatch(dir, ticCodeDir, [match], config, fakeClient);
check('D3: segunda chamada no mesmo dia não cria nova issue (idempotência real)', createdIssues.length === 1);
check('D4: segundo record fica skipped', result2.records[0].status === 'skipped');

// D5: modo assign-copilot cai para issue-only quando a atribuição falha (fallback automático)
const dir2 = mkdtempSync(join(tmpdir(), 'tic-agents-2-'));
const ticCodeDir2 = join(dir2, '.tic-code');
const config2 = { enabled: true, on: {}, mode: 'assign-copilot', repo: 'acme/widgets' };
const result3 = await runAgentDispatch(dir2, ticCodeDir2, [match], config2, fakeClient);
check('D5: assign-copilot falho cai para issue-only automaticamente', result3.records[0].status === 'dispatched' && result3.records[0].mode === 'issue-only');

rmSync(dir, { recursive: true, force: true });
rmSync(dir2, { recursive: true, force: true });

if (failures.length) {
  console.log(`\n✗ ${failures.length} falha(s): ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\n✓ agentes de disparo verificados');
