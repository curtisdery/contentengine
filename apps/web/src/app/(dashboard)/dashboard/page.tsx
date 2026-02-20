'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Upload,
  FileOutput,
  Globe,
  Zap,
  ArrowUpRight,
  Sparkles,
  Bot,
  Rocket,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api';
import { ROUTES } from '@/lib/constants';
import type { AutopilotSummaryResponse } from '@/types/api';

interface StatCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  description: string;
  glow: 'primary' | 'secondary' | 'none';
  accentColor: string;
}

function StatCard({ title, value, icon, description, glow, accentColor }: StatCardProps) {
  return (
    <Card glow={glow} className="group hover:border-cme-border-bright transition-all duration-300">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-3">
            <p className="text-sm font-medium text-cme-text-muted">{title}</p>
            <p className="font-mono text-3xl font-bold text-cme-text">{value}</p>
            <p className="text-xs text-cme-text-muted">{description}</p>
          </div>
          <div
            className={cn(
              'rounded-xl p-3 transition-all duration-300',
              'group-hover:scale-110'
            )}
            style={{
              backgroundColor: `${accentColor}15`,
              color: accentColor,
            }}
          >
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Autopilot Status Widget
// ---------------------------------------------------------------------------

function AutopilotWidget() {
  const router = useRouter();
  const [summary, setSummary] = React.useState<AutopilotSummaryResponse | null>(
    null
  );
  const [isLoaded, setIsLoaded] = React.useState(false);

  React.useEffect(() => {
    async function load() {
      try {
        const data = await apiClient.get<AutopilotSummaryResponse>(
          '/api/v1/autopilot/summary'
        );
        setSummary(data);
      } catch {
        // API may not be available yet; silently ignore
      } finally {
        setIsLoaded(true);
      }
    }
    load();
  }, []);

  // Don't render if we have no data or nothing interesting to show
  if (!isLoaded || !summary) return null;
  if (
    summary.autopilot_enabled === 0 &&
    summary.eligible_not_enabled === 0 &&
    summary.total_auto_published === 0
  )
    return null;

  const hasEligible = summary.eligible_not_enabled > 0;

  return (
    <Card
      className={cn(
        'group cursor-pointer transition-all duration-300',
        hasEligible
          ? 'border-cme-secondary/30 hover:border-cme-secondary/50'
          : 'hover:border-cme-border-bright'
      )}
      glow={hasEligible ? 'secondary' : 'none'}
      onClick={() => router.push(ROUTES.SETTINGS_AUTOPILOT)}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          router.push(ROUTES.SETTINGS_AUTOPILOT);
        }
      }}
    >
      <CardContent className="flex items-center gap-4 p-5">
        <div
          className={cn(
            'shrink-0 rounded-lg p-2.5 transition-all duration-300 group-hover:scale-110',
            summary.autopilot_enabled > 0
              ? 'bg-cme-success/10 text-cme-success'
              : 'bg-cme-primary/10 text-cme-primary'
          )}
        >
          <Bot className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-cme-text group-hover:text-white transition-colors">
              Autopilot:{' '}
              <span className="font-mono">
                {summary.autopilot_enabled}
              </span>{' '}
              {summary.autopilot_enabled === 1 ? 'platform' : 'platforms'}{' '}
              active
            </p>
            {summary.autopilot_enabled > 0 && (
              <Badge variant="success" dot className="text-[10px]">
                Running
              </Badge>
            )}
          </div>
          {hasEligible ? (
            <p className="text-xs text-cme-secondary flex items-center gap-1 mt-0.5">
              <Rocket className="h-3 w-3" />
              {summary.eligible_not_enabled}{' '}
              {summary.eligible_not_enabled === 1
                ? 'platform'
                : 'platforms'}{' '}
              ready for autopilot
            </p>
          ) : summary.total_auto_published > 0 ? (
            <p className="text-xs text-cme-text-muted mt-0.5">
              {summary.total_auto_published} total auto-published
            </p>
          ) : (
            <p className="text-xs text-cme-text-muted mt-0.5">
              Configure automated publishing
            </p>
          )}
        </div>
        <ArrowUpRight className="ml-auto h-4 w-4 shrink-0 text-cme-text-muted opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Dashboard Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  const stats: StatCardProps[] = [
    {
      title: 'Content Uploads',
      value: '0',
      icon: <Upload className="h-6 w-6" />,
      description: 'Total pieces uploaded',
      glow: 'primary',
      accentColor: '#6c5ce7',
    },
    {
      title: 'Outputs Generated',
      value: '0',
      icon: <FileOutput className="h-6 w-6" />,
      description: 'Repurposed content pieces',
      glow: 'secondary',
      accentColor: '#00cec9',
    },
    {
      title: 'Platforms Connected',
      value: '0',
      icon: <Globe className="h-6 w-6" />,
      description: 'Active integrations',
      glow: 'none',
      accentColor: '#00b894',
    },
    {
      title: 'Multiplier Score',
      value: '\u2014',
      icon: <Zap className="h-6 w-6" />,
      description: 'Content amplification ratio',
      glow: 'none',
      accentColor: '#fdcb6e',
    },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Welcome Section */}
      <div className="space-y-1">
        <h1 className="text-3xl font-bold text-cme-text">
          Welcome back,{' '}
          <span className="gradient-text">
            {user?.full_name || 'Creator'}
          </span>
        </h1>
        <p className="text-cme-text-muted">
          Here&apos;s an overview of your Pandocast
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </div>

      {/* Autopilot Status Widget */}
      <AutopilotWidget />

      {/* Empty State / CTA */}
      <Card
        glow="primary"
        className="relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-cme-primary/5 via-transparent to-cme-secondary/5 pointer-events-none" />
        <CardContent className="relative flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-6 rounded-2xl bg-cme-primary/10 p-5">
            <Sparkles className="h-10 w-10 text-cme-primary" />
          </div>
          <h2 className="mb-2 text-2xl font-semibold text-cme-text">
            Upload your first piece of content
          </h2>
          <p className="mb-8 max-w-md text-cme-text-muted">
            Start multiplying your reach. Upload a blog post, video transcript,
            or any content and let Pandocast transform it for every platform.
          </p>
          <Button
            size="lg"
            className="gap-2"
            onClick={() => router.push(ROUTES.CONTENT_UPLOAD)}
          >
            Get Started
            <ArrowUpRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div>
        <h2 className="mb-4 text-xl font-semibold text-cme-text">
          Quick Actions
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <QuickActionCard
            title="Upload Content"
            description="Add a new blog post, transcript, or article"
            icon={<Upload className="h-5 w-5" />}
            accentColor="#6c5ce7"
            href={ROUTES.CONTENT_UPLOAD}
          />
          <QuickActionCard
            title="Connect Platform"
            description="Link your social media accounts"
            icon={<Globe className="h-5 w-5" />}
            accentColor="#00cec9"
            href={ROUTES.SETTINGS_CONNECTIONS}
          />
          <QuickActionCard
            title="View Analytics"
            description="Track your content performance"
            icon={<Zap className="h-5 w-5" />}
            accentColor="#fdcb6e"
            href={ROUTES.ANALYTICS}
          />
        </div>
      </div>
    </div>
  );
}

interface QuickActionCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  accentColor: string;
  href: string;
}

function QuickActionCard({ title, description, icon, accentColor, href }: QuickActionCardProps) {
  const router = useRouter();

  return (
    <Card
      className="group cursor-pointer hover:border-cme-border-bright transition-all duration-300"
      onClick={() => router.push(href)}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          router.push(href);
        }
      }}
    >
      <CardContent className="flex items-center gap-4 p-5">
        <div
          className="shrink-0 rounded-lg p-2.5 transition-all duration-300 group-hover:scale-110"
          style={{
            backgroundColor: `${accentColor}15`,
            color: accentColor,
          }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-cme-text group-hover:text-white transition-colors">
            {title}
          </p>
          <p className="text-xs text-cme-text-muted">{description}</p>
        </div>
        <ArrowUpRight className="ml-auto h-4 w-4 shrink-0 text-cme-text-muted opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </CardContent>
    </Card>
  );
}
