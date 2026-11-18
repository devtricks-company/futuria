'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DEFAULT_THEME, type Theme, applyTheme, currentTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

/** One tap switches between dark and light. The inline script in the root layout applies it on load. */
export function ThemeToggle({ className, withLabel }: { className?: string; withLabel?: boolean }) {
  // Starts as the default on the server; the real value is read after hydration.
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with the page once
    setTheme(currentTheme());
  }, []);

  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  const label = next === 'light' ? 'Switch to light theme' : 'Switch to dark theme';
  return (
    <Button
      variant="ghost"
      size={withLabel ? 'md' : 'icon'}
      aria-label={withLabel ? undefined : label}
      title={label}
      className={cn('overflow-hidden', className)}
      onClick={() => {
        applyTheme(next);
        setTheme(next);
      }}
    >
      {/* The icon swaps with a small turn, so the change reads as a switch. */}
      <span
        key={theme}
        className="inline-flex motion-safe:animate-in motion-safe:spin-in-90 motion-safe:fade-in-0 motion-safe:duration-300"
      >
        {theme === 'dark' ? <Moon /> : <Sun />}
      </span>
      {withLabel ? <span>{label}</span> : null}
    </Button>
  );
}
