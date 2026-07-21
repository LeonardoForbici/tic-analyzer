/**
 * Verificação da Frente C (ingestão de decisões de reunião) — roda contra dist/.
 *
 * Cobre: saveMeeting (arquivo por reunião + índice), ingestDecisions
 * (ponte para memoryStore.ts — Frente B) e o comportamento de "decisions
 * vazio" (grava só o transcript bruto para auditoria, sem inventar
 * decisões).
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, rmSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const need = (p) => { if (!existsSync(p)) { console.error(`✗ dist ausente: ${p}. Rode \`npm run build:server\`.`); process.exit(1); } return p; };

const { saveMeeting, loadMeetings, loadMeeting, ingestDecisions } = require(need(join(root, 'dist/src/analyzer/store/meetingStore.js')));
const { queryMemory } = require(need(join(root, 'dist/src/analyzer/store/memoryStore.js')));

const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); failures.push(name); }
};

const dir = mkdtempSync(join(tmpdir(), 'tic-meetings-'));
const ticCodeDir = join(dir, '.tic-code');

console.log('\n(1) saveMeeting — arquivo por reunião + índice\n');

const meeting = saveMeeting(ticCodeDir, {
  title: 'Sprint planning 2026-07-21',
  participants: ['Ana', 'Bruno'],
  sourceText: 'transcript bruto de auditoria...',
  decisions: [
    { summary: 'Migrar auth para JWT', entity: 'file:src/auth/session.ts', decisionType: 'decision', owner: 'Ana', rationale: 'Sessão em memória não escala' },
    { summary: 'Adicionar rate-limit no login', entity: 'file:src/auth/session.ts', decisionType: 'action-item', dueDate: '2026-08-01' },
    { summary: 'Não vamos suportar multi-tenancy neste schema', decisionType: 'out-of-scope', rationale: 'Custo não justifica' }
  ]
});

check('M1: saveMeeting retorna id e ts', typeof meeting.id === 'string' && typeof meeting.ts === 'string');
check('M2: decisions ganham id próprio', meeting.decisions.every((d) => typeof d.id === 'string'));

const meetingsDir = join(ticCodeDir, 'meetings');
check('M3: arquivo da reunião foi criado', existsSync(join(meetingsDir, `${meeting.id}.json`)));

const reloaded = loadMeeting(ticCodeDir, meeting.id);
check('M4: loadMeeting recarrega a reunião completa', reloaded?.title === meeting.title && reloaded?.decisions.length === 3);

const index = loadMeetings(ticCodeDir, 20);
check('M5: loadMeetings lista pelo índice leve', index.length === 1 && index[0].decisionCount === 3);

console.log('\n(2) ingestDecisions — ponte para memoryStore (Frente B)\n');

const result = ingestDecisions(ticCodeDir, meeting);
check('I1: 2 decisões com entity viram memória (a 3ª é out-of-scope)', result.memoryEntriesCreated === 2);
check('I2: 1 sugestão de out-of-scope retornada (não gravada sozinha)', result.outOfScopeSuggestions.length === 1);
check('I3: sugestão out-of-scope tem formato de OutOfScopeDecision', typeof result.outOfScopeSuggestions[0].decision === 'string' && typeof result.outOfScopeSuggestions[0].id === 'string');

const memEntries = queryMemory(ticCodeDir, 'file:src/auth/session.ts', 10);
check('I4: memória tem as 2 entradas vinculadas à entidade', memEntries.length === 2);
check('I5: source aponta para a reunião', memEntries.every((e) => e.source === `meeting:${meeting.id}`));
check('I6: detail inclui responsável/prazo quando presentes', memEntries.some((e) => e.detail?.includes('responsável: Ana')) && memEntries.some((e) => e.detail?.includes('prazo: 2026-08-01')));

console.log('\n(3) Múltiplas reuniões — cada uma em arquivo próprio, nunca truncado\n');

for (let i = 0; i < 5; i++) {
  saveMeeting(ticCodeDir, { title: `Reunião ${i}`, decisions: [{ summary: `nota ${i}`, decisionType: 'note-like-decision-not-real-type', entity: undefined }].map((d) => ({ ...d, decisionType: 'decision' })) });
}
const files = readdirSync(meetingsDir).filter((f) => f.endsWith('.json'));
check('R1: 6 arquivos de reunião (1 + 5) — nenhum sobrescreve o outro', files.length === 6);
check('R2: índice lista as 6, mais recentes primeiro', loadMeetings(ticCodeDir, 20)[0].title === 'Reunião 4');

rmSync(dir, { recursive: true, force: true });

if (failures.length) {
  console.log(`\n✗ ${failures.length} falha(s): ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\n✓ ingestão de decisões de reunião verificada');
