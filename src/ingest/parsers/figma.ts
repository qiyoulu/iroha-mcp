import type { BrandConfig } from "../../config/schema.js";
import type { RecognizedSource } from "../sources.js";
import type { ParsedContribution } from "../parse.js";
import { ensureTokens } from "./shared.js";

/**
 * Figma variables JSON parser.
 *
 * Reads the export shape: `{ "variables": [{ name, resolvedType, valuesByMode }] }`.
 * Only `color` and `float` types are currently mapped — `float` is treated as
 * a dimension with a "px" suffix (Figma uses unitless numbers; we assume px).
 * Other types fall into `unresolved` for human review.
 */
export function parseFigmaVariables(source: RecognizedSource, config: BrandConfig): ParsedContribution {
  const applied: string[] = [];
  const unresolved: string[] = [];
  const summary: Record<string, unknown> = {};

  let parsed: any;
  try {
    parsed = JSON.parse(source.raw);
  } catch (err) {
    return {
      source_id: source.identifier,
      format: source.format,
      applied_paths: [],
      unresolved: [`not valid JSON: ${(err as Error).message}`],
      extracted_summary: {},
    };
  }

  const tokens = ensureTokens(config);

  const variables: any[] = parsed?.variables ?? [];
  for (const v of variables) {
    const name = v.name ?? v.id;
    const type = (v.resolvedType ?? v.type ?? "").toLowerCase();
    const value = v.valuesByMode ? Object.values(v.valuesByMode)[0] : v.value;
    if (type === "color") {
      if (!tokens.color) tokens.color = {};
      tokens.color[name] = String(value);
      applied.push(`color.${name}`);
    } else if (type === "float") {
      if (!tokens.dimension) tokens.dimension = {};
      tokens.dimension[name] = `${value}px`;
      applied.push(`dimension.${name}`);
    } else {
      unresolved.push(`${name} (type=${type})`);
    }
  }

  summary.variable_count = variables.length;
  config.meta = {
    ...config.meta,
    source: "figma",
    schemaVersion: config.meta?.schemaVersion ?? "0.3.0",
    ingestionDate: new Date().toISOString().slice(0, 10),
  };

  return {
    source_id: source.identifier,
    format: source.format,
    applied_paths: applied,
    unresolved,
    extracted_summary: summary,
  };
}
