'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Bot,
  Info,
  Loader2,
  Power,
  PowerOff,
  Rocket,
  Settings2,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { PlatformBadge, getPlatformConfig } from '@/components/content/platform-badge';
import { TrustGauge } from '@/components/autopilot/trust-gauge';
import { EligibilityBanner } from '@/components/autopilot/eligibility-banner';
import { PanicButton } from '@/components/autopilot/panic-button';
import { apiClient, ApiClientError } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { ROUTES } from '@/lib/constants';
import type { AutopilotSummaryResponse } from '@/types/api';

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

type PlatformStatus = 'active' | 'eligible' | 'building_trust' | 'not_started';

interface StatusConfig {
  label: string;
  variant: 'success' | 'secondary' | 'warning' | 'outline';
  icon: React.ReactNode;
  description: string;
}

const STATUS_MAP: Record<PlatformStatus, StatusConfig> = {
  active: {
    label: 'Active',
    variant: 'success',
    icon: <Power className="h-3 w-3" />,
    description: 'Autopilot is publishing automatically',
  },
  eligible: {
    label: 'Eligible',
    variant: 'secondary',
    icon: <Rocket className="h-3 w-3" />,
    description: 'Ready to enable autopilot',
  },
  building_trust: {
    label: 'Building Trust',
    variant: 'warning',
    icon: <Settings2 className="h-3 w-3" />,
    description: 'Review more outputs to unlock',
  },
  not_started: {
    label: 'Not Started',
    variant: 'outline',
    icon: <Bot className="h-3 w-3" />,
    description: 'No reviews yet',
  },
};

// ---------------------------------------------------------------------------
// Trust Level Explanation
// ---------------------------------------------------------------------------

function TrustLevelExplanation() {
  const stages: Array<{
    status: PlatformStatus;
    color: string;
    step: number;
  }> = [
    { status: 'not_started', color: '#8888a8', step: 1 },
    { status: 'building_trust', color: '#fdcb6e', step: 2 },
    { status: 'eligible', color: '#00cec9', step: 3 },
    { status: 'active', color: '#00b894', step: 4 },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-cme-text-muted" />
          <CardTitle className="text-base">How Trust Levels Work</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stages.map(({ status, color, step }) => {
            const config = STATUS_MAP[status];
            return (
              <div
                key={status}
                className="relative rounded-lg border border-cme-border bg-cme-surface-hover/30 p-3"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: color }}
                  >
                    {step}
                  </div>
                  <Badge variant={config.variant} className="text-[10px]">
                    {config.label}
                  </Badge>
                </div>
                <p className="text-xs text-cme-text-muted leading-relaxed">
                  {config.description}
                </p>
              </div>
            );
          })}
        </div>
        {/* Progress line */}
        <div className="mt-4 flex items-center gap-2">
          <div className="h-1 flex-1 rounded-full bg-gradient-to-r from-[#8888a8] via-[#fdcb6e] via-[#00cec9] to-[#00b894]" />
          <span className="text-[10px] text-cme-text-muted whitespace-nowrap">
            Review outputs to build trust
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Platform Autopilot Card
// ---------------------------------------------------------------------------

interface PlatformAutopilotCardProps {
  platform: AutopilotSummaryResponse['platforms'][number];
  requiredApprovalRate: number;
  requiredMinReviews: number;
  onEnable: (platformId: string) => void;
  onDisable: (platformId: string) => void;
  isActioning: boolean;
}

