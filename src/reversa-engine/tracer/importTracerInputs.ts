export function importTracerInputs(paths: string[]): string[] { return paths.filter((p) => /\.(log|txt|json|ndjson)$/i.test(p)); }
