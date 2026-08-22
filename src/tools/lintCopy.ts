import type { BrandConfig } from "../config/schema.js";
import { findSuperlatives, findCtaMatches, escapeRegex } from "../util/regex.js";

export type Violation = {
  rule: string;
  message: string;
  severity: "error" | "warning" | "info";
  span?: { start: number; end: number };
  suggestion?: string;
};

function detectSentenceCase(text: string): Array<{ offset: number; word: string }> {
  const flagged: Array<{ offset: number; word: string }> = [];
  let i = 0;
  let atSentenceStart = true;

  while (i < text.length) {
    const ch = text[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (/[.!?]/.test(ch)) {
      while (i < text.length && /[.!?\s]/.test(text[i])) i++;
      atSentenceStart = true;
      continue;
    }

    const start = i;
    while (i < text.length && !/\s/.test(text[i]) && !/[.!?]/.test(text[i])) {
      i++;
    }
    const word = text.slice(start, i);

    if (atSentenceStart) {
      atSentenceStart = false;
      continue;
    }

    if (word.length > 3 && /^[A-Z]/.test(word)) {
      flagged.push({ offset: start, word });
    }
  }

  return flagged;
}

function findCtaSpans(text: string): Array<{ start: number; end: number; phrase: string; words: string[] }> {
  return findCtaMatches(text).map((m) => {
    const phrase = m[0];
    return {
      start: m.index,
      end: m.index + phrase.length,
      phrase,
      words: phrase.split(/\s+/),
    };
  });
}

export function lintCopy(text: string, brand: BrandConfig): Violation[] {
  const violations: Violation[] = [];
  const voice = brand.voice ?? {
    sentence_case: false,
    proper_nouns: [],
    forbidden_words: [],
    preferred_words: {},
    cta: { style: "free" as const, max_words: 3, require_capitalize: false },
    tone_markers: { forbid_exclamation: false, forbid_superlatives: false },
  };

  if (voice.sentence_case) {
    let flagged = detectSentenceCase(text);
    if (voice.proper_nouns.length > 0) {
      const pnSet = new Set(voice.proper_nouns.map((p) => p.toLowerCase()));
      flagged = flagged.filter((f) => !pnSet.has(f.word.toLowerCase()));
    }
    if (flagged.length > 0) {
      const sample = flagged.slice(0, 3).map((f) => `"${f.word}"`).join(", ");
      const more = flagged.length > 3 ? ` (+${flagged.length - 3} more)` : "";
      violations.push({
        rule: "sentence_case",
        message: `brand requires sentence case. ${flagged.length} capitalized word(s) found mid-sentence: ${sample}${more}.`,
        severity: "warning",
        suggestion: "lowercase all words except the first word of each sentence and proper nouns.",
      });
    }
  }

  for (const forbidden of voice.forbidden_words) {
    const re = new RegExp(`\\b${escapeRegex(forbidden)}\\b`, "gi");
    const matches = text.matchAll(re);
    for (const match of matches) {
      violations.push({
        rule: "forbidden_words",
        message: `"${match[0]}" is on the forbidden list.`,
        severity: "error",
        span: { start: match.index, end: match.index + match[0].length },
        suggestion: voice.preferred_words[forbidden.toLowerCase()] ?? "choose a different word.",
      });
    }
  }

  if (voice.cta.style !== "free") {
    const ctaSpans = findCtaSpans(text);
    for (const span of ctaSpans) {
      const wordCount = span.words.length;

      if (voice.cta.style === "verb_only" && wordCount > 1) {
        violations.push({
          rule: "cta_format",
          message: `CTA "${span.phrase}" has ${wordCount} words. brand prefers verb-only.`,
          severity: "warning",
          span: { start: span.start, end: span.end },
          suggestion: `use a single verb (kept "${span.words[0]}").`,
        });
      } else if (voice.cta.style === "verb_noun" && wordCount > voice.cta.max_words) {
        violations.push({
          rule: "cta_format",
          message: `CTA "${span.phrase}" has ${wordCount} words. max is ${voice.cta.max_words}.`,
          severity: "warning",
          span: { start: span.start, end: span.end },
          suggestion: `shorten to ${voice.cta.max_words} words or fewer.`,
        });
      }

      if (voice.cta.require_capitalize && /^[a-z]/.test(span.phrase)) {
        violations.push({
          rule: "cta_capitalize",
          message: `CTA "${span.phrase}" should start with a capital letter.`,
          severity: "warning",
          span: { start: span.start, end: span.start + 1 },
          suggestion: "capitalize the first letter.",
        });
      }
    }
  } else if (voice.cta.require_capitalize) {
    const ctaSpans = findCtaSpans(text);
    for (const span of ctaSpans) {
      if (/^[a-z]/.test(span.phrase)) {
        violations.push({
          rule: "cta_capitalize",
          message: `CTA "${span.phrase}" should start with a capital letter.`,
          severity: "warning",
          span: { start: span.start, end: span.start + 1 },
          suggestion: "capitalize the first letter.",
        });
      }
    }
  }

  if (voice.tone_markers.forbid_exclamation) {
    const re = /!/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      violations.push({
        rule: "tone.no_exclamation",
        message: "exclamation marks are not on-brand.",
        severity: "warning",
        span: { start: m.index, end: m.index + 1 },
        suggestion: "remove the exclamation mark.",
      });
    }
  }

  if (voice.tone_markers.forbid_superlatives) {
    for (const m of findSuperlatives(text)) {
      violations.push({
        rule: "tone.no_superlatives",
        message: `superlative "${m[0]}" detected.`,
        severity: "warning",
        span: { start: m.index, end: m.index + m[0].length },
        suggestion: "state a specific benefit instead of a superlative.",
      });
    }
  }

  return violations;
}

export { detectSentenceCase, findCtaSpans };