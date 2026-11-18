'use client';

import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function RadioGroup({
  className,
  ...props
}: ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return <RadioGroupPrimitive.Root className={cn('grid gap-2', className)} {...props} />;
}

/** A full-width, clickable option card. */
export function RadioCard({
  className,
  children,
  ...props
}: ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 text-left text-sm transition-colors outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:border-accent data-[state=checked]:bg-accent/10',
        className,
      )}
      {...props}
    >
      <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-muted">
        <RadioGroupPrimitive.Indicator className="size-2 rounded-full bg-accent" />
      </span>
      <span className="flex min-w-0 flex-1 items-center justify-between gap-2">{children}</span>
    </RadioGroupPrimitive.Item>
  );
}
