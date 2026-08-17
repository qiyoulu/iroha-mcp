# schema walkthrough

every field in `brand.config.json`, what it does, when to enable, when to disable. blank scaffold at `brand.config.example.json` — copy that, fill what applies, leave the rest.

## `name`

your brand's display name. the lint tools use it in feedback ("violations against [name] rules") and in error messages.

set it. always.

## `voice`

the rules the lint engine checks against.

### `voice.sentence_case`

flag words that look like Title Case in headlines and body.

- enable when: your style guide says sentence case everywhere, or you want headlines to read like prose.
- disable when: title case is part of your brand identity (newspapers, formal publications, certain editorial brands).

a brand that uses title case by convention can still use iroha — just leave this off and rely on other rules.

### `voice.proper_nouns`

list of words allowed to appear capitalized mid-sentence. matched case-insensitively.

**when to enable:** any brand or product name that appears in mid-sentence copy. without this list, the tool will flag "iPhone" and "MacBook" as sentence-case violations.

**how to build the list:**

- run `extract_rules` against your approved copy — capitalized mid-sentence words that recur in 2+ samples are candidates.
- review the candidates manually. common English words ("Welcome" appearing as an opening) sometimes slip in.
- add brand names, product names, partner names, and any consistently capitalized technical terms.

**don't overload it.** every entry is a false-positive escape hatch. if your team is finding more workarounds than fixes, the sentence-case rule itself is probably too aggressive for your voice — disable it instead.

### `voice.forbidden_words`

list of words your copy should never contain. exact-match, case-insensitive.

**how to build the list:**

- run `extract_rules` with both `approved` and `rejected` samples — words in rejected that never appear in approved are candidates.
- read 50 examples of approved copy. note the words that never appear. those are candidates.
- check your existing style guide for any "avoid" or "do not use" entries.
- ask the team: what words do new writers always misuse?
- review recent edits — what gets flagged in review over and over?

**edge cases:**

- proper nouns (brand names, product names, partner names) — keep these out of the list. add them to `proper_nouns` instead. the tool can't tell "iPhone" from "iphone" the way a reader can.
- industry jargon you actually want to keep — case by case. don't blanket-ban technical terms.
- regional variants (color vs colour) — pick one and stick to it; don't add the other as forbidden.

**start small.** 5-10 words is a real starting point. expand as you discover more.

### `voice.preferred_words`

substitution map: `{ forbidden: replacement }`. when a forbidden word is detected, the suggestion comes from this map.

use when: your style guide has clear "use X instead of Y" rules. ("don't say 'utilize', say 'use'.")
skip when: your style guide only forbids without prescribing alternatives. let the writer find their own word.

### `voice.cta.style`

how strict to be about call-to-action phrasing.

- `verb_only` — single verb. "Join", "Start", "Get".
- `verb_noun` — verb + object. "Get started", "Learn more".
- `free` — no constraint.

**when to enable verb_only:** minimalist brands, "less is more" voice, brands where every CTA must be decisive and short.

**when to enable verb_noun:** brands with explanatory CTAs, products where the action needs context.

**when to enable free:** when no rule applies. most editorial and content-led brands end up here.

### `voice.cta.max_words`

cap on the word count of detected CTAs. only enforced when `style` is `verb_only` or `verb_noun`. `free` ignores it.

start at 3 for verb_only, 4 for verb_noun.

### `voice.cta.require_capitalize`

whether to flag CTAs that aren't title-cased ("join" vs "Join"). leave null unless you have a specific rule.

### `voice.tone_markers.forbid_exclamation`

flag any `!` in copy.

- enable: brands with restrained, professional voice. "!" reads as loud or casual.
- disable: brands with high-energy, friendly voice. consumer apps, kids' products, social-first brands.

### `voice.tone_markers.forbid_superlatives`

flag words like "best", "fastest", "simplest", "most", "#1".

- enable: brands that want to avoid making claims they can't back up. B2B, regulated industries.
- disable: brands where superlatives are part of differentiation. consumer products, competitive markets.

## `feedback`

how `generate_feedback` formats its response.

### `feedback.tone`

display tone for the feedback message.

- `constructive_direct` — explains what to fix and why.
- `encouraging` — softer, more supportive. for early-career teams or critique-averse cultures.
- `terse` — minimum words, just the violations. for senior teams who don't need the explanation.

### `feedback.structure`

ordered list of sections to include in the response.

options: `summary`, `violations`, `suggestions`, `rewrite`.

- include `rewrite` only if you want the tool to propose a corrected version. some brands prefer the human to do the rewrite — the tool just identifies the problem.
- omit `suggestions` if you find them noisy. violations alone tell the writer what's wrong; suggestions tell them what to do about it.

a typical setup: all four included, in order. adjust as you learn what your team actually reads.

## what this schema is not

- not a style guide. it's a machine-readable subset of one. the rules that fit lint patterns live here; everything else stays in your prose documentation.
- not exhaustive. iroha only checks what it has patterns for. brand voice includes rhythm, metaphor, tone-of-voice — those aren't in this config. they're in your team's judgment.
- not the source of truth. your brand.config.json should derive from your real style guide, not replace it.