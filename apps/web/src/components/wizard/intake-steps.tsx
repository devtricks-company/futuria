'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  type IntakeQuestion,
  PATH_TYPES,
  type PathType,
  type Profile,
  type ProposedPath,
  type SimulationDto,
} from '@futuria/shared';
import { Notice } from '@/components/notice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label, NativeSelect, Textarea } from '@/components/ui/input';
import { RadioCard, RadioGroup } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Stepper } from '@/components/wizard/stepper';
import { MODEL_MESSAGES, Working } from '@/components/wizard/working';
import { type AnswerDraft, collectAnswers, initialDrafts, profileFilled } from '@/lib/answers';
import { api, errorMessage, queryKeys } from '@/lib/api';
import {
  PATH_TYPE_HINTS,
  PATH_TYPE_LABELS,
  cleanPaths,
  newPathId,
  pathsChanged,
} from '@/lib/paths';

const SUFFIX: Partial<Record<IntakeQuestion['kind'], string>> = {
  months: 'months',
  hours: 'hours',
  percent: '%',
};

function QuestionInput({
  question,
  value,
  error,
  onChange,
}: {
  question: IntakeQuestion;
  value: AnswerDraft;
  error?: string;
  onChange: (value: AnswerDraft) => void;
}) {
  const id = `q-${question.id}`;
  switch (question.kind) {
    case 'boolean':
      return (
        <div className="flex items-center gap-3">
          <Switch id={id} checked={value === true} onCheckedChange={onChange} />
          <span className="text-sm">{value === true ? 'Yes' : 'No'}</span>
        </div>
      );
    case 'choice':
      return (
        <RadioGroup
          aria-labelledby={`${id}-label`}
          value={typeof value === 'string' ? value : ''}
          onValueChange={onChange}
        >
          {question.options.map((option) => (
            <RadioCard key={option} value={option}>
              {option}
            </RadioCard>
          ))}
        </RadioGroup>
      );
    case 'text':
      return (
        <Input
          id={id}
          value={String(value)}
          maxLength={500}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
        />
      );
    default: {
      const suffix = SUFFIX[question.kind];
      return (
        <div className="relative max-w-xs">
          <Input
            id={id}
            inputMode="decimal"
            value={String(value)}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            className={suffix ? 'pr-20' : undefined}
          />
          {suffix ? (
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">
              {suffix}
            </span>
          ) : null}
        </div>
      );
    }
  }
}

function QuestionsStep({
  questions,
  drafts,
  errors,
  fromProfile,
  onChange,
  onNext,
}: {
  questions: IntakeQuestion[];
  drafts: Record<string, AnswerDraft>;
  errors: Record<string, string>;
  fromProfile: Set<string>;
  onChange: (id: string, value: AnswerDraft) => void;
  onNext: () => void;
}) {
  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        onNext();
      }}
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">A few questions</h1>
        <p className="mt-1 text-muted">
          We filled in typical answers. Change anything that doesn&apos;t fit you; rough numbers are
          fine.
        </p>
      </div>
      <Card className="flex flex-col divide-y divide-border p-0 sm:p-0">
        {questions.map((question) => {
          const id = `q-${question.id}`;
          const error = errors[question.id];
          return (
            <div key={question.id} className="flex flex-col gap-2 px-5 py-5 sm:px-6">
              <div className="flex flex-wrap items-center gap-2">
                <Label id={`${id}-label`} htmlFor={id}>
                  {question.prompt}
                </Label>
                {fromProfile.has(question.id) ? (
                  <Badge variant="accent">From your profile</Badge>
                ) : null}
              </div>
              {question.helpText ? <p className="text-sm text-muted">{question.helpText}</p> : null}
              <QuestionInput
                question={question}
                value={drafts[question.id] ?? ''}
                error={error}
                onChange={(value) => onChange(question.id, value)}
              />
              {error ? (
                <p id={`${id}-error`} className="text-sm text-danger">
                  {error}
                </p>
              ) : null}
            </div>
          );
        })}
      </Card>
      <div className="flex justify-end">
        <Button type="submit">
          Next: your paths
          <ArrowRight />
        </Button>
      </div>
    </form>
  );
}

