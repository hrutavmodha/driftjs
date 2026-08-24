/**
 * Sets a variable in scope, updating parent scope if it exists higher in prototype chain.
 */
export function setScopeValue<T = any>(targetScope: Record<string, any>, name: string, val: T): T {
  if (!targetScope || typeof targetScope !== 'object') return val;
  if (name === '__proto__' || name === 'constructor' || name === 'prototype') {
    return val;
  }

  let curr: any = targetScope;
  let setOn: any = null;
  const dirtyFns: Set<(name: string) => void> = new Set();

  // 1. Traverse targetScope's prototype chain to find which scope object owns `name`
  while (curr && curr !== Object.prototype) {
    if (Object.prototype.hasOwnProperty.call(curr, name)) {
      curr[name] = val;
      setOn = curr;
      break;
    }
    curr = Object.getPrototypeOf(curr);
  }

  // 2. If `name` was not found on any prototype in the chain, declare it as an own property on targetScope
  if (!setOn) {
    targetScope[name] = val;
    setOn = targetScope;
  }

  // 3. Collect dirty notification functions from targetScope up to setOn
  let scan: any = targetScope;
  while (scan && scan !== Object.prototype) {
    if (typeof scan.__drift_mark_dirty__ === 'function') {
      dirtyFns.add(scan.__drift_mark_dirty__);
    }
    if (scan === setOn) {
      break;
    }
    scan = Object.getPrototypeOf(scan);
  }

  // 4. Trigger dirty marking on all affected scope VMs (skip internal __drift_ variables)
  if (!name.startsWith('__drift_')) {
    for (const fn of dirtyFns) {
      try {
        fn(name);
      } catch {
        // ignore errors
      }
    }
  }

  return val;
}



/**
 * Safely checks if a property exists on scope or any of its parent scopes,
 * stopping before Object.prototype to prevent prototype pollution / scope hijacking.
 */
export function inScopeChain(scope: any, name: string): boolean {
  if (!scope || typeof scope !== 'object') return false;
  let curr: any = scope;
  while (curr && curr !== Object.prototype) {
    if (Object.prototype.hasOwnProperty.call(curr, name)) {
      return true;
    }
    curr = Object.getPrototypeOf(curr);
  }
  return false;
}

/**
 * Safely gets a variable value from the scope chain, or falls back to globalThis.
 */
export function getScopeValue(scope: any, name: string): any {
  if (scope && inScopeChain(scope, name)) {
    return scope[name];
  }
  if (typeof globalThis !== 'undefined' && globalThis) {
    if (name === '__proto__' || name === 'constructor' || name === 'prototype') {
      return undefined;
    }
    let curr: any = globalThis;
    while (curr && curr !== Object.prototype) {
      if (Object.prototype.hasOwnProperty.call(curr, name)) {
        return (globalThis as any)[name];
      }
      curr = Object.getPrototypeOf(curr);
    }
  }
  return undefined;
}

export const _get = getScopeValue;

if (typeof globalThis !== 'undefined' && !(globalThis as any)._get) {
  (globalThis as any)._get = getScopeValue;
}

function splitPatternEntries(str: string): string[] {
  const entries: string[] = [];
  let current = '';
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let inQuote: string | null = null;
  let isEscaped = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i]!;
    if (inQuote !== null) {
      current += ch;
      if (isEscaped) {
        isEscaped = false;
      } else if (ch === '\\') {
        isEscaped = true;
      } else if (ch === inQuote) {
        inQuote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inQuote = ch;
      current += ch;
      continue;
    }

    if (ch === '(') parenDepth++;
    else if (ch === ')') parenDepth--;
    else if (ch === '[') bracketDepth++;
    else if (ch === ']') bracketDepth--;
    else if (ch === '{') braceDepth++;
    else if (ch === '}') braceDepth--;

    if (ch === ',' && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      if (current.trim()) entries.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }

  if (current.trim()) entries.push(current.trim());
  return entries;
}

function findTopLevelChar(str: string, targetChar: string): number {
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let inQuote: string | null = null;
  let isEscaped = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i]!;
    if (inQuote !== null) {
      if (isEscaped) isEscaped = false;
      else if (ch === '\\') isEscaped = true;
      else if (ch === inQuote) inQuote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inQuote = ch;
      continue;
    }
    if (ch === '(') parenDepth++;
    else if (ch === ')') parenDepth--;
    else if (ch === '[') bracketDepth++;
    else if (ch === ']') bracketDepth--;
    else if (ch === '{') braceDepth++;
    else if (ch === '}') braceDepth--;

    if (ch === targetChar && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      return i;
    }
  }
  return -1;
}

/**
 * Populates scope for @for loop items, supporting object and array destructuring patterns with aliasing and defaults.
 */
export function populateItemScope(
  scope: Record<string, any>,
  itemName: string,
  itemVal: any,
  indexName: string | null,
  indexVal: number
): void {
  scope[itemName] = itemVal;
  if (indexName) scope[indexName] = indexVal;

  if (itemName.startsWith('{') && itemName.endsWith('}')) {
    const safeObj = itemVal && typeof itemVal === 'object' ? itemVal : {};
    const entries = splitPatternEntries(itemName.slice(1, -1));
    for (const entry of entries) {
      const colonIdx = findTopLevelChar(entry, ':');
      if (colonIdx !== -1) {
        const propName = entry.slice(0, colonIdx).trim();
        const target = entry.slice(colonIdx + 1).trim();
        const eqIdx = findTopLevelChar(target, '=');
        if (eqIdx !== -1) {
          const varName = target.slice(0, eqIdx).trim();
          const defValStr = target.slice(eqIdx + 1).trim();
          const val = (safeObj as any)[propName];
          scope[varName] = val !== undefined ? val : parseDefaultValue(defValStr);
        } else if (target.startsWith('{') || target.startsWith('[')) {
          const val = (safeObj as any)[propName];
          populateItemScope(scope, target, val, null, 0);
        } else {
          scope[target] = (safeObj as any)[propName];
        }
      } else {
        const eqIdx = findTopLevelChar(entry, '=');
        if (eqIdx !== -1) {
          const propName = entry.slice(0, eqIdx).trim();
          const defValStr = entry.slice(eqIdx + 1).trim();
          const val = (safeObj as any)[propName];
          scope[propName] = val !== undefined ? val : parseDefaultValue(defValStr);
        } else {
          scope[entry] = (safeObj as any)[entry];
        }
      }
    }
  } else if (itemName.startsWith('[') && itemName.endsWith(']')) {
    const arr = Array.isArray(itemVal)
      ? itemVal
      : itemVal && typeof itemVal[Symbol.iterator] === 'function'
      ? Array.from(itemVal)
      : [];
    const entries = splitPatternEntries(itemName.slice(1, -1));
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      const eqIdx = findTopLevelChar(entry, '=');
      if (eqIdx !== -1) {
        const varName = entry.slice(0, eqIdx).trim();
        const defValStr = entry.slice(eqIdx + 1).trim();
        const val = arr[i];
        scope[varName] = val !== undefined ? val : parseDefaultValue(defValStr);
      } else if (entry.startsWith('{') || entry.startsWith('[')) {
        populateItemScope(scope, entry, arr[i], null, 0);
      } else {
        scope[entry] = arr[i];
      }
    }
  }
}

function parseDefaultValue(defStr: string): any {
  const trimmed = defStr.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (trimmed === 'undefined') return undefined;
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  if (!Number.isNaN(Number(trimmed)) && trimmed !== '') {
    return Number(trimmed);
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

