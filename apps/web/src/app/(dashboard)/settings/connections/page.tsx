'use client';

import * as React from 'react';
import {
  Globe,
  Check,
  Unplug,
  Loader2,
  ArrowLeft,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { getPlatformConfig, platformMap } from '@/components/content/platform-badge';
import { apiClient, ApiClientError } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { ROUTES } from '@/lib/constants';
import type {
  PlatformConnectionResponse,
  PlatformProfileResponse,
} from '@/types/api';

// ---------------------------------------------------------------------------
// All platforms grouped by tier
// ---------------------------------------------------------------------------

interface PlatformDef {
  id: string;
  name: string;
  tier: number;
}

const ALL_PLATFORMS: PlatformDef[] = [
  // Tier 1 - Micro-content
  { id: 'twitter', name: 'Twitter / X', tier: 1 },
  { id: 'threads', name: 'Threads', tier: 1 },
  { id: 'bluesky', name: 'Bluesky', tier: 1 },
  // Tier 2 - Professional
  { id: 'linkedin', name: 'LinkedIn', tier: 2 },
  { id: 'facebook', name: 'Facebook', tier: 2 },
  // Tier 3 - Visual
  { id: 'instagram', name: 'Instagram', tier: 3 },
  { id: 'pinterest', name: 'Pinterest', tier: 3 },
  { id: 'tiktok', name: 'TikTok', tier: 3 },
  { id: 'youtube', name: 'YouTube', tier: 3 },
  // Tier 4 - Long-form
  { id: 'medium', name: 'Medium', tier: 4 },
  { id: 'substack', name: 'Substack', tier: 4 },
  { id: 'email', name: 'Email Newsletter', tier: 4 },
  // Tier 5 - Community
  { id: 'reddit', name: 'Reddit', tier: 5 },
  { id: 'quora', name: 'Quora', tier: 5 },
  // Tier 6 - Professional assets
  { id: 'slides', name: 'Slide Deck', tier: 6 },
  { id: 'press', name: 'Press Release', tier: 6 },
];

const TIER_LABELS: Record<number, string> = {
  1: 'Micro-Content',
  2: 'Professional Networks',
  3: 'Visual Platforms',
  4: 'Long-Form & Newsletters',
  5: 'Community & Q&A',
  6: 'Professional Assets',
};

// ---------------------------------------------------------------------------
// Platform Card Component
// ---------------------------------------------------------------------------

interface PlatformCardProps {
  platform: PlatformDef;
  connection: PlatformConnectionResponse | null;
  onConnect: (platformId: string) => void;
  onDisconnect: (connectionId: string) => void;
  isActioning: boolean;
}

function PlatformCard({
  platform,
  connection,
  onConnect,
  onDisconnect,
  isActioning,
}: PlatformCardProps) {
  const config = getPlatformConfig(platform.id);
  const isConnected = connection !== null && connection.is_active;

  return (
    <div
      className={cn(
        'group relative rounded-xl border p-4 transition-all duration-300',
        'bg-cme-surface/60 backdrop-blur-sm',
        isConnected
          ? 'border-cme-success/30 hover:border-cme-success/50'
          : 'border-cme-border hover:border-cme-border-bright',
        'hover:bg-cme-surface-hover/40'
      )}
    >
      {/* Connected indicator */}
      {isConnected && (
        <div className="absolute -top-1.5 -right-1.5">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-cme-success shadow-[0_0_8px_rgba(0,200,150,0.3)]">
            <Check className="h-3 w-3 text-white" />
          </div>
        </div>
      )}

      <div className="flex items-start gap-3">
        {/* Platform icon dot */}
        <div
          className="shrink-0 rounded-lg p-2.5 transition-all duration-300 group-hover:scale-105"
          style={{ backgroundColor: `${config.color}15` }}
        >
          <span
            className={cn('block h-5 w-5 rounded-full', config.bgClass)}
          />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-cme-text">{config.name}</p>

          {isConnected && connection ? (
            <p className="text-xs text-cme-success mt-0.5 truncate">
              @{connection.platform_username}
            </p>
          ) : (
            <p className="text-xs text-cme-text-muted mt-0.5">Not connected</p>
          )}
        </div>
      </div>

      <div className="mt-3">
        {isConnected && connection ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDisconnect(connection.id)}
            disabled={isActioning}
            className="w-full gap-1.5 text-xs h-8 text-cme-text-muted hover:text-cme-error hover:border-cme-error/50"
          >
            {isActioning ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Unplug className="h-3 w-3" />
            )}
            Disconnect
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onConnect(platform.id)}
            disabled={isActioning}
            className="w-full gap-1.5 text-xs h-8"
          >
            {isActioning ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ExternalLink className="h-3 w-3" />
            )}
            Connect
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Connections Page
// ---------------------------------------------------------------------------

