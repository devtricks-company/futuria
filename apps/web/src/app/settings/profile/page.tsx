import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { ProfileForm } from '@/components/profile/profile-form';

export const metadata: Metadata = { title: 'Your profile' };

export default function ProfilePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader
        title="Your profile"
        description="Your financial starting point. We use it to fill in the questions of your next simulation, so you don't have to type it again."
      />
      <ProfileForm />
    </main>
  );
}
