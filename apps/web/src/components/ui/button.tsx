'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cme-primary focus-visible:ring-offset-2 focus-visible:ring-offset-cme-bg disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-cme-primary text-white hover:bg-cme-primary-hover active:scale-[0.98] shadow-[0_0_20px_rgba(108,92,231,0.2)] hover:shadow-[0_0_30px_rgba(108,92,231,0.35)]',
        secondary:
          'bg-cme-secondary text-cme-bg hover:bg-cme-secondary/90 active:scale-[0.98] shadow-[0_0_20px_rgba(0,206,201,0.2)] hover:shadow-[0_0_30px_rgba(0,206,201,0.35)]',
        outline:
          'border border-cme-border bg-transparent text-cme-text hover:bg-cme-surface-hover hover:border-cme-border-bright active:scale-[0.98]',
        ghost:
          'bg-transparent text-cme-text hover:bg-cme-surface-hover active:scale-[0.98]',
        destructive:
          'bg-cme-error text-white hover:bg-cme-error/90 active:scale-[0.98] shadow-[0_0_20px_rgba(225,112,85,0.2)]',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        default: 'h-10 px-4 py-2',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading, children, disabled, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button, buttonVariants };
