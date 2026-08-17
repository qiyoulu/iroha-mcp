#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { loadBrandConfig } from "./config/loadConfig.js";
import { lintCopy } from "./tools/lintCopy.js";
import { generateFeedback } from "./tools/generateFeedback.js";
import { runSetup } from "./tools/setup.js";
import { extractRules } from "./tools/extractRules.js";

const server = new Server(
  {
    name: "iroha",
    version: "0.2.0",
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
        "Extract brand rule candidates from approved copy samples. Returns suggested values for sentence_case, proper_nouns, forbidden_words (when rejected samples are also provided), exclamation/superlative usage, and observed CTA style. Review the suggestions, then pass accepted values to `iroha_setup` to write them.",
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
        },
        required: ["approved"],
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
      const result = extractRules({ approved, rejected });
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