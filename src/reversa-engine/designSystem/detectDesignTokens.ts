export function detectDesignTokens(content: string): string[] { return (content.match(/#[0-9a-fA-F]{3,8}|rgb\([^)]*\)|hsl\([^)]*\)/g) ?? []).slice(0,100); }
