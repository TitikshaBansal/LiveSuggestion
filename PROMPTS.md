# Prompt Iteration Log

This file tracks changes to the three default prompts in `lib/prompts.ts`. Each entry notes what was tested, what failed, and what changed.

## Live Suggestions Prompt

### v1 — initial
- 5-type taxonomy from assignment spec
- Anti-repetition via PREVIOUS_SUGGESTIONS
- "Specific to this conversation" quality bar

**Tested against:** a mock interview ("walk me through your thinking process for designing a load balancer")

**Failure modes observed:**
1. Card 1 generated first-person content ("When I start a new design, I first clarify goals...") — fabricating the user's own workflow. Dangerous in an interview context.
2. All three cards were generic best-practice advice — no specific numbers, no named systems, no real incidents. Compared against the reference prototype, which surfaces cards like "Discord shards by guild ID, ~150k users per shard," v1 felt soft.
3. Specificity rule was too easy to satisfy — the model interpreted "specific to this conversation" as "mention the topic that was discussed" rather than "reference specific external facts."

### v2
**Changes:**
- Added explicit "YOU ARE NOT THE USER" block forbidding fabricated autobiographical content. Distinguishes between factual first-person grammar (allowed) and fabricated personal experience (not allowed).
- Replaced the soft specificity rule with a concrete **specificity test**: "If the preview could be pasted into a different conversation on the same topic and still fit, it's too generic."
- Added BAD/GOOD example pairs to anchor what ammunition vs. framework means.
- Reframed the mission from "useful suggestions" to "ammunition" to shift the model's default from scaffolding to specifics.

**Defaults retained from assignment spec:**
- Exactly 3 cards per batch
- 5 suggestion types (exact vocabulary from brief)
- 30s refresh cycle
- Recency-weighted context (last ~90s primary, earlier secondary)

### v3 — current

**Tested against:** a live "voice agents in tech" discussion, ~2 minutes of transcript, conversation mode: peer discussion shading into a wrap-up ("Thank you" at end).

**Failure modes observed in v2:**
1. Talking_point and fact_check cards produced plausible generalities rather than retrievable facts. No named companies, no real incidents, no statistics from named sources. Gap vs. reference prototype was still large.
2. Question_to_ask cards wrapped the actual question in meta-framing ("Ask the team, '...'") instead of just writing the sentence the user would speak.
3. Clarification was fired on a term ("dependency") that the user themselves had just used naturally in the transcript — over-eager type selection.
4. Closing signal ("Thank you") at the end of transcript was ignored — three mid-discussion cards generated as if conversation was active.

**Changes in v3:**
- Added a two-step process: first classify conversation state (ENDING / SILENT / ACTIVE), then generate cards appropriate to that state. Closing signals now trigger action-item-style cards instead of more discussion ammunition.
- Added a hard rule: talking_point and fact_check cards MUST contain a retrievable anchor (named system, number, company, date, or documented incident). If no anchor is available, the model must pick a different type rather than emit a generic card.
- Added rule against meta-wrapping question_to_ask previews. Preview is now the literal spoken sentence.
- Added a check to clarification type: skip if the user already used or defined the term naturally.
- Explicit honesty clause: fabricated facts are worse than no card. Choose a different type if uncertain.

## Expand Prompt
### v1 — current
TL;DR + Why now + Detail + Next move. Under 250 words. No iteration yet.

## Chat Prompt
### v1 — current
Transcript-grounded when question is about what was said; direct answer when question is forward-looking. No iteration yet.
