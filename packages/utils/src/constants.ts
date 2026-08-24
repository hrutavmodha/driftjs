/** Maximum registers allowed per Virtual Machine execution frame */
export const MAX_REGISTERS = 256;

/**
 * Standard WHATWG HTML void element tag names.
 * These elements cannot have child nodes and are self-closing in HTML serialization.
 */
export const VOID_ELEMENTS: ReadonlySet<string> = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);
