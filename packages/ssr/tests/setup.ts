import { DriftServerVM } from '../src/index.js';

function instantiateFunctionsRecursively(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (typeof obj.__drift_fn__ === 'string') {
    obj.__drift_fn__ = new Function('return (' + obj.__drift_fn__ + ')')();
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      instantiateFunctionsRecursively(obj[i]);
    }
  } else {
    for (const key of Object.keys(obj)) {
      instantiateFunctionsRecursively(obj[key]);
    }
  }
  return obj;
}

const origExecute = DriftServerVM.prototype.execute;
DriftServerVM.prototype.execute = function(rawModule: any, options: any) {
  instantiateFunctionsRecursively(rawModule);
  if (options && options.scope) {
    instantiateFunctionsRecursively(options.scope);
  }
  return origExecute.call(this, rawModule, options);
};
