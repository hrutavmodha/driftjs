import { Opcodes, type Opcode } from './isa.js';

export interface VMProgram {
  bytecode: Uint32Array;
  constants: unknown[];
  updateBlockOffset?: number;
}

/**
 * DriftJS Virtual Machine for executing bytecode programs against a target HTML element.
 */
export class DriftJSVM {
  private bytecode: Uint32Array;
  private constants: unknown[];
  private nodes: (Node | null)[];
  private registers: unknown[];
  private callStack: number[];
  private pc: number;
  private dirtyMask = 0;
  private prevRegBuffer: unknown[];
  private updateBlockOffset = 0;
  private updatePending = false;
  
  private eventDelegationTable: Map<string, number>;
  private registeredEvents: Map<string, (e: Event) => void>;

  /**
   * Initializes a new VM instance.
   *
   * @param program - Compiled VM program containing bytecode and constants.
   * @param rootElement - Target HTML element to mount the application into.
   */
  constructor(
    private program: VMProgram,
    private rootElement: HTMLElement
  ) {
    this.bytecode = this.program.bytecode;
    this.constants = this.program.constants;
    this.updateBlockOffset = this.program.updateBlockOffset ?? 0;
    this.nodes = [];
    const maxRegs = Math.max(256, this.computeMaxRegisterCount(this.bytecode));
    this.registers = new Array(maxRegs).fill(null);
    this.prevRegBuffer = new Array(maxRegs).fill(null);
    this.callStack = [];
    this.pc = 0;
    this.eventDelegationTable = new Map();
    this.registeredEvents = new Map();
  }

  private computeMaxRegisterCount(bytecode: Uint32Array): number {
    let maxReg = 0;
    for (let i = 0; i < bytecode.length; i++) {
      const inst = bytecode[i]!;
      const a = (inst >>> 16) & 0xFF;
      const b = (inst >>> 8) & 0xFF;
      const c = inst & 0xFF;
      if (a > maxReg) maxReg = a;
      if (b > maxReg) maxReg = b;
      if (c > maxReg) maxReg = c;
    }
    return maxReg + 1;
  }

  private registerGlobalEvent(eventType: string) {
    if (this.registeredEvents.has(eventType)) {
      return;
    }
    
    const listener = (event: Event) => {
      let target = event.target as Node | null;
      
      while (target && target !== this.rootElement) {
        const nodeIdx = (target as unknown as { __vm_idx?: number }).__vm_idx;

        if (nodeIdx !== undefined && nodeIdx !== -1) {
          const key = `${nodeIdx}:${eventType}`;
          const offset = this.eventDelegationTable.get(key);
        
          if (offset !== undefined) {
            this.registers[0] = event;
            this.dispatchEvent(offset);
            return;
          }
        }
        
        target = target.parentNode;
      }
    };

    this.registeredEvents.set(eventType, listener);
    this.rootElement.addEventListener(eventType, listener);
  }

  /**
   * Marks a register as dirty and schedules a microtask UI update frame.
   *
   * @param regIdx - Index of the register that was mutated.
   */
  public markDirty(regIdx: number): void {
    this.dirtyMask |= (1 << (regIdx % 32));
    this.requestUpdate();
  }

  /**
   * Schedules a microtask DOM update frame if an update is not already pending.
   */
  public requestUpdate(): void {
    if (this.updatePending) return;
    this.updatePending = true;
    queueMicrotask(() => {
      this.updatePending = false;
      this.dispatchEvent(this.updateBlockOffset);
    });
  }

  /**
   * Mounts the program and executes the initial instructions.
   */
  public mount(): void {
    this.dirtyMask = ~0;
    this.pc = 0;
    this.execute();
  }

  /**
   * Unmounts the application, removes listeners, and frees all references for GC.
   */
  public unmount() {
    for (const [eventType, listener] of this.registeredEvents.entries()) {
      this.rootElement.removeEventListener(eventType, listener);
    }
    this.registeredEvents.clear();
    this.eventDelegationTable.clear();
    this.nodes.fill(null);
    this.registers.fill(null);
    this.prevRegBuffer.fill(null);
    this.callStack.length = 0;
    this.rootElement.innerHTML = '';
  }

