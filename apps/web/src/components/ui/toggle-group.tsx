'use client';

import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

type SegmentedProps = Omit<
  ComponentProps<typeof ToggleGroupPrimitive.Root>,
  'type' | 'value' | 'defaultValue' | 'onValueChange'
> & {
  value: string;
  onValueChange: (value: string) => void;
};

/** A segmented control (always exactly one choice), e.g. Optimistic / Realistic / Pessimistic. */
export function Segmented({ className, value, onValueChange, ...props }: SegmentedProps) {
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      value={value}
      // Radix lets the active item be deselected; a segmented control always keeps a value.
      onValueChange={(next: string) => {
        if (next) onValueChange(next);
      }}
      className={cn(
        'inline-flex w-full rounded-full border border-border bg-surface p-1 sm:w-auto',
        className,
      )}
      {...props}
    />
  );
}

export function SegmentedItem({
  className,
  ...props
}: ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      className={cn(
        'inline-flex h-8 flex-1 items-center justify-center rounded-full px-3 text-sm font-medium whitespace-nowrap text-muted transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=on]:bg-foreground data-[state=on]:text-background sm:flex-none',
        className,
      )}
      {...props}
    />
  );
}
