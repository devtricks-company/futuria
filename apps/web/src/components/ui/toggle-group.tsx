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
        'inline-flex w-full rounded-full border border-border bg-surface-muted p-1 sm:w-auto',
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
        'inline-flex h-9 flex-1 items-center justify-center rounded-full px-3.5 text-sm font-semibold whitespace-nowrap text-muted transition-[color,background-color,box-shadow] duration-300 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=on]:bg-surface data-[state=on]:text-foreground data-[state=on]:shadow-[0_1px_2px_rgb(0_0_0/0.12),0_0_0_1px_color-mix(in_oklab,var(--accent)_45%,transparent)] sm:flex-none',
        className,
      )}
      {...props}
    />
  );
}
