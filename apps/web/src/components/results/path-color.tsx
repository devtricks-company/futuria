import { cn } from '@/lib/utils';

/**
 * A path keeps its colour everywhere (cards, charts, tabs) by its position in the model, never by
 * rank. Slots come from the validated categorical palette in globals.css.
 */
export function pathColor(index: number): string {
  return `var(--series-${(index % 8) + 1})`;
}

/** A colour key beside text: the text itself never wears the series colour. */
export function PathSwatch({
  index,
  shape = 'dot',
  className,
}: {
  index: number;
  shape?: 'dot' | 'line';
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block shrink-0',
        shape === 'dot' ? 'size-2.5 rounded-full' : 'h-0.5 w-3.5 rounded-full',
        className,
      )}
      style={{ background: pathColor(index) }}
    />
  );
}
