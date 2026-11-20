import type { BuildModelInput } from '../ai.types.js';
import { pathKey } from '../model-output.schema.js';
import { userData } from './user-data.js';

export const MODEL_PROMPT_VERSION = 'model@2';

export const MODEL_INSTRUCTIONS = `# Task: build the decision model

You get the person's decision, the intake questions with their answers, and the paths they chose to compare. Fill in the model the engine will simulate: the person's financial baseline, the parameters of every path, and the assumptions behind them.

## Rules
- "paths" has one entry per provided path, keyed by the "key" given with each path (path_1, path_2, ...). Each entry holds the parameters for that path's type.
- Every uncertain input is {low, likely, high} with low <= likely <= high. For a fact the person stated, repeat their number three times (it becomes a fixed value); for their own estimates use a tight range. Where they gave no answer, estimate a realistic range from the domain knowledge and anything they told you.
- Every field is required.
- Keep units straight: money is per month in the model currency (an hourly rate is per hour); rates and probabilities are fractions (a 27% tax rate is 0.27); durations are in months; hours are per week.
- baseline.currentMonthlyNetSalary is today's take-home pay. Paths describe what changes from today: a "stay" path keeps the current salary; a "freelance" or "startup" path assumes the person stops their salary at month 1; a "hybrid" path keeps transitionSalaryFraction of the salary for transitionMonths, then goes full-time on the freelance parameters.
- Optional pieces: for a startup, set fallbackMonthlySalary to null if the person couldn't or wouldn't return to a job, and funding to null unless they plan to raise money.
- Currency: use the currency the person used or implied; default to "USD".
- emergencyFloor is usually 0 (running out means savings reach zero) unless the person said they want to keep a buffer.

## Assumptions
List the assumptions behind the important inputs, especially every value you estimated. Each assumption has:
- id (short, unique), pathId (the id of the path it belongs to, not its key, or null for baseline fields), and field: the dot path of the model field within that path or baseline, such as "hourlyRate", "freelance.hourlyRate" (in a hybrid path) or "baseline.monthlyExpenses".
- label: a short human label; rationale: one or two sentences on why this value is plausible for this person.
- source: "user" if it comes from their answers, "ai_estimate" if you estimated it, "default" for generic defaults; confidence: low, medium or high.
The person reviews these before simulating, so make estimates easy to check and edit.

## Output
Reply with the JSON object only, matching the JSON Schema given in <output_schema>: no prose before or after it, no code fences.`;

/** The model request. `jsonSchema` is the output schema for these paths (built per request). */
export function modelUserMessage(input: BuildModelInput, jsonSchema: string): string {
  const questions = input.intake.questions.map((q) => ({
    id: q.id,
    question: q.prompt,
    kind: q.kind,
    informs: q.informs,
    answer: input.answers[q.id] ?? null,
  }));
  const extraAnswers = Object.fromEntries(
    Object.entries(input.answers).filter(
      ([id]) => !input.intake.questions.some((q) => q.id === id),
    ),
  );
  return `${userData({
    decisionText: input.decisionText,
    category: input.intake.category,
    questions,
    otherAnswers: extraAnswers,
    paths: input.paths.map((p, i) => ({
      key: pathKey(i),
      id: p.id,
      name: p.name,
      type: p.type,
      summary: p.summary,
    })),
  })}

<output_schema>
${jsonSchema}
</output_schema>

The simulation horizon is ${input.horizonMonths} months. Build the decision model for these paths and reply with the JSON object only.`;
}
