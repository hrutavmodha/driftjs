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
    if (itemVal && typeof itemVal === 'object') {
      const entries = itemName.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
      for (const entry of entries) {
        if (entry.includes(':')) {
          const colonIdx = entry.indexOf(':');
          const propName = entry.slice(0, colonIdx).trim();
          const target = entry.slice(colonIdx + 1).trim();
          if (target.includes('=')) {
            const eqIdx = target.indexOf('=');
            const varName = target.slice(0, eqIdx).trim();
            const defValStr = target.slice(eqIdx + 1).trim();
            const val = (itemVal as any)[propName];
            scope[varName] = val !== undefined ? val : parseDefaultValue(defValStr);
          } else {
            scope[target] = (itemVal as any)[propName];
          }
        } else if (entry.includes('=')) {
          const eqIdx = entry.indexOf('=');
          const propName = entry.slice(0, eqIdx).trim();
          const defValStr = entry.slice(eqIdx + 1).trim();
          const val = (itemVal as any)[propName];
          scope[propName] = val !== undefined ? val : parseDefaultValue(defValStr);
        } else {
          scope[entry] = (itemVal as any)[entry];
        }
      }
    }
  } else if (itemName.startsWith('[') && itemName.endsWith(']')) {
    if (Array.isArray(itemVal) || (itemVal && typeof itemVal[Symbol.iterator] === 'function')) {
      const arr = Array.isArray(itemVal) ? itemVal : Array.from(itemVal);
      const entries = itemName.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]!;
        if (entry.includes('=')) {
          const eqIdx = entry.indexOf('=');
          const varName = entry.slice(0, eqIdx).trim();
          const defValStr = entry.slice(eqIdx + 1).trim();
          const val = arr[i];
          scope[varName] = val !== undefined ? val : parseDefaultValue(defValStr);
        } else {
          scope[entry] = arr[i];
        }
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

