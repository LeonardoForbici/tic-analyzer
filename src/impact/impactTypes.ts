export type Confidence = '🟢 CONFIRMADO' | '🟡 INFERIDO' | '🔴 LACUNA';

export interface ScreenImpactInput { id: string; url: string; normalizedRoute: string; screenshotPath?: string; changeDescription: string; createdAt: string; }
export interface FrontendScreenMatch { route: string; file: string; componentName?: string; confidence: Confidence; evidence: string[]; matchedBy: 'exact-route'|'route-pattern'|'filename'|'component-name'|'inferred'; }
export interface ApiCallMatch { method?: string; path: string; file: string; line?: number; caller: string; confidence: Confidence; evidence: string[]; }
export interface BackendEndpointMatch { method: string; path: string; controllerFile: string; controllerClass?: string; controllerMethod?: string; serviceCandidates: string[]; confidence: Confidence; evidence: string[]; }
export interface BackendFlowNode { type: 'controller'|'service'|'bo'|'repository'|'dao'|'sql-resource'|'config'|'unknown'; file: string; symbol?: string; confidence: Confidence; evidence: string[]; }
export interface DatabaseImpact { sqlFiles: string[]; tables: string[]; views: string[]; functions: string[]; procedures: string[]; packages: string[]; triggers: string[]; readOperations: string[]; writeOperations: string[]; confidence: Confidence; evidence: string[]; }
export interface ImpactEstimate { level: 'LOW'|'MEDIUM'|'HIGH'|'CRITICAL'; score: number; reasons: string[]; risks: string[]; recommendedFilesToReview: string[]; recommendedQuestions: string[]; }
export interface ScreenImpactResult { input: ScreenImpactInput; frontendMatches: FrontendScreenMatch[]; apiCalls: ApiCallMatch[]; backendEndpoints: BackendEndpointMatch[]; backendFlow: BackendFlowNode[]; databaseImpact: DatabaseImpact; impactEstimate: ImpactEstimate; gaps: string[]; questions: string[]; generatedFiles: string[]; }
