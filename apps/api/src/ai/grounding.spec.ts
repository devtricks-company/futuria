import { SARA_MODEL } from '@futuria/shared';
import { analyze, parseModel } from '@futuria/engine';
import { ungroundedFigures } from './grounding.js';
import { buildNarrativeFacts, milestoneMonths } from './narrative-facts.js';
import { syntheticNarrative } from './synthetic.js';

const model = parseModel(SARA_MODEL);
const analysis = analyze(model, { seed: 42, runs: 200, analysisRuns: 100 });
const facts = buildNarrativeFacts(model, analysis, 'freelance');

describe('narrative facts', () => {
  it('picks milestone months for any horizon', () => {
    expect(milestoneMonths(12)).toEqual([1, 3, 6, 9, 12]);
    expect(milestoneMonths(24)).toEqual([1, 3, 6, 9, 12, 18, 24]);
    expect(milestoneMonths(7)).toEqual([1, 3, 6, 7]);
  });

  it('takes each scenario’s numbers from its representative run', () => {
    const run = analysis.result.paths.find((p) => p.pathId === 'freelance')!.scenarios.pessimistic;
    expect(facts.scenarios.pessimistic.months[1]).toEqual({
      month: 3,
      cash: Math.round(run.cash[3]!),
      income: Math.round(run.income[3]!),
      expenses: Math.round(run.expenses[3]!),
    });
    expect(facts.interventions.length).toBeGreaterThan(0);
    expect(facts.topDrivers.length).toBeLessThanOrEqual(3);
  });
});

describe('ungroundedFigures', () => {
  const realistic = facts.scenarios.realistic.months[2]!; // month 6
  const story = (text: string) => {
    const narrative = syntheticNarrative(facts);
    narrative.scenarios.realistic[0]!.headline = text;
    return narrative;
  };

  it('accepts figures from the facts, exact or naturally rounded', () => {
    expect(ungroundedFigures(syntheticNarrative(facts), facts)).toEqual([]);
    const k = (realistic.cash / 1000).toFixed(1);
    expect(ungroundedFigures(story(`Savings sit near $${k}k.`), facts)).toEqual([]);
    expect(
      ungroundedFigures(story(`You have USD ${realistic.cash.toLocaleString('en-US')}.`), facts),
    ).toEqual([]);
  });

  it('accepts figures quoted from fact text, such as intervention descriptions', () => {
    const withText = {
      ...facts,
      interventions: [
        ...facts.interventions,
        {
          ...facts.interventions[0]!,
          id: 'extra',
          description: 'Save $4,200 (about $4.2k) first.',
        },
      ],
    };
    expect(ungroundedFigures(story('Put aside $4,200 before you quit.'), withText)).toEqual([]);
  });

  it('reads figures at the end of a sentence and natural rounding (from a real narrative)', () => {
    const cash = facts.scenarios.realistic.months[2]!.cash; // month 6
    const rounded = Math.round(cash / 100) * 100;
    const k = (cash / 1000).toFixed(1);
    expect(
      ungroundedFigures(
        story(`Savings are near $${k}k. That is roughly $${rounded.toLocaleString('en-US')}.`),
        facts,
      ),
    ).toEqual([]);
  });

  it('accepts rounding to fifties and rounding down (from the full eval)', () => {
    const cash = facts.scenarios.realistic.months[2]!.cash;
    const fifty = Math.round(cash / 50) * 50;
    const floorK = (Math.floor(cash / 100) / 10).toFixed(1);
    expect(
      ungroundedFigures(
        story(
          `Costs sit around $${fifty.toLocaleString('en-US')}. Savings pass $${floorK}k this month.`,
        ),
        facts,
      ),
    ).toEqual([]);
  });

  it('flags invented figures', () => {
    expect(ungroundedFigures(story('You could earn $123,457 by month 6.'), facts)).toEqual([
      '$123,457',
    ]);
  });
});
