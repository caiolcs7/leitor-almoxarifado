import type { ParsedScan, Rules } from './models';

// Bounded patterns prevent catastrophic backtracking in operator-supplied rules.
export function validatePattern(pattern: string): boolean {
  if (
    pattern.length > 160 ||
    !pattern.startsWith('^') ||
    !pattern.endsWith('$')
  )
    return false;
  if (/[()*+|\\]/.test(pattern)) return false;
  if (
    [...pattern.matchAll(/\{(\d+)(?:,(\d+))?\}/g)].some(
      (m) => Number(m[1]) > 128 || Number(m[2] ?? m[1]) > 128,
    )
  )
    return false;
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}
export function validateRules(rules: Rules): void {
  if (
    ![...rules.productPatterns, ...rules.addressPatterns].every(validatePattern)
  )
    throw new Error(
      'Use padrões com ^ e $, letras, números, classes [A-Z] e quantificadores limitados {1,64}. Grupos, barras e repetições abertas não são aceitos.',
    );
}
export function cleanText(raw: string): string {
  return raw
    .normalize('NFKC')
    .trim()
    .replace(/[\p{Cc}\p{Cf}\p{Z}\s]/gu, '')
    .replace(/^\](?:d[12]|Q[123]|C[01])/i, '')
    .toUpperCase();
}
function classify(value: string, rules: Rules): ParsedScan['type'] {
  const address = rules.addressPatterns.some((p) => new RegExp(p).test(value));
  const product = rules.productPatterns.some((p) => new RegExp(p).test(value));
  return address === product ? 'unknown' : address ? 'address' : 'product';
}
export function parseScan(raw: string, rules: Rules): ParsedScan {
  const invalid = (normalized: string, error: string): ParsedScan => ({
    raw,
    normalized,
    type: 'unknown',
    valid: false,
    warnings: [],
    error,
  });
  if (raw.length > 2048)
    return invalid('', 'Leitura longa demais. Leia uma única etiqueta.');
  try {
    validateRules(rules);
  } catch (error) {
    return invalid('', String(error));
  }
  let normalized = cleanText(raw);
  const originalType = classify(normalized, rules);
  const candidates = new Set<string>();
  for (const wrapper of rules.wrappers) {
    const prefix = cleanText(wrapper.prefix),
      suffix = cleanText(wrapper.suffix);
    if (
      !prefix ||
      !suffix ||
      normalized.length <= prefix.length + suffix.length
    )
      continue;
    if (normalized.startsWith(prefix) && normalized.endsWith(suffix)) {
      const payload = normalized.slice(prefix.length, -suffix.length);
      if (classify(payload, rules) !== 'unknown') candidates.add(payload);
    }
  }
  if (candidates.size > 1 || (candidates.size && originalType !== 'unknown'))
    return invalid(
      normalized.slice(0, 128),
      'Wrapper ambíguo. A leitura não foi alterada; revise as regras.',
    );
  const warnings: string[] = [];
  if (candidates.size === 1) {
    normalized = [...candidates][0];
    warnings.push('Wrapper configurado removido.');
  }
  if (
    !normalized ||
    normalized.length > 128 ||
    !/^[A-Z0-9._/-]+$/.test(normalized)
  )
    return invalid(
      normalized.slice(0, 128),
      'Código incompleto ou com caracteres não permitidos. Leia novamente.',
    );
  const type = classify(normalized, rules);
  if (type === 'unknown')
    return invalid(
      normalized,
      'Código desconhecido ou ambíguo. Confira a etiqueta e os padrões em Configurações.',
    );
  if (
    type === 'address' &&
    rules.padB &&
    /^R[0-9]{2,3}B[0-9]{1,3}$/.test(normalized)
  ) {
    const padded = normalized.replace(
      /B([0-9]{1,3})$/,
      (_, n: string) => `B${n.padStart(3, '0')}`,
    );
    if (padded !== normalized)
      warnings.push(
        'Endereço B preenchido com 3 dígitos, conforme configuração.',
      );
    normalized = padded;
  }
  return { raw, normalized, type, valid: true, warnings };
}
export function extractStreet(address: string): string {
  return /^R[0-9]+(?=[A-Z]|$)/.exec(address)?.[0] ?? 'Sem rua';
}
export function searchText(value: string): string {
  return cleanText(value);
}