  /**
   * Jumps to a specific bytecode offset, typically used for event handlers.
   */
  public dispatchEvent(offset: number) {
    const prevPc = this.pc;
    this.pc = offset;
    try {
      this.execute();
    } finally {
      if (this.callStack.length > 0) {
        this.pc = prevPc;
      }
    }
  }

  private getRegister(idx: number): unknown {
    if (idx < 0 || idx >= this.registers.length) {
      throw new Error(`Register index out of bounds: ${idx} (total registers: ${this.registers.length})`);
    }
    return this.registers[idx];
  }

  private setRegister(idx: number, value: unknown): void {
    if (idx < 0 || idx >= this.registers.length) {
      throw new Error(`Register index out of bounds: ${idx} (total registers: ${this.registers.length})`);
    }
    this.registers[idx] = value;
  }

  private getConstant(idx: number): unknown {
    if (idx < 0 || idx >= this.constants.length) {
      throw new Error(`Constant pool index out of bounds: ${idx} (constant pool size: ${this.constants.length})`);
    }
    return this.constants[idx];
  }

  private getNode(idx: number): Node | null {
    if (idx < 0 || idx >= this.nodes.length) {
      return null;
    }
    return this.nodes[idx] ?? null;
  }

  private execute() {
    const bytecode = this.bytecode;
    const constants = this.constants;
    const nodes = this.nodes;
    const registers = this.registers;
    const callStack = this.callStack;
    const prevRegBuffer = this.prevRegBuffer;

    while (this.pc < bytecode.length) {
      const inst = bytecode[this.pc++]!;
      
      const op = (inst >>> 24) & 0xFF as Opcode;
      const a = (inst >>> 16) & 0xFF;
      const b = (inst >>> 8) & 0xFF;
      const c = inst & 0xFF;

      switch (op) {
        case Opcodes.LOAD_CONST:
          this.setRegister(a, this.getConstant(b));
          break;

        case Opcodes.LOAD_NODE:
          this.setRegister(a, this.getNode(b));
          break;

        case Opcodes.EXEC_THUNK: {
          const destReg = a;
          const thunkIdx = b;
          const depMask = c;

          if (depMask !== 0 && this.dirtyMask !== ~0 && (this.dirtyMask & depMask) === 0) {
            // Verify next opcode before skipping
            const nextInst = bytecode[this.pc];
            if (nextInst !== undefined) {
              const nextOp = (nextInst >>> 24) & 0xFF;
              if (nextOp === Opcodes.SET_TEXT || nextOp === Opcodes.SET_ATTRIBUTE || nextOp === Opcodes.SET_PROPERTY) {
                this.pc++;
              }
            }
            break;
          }

          const limit = Math.min(registers.length, 32);
          for (let i = 0; i < limit; i++) {
            prevRegBuffer[i] = registers[i];
          }

          const thunk = this.getConstant(thunkIdx);
          if (typeof thunk === 'function') {
            const res = thunk(registers, this);
            if (destReg !== 0) {
              this.setRegister(destReg, res);
            } else {
              let mask = 0;
              for (let i = 0; i < limit; i++) {
                if (registers[i] !== prevRegBuffer[i]) {
                  mask |= (1 << i);
                }
              }
              if (mask !== 0) {
                this.dirtyMask = mask;
              }
            }
          }
          break;
        }

        case Opcodes.CREATE_ELEMENT: {
          const tag = this.getConstant(a) as string;
          const el = document.createElement(tag);
          nodes[b] = el;
          (el as unknown as { __vm_idx?: number }).__vm_idx = b; 
          break;
        }

        case Opcodes.CREATE_TEXT: {
          const text = this.getConstant(a) as string;
          nodes[b] = document.createTextNode(text);
          break;
        }

        case Opcodes.APPEND_CHILD: {
          const parent = this.getNode(a);
          const child = this.getNode(b);
          if (parent && child) {
            parent.appendChild(child);
          }
          break;
        }

        case Opcodes.REMOVE_CHILD: {
          const parent = this.getNode(a);
          const child = this.getNode(b);
          if (parent && child && child.parentNode === parent) {
            parent.removeChild(child);
          }
          break;
        }

        case Opcodes.MOUNT: {
          const child = this.getNode(a);
          if (child) {
            this.rootElement.appendChild(child);
          }
          break;
        }

        case Opcodes.SET_TEXT: {
          const node = this.getNode(a);
          if (node) {
            const regVal = this.getRegister(b);
            const val = regVal == null ? '' : String(regVal);
            if (node.nodeValue !== val) {
              node.nodeValue = val;
            }
          }
          break;
        }

        case Opcodes.SET_ATTRIBUTE: {
          const node = this.getNode(a) as Element | null;
          if (node && typeof node.setAttribute === 'function') {
            const attr = this.getConstant(b) as string;
            const regVal = this.getRegister(c);
            const val = regVal == null ? '' : String(regVal);
            if (node.getAttribute(attr) !== val) {
              node.setAttribute(attr, val);
            }
          }
          break;
        }

        case Opcodes.SET_PROPERTY: {
          const node = this.getNode(a) as Record<string, unknown> | null;
          if (node) {
            const prop = this.getConstant(b) as string;
            const val = this.getRegister(c);
            if (node[prop] !== val) {
              node[prop] = val;
            }
          }
          break;
        }

        case Opcodes.BIND_EVENT: {
          const nodeIdx = a;
          const eventType = this.getConstant(b) as string;
          const jumpOffset = c;

          const key = `${nodeIdx}:${eventType}`;
          this.eventDelegationTable.set(key, jumpOffset);
          
          this.registerGlobalEvent(eventType);
          break;
        }

        case Opcodes.JUMP: {
          const offset = inst & 0xFFFFFF;
          this.pc = offset;
          break;
        }

        case Opcodes.JUMP_IF_TRUE: {
          const reg = a;
          const offset = inst & 0xFFFFFF; // 24-bit jump offset matching ISA spec
          if (this.getRegister(reg)) {
            this.pc = offset;
          }
          break;
        }

        case Opcodes.CALL: {
          const offset = inst & 0xFFFFFF;
          callStack.push(this.pc);
          this.pc = offset;
          break;
        }

        case Opcodes.RETURN: {
          this.setRegister(0, null); // Free event object reference for GC
          this.dirtyMask = 0;        // Reset dirty mask for next update cycle
          if (callStack.length > 0) {
            this.pc = callStack.pop()!;
            break;
          }
          return;
        }

        default:
          throw new Error(`Unknown opcode: ${op}`);
      }
    }
  }
}

export interface DriftJSComponent {
  program: VMProgram;
  ast?: unknown[];
  mount?: (target: HTMLElement) => DriftJSVM;
}

export type DriftComponent = DriftJSComponent;

/**
 * Convenience function to create and mount a DriftJSVM instance.
 *
 * @param program - The compiled VM program to execute.
 * @param rootElement - Target HTML element to mount into.
 * @returns Mounted DriftJSVM instance.
 */
export function mountApp(program: VMProgram, rootElement: HTMLElement): DriftJSVM {
  const vm = new DriftJSVM(program, rootElement);
  vm.mount();
  return vm;
}

/**
 * Mounts a DriftComponent into a target HTML element.
 *
 * @param component - The component containing compiled program bytecode.
 * @param target - Target HTML element to mount into.
 * @returns Mounted DriftJSVM instance.
 */
export function mount(component: DriftComponent, target: HTMLElement): DriftJSVM {
  if (typeof component.mount === 'function') {
    return component.mount(target);
  }
  return mountApp(component.program, target);
}
