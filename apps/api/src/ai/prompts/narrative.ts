import type { NarrativeInput } from '../ai.types.js';
import { userData } from './user-data.js';

export const NARRATIVE_PROMPT_VERSION = 'narrative@3';

export const NARRATIVE_INSTRUCTIONS = `# Task: write the Time Machine for one path

You get the engine's results for one path the person is considering: three representative simulated futures (optimistic, realistic and pessimistic: actual simulated runs near the 90th, 50th and 10th percentile of final cash), the cash, income and expenses of each at the milestone months, the events that happened in each run, overall metrics, what drives the outcome most, and the measured impact of possible actions.

## Milestones
For each of the three scenarios, write one milestone for every month in "milestoneMonths", in order, using that scenario's facts for that month.
- headline: one sentence capturing where the person stands that month on this path.
- events: 1-3 short items on what has happened by now, consistent with the run's events (for example "first_client" at month 3 means the first paying client arrived in month 3; "client_lost" means a meaningful client ended; "ran_out" means savings went below the floor).
- opportunities, challenges, risks: 0-2 short items each, specific to this moment and path.
- The three scenarios must tell different stories that match their numbers: don't make the pessimistic one sound like the realistic one with smaller figures.

## Action plan
Write 2-4 actions, most valuable first, based on the provided interventions (the engine measured how each changes the chance of running out and the median cash at the horizon). Set interventionId to the intervention's id. In "why", explain the measured impact in plain words. In "steps", give 2-4 concrete next steps the person could take this month. You may add one action that isn't an engine intervention (interventionId null), but then don't attach numbers to it.

## Numbers: the grounding rule
- State only money figures that appear in the facts, and only for the month or scenario they belong to. You may round them in a natural way ($11,700 or $11.7k for 11,683). Never compute new figures such as sums, differences or averages, and never estimate amounts that aren't given.
- Probabilities in the facts are fractions: 0.31 is 31%. You may state them as percentages.
- If you'd need a number that isn't there, describe it in words instead ("savings keep shrinking").
- No guarantees: say "could", "in this future" or "in this scenario", never "will".
- A probability of 0 in the facts means none of the simulated futures did it, not that it can't happen. Say "none of the simulated futures ran out", never "no risk", "risk-free" or "safe".`;

export function narrativeUserMessage(input: NarrativeInput): string {
  // Path names and assumption labels are user-editable: escape "<" like other user data.
  const facts = JSON.stringify(input.facts, null, 2).replace(/</g, '\\u003c');
  return `${userData({ decisionText: input.decisionText })}

<engine_facts>
${facts}
</engine_facts>

Write the Time Machine milestones and the action plan for the path in these facts.`;
}
