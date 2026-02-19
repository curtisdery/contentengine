'use client';

import * as React from 'react';
import { AlertTriangle, X, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getPlatformConfig } from '@/components/content/platform-badge';
import type { ContentGapResponse } from '@/types/api';

interface ContentGapAlertProps {
  gaps: ContentGapResponse[];
}

function ContentGapAlert({ gaps }: ContentGapAlertProps) {
  const [dismissed, setDismissed] = React.useState(false);

  const significantGaps = gaps.filter(
    (g) => g.gap_severity === 'moderate' || g.gap_severity === 'severe'
  );

  if (dismissed || significantGaps.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'relative rounded-xl border overflow-hidden',
        'bg-gradient-to-r from-amber-500/5 via-amber-500/10 to-orange-500/5',
        'border-amber-500/20',
        'animate-fade-in'
      )}
    >
      {/* Ambient glow */}
      <div className="absolute inset-0 bg-gradient-to-r from-amber-500/3 to-orange-500/3 pointer-events-none" />

      <div className="relative p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="shrink-0 mt-0.5 rounded-lg bg-amber-500/15 p-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
            </div>
            <div className="min-w-0 space-y-2">
              <p className="text-sm font-medium text-amber-300">
                Content Gaps Detected
              </p>
              <div className="space-y-1.5">
                {significantGaps.map((gap) => {
                  const platform = getPlatformConfig(gap.platform_id);
                  const isSevere = gap.gap_severity === 'severe';

                  return (
                    <div
                      key={gap.platform_id}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span
                        className={cn(
                          'h-2 w-2 shrink-0 rounded-full',
                          platform.bgClass
                        )}
                      />
                      <span
                        className={cn(
                          'font-medium',
                          isSevere ? 'text-amber-300' : 'text-amber-400/80'
                        )}
                      >
                        {platform.name}
                      </span>
                      <span className="text-cme-text-muted">
                        {gap.days_since_last} days since last post
                      </span>
                      <ArrowRight className="h-3 w-3 text-cme-text-muted" />
                      <span className="text-amber-400/70 italic truncate">
                        {gap.suggestion}
                      </span>
                      {isSevere && (
                        <span className="shrink-0 rounded-full bg-cme-error/20 px-1.5 py-0.5 text-[10px] font-medium text-cme-error">
                          Urgent
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <button
            onClick={() => setDismissed(true)}
            className="shrink-0 rounded-md p-1 text-cme-text-muted hover:text-cme-text hover:bg-cme-surface-hover transition-colors"
            aria-label="Dismiss content gap alert"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export { ContentGapAlert };
