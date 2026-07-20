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

  describe('HTML void elements and nested braces', () => {
    it('should correctly parse void elements without expecting closing tags', () => {
      const template = '<div><img src="avatar.png"><br><input type="checkbox"></div>';
      const ast = parseTemplate(template);
      expect(ast).toEqual([
        {
          type: 'Element',
          tag: 'div',
          attributes: {},
          events: {},
          children: [
            { type: 'Element', tag: 'img', attributes: { src: 'avatar.png' }, events: {}, children: [] },
            { type: 'Element', tag: 'br', attributes: {}, events: {}, children: [] },
            { type: 'Element', tag: 'input', attributes: { type: 'checkbox' }, events: {}, children: [] }
          ]
        }
      ]);
    });

    it('should parse interpolations with nested braces and arrow functions', () => {
      const template = '<p>{items.map(x => ({ id: x.id }))}</p>';
      const ast = parseTemplate(template);
      expect(ast).toEqual([
        {
          type: 'Element',
          tag: 'p',
          attributes: {},
          events: {},
          children: [
            {
              type: 'Interpolation',
              expression: 'items.map(x => ({ id: x.id }))'
            }
          ]
        }
      ]);
    });

    it('should strip whitespace-only formatting text nodes between elements', () => {
      const template = `
        <div>
          <h1>Title</h1>
        </div>
      `;
      const ast = parseTemplate(template);
      expect(ast).toEqual([
        {
          type: 'Element',
          tag: 'div',
          attributes: {},
          events: {},
          children: [
            {
              type: 'Element',
              tag: 'h1',
              attributes: {},
              events: {},
              children: [{ type: 'Text', content: 'Title' }]
            }
          ]
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

    it('should throw Error when interpolation is unclosed', () => {
      const parser = new DriftJSParser('<p>{count</p>');
      expect(() => parser.parse()).toThrow('Unclosed interpolation expression');
    });
  });
});
