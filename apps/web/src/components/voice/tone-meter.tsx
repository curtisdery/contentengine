'use client';

import { cn } from '@/lib/utils';

interface ToneMeterProps {
  metrics: Record<string, number>;
  size?: 'sm' | 'md' | 'lg';
}

const sizeStyles = {
  sm: { barHeight: 'h-1.5', labelText: 'text-[10px]', valueText: 'text-[10px]', gap: 'gap-1.5' },
  md: { barHeight: 'h-2.5', labelText: 'text-xs', valueText: 'text-xs', gap: 'gap-2.5' },
  lg: { barHeight: 'h-3.5', labelText: 'text-sm', valueText: 'text-sm', gap: 'gap-3' },
};

function formatMetricLabel(key: string): string {
  return key
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function ToneMeter({ metrics, size = 'md' }: ToneMeterProps) {
  const styles = sizeStyles[size];
  const entries = Object.entries(metrics);

  if (entries.length === 0) {
    return (
      <p className="text-sm text-cme-text-muted">No tone metrics available.</p>
    );
  }

  return (
    <div className={cn('flex flex-col', styles.gap)}>
      {entries.map(([key, value]) => {
        const normalizedValue = Math.min(Math.max(value, 0), 1);
        const percentage = Math.round(normalizedValue * 100);

        return (
          <div key={key} className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className={cn('font-medium text-cme-text', styles.labelText)}>
                {formatMetricLabel(key)}
              </span>
              <span className={cn('text-cme-text-muted', styles.valueText)}>
                {percentage}%
              </span>
            </div>
            <div
              className={cn(
                'w-full overflow-hidden rounded-full bg-cme-surface-hover',
                styles.barHeight
              )}
            >
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500 ease-out',
                  'bg-gradient-to-r from-cme-text-muted via-cme-primary to-cme-primary'
                )}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export { ToneMeter };
