/** 1 token ≈ 4 chars (conservador para pt/en misto) */
export const CHARS_PER_TOKEN = 4;

export class TokenBudget {
  private used = 0;

  constructor(private readonly maxTokens: number) {}

  get remaining() { return this.maxTokens - this.used; }
  get usedTokens() { return this.used; }

  fits(content: string): boolean {
    return Math.ceil(content.length / CHARS_PER_TOKEN) <= this.remaining;
  }

  consume(content: string): boolean {
    const t = Math.ceil(content.length / CHARS_PER_TOKEN);
    if (t > this.remaining) return false;
    this.used += t;
    return true;
  }

  truncate(content: string, suffix = '\n\n> ⚠️ Truncado — limite de tokens atingido.'): string {
    const maxChars = this.remaining * CHARS_PER_TOKEN - suffix.length;
    if (content.length <= maxChars) { this.used += Math.ceil(content.length / CHARS_PER_TOKEN); return content; }
    const out = content.slice(0, Math.max(0, maxChars)) + suffix;
    this.used += Math.ceil(out.length / CHARS_PER_TOKEN);
    return out;
  }
}

export function estimateTokens(content: string): number {
  return Math.ceil(content.length / CHARS_PER_TOKEN);
}
