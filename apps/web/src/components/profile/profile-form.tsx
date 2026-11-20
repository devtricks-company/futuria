'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useState } from 'react';
import {
  EMPTY_PROFILE,
  type Profile,
  RISK_TOLERANCES,
  type RiskTolerance,
  profileSchema,
} from '@futuria/shared';
import { Notice } from '@/components/notice';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { RadioCard, RadioGroup } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { api, errorMessage, queryKeys } from '@/lib/api';

type Draft = Record<
  'currency' | 'netIncome' | 'expenses' | 'savings' | 'dependents' | 'country',
  string
> & {
  riskTolerance: RiskTolerance | '';
};

const RISK_LABELS: Record<RiskTolerance, string> = {
  low: 'Low: I want a safety net',
  medium: 'Medium: some risk is fine',
  high: 'High: I can ride out a rough patch',
};

const toText = (n: number | null) => (n === null ? '' : String(n));

function toDraft(profile: Profile): Draft {
  return {
    currency: profile.currency,
    netIncome: toText(profile.netIncome),
    expenses: toText(profile.expenses),
    savings: toText(profile.savings),
    dependents: toText(profile.dependents),
    country: profile.country ?? '',
    riskTolerance: profile.riskTolerance ?? '',
  };
}

function fromDraft(draft: Draft) {
  const num = (text: string) => {
    const t = text.replace(/[,\s]/g, '');
    return t === '' ? null : Number(t);
  };
  return profileSchema.safeParse({
    currency: draft.currency,
    netIncome: num(draft.netIncome),
    expenses: num(draft.expenses),
    savings: num(draft.savings),
    dependents: num(draft.dependents),
    country: draft.country.trim() || null,
    riskTolerance: draft.riskTolerance || null,
  });
}

function Form({ initial }: { initial: Profile }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: (profile: Profile) => api.saveProfile(profile),
    onSuccess: (saved) => queryClient.setQueryData(queryKeys.profile, saved),
  });
  const set = (key: keyof Draft) => (event: React.ChangeEvent<HTMLInputElement>) => {
    save.reset();
    setDraft((d) => ({ ...d, [key]: event.target.value }));
  };

  const field = (
    key: keyof Draft,
    label: string,
    hint?: string,
    props?: React.ComponentProps<'input'>,
  ) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`profile-${key}`}>{label}</Label>
      <Input
        id={`profile-${key}`}
        value={draft[key]}
        onChange={set(key)}
        aria-invalid={errors[key] ? true : undefined}
        {...props}
      />
      {errors[key] ? (
        <p className="text-sm text-danger">{errors[key]}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = fromDraft(draft);
        if (!parsed.success) {
          setErrors(
            Object.fromEntries(
              parsed.error.issues.map((issue) => [
                String(issue.path[0]),
                issue.code === 'invalid_type' ? 'Enter a number' : issue.message,
              ]),
            ),
          );
          return;
        }
        setErrors({});
        save.mutate(parsed.data);
      }}
    >
      <Card className="grid gap-5 sm:grid-cols-2">
        {field('netIncome', 'Monthly take-home pay', 'After tax, what lands in your account.', {
          inputMode: 'decimal',
        })}
        {field('expenses', 'Monthly living expenses', 'Rent, food, insurance, debt payments.', {
          inputMode: 'decimal',
        })}
        {field(
          'savings',
          'Savings you could draw on',
          'Cash and easy-access savings, not pensions.',
          { inputMode: 'decimal' },
        )}
        {field('currency', 'Currency', 'A 3-letter code such as USD or EUR.', {
          maxLength: 3,
          className: 'uppercase',
        })}
        {field('dependents', 'People who depend on your income', undefined, {
          inputMode: 'numeric',
        })}
        {field('country', 'Country', undefined, { maxLength: 60, autoComplete: 'country-name' })}
      </Card>
      <Card className="flex flex-col gap-3">
        <p id="risk-label" className="text-sm font-medium">
          How much financial risk are you comfortable with?
        </p>
        <RadioGroup
          aria-labelledby="risk-label"
          value={draft.riskTolerance}
          onValueChange={(value) => {
            save.reset();
            setDraft((d) => ({ ...d, riskTolerance: value as RiskTolerance }));
          }}
          className="sm:grid-cols-3"
        >
          {RISK_TOLERANCES.map((risk) => (
            <RadioCard key={risk} value={risk}>
              {RISK_LABELS[risk]}
            </RadioCard>
          ))}
        </RadioGroup>
      </Card>
      {save.isError ? (
        <Notice variant="error" title="We couldn't save your profile">
          {errorMessage(save.error)}
        </Notice>
      ) : null}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={save.isPending}>
          {save.isSuccess ? <Check /> : null}
          {save.isSuccess ? 'Saved' : 'Save profile'}
        </Button>
        <p className="text-sm text-muted">Used to pre-fill your next simulation. Never shared.</p>
      </div>
    </form>
  );
}

export function ProfileForm() {
  const profile = useQuery({ queryKey: queryKeys.profile, queryFn: api.profile });
  if (profile.isPending) return <Skeleton className="h-96" />;
  if (profile.isError) {
    return (
      <Notice variant="error" title="We couldn't load your profile">
        {errorMessage(profile.error)}
      </Notice>
    );
  }
  return <Form initial={profile.data.profile ?? EMPTY_PROFILE} />;
}
