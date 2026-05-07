import { createHash } from 'node:crypto';
import * as fs from 'fs';
import * as path from 'path';

export type ScreenshotConfidence = 'CONFIRMED' | 'INFERRED' | 'GAP';
export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'unknown';
export type ViewportKind = 'mobile' | 'tablet' | 'desktop' | 'wide' | 'unknown';
export type OrientationKind = 'portrait' | 'landscape' | 'square' | 'unknown';

export interface ScreenshotMetadata {
  filePath: string;
  fileName: string;
  extension?: string;
  format: ImageFormat;
  width?: number;
  height?: number;
  sizeBytes?: number;
  aspectRatio?: number;
  orientation: OrientationKind;
  viewport: ViewportKind;
  visualSignature: string;
}

export interface ScreenshotRecognition {
  fileName: string;
  metadata: ScreenshotMetadata;
  probableScreen: string;
  screenType: string;
  uiState: string;
  flowStage?: number;
  confidence: ScreenshotConfidence;
  recognitionScore: number;
  description: string;
  candidateTerms: string[];
  routeCandidates: string[];
  componentCandidates: string[];
  signals: string[];
  warnings: string[];
  primaryAction?: string;
}

const STOP_WORDS = new Set([
  'screenshot',
  'screen',
  'screens',
  'captura',
  'print',
  'imagem',
  'image',
  'img',
  'foto',
  'photo',
  'tela',
  'page',
  'pagina',
  'view',
  'ui',
  'ux',
  'final',
  'copy',
  'desktop',
  'mobile',
  'tablet',
  'web',
  'app'
]);

const SYNONYMS: Record<string, string[]> = {
  acesso: ['login', 'auth', 'entrar'],
  entrar: ['login', 'auth'],
  login: ['auth', 'signin', 'acesso'],
  cadastro: ['create', 'form', 'new'],
  criar: ['create', 'new'],
  novo: ['create', 'new'],
  editar: ['edit', 'form'],
  edicao: ['edit', 'form'],
  detalhe: ['detail', 'details'],
  detalhes: ['detail', 'details'],
  lista: ['list', 'table'],
  listagem: ['list', 'table'],
  tabela: ['table', 'grid', 'list'],
  painel: ['dashboard', 'home'],
  dashboard: ['painel', 'home'],
  relatorio: ['report', 'analytics'],
  relatorios: ['report', 'analytics'],
  config: ['settings', 'preferences'],
  configuracao: ['settings', 'preferences'],
  ajustes: ['settings', 'preferences'],
  erro: ['error', 'failure'],
  vazio: ['empty', 'blank'],
  carregando: ['loading'],
  sucesso: ['success', 'confirmation'],
  cliente: ['clientes', 'customer', 'customers'],
  clientes: ['cliente', 'customer', 'customers'],
  usuario: ['usuarios', 'user', 'users'],
  usuarios: ['usuario', 'user', 'users'],
  pedido: ['pedidos', 'order', 'orders'],
  pedidos: ['pedido', 'order', 'orders'],
  produto: ['produtos', 'product', 'products'],
  produtos: ['produto', 'product', 'products'],
  pagamento: ['payment', 'checkout'],
  pagamentos: ['payment', 'checkout'],
  financeiro: ['finance', 'billing'],
  fatura: ['invoice', 'billing'],
  search: ['busca', 'pesquisa'],
  busca: ['search', 'pesquisa'],
  filtro: ['filter', 'search'],
  upload: ['import', 'file'],
  importar: ['import', 'upload'],
  exportar: ['export', 'download']
};

