import * as path from 'path';

const STRIP_SUFFIXES = [
  'Controller', 'Service', 'Repository', 'Manager', 'Handler',
  'Helper', 'Utils', 'Util', 'Impl', 'Facade', 'Adapter',
  'Factory', 'Provider', 'Processor', 'Builder', 'Mapper',
  'Component', 'Module', 'Resolver', 'Interceptor', 'Guard',
  'Filter', 'Validator', 'Converter', 'Transformer', 'Listener',
  'Consumer', 'Producer', 'Publisher', 'Subscriber', 'Observer',
  'Dao', 'Bo', 'Vo', 'Dto', 'Entity', 'Model', 'Bean',
  'Page', 'View', 'Screen', 'Widget', 'Store', 'Reducer', 'Selector',
  'Action', 'Saga', 'Effect', 'Hook', 'Composable'
];

const SUFFIX_RE = new RegExp(`(${STRIP_SUFFIXES.join('|')})$`, 'i');

function splitCamel(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .toLowerCase()
    .trim();
}

function stripSuffix(name: string): string {
  return name.replace(SUFFIX_RE, '').trim() || name;
}

/**
 * Infers a short human-readable responsibility label for a file.
 * Zero AI, zero I/O — pure text transformation.
 *
 * @param relPath  - relative path of the file (e.g. "src/payment/PaymentService.ts")
 * @param primaryClassName - primary exported class/interface name, if available
 * @param moduleName - module the file belongs to (used as fallback context)
 * @returns a short label, max ~40 chars (e.g. "payment service")
 */
export function inferResponsibility(
  relPath: string,
  primaryClassName: string | undefined,
  moduleName: string | null
): string {
  const baseName = path.basename(relPath, path.extname(relPath));

  // Prefer class name as it's more semantic than file name
  const source = primaryClassName ?? baseName;
  const stripped = stripSuffix(source);
  const label = splitCamel(stripped);

  if (label && label.length > 1) {
    return label.slice(0, 60);
  }

  // Fallback: use module name + file base
  if (moduleName) {
    return splitCamel(moduleName).slice(0, 60);
  }

  return splitCamel(baseName).slice(0, 60);
}
