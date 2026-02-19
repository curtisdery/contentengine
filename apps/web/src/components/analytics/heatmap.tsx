'use client';

import * as React from 'react';
import { cn, formatPercentage } from '@/lib/utils';
import type { TimeHeatmapEntry } from '@/types/api';

interface HeatmapProps {
  data: TimeHeatmapEntry[];
  colorScale?: { low: string; high: string };
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOUR_LABELS = [
  '12am', '', '', '3am', '', '', '6am', '', '', '9am', '', '',
  '12pm', '', '', '3pm', '', '', '6pm', '', '', '9pm', '', '',
];

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

function interpolateColor(
  lowHex: string,
  highHex: string,
  factor: number
): string {
  const low = hexToRgb(lowHex);
  const high = hexToRgb(highHex);
  const r = Math.round(low.r + (high.r - low.r) * factor);
  const g = Math.round(low.g + (high.g - low.g) * factor);
  const b = Math.round(low.b + (high.b - low.b) * factor);
  return `rgb(${r}, ${g}, ${b})`;
}

function Heatmap({
  data,
  colorScale = { low: '#12121a', high: '#6c5ce7' },
}: HeatmapProps) {
  const [isVisible, setIsVisible] = React.useState(false);
  const [tooltip, setTooltip] = React.useState<{
    day: number;
    hour: number;
    rate: number;
    posts: number;
    x: number;
    y: number;
  } | null>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Build a lookup map: key = "day-hour" -> entry
  const dataMap = React.useMemo(() => {
    const map = new Map<string, TimeHeatmapEntry>();
    data.forEach((entry) => {
      map.set(`${entry.day_of_week}-${entry.hour}`, entry);
    });
    return map;
  }, [data]);

  // Compute max engagement rate for normalization
  const maxRate = React.useMemo(() => {
    if (data.length === 0) return 1;
    return Math.max(...data.map((d) => d.avg_engagement_rate), 0.001);
  }, [data]);

  function handleMouseEnter(
    e: React.MouseEvent<HTMLDivElement>,
    day: number,
    hour: number
  ) {
    const entry = dataMap.get(`${day}-${hour}`);
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({
      day,
      hour,
      rate: entry?.avg_engagement_rate ?? 0,
      posts: entry?.post_count ?? 0,
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
  }

  function handleMouseLeave() {
    setTooltip(null);
  }

  function formatHourLabel(hour: number): string {
    if (hour === 0) return '12am';
    if (hour < 12) return `${hour}am`;
    if (hour === 12) return '12pm';
    return `${hour - 12}pm`;
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-cme-text-muted">
        No timing data available yet. Publish content to see engagement patterns.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          {/* Hour labels */}
          <div className="flex mb-1">
            <div className="w-10 shrink-0" />
            {Array.from({ length: 24 }).map((_, hour) => (
              <div
                key={hour}
                className="flex-1 text-center text-[10px] text-cme-text-muted"
              >
                {HOUR_LABELS[hour]}
              </div>
            ))}
          </div>

          {/* Rows */}
          {Array.from({ length: 7 }).map((_, dayIndex) => (
            <div key={dayIndex} className="flex items-center gap-0 mb-0.5">
              {/* Day label */}
              <div className="w-10 shrink-0 text-xs font-medium text-cme-text-muted text-right pr-2">
                {DAY_LABELS[dayIndex]}
              </div>

              {/* Cells */}
              {Array.from({ length: 24 }).map((_, hour) => {
                const entry = dataMap.get(`${dayIndex}-${hour}`);
                const rate = entry?.avg_engagement_rate ?? 0;
                const factor = maxRate > 0 ? rate / maxRate : 0;
                const bgColor = rate > 0
                  ? interpolateColor(colorScale.low, colorScale.high, factor)
                  : colorScale.low;

                return (
                  <div
                    key={hour}
                    className={cn(
                      'flex-1 aspect-square rounded-[3px] cursor-pointer',
                      'transition-all duration-500 hover:ring-1 hover:ring-cme-primary/50 hover:z-10',
                      isVisible ? 'opacity-100' : 'opacity-0'
                    )}
                    style={{
                      backgroundColor: bgColor,
                      transitionDelay: `${(dayIndex * 24 + hour) * 3}ms`,
                      minHeight: '16px',
                      maxHeight: '32px',
                    }}
                    onMouseEnter={(e) => handleMouseEnter(e, dayIndex, hour)}
                    onMouseLeave={handleMouseLeave}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{
            left: tooltip.x,
            top: tooltip.y - 8,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="rounded-lg bg-cme-surface border border-cme-border px-3 py-2 shadow-xl text-xs whitespace-nowrap">
            <p className="font-medium text-cme-text">
              {DAY_LABELS[tooltip.day]} {formatHourLabel(tooltip.hour)}
            </p>
            <p className="text-cme-text-muted mt-0.5">
              {tooltip.rate > 0
                ? `avg ${formatPercentage(tooltip.rate)} engagement (${tooltip.posts} posts)`
                : 'No data'}
            </p>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center justify-end gap-2 text-xs text-cme-text-muted">
        <span>Less</span>
        <div className="flex gap-0.5">
          {[0, 0.25, 0.5, 0.75, 1].map((factor) => (
            <div
              key={factor}
              className="h-3 w-3 rounded-[2px]"
              style={{
                backgroundColor: interpolateColor(
                  colorScale.low,
                  colorScale.high,
                  factor
                ),
              }}
            />
          ))}
        </div>
        <span>More</span>
      </div>
    </div>
  );
}

export { Heatmap };
export type { HeatmapProps };