export function analyzeScreenshotFile(filePath: string, order = 0): ScreenshotRecognition {
  const metadata = readScreenshotMetadata(filePath);
  const sourceTerms = extractTermsFromFile(filePath);
  const candidateTerms = expandTerms(sourceTerms);
  const screenType = inferScreenType(candidateTerms);
  const uiState = inferUiState(candidateTerms);
  const primaryAction = inferPrimaryAction(candidateTerms, screenType, uiState);
  const flowStage = extractFlowStage(metadata.fileName) ?? (Number.isFinite(order) ? order + 1 : undefined);
  const probableScreen = inferProbableScreen(sourceTerms, screenType, metadata);
  const enrichedTerms = unique([
    ...candidateTerms,
    screenType !== 'unknown' ? screenType : '',
    uiState !== 'standard' ? uiState : '',
    metadata.viewport !== 'unknown' ? metadata.viewport : ''
  ]).filter(Boolean);
  const routeCandidates = buildRouteCandidates(enrichedTerms, probableScreen);
  const componentCandidates = buildComponentCandidates(enrichedTerms, probableScreen);
  const signals = buildSignals(metadata, enrichedTerms, screenType, uiState, flowStage);
  const warnings = buildWarnings(metadata, sourceTerms, enrichedTerms);
  const recognitionScore = calculateScore(metadata, sourceTerms, screenType, uiState, flowStage);
  const confidence = classifyConfidence(metadata, sourceTerms, screenType, recognitionScore);
  const description = buildDescription(metadata, probableScreen, screenType, uiState, confidence, recognitionScore);

  return {
    fileName: metadata.fileName,
    metadata,
    probableScreen,
    screenType,
    uiState,
    flowStage,
    confidence,
    recognitionScore,
    description,
    candidateTerms: enrichedTerms,
    routeCandidates,
    componentCandidates,
    signals,
    warnings,
    primaryAction
  };
}

export function formatBytes(value?: number): string {
  if (typeof value !== 'number') return 'N/A';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function readScreenshotMetadata(filePath: string): ScreenshotMetadata {
  const fileName = path.basename(filePath);
  const extension = path.extname(fileName).replace('.', '').toLowerCase() || undefined;
  try {
    const bytes = fs.readFileSync(filePath);
    const stat = fs.statSync(filePath);
    const dimensions = readDimensions(bytes);
    const width = dimensions.width;
    const height = dimensions.height;
    const aspectRatio = width && height ? Number((width / height).toFixed(3)) : undefined;
    return {
      filePath,
      fileName,
      extension,
      format: dimensions.format,
      width,
      height,
      sizeBytes: stat.size,
      aspectRatio,
      orientation: inferOrientation(width, height),
      viewport: inferViewport(width, height),
      visualSignature: createHash('sha1').update(bytes.subarray(0, Math.min(bytes.length, 262144))).digest('hex').slice(0, 16)
    };
  } catch {
    return {
      filePath,
      fileName,
      extension,
      format: 'unknown',
      orientation: 'unknown',
      viewport: 'unknown',
      visualSignature: 'unreadable'
    };
  }
}

function readDimensions(bytes: Buffer): { format: ImageFormat; width?: number; height?: number } {
  const png = readPngDimensions(bytes);
  if (png) return { format: 'png', ...png };
  const jpeg = readJpegDimensions(bytes);
  if (jpeg) return { format: 'jpeg', ...jpeg };
  const webp = readWebpDimensions(bytes);
  if (webp) return { format: 'webp', ...webp };
  return { format: 'unknown' };
}

function readPngDimensions(bytes: Buffer): { width: number; height: number } | undefined {
  if (bytes.length < 24) return undefined;
  const isPng = bytes[0] === 0x89 && bytes.toString('ascii', 1, 4) === 'PNG';
  if (!isPng || bytes.toString('ascii', 12, 16) !== 'IHDR') return undefined;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function readJpegDimensions(bytes: Buffer): { width: number; height: number } | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  let offset = 2;
  while (offset < bytes.length - 9) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (marker === 0xda) break;
    if (offset + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if (isJpegSofMarker(marker)) {
      return {
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5)
      };
    }
    offset += length;
  }
  return undefined;
}

function isJpegSofMarker(marker: number): boolean {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function readWebpDimensions(bytes: Buffer): { width: number; height: number } | undefined {
  if (bytes.length < 30 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') {
    return undefined;
  }
  const chunk = bytes.toString('ascii', 12, 16);
  if (chunk === 'VP8X' && bytes.length >= 30) {
    return {
      width: bytes.readUIntLE(24, 3) + 1,
      height: bytes.readUIntLE(27, 3) + 1
    };
  }
  if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    const bits = bytes.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1
    };
  }
  if (chunk === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff
    };
  }
  return undefined;
}

function extractTermsFromFile(filePath: string): string[] {
  const fileName = path.basename(filePath, path.extname(filePath));
  const parent = path.basename(path.dirname(filePath));
  const parentTerms = ['visor', 'inputs', 'screens', 'screenshot', 'screenshots'].includes(parent.toLowerCase())
    ? []
    : extractTerms(parent);
  return unique([...extractTerms(fileName), ...parentTerms]);
}

function extractTerms(value: string): string[] {
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');

  return spaced
    .split(/\s+/g)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && !STOP_WORDS.has(item));
}

