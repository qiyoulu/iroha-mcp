import type { BrandConfig } from "./schema.js";

export type DesignViolation = {
  rule: string;
  message: string;
  severity: "error" | "warning" | "info";
  span?: { start: number; end: number };
  suggestion?: string;
};

const HEX_RE = /#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})\b/gi;
const RGB_RE = /rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)/gi;
const PX_RE = /-?\d+(?:\.\d+)?(?:px|rem|em)\b/g;
const TAILWIND_COLOR_RE = /\b(?:bg|text|border|fill|stroke|from|via|to|ring|outline|divide|placeholder|caret|accent|decoration|shadow)-(?:[a-z]+-)?[a-z]+-\d{2,3}\b/g;

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const cleaned = hex.replace(/^#/, "");
  let r: number, g: number, b: number;
  if (cleaned.length === 3) {
    r = parseInt(cleaned[0] + cleaned[0], 16);
    g = parseInt(cleaned[1] + cleaned[1], 16);
    b = parseInt(cleaned[2] + cleaned[2], 16);
  } else if (cleaned.length === 6 || cleaned.length === 8) {
    r = parseInt(cleaned.slice(0, 2), 16);
    g = parseInt(cleaned.slice(2, 4), 16);
    b = parseInt(cleaned.slice(4, 6), 16);
  } else {
    return null;
  }
  return { r, g, b };
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function computeContrast(hex1: string, hex2: string): number | null {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  if (!rgb1 || !rgb2) return null;
  const l1 = relativeLuminance(rgb1);
  const l2 = relativeLuminance(rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function flattenColorHexes(tokens: BrandConfig["tokens"]): string[] {
  if (!tokens?.color) return [];
  const hexes: string[] = [];
  for (const value of Object.values(tokens.color)) {
    if (typeof value === "string") {
      hexes.push(value.toLowerCase());
    } else if (value && typeof value === "object" && "value" in value && typeof value.value === "string") {
      hexes.push(value.value.toLowerCase());
    }
  }
  return hexes;
}

export function flattenDimensionScale(tokens: BrandConfig["tokens"]): number[] {
  if (!tokens?.dimension) return [];
  const scale: number[] = [];
  for (const value of Object.values(tokens.dimension)) {
    const match = value.match(/^(-?\d+(?:\.\d+)?)(px|rem|em)$/);
    if (match) {
      const num = parseFloat(match[1]);
      const unit = match[2];
      scale.push(unit === "rem" || unit === "em" ? num * 16 : num);
    }
  }
  return scale;
}

function normalizeHex(hex: string): string {
  return hex.toLowerCase();
}

export type LintDesignInput = {
  snippet: string;
  brand: BrandConfig;
  rule_severity?: Partial<Record<string, "error" | "warning" | "info">>;
};

function severityFor(
  rule: string,
  override: LintDesignInput["rule_severity"],
  fallback: "error" | "warning" | "info"
): "error" | "warning" | "info" {
  return override?.[rule] ?? fallback;
}

export function lintDesign({ snippet, brand, rule_severity }: LintDesignInput): DesignViolation[] {
  const violations: DesignViolation[] = [];
  const tokens = brand.tokens;

  if (tokens?.color && Object.keys(tokens.color).length > 0) {
    const palette = new Set(flattenColorHexes(tokens).map(normalizeHex));

    const hexMatches = [...snippet.matchAll(HEX_RE)];
    for (const m of hexMatches) {
      const hex = normalizeHex(m[0]);
      if (!palette.has(hex)) {
        violations.push({
          rule: "hard_token_reference",
          severity: severityFor("hard_token_reference", rule_severity, "error"),
          message: `color "${m[0]}" is not in the brand palette. use a defined token.`,
          span: { start: m.index ?? 0, end: (m.index ?? 0) + m[0].length },
          suggestion: `replace with a token from tokens.color (one of: ${[...palette].slice(0, 6).join(", ")}${palette.size > 6 ? "…" : ""}).`,
        });
      }
    }

    const rgbMatches = [...snippet.matchAll(RGB_RE)];
    for (const m of rgbMatches) {
      violations.push({
        rule: "hard_token_reference",
        severity: severityFor("hard_token_reference", rule_severity, "error"),
        message: `raw rgb/rgba "${m[0]}" is not on-brand. use a token reference.`,
        span: { start: m.index ?? 0, end: (m.index ?? 0) + m[0].length },
        suggestion: "use a token reference like var(--color-primary) instead of raw rgb().",
      });
    }

    const twMatches = [...snippet.matchAll(TAILWIND_COLOR_RE)];
    for (const m of twMatches) {
      const valuePart = m[0].split("-").slice(-1)[0];
      const inferredHex = `#${"0".repeat(6)}`;
      if (!palette.has(inferredHex)) {
        violations.push({
          rule: "hard_token_reference",
          severity: severityFor("hard_token_reference", rule_severity, "warning"),
          message: `tailwind color utility "${m[0]}" — verify it's a brand palette entry.`,
          span: { start: m.index ?? 0, end: (m.index ?? 0) + m[0].length },
          suggestion: "ensure the color scale exists in tokens.color.",
        });
      }
    }
  }

  if (tokens?.dimension && Object.keys(tokens.dimension).length > 0) {
    const scale = flattenDimensionScale(tokens);
    const scaleSet = new Set(scale.map((n) => n.toFixed(2)));

    const pxMatches = [...snippet.matchAll(PX_RE)];
    for (const m of pxMatches) {
      const raw = m[0];
      const numMatch = raw.match(/^(-?\d+(?:\.\d+)?)(px|rem|em)$/);
      if (!numMatch) continue;
      const num = parseFloat(numMatch[1]);
      const unit = numMatch[2];
      const px = unit === "rem" || unit === "em" ? num * 16 : num;
      const key = px.toFixed(2);
      if (!scaleSet.has(key)) {
        violations.push({
          rule: "scale_adherence",
          severity: severityFor("scale_adherence", rule_severity, "error"),
          message: `dimension "${raw}" is off-scale. allowed: ${[...scaleSet].join(", ")}px.`,
          span: { start: m.index ?? 0, end: (m.index ?? 0) + raw.length },
          suggestion: `snap to the nearest scale value.`,
        });
      }
    }
  }

  if (brand.accessibility?.contrast && tokens?.color) {
    const min = brand.accessibility.contrast.minimum;
    const palette = flattenColorHexes(tokens);

    const fgBgPairs: Array<{ fg: string; bg: string; from: number }> = [];
    const colorVarPairs = [
      ["var(--color-fg)", "var(--color-bg)"],
      ["var(--color-foreground)", "var(--color-background)"],
    ];
    for (const [fg, bg] of colorVarPairs) {
      const fgEscaped = fg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const bgEscaped = bg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const fgRe = new RegExp(`color:\\s*${fgEscaped}`, "g");
      let m: RegExpExecArray | null;
      while ((m = fgRe.exec(snippet)) !== null) {
        const after = snippet.slice(m.index + m[0].length, m.index + m[0].length + 200);
        const bgMatch = after.match(new RegExp(`background(?:-color)?:\\s*${bgEscaped}`));
        if (bgMatch) {
          fgBgPairs.push({ fg, bg, from: m.index });
        }
      }
    }

    for (const { fg, bg } of fgBgPairs) {
      const fgToken = resolveColorToken(fg, tokens);
      const bgToken = resolveColorToken(bg, tokens);
      if (!fgToken || !bgToken) continue;
      const ratio = computeContrast(fgToken, bgToken);
      if (ratio && ratio < min) {
        violations.push({
          rule: "contrast",
          severity: severityFor("contrast", rule_severity, "error"),
          message: `contrast ${ratio.toFixed(2)}:1 between ${fg} and ${bg} is below minimum ${min}:1.`,
          suggestion: `pair ${fg} with a darker/lighter background that meets ${min}:1.`,
        });
      }
    }
  }

  if (tokens?.modes && tokens.modes.length > 0 && tokens.color) {
    const baseColorKeys = new Set(Object.keys(tokens.color));
    for (const mode of tokens.modes) {
      if (!mode.tokenOverrides?.color) continue;
      const modeKeys = Object.keys(mode.tokenOverrides.color);
      const missing = [...baseColorKeys].filter((k) => !modeKeys.includes(k));
      if (missing.length > 0) {
        violations.push({
          rule: "mode_coverage",
          severity: severityFor("mode_coverage", rule_severity, "warning"),
          message: `mode "${mode.name}" is missing ${missing.length} color token(s) defined in base: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}.`,
          suggestion: `define overrides for all base color tokens in mode "${mode.name}" or remove the mode.`,
        });
      }
    }
  }

  return violations;
}

function resolveColorToken(
  ref: string,
  tokens: BrandConfig["tokens"]
): string | null {
  if (!tokens?.color) return null;
  const match = ref.match(/var\(--color-([^)]+)\)/);
  if (!match) return null;
  const key = match[1];
  const value = tokens.color[key];
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "value" in value && typeof value.value === "string") {
    return value.value;
  }
  return null;
}
