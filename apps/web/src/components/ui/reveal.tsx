'use client';

import type { ElementType, ReactNode } from 'react';
import { useInView } from '@/lib/hooks/useInView';
import { cn } from '@/lib/utils';

type RevealProps = {
  children: ReactNode;
  /** Stagger index 0-8, maps to reveal-delay-N (150ms steps). */
  delay?: number;
  className?: string;
  as?: ElementType;
};

/**
 * Scroll-triggered reveal. Wraps children in the .reveal CSS from
 * globals.css and flips to .in-view the first time the element
 * intersects the viewport. Content is visible immediately under
 * prefers-reduced-motion (useInView handles that).
 */
export function Reveal({ children, delay = 0, className, as: Tag = 'div' }: RevealProps) {
  const { ref, inView } = useInView();
  return (
    <Tag
      ref={ref}
      className={cn(
        'reveal',
        delay > 0 && `reveal-delay-${Math.min(delay, 8)}`,
        inView && 'in-view',
        className,
      )}
    >
      {children}
    </Tag>
  );
}
