import Link from 'next/link';
import { Logo } from '@/components/brand';

export const DISCLAIMER =
  'FUTURIA shows simulated ranges, not predictions. It is not financial, legal or career advice. Check important decisions with a qualified professional.';

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { href: '/new', label: 'New simulation' },
      { href: '/dashboard', label: 'My simulations' },
      { href: '/settings/profile', label: 'Profile' },
    ],
  },
  {
    title: 'Learn',
    links: [
      { href: '/#how-it-works', label: 'How it works' },
      { href: '/#features', label: 'Features' },
      { href: '/#pricing', label: 'Pricing' },
      { href: '/#faq', label: 'Questions' },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-28 border-t border-border bg-surface/50">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.6fr_1fr_1fr]">
        <div className="flex max-w-md flex-col gap-4">
          <Logo />
          <p className="font-display text-2xl leading-tight">
            Explore the future before you live it.
          </p>
          <p className="text-sm text-muted">{DISCLAIMER}</p>
        </div>
        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title} className="flex flex-col gap-3">
            <p className="text-sm font-bold">{column.title}</p>
            <ul className="flex flex-col gap-1 text-sm">
              {column.links.map((link) => (
                <li key={link.href}>
                  {/* The underline draws in from the left on hover (the reference's link effect). */}
                  <Link
                    href={link.href}
                    className="inline-block bg-[linear-gradient(currentColor,currentColor)] bg-[length:0%_1px] bg-left-bottom bg-no-repeat py-1 text-muted transition-[background-size,color] duration-300 hover:bg-[length:100%_1px] hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-border">
        <p className="mx-auto flex w-full max-w-6xl flex-wrap justify-between gap-2 px-4 py-5 text-xs text-muted sm:px-6">
          <span>© {2026} FUTURIA</span>
          <span>Numbers come from math. The story comes from Claude.</span>
        </p>
      </div>
    </footer>
  );
}