function PathsStep({
  paths,
  maxPaths,
  onChange,
  onBack,
  onSubmit,
  error,
}: {
  paths: ProposedPath[];
  maxPaths: number;
  onChange: (paths: ProposedPath[]) => void;
  onBack: () => void;
  onSubmit: () => void;
  error: string | null;
}) {
  const [newType, setNewType] = useState<PathType>('freelance');
  const update = (index: number, patch: Partial<ProposedPath>) =>
    onChange(paths.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  const invalid = paths.some((p) => !p.name.trim());

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (!invalid) onSubmit();
      }}
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">The futures to compare</h1>
        <p className="mt-1 text-muted">
          Each path is one way your decision could go. Rename them, remove one, or add another (up
          to {maxPaths} on your plan).
        </p>
      </div>
      <ol className="flex flex-col gap-4">
        {paths.map((path, index) => (
          <li key={path.id}>
            <Card className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <Badge>Path {index + 1}</Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={paths.length <= 1}
                  onClick={() => onChange(paths.filter((_, i) => i !== index))}
                  aria-label={`Remove ${path.name || `path ${index + 1}`}`}
                >
                  <Trash2 />
                  Remove
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`path-name-${path.id}`}>Name</Label>
                  <Input
                    id={`path-name-${path.id}`}
                    value={path.name}
                    maxLength={80}
                    onChange={(e) => update(index, { name: e.target.value })}
                    aria-invalid={!path.name.trim() ? true : undefined}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`path-type-${path.id}`}>Kind of path</Label>
                  <NativeSelect
                    id={`path-type-${path.id}`}
                    value={path.type}
                    onChange={(e) => update(index, { type: e.target.value as PathType })}
                  >
                    {PATH_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {PATH_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>
              <p className="text-xs text-muted">{PATH_TYPE_HINTS[path.type]}</p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`path-summary-${path.id}`}>What it means for you (optional)</Label>
                <Textarea
                  id={`path-summary-${path.id}`}
                  value={path.summary}
                  maxLength={300}
                  rows={2}
                  className="min-h-16"
                  onChange={(e) => update(index, { summary: e.target.value })}
                />
              </div>
            </Card>
          </li>
        ))}
      </ol>

      {paths.length < maxPaths ? (
        <Card className="flex flex-col gap-3 border-dashed sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="new-path-type">Add another path</Label>
            <NativeSelect
              id="new-path-type"
              value={newType}
              onChange={(e) => setNewType(e.target.value as PathType)}
            >
              {PATH_TYPES.map((type) => (
                <option key={type} value={type}>
                  {PATH_TYPE_LABELS[type]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button
            variant="secondary"
            onClick={() =>
              onChange([
                ...paths,
                {
                  id: newPathId(newType, paths),
                  name: PATH_TYPE_LABELS[newType],
                  type: newType,
                  summary: '',
                },
              ])
            }
          >
            <Plus />
            Add path
          </Button>
        </Card>
      ) : null}

      {error ? (
        <Notice variant="error" title="We couldn't build your simulation">
          {error}
        </Notice>
      ) : null}

      <div className="flex flex-wrap justify-between gap-3">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft />
          Back
        </Button>
        <Button type="submit" disabled={invalid}>
          Build my simulation
          <ArrowRight />
        </Button>
      </div>
    </form>
  );
}

/**
 * Wizard steps 2 and 3. They are submitted together: PATCH /answers takes the answers and the
 * paths, then Claude builds the model (POST /model).
 */
export function IntakeSteps({
  simulation,
  profile,
  maxPaths,
  onCancel,
}: {
  simulation: SimulationDto;
  profile: Profile | null;
  maxPaths: number;
  /** Return to the assumptions without changing anything (when editing answers later). */
  onCancel?: () => void;
}) {
  const intake = simulation.intake!;
  const questions = intake.result.questions;
  const proposed = intake.result.proposedPaths;
  const queryClient = useQueryClient();

  const [step, setStep] = useState<'questions' | 'paths'>(
    questions.length === 0 ? 'paths' : 'questions',
  );
  const [drafts, setDrafts] = useState(() => initialDrafts(questions, intake.answers, profile));
  const [fromProfile] = useState(() => profileFilled(questions, intake.answers, profile));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [paths, setPaths] = useState<ProposedPath[]>(() =>
    (intake.paths ?? proposed).slice(0, maxPaths),
  );

  const build = useMutation({
    mutationFn: async () => {
      const { answers } = collectAnswers(questions, drafts);
      const cleaned = cleanPaths(paths);
      // Send paths only when changed, so an untouched intake stays exactly as Claude proposed.
      await api.saveAnswers(simulation.id, {
        answers,
        ...(pathsChanged(cleaned, proposed) ? { paths: cleaned } : {}),
      });
      return api.buildModel(simulation.id);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.simulation(simulation.id), updated);
      void queryClient.invalidateQueries({ queryKey: queryKeys.simulations });
      onCancel?.();
    },
    onError: () => {
      // The answers may be saved even if the model failed: refresh the stored state.
      void queryClient.invalidateQueries({ queryKey: queryKeys.simulation(simulation.id) });
    },
  });

  if (build.isPending) return <Working messages={MODEL_MESSAGES} expectedSeconds={30} />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Stepper current={step === 'questions' ? 'Questions' : 'Paths'} />
        {onCancel ? (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Keep current assumptions
          </Button>
        ) : null}
      </div>
      {onCancel ? (
        <Notice variant="warning">
          Changing your answers rebuilds the assumptions (about 30 seconds), and your edits to them
          are replaced.
        </Notice>
      ) : null}
      {step === 'questions' ? (
        <QuestionsStep
          questions={questions}
          drafts={drafts}
          errors={errors}
          fromProfile={fromProfile}
          onChange={(id, value) => {
            setDrafts((d) => ({ ...d, [id]: value }));
            setErrors((current) => {
              const next = { ...current };
              delete next[id];
              return next;
            });
          }}
          onNext={() => {
            const result = collectAnswers(questions, drafts);
            setErrors(result.errors);
            if (Object.keys(result.errors).length === 0) {
              setStep('paths');
              window.scrollTo({ top: 0 });
            }
          }}
        />
      ) : (
        <PathsStep
          paths={paths}
          maxPaths={maxPaths}
          onChange={setPaths}
          onBack={() => setStep('questions')}
          onSubmit={() => build.mutate()}
          error={build.isError ? errorMessage(build.error) : null}
        />
      )}
    </div>
  );
}
