import { Opcodes, encodeInstruction, type Opcode } from '@driftjs/runtime';
import type { ASTNode, ElementNode, TextNode, InterpolationNode, ScriptNode, CompiledProgram } from '../../types/index.js';
import { DriftJSAnalyzer } from '../analyzer/index.js';

/**
 * DriftJS AST Bytecode Generator.
 * Consumes AST nodes and analyzed scope metadata to produce 32-bit instructions and constants pool.
 */
export class DriftJSGenerator {
  private bytecode: number[] = [];
  private constants: unknown[] = [];
  private constantMap: Map<unknown, number> = new Map();
  private nextNodeIdx = 1;
  private nextRegIdx = 1;
  private analyzer: DriftJSAnalyzer;

  private updates: { nodeIdx: number; reg: number; thunkIdx: number; depMask: number; attrKeyIdx?: number; isProperty?: boolean }[] = [];
  private eventHandlers: { nodeIdx: number; eventIdx: number; handlerStr: string; bindInstIdx: number }[] = [];

  /**
   * Initializes a new generator instance.
   *
   * @param ast - The AST nodes array to compile into bytecode.
   */
  constructor(private readonly ast: ASTNode[]) {
    this.analyzer = new DriftJSAnalyzer(ast);
  }

  public generate(): CompiledProgram {
    const analysis = this.analyzer.analyze();
    this.nextRegIdx = analysis.nextRegIdx;

    this.bytecode = [];
    this.constants = [];
    this.constantMap = new Map();
    this.nextNodeIdx = 1;
    this.updates = [];
    this.eventHandlers = [];

    const scriptThunkIndices: number[] = [];
    for (const thunkCode of analysis.scriptThunkCodes) {
      const thunkFn = this.analyzer.createThunk(thunkCode);
      scriptThunkIndices.push(this.getConstant(thunkFn));
    }

    // Emit script thunks at the beginning so state variables are initialized before element creation
    for (const thunkIdx of scriptThunkIndices) {
      this.emit(Opcodes.EXEC_THUNK, 0, thunkIdx);
    }

    const rootNodes = this.ast.filter((n): n is ElementNode | TextNode | InterpolationNode => n.type !== 'Script').map(node => this.compileNode(node));

    for (const rootIdx of rootNodes) {
      this.emit(Opcodes.MOUNT, rootIdx);
    }

    const endOfMountJumpIdx = this.bytecode.length;
    this.emit24(Opcodes.JUMP, 0); 

    const updateBlockOffset = this.bytecode.length;
    for (const up of this.updates) {
      this.emit(Opcodes.EXEC_THUNK, up.reg, up.thunkIdx, up.depMask);
      if (up.attrKeyIdx !== undefined) {
        const setOpcode = up.isProperty ? Opcodes.SET_PROPERTY : Opcodes.SET_ATTRIBUTE;
        this.emit(setOpcode, up.nodeIdx, up.attrKeyIdx, up.reg);
      } else {
        this.emit(Opcodes.SET_TEXT, up.nodeIdx, up.reg);
      }
    }
    this.emit(Opcodes.RETURN); 

    for (const handler of this.eventHandlers) {
      const handlerOffset = this.bytecode.length;
      const { rewritten } = this.analyzer.rewriteExpression(handler.handlerStr, true);
      const thunkFn = this.analyzer.createThunk(rewritten);
      const thunkIdx = this.getConstant(thunkFn);

      this.emit(Opcodes.EXEC_THUNK, 0, thunkIdx);
      this.emit(Opcodes.RETURN);

      this.bytecode[handler.bindInstIdx] = encodeInstruction(
        Opcodes.BIND_EVENT,
        handler.nodeIdx,
        handler.eventIdx,
        handlerOffset
      );
    }

    this.bytecode[endOfMountJumpIdx] = encodeInstruction(
      Opcodes.JUMP,
      0,
      (updateBlockOffset >> 8) & 0xFF,
      updateBlockOffset & 0xFF
    );

    return {
      bytecode: new Uint32Array(this.bytecode),
      constants: this.constants,
      updateBlockOffset
    };
  }

