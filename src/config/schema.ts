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

export const SeveritySchema = z.enum(["error", "warning", "info"]);

export const CopyRuleSchema = z.object({
  id: z.string(),
  description: z.string(),
  severity: SeveritySchema.default("warning"),
  match: z.object({
    terms: z.array(z.string()).optional(),
    regex: z.string().optional(),
    case_insensitive: z.boolean().default(true),
    stemming: z.boolean().default(false),
  }),
  suggestion: z.string().optional(),
  contexts: z.array(z.string()).optional(),
});

export const ChannelSchema = z.enum([
  "website",
  "app",
  "email",
  "comms",
  "pr",
  "linkedin",
  "docs",
  "error",
  "marketing",
]);

export const CopyConfigSchema = z.object({
  voice: z
    .object({
      principles: z.array(z.string()).default([]),
      axes: z
        .object({
          formality: z.number().min(1).max(5).optional(),
          warmth: z.number().min(1).max(5).optional(),
          jargon: z.number().min(1).max(5).optional(),
        })
        .optional(),
    })
    .default({ principles: [] }),
  rules: z.array(CopyRuleSchema).default([]),
  ctas: z
    .array(
      z.object({
        verb: z.string(),
        allowedContexts: z.array(z.string()).optional(),
      })
    )
    .default([]),
  ctaLocks: z
    .array(
      z.object({
        term: z.string(),
        locked: z.boolean().default(true),
        replaces: z.array(z.string()).default([]),
      })
    )
    .default([]),
  terminology: z
    .array(
      z.object({
        preferred: z.string(),
        avoid: z.array(z.string()),
      })
    )
    .default([]),
  perChannel: z
    .array(
      z.object({
        channel: ChannelSchema,
        rules: z.array(CopyRuleSchema).default([]),
      })
    )
    .default([]),
});

export const ColorTokenSchema = z.union([
  z.string(),
  z.object({
    name: z.string().optional(),
    value: z.string(),
    role: z
      .enum([
        "background",
        "surface",
        "foreground",
        "primary",
        "secondary",
        "warning",
        "error",
        "success",
        "info",
        "link",
        "neutral",
      ])
      .optional(),
    surface: z.enum(["fg", "bg", "border"]).optional(),
    variant: z.enum(["muted", "emphasis", "on_emphasis"]).optional(),
    contrastOn: z.array(z.string()).optional(),
    deprecated: z.boolean().default(false),
  }),
]);

export const TypographyCompositeSchema = z.object({
  fontFamily: z.union([z.string(), z.array(z.string())]).optional(),
  fontSize: z.union([z.string(), z.number()]).optional(),
  fontWeight: z.union([z.string(), z.number()]).optional(),
  letterSpacing: z.union([z.string(), z.number()]).optional(),
  lineHeight: z.union([z.string(), z.number()]).optional(),
});

export const ShadowCompositeSchema = z.object({
  color: z.string().optional(),
  offsetX: z.union([z.string(), z.number()]).optional(),
  offsetY: z.union([z.string(), z.number()]).optional(),
  blur: z.union([z.string(), z.number()]).optional(),
  spread: z.union([z.string(), z.number()]).optional(),
  inset: z.boolean().optional(),
});

export const BorderCompositeSchema = z.object({
  color: z.string().optional(),
  width: z.union([z.string(), z.number()]).optional(),
  style: z.string().optional(),
});

export const TransitionCompositeSchema = z.object({
  duration: z.union([z.string(), z.number()]).optional(),
  delay: z.union([z.string(), z.number()]).optional(),
  timingFunction: z.string().optional(),
});

export const GradientCompositeSchema = z.object({
  stops: z.array(z.object({
    color: z.string(),
    position: z.number().min(0).max(1),
  })).optional(),
  angle: z.number().optional(),
});

export const ColorComponentsSchema = z.object({
  colorSpace: z.string().optional(),
  components: z.array(z.number()).optional(),
  alpha: z.number().optional(),
  hex: z.string().optional(),
});

export const DimensionComponentsSchema = z.object({
  value: z.number().optional(),
  unit: z.string().optional(),
});

export const ModeOverrideSchema = z.object({
  name: z.string(),
  selector: z.string().optional(),
    tokenOverrides: z
    .object({
      color: z.record(z.string(), z.union([z.string(), ColorTokenSchema, ColorComponentsSchema])).optional(),
      typography: z.record(z.string(), z.union([z.string(), TypographyCompositeSchema])).optional(),
      dimension: z.record(z.string(), z.union([z.string(), DimensionComponentsSchema])).optional(),
      shadow: z
        .record(z.string(), z.union([z.string(), ShadowCompositeSchema, z.array(ShadowCompositeSchema)]))
        .optional(),
      border: z.record(z.string(), z.union([z.string(), BorderCompositeSchema])).optional(),
      transition: z.record(z.string(), z.union([z.string(), TransitionCompositeSchema])).optional(),
      gradient: z.record(z.string(), z.union([z.string(), GradientCompositeSchema])).optional(),
      breakpoint: z.record(z.string(), z.number()).optional(),
    })
    .optional(),
});

export const TokensSchema = z
  .object({
    color: z.record(z.string(), z.union([z.string(), ColorTokenSchema, ColorComponentsSchema])).optional(),
    typography: z
      .record(z.string(), z.union([z.string(), TypographyCompositeSchema]))
      .optional(),
    dimension: z
      .record(z.string(), z.union([z.string(), DimensionComponentsSchema]))
      .optional(),
    shadow: z
      .record(z.string(), z.union([z.string(), ShadowCompositeSchema, z.array(ShadowCompositeSchema)]))
      .optional(),
    border: z.record(z.string(), z.union([z.string(), BorderCompositeSchema])).optional(),
    transition: z.record(z.string(), z.union([z.string(), TransitionCompositeSchema])).optional(),
    gradient: z.record(z.string(), z.union([z.string(), GradientCompositeSchema])).optional(),
    breakpoint: z.record(z.string(), z.number()).optional(),
    modes: z.array(ModeOverrideSchema).optional(),
  })
  .default({});

