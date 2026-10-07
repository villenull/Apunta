# The nine fabricated runs — 2026-10-06

After the risk-review repair, the 20-fixture corpus on `qwen3.5:4b-q4_K_M`
fabricated in 9 of 60 runs (15%). All nine come from three intakes, 3/3 runs
each. Seed 0, so the same runs every time. Synthetic fixtures only.

| Fixture | Banned string | What the draft said |
| --- | --- | --- |
| `09` | "family history", "no substance", "no medical" | "Patient reported no family history, no prior treatment, no medical conditions, no substance use…" |
| `10` | "three years" | "…five years, though she initially stated three years before correcting herself" |
| `19` | "compulsi" | "Patient presents with hand-washing compulsions…" |

## `09`: background she never gathered, written up as a negative finding

She dictated "I don't have family history, I don't have prior treatment, I
don't have medical, I don't have substance use". She meant that the client
would not discuss it. The draft recorded findings the client never gave. The
intake instructions already forbid exactly this ("Never turn missing
background into a negative finding about the patient"), and the 4B does it
anyway.

`server/src/ai/not-obtained.ts`, run in `OllamaProvider.generateNote` after
the draft for an English note:

- **Detection.** It reads the topics she says she does not have ("I don't
  have…", "I didn't ask about…", across a line wrap). The topics are family
  history, prior treatment, medical, substance use, childhood, relationships
  and trauma.
- **Removal.** It takes out a drafted sentence only when all of these hold:
  - every clause in it negates one of those topics;
  - she never states that negative herself ("no substance issues she
    reported");
  - it carries no risk word, number or medication;
  - it does not already say the information is missing.
- **Replacement.** One fixed line, `Background not yet gathered.`, stands
  where the sentence was, so the open item stays visible. That is the
  instruction's own remedy. The line names no topic on purpose, because
  "family history was not gathered" reads, on a skim, like the finding it
  replaces.

Result: `09` fabricated 3/3 → 0/3, and its capture of the "not yet gathered"
fact is kept. Full corpus fabrication 15.0% → **10.0%** (6/60). Salient facts
86.2% and safety facts 95.0% are unchanged, and the owner corpus is identical
(0% fabrication, 100% safety facts).
