import { describe, it, expect } from 'vitest';
import { DriftJSCompiler, compile } from '../src/compiler/index.js';
import { parseTemplate } from '../src/parser/index.js';

describe('DriftJSCompiler', () => {
  describe('constructor input data passing', () => {
    it('should compile AST passed in constructor', () => {
      const ast = parseTemplate('<div>Hello</div>');
      const compiler = new DriftJSCompiler(ast);
      const program = compiler.compile();

      expect(program.bytecode).toBeInstanceOf(Uint32Array);
      expect(program.bytecode.length).toBeGreaterThan(0);
      expect(program.constants).toContain('div');
      expect(program.constants).toContain('Hello');
    });

    it('should compile AST via compile convenience function', () => {
      const ast = parseTemplate('<p>Test</p>');
      const program = compile(ast);

      expect(program.bytecode).toBeInstanceOf(Uint32Array);
      expect(program.bytecode.length).toBeGreaterThan(0);
      expect(program.constants).toContain('p');
      expect(program.constants).toContain('Test');
    });
  });

  describe('script state and reactive update compilation', () => {
    it('should compile script declarations, dynamic attribute expressions, and event handlers', () => {
      const ast = parseTemplate(`
        <script>
          let userInput = "";
          function handleInput(e) {
            userInput = e.target.value;
          }
        </script>
        <div id="container">
          <input type="text" value={userInput} oninput={(e) => handleInput(e);} />
        </div>
      `);
      const compiler = new DriftJSCompiler(ast);
      const program = compiler.compile();

      expect(program.bytecode.length).toBeGreaterThan(0);
      expect(program.constants).toContain('input');
      expect(program.constants).toContain('value');
      expect(program.constants).toContain('input');
      const thunks = program.constants.filter((c) => typeof c === 'function');
      expect(thunks.length).toBeGreaterThan(0);
    });
  });
});
