# forbidden words and substitutions

the `forbidden_words` list is the most-used field in a brand config. building it well takes more care than it looks.

## what goes on the list

words your copy should never contain. three categories:

1. **explicit style guide entries.** "don't say 'utilize,' say 'use.'" if your guide already has this, copy it verbatim.
2. **repeated review flags.** the words new writers misuse. track these for two months, then add the recurring ones.
3. **claims you can't back up.** words like "best," "fastest," "leading" — unless you have proof, they erode trust. if you have a `forbid_superlatives` rule, the related terms often go here too.

## what doesn't go on the list

- **proper nouns.** brand names, product names, partner names. the tool can't distinguish "iPhone" from "iphone" the way a reader can.
- **industry jargon you actually want.** if "throughput" is the right word, don't ban it because a junior writer used it badly once.
- **regional variants.** pick "color" or "colour." don't add the other as forbidden.
- **words you just don't like.** taste isn't a rule. if a word is technically fine but off-brand, that's a different conversation.

## substitutions

`preferred_words` is a map: `{ forbidden: replacement }`. the replacement is the suggestion the tool offers when it catches the forbidden word.

rules:

- only add a substitution if your style guide already prescribes one. if it doesn't, leave the suggestion generic ("choose a different word") and let the writer decide.
- one substitution per forbidden word. if "robust" can be "strong" or "dependable," that's a writing choice, not a config choice.
- substitutions are case-insensitive on the lookup, case-preserving in the output. "Use" maps to "use" the same as "use" does.

## start small

5-10 entries is a real starting point. expand as you discover more. a 200-entry list will produce 200 false positives and train your team to ignore the tool.

## governance

when a writer wants to add or remove a word, the change goes through review — same as adding a feature. the config is a product surface, not a scratchpad.