/** Example decisions on the landing page and the empty wizard. */
export const EXAMPLE_DECISIONS = [
  {
    label: 'Quit to freelance',
    // Matches the recorded fixture exactly, so fixture mode replays Sara's real intake.
    text: 'What if I quit my job to become a freelance UX designer?',
  },
  {
    label: 'Start a business',
    text: 'What if I left my job to start a small SaaS business?',
  },
  {
    label: 'Take a new job',
    text: 'What if I switched to a job that pays 20% more but needs a move to another city?',
  },
  {
    label: 'Go part-time',
    text: 'What if I went part-time for a year to build my side business?',
  },
] as const;
