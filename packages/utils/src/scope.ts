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

  // 4. Trigger dirty marking on all affected scope VMs
  for (const fn of dirtyFns) {
    try {
      fn(name);
    } catch {
      // ignore errors
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
