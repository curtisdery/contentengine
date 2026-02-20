'use client';

import * as React from 'react';
import {
  Eye,
  Heart,
  FileText,
  Send,
  Globe,
  Percent,
  Lightbulb,
  BookOpen,
  Layout,
  Clock,
  TrendingUp,
  Zap,
  Sparkles,
  BarChart3,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { MultiplierScoreHero } from '@/components/analytics/multiplier-score-hero';
import { StatCard } from '@/components/analytics/stat-card';
import { PerformanceBars } from '@/components/analytics/performance-bars';
import { Heatmap } from '@/components/analytics/heatmap';
import { cn, formatNumber, formatPercentage } from '@/lib/utils';
import { apiClient } from '@/lib/api';
import { getPlatformConfig } from '@/components/content/platform-badge';
import type {
  AnalyticsDashboardResponse,
  PlatformPerformanceResponse,
  ContentTypePerformanceResponse,
  HookPerformanceResponse,
  TimeHeatmapEntry,
  AudienceIntelligenceResponse,
  ContentStrategySuggestion,
} from '@/types/api';

// ---------------------------------------------------------------------------
// Section loading wrapper
// ---------------------------------------------------------------------------

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  isLoading: boolean;
  error: string | null;
  delay?: number;
}

function Section({ title, icon, children, isLoading, error, delay = 0 }: SectionProps) {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <section
      className={cn(
        'transition-all duration-700',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
      )}
    >
      <div className="mb-4 flex items-center gap-2">
        <span className="text-cme-primary">{icon}</span>
        <h2 className="text-xl font-semibold text-cme-text">{title}</h2>
      </div>
      {isLoading ? (
        <SectionSkeleton />
      ) : error ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-cme-error">{error}</p>
          </CardContent>
        </Card>
      ) : (
        children
      )}
    </section>
  );
}

function SectionSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-4/5" />
        <Skeleton className="h-8 w-3/5" />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Data-fetching hook
// ---------------------------------------------------------------------------

interface AsyncData<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
}

function useAsyncData<T>(path: string, delayMs: number = 0): AsyncData<T> {
  const [state, setState] = React.useState<AsyncData<T>>({
    data: null,
    isLoading: true,
    error: null,
  });

  React.useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      // Stagger requests slightly for progressive loading feel
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }

      try {
        const data = await apiClient.get<T>(path);
        if (!cancelled) {
          setState({ data, isLoading: false, error: null });
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : 'Failed to load data';
          setState({ data: null, isLoading: false, error: message });
        }
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [path, delayMs]);

  return state;
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center animate-fade-in">
      <Card className="max-w-lg w-full relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-cme-primary/5 via-transparent to-cme-secondary/5 pointer-events-none" />
        <CardContent className="relative flex flex-col items-center py-16 px-8 text-center">
          <div className="mb-6 rounded-2xl bg-cme-primary/10 p-5">
            <BarChart3 className="h-12 w-12 text-cme-primary" />
          </div>
          <h2 className="mb-3 text-2xl font-semibold text-cme-text">
            Your analytics are waiting
          </h2>
          <p className="text-cme-text-muted leading-relaxed">
            Your analytics will appear here once content is published. Start by
            uploading content and generating outputs for your platforms.
          </p>
          <div className="mt-8 flex items-center gap-3 text-xs text-cme-text-muted">
            <span className="flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              Upload content
            </span>
            <span className="text-cme-border">&#8594;</span>
            <span className="flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5" />
              Generate outputs
            </span>
            <span className="text-cme-border">&#8594;</span>
            <span className="flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" />
              Track performance
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content Type Performance Cards
// ---------------------------------------------------------------------------

