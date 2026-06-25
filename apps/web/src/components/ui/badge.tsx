import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-accent/20 text-accent',
        secondary: 'border-transparent bg-edge/60 text-slate-400',
        destructive: 'border-transparent bg-danger/15 text-danger',
        outline: 'border-edge text-slate-400',
        signal: 'border-transparent bg-signal/15 text-signal',
        warn: 'border-transparent bg-warn/15 text-warn',
        violet: 'border-transparent bg-violet/15 text-violet',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
