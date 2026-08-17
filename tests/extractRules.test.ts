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