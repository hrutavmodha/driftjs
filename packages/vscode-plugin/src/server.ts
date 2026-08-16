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
  TextEdit,
  Range,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { compile } from 'driftjs-compiler';

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
    const msg = String(err?.message || err);
    // Ignore transient typing syntax errors to prevent intrusive red squiggles while typing
    const isTransientError = /unclosed|unexpected eof|unterminated|expected/i.test(msg);

    if (!isTransientError) {
      if (err && typeof err === 'object' && ('line' in err || 'column' in err)) {
        const line = Math.max(0, (Number(err.line) || 1) - 1);
        const col = Math.max(0, (Number(err.column) || 1) - 1);

        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line, character: col },
            end: { line, character: col + 5 },
          },
          message: msg,
          source: 'DriftJS Compiler',
        });
      }
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
  const scriptMatch = docText.match(/<script[^>]*>([\s\S]*?)(?:<\/script>|$)/i);
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
  const lookback = text.slice(Math.max(0, offset - 1000), offset);

  const scriptVars = extractScriptVars(text);

  // 1. Trigger inside interpolation { ... }, directive header @if ..., or <script> block
  const isInsideInterpolation = /\{[^{}]*$/.test(lookback);
  const isInsideDirectiveHeader = /@(?:if|else\s+if|for|switch)\b[^{}]*$/.test(linePrefix);
  const isInsideScript = /<script[^>]*>(?:(?!<\/script>)[\s\S])*$/i.test(text.slice(0, offset));

  if (isInsideInterpolation || isInsideDirectiveHeader || isInsideScript) {
    return scriptVars;
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
    // If inside an attribute string value (e.g., class="...|"), don't suggest attribute names
    if (/=\s*"[^"]*$/.test(linePrefix) || /=\s*'[^']*$/.test(linePrefix)) {
      if (/type=\s*["'][^"']*$/.test(linePrefix)) {
        return [
          { label: 'text', kind: CompletionItemKind.Value },
          { label: 'password', kind: CompletionItemKind.Value },
          { label: 'number', kind: CompletionItemKind.Value },
          { label: 'checkbox', kind: CompletionItemKind.Value },
          { label: 'radio', kind: CompletionItemKind.Value },
          { label: 'submit', kind: CompletionItemKind.Value },
          { label: 'button', kind: CompletionItemKind.Value },
          { label: 'email', kind: CompletionItemKind.Value },
          { label: 'hidden', kind: CompletionItemKind.Value },
        ];
      }
      return [];
    }

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
    // Structural / Layout
    { name: 'div', snippet: '<div class="$1">\n\t$0\n</div>' },
    { name: 'span', snippet: '<span>$0</span>' },
    { name: 'header', snippet: '<header>\n\t$0\n</header>' },
    { name: 'footer', snippet: '<footer>\n\t$0\n</footer>' },
    { name: 'nav', snippet: '<nav>\n\t$0\n</nav>' },
    { name: 'main', snippet: '<main>\n\t$0\n</main>' },
    { name: 'section', snippet: '<section>\n\t$0\n</section>' },
    { name: 'article', snippet: '<article>\n\t$0\n</article>' },
    { name: 'aside', snippet: '<aside>\n\t$0\n</aside>' },
    { name: 'details', snippet: '<details>\n\t<summary>${1:Summary}</summary>\n\t$0\n</details>' },
    { name: 'summary', snippet: '<summary>$0</summary>' },
    { name: 'dialog', snippet: '<dialog>\n\t$0\n</dialog>' },

    // Headings & Text Formatting
    { name: 'h1', snippet: '<h1>$0</h1>' },
    { name: 'h2', snippet: '<h2>$0</h2>' },
    { name: 'h3', snippet: '<h3>$0</h3>' },
    { name: 'h4', snippet: '<h4>$0</h4>' },
    { name: 'h5', snippet: '<h5>$0</h5>' },
    { name: 'h6', snippet: '<h6>$0</h6>' },
    { name: 'p', snippet: '<p>$0</p>' },
    { name: 'a', snippet: '<a href="$1">$0</a>' },
    { name: 'strong', snippet: '<strong>$0</strong>' },
    { name: 'em', snippet: '<em>$0</em>' },
    { name: 'code', snippet: '<code>$0</code>' },
    { name: 'pre', snippet: '<pre>$0</pre>' },
    { name: 'blockquote', snippet: '<blockquote>$0</blockquote>' },
    { name: 'small', snippet: '<small>$0</small>' },
    { name: 'mark', snippet: '<mark>$0</mark>' },
    { name: 'time', snippet: '<time datetime="$1">$0</time>' },
    { name: 'hr', snippet: '<hr />' },
    { name: 'br', snippet: '<br />' },

    // Forms & Inputs
    { name: 'form', snippet: '<form onsubmit={$1}>\n\t$0\n</form>' },
    { name: 'label', snippet: '<label>$0</label>' },
    { name: 'input', snippet: '<input type="${1:text}" value={$2} />' },
    { name: 'button', snippet: '<button onclick={$1}>$0</button>' },
    { name: 'textarea', snippet: '<textarea value={$1}>$0</textarea>' },
    { name: 'select', snippet: '<select value={$1}>\n\t$0\n</select>' },
    { name: 'option', snippet: '<option value="$1">$0</option>' },
    { name: 'optgroup', snippet: '<optgroup label="$1">\n\t$0\n</optgroup>' },
    { name: 'fieldset', snippet: '<fieldset>\n\t<legend>${1:Legend}</legend>\n\t$0\n</fieldset>' },
    { name: 'legend', snippet: '<legend>$0</legend>' },
    { name: 'datalist', snippet: '<datalist id="$1">\n\t$0\n</datalist>' },
    { name: 'output', snippet: '<output>$0</output>' },

    // Lists
    { name: 'ul', snippet: '<ul>\n\t$0\n</ul>' },
    { name: 'ol', snippet: '<ol>\n\t$0\n</ol>' },
    { name: 'li', snippet: '<li>$0</li>' },
    { name: 'dl', snippet: '<dl>\n\t$0\n</dl>' },
    { name: 'dt', snippet: '<dt>$0</dt>' },
    { name: 'dd', snippet: '<dd>$0</dd>' },

    // Tables
    { name: 'table', snippet: '<table>\n\t<thead>\n\t\t<tr>\n\t\t\t<th>$1</th>\n\t\t</tr>\n\t</thead>\n\t<tbody>\n\t\t<tr>\n\t\t\t<td>$2</td>\n\t\t</tr>\n\t</tbody>\n</table>' },
    { name: 'thead', snippet: '<thead>\n\t$0\n</thead>' },
    { name: 'tbody', snippet: '<tbody>\n\t$0\n</tbody>' },
    { name: 'tfoot', snippet: '<tfoot>\n\t$0\n</tfoot>' },
    { name: 'tr', snippet: '<tr>\n\t$0\n</tr>' },
    { name: 'th', snippet: '<th>$0</th>' },
    { name: 'td', snippet: '<td>$0</td>' },
    { name: 'caption', snippet: '<caption>$0</caption>' },

    // Media & Embedded Content
    { name: 'img', snippet: '<img src="$1" alt="$2" />' },
    { name: 'video', snippet: '<video src="$1" controls>$0</video>' },
    { name: 'audio', snippet: '<audio src="$1" controls>$0</audio>' },
    { name: 'source', snippet: '<source src="$1" type="$2" />' },
    { name: 'track', snippet: '<track kind="$1" src="$2" srclang="$3" label="$4" />' },
    { name: 'canvas', snippet: '<canvas width="$1" height="$2">$0</canvas>' },
    { name: 'svg', snippet: '<svg viewBox="$1">\n\t$0\n</svg>' },
    { name: 'iframe', snippet: '<iframe src="$1" title="$2"></iframe>' },
    { name: 'figure', snippet: '<figure>\n\t$0\n\t<figcaption>${1:Caption}</figcaption>\n</figure>' },
    { name: 'figcaption', snippet: '<figcaption>$0</figcaption>' },

    // Scripts & Metadata
    { name: 'script', snippet: '<script>\n\tlet ${1:count} = 0;\n</script>' },
    { name: 'style', snippet: '<style>\n\t$0\n</style>' },
    { name: 'template', snippet: '<template>\n\t$0\n</template>' },
    { name: 'slot', snippet: '<slot name="$1">$0</slot>' },
  ];

  const matchBefore = linePrefix.match(/<([a-zA-Z0-9_-]*)$/);
  const lineAfter = text.slice(offset, offset + 20);
  const hasTrailingGt = /^>/.test(lineAfter);

  let replaceRange: Range | undefined = undefined;

  if (matchBefore && matchBefore[1] !== undefined) {
    const typedWordLen = matchBefore[1].length;
    const startChar = params.position.character - typedWordLen;
    const endChar = hasTrailingGt
      ? params.position.character + 1
      : params.position.character;

    replaceRange = Range.create(
      { line: params.position.line, character: startChar },
      { line: params.position.line, character: endChar }
    );
  }

  return [
    ...htmlElements.map((el) => {
      const item: CompletionItem = {
        label: el.name,
        kind: CompletionItemKind.Snippet,
        detail: `DriftJS HTML <${el.name}> Element`,
        insertTextFormat: InsertTextFormat.Snippet,
      };

      if (replaceRange) {
        const snippetNoLt = el.snippet.startsWith('<') ? el.snippet.slice(1) : el.snippet;
        item.textEdit = TextEdit.replace(replaceRange, snippetNoLt);
      } else {
        item.insertText = el.snippet;
      }

      return item;
    }),
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

  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  const lineEnd = text.indexOf('\n', offset);
  const lineText = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
  const charInLine = params.position.character;

  // Match `@if`, `@for`, `@switch`, `@else` directives ONLY when explicitly prefixed with `@`
  const directiveMatch = lineText.match(/@(if|else\s+if|else|for|switch|case|default)\b/);
  if (directiveMatch) {
    const dirIdx = lineText.indexOf(directiveMatch[0]);
    if (charInLine >= dirIdx && charInLine <= dirIdx + directiveMatch[0].length) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `**DriftJS Directive \`${directiveMatch[0]}\`**\n\nReactive AOT directive compiled into 32-bit register VM bytecode.`,
        },
      };
    }
  }

  // Check state variable hover under cursor
  const words = Array.from(lineText.matchAll(/([a-zA-Z0-9_$]+)/g));
  for (const w of words) {
    const start = w.index ?? 0;
    const end = start + w[0].length;
    if (charInLine >= start && charInLine <= end) {
      const word = w[0];
      const scriptVars = extractScriptVars(text);
      const matchedVar = scriptVars.find((v) => v.label === word);
      if (matchedVar) {
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: `**${matchedVar.detail}**\n\n${matchedVar.documentation}`,
          },
        };
      }
    }
  }

  return null;
});

documents.listen(connection);
connection.listen();
