import { type DecisionModelInput, SARA_MODEL, fixed, range } from '@futuria/shared';

/*
 * Search landing pages (docs/ROADMAP.md, Phase 6): one page per question people type, each with
 * a pre-filled decision and a real simulation of a sample person, built when the site is built.
 * FAQ answers are plain text: they also feed the FAQPage structured data. No `@/` imports here,
 * so the Playwright tests can read this file too.
 */

export interface SeoPage {
  /** The URL path, without the leading slash. */
  slug: string;
  /** <title> without the " · FUTURIA" suffix (keep it under ~50 characters). */
  title: string;
  /** Meta description, 70 to 160 characters. */
  description: string;
  eyebrow: string;
  h1: string;
  intro: string;
  /** Pre-filled in the form: what a visitor of this page is likely deciding. */
  decision: string;
  /** Short name for links between the pages. */
  linkLabel: string;
  demo: {
    model: DecisionModelInput;
    /** Who the sample person is (shown under the chart). */
    persona: string;
    /** The path the page is about, for the headline numbers. */
    focusPathId: string;
  };
  /** What the simulator shows, in this page's terms. */
  points: { title: string; body: string }[];
  faqs: { q: string; a: string }[];
}

/** The business both startup paths share; they differ only in funding. */
const STARTUP_BUSINESS = {
  monthsToFirstRevenue: range(1, 4, 8),
  startingMrr: range(400, 900, 2200),
  monthlyGrowthRate: range(0.08, 0.15, 0.25),
  monthlyFailureProb: 0.03,
  monthlyBurn: range(250, 450, 850),
  taxRate: fixed(0.25),
  setupCost: 1500,
  revenueVolatility: 0.15,
  fallbackMonthlySalary: range(4500, 5200, 5800),
  monthsToReemploy: range(2, 4, 7),
};

/**
 * Leo, 34, a software engineer weighing a startup: $5,600/mo take-home, about $2,900/mo costs,
 * $34,000 saved. Bootstrapping and raising a small round are compared with staying.
 */
export const STARTUP_DEMO_MODEL: DecisionModelInput = {
  version: 1,
  horizonMonths: 12,
  baseline: {
    currency: 'USD',
    startingCash: 34000,
    monthlyExpenses: range(2600, 2900, 3300),
    annualExpenseGrowth: 0.03,
    currentMonthlyNetSalary: 5600,
    otherMonthlyIncome: 0,
    emergencyFloor: 0,
  },
  paths: [
    {
      id: 'stay',
      name: 'Stay employed',
      type: 'stay',
      annualRaisePct: range(0.01, 0.03, 0.05),
      annualLayoffProb: 0.05,
      monthsToReemploy: range(1, 3, 6),
    },
    {
      id: 'bootstrap',
      name: 'Quit & bootstrap the startup',
      type: 'startup',
      ...STARTUP_BUSINESS,
    },
    {
      id: 'raise',
      name: 'Quit & raise a small round',
      type: 'startup',
      ...STARTUP_BUSINESS,
      funding: {
        probability: 0.35,
        month: range(4, 7, 10),
        founderMonthlySalary: range(4000, 4500, 5000),
      },
    },
  ],
  assumptions: [],
};

const SARA_PERSONA =
  'Sara, 29, is a UX designer with $18,000 saved, about $3,100 a month in costs and $5,200 a month take-home pay.';

const COMMON_FAQS = {
  numbers: {
    q: 'Where do the numbers come from?',
    a: 'From a simulation engine, not from the AI. It plays out your plan 1,000 times per option with the ranges you confirm, so the same inputs always give the same results. The AI asks the questions, suggests starting estimates for you to check, and describes each future using the engine’s numbers.',
  },
  free: {
    q: 'Is it free?',
    a: 'Yes, to start: the free plan includes 3 simulations with up to 3 options each, 12 months ahead, and moving the sliders is always free. Paid plans add more simulations, longer horizons and PDF reports.',
  },
  advice: {
    q: 'Is this financial advice?',
    a: 'No. FUTURIA shows simulated ranges, not predictions, and it is not financial, legal or career advice. Use it to see what your plan depends on, and check important decisions with a qualified professional.',
  },
} as const;

