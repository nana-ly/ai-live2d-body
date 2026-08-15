# Drive Model

The eight drive values describe Leo's current internal state. They are neither
random animation values nor permanent relationship scores.

| drive | meaning | update authority |
|---|---|---|
| attachment | current felt closeness | Leo reflection only |
| curiosity | current desire to understand or explore | Leo reflection; reading is weak evidence |
| reflection | current pull toward inward thought | Leo reflection only |
| duty | current task commitment | Leo reflection; work is bounded evidence |
| social | current desire to communicate | Leo reflection only |
| fatigue | accumulated cognitive/body load | work and rest evidence; Leo may correct |
| libido | private embodied desire | Leo reflection only |
| stress | physiological/task tension | shake/work evidence; Leo may correct |

## Rules

1. A factual event is evidence, not an emotion verdict.
2. Touch never automatically changes attachment, social, or libido.
3. Repeated tool hooks approach a bounded work state instead of adding an
   unlimited fixed amount.
4. Attachment does not decay automatically. It represents current closeness,
   while durable relationship facts belong in long-term memory.
5. Subjective changes require an explicit `drive_reflect` call with a reason.
6. Drive-derived facial output is a low-amplitude micro-expression layer. It
   never selects hair, props, or expression presets and never overrides lip-sync.
7. MurMur may use drives as prompts, but Leo still decides whether to stay
   silent, write a signature, act, or speak.
