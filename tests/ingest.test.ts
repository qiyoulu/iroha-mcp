import { test } from "node:test";
import assert from "node:assert/strict";
import { detectFormat, readSource } from "../src/ingest/sources.ts";
import { parseAndApply } from "../src/ingest/parse.ts";
import { runIngest } from "../src/tools/ingest.ts";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../src/config/loadConfig.ts";

test("detectFormat identifies w3c tokens JSON", () => {
  const raw = JSON.stringify({
    color: { primary: { $value: "#EF6F1A", $type: "color" } },
  });
  assert.equal(detectFormat(raw, "tokens.json"), "w3c-tokens");
});

test("detectFormat identifies tailwind config", () => {
  const raw = `module.exports = { theme: { extend: { colors: { primary: "#EF6F1A" } } } }`;
  assert.equal(detectFormat(raw, "tailwind.config.js"), "tailwind");
});

test("detectFormat identifies CSS :root block", () => {
  const raw = `:root { --color-primary: #EF6F1A; }`;
  assert.equal(detectFormat(raw, "tokens.css"), "css");
});

test("detectFormat identifies markdown", () => {
  const raw = `# Color Tokens\n\n| Token | Hex |\n| --color-primary | #EF6F1A |`;
  assert.equal(detectFormat(raw, "color.md"), "markdown");
});

