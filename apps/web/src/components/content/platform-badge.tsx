'use client';

import * as React from 'react';
import { Twitter, Linkedin, Instagram, Youtube, Facebook, Mail, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

function ThreadsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 192 192"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M141.537 88.988a66.667 66.667 0 0 0-2.518-1.143c-1.482-27.307-16.403-42.94-41.457-43.1h-.34c-14.986 0-27.449 6.396-35.12 18.036l13.779 9.452c5.73-8.695 14.724-10.548 21.348-10.548h.229c8.249.053 14.474 2.452 18.503 7.129 2.932 3.405 4.893 8.111 5.864 14.05a92.49 92.49 0 0 0-24.193-2.837c-27.742 0-45.571 15.259-45.571 38.984 0 23.159 18.715 38.167 43.178 36.811 17.183-.952 31.114-8.808 39.649-22.29 6.44-10.176 9.834-23.265 10.149-39.17a48.028 48.028 0 0 1 14.346 16.096c6.235 11.834 6.83 31.023-4.266 42.148-9.725 9.752-21.413 13.965-39.053 14.1-19.527-.149-34.316-6.418-43.959-18.636C63.222 136.652 57.848 118.847 57.7 96.004c.148-22.847 5.522-40.652 15.972-52.918C83.313 30.844 98.103 24.581 117.63 24.432c19.663.154 34.704 6.46 44.72 18.752 4.861 5.963 8.546 13.162 10.988 21.385l15.18-4.065c-2.898-9.825-7.456-18.478-13.593-25.82C161.53 18.78 142.632 10.91 117.686 10.731h-.109C92.718 10.91 73.97 18.681 60.942 34.624 46.316 52.547 38.78 77.313 38.598 95.94v.128c.182 18.628 7.717 43.39 22.343 61.309 13.032 15.952 31.78 23.726 56.632 23.905h.109c21.065-.161 36.694-5.89 49.24-18.04 16.23-15.706 15.192-41.113 6.685-57.237a62.132 62.132 0 0 0-32.07-27.017ZM98.882 142.816c-15.194 0-24.617-7.7-24.617-20.1 0-11.928 8.077-20.265 24.907-20.265a80.22 80.22 0 0 1 22.344 2.9c-2.064 24.07-11.746 37.464-22.634 37.464Z" />
    </svg>
  );
}

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
  threads: { name: 'Threads', color: '#e4e4f0', bgClass: 'bg-white', icon: <ThreadsIcon className="h-3.5 w-3.5" /> },
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
