import {
  ProgramNode,
  TemplateChildNode,
  ElementNode,
  TextNode,
  InterpolationNode,
  CommentNode,
  AttributeNode,
  IfNode,
  ForNode,
  SwitchNode,
  ASTNodeType,
  Opcode,
  CompiledModule,
} from '../types/index.js';

/**
 * Generator for Drift template compiler.
 * Converts enriched AST (ProgramNode) into register-based Virtual Machine bytecode
 * and a constant pool module.
 */
export class DriftGenerator {
  private readonly ast: ProgramNode;
  private bytecode: number[] = [];
  private constants: any[] = [];
  private nextRegisterId = 0;

  constructor(ast: ProgramNode) {
    this.ast = ast;
  }

  /**
   * Compiles the AST into a bytecode stream and constant pool module.
   * @returns CompiledModule containing numeric bytecode and constant pool.
   */
  public generate(): CompiledModule {
    this.bytecode = [];
    this.constants = [];
    this.nextRegisterId = 0;

    if (this.ast.body.length === 0) {
      const rootReg = this.allocRegister();
      this.emit(Opcode.CREATE_FRAGMENT, rootReg);
      this.emit(Opcode.RETURN, rootReg);
      return {
        bytecode: this.bytecode,
        constants: this.constants,
      };
    }

    if (this.ast.body.length === 1 && this.ast.body[0]?.type === ASTNodeType.Element) {
      const rootReg = this.allocRegister();
      this.compileElement(this.ast.body[0] as ElementNode, rootReg);
      this.emit(Opcode.RETURN, rootReg);
    } else {
      const rootReg = this.allocRegister();
      this.emit(Opcode.CREATE_FRAGMENT, rootReg);
      for (const child of this.ast.body) {
        this.compileNode(child, rootReg);
      }
      this.emit(Opcode.RETURN, rootReg);
    }

    return {
      bytecode: this.bytecode,
      constants: this.constants,
    };
  }

  /**
   * Compiles a single TemplateChildNode into register bytecode operations.
   */
  private compileNode(node: TemplateChildNode, parentReg: number): void {
    switch (node.type) {
      case ASTNodeType.Element:
        this.compileElementNode(node, parentReg);
        break;
      case ASTNodeType.Text:
        this.compileTextNode(node, parentReg);
        break;
      case ASTNodeType.Interpolation:
        this.compileInterpolationNode(node, parentReg);
        break;
      case ASTNodeType.Comment:
        this.compileCommentNode(node, parentReg);
        break;
      case ASTNodeType.If:
        this.compileIfNode(node, parentReg);
        break;
      case ASTNodeType.For:
        this.compileForNode(node, parentReg);
        break;
      case ASTNodeType.Switch:
        this.compileSwitchNode(node, parentReg);
        break;
    }
  }

  private compileElement(node: ElementNode, targetReg: number): void {
    const tagConstIdx = this.addConstant(node.tagName);
    this.emit(Opcode.CREATE_ELEMENT, targetReg, tagConstIdx);

    for (const attr of node.attributes) {
      this.compileAttributeNode(attr, targetReg);
    }

    for (const child of node.children) {
      this.compileNode(child, targetReg);
    }
  }

  private compileElementNode(node: ElementNode, parentReg: number): void {
    const elemReg = this.allocRegister();
    this.compileElement(node, elemReg);
    this.emit(Opcode.APPEND_CHILD, parentReg, elemReg);
  }

  private compileAttributeNode(attr: AttributeNode, elemReg: number): void {
    const nameIdx = this.addConstant(attr.name);

    if (attr.value === null) {
      const valIdx = this.addConstant(true);
      this.emit(Opcode.SET_ATTR, elemReg, nameIdx, valIdx, 0);
    } else if (typeof attr.value === 'string') {
      const valIdx = this.addConstant(attr.value);
      this.emit(Opcode.SET_ATTR, elemReg, nameIdx, valIdx, 0);
    } else if (attr.value.type === ASTNodeType.Interpolation) {
      const exprIdx = this.addConstant(attr.value.expression);
      this.emit(Opcode.SET_ATTR, elemReg, nameIdx, exprIdx, 1);
    }
  }

  private compileTextNode(node: TextNode, parentReg: number): void {
    const textReg = this.allocRegister();
    const textConstIdx = this.addConstant(node.content);
    this.emit(Opcode.CREATE_TEXT, textReg, textConstIdx);
    this.emit(Opcode.APPEND_CHILD, parentReg, textReg);
  }

  private compileInterpolationNode(node: InterpolationNode, parentReg: number): void {
    const textReg = this.allocRegister();
    const exprConstIdx = this.addConstant(node.expression);
    this.emit(Opcode.INTERPOLATE_TEXT, textReg, exprConstIdx);
    this.emit(Opcode.APPEND_CHILD, parentReg, textReg);
  }

  private compileCommentNode(node: CommentNode, parentReg: number): void {
    const commentReg = this.allocRegister();
    const commentConstIdx = this.addConstant(node.content);
    this.emit(Opcode.CREATE_COMMENT, commentReg, commentConstIdx);
    this.emit(Opcode.APPEND_CHILD, parentReg, commentReg);
  }

