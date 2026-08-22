/**
 * Helpers shared across all format-specific parsers in ./parsers/.
 *
 * Pulled out of the original monolithic parse.ts so each format has its own
 * file (~50-300 lines) instead of one 1000+ line file. The category inference
 * logic, normalizers, and reference resolution are format-agnostic so they
 * live here.
 */

import type { BrandConfig } from "../../config/schema.js";

/**
 * Ensure config.tokens is at least an empty object. Mutates and returns.
 *
 * All parsers call this at the top so they don't have to repeat the
 * `if (!config.tokens) ...` check. Per audit #4, the broader parseAndApply
 * mutation contract is being tightened — but within a single ingestion call
 * the config is a fresh structuredClone, so the mutation is scoped.
 */
export function ensureTokens(config: BrandConfig) {
  if (!config.tokens) config.tokens = {};
  return config.tokens;
}

/** Strip a category prefix from a token name (e.g. "color-primary" → "primary"). */
export function stripCategoryPrefix(name: string, category: string): string {
  const n = name.toLowerCase();
  const c = category.toLowerCase();
  if (n.startsWith(`${c}-`)) return name.slice(c.length + 1);
  if (n.startsWith(c)) return name.slice(c.length);
  if (category === "typography") {
    if (n.startsWith("font-")) return name.slice(5);
    if (n.startsWith("text-")) return name.slice(5);
  }
  if (category === "dimension") {
    if (n.startsWith("space-")) return name;
  }
  return name;
}

/** Infer a token category from a $type field (w3c design tokens spec). */
export function inferCategory(name: string, w3cType?: string): string | null {
  if (w3cType === "color") return "color";
  if (w3cType === "typography") return "typography";
  if (w3cType === "shadow") return "shadow";
  if (w3cType === "border") return "border";
  if (w3cType === "transition" || w3cType === "time") return "transition";
  if (w3cType === "gradient") return "gradient";
  if (w3cType === "dimension") return "dimension";
  if (w3cType === "fontFamily" || w3cType === "fontWeight") return "typography";

  const n = name.toLowerCase();
  if (n.includes("color") || n.includes("bg") || n.includes("fg")) return "color";
  if (
    n.includes("font") ||
    n.includes("text-") ||
    n.startsWith("text") ||
    n.includes("weight") ||
    n.includes("leading") ||
    n.includes("tracking") ||
    n === "letter-spacing" ||
    n.startsWith("letter-spacing") ||
    n.includes("type")
  )
    return "typography";
  if (n.includes("shadow") || n.includes("elevation")) return "shadow";
  if (n.includes("border") || n.includes("stroke")) return "border";
  if (n.includes("transition") || n.includes("motion") || n.includes("animation") || n.includes("duration") || n.includes("easing")) return "transition";
  if (n.includes("gradient")) return "gradient";
  if (n.includes("breakpoint") || n.includes("screen")) return "breakpoint";
  if (
    n.includes("space") ||
    n.includes("spacing") ||
    n.includes("radius") ||
    n.includes("size") ||
    n.includes("gap") ||
    n.includes("width") ||
    n.includes("height") ||
    n.includes("max-") ||
    n.includes("min-") ||
    n.includes("padding") ||
    n.includes("margin") ||
    n.includes("touch-target")
  )
    return "dimension";
  return null;
}

/** Infer category from a path (for w3c tokens with nested group/prefix structure). */
export function inferCategoryFromPath(path: string[], w3cType?: string): string | null {
  if (w3cType === "color") return "color";
  if (w3cType === "typography") return "typography";
  if (w3cType === "shadow") return "shadow";
  if (w3cType === "border") return "border";
  if (w3cType === "transition" || w3cType === "time") return "transition";
  if (w3cType === "gradient") return "gradient";
  if (w3cType === "dimension") return "dimension";
  if (w3cType === "fontFamily" || w3cType === "fontWeight") return "typography";

  const skip = new Set(["base", "tokens", "primitive", "primitives", "value", "values"]);
  for (const segment of path) {
    if (skip.has(segment.toLowerCase())) continue;
    const inferred = inferCategory(segment);
    if (inferred) return inferred;
  }
  return null;
}

// Normalizers — convert various input value shapes to the form BrandConfigSchema expects.

