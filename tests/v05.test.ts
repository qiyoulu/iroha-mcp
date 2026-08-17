import { test } from "node:test";
import assert from "node:assert/strict";
import { detectFormat } from "../src/ingest/sources.ts";
import { parseAndApply } from "../src/ingest/parse.ts";
import { DEFAULT_CONFIG } from "../src/config/loadConfig.ts";

test("detectFormat identifies json5 as w3c-tokens", () => {
  const raw = `{
    color: {
      primary: { $value: "#EF6F1A", $type: 'color' }, // comment
    },
  }`;
  assert.equal(detectFormat(raw, "tokens.json5"), "w3c-tokens");
});

test("parseAndApply parses json5 with unquoted keys and comments", () => {
  const raw = `{
    color: {
      primary: { $value: "#EF6F1A", $type: 'color' }, // trailing comment
      background: { $value: "#FAF7F3", $type: "color" },
    },
  }`;
  const config = { ...DEFAULT_CONFIG };
  const result = parseAndApply(
    { format: "w3c-tokens", raw, identifier: "<json5>" },
    config
  );
  assert.ok(result.applied_paths.includes("color.primary"));
  assert.equal(config.tokens?.color?.primary, "#EF6F1A");
  assert.equal(config.tokens?.color?.background, "#FAF7F3");
});

test("parseAndApply unwraps base wrapper and rewrites base refs", () => {
  const raw = `{
    base: {
      color: {
        white: { $value: "#ffffff", $type: "color" },
        neutral: { "0": { $value: "{base.color.white}", $type: "color" } },
      },
    },
  }`;
  const config = { ...DEFAULT_CONFIG };
  const result = parseAndApply(
    { format: "w3c-tokens", raw, identifier: "<base-wrapper>" },
    config
  );
  assert.equal(result.unresolved.length, 0);
  assert.equal(config.tokens?.color?.white, "#ffffff");
});

test("parseAndApply resolves composite color objects to hex", () => {
  const raw = JSON.stringify({
    color: {
      brand: {
        $value: {
          colorSpace: "hsl",
          components: [15, 100, 50],
          hex: "#ef6f1a",
        },
        $type: "color",
      },
    },
  });
  const config = { ...DEFAULT_CONFIG };
  const result = parseAndApply(
    { format: "w3c-tokens", raw, identifier: "<composite>" },
    config
  );
  assert.ok(result.applied_paths.includes("color.brand"));
  assert.equal(config.tokens?.color?.brand, "#ef6f1a");
});

test("parseAndApply resolves dimension objects", () => {
  const raw = JSON.stringify({
    dimension: {
      "space-4": { $value: { value: 16, unit: "px" }, $type: "dimension" },
    },
  });
  const config = { ...DEFAULT_CONFIG };
  const result = parseAndApply(
    { format: "w3c-tokens", raw, identifier: "<dimension>" },
    config
  );
  assert.equal(config.tokens?.dimension?.["space-4"], "16px");
});

test("parseAndApply parses polaris flat props/aliases format", () => {
  const raw = JSON.stringify({
    aliases: {
      "color-purple": { value: "rgb(156, 106, 222)" },
      "color-purple-text": { value: "rgb(80, 73, 90)" },
    },
    props: {
      "color-purple": {
        type: "color",
        category: "background-color",
        name: "color-purple",
        value: "rgb(156, 106, 222)",
        originalValue: "{!color-purple}",
      },
      "color-purple-text": {
        type: "color",
        category: "text-color",
        name: "color-purple-text",
        value: "rgb(80, 73, 90)",
        originalValue: "{!color-purple-text}",
      },
    },
  });
  const config = { ...DEFAULT_CONFIG };
  const result = parseAndApply(
    { format: "w3c-tokens", raw, identifier: "<polaris>" },
    config
  );
  assert.equal(result.unresolved.length, 0);
  assert.ok(result.applied_paths.includes("color.purple"));
  assert.ok(result.applied_paths.includes("color.purple-text"));
  assert.equal(config.tokens?.color?.purple, "rgb(156, 106, 222)");
  assert.equal(config.tokens?.color?.["purple-text"], "rgb(80, 73, 90)");
  assert.equal(config.meta?.source, "polaris");
});

test("parseAndApply maps time type to transition bucket", () => {
  const raw = JSON.stringify({
    duration: {
      fast: { $value: "100ms", $type: "time" },
      slow: { $value: "300ms", $type: "time" },
    },
  });
  const config = { ...DEFAULT_CONFIG };
  const result = parseAndApply(
    { format: "w3c-tokens", raw, identifier: "<time>" },
    config
  );
  assert.ok(result.applied_paths.includes("transition.fast"));
  assert.equal(config.tokens?.transition?.fast, "100ms");
});

test("parseAndApply skips primer figma extensions but resolves references", () => {
  const raw = `{
    base: {
      color: {
        brand: { $value: "{base.color.white}", $type: "color", $extensions: { "org.primer.figma": { collection: "base/color/light" } } },
        white: { $value: "#ffffff", $type: "color" },
      },
    },
  }`;
  const config = { ...DEFAULT_CONFIG };
  const result = parseAndApply(
    { format: "w3c-tokens", raw, identifier: "<extensions>" },
    config
  );
  assert.equal(result.unresolved.length, 0);
  assert.equal(config.tokens?.color?.brand, "#ffffff");
});