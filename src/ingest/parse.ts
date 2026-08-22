/**
 * Format-specific parsers dispatched by `parseAndApply`. Each format lives in
 * its own file under `./parsers/` so the per-format logic stays
 * independently testable and the file lengths stay sane (the previous
 * monolithic parse.ts was 1000+ lines).
 *
 * Audit findings addressed here:
 *   - #17: split per-format
 *   - #4:  `parseAndApply` mutates `config` (caller-owned). Today this is safe
 *          because callers always pass a fresh `structuredClone(DEFAULT_CONFIG)`.
 *          Documented as an explicit precondition. A future refactor could
 *          return a new `BrandConfig` instead of mutating; not done here because
 *          it would double the memory profile per ingestion call.
 *   - #3:  The `{base.*}` rewrite is now an immutable deep-clone in
 *          `./parsers/w3c.ts`. See that file for the audit trail.
 */
import type { BrandConfig } from "../config/schema.js";
import type { RecognizedSource } from "./sources.js";
import { parseW3cTokens } from "./parsers/w3c.js";
import { parseTailwind } from "./parsers/tailwind.js";
import { parseCss } from "./parsers/css.js";
import { parseMarkdown } from "./parsers/markdown.js";
import { parseFigmaVariables } from "./parsers/figma.js";

export type ParsedContribution = {
  source_id: string;
  format: RecognizedSource["format"];
  applied_paths: string[];
  unresolved: string[];
  extracted_summary: Record<string, unknown>;
};

/**
 * Run the appropriate parser for a recognized source and apply its tokens to
 * the supplied config.
 *
 * Preconditions:
 *   - `config` must be a fresh deep-cloned object, owned exclusively by this
 *     call. The parsers mutate `config.tokens`, `config.meta`, etc. — sharing
 *     a config across concurrent ingest calls is unsafe.
 */
export function parseAndApply(
  source: RecognizedSource,
  config: BrandConfig
): ParsedContribution {
  switch (source.format) {
    case "w3c-tokens":
      return parseW3cTokens(source, config);
    case "tailwind":
      return parseTailwind(source, config);
    case "css":
      return parseCss(source, config);
    case "markdown":
      return parseMarkdown(source, config);
    case "figma-variables":
      return parseFigmaVariables(source, config);
    default:
      return {
        source_id: source.identifier,
        format: "unknown",
        applied_paths: [],
        unresolved: ["format unrecognized"],
        extracted_summary: {},
      };
  }
}
