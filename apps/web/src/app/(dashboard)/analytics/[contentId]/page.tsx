'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Zap,
  Eye,
  Heart,
  Globe,
  Calendar,
  FileText,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/analytics/stat-card';
import { PerformanceBars } from '@/components/analytics/performance-bars';
import { cn, formatNumber, formatPercentage, formatDate } from '@/lib/utils';
import { callFunction } from '@/lib/cloud-functions';
import { getPlatformConfig } from '@/components/content/platform-badge';
import type { MultiplierScoreResponse } from '@/types/api';

// ---------------------------------------------------------------------------
// Per-content analytics response shape from the API
// ---------------------------------------------------------------------------

interface ContentAnalyticsDetail {
  content_id: string;
  title: string;
  content_type: string;
  created_at: string;
  multiplier_score: MultiplierScoreResponse | null;
  output_performance: Array<{
    output_id: string;
    platform_id: string;
    platform_name: string;
    format_name: string;
    impressions: number;
    engagements: number;
    engagement_rate: number;
    published_at: string | null;
  }>;
  performance_timeline: Array<{
    date: string;
    impressions: number;
    engagements: number;
  }>;
}

// ---------------------------------------------------------------------------
// Timeline chart (pure CSS/div)
// ---------------------------------------------------------------------------

function PerformanceTimeline({
  data,
}: {
  data: Array<{ date: string; impressions: number; engagements: number }>;
}) {
  const [isVisible, setIsVisible] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 300);
    return () => clearTimeout(timer);
  }, []);

  if (data.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-cme-text-muted">
        No timeline data available yet.
      </div>
    );
  }

  const maxImpressions = Math.max(...data.map((d) => d.impressions), 1);
  const maxEngagements = Math.max(...data.map((d) => d.engagements), 1);

  return (
    <div className="space-y-3">
      {/* Chart */}
      <div className="flex items-end gap-1" style={{ height: '160px' }}>
        {data.map((point, index) => {
          const impressionHeight =
            (point.impressions / maxImpressions) * 100;
          const engagementHeight =
            (point.engagements / maxEngagements) * 100;

          return (
            <div
              key={point.date}
              className="group relative flex flex-1 flex-col items-center justify-end gap-0.5"
              style={{ height: '100%' }}
            >
              {/* Tooltip */}
              <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                <div className="rounded-lg bg-cme-surface border border-cme-border px-3 py-2 shadow-xl text-xs whitespace-nowrap">
                  <p className="font-medium text-cme-text mb-1">
                    {formatDate(point.date)}
                  </p>
                  <p className="text-cme-primary">
                    {formatNumber(point.impressions)} impressions
                  </p>
                  <p className="text-cme-secondary">
                    {formatNumber(point.engagements)} engagements
                  </p>
                </div>
              </div>

              {/* Impression bar */}
              <div
                className="w-full rounded-t-sm bg-cme-primary/60 transition-all duration-700 ease-out"
                style={{
                  height: isVisible ? `${Math.max(impressionHeight, 2)}%` : '0%',
                  transitionDelay: `${index * 50}ms`,
                  maxWidth: '24px',
                }}
              />
              {/* Engagement bar (overlay) */}
              <div
                className="w-full rounded-t-sm bg-cme-secondary/80 transition-all duration-700 ease-out"
                style={{
                  height: isVisible
                    ? `${Math.max(engagementHeight * 0.4, 1)}%`
                    : '0%',
                  transitionDelay: `${index * 50 + 100}ms`,
                  maxWidth: '24px',
                }}
              />
            </div>
          );
        })}
      </div>

      {/* X-axis labels (show a few dates) */}
      <div className="flex justify-between text-[10px] text-cme-text-muted">
        {data.length > 0 && (
          <span>{formatDate(data[0].date)}</span>
        )}
        {data.length > 2 && (
          <span>{formatDate(data[Math.floor(data.length / 2)].date)}</span>
        )}
        {data.length > 1 && (
          <span>{formatDate(data[data.length - 1].date)}</span>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-cme-text-muted">
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-sm bg-cme-primary/60" />
          <span>Impressions</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-sm bg-cme-secondary/80" />
          <span>Engagements</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Output Performance Cards
// ---------------------------------------------------------------------------

function OutputPerformanceCards({
  outputs,
}: {
  outputs: ContentAnalyticsDetail['output_performance'];
}) {
  if (!outputs || outputs.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-cme-text-muted">
        No output performance data yet.
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {outputs.map((output) => {
        const config = getPlatformConfig(output.platform_id);
        return (
          <Card
            key={output.output_id}
            className="transition-all duration-300 hover:border-cme-primary/20"
          >
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: config.color }}
                />
                <span className="text-sm font-semibold text-cme-text">
                  {output.platform_name}
                </span>
                <Badge variant="outline" className="ml-auto text-[10px]">
                  {output.format_name}
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="font-mono text-sm font-bold text-cme-text">
                    {formatNumber(output.impressions)}
                  </p>
                  <p className="text-[10px] text-cme-text-muted">Reach</p>
                </div>
                <div>
                  <p className="font-mono text-sm font-bold text-cme-text">
                    {formatNumber(output.engagements)}
                  </p>
                  <p className="text-[10px] text-cme-text-muted">Engage</p>
                </div>
                <div>
                  <p className="font-mono text-sm font-bold text-cme-primary">
                    {formatPercentage(output.engagement_rate)}
                  </p>
                  <p className="text-[10px] text-cme-text-muted">Rate</p>
                </div>
              </div>

              {output.published_at && (
                <p className="text-[10px] text-cme-text-muted flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Published {formatDate(output.published_at)}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Content Detail Page
// ---------------------------------------------------------------------------

export default function ContentAnalyticsPage() {
  const params = useParams<{ contentId: string }>();
  const contentId = params.contentId;

  const [data, setData] = React.useState<ContentAnalyticsDetail | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        const result = await callFunction<{ content_id: string }, ContentAnalyticsDetail>(
          'getContentAnalytics',
          { content_id: contentId }
        );
        if (!cancelled) {
          setData(result);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load analytics');
          setIsLoading(false);
        }
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [contentId]);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Link
          href="/analytics"
          className="inline-flex items-center gap-1 text-sm text-cme-text-muted hover:text-cme-text transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Analytics
        </Link>
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-cme-error">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const ms = data.multiplier_score;

  // Build platform reach bars
  const platformReachBars = (ms?.platform_breakdown ?? [])
    .sort((a, b) => b.reach - a.reach)
    .map((p) => ({
      label: p.platform_name,
      value: p.reach,
      color: getPlatformConfig(p.platform_id).color,
      sublabel: formatPercentage(p.engagement_rate) + ' eng rate',
    }));

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Back link */}
      <Link
        href="/analytics"
        className="inline-flex items-center gap-1 text-sm text-cme-text-muted hover:text-cme-text transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Analytics
      </Link>

      {/* Title + Multiplier Score */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1 min-w-0">
          <h1 className="text-2xl font-bold text-cme-text truncate">
            {data.title}
          </h1>
          <div className="flex items-center gap-3 text-sm text-cme-text-muted">
            <Badge variant="outline" className="capitalize">
              {data.content_type.replace(/_/g, ' ')}
            </Badge>
            <span>{formatDate(data.created_at)}</span>
          </div>
        </div>

        {ms && (
          <div className="shrink-0 flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-cme-primary/20 bg-cme-primary/5 px-5 py-3">
              <Zap className="h-5 w-5 text-cme-primary" />
              <span
                className="font-mono text-3xl font-black"
                style={{
                  background: 'linear-gradient(135deg, #6c5ce7, #a29bfe)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                {ms.multiplier_value}x
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Stat cards row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Reach"
          value={ms?.total_reach ?? 0}
          icon={<Eye className="h-5 w-5" />}
          accentColor="#6c5ce7"
          delay={0}
        />
        <StatCard
          label="Total Engagements"
          value={ms?.total_engagements ?? 0}
          icon={<Heart className="h-5 w-5" />}
          accentColor="#e17055"
          delay={80}
        />
        <StatCard
          label="Platforms Published"
          value={ms?.platforms_published ?? 0}
          icon={<Globe className="h-5 w-5" />}
          accentColor="#00cec9"
          delay={160}
        />
        <StatCard
          label="Original Reach"
          value={ms?.original_reach ?? 0}
          icon={<FileText className="h-5 w-5" />}
          accentColor="#fdcb6e"
          delay={240}
        />
      </div>

      {/* Platform Breakdown */}
      {platformReachBars.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Platform Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <PerformanceBars
              data={platformReachBars}
              emptyMessage="No platform data yet."
            />
          </CardContent>
        </Card>
      )}

      {/* Performance Timeline */}
      {data.performance_timeline.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Performance Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <PerformanceTimeline data={data.performance_timeline} />
          </CardContent>
        </Card>
      )}

      {/* Per-Output Performance */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-cme-text">
          Output Performance
        </h2>
        <OutputPerformanceCards outputs={data.output_performance} />
      </div>
    </div>
  );
}