  private compileNode(node: ASTNode): number {
    switch (node.type) {
      case 'Element':
        return this.compileElement(node);
      case 'Text':
        return this.compileText(node);
      case 'Interpolation':
        return this.compileInterpolation(node);
      case 'Script':
        throw new Error('Script node compilation must occur prior to DOM tree walk');
      default:
        throw new Error(`Unknown AST node type: ${(node as any).type}`);
    }
  }

  private compileElement(node: ElementNode): number {
    const tagIdx = this.getConstant(node.tag);
    const nodeIdx = this.nextNodeIdx++;

    this.emit(Opcodes.CREATE_ELEMENT, tagIdx, nodeIdx);

    for (const [key, value] of Object.entries(node.attributes)) {
      const keyIdx = this.getConstant(key);
      const valStr = value.trim();

      const isProperty = key === 'value' || key === 'checked' || key === 'disabled';
      const setOpcode = isProperty ? Opcodes.SET_PROPERTY : Opcodes.SET_ATTRIBUTE;

      if (valStr.startsWith('{') && valStr.endsWith('}')) {
        const expr = valStr.slice(1, -1).trim();
        const { rewritten, depMask } = this.analyzer.rewriteExpression(expr);
        const thunkFn = this.analyzer.createThunk(`return ${rewritten}`);
        const thunkIdx = this.getConstant(thunkFn);
        const reg = this.nextRegIdx++;
        
        this.emit(Opcodes.EXEC_THUNK, reg, thunkIdx);
        this.emit(setOpcode, nodeIdx, keyIdx, reg);
        this.updates.push({ nodeIdx, reg, thunkIdx, depMask, attrKeyIdx: keyIdx, isProperty });
      } else {
        const valIdx = this.getConstant(value);
        const reg = this.nextRegIdx++;
        this.emit(Opcodes.LOAD_CONST, reg, valIdx);
        this.emit(setOpcode, nodeIdx, keyIdx, reg);
      }
    }

    for (const child of node.children) {
      if (child.type !== 'Script') {
        const childIdx = this.compileNode(child);
        this.emit(Opcodes.APPEND_CHILD, nodeIdx, childIdx);
      }
    }

    for (const [event, handlerStr] of Object.entries(node.events)) {
      const eventIdx = this.getConstant(event);
      const bindInstIdx = this.bytecode.length;
      this.emit(Opcodes.BIND_EVENT, nodeIdx, eventIdx, 0); 
      this.eventHandlers.push({ nodeIdx, eventIdx, handlerStr, bindInstIdx });
    }

    return nodeIdx;
  }

  private compileText(node: TextNode): number {
    const nodeIdx = this.nextNodeIdx++;
    const textIdx = this.getConstant(node.content);
    this.emit(Opcodes.CREATE_TEXT, textIdx, nodeIdx);
    return nodeIdx;
  }

  private compileInterpolation(node: InterpolationNode): number {
    const nodeIdx = this.nextNodeIdx++;
    
    const textIdx = this.getConstant('');
    this.emit(Opcodes.CREATE_TEXT, textIdx, nodeIdx);

    const { rewritten, depMask } = this.analyzer.rewriteExpression(node.expression);
    const thunkFn = this.analyzer.createThunk(`return ${rewritten}`);
    
    const thunkIdx = this.getConstant(thunkFn);
    const reg = this.nextRegIdx++;

    this.emit(Opcodes.EXEC_THUNK, reg, thunkIdx);
    this.emit(Opcodes.SET_TEXT, nodeIdx, reg);
    
    this.updates.push({ nodeIdx, reg, thunkIdx, depMask });

    return nodeIdx;
  }

  private getConstant(value: unknown): number {
    const existing = this.constantMap.get(value);
    if (existing !== undefined) return existing;
    const idx = this.constants.length;
    this.constants.push(value);
    this.constantMap.set(value, idx);
    return idx;
  }

  private emit(op: Opcode, a = 0, b = 0, c = 0): void {
    this.bytecode.push(encodeInstruction(op, a, b, c));
  }

  private emit24(op: Opcode, arg24 = 0): void {
    this.bytecode.push((op << 24) | (arg24 & 0xFFFFFF));
  }
}

/**
 * Convenience function to compile AST nodes directly into a bytecode program.
 *
 * @param ast - The AST node array.
 * @returns Compiled program.
 */
export function generate(ast: ASTNode[]): CompiledProgram {
  const gen = new DriftJSGenerator(ast);
  return gen.generate();
}


