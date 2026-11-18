/**
 * The landing page's live demo: Sara's sample decision (SARA_MODEL) with a fixed seed, so the
 * numbers computed when the page is built match what the browser computes before any tweak.
 */
export const DEMO_SEED = 20261116;

/** The path the feature previews describe ("Quit & freelance full-time"). */
export const DEMO_PATH_ID = 'freelance';

/** Sliders offered in the demo, by tweak id, with shorter labels for the small panel. */
export const DEMO_SLIDERS = [
  { id: 'baseline:baseline.startingCash', label: 'Savings today' },
  { id: 'freelance:hourlyRate', label: 'Freelance hourly rate' },
  { id: 'freelance:billableHoursPerWeek', label: 'Billable hours per week' },
] as const;
