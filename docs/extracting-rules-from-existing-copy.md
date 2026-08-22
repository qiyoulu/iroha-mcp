# extracting rules from existing copy

a config is only useful if the rules come from somewhere real. this is the workflow for turning approved copy and CSS into a `brand.config.json` using `extract_rules` as the analysis tool.

## the source

pick 30-50 pieces of approved copy. real examples that shipped — not aspirational ones. include variety: headlines, body, ctas, error messages. if your brand has different voices for different surfaces (e.g., marketing vs. support), sample each surface separately.

for the CSS side, pull 5-10 representative snippets from your actual stylesheets or component libraries. these feed the palette, font-family, spacing scale, and radius scale suggestions.

## the workflow

`extract_rules` is an analysis tool. it does not write a config. it returns candidate values for each config field, plus per-field `notes` explaining what was found. you review the suggestions, accept or modify them, then pass the accepted values to `iroha_setup` to write the config.

```ts
// step 1: extract candidates
const candidates = await extractRules({
  approved: ["Join 200,000+ builders.", "Get the playbook.", ...],
  rejected: ["Unlock the magic!", "Our revolutionary platform..."],
  approved_css: [":root { --color-primary: #EF6F1A; ... }", ...],
});

// step 2: review candidates.notes — they explain WHY each value was suggested.
// step 3: pass accepted values to iroha_setup
await irohaSetup({
  name: "your brand",
  sentence_case: candidates.suggestions.sentence_case,
  proper_nouns: candidates.suggestions.proper_nouns,
  forbidden_words: candidates.suggestions.forbidden_words,
  cta_style: candidates.suggestions.cta_style,
  ...
});
```

## what gets extracted (and how)

`extract_rules` analyzes your samples and suggests values for these config fields. each is independent — a small sample size for one field doesn't break the others, but the suggestion will be marked accordingly.

### copy-derived suggestions

| field | what it looks at | threshold | example |
| --- | --- | --- | --- |
| `sentence_case` | proportion of sentence-case vs. title-case sentences across approved samples | majority vote per sentence; >50% sentence-case wins | `false` if your headlines are mostly Title Case, `true` if mostly sentence case |
| `proper_nouns` | capitalized mid-sentence words recurring in 2+ samples | frequency >= 2 | `["Skillit", "Slack", "iPhone"]` — brand names that appear capitalized in body copy |
| `forbidden_words` | words in `rejected` samples that don't appear in `approved` samples | presence in rejected, absence in approved | `["revolutionary", "magic", "unlock"]` — empty if you don't pass `rejected` |
| `forbid_exclamation` | count of `!` across approved samples | 0 = `true`, any = `false` | `true` if no `!` ever appears in approved copy |
| `forbid_superlatives` | count of superlative patterns (`best`, `fastest`, `simplest`, `greatest`, `most`, `ultimate`, `#1`) | 0 = `true`, any = `false` | `true` if no superlatives ever appear |
| `cta_style` | verb phrases in approved samples | `verb_only` if >=70% are single verbs; `verb_noun` if avg <=2.5 words; `free` otherwise | `verb_only` for "Join", "Start"; `verb_noun` for "Get started", "Learn more"; `free` for varied phrasings |

### CSS-derived suggestions

| field | what it looks at | limit | example |
| --- | --- | --- | --- |
| `palette` | hex colors in `approved_css`, ranked by frequency, with names assigned by position | top 16 | `{"primary": "#EF6F1A", "secondary": "...", "background": "#FAF7F3", ...}` |
| `font_family` | `font-family` declarations, first entry of the stack | all unique values | `["Inter", "JetBrains Mono"]` |
| `spacing_scale` | dimension values from `padding`, `margin`, `gap`, `top`, `left`, `right`, `bottom` properties (excludes `border-radius`) | all unique, sorted by frequency | `["8px", "16px", "24px", "32px"]` |
| `radius_scale` | `border-radius` values | all unique, sorted by frequency | `["4px", "8px", "9999px"]` |

### the `notes` field

every suggestion has a corresponding note explaining what was found. read these — they're the audit trail.

```ts
candidates.notes.sentence_case
// "12 sentence-case / 3 title-case across 28 sentences."

candidates.notes.proper_nouns
// "5 candidate(s) (appearing in 2+ samples)."

candidates.notes.forbidden_words
// "no candidates (rejected words all appear in approved)."
// or: "no rejected samples provided — cannot suggest."

candidates.notes.palette
// "8 candidate colors extracted, top: #EF6F1A, #FAF7F3, #232F36."

candidates.notes.spacing
// "12 dimension values; most-used: 16px, 8px, 24px, 32px."
```

## what to look for

read each piece and ask:

1. **capitalization pattern.** are headlines title case or sentence case? does it hold across all the samples, or only some?
2. **forbidden words.** note every word you don't see. cross-reference with your style guide's "avoid" list. check recent edits — what gets flagged in review?
3. **preferred substitutions.** when the style guide says "use X instead of Y," those are direct mappings. don't invent ones the team hasn't agreed on.
4. **cta style.** are buttons "Join" or "Get started"? is there consistency? if the answer is "it varies by context," you're looking at `verb_noun` or `free`, not `verb_only`.
5. **tone markers.** exclamation marks: present, absent, occasional? superlatives ("best," "fastest," "most"): claimed or avoided?
6. **palette.** do the suggested names (primary, secondary, background, surface, foreground, muted, border) actually match how you'd describe each color? or did the auto-naming get it wrong?
7. **spacing/radius scale.** are the top values a real scale (8, 16, 24, 32) or scattered (4, 12, 17, 23)? scattered values suggest ad-hoc design decisions; might be worth a design system pass before locking the config.

## the output

each observation becomes a config field. don't enable rules you can't defend with examples. a config with three rules and a name is more useful than a config with twenty rules and no justification.

## the loop

once the config exists:

1. run `lint_copy` against the same approved samples.
2. expect zero violations. if you get any, either the rule is wrong or the sample isn't actually approved.
3. run `lint_copy` against a draft in progress. expect useful violations — the kind a human reviewer would catch.
4. when the tool flags something a human wouldn't, the rule is too aggressive. loosen it.
5. when the tool misses something a human would catch, the rule is too loose. tighten it, or add a new rule.

this loop runs forever. the config evolves with the brand.

## edge cases

- **small sample (<10 pieces).** suggestions are weak signals. extract more before trusting them.
- **one-off CTAs that don't fit the pattern.** add them to `proper_nouns` only if they appear in body copy, not just in CTA buttons.
- **CSS with `var()` references.** `extract_rules` skips `var(--*)` values for palette/font-family/radius, so you'll get the *referenced* values only if you also pass the `:root` block.
- **mixed-voice brands (marketing vs. support).** run `extract_rules` twice with separate samples per voice. you'll get two distinct configs. merge carefully — don't average across voices.
