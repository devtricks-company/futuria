'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { type Theme, applyTheme, readTheme } from '@/lib/theme';

const NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
const LABEL: Record<Theme, string> = {
  system: 'Theme: system',
  light: 'Theme: light',
  dark: 'Theme: dark',
};

/** Cycles system → light → dark. The inline script in the root layout applies it on load. */
export function ThemeToggle() {
  // Starts as 'system' on the server; the saved value is read after hydration.
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with localStorage once
    setTheme(readTheme());
  }, []);

  useEffect(() => {
    if (theme !== 'system') return;
    // Follow the system setting while on "system".
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`${LABEL[theme]}. Switch theme`}
      title={LABEL[theme]}
      onClick={() => {
        const next = NEXT[theme];
        applyTheme(next);
        setTheme(next);
      }}
    >
      <Icon />
    </Button>
  );
}
