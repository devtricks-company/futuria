import type { IntakeInput } from '../ai.types.js';
import { userData } from './user-data.js';

export const INTAKE_PROMPT_VERSION = 'intake@3';

export const INTAKE_INSTRUCTIONS = `# Task: analyze a new decision (intake)

The person has typed the decision they are considering. Produce the intake: decide whether FUTURIA can simulate it, flag any safety concern, give it a title, ask the few questions that matter most, and propose the paths to compare.

## Scope
FUTURIA currently simulates Career Leap decisions only: leaving or keeping a job, freelancing or consulting, starting a business, switching jobs, going part-time to build something, or similar moves where income, expenses and savings over the next 1-5 years are the core trade-off.
- inScope = true for those. Pick the category that fits best: freelance, startup, new_job, hybrid, or other_career.
- inScope = false (category "out_of_scope") for everything else, such as buying a house, investing, relationships, moving country without a career change, health choices, or questions that aren't decisions. Out-of-scope decisions go to a waitlist, so still give them a short neutral title.

## Safety
Set safetyFlag to "crisis" only if the text suggests the person may be in danger: thoughts of suicide or self-harm, abuse or violence, or an acute emergency. Ordinary stress, burnout, frustration with a boss or fear of failure are not a crisis. For a crisis, still return a title, inScope as appropriate, and no questions or paths.

## Questions (for in-scope decisions)
Ask 5 to 7 questions, the ones whose answers change the outcome most. Every financial simulation needs:
- current monthly take-home pay (kind "money"),
- monthly living expenses (kind "money"),
- savings available today (kind "money").
Then add the 2-4 decision-specific questions that matter most, for example: existing leads or clients, expected hourly rate and billable hours, months to a first client, whether they could return to a job, a partner's income, expected new salary, months they would keep the job while building on the side.
- Each question has a stable snake_case id, a one-sentence prompt, a kind, and a smart defaultValue the person can accept (amounts as monthly figures in their likely currency, percents as fractions). Use null for defaultValue only when no sensible default exists.
- Use "choice" with 2-5 options when the answer is categorical; options must be empty for every other kind.
- Set "informs" to the model field the answer feeds, from the allowed list (for example "baseline.currentMonthlyNetSalary" for take-home pay, "baseline.monthlyExpenses", "baseline.startingCash", "hourlyRate", "monthsToFirstClient", "newMonthlyNetSalary"), or null when the answer informs several fields or none (for example "Could you return to a job?").

## Paths (for in-scope decisions)
Propose 2 or 3 paths to compare. Include the status quo ("stay", if they are employed now) so the person sees what they are comparing against, the move they asked about, and, when it fits, a lower-risk middle path such as a hybrid transition. Each path has a short slug id ("stay", "freelance", "hybrid", "startup", "new-job"), a short name, a type, and a one-sentence summary.`;

export function intakeUserMessage(input: IntakeInput): string {
  return `${userData({ decisionText: input.decisionText })}

Produce the intake for this decision.`;
}
