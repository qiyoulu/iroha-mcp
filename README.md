# Iroha

> Color into language. Language into order.

Iroha is an MCP server for brand voice tooling. Lint copy and generate feedback against locked brand rules from inside Claude Desktop, Cursor, or any MCP-aware client. The name is the first three syllables of the traditional kana ordering — **iro** (色, color) and **ha** (羽, feather, as in the quill). It is also the opening of the *iroha uta*, the 47-mora classical poem that contains every kana exactly once.

Iroha ships infrastructure, not opinions. The rule engine is generic; your brand rules are yours to define. Start from a blank scaffold, work through the tutorials, build the config that fits your voice.

## shipped tools

- `lint_copy` — returns violations with rule, severity, span, and suggestion
- `lint_design` — flags raw hex outside the palette, off-scale dimensions, and color pairs that fail accessibility contrast. Severity configurable per rule.
- `generate_feedback` — returns summary + violations + suggestions + optional rewrite
- `iroha_ingest` — build a `brand.config.json` from existing brand materials (paths or inline content). Recognizes W3C design tokens JSON, JSON5 (Primer primitives), Tailwind theme configs, CSS `:root` blocks, Figma variables JSON, Style Dictionary / Polaris flat token JSON, and markdown design-system docs. Handles composite `$value` objects (typography, shadow, border, gradient, dimension), `{base.*}` and `{!name}` reference resolution, `$extensions` traversal, and mode-aware token overrides.
- `iroha_setup` — build a `brand.config.json` from a conversational exchange; merges with any existing config on the target path
- `extract_rules` — analyze a batch of approved (and optionally rejected) copy and CSS, returning candidate values for `sentence_case`, `proper_nouns`, `forbidden_words`, exclamation/superlative usage, CTA style, and from approved CSS: color palette, font families, spacing scale, radius scale

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

Drop a `brand.config.json` next to your working directory, or pass `brand_config_path` to each tool call. The schema is enforced via zod in `src/config/schema.ts`.

If no config is found, Iroha auto-writes a sensible default to `~/.config/iroha-mcp/brand.config.json` and uses it. The response will note when the default is in use — edit the file directly to customize your brand rules.

For a guided setup, use the `iroha_setup` tool. For an analysis-driven setup, call `extract_rules` against your approved copy samples first, then pass the values you accept into `iroha_setup`. For a materials-driven setup, point `iroha_ingest` at your brand's existing tokens JSON, Tailwind config, CSS `:root` block, or markdown design system.

### setup paths

| flow                                            | tool                                     | input                                 |
| ----------------------------------------------- | ---------------------------------------- | ------------------------------------- |
| conversational Q&A                              | `iroha_setup`                            | field-by-field args                   |
| materials-driven (recommended)                  | `iroha_ingest`                           | paths + inline content + format hints |
| analysis-driven (copy)                          | `extract_rules` → review → `iroha_setup` | approved + rejected copy samples      |
| manual                                          | edit the file directly                   | JSON                                  |

### what `iroha_ingest` recognizes

| input shape                  | how it's recognized                                        | extracted into                                                          |
| ---------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| `.tokens.json` / `.tokens`   | `{ "$value", "$type", ... }` W3C format                    | `tokens.*`                                                              |
| `.json5`                     | JSON5 syntax (unquoted keys, single quotes, comments)      | `tokens.*`                                                              |
| `{ "props", "aliases" }`     | Style Dictionary / Polaris flat format with `{!name}` refs | `tokens.*`                                                              |
| `tailwind.config.{js,ts}`    | `theme.extend.{colors,fontFamily,spacing,...}`             | `tokens.*`                                                              |
| `.css` / `:root`             | regex on `--token: value;` declarations                    | `tokens.*`                                                              |
| Figma variables JSON         | `{ "variables": [{ name, resolvedType, valuesByMode }] }`  | `tokens.color` / `tokens.dimension`                                     |
| markdown design-system       | level-1 headings (`# Color tokens`, `# Voice`, etc.)       | `tokens.*`, `copy.*`, `components.*`, `accessibility.*`, `assets.logos` |

The tool returns applied paths, unresolved entries, and an extraction summary. Anything it can't classify shows up in `unresolved` for human review.

One caveat: unscoped scales (e.g. Primer's `neutral.0` and `coral.0`) flatten to the same bare key (`color.0`), so the last one wins. For full namespacing, prefer sources with group-qualified names.

## tutorials

The `docs/` directory has guides on thinking, not what to think:

- `schema-walkthrough.md` — every field, when to enable, when to disable
- `extracting-rules-from-existing-copy.md` — how to derive config values from approved samples
- `forbidden-words-and-substitutions.md` — building the list, edge cases
- `cta-styles-in-practice.md` — when `verb_only` vs `verb_noun` vs `free`
- `dogfooding-for-your-team.md` — rollout, evolution, governance

## roadmap

**v0.2 (shipped)** — initial release: auto-init default config, `proper_nouns` allowlist, `iroha_setup` + `extract_rules` tools, 45 tests.

**v0.3 (shipped)** — full brand system. Six tools: `lint_copy`, `lint_design`, `generate_feedback`, `iroha_ingest`, `iroha_setup`, `extract_rules`. Schema covers tokens, copy, assets, components, patterns, accessibility, i18n.

**v0.4 (shipped)** — W3C reference resolution (`{group.token}` + `#/...` JSON Pointer, cycle detection), mode/theme extraction (class + attribute selectors), `mode_coverage` rule in `lint_design`, CSS-side rule extraction in `extract_rules`.

**v0.5 (shipped)** — real-world ingest. JSON5 support (Primer primitives), Style Dictionary / Polaris flat format, composite `$value` parsing (typography, shadow, border, transition, gradient), `{base.*}` wrapper unwrapping with ref rewrite, `{!name}` alias references, `$extensions` traversal, `time` → transition mapping. Validated against Primer primitives (98 light colors, 0 unresolved) and Polaris tokens (73 tokens, 0 unresolved).

- **v0.6 (planned)** — edit tools: `get_config`, `set_config_field`, `add_forbidden_word`, etc., so you can update your config conversationally through the MCP itself
- **v1 (planned)** — LLM-powered `analyze_voice` for nuanced tone comparison (hosted or BYOK)
- **v2 (planned)** — rule packs: installable brand bundles per industry / archetype
- **v3 (planned)** — hosted team config sync with subscription model
- **v4 (planned)** — Figma plugin to surface violations in design review

## license

MIT
