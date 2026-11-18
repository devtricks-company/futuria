'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Play, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Assumption, DecisionModel, SimulationDto } from '@futuria/shared';
import { Notice } from '@/components/notice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Label, NativeSelect } from '@/components/ui/input';
import { Stepper } from '@/components/wizard/stepper';
import { ValueEditor, describeValue } from '@/components/wizard/value-editor';
import { api, errorMessage, queryKeys } from '@/lib/api';
import { useNavigate } from '@/lib/navigation';
import {
  type FieldGroup,
  type ModelField,
  countEstimates,
  groupFields,
  setFieldValue,
} from '@/lib/model-fields';
import { PATH_TYPE_HINTS } from '@/lib/paths';
import { cn } from '@/lib/utils';

const HORIZONS = [12, 24, 36, 60] as const;

export function SourceBadge({ assumption }: { assumption: Assumption | undefined }) {
  if (!assumption) return null;
  switch (assumption.source) {
    case 'ai_estimate':
      return (
        <Badge variant="estimate" title={`AI estimate, ${assumption.confidence} confidence`}>
          <Sparkles aria-hidden />
          AI estimate
          {assumption.confidence === 'low' ? ' · low confidence' : ''}
        </Badge>
      );
    case 'user':
      return <Badge variant="success">From you</Badge>;
    default:
      return <Badge>Typical default</Badge>;
  }
}

function FieldRow({
  field,
  currency,
  editing,
  onEdit,
  onSave,
  onCancel,
}: {
  field: ModelField;
  currency: string;
  editing: boolean;
  onEdit: () => void;
  onSave: (value: ModelField['value']) => void;
  onCancel: () => void;
}) {
  const estimate = field.assumption?.source === 'ai_estimate';
  return (
    <li
      className={cn(
        'flex flex-col gap-2 px-5 py-4 sm:px-6',
        estimate && 'border-l-4 border-l-estimate-border bg-estimate-surface/40 pl-4 sm:pl-5',
      )}
      data-testid="assumption"
      data-source={field.assumption?.source ?? 'none'}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{field.label}</span>
            <SourceBadge assumption={field.assumption} />
          </div>
          <span className="text-sm tabular-nums">
            {describeValue(field.value, field.meta, currency)}
          </span>
        </div>
        {!editing ? (
          <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`Edit ${field.label}`}>
            <Pencil />
            Edit
          </Button>
        ) : null}
      </div>
      {field.assumption?.rationale ? (
        <p className="text-sm text-muted">{field.assumption.rationale}</p>
      ) : null}
      {editing ? (
        <ValueEditor
          idPrefix={field.key.replace(/[^a-zA-Z0-9-]/g, '-')}
          value={field.value}
          meta={field.meta}
          onSave={onSave}
          onCancel={onCancel}
        />
      ) : null}
    </li>
  );
}

