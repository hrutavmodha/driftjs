import { describe, it, expect } from 'vitest';
import { DriftJSParser, parseTemplate } from '../src/parser/index.js';

describe('DriftJSParser', () => {
  describe('constructor input data passing', () => {
    it('should parse template passed to constructor', () => {
      const parser = new DriftJSParser('<div>Hello</div>');
      const ast = parser.parse();
      expect(ast).toEqual([
        {
          type: 'Element',
          tag: 'div',
          attributes: {},
          events: {},
          children: [
            {
              type: 'Text',
              content: 'Hello'
            }
          ]
        }
      ]);
    });

    it('should parse template via parseTemplate convenience function', () => {
      const ast = parseTemplate('<p>{count}</p>');
      expect(ast).toEqual([
        {
          type: 'Element',
          tag: 'p',
          attributes: {},
          events: {},
          children: [
            {
              type: 'Interpolation',
              expression: 'count'
            }
          ]
        }
      ]);
    });

    it('should parse expression attributes and arrow function event handlers', () => {
      const template = '<input type="text" value={userInput} oninput={(e) => handleInput(e);} />';
      const ast = parseTemplate(template);
      expect(ast).toEqual([
        {
          type: 'Element',
          tag: 'input',
          attributes: {
            type: 'text',
            value: '{userInput}'
          },
          events: {
            input: '(e) => handleInput(e);'
          },
          children: []
        }
      ]);
    });
  });

  describe('edge and error cases', () => {
    it('should handle empty input', () => {
      const parser = new DriftJSParser('');
      const ast = parser.parse();
      expect(ast).toEqual([]);
    });

    it('should throw Error when tag name is missing', () => {
      const parser = new DriftJSParser('<>');
      expect(() => parser.parse()).toThrow('Expected tag name');
    });

    it('should throw Error when closing tag mismatches', () => {
      const parser = new DriftJSParser('<div></span>');
      expect(() => parser.parse()).toThrow('Expected closing tag </div> but got </span>');
    });
  });
});
