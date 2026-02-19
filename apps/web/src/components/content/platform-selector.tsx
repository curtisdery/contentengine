'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getPlatformConfig } from '@/components/content/platform-badge';
import type { PlatformProfileResponse } from '@/types/api';

interface PlatformSelectorProps {
  selected: string[];
  onChange: (ids: string[]) => void;
  platforms: PlatformProfileResponse[];
}

function PlatformSelector({ selected, onChange, platforms }: PlatformSelectorProps) {
  const allSelected = platforms.length > 0 && selected.length === platforms.length;

  const handleToggle = (platformId: string) => {
    if (selected.includes(platformId)) {
      onChange(selected.filter((id) => id !== platformId));
    } else {
      onChange([...selected, platformId]);
    }
  };

  const handleToggleAll = () => {
    if (allSelected) {
      onChange([]);
    } else {
      onChange(platforms.map((p) => p.platform_id));
    }
  };

  // Group platforms by tier
  const tiers = React.useMemo(() => {
    const grouped = new Map<number, PlatformProfileResponse[]>();
    for (const platform of platforms) {
      const existing = grouped.get(platform.tier) || [];
      existing.push(platform);
      grouped.set(platform.tier, existing);
    }
    return Array.from(grouped.entries()).sort(([a], [b]) => a - b);
  }, [platforms]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-cme-text">
          Platforms ({selected.length}/{platforms.length})
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleToggleAll}
          className="text-xs"
        >
          {allSelected ? 'Deselect All' : 'Select All'}
        </Button>
      </div>

      <div className="space-y-4">
        {tiers.map(([tier, tierPlatforms]) => (
          <div key={tier}>
            <div className="mb-2 flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">
                Tier {tier}
              </Badge>
              <div className="h-px flex-1 bg-cme-border" />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {tierPlatforms.map((platform) => {
                const config = getPlatformConfig(platform.platform_id);
                const isSelected = selected.includes(platform.platform_id);

                return (
                  <button
                    key={platform.platform_id}
                    type="button"
                    onClick={() => handleToggle(platform.platform_id)}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg border p-3 text-left transition-all duration-200',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cme-primary',
                      isSelected
                        ? 'border-cme-primary bg-cme-primary/10 shadow-[0_0_12px_rgba(108,92,231,0.15)]'
                        : 'border-cme-border bg-cme-surface/50 hover:border-cme-border-bright hover:bg-cme-surface-hover'
                    )}
                  >
                    {/* Checkbox indicator */}
                    <div
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                        isSelected
                          ? 'border-cme-primary bg-cme-primary'
                          : 'border-cme-border bg-transparent'
                      )}
                    >
                      {isSelected && (
                        <svg
                          viewBox="0 0 12 12"
                          className="h-3 w-3 text-white"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M2 6l3 3 5-5" />
                        </svg>
                      )}
                    </div>

                    {/* Platform info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            'h-2.5 w-2.5 shrink-0 rounded-full',
                            config.bgClass
                          )}
                        />
                        <span className="truncate text-xs font-medium text-cme-text">
                          {config.name}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[10px] text-cme-text-muted">
                        {platform.media_format}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export { PlatformSelector };
