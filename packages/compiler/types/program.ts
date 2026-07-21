export interface CompiledProgram {
  bytecode: Uint32Array;
  constants: unknown[];
  updateBlockOffset: number;
}
