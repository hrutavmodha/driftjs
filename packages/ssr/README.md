# driftjs-ssr

> Server-side rendering (SSR) engine for **DriftJS** applications.

Executes compiled DriftJS register VM bytecode in a fast, headless Node.js environment to build virtual node trees and stream clean HTML strings to the client.

## Installation

```bash
pnpm add driftjs-ssr
# or
npm install driftjs-ssr
```

## Features

- **Bytecode Parity:** Interprets the exact same `Uint32Array` bytecode compiled for the browser.
- **Headless Virtual Nodes:** Constructs lightweight virtual tree structures without full DOM overhead.
- **HTML Escaping:** Automatically escapes dynamic string interpolations to protect against XSS vulnerabilities.

## Usage Example

```javascript
import { renderToString } from 'driftjs-ssr';
import App from './App.drift';

// Render DriftJS component to HTML string
const html = renderToString(App);

console.log(html); // Output: "<button data-drift-node=\"1\">Count: 0</button>"
```

## License

MIT © [Hrutav Modha](https://github.com/hrutavmodha)
