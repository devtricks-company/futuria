import { AlertTriangle, Info, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const STYLES = {
  info: { box: 'border-border bg-surface-muted text-foreground', icon: Info },
  warning: {
    box: 'border-estimate-border/50 bg-estimate-surface text-estimate',
    icon: AlertTriangle,
  },
  error: { box: 'border-danger/40 bg-danger-surface text-danger', icon: XCircle },
} as const;

/** An inline callout: errors, warnings and notes. */
export function Notice({
  variant = 'info',
  title,
  children,
  action,
  className,
}: {
  variant?: keyof typeof STYLES;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const { box, icon: Icon } = STYLES[variant];
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-xl border px-4 py-3 text-sm', box, className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className={title ? 'opacity-90' : undefined}>{children}</div> : null}
        {action ? <div className="mt-1">{action}</div> : null}
      </div>
    </div>
  );
}