export default function ConnectionsPage() {
  const { success: showSuccess, error: showError, warning: showWarning } = useToast();

  const [connections, setConnections] = React.useState<PlatformConnectionResponse[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [actioningPlatform, setActioningPlatform] = React.useState<string | null>(null);

  // Fetch connections
  const fetchConnections = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await apiClient.get<PlatformConnectionResponse[]>(
        '/api/v1/platforms/connections'
      );
      setConnections(response);
    } catch {
      // Silently handle - connections might not be set up yet
      setConnections([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  // Get connection for a platform
  const getConnection = (platformId: string): PlatformConnectionResponse | null => {
    return connections.find((c) => c.platform_id === platformId && c.is_active) || null;
  };

  const connectedCount = connections.filter((c) => c.is_active).length;

  // Connect handler
  const handleConnect = async (platformId: string) => {
    setActioningPlatform(platformId);
    try {
      // Since OAuth isn't wired yet, show a "coming soon" message
      showWarning(
        'OAuth Coming Soon',
        `Direct ${getPlatformConfig(platformId).name} connection will be available in the next update. For now, events will be queued for manual publishing.`
      );
    } finally {
      setActioningPlatform(null);
    }
  };

  // Disconnect handler
  const handleDisconnect = async (connectionId: string) => {
    const conn = connections.find((c) => c.id === connectionId);
    if (!conn) return;

    setActioningPlatform(conn.platform_id);
    try {
      await apiClient.delete(`/api/v1/platforms/connections/${connectionId}`);
      showSuccess('Disconnected', `${getPlatformConfig(conn.platform_id).name} has been disconnected.`);
      await fetchConnections();
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError('Disconnect failed', err.detail);
      } else {
        showError('Disconnect failed', 'An unexpected error occurred.');
      }
    } finally {
      setActioningPlatform(null);
    }
  };

  // Group platforms by tier
  const tiers = React.useMemo(() => {
    const grouped: Record<number, PlatformDef[]> = {};
    ALL_PLATFORMS.forEach((p) => {
      if (!grouped[p.tier]) grouped[p.tier] = [];
      grouped[p.tier].push(p);
    });
    return grouped;
  }, []);

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
            Connected <span className="gradient-text">Platforms</span>
          </h1>
          <p className="text-cme-text-muted">
            Manage your platform integrations for automated publishing
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-4 rounded-xl border border-cme-border bg-cme-surface/60 backdrop-blur-sm p-4">
        <div className="rounded-lg bg-cme-secondary/10 p-3">
          <Globe className="h-6 w-6 text-cme-secondary" />
        </div>
        <div className="flex-1">
          <p className="text-lg font-semibold text-cme-text">
            {isLoading ? (
              <Skeleton className="h-6 w-16 inline-block" variant="text" />
            ) : (
              <span className="font-mono">{connectedCount}</span>
            )}
            <span className="text-cme-text-muted font-normal text-sm ml-2">
              of {ALL_PLATFORMS.length} platforms connected
            </span>
          </p>
          <div className="mt-1 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-cme-surface-hover">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cme-primary to-cme-secondary transition-all duration-500"
              style={{
                width: `${(connectedCount / ALL_PLATFORMS.length) * 100}%`,
              }}
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-cme-text-muted">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>OAuth 2.0 secured</span>
        </div>
      </div>

      {/* Platform Grid by Tier */}
      {isLoading ? (
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-5 w-40" variant="text" />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, j) => (
                  <Skeleton key={j} className="h-32 rounded-xl" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(tiers)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([tier, platforms]) => (
              <div key={tier}>
                <div className="flex items-center gap-2 mb-4">
                  <Badge variant="outline" className="text-[10px]">
                    Tier {tier}
                  </Badge>
                  <h2 className="text-sm font-semibold text-cme-text">
                    {TIER_LABELS[Number(tier)] || `Tier ${tier}`}
                  </h2>
                  <div className="flex-1 h-px bg-cme-border" />
                  <span className="text-[10px] text-cme-text-muted">
                    {platforms.filter((p) => getConnection(p.id)).length}/{platforms.length} connected
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {platforms.map((platform) => (
                    <PlatformCard
                      key={platform.id}
                      platform={platform}
                      connection={getConnection(platform.id)}
                      onConnect={handleConnect}
                      onDisconnect={handleDisconnect}
                      isActioning={actioningPlatform === platform.id}
                    />
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Info note */}
      <Card className="border-cme-border/50">
        <CardContent className="flex items-start gap-3 p-4">
          <div className="shrink-0 rounded-lg bg-cme-primary/10 p-2 mt-0.5">
            <ShieldCheck className="h-4 w-4 text-cme-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-cme-text">
              Secure Platform Access
            </p>
            <p className="text-xs text-cme-text-muted mt-0.5 leading-relaxed">
              ContentEngine uses OAuth 2.0 to securely connect to your platforms.
              We never store your passwords. You can revoke access at any time.
              Connected platforms enable direct publishing from your content calendar.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
