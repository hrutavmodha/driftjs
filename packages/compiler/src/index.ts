export * from '../types/index.js';
import { DriftLexer } from './lexer.js';
import { DriftParser } from './parser.js';
import { DriftTransformer } from './transformer.js';

export function interprete(src: string, debug: boolean = false): void {
    const lexer = new DriftLexer(src);
    const parser = new DriftParser(lexer);
    const ast = parser.parse();
    const transformer = new DriftTransformer(ast);
    const transformedAst = transformer.transform();

    if (debug) {
        console.log(JSON.stringify(transformedAst, null, 2));
    }
    // TODO: Generator and VM coming soon!
}
