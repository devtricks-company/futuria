'use client';

import { useState } from 'react';
import { type PublicShareDto, SCENARIOS, type ScenarioKey } from '@futuria/shared';
import { ActionPlan } from '@/components/results/action-plan';
import { PathCards } from '@/components/results/path-cards';
import { PathPicker } from '@/components/results/path-picker';
import { TimeMachine } from '@/components/results/time-machine';
import { Segmented, SegmentedItem } from '@/components/ui/toggle-group';
import { PANEL, SCENARIO_LABELS, defaultPathId } from '@/lib/results-view';

/**
 * The owner opted in to showing numbers: the path cards with amounts, the Time Machine stories
 * and the action plan, read-only (no sliders).
 */
export function ShareDetails({
  details,
  colorIndex,
  currency,
  horizonMonths,
}: {
  details: NonNullable<PublicShareDto['details']>;
  colorIndex: Record<string, number>;
  currency: string;
  horizonMonths: number;
}) {
  const { result, byPath } = details.analysis;
  const [scenario, setScenario] = useState<ScenarioKey>('realistic');
  const [pathId, setPathId] = useState(() => defaultPathId(result));
  const path = result.paths.find((p) => p.pathId === pathId) ?? result.paths[0]!;
  const narrative = details.narrative?.[path.pathId];

  return (
    <section aria-labelledby="numbers-heading" className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="numbers-heading" className="font-display text-2xl">
          The numbers
        </h2>
        <Segmented
          value={scenario}
          onValueChange={(v) => setScenario(v as ScenarioKey)}
          aria-label="Scenario"
        >
          {SCENARIOS.map((key) => (
            <SegmentedItem key={key} value={key}>
              {SCENARIO_LABELS[key]}
            </SegmentedItem>
          ))}
        </Segmented>
      </div>
      <PathCards
        paths={result.paths}
        colorIndex={colorIndex}
        scenario={scenario}
        currency={currency}
        horizonMonths={horizonMonths}
      />

      <h2 className="mt-4 font-display text-2xl">The stories</h2>
      <PathPicker
        paths={result.paths}
        value={path.pathId}
        onValueChange={setPathId}
        colorIndex={colorIndex}
      />
      <div className={PANEL}>
        <TimeMachine
          path={path}
          scenario={scenario}
          narrative={narrative}
          storyPending={false}
          currency={currency}
          horizonMonths={horizonMonths}
        />
      </div>
      <ActionPlan
        narrative={narrative}
        interventions={byPath[path.pathId]?.interventions ?? []}
        storyPending={false}
        currency={currency}
      />
    </section>
  );
}
