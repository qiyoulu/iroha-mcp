# extracting rules from existing copy

a config is only useful if the rules come from somewhere real. this is the workflow for turning approved copy into a `brand.config.json`.

## the source

pick 30-50 pieces of approved copy. real examples that shipped — not aspirational ones. include variety: headlines, body, ctas, error messages. if your brand has different voices for different surfaces (e.g., marketing vs. support), sample each surface separately.

## what to look for

read each piece and ask:

1. **capitalization pattern.** are headlines title case or sentence case? does it hold across all the samples, or only some?
2. **forbidden words.** note every word you don't see. cross-reference with your style guide's "avoid" list. check recent edits — what gets flagged in review?
3. **preferred substitutions.** when the style guide says "use X instead of Y," those are direct mappings. don't invent ones the team hasn't agreed on.
4. **cta style.** are buttons "Join" or "Get started"? is there consistency? if the answer is "it varies by context," you're looking at `verb_noun` or `free`, not `verb_only`.
5. **tone markers.** exclamation marks: present, absent, occasional? superlatives ("best," "fastest," "most"): claimed or avoided?

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