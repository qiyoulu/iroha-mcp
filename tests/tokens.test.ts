import { test } from "node:test";
import assert from "node:assert/strict";
import { computeContrast, flattenColorHexes, flattenDimensionScale, lintDesign } from "../src/config/tokens.ts";
import { BrandConfigSchema } from "../src/config/schema.ts";

function brand(overrides: Record<string, unknown> = {}): ReturnType<typeof BrandConfigSchema.parse> {
  return BrandConfigSchema.parse({
    name: "test",
    version: "0.3.0",
    tokens: {
      color: {
        primary: "#EF6F1A",
        background: "#FAF7F3",
        foreground: "#232F36",
      },
      dimension: {
        "space-1": "4px",
        "space-2": "8px",
        "space-4": "16px",
        "space-8": "32px",
      },
    },
    accessibility: {
      contrast: { minimum: 4.5, prefer: "WCAG2" },
      focusRing: { color: "primary", width: "2px", offset: "2px" },
      minHitTarget: "44px",
      colorAloneBanned: true,
      shapeSignalRequired: true,
    },
    ...overrides,
  });
}

test("computeContrast returns known WCAG ratio for black on white", () => {
  const ratio = computeContrast("#000000", "#FFFFFF");
  assert.ok(ratio !== null);
  assert.ok(Math.abs((ratio as number) - 21) < 0.1);
});

test("computeContrast returns 1 for identical colors", () => {
  const ratio = computeContrast("#FAF7F3", "#FAF7F3");
  assert.ok(ratio !== null);
  assert.ok(Math.abs((ratio as number) - 1) < 0.01);
});

test("flattenColorHexes returns lowercased hex values", () => {
  const brand_ = brand();
  const hexes = flattenColorHexes(brand_.tokens);
  assert.ok(hexes.includes("#ef6f1a"));
  assert.ok(hexes.includes("#faf7f3"));
  assert.ok(hexes.includes("#232f36"));
});

test("flattenDimensionScale returns px values", () => {
  const brand_ = brand();
  const scale = flattenDimensionScale(brand_.tokens);
  assert.ok(scale.includes(4));
  assert.ok(scale.includes(8));
  assert.ok(scale.includes(16));
  assert.ok(scale.includes(32));
});

test("lintDesign flags hex values not in the palette", () => {
  const brand_ = brand();
  const snippet = `.button { background: #ff0000; color: #ffffff; }`;
  const violations = lintDesign({ snippet, brand: brand_ });
  const offPalette = violations.filter((v) => v.rule === "hard_token_reference");
  assert.equal(offPalette.length, 2);
  assert.equal(offPalette[0].severity, "error");
});

test("lintDesign allows hex values that are in the palette", () => {
  const brand_ = brand();
  const snippet = `.button { background: #EF6F1A; color: #FAF7F3; }`;
  const violations = lintDesign({ snippet, brand: brand_ });
  const offPalette = violations.filter((v) => v.rule === "hard_token_reference");
  assert.equal(offPalette.length, 0);
});

test("lintDesign flags rgb/rgba even though it could match by accident", () => {
  const brand_ = brand();
  const snippet = `.button { background: rgba(255, 0, 0, 0.5); }`;
  const violations = lintDesign({ snippet, brand: brand_ });
  const rgb = violations.filter((v) => v.message.includes("rgba"));
  assert.equal(rgb.length, 1);
});

test("lintDesign flags off-scale dimensions", () => {
  const brand_ = brand();
  const snippet = `.button { padding: 7px; margin: 13px; }`;
  const violations = lintDesign({ snippet, brand: brand_ });
  const offScale = violations.filter((v) => v.rule === "scale_adherence");
  assert.equal(offScale.length, 2);
});

test("lintDesign allows scale-aligned dimensions", () => {
  const brand_ = brand();
  const snippet = `.button { padding: 8px; margin: 16px; }`;
  const violations = lintDesign({ snippet, brand: brand_ });
  const offScale = violations.filter((v) => v.rule === "scale_adherence");
  assert.equal(offScale.length, 0);
});

test("lintDesign flags fg/bg pairs below contrast minimum", () => {
  const brand_ = brand({
    tokens: {
      color: {
        primary: "#EF6F1A",
        background: "#FAF7F3",
        foreground: "#FAF7F3",
      },
    },
  });
  const snippet = `color: var(--color-foreground); background-color: var(--color-background);`;
  const violations = lintDesign({ snippet, brand: brand_ });
  const contrast = violations.filter((v) => v.rule === "contrast");
  assert.ok(contrast.length >= 1);
});

test("lintDesign respects rule_severity override", () => {
  const brand_ = brand();
  const snippet = `.button { background: #ff0000; }`;
  const violations = lintDesign({
    snippet,
    brand: brand_,
    rule_severity: { hard_token_reference: "info" },
  });
  const offPalette = violations.filter((v) => v.rule === "hard_token_reference");
  assert.equal(offPalette.length, 1);
  assert.equal(offPalette[0].severity, "info");
});

test("lintDesign returns no violations when tokens are absent", () => {
  const brand_ = brand({
    tokens: {},
  });
  const snippet = `.button { background: #ff0000; padding: 7px; }`;
  const violations = lintDesign({ snippet, brand: brand_ });
  assert.equal(violations.length, 0);
});

test("lintDesign warns when mode is missing base color tokens", () => {
  const brand_ = brand({
    tokens: {
      color: {
        primary: "#EF6F1A",
        background: "#FAF7F3",
        foreground: "#232F36",
      },
      modes: [
        {
          name: "dark",
          selector: ".dark",
          tokenOverrides: {
            color: {
              primary: "#5B9DFF",
            },
          },
        },
      ],
    },
  });
  const snippet = `<div class="dark">content</div>`;
  const violations = lintDesign({ snippet, brand: brand_ });
  const coverage = violations.filter((v) => v.rule === "mode_coverage");
  assert.ok(coverage.length >= 1);
  assert.equal(coverage[0].severity, "warning");
});

test("lintDesign passes mode coverage when all base tokens are overridden", () => {
  const brand_ = brand({
    tokens: {
      color: {
        primary: "#EF6F1A",
        background: "#FAF7F3",
      },
      modes: [
        {
          name: "dark",
          selector: ".dark",
          tokenOverrides: {
            color: {
              primary: "#5B9DFF",
              background: "#0a0a0a",
            },
          },
        },
      ],
    },
  });
  const snippet = `<div></div>`;
  const violations = lintDesign({ snippet, brand: brand_ });
  const coverage = violations.filter((v) => v.rule === "mode_coverage");
  assert.equal(coverage.length, 0);
});