function ContentTypeCards({ data }: { data: ContentTypePerformanceResponse[] }) {
  if (data.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-cme-text-muted">
        No content type data yet.
      </div>
    );
  }

  const bestIdx = data.reduce(
    (best, item, idx) =>
      item.avg_engagement_rate > (data[best]?.avg_engagement_rate ?? 0) ? idx : best,
    0
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {data.map((item, idx) => {
        const isBest = idx === bestIdx;
        return (
          <Card
            key={item.content_type}
            glow={isBest ? 'primary' : 'none'}
            className={cn(
              'transition-all duration-300 hover:border-cme-primary/20',
              isBest && 'border-cme-primary/30'
            )}
          >
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-cme-text capitalize">
                  {item.content_type.replace(/_/g, ' ')}
                </span>
                {isBest && (
                  <Badge variant="default" className="text-[10px]">
                    Top Performer
                  </Badge>
                )}
              </div>

              {/* Engagement rate bar */}
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-cme-text-muted">
                  <span>Engagement Rate</span>
                  <span className="font-mono font-semibold text-cme-text">
                    {formatPercentage(item.avg_engagement_rate)}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-cme-surface-hover overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-1000 ease-out"
                    style={{
                      width: `${Math.min(item.avg_engagement_rate * 100 * 5, 100)}%`,
                      background: isBest
                        ? 'linear-gradient(90deg, #6c5ce7, #a29bfe)'
                        : '#6c5ce7',
                    }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs text-cme-text-muted">
                <span>
                  <span className="font-mono font-semibold text-cme-text">
                    {formatNumber(item.total_reach)}
                  </span>{' '}
                  reach
                </span>
                <span>
                  <span className="font-mono font-semibold text-cme-text">
                    {item.post_count}
                  </span>{' '}
                  posts
                </span>
                <span>
                  <span className="font-mono font-semibold text-cme-text">
                    {item.avg_multiplier_score.toFixed(1)}x
                  </span>{' '}
                  avg
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hook Performance Table
// ---------------------------------------------------------------------------

function HookPerformanceTable({ data }: { data: HookPerformanceResponse[] }) {
  if (data.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-cme-text-muted">
        No hook performance data yet.
      </div>
    );
  }

  const sorted = [...data].sort(
    (a, b) => b.avg_engagement_rate - a.avg_engagement_rate
  );
  const maxRate = Math.max(...sorted.map((h) => h.avg_engagement_rate), 0.001);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-cme-border text-left">
            <th className="pb-3 pr-4 text-xs font-medium uppercase tracking-wider text-cme-text-muted">
              Hook Type
            </th>
            <th className="pb-3 pr-4 text-xs font-medium uppercase tracking-wider text-cme-text-muted">
              Engagement Rate
            </th>
            <th className="pb-3 pr-4 text-xs font-medium uppercase tracking-wider text-cme-text-muted hidden sm:table-cell">
              Total Reach
            </th>
            <th className="pb-3 pr-4 text-xs font-medium uppercase tracking-wider text-cme-text-muted hidden md:table-cell">
              Usage
            </th>
            <th className="pb-3 text-xs font-medium uppercase tracking-wider text-cme-text-muted hidden lg:table-cell">
              Best Platform
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((hook, idx) => {
            const barWidth = (hook.avg_engagement_rate / maxRate) * 100;

            return (
              <tr
                key={hook.hook_type}
                className={cn(
                  'border-b border-cme-border/50 transition-colors hover:bg-cme-surface-hover/30',
                  idx === 0 && 'bg-cme-primary/[0.03]'
                )}
              >
                <td className="py-3 pr-4">
                  <span className="font-medium text-cme-text capitalize">
                    {hook.hook_type.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="py-3 pr-4 min-w-[180px]">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-cme-surface-hover overflow-hidden">
                      <div
                        className="h-full rounded-full bg-cme-primary transition-all duration-1000 ease-out"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    <span className="shrink-0 font-mono text-xs font-semibold text-cme-text tabular-nums">
                      {formatPercentage(hook.avg_engagement_rate)}
                    </span>
                  </div>
                </td>
                <td className="py-3 pr-4 font-mono text-xs text-cme-text hidden sm:table-cell">
                  {formatNumber(hook.total_reach)}
                </td>
                <td className="py-3 pr-4 font-mono text-xs text-cme-text-muted hidden md:table-cell">
                  {hook.usage_count}
                </td>
                <td className="py-3 text-xs text-cme-text-muted hidden lg:table-cell">
                  {hook.best_platform_for_hook
                    ? getPlatformConfig(hook.best_platform_for_hook).name
                    : '---'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audience Intelligence Section
// ---------------------------------------------------------------------------

function AudienceIntelligenceSection({
  data,
}: {
  data: AudienceIntelligenceResponse;
}) {
  return (
    <div className="space-y-4">
      {/* Spotlight cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Fastest Growing */}
        {data.fastest_growing_platform && (
          <Card glow="secondary" className="overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-cme-secondary/5 to-transparent pointer-events-none" />
            <CardContent className="relative p-5">
              <div className="mb-2 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-cme-secondary" />
                <span className="text-xs font-medium uppercase tracking-wider text-cme-secondary">
                  Fastest Growing
                </span>
              </div>
              <p className="text-lg font-bold text-cme-text">
                {data.fastest_growing_platform.name}
              </p>
              <div className="mt-2 flex items-center gap-4 text-xs text-cme-text-muted">
                <span>
                  <span className="font-mono font-semibold text-cme-secondary">
                    +{formatPercentage(data.fastest_growing_platform.growth_rate)}
                  </span>{' '}
                  growth
                </span>
                <span>
                  <span className="font-mono font-semibold text-cme-text">
                    {formatNumber(data.fastest_growing_platform.follows_gained)}
                  </span>{' '}
                  follows
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Best Engagement */}
        {data.best_engagement_platform && (
          <Card glow="primary" className="overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-cme-primary/5 to-transparent pointer-events-none" />
            <CardContent className="relative p-5">
              <div className="mb-2 flex items-center gap-2">
                <Heart className="h-4 w-4 text-cme-primary" />
                <span className="text-xs font-medium uppercase tracking-wider text-cme-primary">
                  Best Engagement
                </span>
              </div>
              <p className="text-lg font-bold text-cme-text">
                {data.best_engagement_platform.name}
              </p>
              <div className="mt-2 text-xs text-cme-text-muted">
                <span className="font-mono font-semibold text-cme-primary">
                  {formatPercentage(data.best_engagement_platform.avg_engagement_rate)}
                </span>{' '}
                avg engagement rate
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Platform Rankings */}
      {data.platform_rankings.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-cme-text-muted">
              Platform Rankings
            </h4>
            <div className="space-y-2">
              {data.platform_rankings.map((platform, index) => (
                <div
                  key={platform.platform_id}
                  className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-cme-surface-hover/30"
                >
                  <span
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-xs font-bold',
                      index === 0
                        ? 'bg-cme-primary/20 text-cme-primary'
                        : index === 1
                          ? 'bg-cme-secondary/20 text-cme-secondary'
                          : 'bg-cme-surface-hover text-cme-text-muted'
                    )}
                  >
                    {index + 1}
                  </span>
                  <span className="flex-1 text-sm font-medium text-cme-text">
                    {platform.name}
                  </span>
                  <span className="text-xs text-cme-text-muted">
                    {formatPercentage(platform.engagement_rate)} eng
                  </span>
                  <span className="text-xs text-cme-text-muted">
                    +{formatNumber(platform.follows_gained)} follows
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recommendations */}
      {data.recommendations.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.recommendations.map((rec, idx) => (
            <Card key={idx} className="transition-all duration-300 hover:border-cme-warning/20">
              <CardContent className="flex items-start gap-3 p-4">
                <div className="shrink-0 rounded-lg bg-cme-warning/10 p-2">
                  <Lightbulb className="h-4 w-4 text-cme-warning" />
                </div>
                <p className="text-sm text-cme-text-muted leading-relaxed">
                  {rec}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content Strategy Suggestions
// ---------------------------------------------------------------------------

const SUGGESTION_TYPE_CONFIG: Record<
  ContentStrategySuggestion['type'],
  { icon: React.ReactNode; color: string }
> = {
  topic: { icon: <BookOpen className="h-4 w-4" />, color: '#6c5ce7' },
  format: { icon: <Layout className="h-4 w-4" />, color: '#00cec9' },
  timing: { icon: <Clock className="h-4 w-4" />, color: '#fdcb6e' },
  platform: { icon: <Globe className="h-4 w-4" />, color: '#00b894' },
};

function StrategySuggestions({ data }: { data: ContentStrategySuggestion[] }) {
  const filtered = data.filter((s) => s.confidence > 0.5);

  if (filtered.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-cme-text-muted">
        Not enough data for strategy suggestions yet. Keep publishing!
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {filtered.map((suggestion, idx) => {
        const config = SUGGESTION_TYPE_CONFIG[suggestion.type];
        return (
          <Card
            key={idx}
            className="transition-all duration-300 hover:border-cme-primary/20"
          >
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div
                  className="rounded-lg p-2"
                  style={{
                    backgroundColor: `${config.color}15`,
                    color: config.color,
                  }}
                >
                  {config.icon}
                </div>
                <span className="text-xs font-medium uppercase tracking-wider text-cme-text-muted capitalize">
                  {suggestion.type}
                </span>
              </div>
              <p className="text-sm text-cme-text leading-relaxed">
                {suggestion.suggestion}
              </p>
              <div className="flex items-center gap-4">
                {/* Confidence meter */}
                <div className="flex-1">
                  <div className="mb-1 text-[10px] text-cme-text-muted">
                    Confidence
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-cme-surface-hover overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-1000"
                      style={{
                        width: `${suggestion.confidence * 100}%`,
                        backgroundColor: config.color,
                      }}
                    />
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-cme-text-muted">
                    Data points
                  </div>
                  <div className="font-mono text-xs font-semibold text-cme-text">
                    {suggestion.data_points}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Analytics Page
// ---------------------------------------------------------------------------

export default function AnalyticsPage() {
  // Staggered data fetching for progressive loading
  const dashboard = useAsyncData<AnalyticsDashboardResponse>(
    '/api/v1/analytics/dashboard',
    0
  );
  const platformPerf = useAsyncData<PlatformPerformanceResponse[]>(
    '/api/v1/analytics/platform-performance',
    200
  );
  const contentTypes = useAsyncData<ContentTypePerformanceResponse[]>(
    '/api/v1/analytics/content-types',
    400
  );
  const hooks = useAsyncData<HookPerformanceResponse[]>(
    '/api/v1/analytics/hook-performance',
    600
  );
  const heatmap = useAsyncData<TimeHeatmapEntry[]>(
    '/api/v1/analytics/time-heatmap',
    800
  );
  const audience = useAsyncData<AudienceIntelligenceResponse>(
    '/api/v1/analytics/audience-intelligence',
    1000
  );
  const strategy = useAsyncData<ContentStrategySuggestion[]>(
    '/api/v1/analytics/strategy-suggestions',
    1200
  );

  // Determine if there is no data at all (empty state)
  const isAllLoaded = !dashboard.isLoading;
  const hasNoData =
    isAllLoaded &&
    dashboard.data !== null &&
    dashboard.data.total_content_pieces === 0 &&
    dashboard.data.total_published === 0;

  // Show empty state
  if (hasNoData) {
    return (
      <div className="animate-fade-in">
        <div className="mb-8 space-y-1">
          <h1 className="text-3xl font-bold text-cme-text">Analytics</h1>
          <p className="text-cme-text-muted">
            Track your content performance across all platforms
          </p>
        </div>
        <EmptyState />
      </div>
    );
  }

  const d = dashboard.data;
  const avgEngagementRate =
    d && d.total_reach > 0 ? d.total_engagements / d.total_reach : 0;

  // Build platform bar data
  const platformBarData = (platformPerf.data ?? [])
    .sort((a, b) => b.total_engagements - a.total_engagements)
    .map((p) => ({
      label: p.platform_name,
      value: p.total_engagements,
      color: getPlatformConfig(p.platform_id).color,
      trend: p.trend,
      sublabel: `${p.post_count} posts`,
    }));

  return (
    <div className="space-y-10 animate-fade-in">
      {/* Page header */}
      <div className="space-y-1">
        <h1 className="text-3xl font-bold text-cme-text">Analytics</h1>
        <p className="text-cme-text-muted">
          Track your content performance across all platforms
        </p>
      </div>

      {/* Section 1: Multiplier Score Hero */}
      {dashboard.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-72 w-full rounded-xl" />
          <div className="grid gap-3 sm:grid-cols-3">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </div>
        </div>
      ) : d ? (
        <MultiplierScoreHero
          value={d.best_multiplier_score || d.avg_multiplier_score}
          totalReach={d.total_reach}
          platformCount={d.platforms_active}
          topContent={d.top_performing_content}
        />
      ) : null}

      {/* Section 2: Overview Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {dashboard.isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))
        ) : d ? (
          <>
            <StatCard
              label="Total Reach"
              value={d.total_reach}
              icon={<Eye className="h-5 w-5" />}
              accentColor="#6c5ce7"
              delay={0}
            />
            <StatCard
              label="Engagements"
              value={d.total_engagements}
              icon={<Heart className="h-5 w-5" />}
              accentColor="#e17055"
              delay={80}
            />
            <StatCard
              label="Content Pieces"
              value={d.total_content_pieces}
              icon={<FileText className="h-5 w-5" />}
              accentColor="#00cec9"
              delay={160}
            />
            <StatCard
              label="Published"
              value={d.total_published}
              icon={<Send className="h-5 w-5" />}
              accentColor="#00b894"
              delay={240}
            />
            <StatCard
              label="Platforms Active"
              value={d.platforms_active}
              icon={<Globe className="h-5 w-5" />}
              accentColor="#fdcb6e"
              delay={320}
            />
            <StatCard
              label="Avg Engagement"
              value={avgEngagementRate}
              icon={<Percent className="h-5 w-5" />}
              format="percentage"
              accentColor="#a29bfe"
              delay={400}
            />
          </>
        ) : null}
      </div>

      {/* Section 3: Platform Performance */}
      <Section
        title="Platform Performance"
        icon={<Globe className="h-5 w-5" />}
        isLoading={platformPerf.isLoading}
        error={platformPerf.error}
        delay={200}
      >
        <Card>
          <CardContent className="p-6">
            <PerformanceBars
              data={platformBarData}
              emptyMessage="No platform performance data yet."
            />
          </CardContent>
        </Card>
      </Section>

      {/* Section 4: Content Type Performance */}
      <Section
        title="Content Type Performance"
        icon={<FileText className="h-5 w-5" />}
        isLoading={contentTypes.isLoading}
        error={contentTypes.error}
        delay={400}
      >
        <ContentTypeCards data={contentTypes.data ?? []} />
      </Section>

      {/* Section 5: Hook Performance */}
      <Section
        title="Hook Performance"
        icon={<Zap className="h-5 w-5" />}
        isLoading={hooks.isLoading}
        error={hooks.error}
        delay={600}
      >
        <Card>
          <CardContent className="p-6">
            <HookPerformanceTable data={hooks.data ?? []} />
          </CardContent>
        </Card>
      </Section>

      {/* Section 6: Time of Day Heatmap */}
      <Section
        title="Best Times to Post"
        icon={<Clock className="h-5 w-5" />}
        isLoading={heatmap.isLoading}
        error={heatmap.error}
        delay={800}
      >
        <Card>
          <CardContent className="p-6">
            <Heatmap data={heatmap.data ?? []} />
          </CardContent>
        </Card>
      </Section>

      {/* Section 7: Audience Intelligence */}
      <Section
        title="Audience Intelligence"
        icon={<TrendingUp className="h-5 w-5" />}
        isLoading={audience.isLoading}
        error={audience.error}
        delay={1000}
      >
        {audience.data ? (
          <AudienceIntelligenceSection data={audience.data} />
        ) : (
          <div className="py-8 text-center text-sm text-cme-text-muted">
            No audience data available yet.
          </div>
        )}
      </Section>

      {/* Section 8: Content Strategy Suggestions */}
      <Section
        title="Content Strategy Suggestions"
        icon={<Lightbulb className="h-5 w-5" />}
        isLoading={strategy.isLoading}
        error={strategy.error}
        delay={1200}
      >
        <StrategySuggestions data={strategy.data ?? []} />
      </Section>
    </div>
  );
}
