/**
 * Shared regex helpers used across the lint, design, and ingest code paths.
 *
 * Centralized here so the constants don't drift between call sites. If a
 * token-shape regex gets tightened (e.g. 8-digit hex with alpha), the change
 * happens once and propagates everywhere.
 */

export const HEX_RE = /#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})\b/gi;
export const RGB_RE = /rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)/gi;
export const PX_RE = /-?\d+(?:\.\d+)?(?:px|rem|em)\b/g;

/** Tailwind color utilities. Covers bg-*, text-*, border-*, fill-*, stroke-*, from-*, via-*, to-*, ring-*, outline-*, divide-*, placeholder-*, caret-*, accent-*, decoration-*, shadow-* with optional scale prefix (e.g. `blue-500`). */
export const TAILWIND_COLOR_RE = /\b(?:bg|text|border|fill|stroke|from|via|to|ring|outline|divide|placeholder|caret|accent|decoration|shadow)-(?:[a-z]+-)?[a-z]+-\d{2,3}\b/g;

/** Verbs that mark a CTA-like phrase, followed by up to two noun words. Matches both hyphenated and spaced forms ("sign-up", "sign up"). */
export const CTA_VERB_PATTERN =
  "(join|get started|sign up|sign-up|learn more|learn-more|try|start|book|contact|register|subscribe|download|request|read more|read-more|view|see|explore|discover|build|create|make|launch|go|click|tap)";

export const CTA_VERB_RE = new RegExp(`\\b${CTA_VERB_PATTERN}\\b(?:\\s+[A-Za-z][\\w'-]*){0,2}`, "gi");

/**
 * Fresh CTA scan that resets lastIndex on every call. Same /g-state caveat
 * as findSuperlatives — module-level /g regexes silently break sequential
 * matching when shared across invocations.
 */
export function findCtaMatches(text: string): RegExpExecArray[] {
  const re = new RegExp(CTA_VERB_RE.source, CTA_VERB_RE.flags);
  const matches: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    matches.push(m);
  }
  return matches;
}

/** Words that read as superlatives when flagged mid-sentence. Matches "best", "fastest", "simplest", "greatest", "most", "ultimate", "#1". */
export const SUPERLATIVES_RE = /\b(best|fastest|simplest|greatest|most|ultimate|#1)\b/gi;

/**
 * Fresh copy of SUPERLATIVES_RE for use inside `exec()` loops. The module-level
 * constant carries the /g flag, which advances lastIndex across calls and
 * silently breaks sequential matching. Use this helper for per-call loops.
 */
export function findSuperlatives(text: string): RegExpExecArray[] {
  const re = new RegExp(SUPERLATIVES_RE.source, SUPERLATIVES_RE.flags);
  const matches: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    matches.push(m);
  }
  return matches;
}

/**
 * Escape a string for safe interpolation into a RegExp constructor.
 *
 * Without this, a forbidden word like "section.code" would compile to a regex
 * that tries to match any character in {s,e,c,t,i,o,n,.,_,\w} — the dot
 * would match any character, the underscore is a word character. The escape
 * preserves literal intent.
 */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Strip filesystem paths from an error message before surfacing it to an
 * MCP client. Audit finding #15 — the generic `catch (err)` block was leaking
 * paths from fs errors and zod errors alike. After #12 zod errors are routed
 * through formatZodError, but other errors still pass through this.
 *
 * Replaces anything that looks like /foo/bar/baz with `<path>` so the
 * operator's directory layout is never revealed to an untrusted caller.
 */
export function sanitizeErrorMessage(msg: string): string {
  return msg
    .replace(/\/(?:Users|home|var|etc|tmp|private|opt|root|usr|Volumes)[\w./-]+/g, "<path>")
    .replace(/~[\w./-]+/g, "<path>");
}
