/**
 * Register-based Bytecode Opcodes supported by DriftJS.
 */
export const Opcode = {
  RETURN: 0x00,
  CREATE_ELEMENT: 0x01,
  CREATE_TEXT: 0x02,
  CREATE_COMMENT: 0x03,
  APPEND_CHILD: 0x04,
  SET_ATTR: 0x05,
} as const;

export type Opcode = typeof Opcode[keyof typeof Opcode];

/**
 * Output module emitted by DriftGenerator.
 */
export interface CompiledModule {
  readonly bytecode: readonly number[];
  readonly constants: readonly any[];
}
