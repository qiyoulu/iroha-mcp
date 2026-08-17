import { z } from "zod";

export const VoiceConfigSchema = z.object({
  sentence_case: z.boolean().default(true),
  proper_nouns: z.array(z.string()).default([]),
  forbidden_words: z.array(z.string()).default([]),
  preferred_words: z.record(z.string(), z.string()).default({}),
  cta: z
    .object({
      style: z.enum(["verb_only", "verb_noun", "free"]).default("verb_only"),
      max_words: z.number().int().positive().default(3),
      require_capitalize: z.boolean().default(false),
    })
    .default({}),
  tone_markers: z
    .object({
      forbid_exclamation: z.boolean().default(true),
      forbid_superlatives: z.boolean().default(false),
    })
    .default({}),
});

export const FeedbackConfigSchema = z.object({
  tone: z.enum(["constructive_direct", "encouraging", "terse"]).default("constructive_direct"),
  structure: z
    .array(z.enum(["summary", "violations", "suggestions", "rewrite"]))
    .default(["summary", "violations", "suggestions", "rewrite"]),
});

export const BrandConfigSchema = z.object({
  name: z.string(),
  voice: VoiceConfigSchema.default({}),
  feedback: FeedbackConfigSchema.default({}),
});

export type BrandConfig = z.infer<typeof BrandConfigSchema>;
export type VoiceConfig = z.infer<typeof VoiceConfigSchema>;
export type CtaStyle = z.infer<typeof VoiceConfigSchema>["cta"]["style"];
export type FeedbackTone = z.infer<typeof FeedbackConfigSchema>["tone"];
export type FeedbackSection = z.infer<typeof FeedbackConfigSchema>["structure"][number];