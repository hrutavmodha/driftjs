/** Maximum registers allowed per Virtual Machine execution frame */
export const MAX_REGISTERS = 256;

export interface BaseVMExecutionOptions {
  readonly scope?: Record<string, any>;
}
