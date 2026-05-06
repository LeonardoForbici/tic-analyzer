export function importVisorScreenshots(paths: string[]): string[] { return paths.filter((p) => /\.(png|jpe?g|webp)$/i.test(p)); }
