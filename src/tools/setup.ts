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

/**
 * `Object.prototype.hasOwnProperty.call(args, key)` distinguishes "key present
 * with falsy value" from "key absent". The previous `??` operator treated both
 * the same, which meant passing `feedback_structure: []` to clear the list was
 * silently dropped. With this check, explicit empty values are preserved.
 */
function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function buildConfigFromArgs(base: BrandConfig, args: Record<string, unknown>): BrandConfig {
  const a = args as Partial<SetupArgs>;
  const baseVoice = base.voice ?? {
    sentence_case: false,
    proper_nouns: [],
    forbidden_words: [],
    preferred_words: {},
    cta: { style: "free" as const, max_words: 3, require_capitalize: false },
    tone_markers: { forbid_exclamation: false, forbid_superlatives: false },
  };
  const baseFeedback = base.feedback ?? {
    tone: "constructive_direct" as const,
    structure: ["summary", "violations", "suggestions", "rewrite"] as const,
  };
  return {
    ...base,
    name: hasOwn(args, "name") ? a.name ?? base.name : base.name,
    version: base.version ?? "0.3.0",
    voice: {
      ...baseVoice,
      sentence_case: hasOwn(args, "sentence_case") ? a.sentence_case ?? baseVoice.sentence_case : baseVoice.sentence_case,
      proper_nouns: hasOwn(args, "proper_nouns") ? a.proper_nouns ?? baseVoice.proper_nouns : baseVoice.proper_nouns,
      forbidden_words: hasOwn(args, "forbidden_words") ? a.forbidden_words ?? baseVoice.forbidden_words : baseVoice.forbidden_words,
      preferred_words: hasOwn(args, "preferred_words") ? a.preferred_words ?? baseVoice.preferred_words : baseVoice.preferred_words,
      cta: {
        style: hasOwn(args, "cta_style") ? a.cta_style ?? baseVoice.cta.style : baseVoice.cta.style,
        max_words: hasOwn(args, "cta_max_words") ? a.cta_max_words ?? baseVoice.cta.max_words : baseVoice.cta.max_words,
        require_capitalize: hasOwn(args, "cta_require_capitalize")
          ? a.cta_require_capitalize ?? baseVoice.cta.require_capitalize
          : baseVoice.cta.require_capitalize,
      },
      tone_markers: {
        forbid_exclamation: hasOwn(args, "forbid_exclamation")
          ? a.forbid_exclamation ?? baseVoice.tone_markers.forbid_exclamation
          : baseVoice.tone_markers.forbid_exclamation,
        forbid_superlatives: hasOwn(args, "forbid_superlatives")
          ? a.forbid_superlatives ?? baseVoice.tone_markers.forbid_superlatives
          : baseVoice.tone_markers.forbid_superlatives,
      },
    },
    feedback: {
      tone: hasOwn(args, "feedback_tone") ? a.feedback_tone ?? baseFeedback.tone : baseFeedback.tone,
      structure: hasOwn(args, "feedback_structure")
        ? a.feedback_structure ?? []
        : [...baseFeedback.structure],
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