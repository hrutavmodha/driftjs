/**
 * Register-based Bytecode Opcodes supported by DriftJS.
 */
export enum Opcode {
  RETURN = 0x00,
  CREATE_ELEMENT = 0x01,
  CREATE_TEXT = 0x02,
  CREATE_COMMENT = 0x03,
  APPEND_CHILD = 0x04,
  SET_ATTR = 0x05,
  CREATE_FRAGMENT = 0x06,
  INTERPOLATE_TEXT = 0x07,
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

export interface ImportSpec {
  readonly localName: string;
  readonly source: string;
  readonly isDefault: boolean;
  readonly isNamespace?: boolean | undefined;
  readonly isSideEffect?: boolean | undefined;
  readonly importedName?: string | undefined;
}

/**
 * Output module emitted by DriftGenerator.
 */
export interface CompiledModule {
  readonly bytecode: readonly number[] | Uint32Array;
  readonly constants: readonly any[];
  readonly reactiveBindings?: readonly ReactiveBinding[];
  /** All variable names declared in the component's <script> block. Used by the runtime for change-detection. */
  readonly declaredVars?: readonly string[];
  /** Import statements declared in the component's <script> block. */
  readonly imports?: readonly ImportSpec[];
  /** Component scope containing imported components or scope bindings. */
  readonly scope?: Record<string, any>;
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

