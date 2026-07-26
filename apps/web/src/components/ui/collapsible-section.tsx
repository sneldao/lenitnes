'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './collapsible';
import { cn } from '@/lib/utils';

type CollapsibleSectionProps = {
  /** Header shown on the always-visible trigger row. */
  title: ReactNode;
  /** Optional secondary content on the trigger row (e.g. a count badge). */
  aside?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  contentClassName?: string;
};

/**
 * Disclosure wrapper for the heavy tail of a page (raw evidence,
 * screenshots). Uses the token-driven grid-rows accordion so content
 * clips without height measuring. Keep the trigger row scannable;
 * put the payload behind a click.
 */
export function CollapsibleSection({
  title,
  aside,
  children,
  defaultOpen = false,
  className,
  contentClassName,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={className}>
      <CollapsibleTrigger
        className={cn(
          'group flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border border-edge/50 bg-panel/70 px-5 py-4 text-left backdrop-blur-sm',
          'transition-colors duration-quick hover:border-edge-light/60 hover:bg-panel-hover/60',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          open && 'rounded-b-none border-b-0',
        )}
        aria-expanded={open}
      >
        <span className="section-title flex items-center gap-2 text-slate-300">{title}</span>
        <span className="flex items-center gap-2">
          {aside}
          <ChevronDown
            className={cn(
              'h-4 w-4 text-slate-500 transition-transform duration-fast ease-smooth-out',
              open && 'rotate-180 text-accent',
            )}
          />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="animate-collapsible-down">
        <div
          className={cn(
            'rounded-b-2xl border border-t-0 border-edge/50 bg-panel/50 p-5',
            contentClassName,
          )}
        >
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