test("readSource reads file from path", () => {
  const dir = mkdtempSync(join(tmpdir(), "iroha-ingest-"));
  try {
    const path = join(dir, "tokens.css");
    writeFileSync(path, `:root { --color-primary: #EF6F1A; --space-4: 16px; }`);
    const source = readSource({ path });
    assert.equal(source.format, "css");
    assert.equal(source.identifier, path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readSource uses inline content when no path", () => {
  const source = readSource({
    content: `:root { --color-primary: #EF6F1A; }`,
    format_hint: "css",
  });
  assert.equal(source.format, "css");
  assert.equal(source.identifier, "<inline>");
});

test("parseAndApply extracts w3c color tokens", () => {
  const raw = JSON.stringify({
    color: {
      primary: { $value: "#EF6F1A", $type: "color" },
      background: { $value: "#FAF7F3", $type: "color" },
    },
  });
  const config = { ...DEFAULT_CONFIG };
  const result = parseAndApply(
    { format: "w3c-tokens", raw, identifier: "<test>" },
    config
  );
  assert.ok(result.applied_paths.includes("color.primary"));
  assert.ok(result.applied_paths.includes("color.background"));
  assert.equal(config.tokens?.color?.primary, "#EF6F1A");
});

test("parseAndApply extracts tailwind color tokens", () => {
  const raw = `module.exports = { theme: { extend: { colors: { primary: "#EF6F1A", bg: "#FAF7F3" }, spacing: { 4: "16px", 8: "32px" } } } }`;
  const config = { ...DEFAULT_CONFIG };
  const result = parseAndApply(
    { format: "tailwind", raw, identifier: "<test>" },
    config
  );
  assert.ok(result.applied_paths.length >= 4);
  assert.equal(config.tokens?.color?.primary, "#EF6F1A");
});

test("parseAndApply extracts CSS :root tokens", () => {
  const raw = `:root { --color-primary: #EF6F1A; --space-4: 16px; --font-primary: 'Inter'; }`;
  const config = { ...DEFAULT_CONFIG };
  const result = parseAndApply(
    { format: "css", raw, identifier: "<test>" },
    config
  );
  assert.ok(result.applied_paths.includes("color.primary"));
  assert.ok(result.applied_paths.includes("dimension.space-4"));
  assert.ok(result.applied_paths.includes("typography.primary"));
});

test("parseAndApply extracts color tokens from markdown table", () => {
  const raw = `# Color Tokens\n\n| Token | Hex |\n| --color-primary | #EF6F1A |\n| --color-bg | #FAF7F3 |`;
  const config = { ...DEFAULT_CONFIG };
  const result = parseAndApply(
    { format: "markdown", raw, identifier: "<test>" },
    config
  );
  assert.ok(result.applied_paths.length >= 2);
});

test("parseAndApply extracts typography from markdown CSS block", () => {
  const raw = `# Typography Tokens\n\n\`\`\`css\n:root {\n  --font-primary: 'Work Sans';\n  --text-1x: 1rem;\n}\n\`\`\``;
  const config = { ...DEFAULT_CONFIG };
  const result = parseAndApply(
    { format: "markdown", raw, identifier: "<test>" },
    config
  );
  assert.ok(result.applied_paths.some((p) => p.startsWith("typography.")));
});

test("parseAndApply extracts voice principles from markdown", () => {
  const raw = `# Brand Voice\n\n## Core Attributes\n\n1. Direct and unhedged\n2. Grounded in physical reality\n3. Warm but never soft`;
  const config = { ...DEFAULT_CONFIG };
  const result = parseAndApply(
    { format: "markdown", raw, identifier: "<test>" },
    config
  );
  assert.equal(config.copy?.voice?.principles.length, 3);
});

test("parseAndApply extracts components from markdown headings", () => {
  const raw = `# UI Components\n\n## Buttons\n\nPrimary button\n\n## Cards\n\nStandard card\n\n## Inputs\n\nBottom-border style`;
  const config = { ...DEFAULT_CONFIG };
  const result = parseAndApply(
    { format: "markdown", raw, identifier: "<test>" },
    config
  );
  assert.ok((config.components?.inventory.length ?? 0) >= 3);
});

test("runIngest returns needs_input when brand_name is missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "iroha-ingest-"));
  try {
    const path = join(dir, "brand.config.json");
    const result = runIngest({
      sources: [
        {
          content: `:root { --color-primary: #EF6F1A; }`,
          format_hint: "css",
        },
      ],
      target_path: path,
    });
    assert.equal(result.status, "needs_input");
    assert.ok(result.missing_required?.includes("name"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("runIngest writes config and returns saved", () => {
  const dir = mkdtempSync(join(tmpdir(), "iroha-ingest-"));
  try {
    const path = join(dir, "brand.config.json");
    const result = runIngest({
      sources: [
        {
          content: `:root { --color-primary: #EF6F1A; --color-bg: #FAF7F3; --space-4: 16px; }`,
          format_hint: "css",
        },
      ],
      brand_name: "acme studio",
      target_path: path,
    });
    assert.equal(result.status, "saved");
    assert.equal(existsSync(path), true);
    const written = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(written.name, "acme studio");
    assert.equal(written.tokens.color.primary, "#EF6F1A");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("runIngest aggregates contributions across multiple sources", () => {
  const dir = mkdtempSync(join(tmpdir(), "iroha-ingest-"));
  try {
    const path = join(dir, "brand.config.json");
    const result = runIngest({
      sources: [
        {
          content: `:root { --color-primary: #EF6F1A; --color-bg: #FAF7F3; }`,
          format_hint: "css",
        },
        {
          content: `# Brand Voice\n\n## Core Attributes\n\n1. Direct\n2. Grounded`,
          format_hint: "markdown",
        },
      ],
      brand_name: "acme studio",
      target_path: path,
    });
    assert.equal(result.status, "saved");
    assert.ok(result.contributions.length >= 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("parseAndApply resolves w3c curly-brace references", () => {
  const raw = JSON.stringify({
    color: {
      base: {
        blue: { 6: { $value: "#0070f3", $type: "color" } },
      },
      brand: {
        primary: { $value: "{color.base.blue.6}", $type: "color" },
      },
    },
  });
  const config = { ...DEFAULT_CONFIG };
  parseAndApply({ format: "w3c-tokens", raw, identifier: "<test>" }, config);
  assert.equal(config.tokens?.color?.primary, "#0070f3");
});

test("parseAndApply resolves nested w3c references", () => {
  const raw = JSON.stringify({
    color: {
      base: { raw: { $value: "#0070f3", $type: "color" } },
      brand: { primary: { $value: "{color.base.raw}", $type: "color" } },
      link: { $value: "{color.brand.primary}", $type: "color" },
    },
  });
  const config = { ...DEFAULT_CONFIG };
  parseAndApply({ format: "w3c-tokens", raw, identifier: "<test>" }, config);
  assert.equal(config.tokens?.color?.primary, "#0070f3");
  assert.equal(config.tokens?.color?.link, "#0070f3");
});

test("parseAndApply reports unresolved references without crashing", () => {
  const raw = JSON.stringify({
    color: {
      brand: {
        primary: { $value: "{color.nonexistent.thing}", $type: "color" },
      },
    },
  });
  const config = { ...DEFAULT_CONFIG };
  const result = parseAndApply({ format: "w3c-tokens", raw, identifier: "<test>" }, config);
  assert.ok(result.unresolved.some((u) => u.includes("color.brand.primary")));
});

test("parseAndApply detects cycles and reports them", () => {
  const raw = JSON.stringify({
    color: {
      a: { $value: "{color.b}", $type: "color" },
      b: { $value: "{color.a}", $type: "color" },
    },
  });
  const config = { ...DEFAULT_CONFIG };
  const result = parseAndApply({ format: "w3c-tokens", raw, identifier: "<test>" }, config);
  assert.ok(result.unresolved.length >= 1);
});