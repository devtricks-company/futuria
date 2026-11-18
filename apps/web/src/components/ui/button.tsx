import { type VariantProps, cva } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'relative isolate inline-flex shrink-0 items-center justify-center gap-2 overflow-hidden rounded-full text-sm font-semibold whitespace-nowrap transition-[color,background-color,background-position,border-color,box-shadow,transform] duration-300 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // The brand gradient slides across on hover (background is 3x wide).
        primary:
          'bg-brand text-on-brand shadow-glow duration-500 hover:[background-position:100%_50%] hover:shadow-[0_1px_0_rgb(255_255_255/0.4)_inset,0_14px_34px_-10px_rgb(11_207_119/0.7)]',
        // A circle grows from the centre to fill the button on hover.
        secondary:
          'border border-border-strong bg-surface text-foreground shadow-card after:absolute after:top-1/2 after:left-1/2 after:-z-10 after:aspect-square after:w-[115%] after:-translate-1/2 after:scale-0 after:rounded-full after:bg-surface-muted after:transition-transform after:duration-500 after:ease-[var(--ease-out)] hover:after:scale-100',
        ghost: 'font-medium text-muted hover:bg-surface-muted hover:text-foreground',
        danger: 'bg-danger text-background hover:brightness-110',
        link: 'h-auto overflow-visible rounded-none px-0 text-accent underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-9 px-3.5',
        md: 'h-11 px-5',
        lg: 'h-12 px-7 text-base',
        icon: 'size-10',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  /** Render the child element (e.g. a Link) with button styles. */
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      type={asChild ? undefined : (type ?? 'button')}
      {...props}
    />
  );
}
