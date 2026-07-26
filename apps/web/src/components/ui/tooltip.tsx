'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type TooltipProps = {
  /** Explanation shown on hover/focus. Keep to 1-2 sentences. */
  label: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom';
  /** Allow the label to wrap for longer explanations. */
  wide?: boolean;
  className?: string;
};

/**
 * Lightweight CSS-driven tooltip built on the transitions.dev token
 * block (--tt-* in globals.css). Renders as a dashed-underline hint
 * so users can tell it explains something; the bubble appears on
 * hover and keyboard focus.
 */
export function Tooltip({ label, children, side = 'top', wide, className }: TooltipProps) {
  return (
    <span
      className={cn(
        't-tt-wrap cursor-help underline decoration-edge-light decoration-dotted underline-offset-4',
        className,
      )}
    >
      {children}
      <span
        role="tooltip"
        className={cn('t-tt', side === 'bottom' && 't-tt--bottom', wide && 't-tt--wide')}
      >
        {label}
      </span>
    </span>
  );
}
