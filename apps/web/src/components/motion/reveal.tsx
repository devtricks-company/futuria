'use client';

import { type CSSProperties, type ReactNode, useEffect, useRef } from 'react';

/** One observer for every reveal on the page; each element is revealed once, then forgotten. */
let observer: IntersectionObserver | null = null;
function revealObserver(): IntersectionObserver {
  observer ??= new IntersectionObserver(
    (entries, self) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.setAttribute('data-revealed', '');
        self.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  );
  return observer;
}

type Tag = 'div' | 'section' | 'li' | 'figure' | 'header' | 'ul' | 'ol';

/**
 * Fades its content up as it scrolls into view (the reference's `it-fade-anim`). The hiding is
 * pure CSS behind `[data-js]` and reduced-motion checks in globals.css, so without JavaScript or
 * with reduced motion the content is simply there.
 */
export function Reveal({
  as: Comp = 'div',
  delay = 0,
  className,
  style,
  children,
  ...rest
}: {
  as?: Tag;
  /** Milliseconds after it enters the viewport; stagger siblings with 80–150 ms steps. */
  delay?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  id?: string;
  'aria-labelledby'?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const io = revealObserver();
    io.observe(element);
    return () => io.unobserve(element);
  }, []);
  return (
    <Comp
      // Each Tag renders an HTMLElement; the union of their ref types is too wide for TS.
      ref={ref as never}
      data-reveal=""
      className={className}
      style={{ ...style, ['--reveal-delay' as string]: `${delay}ms` }}
      {...rest}
    >
      {children}
    </Comp>
  );
}
