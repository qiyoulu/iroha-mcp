import { test } from "node:test";
import assert from "node:assert/strict";
import { lintDesign } from "../src/config/tokens.ts";
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
        surface: "#FFFFFF",
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

test("jsx snippet with raw hex fails hard_token_reference", () => {
  const brand_ = brand();
  const snippet = `<Button style={{ background: '#ff00ff', color: '#000000' }}>Click</Button>`;
  const violations = lintDesign({ snippet, brand: brand_ });
  const offPalette = violations.filter((v) => v.rule === "hard_token_reference");
  assert.equal(offPalette.length, 2);
});

test("jsx with token references passes", () => {
  const brand_ = brand();
  const snippet = `<Button style={{ background: 'var(--color-primary)', color: 'var(--color-background)' }}>Click</Button>`;
  const violations = lintDesign({ snippet, brand: brand_ });
  assert.equal(violations.filter((v) => v.rule === "hard_token_reference").length, 0);
});

test("tailwind classes referencing off-palette colors are flagged", () => {
  const brand_ = brand();
  const snippet = `<div class="bg-red-500 text-pink-200">hello</div>`;
  const violations = lintDesign({ snippet, brand: brand_ });
  const offPalette = violations.filter((v) => v.rule === "hard_token_reference");
  assert.ok(offPalette.length >= 1);
});

test("large tailwind classes pass when no scale restriction applies", () => {
  const brand_ = brand();
  const snippet = `<div class="p-4 m-8">hello</div>`;
  const violations = lintDesign({ snippet, brand: brand_ });
  assert.equal(violations.filter((v) => v.rule === "scale_adherence").length, 0);
});

test("css with scale violation flags specific px values", () => {
  const brand_ = brand();
  const snippet = `.box { padding: 7px; margin: 13px; gap: 24px; }`;
  const violations = lintDesign({ snippet, brand: brand_ });
  const offScale = violations.filter((v) => v.rule === "scale_adherence");
  assert.equal(offScale.length, 3);
});

test("snippet with no violations returns empty array", () => {
  const brand_ = brand();
  const snippet = `.button { background: var(--color-primary); color: var(--color-background); padding: 16px; }`;
  const violations = lintDesign({ snippet, brand: brand_ });
  assert.equal(violations.length, 0);
});

test("rule_severity can downgrade errors to warnings", () => {
  const brand_ = brand();
  const snippet = `.button { background: #ff0000; }`;
  const violations = lintDesign({
    snippet,
    brand: brand_,
    rule_severity: { hard_token_reference: "warning" },
  });
  const offPalette = violations.filter((v) => v.rule === "hard_token_reference");
  assert.equal(offPalette.length, 1);
  assert.equal(offPalette[0].severity, "warning");
});

test("rule_severity can silence a rule to info", () => {
  const brand_ = brand();
  const snippet = `.button { padding: 7px; }`;
  const violations = lintDesign({
    snippet,
    brand: brand_,
    rule_severity: { scale_adherence: "info" },
  });
  const offScale = violations.filter((v) => v.rule === "scale_adherence");
  assert.equal(offScale[0].severity, "info");
});