  private compileIfNode(node: IfNode, parentReg: number): void {
    const condReg = this.allocRegister();
    const exprIdx = this.addConstant(node.test);
    this.emit(Opcode.EVAL_EXPR, condReg, exprIdx);

    const jumpIfFalsePos = this.emitJumpIfFalsePlaceholder(condReg);

    for (const child of node.consequent) {
      this.compileNode(child, parentReg);
    }

    if (node.alternate !== null) {
      const jumpToEndPos = this.emitJumpPlaceholder();
      const altTarget = this.bytecode.length;
      this.patchJump(jumpIfFalsePos, altTarget);

      if (Array.isArray(node.alternate)) {
        for (const child of node.alternate) {
          this.compileNode(child, parentReg);
        }
      } else {
        this.compileIfNode(node.alternate as IfNode, parentReg);
      }

      const endTarget = this.bytecode.length;
      this.patchJump(jumpToEndPos, endTarget);
    } else {
      const altTarget = this.bytecode.length;
      this.patchJump(jumpIfFalsePos, altTarget);
    }
  }

  private compileForNode(node: ForNode, parentReg: number): void {
    const arrayReg = this.allocRegister();
    const iterIdx = this.addConstant(node.iterable);
    this.emit(Opcode.EVAL_EXPR, arrayReg, iterIdx);

    const itemReg = this.allocRegister();
    const indexReg = node.index !== null ? this.allocRegister() : 0xff;

    const itemConstIdx = this.addConstant(node.item);
    const indexConstIdx = node.index !== null ? this.addConstant(node.index) : 0xffff;

    const loopStartPos = this.bytecode.length;
    const loopPatchPos = this.emitLoopIterPlaceholder(
      arrayReg,
      itemReg,
      indexReg,
      itemConstIdx,
      indexConstIdx
    );

    for (const child of node.body) {
      this.compileNode(child, parentReg);
    }

    this.emitJump(loopStartPos);

    const loopEndPos = this.bytecode.length;
    this.patchJump(loopPatchPos, loopEndPos);
  }

  private compileSwitchNode(node: SwitchNode, parentReg: number): void {
    const discReg = this.allocRegister();
    const discIdx = this.addConstant(node.discriminant);
    this.emit(Opcode.EVAL_EXPR, discReg, discIdx);

    const exitJumpPatches: number[] = [];

    for (const c of node.cases) {
      if (c.expression !== null) {
        const valReg = this.allocRegister();
        const valIdx = this.addConstant(c.expression);
        this.emit(Opcode.EVAL_EXPR, valReg, valIdx);

        const matchReg = this.allocRegister();
        const compareExprIdx = this.addConstant({
          type: 'BinaryExpression',
          operator: '===',
          left: node.discriminant,
          right: c.expression,
        });
        this.emit(Opcode.EVAL_EXPR, matchReg, compareExprIdx);

        const skipCasePos = this.emitJumpIfFalsePlaceholder(matchReg);

        for (const child of c.body) {
          this.compileNode(child, parentReg);
        }

        const exitPos = this.emitJumpPlaceholder();
        exitJumpPatches.push(exitPos);

        const nextCaseTarget = this.bytecode.length;
        this.patchJump(skipCasePos, nextCaseTarget);
      } else {
        for (const child of c.body) {
          this.compileNode(child, parentReg);
        }
      }
    }

    const switchEndTarget = this.bytecode.length;
    for (const exitPos of exitJumpPatches) {
      this.patchJump(exitPos, switchEndTarget);
    }
  }

  private allocRegister(): number {
    return this.nextRegisterId++;
  }

  private addConstant(value: any): number {
    const existingIndex = this.constants.findIndex((c) => this.isConstantEqual(c, value));
    if (existingIndex !== -1) {
      return existingIndex;
    }

    this.constants.push(value);
    return this.constants.length - 1;
  }

  private isConstantEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
      return JSON.stringify(a) === JSON.stringify(b);
    }
    return false;
  }

  private emit(opcode: Opcode, ...operands: number[]): void {
    this.bytecode.push(opcode, ...operands);
  }

  private emitJumpIfFalsePlaceholder(condReg: number): number {
    const pos = this.bytecode.length;
    this.bytecode.push(Opcode.JUMP_IF_FALSE, condReg, 0, 0);
    return pos;
  }

  private emitJumpPlaceholder(): number {
    const pos = this.bytecode.length;
    this.bytecode.push(Opcode.JUMP, 0, 0);
    return pos;
  }

  private emitJump(targetByte: number): void {
    const high = (targetByte >> 8) & 0xff;
    const low = targetByte & 0xff;
    this.bytecode.push(Opcode.JUMP, high, low);
  }

  private emitLoopIterPlaceholder(
    arrayReg: number,
    itemReg: number,
    indexReg: number,
    itemConstIdx: number,
    indexConstIdx: number
  ): number {
    const pos = this.bytecode.length;
    const itemHigh = (itemConstIdx >> 8) & 0xff;
    const itemLow = itemConstIdx & 0xff;
    const idxHigh = (indexConstIdx >> 8) & 0xff;
    const idxLow = indexConstIdx & 0xff;

    this.bytecode.push(
      Opcode.LOOP_ITER,
      arrayReg,
      itemReg,
      indexReg,
      itemHigh,
      itemLow,
      idxHigh,
      idxLow,
      0,
      0
    );
    return pos;
  }

  private patchJump(pos: number, targetByte: number): void {
    const high = (targetByte >> 8) & 0xff;
    const low = targetByte & 0xff;

    const op = this.bytecode[pos];
    if (op === Opcode.JUMP_IF_FALSE) {
      this.bytecode[pos + 2] = high;
      this.bytecode[pos + 3] = low;
    } else if (op === Opcode.JUMP) {
      this.bytecode[pos + 1] = high;
      this.bytecode[pos + 2] = low;
    } else if (op === Opcode.LOOP_ITER) {
      this.bytecode[pos + 8] = high;
      this.bytecode[pos + 9] = low;
    }
  }
}
