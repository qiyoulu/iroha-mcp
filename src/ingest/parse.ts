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
): Array<{ path: string[]; value: unknown; type?: string }> {
  if (!obj || typeof obj !== "object") return [];
  const out: Array<{ path: string[]; value: unknown; type?: string }> = [];
  const o = obj as Record<string, unknown>;
  if ("$value" in o) {
    out.push({ path: prefix, value: o.$value, type: o.$type as string | undefined });
    return out;
  }
  for (const [k, v] of Object.entries(o)) {
    if (k.startsWith("$")) continue;
    out.push(...flattenW3cTokens(v, [...prefix, k]));
  }
  return out;
}

function parseW3cTokens(source: RecognizedSource, config: BrandConfig): ParsedContribution {
  const applied: string[] = [];
  const unresolved: string[] = [];
  const summary: Record<string, unknown> = {};

  let raw: unknown;
  try {
    raw = JSON.parse(source.raw);
  } catch (err) {
    return {
      source_id: source.identifier,
      format: source.format,
      applied_paths: [],
      unresolved: [`not valid JSON: ${(err as Error).message}`],
      extracted_summary: {},
    };
  }

  const flat = flattenW3cTokens(raw);
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
    const category = inferCategory(path[0], type);
    if (!category) {
      unresolved.push(`${path.join(".")} (no category)`);
      continue;
    }
    const key = stripCategoryPrefix(path[path.length - 1], category);
    if (category === "color") {
      tokenBuckets.color[key] = typeof value === "string" ? value : JSON.stringify(value);
    } else if (category === "typography") {
      tokenBuckets.typography[key] = value;
    } else if (category === "shadow") {
      tokenBuckets.shadow[key] = value;
    } else if (category === "border") {
      tokenBuckets.border[key] = value;
    } else if (category === "transition") {
      tokenBuckets.transition[key] = value;
    } else if (category === "gradient") {
      tokenBuckets.gradient[key] = value;
    } else if (category === "breakpoint") {
      tokenBuckets.breakpoint[key] = typeof value === "number" ? value : Number(value);
    } else if (category === "dimension") {
      const strVal = typeof value === "string" ? value : JSON.stringify(value);
      tokenBuckets.dimension[key] = strVal;
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

function inferCategory(name: string, w3cType?: string): string | null {
  if (w3cType === "color") return "color";
  if (w3cType === "typography") return "typography";
  if (w3cType === "shadow") return "shadow";
  if (w3cType === "border") return "border";
  if (w3cType === "transition") return "transition";
  if (w3cType === "gradient") return "gradient";
  if (w3cType === "dimension") return "dimension";
  if (w3cType === "fontFamily" || w3cType === "fontWeight") return "typography";

  const n = name.toLowerCase();
  if (n.includes("color") || n.includes("bg") || n.includes("fg") || n.includes("brand")) return "color";
  if (n.includes("font") || n.includes("text") || n.includes("type")) return "typography";
  if (n.includes("shadow") || n.includes("elevation")) return "shadow";
  if (n.includes("border")) return "border";
  if (n.includes("transition") || n.includes("motion") || n.includes("animation")) return "transition";
  if (n.includes("gradient")) return "gradient";
  if (n.includes("breakpoint") || n.includes("screen")) return "breakpoint";
  if (n.includes("spacing") || n.includes("space") || n.includes("size") || n.includes("radius") || n.includes("gap")) return "dimension";
  return null;
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

  const rootMatch = source.raw.match(/:root\s*\{([\s\S]*?)\}/);
  if (!rootMatch) {
    return {
      source_id: source.identifier,
      format: source.format,
      applied_paths: [],
      unresolved: ["no :root block found"],
      extracted_summary: {},
    };
  }

  const body = rootMatch[1];
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
    const target = (tokens as any)[category] ?? {};
    target[stripped] = value;
    (tokens as any)[category] = target;
    applied.push(`${category}.${stripped}`);
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
