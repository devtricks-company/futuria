import { type VariantProps, cva } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3',
  {
    variants: {
      variant: {
        muted: 'border-border bg-surface-muted text-muted',
        accent: 'border-transparent bg-accent/15 text-accent',
        estimate: 'border-estimate-border/50 bg-estimate-surface text-estimate',
        success: 'border-transparent bg-success-surface text-success',
        danger: 'border-transparent bg-danger-surface text-danger',
      },
    },
    defaultVariants: { variant: 'muted' },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
