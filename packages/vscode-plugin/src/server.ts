import {
  createConnection,
  TextDocuments,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  TextDocumentSyncKind,
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  Hover,
  MarkupKind,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { compile } from '@driftjs/compiler';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

connection.onInitialize(() => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        triggerCharacters: ['@', '<', '{', '.', ' ', '(', '"', '\''],
        resolveProvider: true,
      },
      hoverProvider: true,
    },
  };
});

function validateTextDocument(textDocument: TextDocument): void {
  const text = textDocument.getText();
  const diagnostics: Diagnostic[] = [];

  try {
    compile(text);
  } catch (err: any) {
    if (err && typeof err === 'object' && ('line' in err || 'column' in err)) {
      const line = Math.max(0, (Number(err.line) || 1) - 1);
      const col = Math.max(0, (Number(err.column) || 1) - 1);

      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line, character: col },
          end: { line, character: col + 10 },
        },
        message: String(err.message || err),
        source: 'DriftJS Compiler',
      });
    } else if (err instanceof Error) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 1 },
        },
        message: err.message,
        source: 'DriftJS Compiler',
      });
    }
  }

  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

documents.onDidChangeContent((change) => {
  validateTextDocument(change.document);
});

/**
 * Extracts declared variable and function names from SFC <script> block.
 */
function extractScriptVars(docText: string): CompletionItem[] {
  const scriptMatch = docText.match(/<script>([\s\S]*?)<\/script>/i);
  if (!scriptMatch || !scriptMatch[1]) return [];

  const scriptBody = scriptMatch[1];
  const items: CompletionItem[] = [];

  // Match: let x, const y, var z, function foo()
  const declRegex = /(?:let|const|var)\s+([a-zA-Z0-9_$]+)|function\s+([a-zA-Z0-9_$]+)/g;
  let match: RegExpExecArray | null;

  while ((match = declRegex.exec(scriptBody)) !== null) {
    const varName = match[1];
    const fnName = match[2];

    if (varName) {
      items.push({
        label: varName,
        kind: CompletionItemKind.Variable,
        detail: 'Reactive Component State Variable',
        documentation: `Declared state variable '${varName}' in <script> block.`,
      });
    } else if (fnName) {
      items.push({
        label: fnName,
        kind: CompletionItemKind.Function,
        detail: 'Component Handler Function',
        documentation: `Declared handler function '${fnName}()' in <script> block.`,
        insertText: `${fnName}()`,
      });
    }
  }

  return items;
}

