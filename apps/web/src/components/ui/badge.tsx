import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-cme-primary/20 text-cme-primary border border-cme-primary/30',
        secondary: 'bg-cme-secondary/20 text-cme-secondary border border-cme-secondary/30',
        success: 'bg-cme-success/20 text-cme-success border border-cme-success/30',
        warning: 'bg-cme-warning/20 text-cme-warning border border-cme-warning/30',
        error: 'bg-cme-error/20 text-cme-error border border-cme-error/30',
        outline: 'border border-cme-border text-cme-text-muted',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && (
        <span
          className={cn(
            'mr-1.5 h-1.5 w-1.5 rounded-full',
            variant === 'default' && 'bg-cme-primary',
            variant === 'secondary' && 'bg-cme-secondary',
            variant === 'success' && 'bg-cme-success',
            variant === 'warning' && 'bg-cme-warning',
            variant === 'error' && 'bg-cme-error',
            variant === 'outline' && 'bg-cme-text-muted',
            !variant && 'bg-cme-primary'
          )}
        />
      )}
      {children}
    </div>
  );
}

export { Badge, badgeVariants };
