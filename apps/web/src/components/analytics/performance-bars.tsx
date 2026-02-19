'use client';

import * as React from 'react';
import { cn, formatNumber } from '@/lib/utils';
import { TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';

interface BarDataItem {
  label: string;
  value: number;
  color: string;
  trend?: 'improving' | 'stable' | 'declining';
  sublabel?: string;
}

interface PerformanceBarsProps {
  data: BarDataItem[];
  maxValue?: number;
  formatValue?: (n: number) => string;
  title?: string;
  emptyMessage?: string;
}

function PerformanceBars({
  data,
  maxValue,
  formatValue,
  title,
  emptyMessage = 'No data available yet.',
}: PerformanceBarsProps) {
  const [isVisible, setIsVisible] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const computedMax = maxValue ?? Math.max(...data.map((d) => d.value), 1);
  const formatter = formatValue ?? formatNumber;

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-cme-text-muted">
        {emptyMessage}
      </div>
    );
  }

  function getTrendIcon(trend?: 'improving' | 'stable' | 'declining') {
    if (!trend) return null;
    switch (trend) {
      case 'improving':
        return <TrendingUp className="h-3.5 w-3.5 text-cme-success" />;
      case 'declining':
        return <TrendingDown className="h-3.5 w-3.5 text-cme-error" />;
      case 'stable':
        return <ArrowRight className="h-3.5 w-3.5 text-cme-text-muted" />;
    }
  }

  return (
    <div ref={containerRef} className="space-y-3">
      {title && (
        <h3 className="text-sm font-medium uppercase tracking-wider text-cme-text-muted">
          {title}
        </h3>
      )}
      {data.map((item, index) => {
        const widthPercent = computedMax > 0 ? (item.value / computedMax) * 100 : 0;

        return (
          <div
            key={`${item.label}-${index}`}
            className={cn(
              'group transition-all duration-500',
              isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'
            )}
            style={{ transitionDelay: `${index * 80}ms` }}
          >
            {/* Label row */}
            <div className="mb-1.5 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="truncate text-sm font-medium text-cme-text">
                  {item.label}
                </span>
                {item.sublabel && (
                  <span className="text-xs text-cme-text-muted hidden sm:inline">
                    {item.sublabel}
                  </span>
                )}
                {getTrendIcon(item.trend)}
              </div>
              <span className="shrink-0 ml-3 font-mono text-sm font-semibold text-cme-text tabular-nums">
                {formatter(item.value)}
              </span>
            </div>

            {/* Bar */}
            <div className="relative h-7 w-full overflow-hidden rounded-lg bg-cme-surface-hover/60">
              <div
                className="absolute inset-y-0 left-0 rounded-lg transition-all duration-1000 ease-out"
                style={{
                  width: isVisible ? `${Math.max(widthPercent, 1)}%` : '0%',
                  backgroundColor: item.color,
                  opacity: 0.8,
                  transitionDelay: `${index * 80 + 200}ms`,
                }}
              />
              {/* Hover highlight */}
              <div
                className="absolute inset-y-0 left-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                style={{
                  width: `${Math.max(widthPercent, 1)}%`,
                  background: `linear-gradient(90deg, ${item.color}40, ${item.color}10)`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export { PerformanceBars };
export type { PerformanceBarsProps, BarDataItem };
