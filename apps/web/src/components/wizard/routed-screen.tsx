import { HeartHandshake, Telescope } from 'lucide-react';
import Link from 'next/link';
import type { IntakeRouting } from '@futuria/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

/** Out of scope: say what FUTURIA covers today. The stored intake is our demand signal. */
function OutOfScope({ decisionText }: { decisionText: string }) {
  return (
    <Card className="flex flex-col gap-4">
      <span className="flex size-10 items-center justify-center rounded-full bg-accent/15 text-accent">
        <Telescope className="size-5" aria-hidden />
      </span>
      <h1 className="text-xl font-semibold">We can&apos;t simulate this one yet</h1>
      <p className="text-muted">
        FUTURIA currently simulates career decisions: quitting to freelance, starting a business,
        switching jobs, or combining a job with a side business.
      </p>
      <blockquote className="border-l-2 border-border pl-3 text-sm text-muted italic">
        {decisionText}
      </blockquote>
      <p className="text-sm text-muted">
        We&apos;ve noted your question. Decisions like yours help us choose what to support next.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/new">Try a career decision</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/">Back home</Link>
        </Button>
      </div>
    </Card>
  );
}

/** Crisis: stop the simulation and point to people who can help right now. */
function Crisis() {
  return (
    <Card className="flex flex-col gap-4">
      <span className="flex size-10 items-center justify-center rounded-full bg-accent/15 text-accent">
        <HeartHandshake className="size-5" aria-hidden />
      </span>
      <h1 className="text-xl font-semibold">It sounds like things are really hard right now</h1>
      <p>
        You don&apos;t have to work through this alone, and a simulation isn&apos;t the right tool
        for this moment. Talking to someone can help.
      </p>
      <ul className="flex flex-col gap-2 text-sm">
        <li>
          <strong>If you are in immediate danger,</strong> call your local emergency number now.
        </li>
        <li>
          <strong>United States:</strong> call or text <a href="tel:988">988</a> (Suicide &amp;
          Crisis Lifeline), any time.
        </li>
        <li>
          <strong>UK and Ireland:</strong> call Samaritans on <a href="tel:116123">116 123</a>,
          free, any time.
        </li>
        <li>
          <strong>Anywhere else:</strong>{' '}
          <a
            href="https://findahelpline.com"
            target="_blank"
            rel="noreferrer"
            className="text-accent underline-offset-4 hover:underline"
          >
            findahelpline.com
          </a>{' '}
          lists free, confidential helplines in your country.
        </li>
      </ul>
      <p className="text-sm text-muted">
        When you feel ready, FUTURIA will be here to help you think through career decisions.
      </p>
    </Card>
  );
}

export function RoutedScreen({
  routing,
  decisionText,
}: {
  routing: Exclude<IntakeRouting, 'ok'>;
  decisionText: string;
}) {
  return routing === 'crisis' ? <Crisis /> : <OutOfScope decisionText={decisionText} />;
}
