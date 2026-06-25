import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ink disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97] cursor-pointer select-none',
  {
    variants: {
      variant: {
        default:
          'bg-accent text-ink shadow-glow-sm hover:bg-accent-glow hover:shadow-glow active:shadow-none',
        ghost:
          'border border-edge bg-transparent text-slate-300 hover:border-accent/40 hover:text-accent hover:bg-accent/5 active:bg-accent/10',
        danger:
          'bg-danger/10 border border-danger/20 text-danger hover:bg-danger/20 hover:border-danger/40',
        link: 'text-accent underline-offset-4 hover:underline',
      },
      size: {
        default: 'px-5 py-2.5',
        sm: 'px-3 py-1.5 text-xs rounded-lg',
        lg: 'px-7 py-3 text-base',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