function expandTerms(terms: string[]): string[] {
  const out: string[] = [];
  for (const term of terms) {
    out.push(term);
    for (const synonym of SYNONYMS[term] ?? []) out.push(synonym);
  }
  return unique(out).slice(0, 40);
}

function inferScreenType(terms: string[]): string {
  const has = (...items: string[]) => items.some((item) => terms.includes(item));
  if (has('login', 'signin', 'auth', 'acesso')) return 'auth';
  if (has('dashboard', 'painel', 'home', 'analytics')) return 'dashboard';
  if (has('list', 'lista', 'listagem', 'table', 'grid', 'search', 'busca', 'filter')) return 'list';
  if (has('detail', 'details', 'detalhe', 'detalhes', 'profile', 'perfil')) return 'detail';
  if (has('form', 'create', 'new', 'edit', 'cadastro', 'editar')) return 'form';
  if (has('modal', 'dialog', 'popup')) return 'modal';
  if (has('checkout', 'payment', 'pagamento', 'invoice', 'billing')) return 'checkout';
  if (has('settings', 'config', 'configuracao', 'preferences', 'ajustes')) return 'settings';
  if (has('admin', 'security', 'permissao', 'permission')) return 'admin';
  if (has('report', 'relatorio', 'relatorios')) return 'report';
  if (has('error', 'erro', 'failure')) return 'error';
  return 'unknown';
}

function inferUiState(terms: string[]): string {
  const has = (...items: string[]) => items.some((item) => terms.includes(item));
  if (has('empty', 'vazio', 'blank')) return 'empty';
  if (has('loading', 'carregando', 'spinner')) return 'loading';
  if (has('error', 'erro', 'failure')) return 'error';
  if (has('success', 'sucesso', 'confirmation', 'confirmacao')) return 'success';
  if (has('create', 'new', 'novo', 'cadastro')) return 'create';
  if (has('edit', 'editar', 'edicao')) return 'edit';
  if (has('detail', 'details', 'detalhe')) return 'detail';
  if (has('list', 'lista', 'table', 'grid')) return 'list';
  return 'standard';
}

function inferPrimaryAction(terms: string[], screenType: string, uiState: string): string | undefined {
  const has = (...items: string[]) => items.some((item) => terms.includes(item));
  if (has('login', 'signin', 'auth')) return 'authenticate';
  if (uiState === 'create') return 'create';
  if (uiState === 'edit') return 'save';
  if (screenType === 'list' || has('search', 'busca', 'filter')) return 'search/filter';
  if (screenType === 'checkout') return 'pay/confirm';
  if (has('upload', 'import')) return 'import';
  if (has('export', 'download')) return 'export';
  return undefined;
}

function extractFlowStage(fileName: string): number | undefined {
  const match = fileName.match(/(?:^|[-_\s])(\d{1,3})(?:[-_\s]|$)/);
  if (!match) return undefined;
  const stage = Number(match[1]);
  return Number.isFinite(stage) && stage > 0 ? stage : undefined;
}

function inferProbableScreen(terms: string[], screenType: string, metadata: ScreenshotMetadata): string {
  const semanticTerms = terms
    .filter((term) => !/^\d+$/.test(term))
    .filter((term) => !['create', 'new', 'edit', 'list', 'detail', 'details'].includes(term))
    .slice(0, 4);
  if (semanticTerms.length > 0 && screenType !== 'unknown') {
    return `${titleCase(screenType)} - ${titleCase(semanticTerms.join(' '))}`;
  }
  if (semanticTerms.length > 0) {
    return titleCase(semanticTerms.join(' '));
  }
  if (metadata.width && metadata.height) {
    return `Tela ${metadata.viewport} ${metadata.width}x${metadata.height}`;
  }
  return 'Tela nao identificada';
}

function buildRouteCandidates(terms: string[], probableScreen: string): string[] {
  const slugs = unique([slugify(probableScreen), ...terms.map(slugify)]).filter(Boolean);
  const routes = slugs.map((slug) => `/${slug}`);
  if (terms.length >= 2) routes.push(`/${slugify(terms.slice(0, 2).join('-'))}`);
  if (terms.length >= 3) routes.push(`/${slugify(terms.slice(0, 3).join('-'))}`);
  return unique(routes).slice(0, 12);
}

