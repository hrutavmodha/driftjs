import { ProgramNode, CompiledModule } from '../types/index.js';

export class DriftGenerator {
  private readonly ast: ProgramNode;

  constructor(ast: ProgramNode) {
    this.ast = ast;
  }

  public generate(): CompiledModule {
    // Basic setup shell - generator implementation to follow
    return {
      bytecode: [],
      constants: [],
    };
  }
}