export function normalizeColor(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.hex === "string") return obj.hex;
    if (Array.isArray(obj.components)) {
      const cs = (obj.colorSpace ?? "srgb").toString().toLowerCase();
      if (cs === "srgb" && obj.components.length >= 3) {
        const [r, g, b] = obj.components;
        const a = typeof obj.alpha === "number" ? obj.alpha : 1;
        const to255 = (n: number) => {
          const v = Math.max(0, Math.min(255, Math.round(n * 255)));
          return v.toString(16).padStart(2, "0");
        };
        const hex = `#${to255(r)}${to255(g)}${to255(b)}`;
        return a < 1 ? hex + to255(a) : hex;
      }
    }
  }
  return JSON.stringify(value);
}

export function normalizeDimension(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.value === "number" && typeof obj.unit === "string") {
      return `${obj.value}${obj.unit}`;
    }
  }
  return JSON.stringify(value);
}

export function normalizeTypography(value: unknown): string | Record<string, unknown> {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (
      obj.fontFamily || obj.fontSize || obj.fontWeight || obj.lineHeight || obj.letterSpacing
    ) {
      return obj;
    }
  }
  return JSON.stringify(value);
}

export function normalizeShadow(value: unknown): string | Record<string, unknown> | Array<Record<string, unknown>> {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === "object" && v !== null ? (v as Record<string, unknown>) : { value: v }));
  }
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return JSON.stringify(value);
}

export function normalizeBorder(value: unknown): string | Record<string, unknown> {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return JSON.stringify(value);
}

export function normalizeTransition(value: unknown): string | Record<string, unknown> {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return JSON.stringify(value);
}

export function normalizeGradient(value: unknown): string | Record<string, unknown> {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return JSON.stringify(value);
}

const MAX_REFERENCE_DEPTH = 32;

export function resolveReference(
  ref: string,
  lookup: Map<string, unknown>,
  visited: Set<string>,
  depth: number
): { resolved: unknown; ok: boolean } {
  if (depth > MAX_REFERENCE_DEPTH) return { resolved: ref, ok: false };
  const path = parseReferencePath(ref);
  if (!path) return { resolved: ref, ok: false };
  if (path[path.length - 1] === "$value") path.pop();
  const key = path.join(".");
  if (visited.has(key)) return { resolved: ref, ok: false };
  visited.add(key);
  const target = lookup.get(key);
  if (target === undefined) return { resolved: ref, ok: false };
  if (typeof target === "string" && isReferenceString(target)) {
    return resolveReference(target, lookup, new Set(visited), depth + 1);
  }
  return { resolved: target, ok: true };
}

function isReferenceString(s: string): boolean {
  return s.startsWith("{") || s.startsWith("#/");
}

function parseReferencePath(ref: string): string[] | null {
  if (ref.startsWith("{") && ref.endsWith("}")) {
    const inner = ref.slice(1, -1);
    if (inner.startsWith("!") || inner.includes("{")) return null;
    return inner.split(/[.\s]/).filter((s) => s.length > 0);
  }
  if (ref.startsWith("{!") && ref.endsWith("}")) {
    const inner = ref.slice(2, -1).trim();
    return inner.split(/[.\s]/).filter((s) => s.length > 0);
  }
  if (ref.startsWith("#/")) {
    return ref
      .slice(2)
      .split("/")
      .filter((s) => s.length > 0)
      .map((s) => s.replace(/\$value$/, ""))
      .filter(Boolean);
  }
  return null;
}

/** Flatten a w3c tokens tree into an array of {path, value, type?, raw?}. */
export function flattenW3cTokens(
  obj: unknown,
  prefix: string[] = []
): Array<{ path: string[]; value: unknown; type?: string; raw?: Record<string, unknown> }> {
  if (!obj || typeof obj !== "object") return [];
  const out: Array<{ path: string[]; value: unknown; type?: string; raw?: Record<string, unknown> }> = [];
  const o = obj as Record<string, unknown>;
  if ("$value" in o) {
    out.push({ path: prefix, value: o.$value, type: o.$type as string | undefined, raw: o });
    return out;
  }
  for (const [k, v] of Object.entries(o)) {
    if (k.startsWith("$")) continue;
    out.push(...flattenW3cTokens(v, [...prefix, k]));
  }
  return out;
}
