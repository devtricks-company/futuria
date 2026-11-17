import { Show, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs';
import Link from 'next/link';
import { Suspense } from 'react';

/** Top bar on every page. The auth controls read the request, so they sit inside Suspense. */
export function SiteHeader() {
  return (
    <header className="border-b border-border">
      <nav className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="font-mono text-xs font-semibold tracking-widest uppercase">
          Futuria
        </Link>
        <div className="flex h-8 items-center gap-2">
          <Suspense>
            <Show when="signed-out">
              <SignInButton>
                <button
                  type="button"
                  className="rounded-full px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground"
                >
                  Sign in
                </button>
              </SignInButton>
              <SignUpButton>
                <button
                  type="button"
                  className="rounded-full bg-accent px-3 py-1.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
                >
                  Sign up
                </button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <UserButton />
            </Show>
          </Suspense>
        </div>
      </nav>
    </header>
  );
}
