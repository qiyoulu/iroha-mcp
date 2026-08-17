#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { loadBrandConfig } from "./config/loadConfig.js";
import { lintCopy } from "./tools/lintCopy.js";
import { lintDesign } from "./config/tokens.js";
import { generateFeedback } from "./tools/generateFeedback.js";
import { runSetup } from "./tools/setup.js";
import { runIngest } from "./tools/ingest.js";
import { extractRules } from "./tools/extractRules.js";

const server = new Server(
  {
    name: "iroha",
    version: "0.3.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "lint_copy",
      description:
        "Lint copy text against a brand voice configuration. Returns violations with severity, span, and suggestions.",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "the copy to lint" },
          brand_config_path: {
            type: "string",
            description: "optional path to a brand.config.json. defaults to ./brand.config.json",
          },
        },
        required: ["text"],
      },
    },
    {
      name: "lint_design",
      description:
        "Lint a CSS / JSX / Tailwind snippet against the brand's design tokens. Flags raw hex outside the palette, off-scale dimensions, and color pairs that fail accessibility contrast. Severity defaults to error per rule; override via rule_severity.",
      inputSchema: {
        type: "object",
        properties: {
          snippet: { type: "string", description: "the CSS / JSX / Tailwind snippet to lint" },
          brand_config_path: {
            type: "string",
            description: "optional path to a brand.config.json",
          },
          rule_severity: {
            type: "object",
            description: "override default severity per rule. rules: hard_token_reference, scale_adherence, contrast.",
            additionalProperties: { type: "string", enum: ["error", "warning", "info"] },
          },
        },
        required: ["snippet"],
      },
    },
    {
      name: "generate_feedback",
      description:
        "Generate structured copy feedback against locked brand rules. Returns summary, violations, suggestions, and an optional rewrite.",
      inputSchema: {
        type: "object",
        properties: {
          draft: { type: "string", description: "the draft copy to review" },
          context: {
            type: "string",
            description: "where this copy will live, e.g. 'homepage hero' or 'pricing CTA'",
          },
          brand_config_path: {
            type: "string",
            description: "optional path to a brand.config.json",
          },
        },
        required: ["draft"],
      },
    },
    {
      name: "iroha_ingest",
      description:
        "Build a brand.config.json from existing brand materials (paths or inline content). Recognizes w3c design tokens JSON, tailwind theme configs, CSS :root blocks, figma variables JSON, and markdown design-system docs (color tokens, typography, spacing, voice, banned register, components, accessibility, logo files). Returns what was extracted, what paths it was applied to, and what couldn't be classified.",
      inputSchema: {
        type: "object",
        properties: {
          sources: {
            type: "array",
            items: {
              type: "object",
              properties: {
                path: { type: "string", description: "absolute path to a file (markdown, json, css, js, ts)" },
                content: { type: "string", description: "inline content (alternative to path)" },
                format_hint: {
                  type: "string",
                  enum: ["w3c-tokens", "tailwind", "css", "markdown", "figma-variables", "auto"],
                  description: "explicit format. defaults to auto-detect from filename + content shape.",
                },
              },
            },
            description: "list of brand material sources to ingest",
          },
          brand_name: { type: "string", description: "the brand's display name (required)" },
          target_path: { type: "string", description: "where to write the config (default: ~/.config/iroha-mcp/brand.config.json)" },
        },
        required: ["sources", "brand_name"],
      },
    },
    {
      name: "iroha_setup",
      description:
        "Build a brand.config.json. Pass any subset of fields — defaults fill in the rest. Workflow: ask the user each question listed in the input schema (most fields have sensible defaults you can skip), then call once with the answers. The config is written to target_path (default: ~/.config/iroha-mcp/brand.config.json). If a required field like `name` is missing, returns `needs_input` with the missing fields so you can ask the user and call again.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "the brand's display name (required to save)" },
          proper_nouns: {
            type: "array",
            items: { type: "string" },
            description: "words allowed to appear capitalized mid-sentence (brand names, product names, partner names)",
          },
          sentence_case: { type: "boolean", description: "enable sentence-case enforcement" },
          forbidden_words: {
            type: "array",
            items: { type: "string" },
            description: "words the lint should flag",
          },
          preferred_words: {
            type: "object",
            additionalProperties: { type: "string" },
            description: "substitution map: { forbidden: replacement }",
          },
          cta_style: {
            type: "string",
            enum: ["verb_only", "verb_noun", "free"],
            description: "how strictly to enforce CTA phrasing",
          },
          cta_max_words: { type: "number", description: "max words for verb_noun CTAs" },
          cta_require_capitalize: { type: "boolean", description: "require CTAs to start with a capital letter" },
          forbid_exclamation: { type: "boolean", description: "flag any '!'" },
          forbid_superlatives: { type: "boolean", description: "flag best/fastest/most/etc." },
          feedback_tone: {
            type: "string",
            enum: ["constructive_direct", "encouraging", "terse"],
          },
          feedback_structure: {
            type: "array",
            items: {
              type: "string",
              enum: ["summary", "violations", "suggestions", "rewrite"],
            },
          },
          target_path: { type: "string", description: "where to write the config (default: ~/.config/iroha-mcp/brand.config.json)" },
        },
      },
    },
    {
      name: "extract_rules",
      description:
        "Extract brand rule candidates from approved (and optionally rejected) copy AND css samples. Returns suggested values for sentence_case, proper_nouns, forbidden_words (when rejected copy is provided), exclamation/superlative usage, CTA style, AND from approved_css: color palette, font families, spacing scale, radius scale. Review the suggestions, then pass accepted values to `iroha_setup` to write them.",
      inputSchema: {
        type: "object",
        properties: {
          approved: {
            type: "array",
            items: { type: "string" },
            description: "samples of approved copy — what's on-brand",
          },
          rejected: {
            type: "array",
            items: { type: "string" },
            description: "optional samples of copy that was rejected — used to suggest forbidden_words",
          },
          approved_css: {
            type: "array",
            items: { type: "string" },
            description: "samples of approved CSS — used to suggest palette, font-family, spacing scale, radius scale",
          },
          rejected_css: {
            type: "array",
            items: { type: "string" },
            description: "optional samples of rejected CSS — used to filter palette",
          },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = args as Record<string, unknown>;

  try {
    if (name === "lint_copy") {
      const text = String(a.text);
      const result = loadBrandConfig(a.brand_config_path as string | undefined);
      const violations = lintCopy(text, result.config);
      const content: Array<{ type: string; text: string }> = [
        {
          type: "text",
          text: JSON.stringify({ brand: result.config.name, violations }, null, 2),
        },
      ];
      if (result.isDefault) {
        content.push({
          type: "text",
          text: `ℹ︎ using default config at ${result.configPath}. edit the file directly to customize your brand rules.`,
        });
      }
      return { content };
    }

    if (name === "lint_design") {
      const snippet = String(a.snippet);
      const result = loadBrandConfig(a.brand_config_path as string | undefined);
      const ruleSeverity = (a.rule_severity ?? {}) as Record<string, "error" | "warning" | "info">;
      const violations = lintDesign({ snippet, brand: result.config, rule_severity: ruleSeverity });
      const content: Array<{ type: string; text: string }> = [
        {
          type: "text",
          text: JSON.stringify({ brand: result.config.name, violations }, null, 2),
        },
      ];
      if (result.isDefault) {
        content.push({
          type: "text",
          text: `ℹ︎ using default config at ${result.configPath}. edit the file directly to customize your brand rules.`,
        });
      }
      return { content };
    }

    if (name === "generate_feedback") {
      const draft = String(a.draft);
      const context = (a.context as string | undefined) ?? null;
      const result = loadBrandConfig(a.brand_config_path as string | undefined);
      const feedback = generateFeedback(draft, context, result.config);
      const content: Array<{ type: string; text: string }> = [
        {
          type: "text",
          text: JSON.stringify(feedback, null, 2),
        },
      ];
      if (result.isDefault) {
        content.push({
          type: "text",
          text: `ℹ︎ using default config at ${result.configPath}. edit the file directly to customize your brand rules.`,
        });
      }
      return { content };
    }

    if (name === "iroha_ingest") {
      const sourcesRaw = (a.sources as Array<Record<string, unknown>>) ?? [];
      const sources = sourcesRaw.map((s) => ({
        path: s.path as string | undefined,
        content: s.content as string | undefined,
        format_hint: s.format_hint as
          | "w3c-tokens"
          | "tailwind"
          | "css"
          | "markdown"
          | "figma-variables"
          | "auto"
          | undefined,
      }));
      const result = runIngest({
        sources,
        brand_name: a.brand_name as string | undefined,
        target_path: a.target_path as string | undefined,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    if (name === "iroha_setup") {
      const result = runSetup(a);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    if (name === "extract_rules") {
      const approved = (a.approved as string[]) ?? [];
      const rejected = (a.rejected as string[] | undefined) ?? [];
      const approvedCss = (a.approved_css as string[] | undefined) ?? [];
      const rejectedCss = (a.rejected_css as string[] | undefined) ?? [];
      const result = extractRules({ approved, rejected, approved_css: approvedCss, rejected_css: rejectedCss });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    return {
      content: [{ type: "text", text: `unknown tool: ${name}` }],
      isError: true,
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: `error: ${(err as Error).message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);