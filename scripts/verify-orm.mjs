/**
 * Verificação da camada ORM/DB multi-dialeto (Fase 3) — roda contra dist/.
 *
 * (1) Exercita o extrator real `extractSqlTables` com SQL dos 3 dialetos
 *     (Oracle/Postgres/SQLServer) — a função de produção, sem stub.
 * (2) Roda a pipeline real no fixture ORM (React → Controller → Service →
 *     Repository(JPA) → tabela PEDIDO) e prova a cadeia até a TABELA.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, rmSync } from 'node:fs';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const need = (p) => { if (!existsSync(p)) { console.error(`✗ dist ausente: ${p}. Rode \`npm run build:server\`.`); process.exit(1); } return p; };

const { extractSqlTables, parseSqlAccess } = require(need(join(root, 'dist/src/analyzer/detectOrmMappings.js')));
const { openIndexDb } = require(need(join(root, 'dist/src/analyzer/store/indexDb.js')));
const { queryCrossTierTrace, queryTableColumns } = require(need(join(root, 'dist/src/mcp/queries.js')));
const { runPipeline } = require(need(join(root, 'dist/src/analyzer/pipeline.js')));

const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); failures.push(name); }
};
const tablesOf = (sql) => extractSqlTables(sql).map((r) => `${r.mode}:${r.table}`);

console.log('\n(1) extractSqlTables — multi-dialeto (SQL real)\n');
// Oracle: schema-qualificado, JOIN
check('Oracle FROM/JOIN schema-qualificado', (() => {
  const t = tablesOf('SELECT * FROM hr.employees e JOIN hr.departments d ON e.dep = d.id');
  return t.includes('read:EMPLOYEES') && t.includes('read:DEPARTMENTS');
})(), tablesOf('SELECT * FROM hr.employees e JOIN hr.departments d ON e.dep = d.id').join(','));
// SQL Server: [dbo].[Tabela], INSERT
check('SQLServer INSERT [dbo].[Cliente]', tablesOf('INSERT INTO [dbo].[Cliente] (nome) VALUES (1)').includes('write:CLIENTE'));
// Postgres: "schema"."table", UPDATE
check('Postgres UPDATE "public"."pedido_item"', tablesOf('UPDATE "public"."pedido_item" SET x = 1 WHERE id = 2').includes('write:PEDIDO_ITEM'));
// DELETE genérico
check('DELETE FROM Conta', tablesOf('DELETE FROM Conta WHERE id = 1').includes('write:CONTA'));

console.log('\n(1b) parseSqlAccess — parser AST real + colunas\n');
const cols = (sql) => parseSqlAccess(sql).columns.map((c) => `${c.mode}:${c.table}.${c.column}`);
// SQL Server: colunas do INSERT atribuídas à tabela
check('colunas do INSERT (SQLServer) com tabela', (() => {
  const c = cols('INSERT INTO [dbo].[Cliente] (nome, cpf) VALUES (1, 2)');
  return c.includes('write:CLIENTE.NOME') && c.includes('write:CLIENTE.CPF');
})(), cols('INSERT INTO [dbo].[Cliente] (nome, cpf) VALUES (1, 2)').join(','));
// Oracle binds (:1) saneados → UPDATE com colunas
check('colunas do UPDATE com binds Oracle (:x)', (() => {
  const c = cols('UPDATE conta SET saldo = :saldo, limite = :lim WHERE id = :id');
  return c.includes('write:CONTA.SALDO') && c.includes('write:CONTA.LIMITE');
})(), cols('UPDATE conta SET saldo = :saldo, limite = :lim WHERE id = :id').join(','));

console.log('\n(2) Pipeline real — fixture ORM (cadeia até a tabela)\n');
const fixture = join(root, 'test', 'fixtures', 'orm');
const cleanup = () => { for (const p of ['.tic-code', '.github', 'CLAUDE.md']) rmSync(join(fixture, p), { recursive: true, force: true }); };

(async () => {
  const result = await runPipeline(fixture, () => {});
  check('pipeline concluiu', result.success, result.error ?? '');
  const db = openIndexDb(join(fixture, '.tic-code', 'index.db'));
  check('index.db gerado', !!db);
  if (db) {
    const trace = queryCrossTierTrace(db, 'PEDIDO');
    const labels = trace.samplePath.map((n) => n.label);
    check('entry resolve para a tabela PEDIDO', trace.entry?.label === 'PEDIDO', JSON.stringify(trace.entry));
    check('cadeia inclui o Repository (JPA)', labels.some((l) => l.includes('PedidoRepository')), labels.join(' → '));
    check('cadeia chega ao Frontend (TelaPedido)', labels.some((l) => l.includes('TelaPedido')), labels.join(' → '));
    check('cadeia ininterrupta Frontend→…→PEDIDO',
      ['TelaPedido', 'PedidoController', 'PedidoServiceImpl', 'PedidoRepository', 'PEDIDO']
        .every((w, i, arr) => labels.findIndex((l) => l.includes(w)) >= (i === 0 ? 0 : labels.findIndex((l2) => l2.includes(arr[i - 1])))),
      labels.join(' → '));
    if (labels.length) console.log('\n  Cadeia: ' + labels.join('  →  '));

    // lineage de coluna real (UPDATE pedido SET status, total ...)
    const lin = queryTableColumns(db, 'PEDIDO');
    const written = lin ? lin.writes.map((w) => w.column) : [];
    check('lineage de coluna: PEDIDO recebe escrita em STATUS e TOTAL',
      written.includes('STATUS') && written.includes('TOTAL'), written.join(','));

    db.close();
  }
  cleanup();
  console.log('');
  if (failures.length) { console.error(`✗ ${failures.length} verificação(ões) falharam`); process.exit(1); }
  console.log('✓ camada ORM/DB multi-dialeto verificada');
})().catch((e) => { console.error('Erro fatal:', e); cleanup(); process.exit(1); });
