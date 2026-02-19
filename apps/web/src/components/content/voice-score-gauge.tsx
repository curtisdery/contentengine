'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface VoiceScoreGaugeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
}

const sizeConfig = {
  sm: { svgSize: 56, radius: 22, strokeWidth: 3, fontSize: 'text-xs', labelSize: 'text-[9px]' },
  md: { svgSize: 80, radius: 32, strokeWidth: 4, fontSize: 'text-base', labelSize: 'text-[10px]' },
  lg: { svgSize: 110, radius: 44, strokeWidth: 5, fontSize: 'text-xl', labelSize: 'text-xs' },
} as const;

function getScoreColor(score: number): { stroke: string; text: string; glow: string; label: string } {
  if (score >= 90) {
    return {
      stroke: 'stroke-emerald-400',
      text: 'text-emerald-400',
      glow: 'drop-shadow-[0_0_6px_rgba(52,211,153,0.5)]',
      label: 'Excellent',
    };
  }
  if (score >= 70) {
    return {
      stroke: 'stroke-cme-secondary',
      text: 'text-cme-secondary',
      glow: 'drop-shadow-[0_0_6px_rgba(0,206,201,0.4)]',
      label: 'Good',
    };
  }
  if (score >= 50) {
    return {
      stroke: 'stroke-amber-400',
      text: 'text-amber-400',
      glow: 'drop-shadow-[0_0_6px_rgba(251,191,36,0.4)]',
      label: 'Fair',
    };
  }
  return {
    stroke: 'stroke-red-400',
    text: 'text-red-400',
    glow: 'drop-shadow-[0_0_6px_rgba(248,113,113,0.4)]',
    label: 'Needs Review',
  };
}

function VoiceScoreGauge({ score, size = 'md' }: VoiceScoreGaugeProps) {
  const config = sizeConfig[size];
  const circumference = 2 * Math.PI * config.radius;
  const clampedScore = Math.max(0, Math.min(100, score));
  const strokeDashoffset = circumference - (clampedScore / 100) * circumference;
  const colors = getScoreColor(clampedScore);

  const [animated, setAnimated] = React.useState(false);

  React.useEffect(() => {
    const timer = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(timer);
  }, []);

  const center = config.svgSize / 2;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className={cn('relative', colors.glow)}>
        <svg
          width={config.svgSize}
          height={config.svgSize}
          viewBox={`0 0 ${config.svgSize} ${config.svgSize}`}
          className="-rotate-90"
        >
          {/* Background circle */}
          <circle
            cx={center}
            cy={center}
            r={config.radius}
            fill="none"
            strokeWidth={config.strokeWidth}
            className="stroke-cme-surface-hover"
          />
          {/* Progress circle */}
          <circle
            cx={center}
            cy={center}
            r={config.radius}
            fill="none"
            strokeWidth={config.strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={animated ? strokeDashoffset : circumference}
            strokeLinecap="round"
            className={cn(
              colors.stroke,
              'transition-[stroke-dashoffset] duration-1000 ease-out'
            )}
          />
        </svg>
        {/* Center score */}
        <div className="absolute inset-0 flex items-center justify-center rotate-0">
          <span className={cn('font-bold', config.fontSize, colors.text)}>
            {clampedScore}
          </span>
        </div>
      </div>
      <span className={cn('font-medium', config.labelSize, colors.text)}>
        {colors.label}
      </span>
    </div>
  );
}

export { VoiceScoreGauge, getScoreColor };
