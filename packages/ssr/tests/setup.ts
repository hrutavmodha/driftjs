import { DriftServerVM as LocalDriftServerVM } from '../src/index.js';
import { DriftServerVM as PkgDriftServerVM } from 'driftjs-ssr';

function instantiateFunctionsRecursively(obj: any, visited: Set<any> = new Set()): any {
  if (!obj || typeof obj !== 'object' || visited.has(obj)) return obj;
  visited.add(obj);

  if (typeof obj.__drift_fn__ === 'string') {
    obj.__drift_fn__ = new Function('return (' + obj.__drift_fn__ + ')')();
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      instantiateFunctionsRecursively(obj[i], visited);
    }
  } else {
    for (const key of Object.keys(obj)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype' || key.startsWith('__drift_parent')) continue;
      instantiateFunctionsRecursively(obj[key], visited);
    }
  }
  return obj;
}

function hookServerVM(VMClass: any) {
  if (!VMClass || !VMClass.prototype) return;
  const origExecute = VMClass.prototype.execute;
  VMClass.prototype.execute = function(rawModule: any, options: any) {
    instantiateFunctionsRecursively(rawModule);
    if (options && options.scope) {
      instantiateFunctionsRecursively(options.scope);
    }
    return origExecute.call(this, rawModule, options);
  };
}

hookServerVM(LocalDriftServerVM);
hookServerVM(PkgDriftServerVM);

