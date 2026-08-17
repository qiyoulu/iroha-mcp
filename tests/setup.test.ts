import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSetup } from "../src/tools/setup.ts";
import { BrandConfigSchema } from "../src/config/schema.ts";

test("iroha_setup saves config when required fields are provided", () => {
  const dir = mkdtempSync(join(tmpdir(), "iroha-setup-"));
  try {
    const path = join(dir, "brand.config.json");
    const result = runSetup({
      name: "acme studio",
      target_path: path,
      sentence_case: false,
    });
    assert.equal(result.status, "saved");
    if (result.status !== "saved") return;
    assert.equal(result.path, path);
    assert.equal(result.config.name, "acme studio");
    assert.equal(result.config.voice.sentence_case, false);
    assert.equal(existsSync(path), true);
    const written = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(written.name, "acme studio");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("iroha_setup returns needs_input when name is missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "iroha-setup-"));
  try {
    const path = join(dir, "brand.config.json");
    const result = runSetup({
      target_path: path,
      sentence_case: false,
    });
    assert.equal(result.status, "needs_input");
    if (result.status !== "needs_input") return;
    assert.ok(result.missing_required.includes("name"));
    assert.equal(existsSync(path), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("iroha_setup merges with existing config on the same path", () => {
  const dir = mkdtempSync(join(tmpdir(), "iroha-setup-"));
  try {
    const path = join(dir, "brand.config.json");
    runSetup({
      name: "acme studio",
      target_path: path,
      sentence_case: false,
      forbidden_words: ["utilize"],
    });
    const second = runSetup({
      target_path: path,
      forbid_exclamation: false,
    });
    assert.equal(second.status, "saved");
    if (second.status !== "saved") return;
    assert.equal(second.config.name, "acme studio");
    assert.equal(second.config.voice.sentence_case, false);
    assert.deepEqual(second.config.voice.forbidden_words, ["utilize"]);
    assert.equal(second.config.voice.tone_markers.forbid_exclamation, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("iroha_setup validates written config against schema", () => {
  const dir = mkdtempSync(join(tmpdir(), "iroha-setup-"));
  try {
    const path = join(dir, "brand.config.json");
    const result = runSetup({
      name: "studio",
      target_path: path,
      cta_style: "verb_noun",
      cta_max_words: 2,
      feedback_tone: "encouraging",
    });
    assert.equal(result.status, "saved");
    if (result.status !== "saved") return;
    assert.equal(result.config.voice.cta.style, "verb_noun");
    assert.equal(result.config.voice.cta.max_words, 2);
    assert.equal(result.config.feedback.tone, "encouraging");
    const written = JSON.parse(readFileSync(path, "utf8"));
    BrandConfigSchema.parse(written);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});