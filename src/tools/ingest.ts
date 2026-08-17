import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  BrandConfigSchema,
  type BrandConfig,
} from "../config/schema.js";
import { DEFAULT_CONFIG, fallbackConfigPath, tryParseAtPath } from "../config/loadConfig.js";
import { readSource, type IngestSource } from "../ingest/sources.js";
import { parseAndApply, type ParsedContribution } from "../ingest/parse.js";

export type IngestInput = {
  sources: IngestSource[];
  brand_name?: string;
  target_path?: string;
};

export type IngestResult = {
  status: "saved" | "needs_input";
  path?: string;
  config?: BrandConfig;
  contributions: ParsedContribution[];
  total_applied: number;
  total_unresolved: number;
  missing_required?: string[];
};

export function runIngest(input: IngestInput): IngestResult {
  const targetArg = input.target_path;
  const targetPath = resolve(targetArg || fallbackConfigPath());

  let config: BrandConfig = structuredClone(DEFAULT_CONFIG);
  if (existsSync(targetPath)) {
    const parsed = tryParseAtPath(targetPath);
    if (parsed) config = parsed;
  }

  const contributions: ParsedContribution[] = [];
  for (const source of input.sources) {
    const recognized = readSource(source);
    const contribution = parseAndApply(recognized, config);
    contributions.push(contribution);
  }

  if (input.brand_name) {
    config.name = input.brand_name;
  }

  const missingRequired: string[] = [];
  if (!config.name || config.name === "" || config.name === "your brand") {
    missingRequired.push("name");
  }
  const hasAnyTokens = contributions.some((c) => c.extracted_summary.token_count);
  if (!hasAnyTokens) {
    missingRequired.push("tokens (no token data ingested — pass paths to w3c tokens, tailwind config, or css :root)");
  }

  if (missingRequired.length > 0) {
    return {
      status: "needs_input",
      contributions,
      total_applied: contributions.reduce((s, c) => s + c.applied_paths.length, 0),
      total_unresolved: contributions.reduce((s, c) => s + c.unresolved.length, 0),
      missing_required: missingRequired,
      config,
    };
  }

  const validated = BrandConfigSchema.parse(config);

  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, JSON.stringify(validated, null, 2) + "\n", "utf8");

  return {
    status: "saved",
    path: targetPath,
    config: validated,
    contributions,
    total_applied: contributions.reduce((s, c) => s + c.applied_paths.length, 0),
    total_unresolved: contributions.reduce((s, c) => s + c.unresolved.length, 0),
  };
}