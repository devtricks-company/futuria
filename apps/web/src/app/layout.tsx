import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { clerkEnabled } from '@/lib/clerk';
import { THEME_SCRIPT } from '@/lib/theme';
import './globals.css';

/** One family for everything: bold headings, regular text, tabular numbers. */
const jakarta = Plus_Jakarta_Sans({
  variable: '--font-jakarta',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: { default: 'FUTURIA: explore the future before you live it', template: '%s · FUTURIA' },
  description:
    'Simulate a career decision before you make it: thousands of possible futures, your chance of running out of money, and what you can do about it.',
};

export const viewport: Viewport = {
  themeColor: '#03120f',
};

function Auth({ children }: { children: ReactNode }) {
  return clerkEnabled ? (
    <ClerkProvider
      appearance={{
        variables: { colorPrimary: '#0bcf77' },
      }}
    >
      {children}
    </ClerkProvider>
  ) : (
    children
  );
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${jakarta.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Applies the saved theme before first paint (no flash). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="relative isolate flex min-h-full flex-col overflow-x-clip">
        {/* The green glow and faint grid behind the top of every page. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[46rem]">
          <div className="bg-glow absolute inset-0 motion-safe:animate-[glow-drift_14s_ease-in-out_infinite]" />
          <div className="bg-grid absolute inset-0" />
        </div>
        <a
          href="#main"
          className="sr-only z-50 rounded-full bg-surface px-4 py-2 text-sm font-medium shadow-pop focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        <Auth>
          <Providers>
            <SiteHeader />
            <div id="main" className="flex flex-1 flex-col">
              {children}
            </div>
            <SiteFooter />
          </Providers>
        </Auth>
      </body>
    </html>
  );
}
