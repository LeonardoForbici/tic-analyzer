/**
 * Classifies dependency specifiers as internal, external, or framework.
 *
 * Internal  → file exists inside the workspace; edge shown by default.
 * External  → known third-party package; hidden from graph by default.
 * Framework → well-known framework family; hidden from graph by default.
 */

export type DependencyOrigin = 'internal' | 'external' | 'framework';

export interface DependencyClassification {
  origin: DependencyOrigin;
  /** Set when origin is 'framework'. */
  frameworkName?: string;
  /** Whether this node should be shown in the default graph view. */
  visibleByDefault: boolean;
}

// ── Framework families ──────────────────────────────────────────────────────

const FRAMEWORK_PREFIXES: Array<{ prefix: string; name: string }> = [
  { prefix: 'org.springframework', name: 'Spring' },
  { prefix: 'org.hibernate', name: 'Hibernate' },
  { prefix: 'lombok', name: 'Lombok' },
  { prefix: 'jakarta', name: 'Jakarta' },
  { prefix: 'javax', name: 'Jakarta' },
  { prefix: 'org.junit', name: 'Testing' },
  { prefix: 'org.mockito', name: 'Testing' },
  { prefix: 'reactor', name: 'Reactive' },
  { prefix: 'io.swagger', name: 'Swagger' },
  { prefix: 'io.jsonwebtoken', name: 'JWT' },
  { prefix: 'software.amazon', name: 'AWS SDK' },
  { prefix: 'com.fasterxml', name: 'Jackson/Serialization' },
  { prefix: 'org.slf4j', name: 'Logging' },
  { prefix: 'ch.qos.logback', name: 'Logging' },
  { prefix: 'org.apache.logging', name: 'Logging' },
];

// ── Pure external (not framework-branded) ──────────────────────────────────

const EXTERNAL_PREFIXES: string[] = [
  'java.',
  'javax.',       // also caught by framework prefixes above, but keep here for safety
  'jakarta.',
  'com.google.',
  'org.apache.',
  'org.xml.',
  'org.w3c.',
  'sun.',
  'com.sun.',
  'io.netty.',
  'io.grpc.',
  'com.amazonaws.',
  'software.amazon.',
];

// ── NPM / Node.js packages to treat as external ────────────────────────────

const NPM_FRAMEWORK_PREFIXES: Array<{ prefix: string; name: string }> = [
  { prefix: 'react', name: 'React' },
  { prefix: '@types/', name: 'TypeScript Types' },
  { prefix: 'vite', name: 'Vite' },
  { prefix: 'vitest', name: 'Testing' },
  { prefix: '@testing-library', name: 'Testing' },
  { prefix: 'jest', name: 'Testing' },
  { prefix: 'eslint', name: 'ESLint' },
  { prefix: 'typescript', name: 'TypeScript' },
  { prefix: 'webpack', name: 'Webpack' },
  { prefix: 'rollup', name: 'Rollup' },
  { prefix: '@vitejs/', name: 'Vite' },
  { prefix: 'tailwindcss', name: 'Tailwind' },
  { prefix: 'next', name: 'Next.js' },
  { prefix: 'express', name: 'Express' },
  { prefix: 'fastify', name: 'Fastify' },
  { prefix: 'axios', name: 'HTTP Client' },
  { prefix: 'lodash', name: 'Lodash' },
  { prefix: 'moment', name: 'Date Library' },
  { prefix: 'date-fns', name: 'Date Library' },
  { prefix: 'zod', name: 'Validation' },
  { prefix: 'pinia', name: 'State Management' },
  { prefix: 'vuex', name: 'State Management' },
  { prefix: 'redux', name: 'State Management' },
  { prefix: '@reduxjs/', name: 'State Management' },
  { prefix: 'node:', name: 'Node.js Built-in' },
  { prefix: 'vscode', name: 'VS Code API' },
];

// ── Internal path heuristics ────────────────────────────────────────────────

/**
 * Returns true if the specifier looks like a relative/alias import that
 * belongs to the workspace source tree.
 */
export function isInternalSpecifier(specifier: string): boolean {
  return (
    specifier.startsWith('.') ||
    specifier.startsWith('/') ||
    specifier.startsWith('@/') ||
    specifier.startsWith('~/')
  );
}

// ── Main classifier ─────────────────────────────────────────────────────────

/**
 * Classify a dependency specifier (Java FQN or JS/TS module path).
 *
 * @param specifier  The raw import specifier, e.g. "org.springframework.web.bind.annotation.RestController"
 * @param resolvedToWorkspaceFile  Whether the specifier was resolved to a file inside the workspace.
 */
export function classifyDependency(
  specifier: string,
  resolvedToWorkspaceFile: boolean
): DependencyClassification {
  if (resolvedToWorkspaceFile) {
    return { origin: 'internal', visibleByDefault: true };
  }

  // Relative imports that didn't resolve — treat as internal (unresolved)
  if (isInternalSpecifier(specifier)) {
    return { origin: 'internal', visibleByDefault: true };
  }

  // Check framework prefixes (Java)
  const javaFramework = FRAMEWORK_PREFIXES.find((f) => specifier.startsWith(f.prefix));
  if (javaFramework) {
    return { origin: 'framework', frameworkName: javaFramework.name, visibleByDefault: false };
  }

  // Check external Java prefixes
  const isJavaExternal = EXTERNAL_PREFIXES.some((prefix) => specifier.startsWith(prefix));
  if (isJavaExternal) {
    return { origin: 'external', visibleByDefault: false };
  }

  // Check NPM framework prefixes
  const npmFramework = NPM_FRAMEWORK_PREFIXES.find(
    (f) => specifier === f.prefix || specifier.startsWith(`${f.prefix}/`) || specifier.startsWith(f.prefix)
  );
  if (npmFramework) {
    return { origin: 'framework', frameworkName: npmFramework.name, visibleByDefault: false };
  }

  // Anything else with dots (looks like a Java FQN or scoped package) → external
  if (/^[a-z][\w]*(\.[a-zA-Z][\w]*)+/.test(specifier) && !specifier.startsWith('@')) {
    return { origin: 'external', visibleByDefault: false };
  }

  // Default: treat as external package dependency (npm etc.)
  return { origin: 'external', visibleByDefault: false };
}

/**
 * Returns a short human-readable label for an external dependency group.
 * Groups e.g. "org.springframework.web.bind.annotation.X" → "Spring (org.springframework)"
 */
export function externalDependencyLabel(specifier: string): string {
  const framework = FRAMEWORK_PREFIXES.find((f) => specifier.startsWith(f.prefix));
  if (framework) {
    return `${framework.name} (${framework.prefix})`;
  }
  const npm = NPM_FRAMEWORK_PREFIXES.find(
    (f) => specifier === f.prefix || specifier.startsWith(`${f.prefix}/`) || specifier.startsWith(f.prefix)
  );
  if (npm) {
    return `${npm.name} (${npm.prefix})`;
  }
  // Use the first 2-3 segments as group key
  const parts = specifier.replace(/^@/, '').split(/[./]/);
  return parts.slice(0, Math.min(3, parts.length)).join('.');
}
