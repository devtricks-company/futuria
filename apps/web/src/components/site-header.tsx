import { Show, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { Logo } from '@/components/brand';
import {
  HeaderMobileMenu,
  HeaderNav,
  HeaderShell,
  MobileMenu,
  NavLinks,
} from '@/components/header-nav';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { clerkEnabled } from '@/lib/clerk';

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
          <Button size="sm" variant="secondary" className="hidden sm:inline-flex">
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

/** Top bar on every page: brand, named destinations, one persistent call to action. */
export function SiteHeader() {
  return (
    <HeaderShell>
      <nav
        aria-label="Main"
        className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 px-4 sm:h-18 sm:px-6"
      >
        <Link
          href="/"
          aria-label="Futuria home"
          className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Logo />
        </Link>
        <Suspense fallback={<NavLinks pathname={null} />}>
          <HeaderNav />
        </Suspense>
        <div className="flex items-center gap-1">
          <ThemeToggle className="hidden md:inline-flex" />
          {clerkEnabled ? <AuthControls /> : null}
          <Button asChild size="sm" className="ml-1 px-3 sm:px-4">
            <Link href="/new" aria-label="New simulation" title="New simulation">
              <Plus />
              <span className="hidden sm:inline">New simulation</span>
            </Link>
          </Button>
          <Suspense fallback={<MobileMenu pathname={null} />}>
            <HeaderMobileMenu />
          </Suspense>
        </div>
      </nav>
    </HeaderShell>
  );
}
