import type { BrandConfig } from "../../config/schema.js";
import type { RecognizedSource } from "../sources.js";
import type { ParsedContribution } from "../parse.js";
import { ensureTokens, inferCategory, stripCategoryPrefix } from "./shared.js";

/**
 * CSS parser. Reads `--token: value` declarations from any selector block.
 *
 * The first `:root` block (or the first block if no `:root`) populates the
 * base tokens. Blocks with a theme modifier class (`.dark`, `.dark-theme`,
 * etc.) or a `[data-theme]` attribute become mode overrides — they don't
 * overwrite the base, they go into `tokens.modes[].tokenOverrides`.
 *
 * Selector → mode mapping:
 *   - `:root` → base (first block only)
 *   - `.dark`, `.dark-theme`, `[data-color-mode="dark"]` → mode "dark"
 *   - `[data-theme="light"]` → mode "light"
 *   - `.hc`, `.high-contrast`, `[data-color-mode="hc"]` → mode "high-contrast"
 *   - `.dimmed`, `[data-theme="dimmed"]` → mode "dimmed"
 */
export function parseCss(source: RecognizedSource, config: BrandConfig): ParsedContribution {
  const applied: string[] = [];
  const unresolved: string[] = [];
  const summary: Record<string, unknown> = {};

  const tokens = ensureTokens(config);

  const blockRe = /([.#:\[][^{}@]*)\{([\s\S]*?)\}/g;
  let blockMatch: RegExpExecArray | null;
  let firstBlock = true;

  while ((blockMatch = blockRe.exec(source.raw)) !== null) {
    const selector = blockMatch[1].trim();
    const body = blockMatch[2];
    const isRoot = /^:root(\s|,|$)/.test(selector);
    const modeMatch = selector.match(/\.(dark|dark-theme|light-theme|high-contrast|hc|dimmed)\b/);
    const attrMatch = selector.match(/\[data-(?:color-mode|theme|color-theme)=["']?([^"'\]]+)["']?\]/);

    let modeName: string | null = null;
    let modeSelector: string | null = null;
    if (isRoot && firstBlock) {
      firstBlock = false;
    } else if (modeMatch) {
      modeName = normalizeModeName(modeMatch[1]);
      modeSelector = selector;
    } else if (attrMatch) {
      const attrValue = attrMatch[1];
      if (/dark/.test(attrValue)) modeName = "dark";
      else if (/light/.test(attrValue)) modeName = "light";
      else if (/hc|contrast/.test(attrValue)) modeName = "high-contrast";
      else if (/dimmed/.test(attrValue)) modeName = "dimmed";
      else modeName = attrValue;
      modeSelector = selector;
    }

    const declRe = /--([\w-]+)\s*:\s*([^;]+);/g;
    let m: RegExpExecArray | null;
    while ((m = declRe.exec(body)) !== null) {
      const name = m[1];
      const value = m[2].trim();
      const category = inferCategory(name);
      if (!category) {
        unresolved.push(`${name} (no category)`);
        continue;
      }
      const stripped = stripCategoryPrefix(name, category);
      if (modeName) {
        if (!tokens.modes) tokens.modes = [];
        let mode = tokens.modes.find((mo) => mo.name === modeName);
        if (!mode) {
          mode = { name: modeName, selector: modeSelector ?? undefined };
          tokens.modes.push(mode);
        }
        if (!mode.tokenOverrides) mode.tokenOverrides = {};
        const bucket = (mode.tokenOverrides as any)[category] ?? {};
        bucket[stripped] = value;
        (mode.tokenOverrides as any)[category] = bucket;
        applied.push(`modes.${modeName}.${category}.${stripped}`);
      } else {
        const target = (tokens as any)[category] ?? {};
        target[stripped] = value;
        (tokens as any)[category] = target;
        applied.push(`${category}.${stripped}`);
      }
    }
  }

  summary.token_count = applied.length;
  config.meta = {
    ...config.meta,
    source: "css",
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

function normalizeModeName(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower === "hc") return "high-contrast";
  if (lower.endsWith("-theme")) return lower.replace(/-theme$/, "");
  return lower;
}
