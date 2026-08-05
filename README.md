# driftjs-cli

Official command-line tool for scaffolding, developing, building and serving DriftJS applications.

## Install

```bash
npm install -g driftjs-cli
```

Or run without installing:

```bash
npx driftjs-cli create my-app
```

## Commands

| Command | Description |
|---|---|
| `drift create <name>` | Scaffold a new DriftJS app in `./<name>` |
| `drift dev` | Start the dev server with live reload |
| `drift build` | Build the app for production into `dist/` |
| `drift serve` | Serve the production build locally |
| `drift --help` | List all commands |
| `drift --version` | Print the installed CLI version |

### `create` options

```bash
drift create my-app --install   # also run npm install
drift create my-app --no-git    # skip git init
drift create my-app --yes       # skip confirmation prompts
```

## Project layout (this repo)

```
drift-cli/
├─ bin/drift.js        CLI entry point (registers commands, parses argv)
├─ commands/           One file per Commander command (create/dev/build/serve)
├─ lib/                Core logic: generator, dev server, build, config loader
├─ utils/               Small shared helpers: logger, fs helpers, exec
└─ templates/           Files copied/filled in for every new project
```

See each file's top-of-file comment for details on its responsibility.

## License

MIT
