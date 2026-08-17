import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { BrandConfigSchema, type BrandConfig } from "./schema.js";

const DEFAULT_SEARCH_PATHS = ["./brand.config.json", "./.brandrc.json"];

function fallbackConfigPath(): string {
  return resolve(homedir(), ".config", "iroha-mcp", "brand.config.json");
}

const DEFAULT_BRAND_NAME = "your brand";

const DEFAULT_CONFIG: BrandConfig = {
  name: DEFAULT_BRAND_NAME,
  voice: {
    sentence_case: true,
    proper_nouns: [],
    forbidden_words: [],
    preferred_words: {},
    cta: {
      style: "free",
      max_words: 3,
      require_capitalize: false,
    },
    tone_markers: {
      forbid_exclamation: true,
      forbid_superlatives: true,
    },
  },
  feedback: {
    tone: "constructive_direct",
    structure: ["summary", "violations", "suggestions", "rewrite"],
  },
};

export type LoadResult = {
  config: BrandConfig;
  isDefault: boolean;
  configPath: string;
};

function writeDefaultConfig(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n", "utf8");
}

function tryParseAtPath(absPath: string): BrandConfig | null {
  if (!existsSync(absPath)) return null;
  const raw = readFileSync(absPath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `brand config at ${absPath} is not valid JSON: ${(err as Error).message}`
    );
  }
  try {
    return BrandConfigSchema.parse(parsed);
  } catch (err) {
    throw new Error(
      `brand config at ${absPath} failed schema validation: ${(err as Error).message}`
    );
  }
}

export function loadBrandConfig(explicitPath?: string): LoadResult {
  if (explicitPath) {
    const abs = resolve(explicitPath);
    if (!existsSync(abs)) {
      throw new Error(
        `brand config not found at ${abs}. check the path or remove brand_config_path to auto-create a default.`
      );
    }
    const config = tryParseAtPath(abs);
    if (!config) {
      throw new Error(`brand config not found at ${abs}.`);
    }
    return { config, isDefault: false, configPath: abs };
  }

  for (const p of DEFAULT_SEARCH_PATHS) {
    const abs = resolve(p);
    const config = tryParseAtPath(abs);
    if (config) {
      return { config, isDefault: false, configPath: abs };
    }
  }

  const fallbackPath = fallbackConfigPath();
  const fallback = tryParseAtPath(fallbackPath);
  if (fallback) {
    return { config: fallback, isDefault: false, configPath: fallbackPath };
  }

  writeDefaultConfig(fallbackPath);
  return {
    config: DEFAULT_CONFIG,
    isDefault: true,
    configPath: fallbackPath,
  };
}

export { DEFAULT_CONFIG, DEFAULT_BRAND_NAME, DEFAULT_SEARCH_PATHS, fallbackConfigPath, tryParseAtPath };