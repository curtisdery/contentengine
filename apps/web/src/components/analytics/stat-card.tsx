'use client';

import * as React from 'react';
import { cn, formatNumber, formatPercentage } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  trend?: {
    direction: 'up' | 'down' | 'stable';
    percentage?: number;
  };
  format?: 'number' | 'percentage' | 'multiplier';
  accentColor?: string;
  delay?: number;
}

function StatCard({
  label,
  value,
  icon,
  trend,
  format = 'number',
  accentColor = '#6c5ce7',
  delay = 0,
}: StatCardProps) {
  const [isVisible, setIsVisible] = React.useState(false);
  const [displayValue, setDisplayValue] = React.useState(0);
  const numericValue = typeof value === 'number' ? value : 0;

  React.useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  React.useEffect(() => {
    if (!isVisible || typeof value !== 'number') return;

    const duration = 1200;
    const steps = 40;
    const stepDuration = duration / steps;
    let currentStep = 0;

    const interval = setInterval(() => {
      currentStep++;
      const progress = currentStep / steps;
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(numericValue * eased));

      if (currentStep >= steps) {
        setDisplayValue(numericValue);
        clearInterval(interval);
      }
    }, stepDuration);

    return () => clearInterval(interval);
  }, [isVisible, numericValue, value]);

  function getFormattedValue(): string {
    if (typeof value === 'string') return value;
    const v = isVisible ? displayValue : 0;
    switch (format) {
      case 'percentage':
        return formatPercentage(v);
      case 'multiplier':
        return `${v}x`;
      default:
        return formatNumber(v);
    }
  }

  const trendIcon = trend ? (
    trend.direction === 'up' ? (
      <TrendingUp className="h-3.5 w-3.5" />
    ) : trend.direction === 'down' ? (
      <TrendingDown className="h-3.5 w-3.5" />
    ) : (
      <Minus className="h-3.5 w-3.5" />
    )
  ) : null;

  const trendColor =
    trend?.direction === 'up'
      ? 'text-cme-success'
      : trend?.direction === 'down'
        ? 'text-cme-error'
        : 'text-cme-text-muted';

  return (
    <Card
      className={cn(
        'group relative overflow-hidden transition-all duration-500 hover:border-cme-primary/30',
        isVisible
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-4'
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-transparent group-hover:from-cme-primary/[0.03] group-hover:to-cme-secondary/[0.03] transition-all duration-500" />
      <div className="relative p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-cme-text-muted">
              {label}
            </p>
            <p className="font-mono text-2xl font-bold text-cme-text">
              {getFormattedValue()}
            </p>
            {trend && (
              <div className={cn('flex items-center gap-1 text-xs font-medium', trendColor)}>
                {trendIcon}
                {trend.percentage !== undefined && (
                  <span>{trend.percentage > 0 ? '+' : ''}{trend.percentage.toFixed(1)}%</span>
                )}
              </div>
            )}
          </div>
          <div
            className="shrink-0 rounded-xl p-3 transition-all duration-300 group-hover:scale-110"
            style={{
              backgroundColor: `${accentColor}15`,
              color: accentColor,
            }}
          >
            {icon}
          </div>
        </div>
      </div>
    </Card>
  );
}

export { StatCard };
export type { StatCardProps };
