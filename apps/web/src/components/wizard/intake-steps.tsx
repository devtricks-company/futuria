'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { Profile, ProposedPath, SimulationDto } from '@futuria/shared';
import { Notice } from '@/components/notice';
import { Button } from '@/components/ui/button';
import { PathsStep } from '@/components/wizard/paths-step';
import { QuestionsStep } from '@/components/wizard/questions-step';
import { Stepper } from '@/components/wizard/stepper';
import { MODEL_MESSAGES, Working } from '@/components/wizard/working';
import {
  answerFromDraft,
  collectAnswers,
  firstErrorIndex,
  initialDrafts,
  profileFilled,
} from '@/lib/answers';
import { api, errorMessage, queryKeys } from '@/lib/api';
import { cleanPaths, pathsChanged } from '@/lib/paths';

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
  const [initial] = useState(() => initialDrafts(questions, intake.answers, profile));
  const [drafts, setDrafts] = useState(initial);
  const [fromProfile] = useState(() => profileFilled(questions, intake.answers, profile));
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Lives here (not in QuestionsStep) so "Back" from the paths returns to the same question.
  const [questionIndex, setQuestionIndex] = useState(0);
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

  /** Check every answer: on to the paths, or to the first question that needs fixing. */
  const finishQuestions = () => {
    const result = collectAnswers(questions, drafts);
    setErrors(result.errors);
    const bad = firstErrorIndex(questions, result.errors);
    if (bad === -1) {
      setStep('paths');
      window.scrollTo({ top: 0 });
    } else {
      setQuestionIndex(bad);
    }
  };

  const nextQuestion = () => {
    const question = questions[questionIndex]!;
    const { error } = answerFromDraft(question, drafts[question.id] ?? '');
    if (error) setErrors((current) => ({ ...current, [question.id]: error }));
    else if (questionIndex === questions.length - 1) finishQuestions();
    else setQuestionIndex(questionIndex + 1);
  };

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
          index={questionIndex}
          drafts={drafts}
          initial={initial}
          errors={errors}
          fromProfile={fromProfile}
          hasSavedAnswers={intake.answers !== null}
          onChange={(id, value) => {
            setDrafts((d) => ({ ...d, [id]: value }));
            setErrors((current) => {
              const next = { ...current };
              delete next[id];
              return next;
            });
          }}
          onNext={nextQuestion}
          onBack={() => setQuestionIndex((i) => Math.max(0, i - 1))}
          onJump={setQuestionIndex}
          onSkip={finishQuestions}
        />
      ) : (
        <PathsStep
          paths={paths}
          maxPaths={maxPaths}
          onChange={setPaths}
          onBack={questions.length > 0 ? () => setStep('questions') : undefined}
          onSubmit={() => build.mutate()}
          error={build.isError ? errorMessage(build.error) : null}
        />
      )}
    </div>
  );
}
