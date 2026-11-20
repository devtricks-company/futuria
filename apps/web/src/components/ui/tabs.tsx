'use client';

import { Tabs as TabsPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export const Tabs = TabsPrimitive.Root;

/** Section tabs: an underlined row (segmented pills are for choices, see toggle-group). */
export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        'flex w-full gap-5 overflow-x-auto border-b border-border [scrollbar-width:none] sm:gap-8',
        className,
      )}
      {...props}
    />
  );
}

/** The active tab's underline grows out in the brand gradient, so the switch is visible. */
export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'relative inline-flex h-12 shrink-0 items-center justify-center gap-1.5 text-sm font-semibold whitespace-nowrap text-muted transition-colors outline-none after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:origin-center after:scale-x-0 after:rounded-full after:bg-[linear-gradient(90deg,var(--grad-1),var(--grad-2))] after:transition-transform after:duration-300 after:ease-[var(--ease-out)] hover:text-foreground focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:text-foreground data-[state=active]:after:scale-x-100 [&_svg]:size-4',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn(
        'outline-none data-[state=active]:motion-safe:animate-in data-[state=active]:motion-safe:fade-in-0 data-[state=active]:motion-safe:slide-in-from-bottom-2 data-[state=active]:motion-safe:duration-500',
        className,
      )}
      {...props}
    />
  );
}
