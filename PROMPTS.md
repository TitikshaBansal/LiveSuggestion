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

### v4 — final (ship)

**Tested against:** a live conversation about voice AI agents (~2 min, four suggestion batches, two card-click expand flows, one typed chat message).

**What worked in v3:**
- Retrievable anchors landed — real named systems (Siri Shortcuts iOS 13, Google Duplex 2018, Klarna AI rollback) appeared in talking_point previews.
- Perspective guardrail held — no first-person impersonation across any of the four batches.
- Question cards dropped the "Ask the team" meta-wrapper; became direct spoken sentences.
- fact_check correctly flagged a transcription error ("STD" → likely "STT").
- Mix of types stayed healthy across all four batches.

**Failure modes observed in v3:**
1. **Fabricated statistics.** The model produced plausible-sounding citations ("Gartner's 2024 CX survey: 42% enterprises by 2025, up from 28%"; "McKinsey 2023 report: 30% handling-time reduction") that I could not verify. The retrievable-anchor rule pressured the model toward specificity; when it lacked a real anchor, it manufactured one. This is the worst failure mode for a copilot — it makes the user confidently wrong.
2. **Semantic cross-batch repetition.** The same underlying suggestion (clarify RAC/STD/TDS acronyms) appeared in three separate batches under different titles and types. Anti-repetition was working lexically (different titles) but failing semantically (same gap).

**Changes in v4:**
- Promoted honesty from a single line at the bottom to a dedicated **ANTI-FABRICATION** block near the top of the prompt, with three explicit alternatives (use a documented case study, switch card type, or use a qualitative pattern without a number).
- Added concrete BAD examples of fabricated citations so the model sees what not to do.
- Upgraded anti-repetition from lexical (title-level) to semantic (same-gap-different-wording). Updated the `/api/suggestions` route to send title + first sentence of preview for each previous card so the model has enough context to detect semantic overlap.
- Relaxed the retrievable-anchor rule slightly: "must include an anchor IF you're confident it's real." Combined with the anti-fabrication rule, this eliminates the invent-a-citation failure mode.

**Defaults retained from the assignment spec throughout all versions:**
- Exactly 3 cards per batch
- 5 suggestion types using the exact vocabulary from the brief (question to ask, talking point, answer, fact-check, clarification)
- 30-second refresh cadence
- Recency-weighted context (last ~90s primary, earlier secondary)
- User-editable prompts and context windows in Settings
