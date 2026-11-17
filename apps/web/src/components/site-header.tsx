import { Show, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs';
import { LayoutGrid, Plus, UserRound } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { clerkEnabled } from '@/lib/clerk';

const NAV = [
  { href: '/new', label: 'New simulation', icon: Plus },
  { href: '/dashboard', label: 'My simulations', icon: LayoutGrid },
  { href: '/settings/profile', label: 'Profile', icon: UserRound },
] as const;

/** Clerk's controls read the request, so they sit inside Suspense. */
function AuthControls() {
  return (
    <Suspense>
      <Show when="signed-out">
        <SignInButton>
          <Button variant="ghost" size="sm">
            Sign in
          </Button>
        </SignInButton>
        <SignUpButton>
          <Button size="sm" className="hidden sm:inline-flex">
            Sign up
          </Button>
        </SignUpButton>
      </Show>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </Suspense>
  );
}

/** Top bar on every page. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
      <nav
        aria-label="Main"
        className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-2 px-4 sm:px-6"
      >
        <Link
          href="/"
          className="font-mono text-xs font-semibold tracking-widest uppercase hover:text-accent"
        >
          Futuria
        </Link>
        <div className="flex items-center gap-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Button key={href} asChild variant="ghost" size="sm" className="px-2.5 sm:px-3">
              <Link href={href} aria-label={label} title={label}>
                <Icon />
                <span className="hidden md:inline">{label}</span>
              </Link>
            </Button>
          ))}
          <ThemeToggle />
          {clerkEnabled ? <AuthControls /> : null}
        </div>
      </nav>
    </header>
  );
}
