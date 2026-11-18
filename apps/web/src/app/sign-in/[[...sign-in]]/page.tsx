import { SignIn } from '@clerk/nextjs';
import { Suspense } from 'react';
import { AuthDisabled } from '@/components/auth-disabled';
import { clerkEnabled } from '@/lib/clerk';

export default function SignInPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      {clerkEnabled ? (
        <Suspense>
          <SignIn />
        </Suspense>
      ) : (
        <AuthDisabled />
      )}
    </main>
  );
}
