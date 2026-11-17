import Link from 'next/link';

/** Shown on the sign-in/up pages when Clerk keys aren't configured (local dev, CI). */
export function AuthDisabled() {
  return (
    <div className="max-w-md text-center">
      <h1 className="text-lg font-semibold">Accounts aren&apos;t set up here</h1>
      <p className="mt-2 text-sm text-muted">
        This copy of FUTURIA runs without sign-in, so you are using a local test account. Add the
        Clerk keys to enable accounts.
      </p>
      <Link href="/" className="mt-4 inline-block text-sm text-accent hover:underline">
        Back to FUTURIA
      </Link>
    </div>
  );
}
