import { cn } from '@/lib/utils';

interface LogoProps {
  collapsed?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'text-lg',
  md: 'text-xl',
  lg: 'text-2xl',
};

const taglineSizes = {
  sm: 'text-[9px]',
  md: 'text-[10px]',
  lg: 'text-xs',
};

function Logo({ collapsed = false, className, size = 'md' }: LogoProps) {
  if (collapsed) {
    return (
      <div className={cn('flex items-center justify-center', className)}>
        <span className={cn('gradient-text font-bold', sizeClasses[size])}>
          C
        </span>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col', className)}>
      <div className={cn('gradient-text tracking-tight', sizeClasses[size])}>
        <span className="font-light">Content</span>
        <span className="font-bold">Engine</span>
      </div>
      <span
        className={cn(
          'text-cme-text-muted tracking-widest uppercase',
          taglineSizes[size]
        )}
      >
        Multiply Your Voice
      </span>
    </div>
  );
}

export { Logo };
