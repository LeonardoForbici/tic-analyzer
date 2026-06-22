// rank: ciclomática hand-counted = 6 (1 base + for + if + && + else-if + ternary)
export function rank(items: number[], strict: boolean): number {
  let score = 0;
  for (const it of items) {
    if (it > 0 && strict) {
      score += it;
    } else if (it < -5) {
      score -= 1;
    }
  }
  return score > 0 ? score : 0;
}

// arrow simples: ciclomática = 1
export const noop = (): number => 42;
