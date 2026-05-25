/**
 * Controle de orçamento de tokens para Large Project Mode.
 * Estimativa: 1 token ≈ 4 caracteres (conservador para português/inglês misto).
 */

export const CHARS_PER_TOKEN = 4;

export class TokenBudget {
  private used = 0;

  constructor(private readonly maxTokens: number) {}

  get remaining(): number {
    return this.maxTokens - this.used;
  }

  fits(content: string): boolean {
    return Math.ceil(content.length / CHARS_PER_TOKEN) <= this.remaining;
  }

  consume(content: string): boolean {
    const tokens = Math.ceil(content.length / CHARS_PER_TOKEN);
    if (tokens > this.remaining) return false;
    this.used += tokens;
    return true;
  }

  /** Adiciona conteúdo truncado para caber no budget. Nunca falha. */
  truncate(content: string, suffix = '\n\n> ⚠️ Conteúdo truncado — orçamento de tokens atingido.'): string {
    const maxChars = this.remaining * CHARS_PER_TOKEN - suffix.length;
    if (content.length <= maxChars) {
      this.used += Math.ceil(content.length / CHARS_PER_TOKEN);
      return content;
    }
    const truncated = content.slice(0, Math.max(0, maxChars)) + suffix;
    this.used += Math.ceil(truncated.length / CHARS_PER_TOKEN);
    return truncated;
  }
}

export function estimateTokens(content: string): number {
  return Math.ceil(content.length / CHARS_PER_TOKEN);
}
