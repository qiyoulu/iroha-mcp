# iroha / いろは

> color into language. language into order.

iroha is an MCP server for brand voice tooling. Lint copy and generate feedback against locked brand rules from inside Claude Desktop, Cursor, or any MCP-aware client. The name carries both halves: **iro** (color, the design side) and **ha** (the third syllable in the iroha poem that orders all kana, the writing side).

iroha ships infrastructure, not opinions. the rule engine is generic; your brand rules are yours to define. start from a blank scaffold, work through the tutorials, build the config that fits your voice.

## v0 wedge

- `lint_copy` — returns violations with rule, severity, span, and suggestion
- `lint_design` — flags raw hex outside the palette, off-scale dimensions, and color pairs that fail accessibility contrast. severity configurable per rule.
- `generate_feedback` — returns summary + violations + suggestions + optional rewrite
- `iroha_ingest` — build a `brand.config.json` from existing brand materials (paths or inline content). Recognizes w3c design tokens JSON, JSON5 (primer primitives), tailwind theme configs, css `:root` blocks, figma variables JSON, style-dictionary/polaris flat token JSON, and markdown design-system docs. Handles composite `$value` objects (typography, shadow, border, gradient, dimension), `{base.*}` and `{!name}` reference resolution, `$extensions` traversal, and mode-aware token overrides.
- `iroha_setup` — build a `brand.config.json` from a conversational exchange; merges with any existing config on the target path
- `extract_rules` — analyze a batch of approved (and optionally rejected) copy and return candidate values for `sentence_case`, `proper_nouns`, `forbidden_words`, exclamation/superlative usage, and CTA style

## install

```bash
npm install
npm run build
```

## run locally (stdio)

```bash
npm run start
```

Inspect with the MCP inspector:

```bash
npm run inspect
```

## configure for Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "iroha": {
      "command": "node",
      "args": ["/absolute/path/to/iroha-mcp/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. The `lint_copy` and `generate_feedback` tools will appear in the tool picker.

## configure for Cursor

Add to `~/.cursor/mcp.json` (create if missing):

```json
{
  "mcpServers": {
    "iroha": {
      "command": "node",
      "args": ["/absolute/path/to/iroha-mcp/dist/index.js"]
    }
  }
}
```

Restart Cursor.

## brand config

drop a `brand.config.json` next to your working directory, or pass `brand_config_path` to each tool call. the schema is enforced via zod in `src/config/schema.ts`.

if no config is found, iroha auto-writes a sensible default to `~/.config/iroha-mcp/brand.config.json` and uses it. the response will note when the default is in use — edit the file directly to customize your brand rules.

for a guided setup, use the `iroha_setup` tool. for an analysis-driven setup, call `extract_rules` against your approved copy samples first, then pass the values you accept into `iroha_setup`. for a materials-driven setup, point `iroha_ingest` at your brand's existing tokens JSON, tailwind config, css `:root` block, or markdown design system.

### setup paths

| flow                       | tool                                                | input                                  |
| -------------------------- | --------------------------------------------------- | -------------------------------------- |
| conversational Q&A        | `iroha_setup`                                       | field-by-field args                    |
| materials-driven (this is the recommended path) | `iroha_ingest`                       | paths + inline content + format hints  |
| analysis-driven (copy)     | `extract_rules` → review → `iroha_setup`            | approved + rejected copy samples       |
| manual                     | edit the file directly                              | JSON                                   |

### what `iroha_ingest` recognizes

| input shape                | how it's recognized                                    | extracted into                |
| -------------------------- | ------------------------------------------------------ | ----------------------------- |
| `.tokens.json` / `.tokens` | `{ "$value", "$type", ... }` w3c format                | `tokens.*`                    |
| `.json5`                   | JSON5 syntax (unquoted keys, single quotes, comments)  | `tokens.*`                    |
| `{ "props", "aliases" }`   | style-dictionary / polaris flat format with `{!name}` refs | `tokens.*`                 |
| `tailwind.config.{js,ts}`  | `theme.extend.{colors,fontFamily,spacing,...}`         | `tokens.*`                    |
| `.css` / `:root`           | regex on `--token: value;` declarations                | `tokens.*`                    |
| figma variables JSON       | `{ "variables": [{ name, resolvedType, valuesByMode }] }` | `tokens.color` / `tokens.dimension` |
| markdown design-system     | level-1 headings (`# Color Tokens`, `# Voice`, etc.)   | `tokens.*`, `copy.*`, `components.*`, `accessibility.*`, `assets.logos` |

the tool returns applied paths, unresolved entries, and an extraction summary. anything it can't classify shows up in `unresolved` for human review.

## tutorials

the `docs/` directory has guides on thinking, not what to think:

- `schema-walkthrough.md` — every field, when to enable, when to disable
- `extracting-rules-from-existing-copy.md` — how to derive config values from approved samples
- `forbidden-words-and-substitutions.md` — building the list, edge cases
- `cta-styles-in-practice.md` — when verb_only vs verb_noun vs free
- `dogfooding-for-your-team.md` — rollout, evolution, governance

## roadmap

v0.3 (shipped): full brand system. six tools — `lint_copy`, `lint_design`, `generate_feedback`, `iroha_ingest`, `iroha_setup`, `extract_rules`. schema covers tokens, copy, assets, components, patterns, accessibility, i18n.

v0.5 (shipped): real-world ingest. JSON5 support (primer primitives), style-dictionary/polaris flat format, composite `$value` parsing (typography, shadow, border, transition, gradient), `{base.*}` wrapper unwrapping with ref rewrite, `{!name}` alias references, `$extensions` traversal, `time` → transition mapping. validated against primer primitives (98 light colors, 0 unresolved) and polaris-tokens (73 tokens, 0 unresolved).

- v0.4: edit tools — `get_config`, `set_config_field`, `add_forbidden_word`, etc., so you can update your config conversationally through the mcp itself
- v1: llm-powered `analyze_voice` for nuanced tone comparison (hosted or byok)
- v2: rule packs — installable brand bundles per industry / archetype
- v3: hosted team config sync with subscription model
- v4: figma plugin to surface violations in design review

## license

MIT