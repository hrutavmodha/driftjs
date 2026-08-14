# create-drift

> CLI scaffolding tool for **DriftJS** — high-performance register VM Single File Component applications.

## Quick Start

Create a new DriftJS project instantly using your preferred package manager:

```bash
# npm
npx create-drift my-app

# pnpm
pnpm create drift my-app

# yarn
yarn create drift my-app

# bun
bun create drift my-app
```

### Non-Interactive / Quick Mode

Skip prompts and initialize immediately with default Client-Side Rendering (CSR) settings:

```bash
npx create-drift my-app -y
```

## Options & Flags

| Flag | Short | Description |
| :--- | :--- | :--- |
| `--yes` | `-y` | Automatically accept defaults (CSR, auto-install dependencies, start dev server) |
| `--help` | `-h` | Display usage and help message |

## Supported Rendering Targets

- **CSR (Client-Side Rendering):** Scaffolds a fast client-side Vite project using `@driftjs/dom`.
- **SSR (Server-Side Rendering):** Scaffolds a dual CSR/SSR project using `@driftjs/ssr` and Node.js server entry.

## License

MIT © [Hrutav Modha](https://github.com/hrutavmodha)
