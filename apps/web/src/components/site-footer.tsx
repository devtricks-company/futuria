import Link from 'next/link';

export const DISCLAIMER =
  'FUTURIA shows simulated ranges, not predictions. It is not financial, legal or career advice. Check important decisions with a qualified professional.';

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted sm:px-6">
        <p className="max-w-3xl">{DISCLAIMER}</p>
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <span>© {2026} FUTURIA</span>
          <Link href="/#how-it-works" className="hover:text-foreground">
            How it works
          </Link>
          <Link href="/#pricing" className="hover:text-foreground">
            Pricing
          </Link>
        </p>
      </div>
    </footer>
  );
}
