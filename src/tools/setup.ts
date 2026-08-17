import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  BrandConfigSchema,
  type BrandConfig,
  type CtaStyle,
  type FeedbackTone,
  type FeedbackSection,
} from "../config/schema.js";
import { DEFAULT_CONFIG, DEFAULT_BRAND_NAME, fallbackConfigPath, tryParseAtPath } from "../config/loadConfig.js";

export type SetupArgs = {
  name?: string;
  proper_nouns?: string[];
  sentence_case?: boolean;
  forbidden_words?: string[];
  preferred_words?: Record<string, string>;
  cta_style?: CtaStyle;
  cta_max_words?: number;
  cta_require_capitalize?: boolean;
  forbid_exclamation?: boolean;
  forbid_superlatives?: boolean;
  feedback_tone?: FeedbackTone;
  feedback_structure?: FeedbackSection[];
  target_path?: string;
};

function buildConfigFromArgs(base: BrandConfig, args: Record<string, unknown>): BrandConfig {
  const a = args as Partial<SetupArgs>;
  return {
    name: a.name ?? base.name,
    voice: {
      sentence_case: a.sentence_case ?? base.voice.sentence_case,
      proper_nouns: a.proper_nouns ?? base.voice.proper_nouns,
      forbidden_words: a.forbidden_words ?? base.voice.forbidden_words,
      preferred_words: a.preferred_words ?? base.voice.preferred_words,
      cta: {
        style: a.cta_style ?? base.voice.cta.style,
        max_words: a.cta_max_words ?? base.voice.cta.max_words,
        require_capitalize:
          a.cta_require_capitalize ?? base.voice.cta.require_capitalize,
      },
      tone_markers: {
        forbid_exclamation: a.forbid_exclamation ?? base.voice.tone_markers.forbid_exclamation,
        forbid_superlatives: a.forbid_superlatives ?? base.voice.tone_markers.forbid_superlatives,
      },
    },
    feedback: {
      tone: a.feedback_tone ?? base.feedback.tone,
      structure: a.feedback_structure ?? base.feedback.structure,
    },
  };
}

export type SetupResult =
  | { status: "saved"; path: string; config: BrandConfig }
  | { status: "needs_input"; missing_required: string[]; questions: string[]; partial: BrandConfig };

export function runSetup(args: Record<string, unknown>): SetupResult {
  const targetArg = args.target_path as string | undefined;
  const targetPath = resolve(targetArg || fallbackConfigPath());

  let base: BrandConfig = DEFAULT_CONFIG;
  if (existsSync(targetPath)) {
    const parsed = tryParseAtPath(targetPath);
    if (parsed) base = parsed;
  }

  const a = args as Partial<SetupArgs>;
  const explicitlyNamed = typeof a.name === "string" && a.name.trim().length > 0;
  const baseHasRealName =
    !!base.name && base.name !== DEFAULT_BRAND_NAME && base.name.trim().length > 0;
  const effectiveName = explicitlyNamed ? (a.name as string).trim() : baseHasRealName ? base.name : null;

  const merged: BrandConfig = {
    ...base,
    ...buildConfigFromArgs(base, args),
    name: effectiveName ?? base.name,
  };

  const missingRequired: string[] = [];
  if (!explicitlyNamed && !baseHasRealName) {
    missingRequired.push("name");
  }

  if (missingRequired.length > 0) {
    return {
      status: "needs_input",
      missing_required: missingRequired,
      questions: missingRequired.map(
        (f) => `what is the brand's ${f}? (free-text answer)`
      ),
      partial: merged,
    };
  }

  const validated = BrandConfigSchema.parse(merged);

  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, JSON.stringify(validated, null, 2) + "\n", "utf8");

  return { status: "saved", path: targetPath, config: validated };
}