import { cn } from '@/lib/utils';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'circular' | 'text';
}

function Skeleton({ className, variant = 'default', ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden bg-cme-surface-hover',
        'before:absolute before:inset-0',
        'before:bg-gradient-to-r before:from-transparent before:via-cme-border/30 before:to-transparent',
        'before:animate-shimmer before:bg-[length:200%_100%]',
        variant === 'circular' && 'rounded-full',
        variant === 'text' && 'rounded h-4',
        variant === 'default' && 'rounded-lg',
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