connection.onCompletion((params): CompletionItem[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];

  const text = doc.getText();
  const offset = doc.offsetAt(params.position);
  const linePrefix = text.slice(Math.max(0, offset - 50), offset);

  const scriptVars = extractScriptVars(text);

  // 1. Trigger inside interpolation { ... } or directive header @if (...)
  if (/\{[^}]*$/.test(linePrefix) || /@(?:if|else\s+if|for|switch)\s*\(?[^)]*$/.test(linePrefix)) {
    return [
      ...scriptVars,
      { label: 'true', kind: CompletionItemKind.Keyword },
      { label: 'false', kind: CompletionItemKind.Keyword },
      { label: 'null', kind: CompletionItemKind.Keyword },
      { label: 'undefined', kind: CompletionItemKind.Keyword },
    ];
  }

  // 2. Trigger @ directives
  if (/@\w*$/.test(linePrefix) || linePrefix.endsWith('@')) {
    return [
      {
        label: '@if',
        kind: CompletionItemKind.Snippet,
        detail: 'DriftJS Conditional Directive',
        insertTextFormat: InsertTextFormat.Snippet,
        insertText: '@if (${1:condition}) {\n\t$0\n}',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Renders element tree conditionally based on a reactive expression:\n```drift\n@if (count > 0) {\n  <span>Positive</span>\n}\n```',
        },
      },
      {
        label: '@else if',
        kind: CompletionItemKind.Snippet,
        detail: 'DriftJS Else-If Directive',
        insertTextFormat: InsertTextFormat.Snippet,
        insertText: '@else if (${1:condition}) {\n\t$0\n}',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Adds an alternate conditional branch to an existing `@if` block.',
        },
      },
      {
        label: '@else',
        kind: CompletionItemKind.Snippet,
        detail: 'DriftJS Else Directive',
        insertTextFormat: InsertTextFormat.Snippet,
        insertText: '@else {\n\t$0\n}',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Fallback branch executed when preceding conditions are false.',
        },
      },
      {
        label: '@for',
        kind: CompletionItemKind.Snippet,
        detail: 'DriftJS Loop Directive',
        insertTextFormat: InsertTextFormat.Snippet,
        insertText: '@for (${1:item}, ${2:index}) in ${3:items} {\n\t$0\n}',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Reactively iterates over an array or iterable:\n```drift\n@for (item, index) in items {\n  <li>{item}</li>\n}\n```',
        },
      },
      {
        label: '@switch',
        kind: CompletionItemKind.Snippet,
        detail: 'DriftJS Switch Directive',
        insertTextFormat: InsertTextFormat.Snippet,
        insertText: '@switch ${1:status} {\n\t@case ${2:"active"} {\n\t\t$0\n\t}\n\t@default {\n\t\t\n\t}\n}',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Evaluates discriminant expression against `@case` branches.',
        },
      },
      {
        label: '@case',
        kind: CompletionItemKind.Snippet,
        detail: 'DriftJS Switch Case Branch',
        insertTextFormat: InsertTextFormat.Snippet,
        insertText: '@case ${1:value} {\n\t$0\n}',
      },
      {
        label: '@default',
        kind: CompletionItemKind.Snippet,
        detail: 'DriftJS Switch Default Branch',
        insertTextFormat: InsertTextFormat.Snippet,
        insertText: '@default {\n\t$0\n}',
      },
    ];
  }

  // 3. Trigger HTML attribute completion inside tag `<button |>`
  if (/<[a-zA-Z0-9_-]+\s+[^>]*$/.test(linePrefix)) {
    return [
      { label: 'class', kind: CompletionItemKind.Property, insertText: 'class="$1"', insertTextFormat: InsertTextFormat.Snippet },
      { label: 'id', kind: CompletionItemKind.Property, insertText: 'id="$1"', insertTextFormat: InsertTextFormat.Snippet },
      { label: 'style', kind: CompletionItemKind.Property, insertText: 'style="$1"', insertTextFormat: InsertTextFormat.Snippet },
      { label: 'type', kind: CompletionItemKind.Property, insertText: 'type="$1"', insertTextFormat: InsertTextFormat.Snippet },
      { label: 'value', kind: CompletionItemKind.Property, insertText: 'value={$1}', insertTextFormat: InsertTextFormat.Snippet },
      { label: 'placeholder', kind: CompletionItemKind.Property, insertText: 'placeholder="$1"', insertTextFormat: InsertTextFormat.Snippet },
      { label: 'disabled', kind: CompletionItemKind.Property, insertText: 'disabled={$1}', insertTextFormat: InsertTextFormat.Snippet },
      { label: 'checked', kind: CompletionItemKind.Property, insertText: 'checked={$1}', insertTextFormat: InsertTextFormat.Snippet },
      // Event handlers
      { label: 'onclick', kind: CompletionItemKind.Event, insertText: 'onclick={$1}', insertTextFormat: InsertTextFormat.Snippet, detail: 'Click Event Handler' },
      { label: 'oninput', kind: CompletionItemKind.Event, insertText: 'oninput={$1}', insertTextFormat: InsertTextFormat.Snippet, detail: 'Input Event Handler' },
      { label: 'onchange', kind: CompletionItemKind.Event, insertText: 'onchange={$1}', insertTextFormat: InsertTextFormat.Snippet, detail: 'Change Event Handler' },
      { label: 'onkeydown', kind: CompletionItemKind.Event, insertText: 'onkeydown={$1}', insertTextFormat: InsertTextFormat.Snippet, detail: 'Keydown Event Handler' },
      { label: 'onkeyup', kind: CompletionItemKind.Event, insertText: 'onkeyup={$1}', insertTextFormat: InsertTextFormat.Snippet, detail: 'Keyup Event Handler' },
      { label: 'onsubmit', kind: CompletionItemKind.Event, insertText: 'onsubmit={$1}', insertTextFormat: InsertTextFormat.Snippet, detail: 'Submit Event Handler' },
    ];
  }

  // 4. Default: HTML Element Snippets & Tags
  const htmlElements = [
    { name: 'div', snippet: '<div class="$1">\n\t$0\n</div>' },
    { name: 'span', snippet: '<span>$0</span>' },
    { name: 'button', snippet: '<button onclick={$1}>$0</button>' },
    { name: 'input', snippet: '<input type="${1:text}" value={$2} />' },
    { name: 'p', snippet: '<p>$0</p>' },
    { name: 'h1', snippet: '<h1>$0</h1>' },
    { name: 'h2', snippet: '<h2>$0</h2>' },
    { name: 'h3', snippet: '<h3>$0</h3>' },
    { name: 'a', snippet: '<a href="$1">$0</a>' },
    { name: 'ul', snippet: '<ul>\n\t$0\n</ul>' },
    { name: 'li', snippet: '<li>$0</li>' },
    { name: 'section', snippet: '<section>\n\t$0\n</section>' },
    { name: 'form', snippet: '<form onsubmit={$1}>\n\t$0\n</form>' },
    { name: 'label', snippet: '<label>$0</label>' },
    { name: 'select', snippet: '<select value={$1}>\n\t$0\n</select>' },
    { name: 'option', snippet: '<option value="$1">$0</option>' },
    { name: 'textarea', snippet: '<textarea value={$1}>$0</textarea>' },
    { name: 'script', snippet: '<script>\n\tlet ${1:count} = 0;\n</script>' },
    { name: 'style', snippet: '<style>\n\t$0\n</style>' },
    { name: 'img', snippet: '<img src="$1" alt="$2" />' },
  ];

  return [
    ...htmlElements.map((el) => ({
      label: el.name,
      kind: CompletionItemKind.Snippet,
      detail: `DriftJS HTML <${el.name}> Element`,
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: linePrefix.trim().endsWith('<') ? `${el.name}>$0</${el.name}>` : el.snippet,
    })),
    ...scriptVars,
  ];
});

connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  return item;
});

connection.onHover((params): Hover | null => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;

  const text = doc.getText();
  const offset = doc.offsetAt(params.position);
  const wordMatch = text.slice(Math.max(0, offset - 15), offset + 15).match(/@?(if|for|switch|else|case|default)/);

  if (wordMatch) {
    const keyword = wordMatch[0];
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**DriftJS Directive \`${keyword}\`**\n\nReactive AOT directive compiled into 32-bit register VM bytecode.`,
      },
    };
  }

  return null;
});

documents.listen(connection);
connection.listen();
