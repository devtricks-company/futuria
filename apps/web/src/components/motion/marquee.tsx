import { Fragment } from 'react';
import { cn } from '@/lib/utils';

/** A four-point spark between items; turns slowly while the strip moves. */
function Spark() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="mx-6 size-8 shrink-0 text-accent motion-safe:animate-[spin-slow_9s_linear_infinite] sm:mx-10 sm:size-12"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M12 0c.6 6.4 5.6 11.4 12 12-6.4.6-11.4 5.6-12 12-.6-6.4-5.6-11.4-12-12C6.4 11.4 11.4 6.4 12 0Z"
      />
    </svg>
  );
}

/**
 * A strip of large outlined words scrolling sideways forever (the reference's text slider).
 * Decorative: hidden from assistive tech, still under reduced motion, paused on hover.
 */
export function Marquee({ items, className }: { items: readonly string[]; className?: string }) {
  const row = (copy: number) => (
    <div className="flex shrink-0 items-center" key={copy}>
      {items.map((item) => (
        <Fragment key={item}>
          <span className="text-outline font-display text-5xl leading-none whitespace-nowrap sm:text-7xl lg:text-8xl">
            {item}
          </span>
          <Spark />
        </Fragment>
      ))}
    </div>
  );
  return (
    <div
      aria-hidden
      className={cn(
        'overflow-hidden py-2 [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]',
        className,
      )}
    >
      <div className="flex w-max motion-safe:animate-[marquee_45s_linear_infinite] hover:[animation-play-state:paused]">
        {row(0)}
        {row(1)}
      </div>
    </div>
  );
}
