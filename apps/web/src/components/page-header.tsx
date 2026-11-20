import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Bold title and a short description, with optional actions on the right. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  /** A short context line above the title, only when the title alone isn't enough. */
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-end justify-between gap-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-3 motion-safe:duration-700',
        className,
      )}
    >
      <div className="flex max-w-2xl flex-col gap-2">
        {eyebrow ? <p className="text-sm font-semibold text-accent">{eyebrow}</p> : null}
        <h1 className="font-display text-3xl leading-[1.1] sm:text-4xl">{title}</h1>
        {description ? <p className="text-muted sm:text-lg">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}
