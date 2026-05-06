import { DatabaseImpact, ImpactEstimate, ScreenImpactResult } from './impactTypes';
export function estimateImpact(partial: Pick<ScreenImpactResult,'frontendMatches'|'apiCalls'|'backendEndpoints'|'backendFlow'|'databaseImpact'|'input'|'gaps'|'questions'>): ImpactEstimate {
 let score=10; const reasons:string[]=[]; const risks:string[]=[];
 if (partial.apiCalls.length) {score+=20; reasons.push('Chamadas API detectadas.');}
 if (partial.backendEndpoints.some((e)=>e.confidence==='CONFIRMED')) {score+=20; reasons.push('Endpoint backend mapeado.');}
 if (partial.backendFlow.length) {score+=20; reasons.push('Fluxo backend identificado.');}
 if (partial.databaseImpact.tables.length) {score+=20; reasons.push('Objetos de banco relacionados.');}
 if ((partial.databaseImpact as DatabaseImpact).writeOperations.length) {score+=25; risks.push('Operações de escrita em banco detectadas.');}
 if (/excluir|alterar regra|permiss|status|c[aá]lculo|pagamento|fiscal|aprova/i.test(partial.input.changeDescription)) {score+=20; risks.push('Descrição indica mudança sensível de regra.');}
 if (partial.gaps.length) {score+=15; risks.push('Existem lacunas na rastreabilidade.');}
 const level = score>=85?'CRITICAL':score>=60?'HIGH':score>=35?'MEDIUM':'LOW';
 const effort= level==='LOW'?{minHours:0.25,maxHours:2,label:'15min a 2h',assumptions:['Mudança visual isolada']}:
 level==='MEDIUM'?{minHours:2,maxHours:6,label:'2h a 6h',assumptions:['Frontend + API/token compartilhado']}:
 level==='HIGH'?{minHours:8,maxHours:24,label:'8h a 24h',assumptions:['Backend/SQL envolvidos']}:{minHours:16,maxHours:40,label:'16h a 40h+',assumptions:['Fluxo crítico e alta incerteza']};
 return { level, score, reasons, risks, recommendedFilesToReview:[...new Set([...partial.frontendMatches.map((m)=>m.file), ...partial.backendEndpoints.map((e)=>e.controllerFile), ...partial.databaseImpact.sqlFiles])].filter((x)=>x&&x!=='N/A'), recommendedQuestions: partial.questions, estimatedEffort: effort };
}
