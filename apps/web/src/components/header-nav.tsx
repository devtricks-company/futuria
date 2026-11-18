'use client';

import { CircleHelp, LayoutGrid, Menu, Plus, Tag, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

/** Where things are in the app; `marketing` links point at sections of the landing page. */
const NAV = [
  { href: '/#how-it-works', label: 'How it works', icon: CircleHelp, marketing: true },
  { href: '/#pricing', label: 'Pricing', icon: Tag, marketing: true },
  { href: '/dashboard', label: 'My simulations', icon: LayoutGrid, marketing: false },
  { href: '/settings/profile', label: 'Profile', icon: UserRound, marketing: false },
] as const;

const isActive = (pathname: string | null, href: string) =>
  pathname !== null && !href.startsWith('/#') && pathname.startsWith(href);

/** Desktop links with their names; `pathname` marks the current section (null while unknown). */
export function NavLinks({ pathname }: { pathname: string | null }) {
  return (
    <ul className="hidden items-center gap-1 md:flex">
      {NAV.map(({ href, label, marketing }) => {
        const active = isActive(pathname, href);
        return (
          <li key={href} className={cn(marketing && 'hidden lg:block')}>
            <Link
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex h-9 items-center rounded-full px-3.5 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'bg-surface-muted text-foreground'
                  : 'text-muted hover:bg-surface-muted/70 hover:text-foreground',
              )}
            >
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Phones: one "Menu" button opens every destination with its name, plus the theme switch. */
export function MobileMenu({ pathname }: { pathname: string | null }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent title="Menu">
        <nav aria-label="Menu" className="flex flex-col gap-4 pb-2">
          <SheetClose asChild>
            <Button asChild size="lg" className="w-full">
              <Link href="/new">
                <Plus />
                New simulation
              </Link>
            </Button>
          </SheetClose>
          <ul className="flex flex-col gap-1">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <li key={href}>
                  <SheetClose asChild>
                    <Link
                      href={href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex h-12 items-center gap-3 rounded-2xl px-3 text-base font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        active ? 'bg-accent-soft text-foreground' : 'hover:bg-surface-muted',
                      )}
                    >
                      <span className="flex size-8 items-center justify-center rounded-xl bg-surface-muted text-accent">
                        <Icon className="size-4" aria-hidden />
                      </span>
                      {label}
                    </Link>
                  </SheetClose>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-border pt-3">
            <ThemeToggle withLabel className="w-full justify-start px-3" />
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  );
}

/** Reads the URL, so the header renders it inside Suspense (Cache Components). */
export function HeaderNav() {
  return <NavLinks pathname={usePathname()} />;
}

export function HeaderMobileMenu() {
  return <MobileMenu pathname={usePathname()} />;
}

/**
 * The header bar: see-through at the top of the page, a blurred bar with a hairline once the
 * page scrolls under it.
 */
export function HeaderShell({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 8);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  return (
    <header
      data-scrolled={scrolled ? '' : undefined}
      className="sticky top-0 z-30 border-b border-transparent transition-[background-color,border-color,box-shadow] duration-300 data-[scrolled]:border-border/80 data-[scrolled]:bg-background/75 data-[scrolled]:shadow-[0_10px_30px_-20px_rgb(0_0_0/0.6)] data-[scrolled]:backdrop-blur-xl data-[scrolled]:backdrop-saturate-150"
    >
      {children}
    </header>
  );
}
