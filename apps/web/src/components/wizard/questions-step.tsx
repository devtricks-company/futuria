'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import { type ChangeEvent, type MouseEvent, useEffect, useRef, useState } from 'react';
import type { IntakeQuestion } from '@futuria/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { RadioCard, RadioGroup } from '@/components/ui/radio-group';
import { type AnswerDraft, describeDraft, draftChanged, isNumericKind } from '@/lib/answers';
import { cn } from '@/lib/utils';

const SUFFIX: Partial<Record<IntakeQuestion['kind'], string>> = {
  months: 'months',
  hours: 'hours',
  percent: '%',
};

/** How long a picked option stays on screen before the next question slides in. */
const AUTO_ADVANCE_MS = 320;

function QuestionInput({
  question,
  value,
  describedBy,
  invalid,
  last,
  onChange,
  onPick,
}: {
  question: IntakeQuestion;
  value: AnswerDraft;
  describedBy: string | undefined;
  invalid: boolean;
  last: boolean;
  onChange: (value: AnswerDraft) => void;
  /** An option was clicked or tapped (not chosen with the arrow keys). */
  onPick: () => void;
}) {
  const id = `q-${question.id}`;
  // A pointer click has detail >= 1; arrow keys and Space click with detail 0.
  const pickedWithPointer = (event: MouseEvent) => {
    if (event.detail > 0) onPick();
  };
  const suggested = (option: string, matches: boolean) => (
    <>
      <span>{option}</span>
      {matches ? <Badge className="shrink-0">Suggested</Badge> : null}
    </>
  );

  if (question.kind === 'boolean') {
    return (
      <RadioGroup
        aria-labelledby={`${id}-label`}
        aria-describedby={describedBy}
        value={value === true ? 'yes' : 'no'}
        onValueChange={(v) => onChange(v === 'yes')}
        className="grid-cols-2"
      >
        {(['yes', 'no'] as const).map((option) => (
          <RadioCard
            key={option}
            value={option}
            onClick={pickedWithPointer}
            className="px-4 py-3.5 text-base sm:text-sm"
          >
            {suggested(
              option === 'yes' ? 'Yes' : 'No',
              question.defaultValue === (option === 'yes'),
            )}
          </RadioCard>
        ))}
      </RadioGroup>
    );
  }

  if (question.kind === 'choice') {
    return (
      <RadioGroup
        aria-labelledby={`${id}-label`}
        aria-describedby={describedBy}
        value={typeof value === 'string' ? value : ''}
        onValueChange={onChange}
      >
        {question.options.map((option) => (
          <RadioCard
            key={option}
            value={option}
            onClick={pickedWithPointer}
            className="px-4 py-3.5 text-base sm:text-sm"
          >
            {suggested(option, question.defaultValue === option)}
          </RadioCard>
        ))}
      </RadioGroup>
    );
  }

  const common = {
    id,
    value: String(value),
    autoComplete: 'off',
    enterKeyHint: last ? ('done' as const) : ('next' as const),
    onChange: (e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
    'aria-invalid': invalid ? true : undefined,
    'aria-describedby': describedBy,
  };

  if (question.kind === 'text') {
    return <Input {...common} maxLength={500} className="h-12 text-base sm:text-base" />;
  }

  const suffix = SUFFIX[question.kind];
  return (
    <div className="relative max-w-xs">
      <Input
        {...common}
        inputMode="decimal"
        // Most people retype the whole number, so start with it selected.
        onFocus={(e) => e.currentTarget.select()}
        className={cn(
          'h-14 text-2xl font-semibold tabular-nums sm:text-2xl',
          suffix && (suffix.length > 1 ? 'pr-24' : 'pr-10'),
        )}
      />
      {suffix ? (
        <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-muted">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

/** Thin segments, one per question: where you are, and a way to jump back (or ahead). */
function QuestionProgress({
  questions,
  index,
  errors,
  onJump,
}: {
  questions: IntakeQuestion[];
  index: number;
  errors: Record<string, string>;
  onJump: (index: number) => void;
}) {
  return (
    <div className="flex items-center gap-4">
      <p className="shrink-0 text-sm font-semibold tabular-nums">
        <span className="text-accent">Question {index + 1}</span>{' '}
        <span className="text-muted">of {questions.length}</span>
      </p>
      <ol className="flex flex-1 gap-1.5" aria-label="Questions">
        {questions.map((question, i) => (
          <li key={question.id} className="flex-1">
            <button
              type="button"
              onClick={() => onJump(i)}
              // The prompt is a tooltip (and the description), so only the input is labelled by it.
              aria-label={`Question ${i + 1}`}
              title={question.prompt}
              aria-current={i === index ? 'step' : undefined}
              className="group flex w-full rounded-full py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                aria-hidden
                className={cn(
                  'h-1.5 w-full rounded-full transition-[background-color,opacity] duration-300',
                  question.id in errors
                    ? 'bg-danger'
                    : i <= index
                      ? 'bg-[linear-gradient(90deg,var(--grad-1),var(--grad-2))]'
                      : 'bg-border group-hover:bg-border-strong',
                  i < index && !(question.id in errors) && 'opacity-60 group-hover:opacity-100',
                )}
              />
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Wizard step 2, one question at a time. Answers start filled in (Claude's defaults, the
 * profile, or the saved answers), so each screen is a quick "does this fit you?". Enter or a
 * tapped option moves on; the segments and "Skip to your paths" let people move faster.
 */
export function QuestionsStep({
  questions,
  index,
  drafts,
  initial,
  errors,
  fromProfile,
  hasSavedAnswers,
  onChange,
  onNext,
  onBack,
  onJump,
  onSkip,
}: {
  questions: IntakeQuestion[];
  index: number;
  drafts: Record<string, AnswerDraft>;
  /** Where each answer started, for "Reset to …". */
  initial: Record<string, AnswerDraft>;
  errors: Record<string, string>;
  fromProfile: Set<string>;
  /** The person answered before (editing): the other answers are theirs, not suggestions. */
  hasSavedAnswers: boolean;
  onChange: (id: string, value: AnswerDraft) => void;
  onNext: () => void;
  onBack: () => void;
  onJump: (index: number) => void;
  onSkip: () => void;
}) {
  const question = questions[index]!;
  const id = `q-${question.id}`;
  const value = drafts[question.id] ?? '';
  const start = initial[question.id] ?? '';
  const error = errors[question.id];
  const last = index === questions.length - 1;

  // Slide the new question in from the side we're moving towards (not on first render).
  const [shown, setShown] = useState(index);
  const [direction, setDirection] = useState<'forward' | 'back' | null>(null);
  if (shown !== index) {
    setShown(index);
    setDirection(index > shown ? 'forward' : 'back');
  }

  // After moving, put focus in the new question so typing (or arrow keys) works right away.
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!direction) return;
    const root = panel.current;
    const target =
      root?.querySelector<HTMLElement>('input') ??
      root?.querySelector<HTMLElement>('[role="radio"][data-state="checked"]') ??
      root?.querySelector<HTMLElement>('[role="radio"]');
    target?.focus();
  }, [index, direction]);

  // Picking an option moves on by itself, after a beat so the choice is visible.
  const latestNext = useRef(onNext);
  useEffect(() => {
    latestNext.current = onNext;
  });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), [index]);
  const advanceSoon = () => {
    if (last) return; // the last answer leads to a new step: let the person press the button
    clearTimeout(timer.current);
    timer.current = setTimeout(() => latestNext.current(), AUTO_ADVANCE_MS);
  };

  const helpId = question.helpText ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined;
  const canReset =
    isNumericKind(question.kind) && start !== '' && draftChanged(value, start) && !error;

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        clearTimeout(timer.current);
        onNext();
      }}
    >
      <div>
        <h1 className="font-display text-3xl leading-[1.1] sm:text-4xl">A few questions</h1>
        <p className="mt-2 text-muted">
          We filled in typical answers. Change anything that doesn&apos;t fit you; rough numbers are
          fine.
        </p>
      </div>

      <Card className="overflow-hidden p-0 shadow-pop sm:p-0">
        <div className="px-5 pt-4 sm:px-8 sm:pt-5">
          <QuestionProgress questions={questions} index={index} errors={errors} onJump={onJump} />
        </div>

        <div
          key={question.id}
          ref={panel}
          className={cn(
            'flex min-h-64 flex-col gap-5 px-5 pt-5 pb-7 sm:px-8 sm:pt-6 sm:pb-9',
            direction &&
              'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300 motion-safe:ease-[var(--ease-out)]',
            direction === 'forward' && 'motion-safe:slide-in-from-right-8',
            direction === 'back' && 'motion-safe:slide-in-from-left-8',
          )}
        >
          <div className="flex flex-col gap-2">
            <Label
              id={`${id}-label`}
              htmlFor={id}
              className="text-xl leading-snug font-semibold tracking-tight sm:text-2xl"
            >
              {question.prompt}
            </Label>
            {fromProfile.has(question.id) ? (
              <Badge variant="accent" className="self-start">
                From your profile
              </Badge>
            ) : null}
            {question.helpText ? (
              <p id={helpId} className="text-muted">
                {question.helpText}
              </p>
            ) : null}
          </div>

          <QuestionInput
            question={question}
            value={value}
            describedBy={describedBy}
            invalid={Boolean(error)}
            last={last}
            onChange={(next) => onChange(question.id, next)}
            onPick={advanceSoon}
          />

          {error ? (
            <p id={errorId} className="-mt-2 text-sm text-danger">
              {error}
            </p>
          ) : null}
          {canReset ? (
            <Button
              variant="link"
              className="-mt-2 h-auto self-start px-0"
              onClick={() => onChange(question.id, start)}
            >
              Reset to {describeDraft(question, start)}
            </Button>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-muted/40 px-5 py-4 sm:px-8">
          <Button
            variant="ghost"
            onClick={onBack}
            // Hidden (not removed) on the first question so Next stays put.
            className={cn(index === 0 && 'invisible')}
          >
            <ArrowLeft />
            Back
          </Button>
          <Button type="submit">
            {last ? 'Next: your paths' : 'Next'}
            <ArrowRight />
          </Button>
        </div>
      </Card>

      {!last ? (
        <p className="flex flex-wrap items-center justify-center gap-x-2 text-center text-sm text-muted">
          {hasSavedAnswers
            ? 'The other questions keep your earlier answers.'
            : 'The other questions already have typical answers.'}
          <Button variant="link" onClick={onSkip}>
            Skip to your paths
          </Button>
        </p>
      ) : null}
    </form>
  );
}