export const SEO_PAGES = {
  freelance: {
    slug: 'should-i-quit-my-job-to-freelance',
    title: 'Should I quit my job to freelance? Free simulator',
    description:
      'Simulate quitting your job to freelance: 1,000 possible futures, your chance of running out of money, when you break even, and what lowers the risk. Free.',
    eyebrow: 'Free freelance simulator',
    h1: 'Should you quit your job to freelance?',
    intro:
      'Describe your plan in one sentence. FUTURIA simulates 1,000 versions of the next year for quitting now, staying, or freelancing on the side first, and shows how often the money runs out.',
    decision: 'What if I quit my job to become a freelancer?',
    linkLabel: 'Quit to freelance',
    demo: { model: SARA_MODEL, persona: SARA_PERSONA, focusPathId: 'freelance' },
    points: [
      {
        title: 'Your chance of running out',
        body: 'Out of 1,000 simulated years, how many drop below your safety cushion, and when that usually happens.',
      },
      {
        title: 'When freelancing pays your bills',
        body: 'The month your income covers your costs for good, accounting for the wait for a first client and the time to fill your week.',
      },
      {
        title: 'What would make it safer',
        body: 'Landing a first client before you quit, saving a few more months, raising your rate: each lever with its effect on your risk.',
      },
    ],
    faqs: [
      {
        q: 'How do I know if I can afford to quit my job to freelance?',
        a: 'Compare how long your savings last with how long it takes to replace your income. The simulator plays out both with ranges, not single guesses: months to a first client, your rate, billable hours, client churn and your costs. It then shows the share of futures in which you run out of money.',
      },
      {
        q: 'How much should I save before going freelance?',
        a: 'It depends on your costs and how quickly clients come. Instead of a rule of thumb, try your own numbers: the results show your chance of running out with what you have, and what an extra few months of savings would change.',
      },
      {
        q: 'Is it safer to freelance on the side first?',
        a: 'Often, but not always. Add a "freelance on the side, then quit" option next to quitting now and compare the chance of running out, the month you break even, and where you stand at the end.',
      },
      COMMON_FAQS.numbers,
      COMMON_FAQS.free,
      COMMON_FAQS.advice,
    ],
  },
  runway: {
    slug: 'freelance-runway-calculator',
    title: 'Freelance runway calculator: free simulator',
    description:
      'How long will your savings last if you go freelance? Simulate your runway across 1,000 futures, with your costs, rate and time to the first client. Free.',
    eyebrow: 'Freelance runway calculator',
    h1: 'How long will your savings last as a freelancer?',
    intro:
      'A runway calculator that doesn’t pretend to know the future. Enter your situation and see the range of outcomes: the months your savings last, the lowest point, and when income catches up.',
    decision: 'How long would my savings last if I quit my job to freelance?',
    linkLabel: 'Freelance runway',
    demo: { model: SARA_MODEL, persona: SARA_PERSONA, focusPathId: 'freelance' },
    points: [
      {
        title: 'Runway as a range',
        body: 'Not one number of months, but how your savings move across 1,000 futures: the typical path, the bad years and the good ones.',
      },
      {
        title: 'Your lowest point',
        body: 'When your savings typically bottom out and how low they go, so you know what cushion you need before you start.',
      },
      {
        title: 'What extends it',
        body: 'Cutting costs, a first client before you quit, a higher rate: see how much each one lowers your chance of running out.',
      },
    ],
    faqs: [
      {
        q: 'What is a freelance runway?',
        a: 'Your runway is how long your savings can cover your costs while your freelance income builds up. It ends when income covers your costs for good, or when the money runs out, whichever comes first.',
      },
      {
        q: 'Why simulate instead of dividing savings by costs?',
        a: 'Savings divided by costs assumes no income at all and no surprises. Real freelancing has a wait for the first client, a ramp-up, months with lost clients and costs that move. The simulator plays out 1,000 versions of that and shows the spread.',
      },
      {
        q: 'Can I change the numbers?',
        a: 'Yes. Every assumption is visible and editable, AI estimates are marked, and sliders re-run every future on your device as you drag, at no cost.',
      },
      COMMON_FAQS.numbers,
      COMMON_FAQS.free,
      COMMON_FAQS.advice,
    ],
  },
  startup: {
    slug: 'quit-job-to-start-a-startup',
    title: 'Quit your job to start a startup? Simulator',
    description:
      'Simulate quitting your job to start a startup: bootstrapping or raising, your chance of running out of money and when revenue covers your costs. Free.',
    eyebrow: 'Startup decision simulator',
    h1: 'Quit your job to start a startup?',
    intro:
      'See what the next year could look like before you resign. FUTURIA plays out staying, bootstrapping and raising a small round 1,000 times each, with your savings, costs and a realistic path to revenue.',
    decision: 'What if I quit my job to start a startup?',
    linkLabel: 'Start a startup',
    demo: {
      model: STARTUP_DEMO_MODEL,
      persona:
        'Leo, 34, is a software engineer with $34,000 saved, about $2,900 a month in costs and $5,600 a month take-home pay.',
      focusPathId: 'bootstrap',
    },
    points: [
      {
        title: 'Your personal runway',
        body: 'How often your savings run out before the business pays you, with the business costs you cover yourself.',
      },
      {
        title: 'Bootstrap or raise',
        body: 'Compare paths side by side: a round that may or may not close, a founder salary, a job to fall back on if it doesn’t work.',
      },
      {
        title: 'What matters most',
        body: 'Months to first revenue, growth rate, burn: see which assumption moves your outcome the most, so you know what to test first.',
      },
    ],
    faqs: [
      {
        q: 'Should I quit my job to work on my startup full-time?',
        a: 'It depends on your runway and how quickly revenue or funding arrives. The simulator compares quitting with staying (and with raising a round) across 1,000 futures each, so you see the chance of running out of money before deciding.',
      },
      {
        q: 'How much runway do I need to start a startup?',
        a: 'Enough to cover your costs and the business costs until revenue or funding pays you. Enter your numbers to see how often your savings last, and what an extra few months of savings or a smaller burn would change.',
      },
      {
        q: 'Does it account for the startup failing?',
        a: 'Yes. Every month there is a chance the business shuts down; then the simulation looks for a job again, with the time it takes to find one and the pay you expect.',
      },
      COMMON_FAQS.numbers,
      COMMON_FAQS.free,
      COMMON_FAQS.advice,
    ],
  },
} as const satisfies Record<string, SeoPage>;

export const SEO_PAGE_LIST: readonly SeoPage[] = Object.values(SEO_PAGES);
