'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, ExternalLink, RefreshCw, Share2 } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { PlanId, ShareRequest, SimulationDto } from '@futuria/shared';
import { Notice } from '@/components/notice';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { track } from '@/lib/analytics';
import { api, errorMessage, queryKeys } from '@/lib/api';
import { openGate } from '@/lib/gate-events';
import { watermarkUpgrade } from '@/lib/plan-gates';
import { sharePath } from '@/lib/share-view';

/**
 * "Share" on the results page: a read-only public link, without amounts unless the owner opts
 * in. Needs finished results (it's disabled during a run).
 */
export function ShareButton({
  simulation,
  plan,
}: {
  simulation: SimulationDto;
  plan: PlanId | undefined;
}) {
  const [open, setOpen] = useState(false);
  const upgrade = plan ? watermarkUpgrade(plan) : null;
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={!simulation.analysis}
      >
        <Share2 />
        {simulation.share.isPublic ? 'Shared' : 'Share'}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <ShareDialogContent
          simulation={simulation}
          onRemoveWatermark={
            upgrade
              ? () => {
                  // One dialog at a time: the upgrade dialog replaces this one.
                  setOpen(false);
                  openGate({ kind: 'upgrade', reason: 'watermark', plan: upgrade });
                }
              : null
          }
        />
      </Dialog>
    </>
  );
}

function ShareDialogContent({
  simulation,
  onRemoveWatermark,
}: {
  simulation: SimulationDto;
  onRemoveWatermark: (() => void) | null;
}) {
  const queryClient = useQueryClient();
  const share = useMutation({
    mutationFn: (body: ShareRequest) => api.share(simulation.id, body),
    onSuccess: (settings) => {
      // Funnel step: a simulation goes public (not every later change of its settings).
      if (settings.isPublic && !simulation.share.isPublic) {
        track('shared', { showNumbers: settings.showNumbers });
      }
      queryClient.setQueryData<SimulationDto>(queryKeys.simulation(simulation.id), (current) =>
        current ? { ...current, share: settings } : current,
      );
    },
  });
  // While a change is saving, the switches show where they're going.
  const settings = share.isPending ? { ...simulation.share, ...share.variables } : simulation.share;
  const update = (change: Partial<ShareRequest>) =>
    share.mutate({
      isPublic: settings.isPublic,
      showNumbers: settings.showNumbers,
      ...change,
    });

  const url =
    settings.isPublic && simulation.share.slug && typeof window !== 'undefined'
      ? new URL(sharePath(simulation.share.slug), window.location.origin).toString()
      : null;

  return (
    <DialogContent
      title="Share your futures"
      description="A read-only page of this simulation for anyone with the link. You can change or stop sharing at any time."
    >
      <div className="flex flex-col gap-5">
        <SwitchRow
          id="share-public"
          label="Public link"
          checked={settings.isPublic}
          disabled={share.isPending}
          onCheckedChange={(isPublic) => update({ isPublic })}
        >
          Anyone with the link can open it. It isn&apos;t listed anywhere, and search engines are
          asked not to index it.
        </SwitchRow>
        <SwitchRow
          id="share-numbers"
          label="Show amounts and stories"
          checked={settings.showNumbers}
          disabled={share.isPending}
          onCheckedChange={(showNumbers) => update({ showNumbers })}
        >
          {settings.showNumbers
            ? 'Visitors also see your savings, income and expenses, and the Time Machine stories.'
            : 'Visitors see chances, months and the shape of your futures, but no amounts.'}
        </SwitchRow>

        {url ? (
          <ShareLink
            url={url}
            renewing={share.isPending && share.variables?.newLink === true}
            onNewLink={() => update({ newLink: true })}
          />
        ) : null}

        <PublicPreview simulation={simulation} showNumbers={settings.showNumbers} />

        {onRemoveWatermark ? (
          <p className="text-sm text-muted">
            On the Free plan, shared pages and link previews carry a FUTURIA watermark.{' '}
            <Button variant="link" className="h-auto align-baseline" onClick={onRemoveWatermark}>
              Remove it with Pro
            </Button>
          </p>
        ) : null}

        {share.isError ? (
          <Notice variant="error" title="We couldn't change sharing">
            {errorMessage(share.error)}
          </Notice>
        ) : null}
      </div>
    </DialogContent>
  );
}

function SwitchRow({
  id,
  label,
  checked,
  disabled,
  onCheckedChange,
  children,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={id}>{label}</Label>
        <p id={`${id}-hint`} className="text-sm text-muted">
          {children}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-describedby={`${id}-hint`}
        className="mt-0.5"
      />
    </div>
  );
}

function ShareLink({
  url,
  renewing,
  onNewLink,
}: {
  url: string;
  renewing: boolean;
  onNewLink: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    track('share_link_copied');
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // No clipboard access (permissions, older browsers): select it for a manual copy.
      input.current?.select();
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="share-link">Link</Label>
      <div className="flex gap-2">
        <Input
          ref={input}
          id="share-link"
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          className="font-medium"
        />
        <Button variant="secondary" className="h-10" onClick={copy}>
          {copied ? <Check /> : <Copy />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <Button asChild variant="link">
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink />
            Open the page
          </a>
        </Button>
        <Button variant="link" onClick={onNewLink} disabled={renewing}>
          <RefreshCw />
          New link
        </Button>
        <span className="text-xs text-muted">A new link stops the old one from working.</span>
      </div>
    </div>
  );
}

/** Exactly what a stranger sees: the title and path names may be personal, so show them. */
function PublicPreview({
  simulation,
  showNumbers,
}: {
  simulation: SimulationDto;
  showNumbers: boolean;
}) {
  const names = simulation.model?.paths.map((p) => p.name) ?? [];
  return (
    <div className="rounded-2xl border border-border bg-surface-muted/50 p-4 text-sm">
      <p className="font-medium">What the page shows</p>
      <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-muted">
        <li>
          The title: <span className="text-foreground">&ldquo;{simulation.title}&rdquo;</span>
        </li>
        {names.length ? (
          <li>
            Your paths: <span className="text-foreground">{names.join(', ')}</span>
          </li>
        ) : null}
        <li>
          {showNumbers
            ? 'Every number: savings, income, expenses, chances and months, plus the stories'
            : 'Chances of running out, break-even months and what matters most'}
        </li>
        <li>Never your decision text or your answers{showNumbers ? '' : ', and no amounts'}</li>
      </ul>
    </div>
  );
}
