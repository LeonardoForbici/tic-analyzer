export function normalizeRoute(url: string): string {
  try { const u = new URL(url); return clean(u.pathname); } catch { return clean(url); }
}
function clean(route: string): string { const p = route.split('?')[0].split('#')[0].trim(); return p.startsWith('/') ? p : `/${p}`; }
export function routeTokens(route: string): string[] { return normalizeRoute(route).split('/').filter(Boolean).flatMap((t) => t.split(/[-_]/g)).filter(Boolean); }
