# cta styles in practice

`voice.cta.style` controls how strictly the tool enforces call-to-action phrasing. three modes, three different jobs.

## `verb_only`

single verb. "Join." "Start." "Get."

**when to use:** minimalist brands, decisive CTAs, brands where every word on a button costs money (mobile, dense UIs). the discipline of a single verb forces the action to be the loudest thing on the page.

**the trade-off:** you lose context. "Join" is shorter than "Join the newsletter," but the user has to infer what they're joining. for high-intent surfaces (signup, checkout) this is fine. for low-intent surfaces (footer, secondary nav) it can feel abrupt.

**the rule:** enable when your brand's voice says less is more, and your CTAs already tend toward single verbs.

## `verb_noun`

verb + object. "Get started." "Learn more." "Read the guide."

**when to use:** explanatory CTAs, products where the action needs context, surfaces where the user might not know what "Join" or "Start" actually does. common in B2B and content-led brands.

**the trade-off:** slightly longer, slightly less punchy. but the user knows what they're getting.

**the rule:** set `max_words` based on your shortest real CTAs. if your buttons are usually 2 words ("Get started"), max_words of 2 is right. if some are 3 ("Start free trial"), bump it to 3.

## `free`

no constraint. the tool won't flag CTAs at all.

**when to use:** content-led brands, editorial surfaces, anywhere the CTA varies by context and a hard rule would be more friction than help. most editorial and content sites end up here.

**the trade-off:** you lose the lint signal. but if your CTAs are already inconsistent on purpose, enforcing consistency is the wrong move.

**the rule:** when in doubt, start at `free`. tighten to `verb_noun` if you find yourself wanting consistency. tighten further to `verb_only` only if your voice genuinely demands it.

## `require_capitalize`

independent of style. when true, the tool flags any CTA that doesn't start with a capital letter.

enable when: your buttons are sentence-cased and you want the discipline enforced.
disable when: you have lowercase brand treatments, or the capitalization is handled at the design layer.

## choosing

there's no formula. pick based on what your real CTAs look like today. if they're already single verbs, `verb_only` is just codification. if they're already inconsistent, `free` is honest. the tool should match your practice, not override it.