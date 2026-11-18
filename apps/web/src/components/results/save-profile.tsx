'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, UserRound } from 'lucide-react';
import { type DecisionModel, EMPTY_PROFILE, type Profile, likelyValue } from '@futuria/shared';
import { Button } from '@/components/ui/button';
import { api, errorMessage, queryKeys } from '@/lib/api';

/** The profile numbers a simulation's baseline can update (other profile fields are kept). */
export function profileFromModel(model: DecisionModel, current: Profile | null): Profile {
  return {
    ...(current ?? EMPTY_PROFILE),
    currency: model.baseline.currency,
    savings: Math.round(model.baseline.startingCash),
    expenses: Math.round(likelyValue(model.baseline.monthlyExpenses)),
    netIncome: Math.round(model.baseline.currentMonthlyNetSalary),
  };
}

/** "Save these numbers to my profile": the next simulation starts from them. */
export function SaveProfile({ model }: { model: DecisionModel }) {
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: queryKeys.profile, queryFn: api.profile });
  const save = useMutation({
    mutationFn: () => api.saveProfile(profileFromModel(model, profile.data?.profile ?? null)),
    onSuccess: (saved) => queryClient.setQueryData(queryKeys.profile, saved),
  });
  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="secondary"
        onClick={() => save.mutate()}
        disabled={save.isPending || profile.isPending}
      >
        {save.isSuccess ? <Check /> : <UserRound />}
        {save.isSuccess ? 'Saved to your profile' : 'Save my numbers to my profile'}
      </Button>
      {save.isError ? <p className="text-sm text-danger">{errorMessage(save.error)}</p> : null}
    </div>
  );
}
