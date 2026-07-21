import { describe, it, expect } from 'vitest';
import { DriftJSGenerator, generate } from '../src/generator/index.js';
import { parseTemplate } from '../src/parser/index.js';

describe('DriftJSGenerator', () => {
  describe('constructor input data passing', () => {
    it('should generate AST passed in constructor via DriftJSGenerator', () => {
      const ast = parseTemplate('<div>Hello</div>');
      const generator = new DriftJSGenerator(ast);
      const program = generator.generate();

      expect(program.bytecode).toBeInstanceOf(Uint32Array);
      expect(program.bytecode.length).toBeGreaterThan(0);
      expect(program.constants).toContain('div');
      expect(program.constants).toContain('Hello');
    });

    it('should generate AST via generate convenience function', () => {
      const ast = parseTemplate('<p>Test</p>');
      const program = generate(ast);

      expect(program.bytecode).toBeInstanceOf(Uint32Array);
      expect(program.bytecode.length).toBeGreaterThan(0);
      expect(program.constants).toContain('p');
      expect(program.constants).toContain('Test');
    });
  });

  describe('script state and reactive update generation', () => {
    it('should generate script declarations, dynamic attribute expressions, and event handlers', () => {
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
      const generator = new DriftJSGenerator(ast);
      const program = generator.generate();

      expect(program.bytecode.length).toBeGreaterThan(0);
      expect(program.constants).toContain('input');
      expect(program.constants).toContain('value');
      expect(program.constants).toContain('input');
      const thunks = program.constants.filter((c) => typeof c === 'function');
      expect(thunks.length).toBeGreaterThan(0);
    });
  });
});
