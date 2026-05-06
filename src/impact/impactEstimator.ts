import { DatabaseImpact, ImpactEstimate, ScreenImpactResult } from './impactTypes';
export function estimateImpact(partial: Pick<ScreenImpactResult,'frontendMatches'|'apiCalls'|'backendEndpoints'|'backendFlow'|'databaseImpact'|'input'|'gaps'|'questions'>): ImpactEstimate {
 let score=10; const reasons:string[]=[]; const risks:string[]=[];
 if (partial.apiCalls.length) {score+=20; reasons.push('Chamadas API detectadas.');}
 if (partial.backendEndpoints.some((e)=>e.confidence==='🟢 CONFIRMADO')) {score+=20; reasons.push('Endpoint backend mapeado.');}
 if (partial.backendFlow.length) {score+=20; reasons.push('Fluxo backend identificado.');}
 if (partial.databaseImpact.tables.length) {score+=20; reasons.push('Objetos de banco relacionados.');}
 if ((partial.databaseImpact as DatabaseImpact).writeOperations.length) {score+=25; risks.push('Operações de escrita em banco detectadas.');}
 if (/excluir|alterar regra|permiss|status|c[aá]lculo|pagamento|fiscal|aprova/i.test(partial.input.changeDescription)) {score+=20; risks.push('Descrição indica mudança sensível de regra.');}
 if (partial.gaps.length) {score+=15; risks.push('Existem lacunas na rastreabilidade.');}
 const level = score>=85?'CRITICAL':score>=60?'HIGH':score>=35?'MEDIUM':'LOW';
 return { level, score, reasons, risks, recommendedFilesToReview:[...new Set([...partial.frontendMatches.map((m)=>m.file), ...partial.backendEndpoints.map((e)=>e.controllerFile), ...partial.databaseImpact.sqlFiles])].filter((x)=>x&&x!=='N/A'), recommendedQuestions: partial.questions };
}