function PlatformAutopilotCard({
  platform,
  requiredApprovalRate,
  requiredMinReviews,
  onEnable,
  onDisable,
  isActioning,
}: PlatformAutopilotCardProps) {
  const config = getPlatformConfig(platform.platform_id);
  const statusConfig = STATUS_MAP[platform.status];

  // Calculate reviews from approval rate (approximation for display)
  const approvedCount = Math.round(
    (platform.approval_rate / 100) * requiredMinReviews
  );
  const reviewsCompleted = Math.min(
    Math.max(approvedCount, 0),
    requiredMinReviews
  );
  const reviewProgress = Math.min(
    (reviewsCompleted / requiredMinReviews) * 100,
    100
  );

  return (
    <div
      className={cn(
        'group relative rounded-xl border p-5 transition-all duration-300',
        'bg-cme-surface/60 backdrop-blur-sm',
        platform.status === 'active' &&
          'border-cme-success/40 shadow-[0_0_15px_rgba(0,184,148,0.08)]',
        platform.status === 'eligible' &&
          'border-cme-secondary/30 hover:border-cme-secondary/50',
        platform.status === 'building_trust' &&
          'border-cme-warning/20 hover:border-cme-warning/40',
        platform.status === 'not_started' &&
          'border-cme-border hover:border-cme-border-bright'
      )}
    >
      {/* Active glow indicator */}
      {platform.status === 'active' && (
        <div className="absolute -top-1.5 -right-1.5">
          <span className="relative flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cme-success opacity-40" />
            <span className="relative inline-flex rounded-full h-4 w-4 bg-cme-success items-center justify-center">
              <Power className="h-2.5 w-2.5 text-white" />
            </span>
          </span>
        </div>
      )}

      <div className="flex items-start gap-4">
        {/* Trust gauge */}
        <TrustGauge
          rate={platform.approval_rate}
          threshold={requiredApprovalRate}
          reviewsCompleted={reviewsCompleted}
          reviewsRequired={requiredMinReviews}
          size="md"
        />

        <div className="flex-1 min-w-0">
          {/* Platform name and status */}
          <div className="flex items-center gap-2 mb-1">
            <PlatformBadge platformId={platform.platform_id} size="sm" />
          </div>

          <div className="flex items-center gap-2 mb-3">
            <Badge variant={statusConfig.variant} dot className="text-[10px]">
              {statusConfig.label}
            </Badge>
            {platform.status === 'active' && platform.auto_publish_count > 0 && (
              <span className="text-[10px] font-mono text-cme-text-muted">
                {platform.auto_publish_count} auto-published
              </span>
            )}
          </div>

          {/* Progress text */}
          <p className="text-xs text-cme-text-muted mb-2">
            <span className="font-mono text-cme-text">
              {Math.round(platform.approval_rate)}%
            </span>{' '}
            approval rate
            {platform.status === 'building_trust' && (
              <span>
                {' '}
                &mdash; need{' '}
                <span className="font-mono text-cme-warning">
                  {requiredApprovalRate}%
                </span>
              </span>
            )}
          </p>

          {/* Reviews progress bar */}
          {platform.status !== 'active' && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-cme-text-muted">
                  Reviews progress
                </span>
                <span className="text-[10px] font-mono text-cme-text-muted">
                  {reviewsCompleted}/{requiredMinReviews}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-cme-surface-hover">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    platform.status === 'eligible'
                      ? 'bg-cme-secondary'
                      : platform.status === 'building_trust'
                      ? 'bg-cme-warning'
                      : 'bg-cme-text-muted/30'
                  )}
                  style={{ width: `${reviewProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div>
            {platform.status === 'eligible' && (
              <Button
                size="sm"
                onClick={() => onEnable(platform.platform_id)}
                disabled={isActioning}
                className="gap-1.5 bg-cme-success hover:bg-cme-success/90 text-white shadow-[0_0_20px_rgba(0,184,148,0.2)] hover:shadow-[0_0_30px_rgba(0,184,148,0.35)]"
              >
                {isActioning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Rocket className="h-3.5 w-3.5" />
                )}
                Enable Autopilot
              </Button>
            )}
            {platform.status === 'active' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDisable(platform.platform_id)}
                disabled={isActioning}
                className="gap-1.5 text-cme-text-muted hover:text-cme-error hover:border-cme-error/50"
              >
                {isActioning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <PowerOff className="h-3.5 w-3.5" />
                )}
                Disable
              </Button>
            )}
            {platform.status === 'building_trust' && (
              <p className="text-[10px] text-cme-warning/80 italic">
                Keep reviewing outputs to build trust
              </p>
            )}
            {platform.status === 'not_started' && (
              <p className="text-[10px] text-cme-text-muted italic">
                Generate and review content to get started
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Autopilot Page
// ---------------------------------------------------------------------------

export default function AutopilotPage() {
  const {
    success: showSuccess,
    error: showError,
    warning: showWarning,
  } = useToast();

  const [summary, setSummary] = React.useState<AutopilotSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [actioningPlatform, setActioningPlatform] = React.useState<string | null>(null);
  const [dismissedBanners, setDismissedBanners] = React.useState<Set<string>>(
    new Set()
  );

  // Settings state
  const [requiredApprovalRate, setRequiredApprovalRate] = React.useState(85);
  const [requiredMinReviews, setRequiredMinReviews] = React.useState(10);

  // Fetch autopilot summary
  const fetchSummary = React.useCallback(async () => {
    try {
      const response = await apiClient.get<AutopilotSummaryResponse>(
        '/api/v1/autopilot/summary'
      );
      setSummary(response);
    } catch {
      // API might not exist yet, use empty state
      setSummary({
        total_platforms: 0,
        autopilot_enabled: 0,
        eligible_not_enabled: 0,
        not_eligible: 0,
        total_auto_published: 0,
        platforms: [],
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // Enable autopilot for a platform
  const handleEnable = async (platformId: string) => {
    setActioningPlatform(platformId);
    try {
      await apiClient.post(`/api/v1/autopilot/${platformId}/enable`);
      showSuccess(
        'Autopilot Enabled',
        `${getPlatformConfig(platformId).name} is now on autopilot.`
      );
      setDismissedBanners((prev) => new Set(prev).add(platformId));
      await fetchSummary();
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError('Failed to enable', err.detail);
      } else {
        showError('Failed to enable', 'An unexpected error occurred.');
      }
    } finally {
      setActioningPlatform(null);
    }
  };

  // Disable autopilot for a platform
  const handleDisable = async (platformId: string) => {
    setActioningPlatform(platformId);
    try {
      await apiClient.post(`/api/v1/autopilot/${platformId}/disable`);
      showSuccess(
        'Autopilot Disabled',
        `${getPlatformConfig(platformId).name} autopilot has been turned off.`
      );
      await fetchSummary();
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError('Failed to disable', err.detail);
      } else {
        showError('Failed to disable', 'An unexpected error occurred.');
      }
    } finally {
      setActioningPlatform(null);
    }
  };

  // Emergency stop handler
  const handlePanic = async () => {
    try {
      await apiClient.post('/api/v1/autopilot/panic');
      showWarning(
        'Emergency Stop Executed',
        'All autopilot, connections, and sessions have been revoked.'
      );
      await fetchSummary();
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError('Emergency stop failed', err.detail);
      } else {
        showError('Emergency stop failed', 'An unexpected error occurred.');
      }
    }
  };

  // Eligible platforms that haven't been dismissed
  const eligiblePlatforms =
    summary?.platforms.filter(
      (p) => p.status === 'eligible' && !dismissedBanners.has(p.platform_id)
    ) ?? [];

  return (
    <div className="max-w-4xl space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={ROUTES.SETTINGS}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-cme-text">
            <span className="gradient-text">Autopilot</span>
          </h1>
          <p className="text-cme-text-muted">
            Let ContentEngine publish for you
          </p>
        </div>
      </div>

      {/* Summary Stats Bar */}
      {isLoading ? (
        <Skeleton className="h-20 rounded-xl" />
      ) : (
        summary && (
          <div className="grid grid-cols-3 gap-4 rounded-xl border border-cme-border bg-cme-surface/60 backdrop-blur-sm p-4">
            <div className="text-center">
              <p className="font-mono text-2xl font-bold text-cme-success">
                {summary.autopilot_enabled}
              </p>
              <p className="text-xs text-cme-text-muted">On Autopilot</p>
            </div>
            <div className="text-center border-x border-cme-border">
              <p className="font-mono text-2xl font-bold text-cme-secondary">
                {summary.eligible_not_enabled}
              </p>
              <p className="text-xs text-cme-text-muted">Eligible</p>
            </div>
            <div className="text-center">
              <p className="font-mono text-2xl font-bold text-cme-text">
                {summary.total_auto_published}
              </p>
              <p className="text-xs text-cme-text-muted">Auto-Published</p>
            </div>
          </div>
        )
      )}

      {/* Eligibility Banners */}
      {eligiblePlatforms.map((platform) => (
        <EligibilityBanner
          key={platform.platform_id}
          platformId={platform.platform_id}
          platformName={platform.platform_name}
          approvalRate={platform.approval_rate}
          reviewCount={requiredMinReviews}
          onEnable={() => handleEnable(platform.platform_id)}
          onDismiss={() =>
            setDismissedBanners((prev) =>
              new Set(prev).add(platform.platform_id)
            )
          }
        />
      ))}

      {/* Trust Level Explanation */}
      <TrustLevelExplanation />

      {/* Platform Grid */}
      <div>
        <h2 className="text-lg font-semibold text-cme-text mb-4 flex items-center gap-2">
          <Bot className="h-5 w-5 text-cme-primary" />
          Platform Autopilot Status
        </h2>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-48 rounded-xl" />
            ))}
          </div>
        ) : summary && summary.platforms.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {summary.platforms
              .sort((a, b) => {
                const order: Record<PlatformStatus, number> = {
                  active: 0,
                  eligible: 1,
                  building_trust: 2,
                  not_started: 3,
                };
                return order[a.status] - order[b.status];
              })
              .map((platform) => (
                <PlatformAutopilotCard
                  key={platform.platform_id}
                  platform={platform}
                  requiredApprovalRate={requiredApprovalRate}
                  requiredMinReviews={requiredMinReviews}
                  onEnable={handleEnable}
                  onDisable={handleDisable}
                  isActioning={actioningPlatform === platform.platform_id}
                />
              ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-2xl bg-cme-primary/10 p-4 mb-4">
                <Bot className="h-8 w-8 text-cme-primary" />
              </div>
              <h3 className="text-lg font-semibold text-cme-text mb-1">
                No platforms connected yet
              </h3>
              <p className="text-sm text-cme-text-muted mb-4 max-w-sm">
                Connect platforms and start reviewing generated outputs to begin
                building trust for autopilot.
              </p>
              <Link href={ROUTES.SETTINGS_CONNECTIONS}>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Zap className="h-3.5 w-3.5" />
                  Connect Platforms
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Settings Panel */}
      <div>
        <Separator className="mb-8" />
        <h2 className="text-lg font-semibold text-cme-text mb-4 flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-cme-text-muted" />
          Autopilot Settings
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Approval Rate Threshold */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Required Approval Rate</CardTitle>
              <CardDescription>
                Minimum approval percentage before autopilot can be enabled
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={50}
                  max={100}
                  step={5}
                  value={requiredApprovalRate}
                  onChange={(e) =>
                    setRequiredApprovalRate(Number(e.target.value))
                  }
                  className="flex-1 h-1.5 rounded-full appearance-none bg-cme-surface-hover cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cme-primary
                    [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(108,92,231,0.4)]
                    [&::-webkit-slider-thumb]:cursor-pointer"
                />
                <span className="font-mono text-sm font-semibold text-cme-primary w-12 text-right">
                  {requiredApprovalRate}%
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Minimum Reviews */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Minimum Reviews</CardTitle>
              <CardDescription>
                Number of reviews required before autopilot eligibility
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Input
                type="number"
                min={5}
                max={100}
                value={requiredMinReviews}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (val >= 5 && val <= 100) {
                    setRequiredMinReviews(val);
                  }
                }}
                className="font-mono w-24"
              />
              <p className="text-[10px] text-cme-text-muted mt-2">
                Range: 5 to 100 reviews
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Panic Button Section */}
      <div>
        <Separator className="mb-8" />
        <Card className="border-cme-error/30">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-cme-error/10 p-2 text-cme-error">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-cme-error">Emergency Stop</CardTitle>
                <CardDescription>
                  Disable all autopilot and revoke all platform connections
                  instantly
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-cme-text-muted mb-4 leading-relaxed">
              Use this only in emergencies. This will immediately disable all
              autopilot configurations, disconnect all platforms, and cancel all
              scheduled publications. You will need to manually reconnect and
              re-enable everything.
            </p>
            <PanicButton onConfirm={handlePanic} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
