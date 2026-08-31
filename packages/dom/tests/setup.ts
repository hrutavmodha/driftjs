import { DriftClientVM as DOMDriftClientVM } from '../src/index.js';
import { DriftClientVM as PkgDriftClientVM } from 'driftjs-dom';
import { DriftServerVM } from '../../ssr/src/index.js';

function instantiateFunctionsRecursively(obj: any, visited: Set<any> = new Set()): any {
  if (!obj || typeof obj !== 'object' || visited.has(obj)) return obj;
  if (typeof Node !== 'undefined' && obj instanceof Node) return obj;
  if (typeof Window !== 'undefined' && obj instanceof Window) return obj;
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

function hookClientVM(VMClass: any) {
  if (!VMClass || !VMClass.prototype) return;
  const origExecute = VMClass.prototype.execute;
  VMClass.prototype.execute = function(rawModule: any, options: any) {
    instantiateFunctionsRecursively(rawModule);
    if (options && options.scope) {
      instantiateFunctionsRecursively(options.scope);
    }
    return origExecute.call(this, rawModule, options);
  };

  const origUpdate = VMClass.prototype.updateRowRegisters;
  if (origUpdate) {
    VMClass.prototype.updateRowRegisters = function(bodyMod: any, childScope: any, registers: any, childRegions: any) {
      instantiateFunctionsRecursively(bodyMod);
      if (childScope) instantiateFunctionsRecursively(childScope);
      return origUpdate.call(this, bodyMod, childScope, registers, childRegions);
    };
  }
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

hookClientVM(DOMDriftClientVM);
hookClientVM(PkgDriftClientVM);
hookServerVM(DriftServerVM);
