'use client';

import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
}

const statusConfig: Record<string, { label: string; className: string; pulse?: boolean; glow?: boolean }> = {
  uploaded: {
    label: 'Uploaded',
    className: 'bg-cme-text-muted/20 text-cme-text-muted border-cme-text-muted/30',
  },
  analyzing: {
    label: 'Analyzing',
    className: 'bg-cme-warning/20 text-cme-warning border-cme-warning/30',
    pulse: true,
  },
  analyzed: {
    label: 'Analyzed',
    className: 'bg-cme-success/20 text-cme-success border-cme-success/30',
  },
  generating: {
    label: 'Generating',
    className: 'bg-cme-primary/20 text-cme-primary border-cme-primary/30',
    pulse: true,
  },
  completed: {
    label: 'Completed',
    className: 'bg-cme-success/20 text-cme-success border-cme-success/30',
    glow: true,
  },
  failed: {
    label: 'Failed',
    className: 'bg-cme-error/20 text-cme-error border-cme-error/30',
  },
};

function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] || {
    label: status,
    className: 'bg-cme-text-muted/20 text-cme-text-muted border-cme-text-muted/30',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
        config.className,
        config.pulse && 'animate-pulse',
        config.glow && 'shadow-[0_0_8px_rgba(0,200,150,0.3)]'
      )}
    >
      {config.pulse && (
        <span
          className={cn(
            'mr-1.5 h-1.5 w-1.5 rounded-full',
            status === 'analyzing' && 'bg-cme-warning',
            status === 'generating' && 'bg-cme-primary'
          )}
        />
      )}
      {config.label}
    </span>
  );
}

export { StatusBadge };
