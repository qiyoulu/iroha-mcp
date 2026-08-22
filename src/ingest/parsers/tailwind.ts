import type { BrandConfig } from "../../config/schema.js";
import type { RecognizedSource } from "../sources.js";
import type { ParsedContribution } from "../parse.js";
import { ensureTokens } from "./shared.js";

/**
 * Tailwind theme config parser.
 *
 * `tailwind.config.js` exports `theme.extend.{colors,spacing,fontFamily,...}`
 * or sometimes bare `theme.{...}`. We read those and bucket into the matching
 * token categories.
 *
 * Caveats:
 *   - `fontFamily` values can be arrays; we take the first entry.
 *   - `screens` are pixel strings ("640px") — we strip "px" and store the number.
 *   - All other values are stored as their raw string form.
 */
export function parseTailwind(source: RecognizedSource, config: BrandConfig): ParsedContribution {
  const applied: string[] = [];
  const unresolved: string[] = [];
  const summary: Record<string, unknown> = {};

  const tokens = ensureTokens(config);

  let parsed: any;
  try {
    parsed = evalTailwindConfig(source.raw);
  } catch (err) {
    return {
      source_id: source.identifier,
      format: source.format,
      applied_paths: [],
      unresolved: [`could not parse tailwind config: ${(err as Error).message}`],
      extracted_summary: {},
    };
  }

  const theme = parsed?.theme?.extend ?? parsed?.theme ?? {};
  const map: Record<string, Record<string, string>> = {
    color: theme.colors ?? {},
    dimension: theme.spacing ?? {},
    typography: theme.fontFamily ?? {},
    border: theme.borderWidth ?? {},
    shadow: theme.boxShadow ?? {},
    transition: theme.transitionProperty ?? {},
    breakpoint: theme.screens ?? {},
  };

  for (const [bucket, entries] of Object.entries(map)) {
    if (!entries || typeof entries !== "object") continue;
    const target = (tokens as any)[bucket] ?? ({} as Record<string, unknown>);
    for (const [k, v] of Object.entries(entries)) {
      const value = typeof v === "string" ? v : JSON.stringify(v);
      if (bucket === "typography") {
        const arr = Array.isArray(v) ? v : [String(v)];
        target[k] = arr[0];
      } else if (bucket === "breakpoint") {
        const px = typeof v === "string" ? v.match(/^(\d+)/) : null;
        target[k] = px ? Number(px[1]) : Number(v);
      } else {
        target[k] = value;
      }
      applied.push(`${bucket}.${k}`);
    }
    if (Object.keys(target).length > 0) {
      (tokens as any)[bucket] = target;
    }
  }

  summary.token_count = applied.length;
  config.meta = {
    ...config.meta,
    source: "tailwind",
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

/**
 * Evaluate a Tailwind config string. The config is a JS object literal, so
 * we wrap it in a Function constructor call — no module resolution, no fs
 * access. This is safe because iroha already validated the path via the
 * allowlist (sources.ts).
 */
function evalTailwindConfig(raw: string): any {
  const stripped = raw
    .replace(/^module\.exports\s*=\s*/m, "")
    .replace(/^export default\s+/m, "")
    .replace(/;\s*$/, "")
    .trim();
  return new Function(`return (${stripped})`)();
}
