import JSON5 from "json5";
import type { BrandConfig } from "../config/schema.js";
import type { RecognizedSource } from "./sources.js";

export type ParsedContribution = {
  source_id: string;
  format: RecognizedSource["format"];
  applied_paths: string[];
  unresolved: string[];
  extracted_summary: Record<string, unknown>;
};

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

function ensureTokens(config: BrandConfig) {
  if (!config.tokens) config.tokens = {};
  return config.tokens;
}

function setPath(obj: Record<string, unknown>, path: string[], value: unknown) {
  let cur: any = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i];
    if (cur[k] === undefined || cur[k] === null || typeof cur[k] !== "object") {
      cur[k] = {};
    }
    cur = cur[k];
  }
  cur[path[path.length - 1]] = value;
}

function flattenW3cTokens(
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

const MAX_REFERENCE_DEPTH = 32;

function resolveReference(
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

function parseW3cTokens(source: RecognizedSource, config: BrandConfig): ParsedContribution {
  const applied: string[] = [];
  const unresolved: string[] = [];
  const summary: Record<string, unknown> = {};

  let raw: unknown;
  try {
    raw = parseJsonish(source.raw);
  } catch (err) {
    return {
      source_id: source.identifier,
      format: source.format,
      applied_paths: [],
      unresolved: [`not valid JSON: ${(err as Error).message}`],
      extracted_summary: {},
    };
  }

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    if (obj.base && typeof obj.base === "object" && !Array.isArray(obj.base)) {
      raw = obj.base;
      const fixBaseRefs = (value: unknown): unknown => {
        if (typeof value === "string") {
          return value.replace(/\{base\./g, "{");
        }
        return value;
      };
      const walk = (node: unknown): void => {
        if (Array.isArray(node)) {
          node.forEach(walk);
        } else if (node && typeof node === "object") {
          for (const k of Object.keys(node as Record<string, unknown>)) {
            const v = (node as Record<string, unknown>)[k];
            if (typeof v === "string") {
              (node as Record<string, unknown>)[k] = fixBaseRefs(v);
            } else {
              walk(v);
            }
          }
        }
      };
      walk(raw);
    }
  }

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
      if (isReferenceString(ref)) {
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

  for (let i = 0; i < flat.length; i++) {
    const item = flat[i];
    if (item.raw?.$extensions) {
      const ext = item.raw.$extensions as Record<string, unknown>;
      for (const [namespace, value] of Object.entries(ext)) {
        if (namespace === "org.primer.figma" || namespace.startsWith("org.primer.")) continue;
        if (value && typeof value === "object") {
          for (const [modeKey, modeVal] of Object.entries(value)) {
            if (typeof modeVal === "string" && isReferenceString(modeVal.trim())) {
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

function parseJsonish(raw: string): unknown {
  return JSON5.parse(raw);
}

function stripCategoryPrefix(name: string, category: string): string {
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

function inferCategoryFromPath(path: string[], w3cType?: string): string | null {
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

function inferCategory(name: string, w3cType?: string): string | null {
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

function normalizeColor(value: unknown): string {
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

function normalizeDimension(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.value === "number" && typeof obj.unit === "string") {
      return `${obj.value}${obj.unit}`;
    }
  }
  return JSON.stringify(value);
}

function normalizeTypography(value: unknown): string | Record<string, unknown> {
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

function normalizeShadow(value: unknown): string | Record<string, unknown> | Array<Record<string, unknown>> {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === "object" && v !== null ? (v as Record<string, unknown>) : { value: v }));
  }
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return JSON.stringify(value);
}

function normalizeBorder(value: unknown): string | Record<string, unknown> {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return JSON.stringify(value);
}

function normalizeTransition(value: unknown): string | Record<string, unknown> {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return JSON.stringify(value);
}

function normalizeGradient(value: unknown): string | Record<string, unknown> {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return JSON.stringify(value);
}

function parseTailwind(source: RecognizedSource, config: BrandConfig): ParsedContribution {
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

function evalTailwindConfig(raw: string): any {
  const stripped = raw
    .replace(/^module\.exports\s*=\s*/m, "")
    .replace(/^export default\s+/m, "")
    .replace(/;\s*$/, "")
    .trim();
  return new Function(`return (${stripped})`)();
}

function parseCss(source: RecognizedSource, config: BrandConfig): ParsedContribution {
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

function parseMarkdown(source: RecognizedSource, config: BrandConfig): ParsedContribution {
  const applied: string[] = [];
  const unresolved: string[] = [];
  const summary: Record<string, unknown> = {};

  const sections = splitMarkdownSections(source.raw);

  for (const [heading, body] of sections) {
    const lower = heading.toLowerCase();

    if (lower.includes("color") && lower.includes("token")) {
      extractColorsFromMarkdown(body, config, applied, unresolved);
      continue;
    }
    if (lower.includes("typography") || lower.includes("type scale")) {
      extractTypographyFromMarkdown(body, config, applied, unresolved);
      continue;
    }
    if (lower.includes("spacing") && lower.includes("token")) {
      extractDimensionsFromMarkdown(body, config, applied, unresolved);
      continue;
    }
    if (lower.includes("voice") && (lower.includes("brand") || lower.includes("north star"))) {
      extractVoiceFromMarkdown(body, config, applied, unresolved);
      continue;
    }
    if (lower.includes("banned") || lower.includes("avoid")) {
      extractRulesFromMarkdown(heading, body, config, applied, unresolved);
      continue;
    }
    if (lower.includes("component") || lower.includes("ui")) {
      extractComponentsFromMarkdown(body, config, applied, unresolved);
      continue;
    }
    if (lower.includes("accessibility") || lower.includes("wcag")) {
      extractAccessibilityFromMarkdown(body, config, applied, unresolved);
      continue;
    }
    if (lower.includes("logo") || lower.includes("wordmark")) {
      extractLogosFromMarkdown(body, config, applied, unresolved);
      continue;
    }
  }

  if (!config.meta) {
    config.meta = { source: "markdown", schemaVersion: "0.3.0" };
  } else if (config.meta.source === "manual" || config.meta.source === undefined) {
    config.meta = { ...config.meta, source: "markdown", schemaVersion: "0.3.0" };
  }
  config.meta = { ...config.meta, ingestionDate: new Date().toISOString().slice(0, 10) };

  summary.sections_processed = sections.length;
  return {
    source_id: source.identifier,
    format: source.format,
    applied_paths: applied,
    unresolved,
    extracted_summary: summary,
  };
}

function splitMarkdownSections(raw: string): Array<[string, string]> {
  const lines = raw.split("\n");
  const out: Array<[string, string]> = [];
  let current: [string, string] | null = null;
  for (const line of lines) {
    const headingMatch = line.match(/^(#+)\s+(.+?)\s*$/);
    if (headingMatch && headingMatch[1].length === 1) {
      if (current) out.push(current);
      current = [headingMatch[2], ""];
    } else if (current) {
      current[1] += line + "\n";
    }
  }
  if (current) out.push(current);
  return out;
}

function extractColorsFromMarkdown(
  body: string,
  config: BrandConfig,
  applied: string[],
  unresolved: string[]
) {
  const tokens = ensureTokens(config);
  if (!tokens.color) tokens.color = {};
  const lines = body.split("\n");
  for (const line of lines) {
    const match = line.match(/\|\s*`?--([\w-]+)`?\s*\|.*?(#[0-9a-f]{3,8})/i);
    if (match) {
      const name = match[1];
      const hex = match[2];
      const key = stripCategoryPrefix(name, "color");
      tokens.color[key] = hex;
      applied.push(`color.${key}`);
    }
  }
}

function extractTypographyFromMarkdown(
  body: string,
  config: BrandConfig,
  applied: string[],
  unresolved: string[]
) {
  const tokens = ensureTokens(config);
  if (!tokens.typography) tokens.typography = {};
  const familyMatch = body.match(/--font-primary:\s*['"]?([^'";\n]+)/i);
  if (familyMatch) {
    tokens.typography["primary-family"] = familyMatch[1].trim();
    applied.push("typography.primary-family");
  }
  const monoMatch = body.match(/--font-mono:\s*['"]?([^'";\n]+)/i);
  if (monoMatch) {
    tokens.typography["mono-family"] = monoMatch[1].trim();
    applied.push("typography.mono-family");
  }
  const sizeRe = /--text-([\w-]+):\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = sizeRe.exec(body)) !== null) {
    tokens.typography[m[1]] = m[2].trim();
    applied.push(`typography.${m[1]}`);
  }
}

function stripTypographyPrefix(key: string): string {
  return key.replace(/^text-/, "").replace(/^ui-/, "");
}

function extractDimensionsFromMarkdown(
  body: string,
  config: BrandConfig,
  applied: string[],
  unresolved: string[]
) {
  const tokens = ensureTokens(config);
  if (!tokens.dimension) tokens.dimension = {};
  const re = /--space-([\w.-]+):\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    tokens.dimension[`space-${m[1]}`] = m[2].trim();
    applied.push(`dimension.space-${m[1]}`);
  }
}

function extractVoiceFromMarkdown(
  body: string,
  config: BrandConfig,
  applied: string[],
  unresolved: string[]
) {
  if (!config.copy) config.copy = { voice: { principles: [] }, rules: [], ctas: [], ctaLocks: [], terminology: [], perChannel: [] };
  if (!config.copy.voice) config.copy.voice = { principles: [] };
  const lines = body.split("\n");
  for (const line of lines) {
    const match = line.match(/^\s*\d+\.\s+(.+?)\s*$/);
    if (match) {
      config.copy.voice.principles.push(match[1].trim());
      applied.push(`copy.voice.principles[${config.copy.voice.principles.length - 1}]`);
    }
  }
}

function extractRulesFromMarkdown(
  heading: string,
  body: string,
  config: BrandConfig,
  applied: string[],
  unresolved: string[]
) {
  if (!config.copy) config.copy = { voice: { principles: [] }, rules: [], ctas: [], ctaLocks: [], terminology: [], perChannel: [] };
  const severity = heading.toLowerCase().includes("banned")
    ? "error"
    : heading.toLowerCase().includes("avoid")
    ? "warning"
    : "info";
  const lines = body.split("\n");
  let i = 0;
  let ruleId = 0;
  while (i < lines.length) {
    const line = lines[i];
    const termMatch = line.match(/^[#>*\s-]*\*?\*?([^*:\n]+)\*?\*?\s*[:—]/);
    if (termMatch) {
      const term = termMatch[1].trim();
      if (term.length > 0 && term.length < 60) {
        const nextLine = lines[i + 1] ?? "";
        const suggestionMatch = nextLine.match(/use[:\s]+(.+)/i);
        const suggestion = suggestionMatch?.[1]?.trim();
        config.copy.rules.push({
          id: `${sourceIdentifier(config)}-${ruleId++}`,
          description: term,
          severity,
          match: { terms: [term], case_insensitive: true, stemming: false },
          suggestion,
        });
        applied.push(`copy.rules[${ruleId}]`);
      }
    }
    i++;
  }
}

function sourceIdentifier(config: BrandConfig): string {
  return config.name?.replace(/\s+/g, "-").toLowerCase() ?? "brand";
}

function extractComponentsFromMarkdown(
  body: string,
  config: BrandConfig,
  applied: string[],
  unresolved: string[]
) {
  if (!config.components) config.components = { inventory: [] };
  const componentNames = ["button", "input", "card", "badge", "nav", "footer", "icon", "modal", "toast", "link"];
  const lines = body.split("\n");
  for (const line of lines) {
    const headingMatch = line.match(/^#{2,4}\s+(.+?)\s*$/);
    if (!headingMatch) continue;
    const headingLower = headingMatch[1].toLowerCase();
    for (const name of componentNames) {
      if (headingLower.includes(name)) {
        config.components.inventory.push({
          name: name.charAt(0).toUpperCase() + name.slice(1),
          category: "actions",
          description: "",
        });
        applied.push(`components.inventory.${name}`);
      }
    }
  }
}

function extractAccessibilityFromMarkdown(
  body: string,
  config: BrandConfig,
  applied: string[],
  unresolved: string[]
) {
  if (!config.accessibility) {
    config.accessibility = {
      contrast: { minimum: 4.5, prefer: "WCAG2" },
      focusRing: { color: "primary", width: "2px", offset: "2px" },
      minHitTarget: "44px",
      colorAloneBanned: true,
      shapeSignalRequired: true,
    };
  }
  const contrastMatch = body.match(/(\d+(?:\.\d+)?):1/);
  if (contrastMatch) {
    config.accessibility.contrast.minimum = Number(contrastMatch[1]);
    applied.push("accessibility.contrast.minimum");
  }
  if (/never use color as the only signal/i.test(body) || /color alone/i.test(body)) {
    config.accessibility.colorAloneBanned = true;
    applied.push("accessibility.colorAloneBanned");
  }
  if (/44\s*p?x?/i.test(body)) {
    config.accessibility.minHitTarget = "44px";
    applied.push("accessibility.minHitTarget");
  }
}

function extractLogosFromMarkdown(
  body: string,
  config: BrandConfig,
  applied: string[],
  unresolved: string[]
) {
  if (!config.assets) config.assets = { logos: [], fonts: [] };
  const fileRe = /\*\*File:\*\*\s*`?([^`\n.]+\.svg)`?/g;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = fileRe.exec(body)) !== null) {
    const filename = m[1];
    const variant = filename.replace(/\.svg$/, "");
    config.assets.logos.push({
      variant,
      file: filename,
      darkBgSafe: false,
    });
    applied.push(`assets.logos[${idx++}]`);
  }
}

function parseFigmaVariables(source: RecognizedSource, config: BrandConfig): ParsedContribution {
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
