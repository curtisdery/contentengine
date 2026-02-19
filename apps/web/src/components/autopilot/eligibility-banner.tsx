'use client';

import * as React from 'react';
import { Sparkles, Star, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PlatformBadge } from '@/components/content/platform-badge';

interface EligibilityBannerProps {
  platformId: string;
  platformName: string;
  approvalRate: number;
  reviewCount: number;
  onEnable: () => void;
  onDismiss: () => void;
}

function EligibilityBanner({
  platformId,
  platformName,
  approvalRate,
  reviewCount,
  onEnable,
  onDismiss,
}: EligibilityBannerProps) {
  const [isVisible, setIsVisible] = React.useState(false);

  React.useEffect(() => {
    // Animate in after mount
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(onDismiss, 300); // Wait for animation
  };

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl transition-all duration-500',
        'transform',
        isVisible
          ? 'opacity-100 translate-y-0 scale-100'
          : 'opacity-0 -translate-y-4 scale-95'
      )}
    >
      {/* Animated gradient border */}
      <div className="absolute inset-0 rounded-xl p-[1px] overflow-hidden">
        <div
          className="absolute inset-[-200%] animate-spin"
          style={{
            animationDuration: '4s',
            background:
              'conic-gradient(from 0deg, #6c5ce7, #00cec9, #00b894, #fdcb6e, #6c5ce7)',
          }}
        />
      </div>

      {/* Inner content */}
      <div className="relative rounded-xl bg-cme-surface m-[1px]">
        <div className="absolute inset-0 bg-gradient-to-r from-cme-primary/5 via-cme-secondary/5 to-cme-success/5 pointer-events-none rounded-xl" />

        <div className="relative p-5">
          {/* Dismiss button */}
          <button
            onClick={handleDismiss}
            className="absolute top-3 right-3 text-cme-text-muted hover:text-cme-text transition-colors p-1 rounded-md hover:bg-cme-surface-hover"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-start gap-4">
            {/* Sparkle icon cluster */}
            <div className="shrink-0 relative">
              <div className="rounded-xl bg-cme-success/10 p-3">
                <Sparkles className="h-6 w-6 text-cme-success" />
              </div>
              {/* Floating stars */}
              <Star
                className="absolute -top-1 -right-1 h-3 w-3 text-cme-warning animate-pulse"
                fill="currentColor"
              />
              <Star
                className="absolute -bottom-0.5 -left-1 h-2.5 w-2.5 text-cme-secondary animate-pulse"
                style={{ animationDelay: '0.5s' }}
                fill="currentColor"
              />
            </div>

            <div className="flex-1 min-w-0">
              {/* Title */}
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-base font-semibold text-cme-text">
                  Autopilot Ready!
                </h3>
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cme-success/10 border border-cme-success/20">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cme-success opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cme-success" />
                  </span>
                  <span className="text-[10px] font-medium text-cme-success">
                    Eligible
                  </span>
                </div>
              </div>

              {/* Description */}
              <p className="text-sm text-cme-text-muted mb-3">
                You&apos;ve approved{' '}
                <span className="font-mono font-semibold text-cme-success">
                  {Math.round(approvalRate)}%
                </span>{' '}
                of <PlatformBadge platformId={platformId} size="sm" /> outputs
                without edits across{' '}
                <span className="font-mono font-semibold text-cme-text">
                  {reviewCount}
                </span>{' '}
                reviews. Ready to enable autopilot?
              </p>

              {/* Action buttons */}
              <div className="flex items-center gap-3">
                <Button
                  onClick={onEnable}
                  size="sm"
                  className="gap-1.5 bg-cme-success hover:bg-cme-success/90 text-white shadow-[0_0_20px_rgba(0,184,148,0.25)] hover:shadow-[0_0_30px_rgba(0,184,148,0.4)]"
                >
                  Enable Autopilot
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDismiss}
                  className="text-cme-text-muted"
                >
                  Not Yet
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { EligibilityBanner };
