import { test } from "node:test";
import assert from "node:assert/strict";
import { extractRules } from "../src/tools/extractRules.ts";

test("extract_rules returns sample size", () => {
  const result = extractRules({
    approved: ["Welcome to the platform."],
  });
  assert.equal(result.sample_size.approved, 1);
  assert.equal(result.sample_size.rejected, 0);
});

test("extract_rules detects sentence-case-only approved copy", () => {
  const result = extractRules({
    approved: [
      "Welcome to the platform.",
      "Get started today with ease.",
      "Read more about our story.",
    ],
  });
  assert.equal(result.suggestions.sentence_case, true);
});

test("extract_rules detects title-case-heavy copy", () => {
  const result = extractRules({
    approved: [
      "Welcome To The Platform.",
      "Get Started Today With Ease.",
      "Read More About Our Story.",
    ],
  });
  assert.equal(result.suggestions.sentence_case, false);
});

test("extract_rules extracts proper_noun candidates from recurring capitals", () => {
  const result = extractRules({
    approved: [
      "Our MacBook Pro is fast.",
      "The MacBook Pro runs cool.",
      "We love the MacBook Pro.",
    ],
  });
  assert.ok(result.suggestions.proper_nouns.includes("macbook"));
  assert.ok(result.suggestions.proper_nouns.includes("pro"));
});

test("extract_rules suggests forbid_exclamation when no ! in approved", () => {
  const result = extractRules({
    approved: ["Welcome.", "Get started.", "Read more."],
  });
  assert.equal(result.suggestions.forbid_exclamation, true);
});

test("extract_rules suggests allow exclamation when present", () => {
  const result = extractRules({
    approved: ["Welcome!", "Get started today!", "Just join!"],
  });
  assert.equal(result.suggestions.forbid_exclamation, false);
});

test("extract_rules extracts forbidden candidates from rejected vs approved", () => {
  const result = extractRules({
    approved: ["Welcome to the platform.", "Get started with ease."],
    rejected: ["Welcome to our world-class robust platform.", "Get robust started."],
  });
  assert.ok(result.suggestions.forbidden_words.includes("world-class"));
  assert.ok(result.suggestions.forbidden_words.includes("robust"));
});

test("extract_rules returns empty forbidden candidates without rejected samples", () => {
  const result = extractRules({
    approved: ["Welcome."],
  });
  assert.deepEqual(result.suggestions.forbidden_words, []);
  assert.match(result.notes.forbidden_words, /no rejected samples/);
});

test("extract_rules observes verb_only CTA style", () => {
  const result = extractRules({
    approved: ["Welcome. Join. Start. Get. Build."],
  });
  assert.equal(result.suggestions.cta_style, "verb_only");
});

test("extract_rules observes verb_noun CTA style", () => {
  const result = extractRules({
    approved: ["Welcome. Get started. Learn more. Read more. Try today."],
  });
  assert.equal(result.suggestions.cta_style, "verb_noun");
});

test("extract_rules returns notes for every suggestion", () => {
  const result = extractRules({
    approved: ["Welcome to the platform."],
    rejected: ["Welcome to our world-class platform."],
  });
  assert.ok(result.notes.sentence_case.length > 0);
  assert.ok(result.notes.proper_nouns.length > 0);
  assert.ok(result.notes.forbidden_words.length > 0);
  assert.ok(result.notes.exclamation.length > 0);
  assert.ok(result.notes.superlatives.length > 0);
  assert.ok(result.notes.cta_style.length > 0);
});

test("extract_rules extracts palette from approved_css", () => {
  const result = extractRules({
    approved: [],
    approved_css: [
      `.btn { background: #EF6F1A; color: #FAF7F3; padding: 16px; }`,
      `.btn:hover { background: #EF6F1A; }`,
      `.card { background: #FFFFFF; padding: 24px; }`,
    ],
  });
  assert.ok(result.suggestions.palette);
  assert.ok(result.suggestions.palette?.primary === "#EF6F1A" || result.suggestions.palette?.primary === "#ef6f1a");
  assert.ok(result.notes.palette?.includes("candidate"));
});

test("extract_rules extracts font family from approved_css", () => {
  const result = extractRules({
    approved: [],
    approved_css: [
      `body { font-family: "Inter", sans-serif; }`,
      `h1 { font-family: "Inter", system-ui; }`,
    ],
  });
  assert.deepEqual(result.suggestions.font_family?.slice(0, 1), ["Inter"]);
});

test("extract_rules extracts spacing scale from padding/margin", () => {
  const result = extractRules({
    approved: [],
    approved_css: [
      `.btn { padding: 8px 16px; margin: 4px; }`,
      `.card { padding: 24px; margin: 16px; }`,
      `.hero { padding: 48px; margin: 32px; }`,
    ],
  });
  assert.ok(result.suggestions.spacing_scale);
  assert.ok(result.suggestions.spacing_scale?.includes("8px"));
  assert.ok(result.suggestions.spacing_scale?.includes("16px"));
});

test("extract_rules excludes border-radius values from spacing scale", () => {
  const result = extractRules({
    approved: [],
    approved_css: [
      `.btn { padding: 8px 16px; border-radius: 9999px; }`,
      `.btn-lg { padding: 16px 32px; border-radius: 4px; }`,
      `.card { padding: 24px; border-radius: 8px; }`,
    ],
  });
  assert.ok(result.suggestions.spacing_scale);
  assert.ok(result.suggestions.spacing_scale?.includes("8px"));
  assert.ok(result.suggestions.spacing_scale?.includes("16px"));
  assert.ok(!result.suggestions.spacing_scale?.includes("9999px"));
  assert.ok(!result.suggestions.spacing_scale?.includes("4px"));
});

test("extract_rules extracts radius scale", () => {
  const result = extractRules({
    approved: [],
    approved_css: [
      `.btn { border-radius: 4px; }`,
      `.btn-lg { border-radius: 9999px; }`,
      `.card { border-radius: 8px; }`,
    ],
  });
  assert.ok(result.suggestions.radius_scale);
  assert.ok(result.suggestions.radius_scale?.includes("4px"));
});

test("extract_rules filters palette by rejected_css", () => {
  const result = extractRules({
    approved: [],
    approved_css: [
      `.btn { background: #EF6F1A; color: #FAF7F3; }`,
    ],
    rejected_css: [
      `.old-btn { background: #ff0000; color: #ff0000; }`,
    ],
  });
  assert.ok(result.suggestions.palette);
  assert.ok(!Object.values(result.suggestions.palette).includes("#ff0000"));
});