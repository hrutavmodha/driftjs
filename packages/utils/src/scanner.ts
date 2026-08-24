/**
 * Determines whether a slash character '/' at `index` in `str` is the start of a Regular Expression literal.
 */
export function isRegexStartChar(str: string, index: number): boolean {
  let prevIdx = index - 1;
  while (prevIdx >= 0 && /\s/.test(str[prevIdx]!)) {
    prevIdx--;
  }
  if (prevIdx < 0) return true;
  const prevChar = str[prevIdx]!;
  return /[(,=:[!&|?+\-*/%^~<>]/.test(prevChar);
}

/**
 * Scans a string with full awareness of quotes, escape sequences, template literals,
 * line/block comments, regex literals, and nesting depths for parentheses (), brackets [], and braces {}.
 *
 * Calls `onDepthZero` whenever a character is encountered at depth 0 (outside any quote, comment, regex, or bracket).
 * If `onDepthZero` returns `true` or a `number`, scanning stops immediately and returns that index.
 */
export function scanBalancedDelimiters(
  str: string,
  onDepthZero: (index: number, ch: string) => boolean | number | void
): number {
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let inQuote: string | null = null;
  let isEscaped = false;
  let inLineComment = false;
  let inBlockComment = false;
  let inRegex = false;
  let inRegexCharClass = false;
  const templateBraceStack: number[] = [];

  for (let i = 0; i < str.length; i++) {
    const ch = str[i]!;

    if (inQuote !== null) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }
      if (ch === '\\') {
        isEscaped = true;
        continue;
      }
      if (inQuote === '`' && ch === '$' && str[i + 1] === '{') {
        templateBraceStack.push(braceDepth);
        inQuote = null;
        i++;
        braceDepth++;
        continue;
      }
      if (ch === inQuote) {
        inQuote = null;
        continue;
      }
      continue;
    }

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && str[i + 1] === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (inRegex) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }
      if (ch === '\\') {
        isEscaped = true;
        continue;
      }
      if (inRegexCharClass) {
        if (ch === ']') inRegexCharClass = false;
        continue;
      }
      if (ch === '[') {
        inRegexCharClass = true;
        continue;
      }
      if (ch === '/') {
        inRegex = false;
        continue;
      }
      continue;
    }

    if (ch === '/' && str[i + 1] === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === '/' && str[i + 1] === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if (ch === '/' && isRegexStartChar(str, i)) {
      inRegex = true;
      inRegexCharClass = false;
      continue;
    }

    if (ch === '\'' || ch === '"' || ch === '`') {
      inQuote = ch;
      continue;
    }

    if (ch === '(') {
      parenDepth++;
      continue;
    }
    if (ch === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
      continue;
    }
    if (ch === '[') {
      bracketDepth++;
      continue;
    }
    if (ch === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }
    if (ch === '{') {
      braceDepth++;
      continue;
    }
    if (ch === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
      if (
        templateBraceStack.length > 0 &&
        braceDepth === templateBraceStack[templateBraceStack.length - 1]
      ) {
        templateBraceStack.pop();
        inQuote = '`';
      }
      continue;
    }

    if (
      parenDepth === 0 &&
      bracketDepth === 0 &&
      braceDepth === 0 &&
      inQuote === null &&
      !inLineComment &&
      !inBlockComment &&
      !inRegex
    ) {
      const res = onDepthZero(i, ch);
      if (typeof res === 'number') return res;
      if (res === true) return i;
    }
  }
  return -1;
}

/**
 * Finds the index of `targetChar` occurring at depth 0 (outside quotes, comments, regex, and brackets).
 * Returns -1 if not found.
 */
export function findTopLevelChar(str: string, targetChar: string): number {
  return scanBalancedDelimiters(str, (_idx, ch) => ch === targetChar);
}

/**
 * Splits pattern entries by `separator` (default ',') at depth 0, trimming each entry.
 */
export function splitPatternEntries(str: string, separator: string = ','): string[] {
  const entries: string[] = [];
  let start = 0;

  scanBalancedDelimiters(str, (idx, ch) => {
    if (ch === separator) {
      const segment = str.slice(start, idx).trim();
      if (segment) entries.push(segment);
      start = idx + 1;
    }
  });

  const last = str.slice(start).trim();
  if (last) entries.push(last);
  return entries;
}

/**
 * Checks whether `str` is enclosed in a single matching outer pair of parentheses `(...)`.
 */
export function hasMatchingOuterParens(str: string): boolean {
  const trimmed = str.trim();
  if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) return false;

  let parenDepth = 0;
  let inQuote: string | null = null;
  let isEscaped = false;

  for (let i = 0; i < trimmed.length - 1; i++) {
    const ch = trimmed[i]!;
    if (inQuote !== null) {
      if (isEscaped) isEscaped = false;
      else if (ch === '\\') isEscaped = true;
      else if (ch === inQuote) inQuote = null;
      continue;
    }
    if (ch === '"' || ch === '\'' || ch === '`') {
      inQuote = ch;
      continue;
    }
    if (ch === '(') parenDepth++;
    else if (ch === ')') parenDepth--;

    if (parenDepth === 0) return false;
  }
  return parenDepth === 1;
}
