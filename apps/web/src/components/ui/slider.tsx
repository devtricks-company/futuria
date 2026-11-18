'use client';

import { Slider as SliderPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Slider({ className, ...props }: ComponentProps<typeof SliderPrimitive.Root>) {
  const thumbs = (props.value ?? props.defaultValue ?? [0]).length;
  return (
    <SliderPrimitive.Root
      className={cn(
        'relative flex w-full touch-none items-center py-2 select-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-border">
        <SliderPrimitive.Range className="absolute h-full rounded-full bg-[linear-gradient(90deg,var(--grad-1),var(--grad-2))]" />
      </SliderPrimitive.Track>
      {Array.from({ length: thumbs }, (_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          aria-label={props['aria-label']}
          className="block size-5 cursor-grab rounded-full border border-black/10 bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25),0_0_0_3px_color-mix(in_oklab,var(--accent)_22%,transparent)] transition-[box-shadow,transform] outline-none hover:scale-110 active:scale-115 focus-visible:shadow-[0_1px_3px_rgb(0_0_0/0.25),0_0_0_5px_color-mix(in_oklab,var(--accent)_35%,transparent)] active:cursor-grabbing"
        />
      ))}
    </SliderPrimitive.Root>
  );
}
