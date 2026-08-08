/**
 * Register-based Bytecode Opcodes supported by DriftJS.
 */
export const enum Opcode {
  RETURN = 0x00,
  CREATE_ELEMENT = 0x01,
  CREATE_TEXT = 0x02,
  CREATE_COMMENT = 0x03,
  APPEND_CHILD = 0x04,
  SET_ATTR = 0x05,
  CREATE_FRAGMENT = 0x06,
  INTERPOLATE_TEXT = 0x07,
  JUMP = 0x08,
  JUMP_IF_FALSE = 0x09,
  EVAL_EXPR = 0x0A,
  LOOP_ITER = 0x0B,
  /** Execute a script-block AST stored in the constant pool to initialise the component scope. */
  EXEC_SCRIPT = 0x0C,
  /** Reactive conditional block: re-renders its subtree when deps change. */
  REACTIVE_IF = 0x0D,
  /** Reactive loop block: re-renders its subtree when deps change. */
  REACTIVE_FOR = 0x0E,
}

/**
 * Describes which bytecode PC positions reference a declared variable,
 * enabling the runtime to re-evaluate bindings when state changes.
 */
export interface ReactiveBinding {
  readonly variable: string;
  readonly positions: readonly { readonly pc: number; readonly opcode: Opcode }[];
}

/**
 * Output module emitted by DriftGenerator.
 */
export interface CompiledModule {
  readonly bytecode: readonly number[];
  readonly constants: readonly any[];
  readonly reactiveBindings?: readonly ReactiveBinding[];
  /** All variable names declared in the component's <script> block. Used by the runtime for change-detection. */
  readonly declaredVars?: readonly string[];
}

/**
 * Cached row record used by the keyed list reconciler.
 */
export interface ItemRecord {
  key: unknown;
  nodes: any[];
  childRegions?: any[];
  itemVal: unknown;
  indexVal: number;
}

