import { lintCopy, detectSentenceCase, findCtaSpans, type Violation } from "./lintCopy.js";
import type { BrandConfig } from "../config/schema.js";
import type { z } from "zod";
import { FeedbackConfigSchema } from "../config/schema.js";

export type FeedbackTone = z.infer<typeof FeedbackConfigSchema>["tone"];

export type FeedbackOutput = {
  brand: string;
  context: string | null;
  summary?: string;
  violations?: Violation[];
  suggestions?: string[];
  rewrite?: string | null;
};

function rewrite(text: string, brand: BrandConfig): string {
  let out = text;
  const voice = brand.voice ?? {
    sentence_case: false,
    proper_nouns: [],
    forbidden_words: [],
    preferred_words: {},
    cta: { style: "free" as const, max_words: 3, require_capitalize: false },
    tone_markers: { forbid_exclamation: false, forbid_superlatives: false },
  };

  for (const forbidden of voice.forbidden_words) {
    const replacement = voice.preferred_words[forbidden.toLowerCase()];
    if (!replacement) continue;
    const re = new RegExp(`\\b${forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    out = out.replace(re, replacement);
  }

  if (voice.tone_markers.forbid_exclamation) {
    out = out.replace(/!/g, ".");
  }

  if (voice.tone_markers.forbid_superlatives) {
    out = out.replace(/\b(best|fastest|simplest|greatest|most|ultimate|#1)\b/gi, (match) => {
      return `[${match.toLowerCase()}]`;
    });
  }

  if (voice.sentence_case) {
    const pnSet = new Set(voice.proper_nouns.map((p) => p.toLowerCase()));
    const flagged = detectSentenceCase(out).filter(
      (f) => !pnSet.has(f.word.toLowerCase())
    );
    flagged.sort((a, b) => b.offset - a.offset);
    for (const { offset, word } of flagged) {
      const lower = word[0].toLowerCase() + word.slice(1);
      out = out.slice(0, offset) + lower + out.slice(offset + word.length);
    }
  }

  if (voice.cta.style === "verb_only") {
    const ctaSpans = findCtaSpans(out);
    ctaSpans.sort((a, b) => b.start - a.start);
    for (const span of ctaSpans) {
      if (span.words.length > 1) {
        out = out.slice(0, span.start) + span.words[0] + out.slice(span.end);
      }
    }
  }

  return out;
}

function buildSummary(violations: Violation[], brandName: string, tone: FeedbackTone): string {
  const errors = violations.filter((v) => v.severity === "error").length;
  const warnings = violations.filter((v) => v.severity === "warning").length;
  const brandLabel = brandName || "your brand";

  if (tone === "terse") {
    if (violations.length === 0) return "clean.";
    return `${errors}e ${warnings}w`;
  }

  if (tone === "encouraging") {
    if (violations.length === 0) return `clean against ${brandLabel} rules. nice work.`;
    const total = violations.length;
    return `${total} thing${total === 1 ? "" : "s"} to refine against ${brandLabel} rules. you've got the bones — these are the polish.`;
  }

  if (violations.length === 0) return `clean against ${brandLabel} rules.`;
  return `${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"} against ${brandLabel} rules.`;
}

function buildSuggestions(violations: Violation[], tone: FeedbackTone): string[] {
  const prefix = tone === "terse" ? "" : tone === "encouraging" ? "try: " : "";
  return violations
    .filter((v) => v.suggestion)
    .map((v) => `${v.rule}: ${prefix}${v.suggestion}`);
}

export function generateFeedback(
  draft: string,
  context: string | null,
  brand: BrandConfig
): FeedbackOutput {
  const violations = lintCopy(draft, brand);
  const feedback: FeedbackOutput = {
    brand: brand.name,
    context,
  };

  const fb = brand.feedback ?? {
    tone: "constructive_direct" as const,
    structure: ["summary", "violations", "suggestions", "rewrite"] as const,
  };
  const structure = fb.structure;
  const tone = fb.tone;

  if (structure.includes("summary")) feedback.summary = buildSummary(violations, brand.name, tone);
  if (structure.includes("violations")) feedback.violations = violations;
  if (structure.includes("suggestions")) feedback.suggestions = buildSuggestions(violations, tone);
  if (structure.includes("rewrite")) feedback.rewrite = rewrite(draft, brand);

  return feedback;
}

export { rewrite, buildSummary, buildSuggestions };