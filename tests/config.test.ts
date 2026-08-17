import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBrandConfig, DEFAULT_CONFIG } from "../src/config/loadConfig.ts";

test("loadBrandConfig returns explicit config when path exists", () => {
  const dir = mkdtempSync(join(tmpdir(), "iroha-test-"));
  try {
    const path = join(dir, "brand.config.json");
    writeFileSync(path, JSON.stringify({ name: "studio", voice: {}, feedback: {} }));
    const result = loadBrandConfig(path);
    assert.equal(result.isDefault, false);
    assert.equal(result.config.name, "studio");
    assert.equal(result.configPath, path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadBrandConfig throws when explicit path is missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "iroha-test-"));
  try {
    const path = join(dir, "does-not-exist.json");
    assert.throws(() => loadBrandConfig(path), /not found/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadBrandConfig throws on malformed JSON with helpful message", () => {
  const dir = mkdtempSync(join(tmpdir(), "iroha-test-"));
  try {
    const path = join(dir, "brand.config.json");
    writeFileSync(path, "{not json");
    assert.throws(() => loadBrandConfig(path), /not valid JSON/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadBrandConfig throws on schema violation", () => {
  const dir = mkdtempSync(join(tmpdir(), "iroha-test-"));
  try {
    const path = join(dir, "brand.config.json");
    writeFileSync(path, JSON.stringify({ name: 123 }));
    assert.throws(() => loadBrandConfig(path), /schema validation/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadBrandConfig auto-creates default when no config exists", () => {
  const dir = mkdtempSync(join(tmpdir(), "iroha-test-"));
  try {
    process.env.HOME = dir;
    process.env.USERPROFILE = dir;
    const fallback = join(dir, ".config", "iroha-mcp", "brand.config.json");

    const result = loadBrandConfig();
    assert.equal(result.isDefault, true);
    assert.equal(result.configPath, fallback);
    assert.equal(existsSync(fallback), true);
    const written = JSON.parse(readFileSync(fallback, "utf8"));
    assert.equal(written.name, DEFAULT_CONFIG.name);
    assert.equal(result.config.name, "your brand");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});