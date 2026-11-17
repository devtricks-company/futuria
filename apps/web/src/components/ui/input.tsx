import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export const fieldClasses =
  'w-full min-w-0 rounded-xl border border-border bg-surface px-3 text-base text-foreground shadow-xs outline-none transition-colors placeholder:text-muted/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger sm:text-sm';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(fieldClasses, 'h-10', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(fieldClasses, 'min-h-24 py-2.5', className)} {...props} />;
}

export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(fieldClasses, 'h-10 pr-8', className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return <label className={cn('text-sm font-medium text-foreground', className)} {...props} />;
}
