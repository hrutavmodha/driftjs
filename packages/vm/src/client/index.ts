import { Opcodes } from '../isa.js';
import type { Opcode, VMProgram, DriftComponent } from '../../types/index.js';

/**
 * DriftJS Virtual Machine for executing bytecode programs against a target HTML element.
 */
export class DriftJSClientVM {
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
   * @param rootElement - Target HTML element to mount the application onto.
   */
  constructor(
    program: VMProgram,
    private readonly rootElement: HTMLElement
  ) {
    this.bytecode = program.bytecode;
    this.constants = program.constants;
    this.updateBlockOffset = program.updateBlockOffset ?? 0;
    this.nodes = [rootElement];
    this.registers = [null];
    this.callStack = [];
    this.pc = 0;
    this.prevRegBuffer = [];
    this.eventDelegationTable = new Map();
    this.registeredEvents = new Map();
  }

  /**
   * Boots the application by running the initial mount block of the bytecode.
   */
  public boot(): void {
    this.execute(0);
    this.dirtyMask = 0;
    this.prevRegBuffer = [...this.registers];
  }

  /**
   * Unmounts the application by clearing event listeners and emptying the root element.
   */
  public unmount(): void {
    for (const [eventName, handler] of this.registeredEvents.entries()) {
      this.rootElement.removeEventListener(eventName, handler);
    }
    this.registeredEvents.clear();
    this.eventDelegationTable.clear();

    this.rootElement.innerHTML = '';
    this.nodes = [];
    this.registers = [];
    this.dirtyMask = 0;
    this.prevRegBuffer = [];
    this.pc = 0;
  }

  /**
   * Marks a register as dirty and schedules a reactive DOM patch update.
   *
   * @param regIdx - Register index that changed.
   */
  public markDirty(regIdx: number): void {
    this.dirtyMask |= (1 << (regIdx % 32));
    this.scheduleUpdate();
  }

  private scheduleUpdate(): void {
    if (this.updatePending) return;
    this.updatePending = true;
    queueMicrotask(() => {
      this.updatePending = false;
      this.patch();
    });
  }

  /**
   * Runs the update block to patch changed DOM elements.
   */
  public patch(): void {
    if (this.dirtyMask === 0 || this.updateBlockOffset === 0) return;
    this.execute(this.updateBlockOffset);
    this.dirtyMask = 0;
    this.prevRegBuffer = [...this.registers];
  }

