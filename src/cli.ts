#!/usr/bin/env node
/**
 * TIC Analyzer CLI — roda a pipeline sem UI (para CI/CD)
 * Uso: npx ts-node src/cli.ts <pasta-do-projeto>
 *      node dist/cli.js <pasta-do-projeto>
 */
import * as path from 'path';
import { runPipeline } from './analyzer/pipeline';

const projectPath = process.argv[2];

if (!projectPath) {
  console.error('Uso: tic-analyzer <pasta-do-projeto>');
  process.exit(1);
}

const resolved = path.resolve(projectPath);
console.log(`TIC Analyzer — analisando: ${resolved}\n`);

runPipeline(resolved, (progress) => {
  const done = progress.phases.filter((p) => p.status === 'done').length;
  const total = progress.phases.length;
  const pct = Math.round((done / total) * 100);
  process.stdout.write(`\r[${pct.toString().padStart(3)}%] ${progress.detail.slice(0, 70).padEnd(70)}`);
}).then((result) => {
  process.stdout.write('\n\n');
  if (!result.success) {
    console.error('ERRO:', result.error);
    process.exit(1);
  }
  console.log('Analise concluida!');
  console.log(`  Arquivos:     ${result.totalFiles.toLocaleString()}`);
  console.log(`  Linhas:       ${result.totalLines.toLocaleString()}`);
  console.log(`  Modulos:      ${result.modulesGenerated}`);
  console.log(`  Hotspots:     ${result.hotspots}`);
  console.log(`  Violacoes:    ${result.violations}`);
  console.log(`  Padroes:      ${result.patterns}`);
  console.log(`  Impacto:      ${result.impactedFiles} arquivos mapeados`);
  console.log(`  Saida:        ${result.outputPath}`);
  process.exit(0);
}).catch((err) => {
  console.error('\nErro fatal:', err);
  process.exit(1);
});
