'use client';

import * as React from 'react';
import { Copy, Check, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { ContentDNA } from '@/types/api';

interface DNACardProps {
  dna: ContentDNA;
  isLoading?: boolean;
  selectedHookIndex?: number | null;
  onSelectHook?: (index: number) => void;
}

const toneColors: Record<string, string> = {
  educational: 'bg-blue-500/70',
  provocative: 'bg-orange-500/70',
  inspirational: 'bg-purple-500/70',
  tactical: 'bg-green-500/70',
  emotional: 'bg-pink-500/70',
  analytical: 'bg-cyan-500/70',
  narrative: 'bg-amber-500/70',
  humorous: 'bg-yellow-500/70',
};

const hookTypeBadgeVariant: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'error' | 'outline'> = {
  story: 'default',
  stat: 'secondary',
  contrarian: 'error',
  question: 'warning',
  bold_claim: 'success',
  lesson: 'outline',
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="shrink-0 rounded-md p-1.5 text-cme-text-muted hover:text-cme-text hover:bg-cme-surface-hover transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cme-primary"
      aria-label="Copy to clipboard"
    >
      {copied ? (
        <Check className="h-4 w-4 text-cme-success" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </button>
  );
}

function DNACardSkeleton() {
  return (
    <div className="space-y-8">
      {/* Core Idea Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-6 w-full" />
          <Skeleton className="mt-2 h-6 w-3/4" />
        </CardContent>
      </Card>

      {/* Key Points Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-28" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-2.5 w-2/3" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Hooks Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-24" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quotes Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>

      {/* Emotional Arc Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>

      {/* Platforms Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DNACard({ dna, isLoading, selectedHookIndex, onSelectHook }: DNACardProps) {
  if (isLoading) {
    return <DNACardSkeleton />;
  }

  const sortedPlatforms = [...dna.suggested_platforms].sort(
    (a, b) => b.fit_score - a.fit_score
  );

  return (
    <div className="space-y-6">
      {/* Core Idea */}
      <Card glow="primary">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-cme-primary" />
            Core Idea
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-gradient-to-br from-cme-primary/5 to-cme-secondary/5 p-6 border border-cme-border/50">
            <p className="text-lg font-medium leading-relaxed text-cme-text">
              {dna.core_idea}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Key Points */}
      <Card>
        <CardHeader>
          <CardTitle>Key Points</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            {dna.key_points.map((point, index) => {
              const strengthPercent = Math.round(point.strength * 100);
              return (
                <div key={index} className="space-y-2">
                  <div className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cme-primary/20 text-xs font-bold text-cme-primary">
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-cme-text">{point.point}</p>
                      <p className="mt-1 text-sm text-cme-text-muted">
                        {point.description}
                      </p>
                    </div>
                  </div>
                  <div className="ml-9 flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-cme-surface-hover">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cme-primary to-cme-secondary transition-all duration-700 ease-out"
                        style={{ width: `${strengthPercent}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-xs text-cme-text-muted">
                      {strengthPercent}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Best Hooks */}
      <Card>
        <CardHeader>
          <CardTitle>Best Hooks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {dna.best_hooks.map((hook, index) => {
              const isSelected = selectedHookIndex === index;
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => onSelectHook?.(index)}
                  className={cn(
                    'group rounded-xl border p-4 text-left transition-all duration-200',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cme-primary',
                    isSelected
                      ? 'border-cme-primary bg-cme-primary/10 shadow-[0_0_20px_rgba(108,92,231,0.15)]'
                      : 'border-cme-border bg-cme-surface/50 hover:border-cme-border-bright hover:bg-cme-surface-hover backdrop-blur-sm'
                  )}
                >
                  <div className="mb-3 flex items-center gap-2">
                    <Badge
                      variant={hookTypeBadgeVariant[hook.hook_type] || 'outline'}
                    >
                      {hook.hook_type.replace('_', ' ')}
                    </Badge>
                    {isSelected && (
                      <Badge variant="secondary">Selected</Badge>
                    )}
                  </div>
                  <p className="text-sm font-medium text-cme-text leading-relaxed">
                    &ldquo;{hook.hook}&rdquo;
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {hook.platform_fit.map((platform) => (
                      <span
                        key={platform}
                        className="rounded-md bg-cme-surface-hover px-2 py-0.5 text-[10px] text-cme-text-muted"
                      >
                        {platform}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Quotable Moments */}
      {dna.quotable_moments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Quotable Moments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {dna.quotable_moments.map((quote, index) => (
                <div
                  key={index}
                  className="group flex items-start gap-3 rounded-lg border border-cme-border bg-cme-surface/50 p-4 backdrop-blur-sm transition-colors hover:border-cme-border-bright"
                >
                  <div className="mt-0.5 h-8 w-1 shrink-0 rounded-full bg-gradient-to-b from-cme-primary to-cme-secondary" />
                  <p className="flex-1 text-sm italic text-cme-text leading-relaxed">
                    &ldquo;{quote}&rdquo;
                  </p>
                  <CopyButton text={quote} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Emotional Arc */}
      {dna.emotional_arc.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Emotional Arc</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 overflow-x-auto pb-2">
              {dna.emotional_arc.map((segment, index) => {
                const height = Math.max(segment.intensity * 100, 20);
                const colorClass =
                  toneColors[segment.tone.toLowerCase()] || 'bg-cme-primary/70';

                return (
                  <div
                    key={index}
                    className="group flex min-w-[60px] flex-1 flex-col items-center gap-2"
                  >
                    <div className="relative flex w-full justify-center">
                      <div
                        className={cn(
                          'w-full max-w-[80px] rounded-t-lg transition-all duration-300 group-hover:opacity-100',
                          colorClass
                        )}
                        style={{ height: `${height}px` }}
                      />
                      {/* Tooltip on hover */}
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block">
                        <div className="whitespace-nowrap rounded bg-cme-surface border border-cme-border px-2 py-1 text-[10px] text-cme-text shadow-lg">
                          {Math.round(segment.intensity * 100)}%
                        </div>
                      </div>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] font-medium text-cme-text capitalize">
                        {segment.tone}
                      </p>
                      <p className="text-[9px] text-cme-text-muted truncate max-w-[70px]">
                        {segment.segment}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Legend */}
            <div className="mt-4 flex flex-wrap gap-3 border-t border-cme-border pt-4">
              {Object.entries(toneColors).map(([tone, color]) => {
                const isPresent = dna.emotional_arc.some(
                  (s) => s.tone.toLowerCase() === tone
                );
                if (!isPresent) return null;
                return (
                  <div key={tone} className="flex items-center gap-1.5">
                    <div className={cn('h-2.5 w-2.5 rounded-sm', color)} />
                    <span className="text-[10px] text-cme-text-muted capitalize">
                      {tone}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Suggested Platforms */}
      {sortedPlatforms.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Suggested Platforms</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sortedPlatforms.map((platform) => {
                const fitPercent = Math.round(platform.fit_score * 100);
                const circumference = 2 * Math.PI * 28;
                const strokeDashoffset =
                  circumference - (platform.fit_score * circumference);

                return (
                  <div
                    key={platform.platform_id}
                    className="group flex flex-col items-center rounded-xl border border-cme-border bg-cme-surface/50 p-5 backdrop-blur-sm transition-all duration-200 hover:border-cme-border-bright hover:bg-cme-surface-hover"
                  >
                    {/* Circular progress */}
                    <div className="relative mb-3">
                      <svg
                        width="72"
                        height="72"
                        viewBox="0 0 72 72"
                        className="-rotate-90"
                      >
                        <circle
                          cx="36"
                          cy="36"
                          r="28"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="4"
                          className="text-cme-surface-hover"
                        />
                        <circle
                          cx="36"
                          cy="36"
                          r="28"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="4"
                          strokeDasharray={circumference}
                          strokeDashoffset={strokeDashoffset}
                          strokeLinecap="round"
                          className="text-cme-primary transition-all duration-700 ease-out"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-sm font-bold text-cme-text">
                          {fitPercent}%
                        </span>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-cme-text">
                      {platform.platform_name}
                    </p>
                    <p className="mt-1 text-center text-xs text-cme-text-muted leading-relaxed">
                      {platform.reason}
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export { DNACard, DNACardSkeleton };
