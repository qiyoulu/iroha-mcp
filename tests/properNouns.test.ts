import { test } from "node:test";
import assert from "node:assert/strict";
import { lintCopy } from "../src/tools/lintCopy.ts";
import { BrandConfigSchema } from "../src/config/schema.ts";

function brand(overrides: Record<string, unknown> = {}): ReturnType<typeof BrandConfigSchema.parse> {
  return BrandConfigSchema.parse({
    name: "test brand",
    voice: {
      sentence_case: true,
      proper_nouns: [],
      forbidden_words: [],
      preferred_words: {},
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

test("proper_nouns allowlist skips allowed mid-sentence capitals", () => {
  const config = brand({
    voice: { proper_nouns: ["MacBook", "iPhone"] },
  });
  const violations = lintCopy("This MacBook runs iPhone apps.", config);
  const sentenceCase = violations.filter((v) => v.rule === "sentence_case");
  assert.equal(sentenceCase.length, 0);
});

test("proper_nouns are matched case-insensitively", () => {
  const config = brand({
    voice: { proper_nouns: ["macbook"] },
  });
  const violations = lintCopy("The MacBook runs well.", config);
  const sentenceCase = violations.filter((v) => v.rule === "sentence_case");
  assert.equal(sentenceCase.length, 0);
});

test("non-allowed mid-sentence capitals still flagged when allowlist present", () => {
  const config = brand({
    voice: { proper_nouns: ["MacBook"] },
  });
  const violations = lintCopy("The MacBook runs Randomly.", config);
  const sentenceCase = violations.filter((v) => v.rule === "sentence_case");
  assert.equal(sentenceCase.length, 1);
  assert.equal(sentenceCase[0].message.includes("Randomly"), true);
});

test("rewrite preserves proper_nouns", async () => {
  const config = brand({
    voice: { proper_nouns: ["MacBook"] },
  });
  const { rewrite } = await import("../src/tools/generateFeedback.ts");
  const out = rewrite("The MacBook runs Randomly.", config);
  assert.equal(out, "The MacBook runs randomly.");
});