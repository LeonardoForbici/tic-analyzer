/**
 * Embeddings locais para busca semântica (Fase 4) — 100% offline em execução.
 *
 * O embedder é PLUGÁVEL e carregado de forma preguiçosa:
 *   - tenta `@xenova/transformers` com um modelo local (ONNX, sem chamada de API);
 *   - se o modelo não estiver disponível (ex.: host de modelos bloqueado por
 *     policy de rede), retorna `null` e o sistema cai para a busca FTS — sem
 *     quebrar nada.
 *
 * NB: o download do modelo (HuggingFace) pode ser bloqueado em sandboxes; nesse
 * caso a busca vetorial fica inativa e o FTS5 segue respondendo. Em uma máquina
 * com acesso ao modelo (ou com o modelo vendorado), a busca vetorial ativa.
 */
export type Embedder = (texts: string[]) => Promise<Float32Array[]>;

const MODEL = 'Xenova/all-MiniLM-L6-v2';

let cached: Embedder | null | undefined;

/** Retorna o embedder neural local, ou null se o modelo não estiver disponível. */
export async function getEmbedder(): Promise<Embedder | null> {
  if (cached !== undefined) return cached;
  try {
    // import() dinâmico preservado mesmo sob compilação CommonJS (pacote é ESM).
    const dynImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>;
    const { pipeline } = await dynImport('@xenova/transformers');
    const extractor = await pipeline('feature-extraction', MODEL, { quantized: true });
    cached = async (texts: string[]) => {
      const out = await extractor(texts, { pooling: 'mean', normalize: true });
      const [n, d] = out.dims as [number, number];
      const vecs: Float32Array[] = [];
      for (let i = 0; i < n; i++) vecs.push(Float32Array.from(out.data.slice(i * d, (i + 1) * d)));
      return vecs;
    };
  } catch {
    cached = null;
  }
  return cached;
}

/** Similaridade de cosseno entre dois vetores (assume normalizados ou não). */
export function cosine(a: Float32Array | number[], b: Float32Array | number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Serializa um vetor para BLOB (Float32) para armazenar no SQLite. */
export function vectorToBlob(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

/** Lê um BLOB Float32 de volta para Float32Array. */
export function blobToVector(blob: Buffer): Float32Array {
  return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
}
