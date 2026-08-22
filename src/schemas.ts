import { z } from "zod";

/**
 * Zod schemas for the request.arguments payloads of every MCP tool.
 *
 * These exist so the dispatcher in src/index.ts can validate incoming tool
 * calls before passing them to the handlers. Previously the dispatcher did
 * `args as Record<string, unknown>` and `String(a.text)` casts, which let
 * malformed inputs (numbers where strings expected, null where paths
 * expected, unknown extra fields) propagate to the handlers and either
 * crash or silently coerce. See audit finding #12.
 *
 * Every schema:
 *   - allows undefined for optional fields (matches MCP behavior)
 *   - rejects null where strings/paths are expected
 *   - exports both the schema (for parsing) and the inferred TS type
 */

const formatHint = z.enum(["w3c-tokens", "tailwind", "css", "markdown", "figma-variables", "auto"]);
const severity = z.enum(["error", "warning", "info"]);
const feedbackTone = z.enum(["constructive_direct", "encouraging", "terse"]);
const feedbackSection = z.enum(["summary", "violations", "suggestions", "rewrite"]);
const ctaStyle = z.enum(["verb_only", "verb_noun", "free"]);

const ingestSource = z.object({
  path: z.string().min(1).optional(),
  content: z.string().optional(),
  format_hint: formatHint.optional(),
});

export const LintCopyArgs = z.object({
  text: z.string(),
  brand_config_path: z.string().min(1).optional(),
});
export type LintCopyArgs = z.infer<typeof LintCopyArgs>;

export const LintDesignArgs = z.object({
  snippet: z.string(),
  brand_config_path: z.string().min(1).optional(),
  rule_severity: z.record(z.string(), severity).optional(),
});
export type LintDesignArgs = z.infer<typeof LintDesignArgs>;

export const GenerateFeedbackArgs = z.object({
  draft: z.string(),
  context: z.string().optional(),
  brand_config_path: z.string().min(1).optional(),
});
export type GenerateFeedbackArgs = z.infer<typeof GenerateFeedbackArgs>;

export const IngestArgs = z.object({
  sources: z.array(ingestSource).min(1, "iroha_ingest requires at least one source"),
  brand_name: z.string().min(1),
  target_path: z.string().min(1).optional(),
});
export type IngestArgs = z.infer<typeof IngestArgs>;

export const SetupArgs = z.object({
  name: z.string().optional(),
  proper_nouns: z.array(z.string()).optional(),
  sentence_case: z.boolean().optional(),
  forbidden_words: z.array(z.string()).optional(),
  preferred_words: z.record(z.string(), z.string()).optional(),
  cta_style: ctaStyle.optional(),
  cta_max_words: z.number().int().positive().optional(),
  cta_require_capitalize: z.boolean().optional(),
  forbid_exclamation: z.boolean().optional(),
  forbid_superlatives: z.boolean().optional(),
  feedback_tone: feedbackTone.optional(),
  feedback_structure: z.array(feedbackSection).optional(),
  target_path: z.string().min(1).optional(),
});
export type SetupArgs = z.infer<typeof SetupArgs>;

export const ExtractRulesArgs = z.object({
  approved: z.array(z.string()),
  rejected: z.array(z.string()).optional(),
  approved_css: z.array(z.string()).optional(),
  rejected_css: z.array(z.string()).optional(),
});
export type ExtractRulesArgs = z.infer<typeof ExtractRulesArgs>;

/**
 * Discriminated union: every tool maps to exactly one args schema. The
 * dispatcher uses this for exhaustive matching — adding a new tool without
 * adding it here is a compile error.
 */
export const ToolArgs = z.discriminatedUnion("tool", [
  z.object({ tool: z.literal("lint_copy"), args: LintCopyArgs }),
  z.object({ tool: z.literal("lint_design"), args: LintDesignArgs }),
  z.object({ tool: z.literal("generate_feedback"), args: GenerateFeedbackArgs }),
  z.object({ tool: z.literal("iroha_ingest"), args: IngestArgs }),
  z.object({ tool: z.literal("iroha_setup"), args: SetupArgs }),
  z.object({ tool: z.literal("extract_rules"), args: ExtractRulesArgs }),
]);
export type ToolArgs = z.infer<typeof ToolArgs>;

/**
 * Human-readable formatter for zod validation errors. Keeps MCP clients from
 * receiving raw stack-trace-adjacent text (audit finding #15).
 */
export function formatZodError(err: z.ZodError): string {
  const issues = err.issues.slice(0, 5).map((i) => {
    const path = i.path.length > 0 ? i.path.join(".") : "(root)";
    return `${path}: ${i.message}`;
  });
  const more = err.issues.length > 5 ? ` (+${err.issues.length - 5} more)` : "";
  return `invalid input — ${issues.join("; ")}${more}`;
}
