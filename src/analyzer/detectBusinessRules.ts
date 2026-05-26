import * as fs from 'fs';
import type { ScannedFile } from './scanFiles';

export type ConfidenceMark = '🟢' | '🟡';

export interface BusinessRule {
  type: 'validation' | 'enum' | 'guard' | 'constant' | 'config';
  mark: ConfidenceMark;
  description: string;
  file: string;
  line: number;
  value?: string;
}

const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.java', '.py', '.cs', '.go', '.rb', '.php']);

export function detectBusinessRules(files: ScannedFile[]): BusinessRule[] {
  const rules: BusinessRule[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    if (!CODE_EXTS.has(file.extension)) continue;

    let content: string;
    try { content = fs.readFileSync(file.absolutePath, 'utf8'); }
    catch { continue; }

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Validações — 🟢 extraído diretamente do código
      if (/@(NotNull|NotBlank|NotEmpty|Size|Min|Max|Email|Pattern|Valid|Positive|PositiveOrZero)\b/.test(line)) {
        push(rules, seen, { type: 'validation', mark: '🟢', description: `Validação: ${line.trim()}`, file: file.relativePath, line: lineNum });
      }
      if (/\.(required|min|max|email|url|uuid|regex|length)\s*\(/.test(line)) {
        push(rules, seen, { type: 'validation', mark: '🟢', description: `Validação: ${line.trim().slice(0, 80)}`, file: file.relativePath, line: lineNum });
      }
      if (/@(IsNotEmpty|IsEmail|IsNumber|IsString|IsDate|MinLength|MaxLength|IsEnum|IsOptional)\b/.test(line)) {
        push(rules, seen, { type: 'validation', mark: '🟢', description: `Validação DTO: ${line.trim()}`, file: file.relativePath, line: lineNum });
      }

      // Enums de domínio — 🟢
      const enumMatch = line.match(/^(?:export\s+)?enum\s+(\w+)\s*\{/) ||
                        line.match(/^(?:public\s+)?enum\s+(\w+)\s*\{/);
      if (enumMatch) {
        // Coleta os valores do enum nas próximas linhas
        const values: string[] = [];
        for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
          const vMatch = lines[j].match(/^\s*([A-Z_][A-Z0-9_]*)\s*[,=}]/);
          if (vMatch) values.push(vMatch[1]);
          if (lines[j].includes('}')) break;
        }
        push(rules, seen, { type: 'enum', mark: '🟢', description: `Enum ${enumMatch[1]}: ${values.slice(0, 6).join(', ')}${values.length > 6 ? '...' : ''}`, file: file.relativePath, line: lineNum, value: enumMatch[1] });
      }

      // Guards / Auth — 🟢
      if (/@(UseGuards|Guard|Roles|PreAuthorize|Secured|RolesAllowed|RequiresPermission|Permission)\b/.test(line)) {
        push(rules, seen, { type: 'guard', mark: '🟢', description: `Guard/Auth: ${line.trim().slice(0, 80)}`, file: file.relativePath, line: lineNum });
      }
      if (/permission_required|login_required|@auth\.login_required/.test(line)) {
        push(rules, seen, { type: 'guard', mark: '🟢', description: `Auth decorator: ${line.trim().slice(0, 80)}`, file: file.relativePath, line: lineNum });
      }
      if (/requireRole\s*\(|hasRole\s*\(|isAuthorized\s*\(|checkPermission\s*\(/.test(line)) {
        push(rules, seen, { type: 'guard', mark: '🟡', description: `Auth check: ${line.trim().slice(0, 80)}`, file: file.relativePath, line: lineNum });
      }

      // Constantes de negócio — 🟢
      const constMatch = line.match(/(?:const|val|final\s+\w+)\s+(MAX_\w+|MIN_\w+|DEFAULT_\w+|LIMIT_\w+|TIMEOUT_\w+|RETRY_\w+|THRESHOLD_\w+)\s*=\s*([^;,\n]+)/i);
      if (constMatch) {
        push(rules, seen, { type: 'constant', mark: '🟢', description: `Constante de negócio: ${constMatch[1]} = ${constMatch[2].trim().slice(0, 40)}`, file: file.relativePath, line: lineNum, value: constMatch[1] });
      }
    }
  }

  return rules;
}

function push(rules: BusinessRule[], seen: Set<string>, rule: BusinessRule): void {
  const key = `${rule.type}|${rule.description.slice(0, 60)}|${rule.file}`;
  if (!seen.has(key)) {
    seen.add(key);
    rules.push(rule);
  }
}
