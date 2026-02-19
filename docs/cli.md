# CLI Companion

Install the CLI globally and run scans directly from your terminal. Designed to integrate with AI coding tools like Claude Code and Cursor.

## Installation

```
npm install -g asbuilt-cli
```

## Authentication

```
asbuilt login
```

Opens your browser for authentication. Token stored in `~/.asbuilt/config.json`.

## Commands

```
asbuilt scan .                          # Scan current directory
asbuilt scan . --model gemini           # Specify provider
asbuilt scan . --premium                # Use Opus-tier model
asbuilt scan . --prd ./docs/PRD.md      # Include PRD for drift analysis
asbuilt scan . --subdir packages/api    # Scan subdirectory
asbuilt scan . --output ~/Desktop       # Save to specific directory
asbuilt history                         # List recent scans
asbuilt logout                          # Clear credentials
```

## .asbuiltrc Config File

Place a `.asbuiltrc` file in your project root for project-level defaults. CLI flags override config file values.

```json
{
  "model": "gemini",
  "output": "./docs",
  "subdir": "packages/core",
  "premium": false
}
```

## AI Tool Integration

Run as_built directly from Claude Code or Cursor:

```
# User: "Run an as_built scan on this project"
asbuilt scan .

# Then reference the output:
# User: "Read AS_BUILT_AGENT.md and use it as context."
```

## CLI Troubleshooting

### `asbuilt: command not found`

The global npm bin directory is not in your PATH. Run `npm bin -g` to find the path and add it to your shell profile (`~/.bashrc`, `~/.zshrc`, etc.).

### Authentication expired or invalid

Run `asbuilt logout` then `asbuilt login` again. Tokens are stored in `~/.asbuilt/config.json` — you can delete that file manually if logout fails.

### Scan hangs or times out

The server has a 300-second limit for background processing. For large codebases, use `--subdir` to target a subdirectory, or switch to Gemini with `--model gemini` for its larger context window.

### `.asbuiltrc` values not applying

The config file must be valid JSON and located in the project root (same directory you run the command from). CLI flags always override config file values.

### Update available notification

Run `npm update -g asbuilt-cli` to get the latest version. Updates are manual — the CLI will notify you non-intrusively when a newer version is available.
