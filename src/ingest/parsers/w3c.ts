import JSON5 from "json5";
import type { BrandConfig } from "../../config/schema.js";
import type { RecognizedSource } from "../sources.js";
import type { ParsedContribution } from "../parse.js";
import {
  ensureTokens,
  stripCategoryPrefix,
  inferCategory,
  inferCategoryFromPath,
  normalizeColor,
  normalizeTypography,
  normalizeDimension,
  normalizeShadow,
  normalizeBorder,
  normalizeTransition,
  normalizeGradient,
  resolveReference,
  flattenW3cTokens,
} from "./shared.js";

/**
 * W3C design tokens parser.
 *
 * Handles four shapes:
 *   1. Standard w3c `{ "$value", "$type" }` (with optional `$extensions`)
 *   2. JSON5 (unquoted keys, single quotes, comments) — Primer primitives style
 *   3. Style Dictionary / Polaris flat `{ props, aliases }` with `{!name}` refs
 *   4. `{ base: {...} }` wrapper (auto-rewrites `{base.x}` → `{x}`)
 *
 * Composite `$value` objects (typography, shadow, border, gradient, dimension)
 * are normalized via shared normalizers. References via `{group.token}` or
 * `#/...` JSON Pointer are resolved with cycle detection.
 */
export function parseW3cTokens(source: RecognizedSource, config: BrandConfig): ParsedContribution {
  const applied: string[] = [];
  const unresolved: string[] = [];
  const summary: Record<string, unknown> = {};

  let raw: unknown;
  try {
    raw = JSON5.parse(source.raw);
  } catch (err) {
    return {
      source_id: source.identifier,
      format: source.format,
      applied_paths: [],
      unresolved: [`not valid JSON: ${(err as Error).message}`],
      extracted_summary: {},
    };
  }

  // Unwrap `{ base: {...} }` (Style Dictionary layered formats) and rewrite
  // `{base.x}` references to `{x}` so the rest of the pipeline treats them as
  // top-level tokens. Audit #3: do this immutably via a fresh deep-clone so
  // we never mutate a tree that's been handed in.
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    if (obj.base && typeof obj.base === "object" && !Array.isArray(obj.base)) {
      raw = deepClone(obj.base);
      const walk = (node: unknown): void => {
        if (Array.isArray(node)) {
          node.forEach(walk);
        } else if (node && typeof node === "object") {
          for (const k of Object.keys(node as Record<string, unknown>)) {
            const v = (node as Record<string, unknown>)[k];
            if (typeof v === "string") {
              (node as Record<string, unknown>)[k] = v.replace(/\{base\./g, "{");
            } else {
              walk(v);
            }
          }
        }
      };
      walk(raw);
    }
  }

  // Polaris / Style Dictionary flat format with `props` and `aliases`.
  if (raw && typeof raw === "object" && (raw as Record<string, unknown>).props && (raw as Record<string, unknown>).aliases) {
    const flat: Array<Record<string, unknown>> = [];
    const aliases = (raw as Record<string, unknown>).aliases as Record<string, { value: string | number }>;
    const props = (raw as Record<string, unknown>).props as Record<string, { type?: string; category?: string; name?: string; value?: unknown; originalValue?: string }>;
    for (const [name, prop] of Object.entries(props)) {
      const token: Record<string, unknown> = { $value: prop.value, $type: prop.type };
      if (prop.originalValue && typeof prop.originalValue === "string" && prop.originalValue.includes("{")) {
        token.$value = prop.originalValue;
      }
      if (aliases && aliases[name]) {
        token.$value = aliases[name].value;
      }
      flat.push({ ...token, __name: name, __propName: prop.category ?? prop.name ?? name });
    }
    const tokens = ensureTokens(config);
    for (const token of flat) {
      const name = token.__name as string;
      const propName = token.__propName as string;
      const category = inferCategory(propName, token.$type as string);
      if (!category) {
        unresolved.push(`${name} (no category)`);
        continue;
      }
      const key = stripCategoryPrefix(name, category);
      if (category === "color") {
        if (!tokens.color) tokens.color = {};
        tokens.color[key] = normalizeColor(token.$value);
      } else if (category === "typography") {
        if (!tokens.typography) tokens.typography = {};
        tokens.typography[key] = normalizeTypography(token.$value);
      } else if (category === "dimension") {
        if (!tokens.dimension) tokens.dimension = {};
        tokens.dimension[key] = normalizeDimension(token.$value);
      } else if (category === "shadow") {
        if (!tokens.shadow) tokens.shadow = {};
        tokens.shadow[key] = normalizeShadow(token.$value);
      } else if (category === "border") {
        if (!tokens.border) tokens.border = {};
        tokens.border[key] = normalizeBorder(token.$value);
      } else if (category === "transition") {
        if (!tokens.transition) tokens.transition = {};
        tokens.transition[key] = normalizeTransition(token.$value);
      } else if (category === "gradient") {
        if (!tokens.gradient) tokens.gradient = {};
        tokens.gradient[key] = normalizeGradient(token.$value);
      } else if (category === "breakpoint") {
        if (!tokens.breakpoint) tokens.breakpoint = {};
        const v = token.$value;
        const n = typeof v === "number" ? v : Number(v);
        if (!Number.isNaN(n)) tokens.breakpoint[key] = n;
      }
      applied.push(`${category}.${key}`);
    }
    summary.token_count = applied.length;
    config.meta = {
      ...config.meta,
      source: "polaris",
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

  // Standard w3c format: walk the tree, resolve references, bucket into categories.
  const flat = flattenW3cTokens(raw);

  const lookup = new Map<string, unknown>();
  for (const { path, value, raw: rawToken } of flat) {
    const key = path.join(".");
    lookup.set(key, value);
    if (rawToken) lookup.set(`${key}.$value`, value);
    if (rawToken?.$extensions) lookup.set(`${key}.$extensions`, rawToken.$extensions);
  }

  for (let i = 0; i < flat.length; i++) {
    const item = flat[i];
    if (typeof item.value === "string") {
      const ref = item.value.trim();
      if (isRef(ref)) {
        const { resolved, ok } = resolveReference(ref, lookup, new Set([item.path.join(".")]), 0);
        if (ok) {
          flat[i] = { ...item, value: resolved };
          lookup.set(item.path.join("."), resolved);
        } else {
          unresolved.push(`${item.path.join(".")} -> ${ref}`);
        }
      }
    }
  }

  // Resolve references inside `$extensions` mode overrides (Primer pattern).
  for (let i = 0; i < flat.length; i++) {
    const item = flat[i];
    if (item.raw?.$extensions) {
      const ext = item.raw.$extensions as Record<string, unknown>;
      for (const [namespace, value] of Object.entries(ext)) {
        if (namespace === "org.primer.figma" || namespace.startsWith("org.primer.")) continue;
        if (value && typeof value === "object") {
          for (const [modeKey, modeVal] of Object.entries(value)) {
            if (typeof modeVal === "string" && isRef(modeVal.trim())) {
              const { resolved, ok } = resolveReference(
                modeVal.trim(),
                lookup,
                new Set([item.path.join(".")]),
                0
              );
              if (ok) {
                const extObj = item.raw!.$extensions as Record<string, Record<string, unknown>>;
                extObj[namespace] = { ...extObj[namespace], [modeKey]: resolved };
              }
            }
          }
        }
      }
    }
  }

  const tokens = ensureTokens(config);

  const tokenBuckets: Record<string, Record<string, unknown>> = {
    color: {},
    typography: {},
    dimension: {},
    shadow: {},
    border: {},
    transition: {},
    gradient: {},
    breakpoint: {},
  };

  for (const { path, value, type } of flat) {
    if (path.length === 0) continue;
    const category = inferCategoryFromPath(path, type);
    if (!category) {
      unresolved.push(`${path.join(".")} (no category)`);
      continue;
    }
    const key = stripCategoryPrefix(path[path.length - 1], category);
    if (category === "color") {
      tokenBuckets.color[key] = normalizeColor(value);
    } else if (category === "typography") {
      tokenBuckets.typography[key] = normalizeTypography(value);
    } else if (category === "shadow") {
      tokenBuckets.shadow[key] = normalizeShadow(value);
    } else if (category === "border") {
      tokenBuckets.border[key] = normalizeBorder(value);
    } else if (category === "transition") {
      tokenBuckets.transition[key] = normalizeTransition(value);
    } else if (category === "gradient") {
      tokenBuckets.gradient[key] = normalizeGradient(value);
    } else if (category === "breakpoint") {
      tokenBuckets.breakpoint[key] = typeof value === "number" ? value : Number(value);
    } else if (category === "dimension") {
      tokenBuckets.dimension[key] = normalizeDimension(value);
    }
    applied.push(`${category}.${key}`);
  }

  for (const [bucket, entries] of Object.entries(tokenBuckets)) {
    if (Object.keys(entries).length === 0) continue;
    if (!tokens[bucket as keyof typeof tokens]) {
      tokens[bucket as keyof typeof tokens] = {} as never;
    }
    Object.assign(tokens[bucket as keyof typeof tokens] as object, entries);
  }

  summary.token_count = applied.length;
  config.meta = {
    ...config.meta,
    source: "w3c-tokens",
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

function isRef(s: string): boolean {
  return s.startsWith("{") || s.startsWith("#/");
}

function deepClone<T>(value: T): T {
  // JSON5.parse output is plain JSON-compatible. structuredClone is safer than
  // JSON.parse round-trip (handles Date, Map, etc.) but for our purposes either
  // works. The key requirement is "do not mutate the caller's tree."
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}