function buildComponentCandidates(terms: string[], probableScreen: string): string[] {
  const baseNames = unique([probableScreen, terms.slice(0, 2).join(' '), terms.slice(0, 3).join(' '), ...terms.slice(0, 8)])
    .map(toPascalCase)
    .filter(Boolean);
  const out: string[] = [];
  for (const base of baseNames) {
    out.push(base, `${base}Page`, `${base}Screen`, `${base}View`, `${base}Component`);
  }
  return unique(out).slice(0, 24);
}

function buildSignals(
  metadata: ScreenshotMetadata,
  terms: string[],
  screenType: string,
  uiState: string,
  flowStage?: number
): string[] {
  const signals = [
    `format:${metadata.format}`,
    metadata.width && metadata.height ? `dimensions:${metadata.width}x${metadata.height}` : 'dimensions:GAP',
    `viewport:${metadata.viewport}`,
    `orientation:${metadata.orientation}`,
    `signature:${metadata.visualSignature}`,
    `screen-type:${screenType}`,
    `ui-state:${uiState}`,
    terms.length ? `terms:${terms.slice(0, 12).join(',')}` : 'terms:GAP'
  ];
  if (flowStage) signals.push(`flow-stage:${flowStage}`);
  return signals;
}

function buildWarnings(metadata: ScreenshotMetadata, sourceTerms: string[], enrichedTerms: string[]): string[] {
  const warnings: string[] = [];
  if (!metadata.width || !metadata.height) warnings.push('GAP: dimensoes da imagem nao foram detectadas.');
  if (metadata.format === 'unknown') warnings.push('GAP: formato de imagem nao reconhecido como PNG/JPEG/WebP.');
  if (sourceTerms.length === 0) warnings.push('GAP: nome do arquivo nao possui termos uteis para inferencia de tela.');
  if (enrichedTerms.length < 3) warnings.push('INFERIDO: poucos sinais textuais; confirme a tela com evidencia humana.');
  warnings.push('INFERIDO: OCR/modelo de visao nao executado; reconhecimento usa metadados locais e nome do arquivo.');
  return unique(warnings);
}

function calculateScore(
  metadata: ScreenshotMetadata,
  sourceTerms: string[],
  screenType: string,
  uiState: string,
  flowStage?: number
): number {
  let score = 0;
  if (metadata.width && metadata.height) score += 25;
  if (metadata.format !== 'unknown') score += 10;
  if (metadata.sizeBytes && metadata.sizeBytes > 0) score += 5;
  if (metadata.viewport !== 'unknown') score += 5;
  score += Math.min(30, sourceTerms.length * 7);
  if (screenType !== 'unknown') score += 15;
  if (uiState !== 'standard') score += 6;
  if (flowStage) score += 4;
  return Math.min(100, score);
}

function classifyConfidence(
  metadata: ScreenshotMetadata,
  sourceTerms: string[],
  screenType: string,
  score: number
): ScreenshotConfidence {
  if (score < 35) return 'GAP';
  if (metadata.width && metadata.height && sourceTerms.length >= 3 && screenType !== 'unknown') return 'CONFIRMED';
  return 'INFERRED';
}

function buildDescription(
  metadata: ScreenshotMetadata,
  probableScreen: string,
  screenType: string,
  uiState: string,
  confidence: ScreenshotConfidence,
  score: number
): string {
  const dimension = metadata.width && metadata.height ? `${metadata.width}x${metadata.height}` : 'dimensao nao detectada';
  return `${confidence}: ${probableScreen} (${screenType}, ${uiState}) em ${metadata.viewport}/${metadata.orientation}, ${dimension}, score ${score}.`;
}

function inferOrientation(width?: number, height?: number): OrientationKind {
  if (!width || !height) return 'unknown';
  if (Math.abs(width - height) <= Math.max(width, height) * 0.06) return 'square';
  return width > height ? 'landscape' : 'portrait';
}

function inferViewport(width?: number, height?: number): ViewportKind {
  if (!width || !height) return 'unknown';
  const shortSide = Math.min(width, height);
  const ratio = width / height;
  if (ratio >= 2.15) return 'wide';
  if (shortSide <= 480 || (width <= 520 && height >= 700)) return 'mobile';
  if (shortSide <= 900 && Math.max(width, height) <= 1400) return 'tablet';
  return 'desktop';
}

function titleCase(value: string): string {
  return value
    .split(/\s+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toPascalCase(value: string): string {
  return slugify(value)
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const clean = value.trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}
