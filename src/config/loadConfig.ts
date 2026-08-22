import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { BrandConfigSchema, type BrandConfig } from "./schema.js";

const DEFAULT_SEARCH_PATHS = ["./brand.config.json", "./.brandrc.json"];

function fallbackConfigPath(): string {
  return resolve(homedir(), ".config", "iroha-mcp", "brand.config.json");
}

const DEFAULT_BRAND_NAME = "your brand";

/**
 * Default config is loaded from `brand.config.example.json` at module init
 * and validated against the schema. The example file is the single source
 * of truth: editing it changes both the docs-facing scaffold and the
 * auto-written fallback in lockstep. Validation at load time catches drift
 * before it ships.
 */
function loadDefaultFromDisk(): BrandConfig {
  const here = dirname(fileURLToPath(import.meta.url));
  // dist/index.js → ../../brand.config.example.json ; src/config/loadConfig.ts → ../../brand.config.example.json
  const candidates = [
    resolve(here, "..", "..", "brand.config.example.json"),
    resolve(here, "..", "brand.config.example.json"),
    resolve(process.cwd(), "brand.config.example.json"),
  ];
  let lastErr: unknown;
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const raw = readFileSync(p, "utf8");
      return BrandConfigSchema.parse(JSON.parse(raw));
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(
    `iroha-mcp: could not load brand.config.example.json from any candidate path. ` +
      `expected it next to dist/ or at the repo root. last error: ${String(lastErr)}`
  );
}

const DEFAULT_CONFIG: BrandConfig = loadDefaultFromDisk();

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
      // unreachable today: tryParseAtPath throws on parse failure, never returns null.
      // kept as defense in depth if that contract ever changes.
      throw new Error(`brand config at ${abs} could not be loaded.`);
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
