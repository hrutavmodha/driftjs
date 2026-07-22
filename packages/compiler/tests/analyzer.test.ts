import { describe, it, expect } from 'vitest';
import { DriftJSAnalyzer, analyzeAST } from '../src/analyzer/index.js';
import { parseTemplate } from '../src/parser/index.js';

describe('DriftJSAnalyzer', () => {
  describe('state variable discovery and register mapping', () => {
    it('should map top-level let, var, and const declarations to register indices', () => {
      const ast = parseTemplate('<script>let count = 0; const name = "Drift";</script>');
      const analysis = analyzeAST(ast);
      expect(analysis.varToReg.get('count')).toBe(1);
      expect(analysis.varToReg.get('name')).toBe(2);
      expect(analysis.nextRegIdx).toBe(3);
    });

    it('should rewrite reactive state assignments with markDirty calls', () => {
      const ast = parseTemplate('<script>let count = 0; function increment() { count++; }</script>');
      const analyzer = new DriftJSAnalyzer(ast);
      const result = analyzer.analyze();

      expect(result.scriptThunkCodes[0]).toContain('vm?.markDirty(1)');
    });

    it('should calculate dependency masks for interpolation expressions', () => {
      const ast = parseTemplate('<script>let a = 1; let b = 2;</script><p>{a + b}</p>');
      const analyzer = new DriftJSAnalyzer(ast);
      analyzer.analyze();

      const exprAnalysis = analyzer.rewriteExpression('a + b');
      expect(exprAnalysis.depMask).toBe((1 << 1) | (1 << 2)); // bit 1 and bit 2
      expect(exprAnalysis.rewritten).toBe('regs[1] + regs[2]');
    });
  });

  describe('edge and error cases', () => {
    it('should ignore local function parameter identifiers when analyzing expressions', () => {
      const ast = parseTemplate('<script>let items = [1, 2];</script>');
      const analyzer = new DriftJSAnalyzer(ast);
      analyzer.analyze();

      const exprAnalysis = analyzer.rewriteExpression('items.map(item => item * 2)');
      expect(exprAnalysis.depMask).toBe(1 << 1); // only items (reg 1), item is local param
      expect(exprAnalysis.rewritten).toBe('regs[1].map(item => item * 2)');
    });

    it('should throw error when referencing an undeclared state variable', () => {
      const ast = parseTemplate('<div>Hello</div>');
      const analyzer = new DriftJSAnalyzer(ast);
      analyzer.analyze();

      expect(() => analyzer.rewriteExpression('unknownVar + 1')).toThrow('Variable "unknownVar" is not defined in state');
    });

    it('should handle >32 state variables using bitmask wrapping', () => {
      let script = '<script>';
      for (let i = 1; i <= 33; i++) {
        script += `let v${i} = ${i}; `;
      }
      script += '</script>';
      const ast = parseTemplate(script);
      const analyzer = new DriftJSAnalyzer(ast);
      analyzer.analyze();

      expect(analyzer.varToReg.get('v33')).toBe(33);
      const exprAnalysis = analyzer.rewriteExpression('v33');
      expect(exprAnalysis.depMask).toBe(1 << (33 % 32));
    });

    it('should exclude arrow function parameters and local block variables from dependency mask', () => {
      const ast = parseTemplate('<script>let items = [1, 2];</script>');
      const analyzer = new DriftJSAnalyzer(ast);
      analyzer.analyze();

      const exprAnalysis = analyzer.rewriteExpression('(items) => { const count = items.length; return count * 2; }');
      expect(exprAnalysis.depMask).toBe(0);
      expect(exprAnalysis.rewritten).toBe('(items) => { const count = items.length; return count * 2; }');
    });

    it('should analyze top-level destructuring declarations in script', () => {
      const ast = parseTemplate('<script>let { count, name } = state;</script>');
      const analyzer = new DriftJSAnalyzer(ast);
      expect(() => analyzer.analyze()).not.toThrow();
    });
  });
});