export const LogoVariantSchema = z.object({
  variant: z.string(),
  file: z.string(),
  clearSpace: z.string().optional(),
  minSize: z.string().optional(),
  darkBgSafe: z.boolean().default(true),
});

export const AssetsSchema = z
  .object({
    logos: z.array(LogoVariantSchema).default([]),
    icons: z
      .object({
        set: z.string(),
        style: z.enum(["solid", "outline", "duotone", "filled-outline"]),
        sizes: z.array(z.string()).default([]),
      })
      .optional(),
    fonts: z
      .array(
        z.object({
          family: z.string(),
          weights: z.array(z.number()).default([]),
          files: z
            .array(
              z.object({
                weight: z.number(),
                format: z.string(),
                url: z.string(),
              })
            )
            .default([]),
        })
      )
      .default([]),
  })
  .default({ logos: [], fonts: [] });

export const ComponentsSchema = z
  .object({
    inventory: z
      .array(
        z.object({
          name: z.string(),
          category: z.enum([
            "actions",
            "forms",
            "layout",
            "feedback",
            "overlays",
            "media",
            "typography-content",
          ]),
          description: z.string().default(""),
        })
      )
      .default([]),
  })
  .default({ inventory: [] });

export const PatternsSchema = z
  .object({
    scenarios: z
      .array(
        z.object({
          name: z.string(),
          template: z.string(),
          allowedLength: z.number().int().positive().optional(),
          wrong: z.array(z.string()).default([]),
          right: z.array(z.string()).default([]),
        })
      )
      .default([]),
  })
  .default({ scenarios: [] });

export const AccessibilitySchema = z
  .object({
    contrast: z
      .object({
        minimum: z.number().default(4.5),
        prefer: z.enum(["APCA", "WCAG2"]).default("WCAG2"),
      })
      .default({}),
    focusRing: z
      .object({
        color: z.string().default("primary"),
        width: z.string().default("2px"),
        offset: z.string().default("2px"),
      })
      .default({}),
    minHitTarget: z.string().default("44px"),
    colorAloneBanned: z.boolean().default(true),
    shapeSignalRequired: z.boolean().default(true),
  })
  .default({});

export const I18nSchema = z
  .object({
    defaultLocale: z.string().default("en-US"),
    supported: z.array(z.string()).default([]),
    doNotTranslate: z.array(z.string()).default([]),
    glossary: z
      .array(
        z.object({
          term: z.string(),
          translation: z.string(),
          prefer: z.boolean().default(false),
        })
      )
      .default([]),
  })
  .default({});

export const MetaSchema = z
  .object({
    source: z
      .enum([
        "w3c-tokens",
        "tailwind",
        "css",
        "markdown",
        "figma",
        "styledictionary",
        "polaris",
        "primer",
        "manual",
        "mixed",
      ])
      .default("manual"),
    ingestionDate: z.string().optional(),
    schemaVersion: z.string().default("0.3.0"),
  })
  .default({});

export const BrandConfigSchema = z.object({
  name: z.string(),
  version: z.string().default("0.3.0"),
  meta: MetaSchema.optional(),
  voice: VoiceConfigSchema.optional(),
  feedback: FeedbackConfigSchema.optional(),
  tokens: TokensSchema.optional(),
  copy: CopyConfigSchema.optional(),
  assets: AssetsSchema.optional(),
  components: ComponentsSchema.optional(),
  patterns: PatternsSchema.optional(),
  accessibility: AccessibilitySchema.optional(),
  i18n: I18nSchema.optional(),
});

export type BrandConfig = z.infer<typeof BrandConfigSchema>;
export type VoiceConfig = z.infer<typeof VoiceConfigSchema>;
export type FeedbackConfig = z.infer<typeof FeedbackConfigSchema>;
export type CopyConfig = z.infer<typeof CopyConfigSchema>;
export type CopyRule = z.infer<typeof CopyRuleSchema>;
export type Tokens = z.infer<typeof TokensSchema>;
export type ModeOverride = z.infer<typeof ModeOverrideSchema>;
export type TypographyComposite = z.infer<typeof TypographyCompositeSchema>;
export type ShadowComposite = z.infer<typeof ShadowCompositeSchema>;
export type BorderComposite = z.infer<typeof BorderCompositeSchema>;
export type TransitionComposite = z.infer<typeof TransitionCompositeSchema>;
export type GradientComposite = z.infer<typeof GradientCompositeSchema>;
export type ColorComponents = z.infer<typeof ColorComponentsSchema>;
export type DimensionComponents = z.infer<typeof DimensionComponentsSchema>;
export type Assets = z.infer<typeof AssetsSchema>;
export type Components = z.infer<typeof ComponentsSchema>;
export type Patterns = z.infer<typeof PatternsSchema>;
export type Accessibility = z.infer<typeof AccessibilitySchema>;
export type I18n = z.infer<typeof I18nSchema>;
export type Meta = z.infer<typeof MetaSchema>;
export type CtaStyle = VoiceConfig["cta"]["style"];
export type FeedbackTone = FeedbackConfig["tone"];
export type FeedbackSection = FeedbackConfig["structure"][number];
export type Severity = z.infer<typeof SeveritySchema>;
export type Channel = z.infer<typeof ChannelSchema>;
