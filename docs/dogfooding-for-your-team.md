# dogfooding for your team

iroha is most useful when the team that writes the copy also uses the tool. here's how to roll it out without it becoming friction.

## the principle

start with the rules your team already agrees on. codify them in the config. run the tool against approved copy — expect zero violations. once that holds, point it at drafts.

if the tool flags something a human reviewer would also flag, the rule is right. if it flags something a human wouldn't, the rule is wrong. loosen it. if it misses something a human would catch, the rule is incomplete. tighten it.

this loop runs forever. the config is a living document.

## the rollout

**week 1.** the brand designer (or whoever owns voice) writes the config. start with 3-5 rules, not 20. name them. enable them. ship.

**week 2.** one writer uses the tool on their drafts. expect friction. expect false positives. expect "this rule is wrong." that's the data. capture every disagreement.

**week 3.** review the disagreements. adjust the config. rules that produce more false positives than real ones get weakened or removed. rules that produce nothing at all get enabled or deleted. the config converges toward what your team actually thinks.

**week 4+.** expand. the next writer, the next surface, the next brand. each expansion is its own loop.

## what to measure

not violations per draft. that's a vanity metric that incentivizes weakening the rules.

measure:

- **review time per draft.** does the tool shorten the back-and-forth between writer and reviewer?
- **reviewer-flag-to-tool-flag overlap.** when the reviewer flags something, did the tool flag it too? when the tool flags something, does the reviewer agree?
- **new-rule requests.** when writers ask for a new rule, what problem were they trying to solve? that's a feature request for the config schema.

## what not to do

- **don't gate publishing on zero violations.** some drafts need to violate rules. a marketing announcement may need a superlative. the tool informs, it doesn't approve.
- **don't add rules to punish.** if a rule exists primarily to catch one writer's habit, that's a 1:1 conversation, not a config entry.
- **don't let the config grow without review.** every new rule is a maintenance burden. require the same review for config changes as for code changes.

## governance

the config is a shared artifact. it needs an owner. usually that's the brand designer or a designated voice lead. their job:

- review rule-add and rule-remove requests
- run the loop on disagreements
- keep the docs in sync (schema-walkthrough.md, the tutorials here)
- evolve the config as the brand evolves

without an owner, the config rots. rules become outdated. writers ignore it. the tool becomes noise.