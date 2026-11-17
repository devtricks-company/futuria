import type { Metadata } from 'next';
import { ProfileForm } from '@/components/profile/profile-form';

export const metadata: Metadata = { title: 'Your profile' };

export default function ProfilePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Your profile</h1>
        <p className="mt-1 text-muted">
          Your financial starting point. We use it to fill in the questions of your next simulation,
          so you don&apos;t have to type it again.
        </p>
      </div>
      <ProfileForm />
    </main>
  );
}
