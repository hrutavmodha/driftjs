/**
 * Sets a variable in scope, updating parent scope if it exists higher in prototype chain.
 */
export function setScopeValue(targetScope: Record<string, any>, name: string, val: any): void {
  let curr = targetScope;
  let setOn = targetScope;
  while (curr && curr !== Object.prototype) {
    if (Object.prototype.hasOwnProperty.call(curr, name)) {
      curr[name] = val;
      setOn = curr;
      break;
    }
    curr = Object.getPrototypeOf(curr);
  }
  if (setOn === targetScope && !Object.prototype.hasOwnProperty.call(targetScope, name)) {
    targetScope[name] = val;
  }

  if (targetScope && typeof (targetScope as any).__drift_mark_dirty__ === 'function') {
    (targetScope as any).__drift_mark_dirty__(name);
  }
}

/**
 * Writes back declared variables from function scope to enclosing target scope.
 */
export function syncDeclaredVars(fromScope: Record<string, any>, toScope: Record<string, any>, declaredVars?: Set<string>): void {
  if (!declaredVars) return;
  for (const name of declaredVars) {
    if (Object.prototype.hasOwnProperty.call(fromScope, name)) {
      setScopeValue(toScope, name, fromScope[name]);
    }
  }
}
