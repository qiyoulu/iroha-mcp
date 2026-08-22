import type { BrandConfig } from "../../config/schema.js";
import type { RecognizedSource } from "../sources.js";
import type { ParsedContribution } from "../parse.js";
import { ensureTokens, stripCategoryPrefix } from "./shared.js";

/**
 * Markdown design-system parser. Recognizes section headings by keyword:
 *
 *   - "color tokens"        → tokens.color (parses `--name | #hex` table rows)
 *   - "typography" / "type scale" → tokens.typography
 *   - "spacing tokens"      → tokens.dimension
 *   - "voice" + ("brand" | "north star") → copy.voice.principles
 *   - "banned" / "avoid"    → copy.rules
 *   - "component" / "ui"    → components.inventory
 *   - "accessibility" / "wcag" → accessibility overrides
 *   - "logo" / "wordmark"   → assets.logos
 */
export function parseMarkdown(source: RecognizedSource, config: BrandConfig): ParsedContribution {
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
  _unresolved: string[]
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
  _unresolved: string[]
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

function extractDimensionsFromMarkdown(
  body: string,
  config: BrandConfig,
  applied: string[],
  _unresolved: string[]
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
  _unresolved: string[]
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
  _unresolved: string[]
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
  _unresolved: string[]
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
  _unresolved: string[]
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
  _unresolved: string[]
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
