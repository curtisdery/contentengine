'use client';

import * as React from 'react';
import { Twitter, Linkedin, Instagram, Youtube, Facebook, Mail, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface PlatformBadgeProps {
  platformId: string;
  showTier?: boolean;
  tier?: number;
  size?: 'sm' | 'md';
}

interface PlatformConfig {
  name: string;
  color: string;
  bgClass: string;
  icon?: React.ReactNode;
}

const platformMap: Record<string, PlatformConfig> = {
  twitter: { name: 'Twitter / X', color: '#1DA1F2', bgClass: 'bg-[#1DA1F2]', icon: <Twitter className="h-3.5 w-3.5" /> },
  linkedin: { name: 'LinkedIn', color: '#0A66C2', bgClass: 'bg-[#0A66C2]', icon: <Linkedin className="h-3.5 w-3.5" /> },
  instagram: { name: 'Instagram', color: '#E1306C', bgClass: 'bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF]', icon: <Instagram className="h-3.5 w-3.5" /> },
  youtube: { name: 'YouTube', color: '#FF0000', bgClass: 'bg-[#FF0000]', icon: <Youtube className="h-3.5 w-3.5" /> },
  tiktok: { name: 'TikTok', color: '#69C9D0', bgClass: 'bg-[#010101]' },
  reddit: { name: 'Reddit', color: '#FF4500', bgClass: 'bg-[#FF4500]' },
  medium: { name: 'Medium', color: '#292929', bgClass: 'bg-[#e6e6e6]' },
  pinterest: { name: 'Pinterest', color: '#E60023', bgClass: 'bg-[#E60023]' },
  bluesky: { name: 'Bluesky', color: '#0085FF', bgClass: 'bg-[#0085FF]' },
  email: { name: 'Email Newsletter', color: '#00CEC9', bgClass: 'bg-cme-secondary', icon: <Mail className="h-3.5 w-3.5" /> },
  quora: { name: 'Quora', color: '#B92B27', bgClass: 'bg-[#B92B27]' },
  press: { name: 'Press Release', color: '#6B7280', bgClass: 'bg-gray-500' },
  slides: { name: 'Slide Deck', color: '#10B981', bgClass: 'bg-emerald-500' },
  threads: { name: 'Threads', color: '#000000', bgClass: 'bg-white' },
  facebook: { name: 'Facebook', color: '#1877F2', bgClass: 'bg-[#1877F2]', icon: <Facebook className="h-3.5 w-3.5" /> },
  substack: { name: 'Substack', color: '#FF6719', bgClass: 'bg-[#FF6719]' },
};

function getPlatformConfig(platformId: string): PlatformConfig {
  if (!platformId) return { name: 'Unknown', color: '#6c5ce7', bgClass: 'bg-cme-primary' };
  const normalized = platformId.toLowerCase().replace(/[_\s-]/g, '');
  return platformMap[normalized] || {
    name: platformId.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    color: '#6c5ce7',
    bgClass: 'bg-cme-primary',
  };
}

function PlatformBadge({ platformId, showTier, tier, size = 'md' }: PlatformBadgeProps) {
  const config = getPlatformConfig(platformId);
  const isSmall = size === 'sm';

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full',
          isSmall ? 'h-5 w-5' : 'h-7 w-7'
        )}
        style={{ backgroundColor: `${config.color}15`, color: config.color }}
      >
        {config.icon ?? (
          <span className={cn('font-bold', isSmall ? 'text-[9px]' : 'text-[10px]')}>
            {config.name.charAt(0)}
          </span>
        )}
      </span>
      <span
        className={cn(
          'font-medium text-cme-text',
          isSmall ? 'text-xs' : 'text-sm'
        )}
      >
        {config.name}
      </span>
      {showTier && tier !== undefined && (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          T{tier}
        </Badge>
      )}
    </div>
  );
}

export { PlatformBadge, getPlatformConfig, platformMap };
export type { PlatformConfig };
