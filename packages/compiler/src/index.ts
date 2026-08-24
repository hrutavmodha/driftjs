export * from '../types/index.js';
export { Opcode } from '../types/opcodes.js';
export { DriftLexer } from './lexer.js';
export { DriftParser } from './parser.js';
export { DriftTransformer, traverseTemplateAST } from './transformer.js';
export type { TemplateASTVisitor } from './transformer.js';
export { DriftGenerator, astToJS } from './generator.js';

import { DriftLexer } from './lexer.js';
import { DriftParser } from './parser.js';
import { DriftTransformer } from './transformer.js';
import { DriftGenerator } from './generator.js';

/**
 * Compiles Drift template source code into a register-based virtual machine module.
 *
 * @param src - The template source string to compile.
 * @param debug - If true, logs intermediate AST and final compiled module.
 */
export function compile(src: string, debug: boolean = false) {
    const lexer = new DriftLexer(src);
    const parser = new DriftParser(lexer);
    const ast = parser.parse();
    const transformer = new DriftTransformer(ast);
    const transformedAst = transformer.transform();
    const generator = new DriftGenerator(transformedAst);
    const compiledModule = generator.generate();

    if (debug) {
        console.log('--- Transformed AST ---');
        console.log(JSON.stringify(transformedAst, null, 2));
        console.log('--- Compiled Module ---');
        console.log(JSON.stringify(compiledModule, null, 2));
    }

    return compiledModule;
}