function GroupCard({
  group,
  currency,
  editingKey,
  setEditingKey,
  onChange,
}: {
  group: FieldGroup;
  currency: string;
  editingKey: string | null;
  setEditingKey: (key: string | null) => void;
  onChange: (field: ModelField, value: ModelField['value']) => void;
}) {
  // Values with an assumption come first; the rest are standard settings, folded away.
  const main = group.fields.filter((f) => f.assumption);
  const more = group.fields.filter((f) => !f.assumption);
  const row = (field: ModelField) => (
    <FieldRow
      key={field.key}
      field={field}
      currency={currency}
      editing={editingKey === field.key}
      onEdit={() => setEditingKey(field.key)}
      onCancel={() => setEditingKey(null)}
      onSave={(value) => {
        onChange(field, value);
        setEditingKey(null);
      }}
    />
  );
  return (
    <Card className="p-0 sm:p-0">
      <div className="border-b border-border px-5 py-4 sm:px-6">
        <CardTitle>{group.title}</CardTitle>
        <CardDescription>
          {group.type ? PATH_TYPE_HINTS[group.type] : 'Shared by every path.'}
        </CardDescription>
      </div>
      <ul className="divide-y divide-border">{main.map(row)}</ul>
      {more.length ? (
        <details className="group border-t border-border">
          <summary className="cursor-pointer px-5 py-3 text-sm text-muted select-none hover:text-foreground sm:px-6">
            {more.length} more {more.length === 1 ? 'setting' : 'settings'}
          </summary>
          <ul className="divide-y divide-border border-t border-border">{more.map(row)}</ul>
        </details>
      ) : null}
      {group.notes.length ? (
        <div className="border-t border-border px-5 py-4 text-sm sm:px-6">
          <p className="font-medium">Other notes</p>
          <ul className="mt-1 list-disc pl-5 text-muted">
            {group.notes.map((note) => (
              <li key={note.id}>
                {note.label}: {note.rationale}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

/** Wizard step 4: "Here's what we assumed". Every value is editable; AI estimates stand out. */
export function AssumptionsStep({
  simulation,
  maxHorizonMonths,
  onEditAnswers,
}: {
  simulation: SimulationDto;
  maxHorizonMonths: number;
  onEditAnswers?: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [model, setModel] = useState<DecisionModel>(simulation.model!);
  const [dirty, setDirty] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const groups = useMemo(() => groupFields(model), [model]);
  const estimates = countEstimates(groups);
  const currency = model.baseline.currency;

  const save = useMutation({
    mutationFn: () => api.updateModel(simulation.id, model),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.simulation(simulation.id), updated);
      setDirty(false);
    },
  });

  const run = useMutation({
    mutationFn: async () => {
      if (dirty) await api.updateModel(simulation.id, model);
      return api.run(simulation.id);
    },
    onSuccess: (queued) => {
      queryClient.setQueryData(queryKeys.simulation(simulation.id), queued);
      void queryClient.invalidateQueries({ queryKey: queryKeys.simulations });
      navigate(`/s/${simulation.id}`);
    },
  });

  const busy = save.isPending || run.isPending || run.isSuccess;
  const error = run.error ?? save.error;
  const horizons = HORIZONS.filter((h) => h <= maxHorizonMonths);

  return (
    <div className="flex flex-col gap-6 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Stepper current="Assumptions" />
        {onEditAnswers ? (
          <Button variant="ghost" size="sm" onClick={onEditAnswers} disabled={busy}>
            <ArrowLeft />
            Change answers
          </Button>
        ) : null}
      </div>
      <div>
        <h1 className="font-display text-3xl leading-[1.1] sm:text-4xl">
          Here&apos;s what we assumed
        </h1>
        <p className="mt-2 max-w-2xl text-muted">
          The simulation uses these numbers. Ranges mean we&apos;re unsure: each simulated future
          picks a value inside the range.{' '}
          {estimates > 0 ? (
            <>
              <strong className="font-medium text-estimate">
                {estimates}{' '}
                {estimates === 1 ? 'value is an AI estimate' : 'values are AI estimates'}
              </strong>
              : check them, you know your situation better.
            </>
          ) : null}
        </p>
      </div>

      {horizons.length > 1 ? (
        <Card className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Label htmlFor="horizon">How far ahead to simulate</Label>
          <NativeSelect
            id="horizon"
            className="sm:w-48"
            value={model.horizonMonths}
            onChange={(e) => {
              setModel({ ...model, horizonMonths: Number(e.target.value) });
              setDirty(true);
            }}
          >
            {horizons.map((h) => (
              <option key={h} value={h}>
                {h} months
              </option>
            ))}
          </NativeSelect>
        </Card>
      ) : null}

      {groups.map((group) => (
        <GroupCard
          key={group.pathId ?? 'baseline'}
          group={group}
          currency={currency}
          editingKey={editingKey}
          setEditingKey={setEditingKey}
          onChange={(field, value) => {
            setModel((m) => setFieldValue(m, field, value));
            setDirty(true);
          }}
        />
      ))}

      {error ? (
        <Notice variant="error" title="That didn't work">
          {errorMessage(error)}
        </Notice>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <span className="text-sm text-muted">
            {dirty ? 'You have unsaved changes' : `Horizon: ${model.horizonMonths} months`}
          </span>
          <div className="flex gap-2">
            {dirty ? (
              <Button variant="secondary" onClick={() => save.mutate()} disabled={busy}>
                Save
              </Button>
            ) : null}
            <Button onClick={() => run.mutate()} disabled={busy || editingKey !== null}>
              <Play />
              {run.isPending || run.isSuccess ? 'Starting…' : 'Run simulation'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
