'use client';

import * as React from 'react';
import { cn, getInitials } from '@/lib/utils';

type AvatarSize = 'sm' | 'md' | 'lg';
type StatusIndicator = 'online' | 'offline' | null;

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  alt?: string;
  name?: string;
  size?: AvatarSize;
  status?: StatusIndicator;
}

const sizeClasses: Record<AvatarSize, string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
};

const statusSizeClasses: Record<AvatarSize, string> = {
  sm: 'h-2 w-2 right-0 bottom-0',
  md: 'h-2.5 w-2.5 right-0 bottom-0',
  lg: 'h-3 w-3 right-0.5 bottom-0.5',
};

function Avatar({
  src,
  alt,
  name,
  size = 'md',
  status = null,
  className,
  ...props
}: AvatarProps) {
  const [imageError, setImageError] = React.useState(false);
  const initials = name ? getInitials(name) : '?';
  const showFallback = !src || imageError;

  return (
    <div
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-full',
        'bg-gradient-to-br from-cme-primary/30 to-cme-secondary/30',
        'border border-cme-border',
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {showFallback ? (
        <span className="font-medium text-cme-text">{initials}</span>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src}
          alt={alt || name || 'Avatar'}
          className="h-full w-full rounded-full object-cover"
          onError={() => setImageError(true)}
        />
      )}
      {status && (
        <span
          className={cn(
            'absolute rounded-full border-2 border-cme-bg',
            statusSizeClasses[size],
            status === 'online' ? 'bg-cme-success' : 'bg-cme-text-muted'
          )}
        />
      )}
    </div>
  );
}

export { Avatar };
export type { AvatarProps, AvatarSize, StatusIndicator };
