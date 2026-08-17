import { test } from "node:test";
import assert from "node:assert/strict";
import { lintCopy, detectSentenceCase } from "../src/tools/lintCopy.ts";
import { generateFeedback, rewrite } from "../src/tools/generateFeedback.ts";
import { BrandConfigSchema, type BrandConfig } from "../src/config/schema.ts";

function brand(overrides: Partial<BrandConfig> = {}): BrandConfig {
  return BrandConfigSchema.parse({
    name: "test brand",
    voice: {
      sentence_case: true,
      forbidden_words: ["utilize"],
      preferred_words: { utilize: "use" },
      cta: { style: "verb_only", max_words: 3, require_capitalize: false },
      tone_markers: { forbid_exclamation: true, forbid_superlatives: true },
    },
    feedback: {
      tone: "constructive_direct",
      structure: ["summary", "violations", "suggestions", "rewrite"],
    },
    ...overrides,
  });
}

test("sentence case skips sentence-start words", () => {
  const detected = detectSentenceCase("Welcome to the platform.");
  assert.equal(detected.length, 0);
});

test("sentence case flags TitleCase words mid-sentence", () => {
  const detected = detectSentenceCase("This is a Title Case sentence.");
  assert.equal(detected.length, 2);
  assert.deepEqual(detected.map((d) => d.word), ["Title", "Case"]);
});

test("sentence case flags mid-sentence words across multiple sentences", () => {
  const detected = detectSentenceCase("Welcome. The Capital One. The Capital Two.");
  assert.equal(detected.length, 2);
  assert.deepEqual(detected.map((d) => d.word), ["Capital", "Capital"]);
});

test("forbidden words reports every occurrence", () => {
  const violations = lintCopy("utilize this, then utilize that.", brand());
  const fwViolations = violations.filter((v) => v.rule === "forbidden_words");
  assert.equal(fwViolations.length, 2);
  assert.equal(fwViolations[0].suggestion, "use");
});

test("cta verb_only flags multi-word CTAs but not single verbs", () => {
  const violations = lintCopy("Join us. Start today. Just Start.", brand());
  const ctaViolations = violations.filter((v) => v.rule === "cta_format");
  assert.equal(ctaViolations.length, 2);
  assert.ok(!ctaViolations.find((v) => v.message.includes("Just Start")));
});

test("cta verb_noun allows verb+object within max_words", () => {
  const overrides = { voice: { cta: { style: "verb_noun" as const, max_words: 3, require_capitalize: false } } };
  const violations = lintCopy("Get started. Learn more today.", brand(overrides));
  const ctaViolations = violations.filter((v) => v.rule === "cta_format");
  assert.equal(ctaViolations.length, 0);
});

test("cta verb_noun flags CTAs exceeding max_words", () => {
  const overrides = { voice: { cta: { style: "verb_noun" as const, max_words: 2, require_capitalize: false } } };
  const violations = lintCopy("Get started today.", brand(overrides));
  const ctaViolations = violations.filter((v) => v.rule === "cta_format");
  assert.equal(ctaViolations.length, 1);
});

test("cta require_capitalize flags lowercase CTAs regardless of style", () => {
  const overrides = { voice: { cta: { style: "free" as const, max_words: 3, require_capitalize: true } } };
  const violations = lintCopy("click here.", brand(overrides));
  const cap = violations.filter((v) => v.rule === "cta_capitalize");
  assert.equal(cap.length, 1);
});

test("cta free style skips CTA checks entirely", () => {
  const overrides = { voice: { cta: { style: "free" as const, max_words: 3, require_capitalize: false } } };
  const violations = lintCopy("join us today. learn more.", brand(overrides));
  assert.equal(violations.filter((v) => v.rule === "cta_format").length, 0);
});

test("exclamation marks are flagged at every occurrence", () => {
  const violations = lintCopy("Wow! Just wow! Amazing.", brand());
  const excl = violations.filter((v) => v.rule === "tone.no_exclamation");
  assert.equal(excl.length, 2);
});

test("superlatives are flagged", () => {
  const violations = lintCopy("Best in class. Fastest around.", brand());
  const sup = violations.filter((v) => v.rule === "tone.no_superlatives");
  assert.equal(sup.length, 2);
});

test("rewrite replaces forbidden words with preferred substitutions", () => {
  const out = rewrite("Please utilize this.", brand());
  assert.equal(out, "Please use this.");
});

test("rewrite removes exclamation marks", () => {
  const out = rewrite("Wow! Amazing!", brand());
  assert.equal(out, "Wow. Amazing.");
});

test("rewrite brackets superlatives", () => {
  const out = rewrite("This is the best.", brand());
  assert.equal(out, "This is the [best].");
});

test("rewrite shortens verb_only multi-word CTAs to single verb", () => {
  const out = rewrite("Join us today.", brand());
  assert.equal(out, "Join.");
});

test("rewrite shortens multiple adjacent CTAs independently", () => {
  const out = rewrite("Join us today. Click here.", brand());
  assert.equal(out, "Join. Click.");
});

test("rewrite lowercases sentence-case violations", () => {
  const out = rewrite("This is a Title Case sentence.", brand());
  assert.equal(out, "This is a title case sentence.");
});

test("rewrite respects disabled sentence_case config", () => {
  const overrides = { voice: { sentence_case: false } };
  const out = rewrite("This is a Title Case sentence.", brand(overrides));
  assert.equal(out, "This is a Title Case sentence.");
});

test("feedback summary varies by tone", () => {
  const draft = "Best in class!";
  const direct = generateFeedback(draft, null, brand({ feedback: { tone: "constructive_direct", structure: ["summary"] } }));
  const terse = generateFeedback(draft, null, brand({ feedback: { tone: "terse", structure: ["summary"] } }));
  const encouraging = generateFeedback(draft, null, brand({ feedback: { tone: "encouraging", structure: ["summary"] } }));
  assert.notEqual(direct.summary, terse.summary);
  assert.notEqual(direct.summary, encouraging.summary);
});

test("feedback only includes sections in structure", () => {
  const overrides = { feedback: { tone: "constructive_direct" as const, structure: ["violations"] as ("violations")[] } };
  const feedback = generateFeedback("Best!", null, brand(overrides));
  assert.ok(feedback.violations);
  assert.equal(feedback.summary, undefined);
  assert.equal(feedback.suggestions, undefined);
  assert.equal(feedback.rewrite, undefined);
});

test("clean copy produces empty violations across default rules", () => {
  const violations = lintCopy("just join.", brand());
  assert.equal(violations.length, 0);
});