  /**
   * Executes bytecode from a specified program counter offset.
   *
   * @param startPc - Starting PC offset.
   */
  public execute(startPc: number): void {
    this.pc = startPc;

    while (this.pc < this.bytecode.length) {
      const inst = this.bytecode[this.pc]!;
      const op = ((inst >> 24) & 0xFF) as Opcode;
      const a = (inst >> 16) & 0xFF;
      const b = (inst >> 8) & 0xFF;
      const c = inst & 0xFF;
      const arg24 = inst & 0xFFFFFF;

      this.pc++;

      switch (op) {
        case Opcodes.LOAD_CONST: {
          this.registers[a] = this.constants[b];
          break;
        }

        case Opcodes.LOAD_NODE: {
          this.registers[a] = this.nodes[b] ?? null;
          break;
        }

        case Opcodes.EXEC_THUNK: {
          const reg = a;
          const thunkIdx = b;
          const depMask = c;

          if (depMask !== 0 && (this.dirtyMask & depMask) === 0) {
            break;
          }

          const thunk = this.constants[thunkIdx];
          if (typeof thunk === 'function') {
            this.registers[reg] = thunk(this.registers, this);
          }
          break;
        }

        case Opcodes.CREATE_ELEMENT: {
          const tag = this.constants[a] as string;
          const nodeIdx = b;
          const el = document.createElement(tag);
          this.nodes[nodeIdx] = el;
          break;
        }

        case Opcodes.CREATE_TEXT: {
          const textContent = (this.constants[a] as string) ?? '';
          const nodeIdx = b;
          const textNode = document.createTextNode(textContent);
          this.nodes[nodeIdx] = textNode;
          break;
        }

        case Opcodes.APPEND_CHILD: {
          const parentNode = (a === 0 ? this.rootElement : this.nodes[a]) as HTMLElement | null;
          const childNode = this.nodes[b];
          if (parentNode && childNode) {
            parentNode.appendChild(childNode);
          }
          break;
        }

        case Opcodes.REMOVE_CHILD: {
          const parentNode = (a === 0 ? this.rootElement : this.nodes[a]) as HTMLElement | null;
          const childNode = this.nodes[b];
          if (parentNode && childNode && childNode.parentNode === parentNode) {
            parentNode.removeChild(childNode);
          }
          break;
        }

        case Opcodes.MOUNT: {
          const nodeIdx = a;
          const targetNode = this.nodes[nodeIdx];
          if (targetNode) {
            this.rootElement.appendChild(targetNode);
          }
          break;
        }

        case Opcodes.SET_TEXT: {
          const nodeIdx = a;
          const regVal = String(this.registers[b] ?? '');
          const node = this.nodes[nodeIdx];
          if (node) {
            node.textContent = regVal;
          }
          break;
        }

        case Opcodes.SET_ATTRIBUTE: {
          const nodeIdx = a;
          const attrKey = this.constants[b] as string;
          const regVal = String(this.registers[c] ?? '');
          const node = this.nodes[nodeIdx];
          if (node && node instanceof HTMLElement) {
            node.setAttribute(attrKey, regVal);
          }
          break;
        }

        case Opcodes.SET_PROPERTY: {
          const nodeIdx = a;
          const propKey = this.constants[b] as string;
          const regVal = this.registers[c];
          const node = this.nodes[nodeIdx];
          if (node && node instanceof HTMLElement) {
            (node as any)[propKey] = regVal;
          }
          break;
        }

        case Opcodes.BIND_EVENT: {
          const nodeIdx = a;
          const eventName = this.constants[b] as string;
          const handlerOffset = c;

          const targetNode = (nodeIdx === 0 ? this.rootElement : this.nodes[nodeIdx]) as HTMLElement | null;
          if (targetNode) {
            targetNode.setAttribute(`data-drift-node`, String(nodeIdx));
          }

          this.eventDelegationTable.set(`${nodeIdx}:${eventName}`, handlerOffset);

          if (!this.registeredEvents.has(eventName)) {
            const delegatedListener = (e: Event) => {
              let curr = e.target as HTMLElement | null;
              while (curr && curr !== this.rootElement) {
                const nIdxStr = curr.getAttribute('data-drift-node');
                if (nIdxStr !== null) {
                  const nIdx = parseInt(nIdxStr, 10);
                  const key = `${nIdx}:${eventName}`;
                  const offset = this.eventDelegationTable.get(key);
                  if (offset !== undefined) {
                    this.registers[0] = e;
                    this.execute(offset);
                    break;
                  }
                }
                curr = curr.parentElement;
              }
            };

            this.rootElement.addEventListener(eventName, delegatedListener);
            this.registeredEvents.set(eventName, delegatedListener);
          }
          break;
        }

        case Opcodes.JUMP: {
          this.pc = arg24;
          break;
        }

        case Opcodes.JUMP_IF_TRUE: {
          const condReg = a;
          if (Boolean(this.registers[condReg])) {
            this.pc = (b << 8) | c;
          }
          break;
        }

        case Opcodes.CALL: {
          this.callStack.push(this.pc);
          this.pc = arg24;
          break;
        }

        case Opcodes.RETURN: {
          if (this.callStack.length > 0) {
            this.pc = this.callStack.pop()!;
          } else {
            return; // End execution
          }
          break;
        }

        default:
          throw new Error(`Unknown opcode: ${op}`);
      }
    }
  }
}

/**
 * Instantiates a VM and interprets/executes a VMProgram against a target HTML element.
 *
 * @param program - Compiled VM program bytecode and constants.
 * @param target - Target HTML element to mount into.
 * @returns Active DriftJSClientVM instance.
 */
export function interpret(program: VMProgram, target: HTMLElement): DriftJSClientVM {
  const vm = new DriftJSClientVM(program, target);
  vm.boot();
  return vm;
}

/**
 * Mounts a DriftComponent into a target HTML element.
 *
 * @param component - Compiled component object containing program bytecode.
 * @param target - Target HTML element to mount into.
 * @returns Active DriftJSClientVM instance.
 */
export function mount(component: DriftComponent, target: HTMLElement): DriftJSClientVM {
  if (typeof component.render === 'function') {
    return component.render(target);
  }
  return interpret(component.program, target);
}
