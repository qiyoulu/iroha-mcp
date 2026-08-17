# iroha / いろは

> color into language. language into order.

iroha is an MCP server for brand voice tooling. Lint copy and generate feedback against locked brand rules from inside Claude Desktop, Cursor, or any MCP-aware client. The name carries both halves: **iro** (color, the design side) and **ha** (the third syllable in the iroha poem that orders all kana, the writing side).

iroha ships infrastructure, not opinions. the rule engine is generic; your brand rules are yours to define. start from a blank scaffold, work through the tutorials, build the config that fits your voice.

## v0 wedge

- `lint_copy` — returns violations with rule, severity, span, and suggestion
- `generate_feedback` — returns summary + violations + suggestions + optional rewrite
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

for a guided setup, use the `iroha_setup` tool. for an analysis-driven setup, call `extract_rules` against your approved copy samples first, then pass the values you accept into `iroha_setup`.

- copy `brand.config.example.json` to get a blank scaffold with all fields
- copy `templates/editorial.json`, `templates/saas.json`, etc. for industry scaffolds
- read `docs/schema-walkthrough.md` for what each field does
- read `docs/extracting-rules-from-existing-copy.md` for the analysis-driven workflow

## tutorials

the `docs/` directory has guides on thinking, not what to think:

- `schema-walkthrough.md` — every field, when to enable, when to disable
- `extracting-rules-from-existing-copy.md` — how to derive config values from approved samples
- `forbidden-words-and-substitutions.md` — building the list, edge cases
- `cta-styles-in-practice.md` — when verb_only vs verb_noun vs free
- `dogfooding-for-your-team.md` — rollout, evolution, governance

## roadmap

v0 (shipped): local-only, stateless, reads config from disk. four tools — `lint_copy`, `generate_feedback`, `iroha_setup`, `extract_rules`.

- v1: edit tools — `get_config`, `set_config_field`, `add_forbidden_word`, etc., so you can update your config conversationally through the mcp itself
- v2: llm-powered `analyze_voice` for nuanced tone comparison (hosted or byok)
- v3: rule packs — installable brand bundles per industry / archetype
- v4: hosted team config sync with subscription model
- v5: Figma plugin to surface violations in design review

## license

MIT