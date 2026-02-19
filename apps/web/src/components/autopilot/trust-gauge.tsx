'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface TrustGaugeProps {
  rate: number;
  threshold: number;
  reviewsCompleted: number;
  reviewsRequired: number;
  size?: 'sm' | 'md';
}

function getGaugeColor(rate: number): string {
  if (rate >= 90) return '#00b894'; // cme-success green
  if (rate >= 80) return '#00cec9'; // cme-secondary teal
  if (rate >= 50) return '#fdcb6e'; // cme-warning yellow
  return '#e17055'; // cme-error red
}

function getGaugeColorClass(rate: number): string {
  if (rate >= 90) return 'text-cme-success';
  if (rate >= 80) return 'text-cme-secondary';
  if (rate >= 50) return 'text-cme-warning';
  return 'text-cme-error';
}

function TrustGauge({
  rate,
  threshold,
  reviewsCompleted,
  reviewsRequired,
  size = 'md',
}: TrustGaugeProps) {
  const isMd = size === 'md';
  const svgSize = isMd ? 120 : 80;
  const strokeWidth = isMd ? 8 : 6;
  const radius = (svgSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Rate arc (0-100%)
  const rateOffset = circumference - (rate / 100) * circumference;

  // Threshold marker position
  const thresholdAngle = (threshold / 100) * 360 - 90; // -90 to start from top
  const thresholdRad = (thresholdAngle * Math.PI) / 180;
  const center = svgSize / 2;
  const markerInner = radius - strokeWidth / 2 - 4;
  const markerOuter = radius + strokeWidth / 2 + 4;

  const thresholdX1 = center + markerInner * Math.cos(thresholdRad);
  const thresholdY1 = center + markerInner * Math.sin(thresholdRad);
  const thresholdX2 = center + markerOuter * Math.cos(thresholdRad);
  const thresholdY2 = center + markerOuter * Math.sin(thresholdRad);

  const color = getGaugeColor(rate);
  const colorClass = getGaugeColorClass(rate);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: svgSize, height: svgSize }}>
        <svg
          width={svgSize}
          height={svgSize}
          viewBox={`0 0 ${svgSize} ${svgSize}`}
          className="transform -rotate-90"
        >
          {/* Background track */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-cme-surface-hover"
          />

          {/* Rate arc */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={rateOffset}
            className="transition-all duration-1000 ease-out"
            style={{
              filter: `drop-shadow(0 0 6px ${color}40)`,
            }}
          />

          {/* Threshold marker line */}
          <line
            x1={thresholdX1}
            y1={thresholdY1}
            x2={thresholdX2}
            y2={thresholdY2}
            stroke="#e4e4f0"
            strokeWidth={2}
            strokeLinecap="round"
            opacity={0.6}
          />
        </svg>

        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn(
              'font-mono font-bold leading-none',
              colorClass,
              isMd ? 'text-xl' : 'text-sm'
            )}
          >
            {Math.round(rate)}%
          </span>
          {isMd && (
            <span className="text-[10px] text-cme-text-muted mt-0.5">
              approval
            </span>
          )}
        </div>
      </div>

      {/* Reviews text */}
      <p className={cn('text-cme-text-muted', isMd ? 'text-xs' : 'text-[10px]')}>
        {reviewsCompleted}/{reviewsRequired} reviews
      </p>
    </div>
  );
}

export { TrustGauge, getGaugeColor, getGaugeColorClass };
