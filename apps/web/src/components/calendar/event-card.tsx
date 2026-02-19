'use client';

import * as React from 'react';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getPlatformConfig } from '@/components/content/platform-badge';
import type { ScheduledEventResponse } from '@/types/api';

interface EventCardProps {
  event: ScheduledEventResponse;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
  onClick?: () => void;
  compact?: boolean;
}

const statusStyles: Record<
  string,
  { border: string; icon: React.ReactNode; glow?: string }
> = {
  scheduled: {
    border: 'border-cme-primary/40',
    icon: <Clock className="h-3 w-3 text-cme-primary" />,
  },
  publishing: {
    border: 'border-yellow-400/60',
    icon: <Loader2 className="h-3 w-3 text-yellow-400 animate-spin" />,
    glow: 'shadow-[0_0_8px_rgba(250,204,21,0.2)]',
  },
  published: {
    border: 'border-cme-success/40',
    icon: <CheckCircle2 className="h-3 w-3 text-cme-success" />,
    glow: 'shadow-[0_0_8px_rgba(0,200,150,0.15)]',
  },
  failed: {
    border: 'border-cme-error/60',
    icon: <AlertTriangle className="h-3 w-3 text-cme-error" />,
  },
  cancelled: {
    border: 'border-cme-text-muted/30',
    icon: <XCircle className="h-3 w-3 text-cme-text-muted" />,
  },
};

function EventCard({ event, onDragStart, onClick, compact = false }: EventCardProps) {
  const platformConfig = getPlatformConfig(event.platform_id);
  const statusConfig = statusStyles[event.status] || statusStyles.scheduled;
  const scheduledDate = new Date(event.scheduled_at);
  const timeStr = scheduledDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const isCancelled = event.status === 'cancelled';

  if (compact) {
    return (
      <div
        draggable={event.status === 'scheduled'}
        onDragStart={onDragStart}
        onClick={onClick}
        className={cn(
          'group flex items-center gap-1.5 rounded-md px-2 py-1 cursor-pointer',
          'transition-all duration-200 hover:bg-cme-surface-hover/80',
          'border border-transparent hover:border-cme-border',
          event.status === 'scheduled' && 'cursor-grab active:cursor-grabbing'
        )}
      >
        <span
          className={cn(
            'h-2 w-2 shrink-0 rounded-full',
            platformConfig.bgClass
          )}
        />
        <span
          className={cn(
            'text-[11px] text-cme-text-muted truncate',
            isCancelled && 'line-through opacity-50'
          )}
        >
          {timeStr}
        </span>
        {statusConfig.icon}
      </div>
    );
  }

  return (
    <div
      draggable={event.status === 'scheduled'}
      onDragStart={onDragStart}
      onClick={onClick}
      className={cn(
        'group relative rounded-lg border bg-cme-surface/90 backdrop-blur-sm p-2.5 cursor-pointer',
        'transition-all duration-200',
        'hover:bg-cme-surface-hover hover:border-cme-border-bright',
        statusConfig.border,
        statusConfig.glow,
        event.status === 'publishing' && 'animate-pulse',
        event.status === 'scheduled' && 'cursor-grab active:cursor-grabbing',
        isCancelled && 'opacity-50'
      )}
    >
      {/* Top row: platform + time */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={cn(
              'h-2.5 w-2.5 shrink-0 rounded-full',
              platformConfig.bgClass
            )}
          />
          <span className="text-xs font-medium text-cme-text truncate">
            {platformConfig.name}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {statusConfig.icon}
          <span className="text-[10px] text-cme-text-muted">{timeStr}</span>
        </div>
      </div>

      {/* Content preview */}
      {event.output_content && (
        <p
          className={cn(
            'text-[11px] leading-relaxed text-cme-text-muted line-clamp-2',
            isCancelled && 'line-through'
          )}
        >
          {event.output_content}
        </p>
      )}

      {/* Format name */}
      {event.output_format_name && (
        <div className="mt-1.5 flex items-center gap-1">
          <span className="text-[10px] rounded bg-cme-surface-hover px-1.5 py-0.5 text-cme-text-muted">
            {event.output_format_name}
          </span>
        </div>
      )}

      {/* Failed indicator */}
      {event.status === 'failed' && event.publish_error && (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-cme-error">
          <AlertTriangle className="h-2.5 w-2.5" />
          <span className="truncate">{event.publish_error}</span>
        </div>
      )}

      {/* Drag handle indicator */}
      {event.status === 'scheduled' && (
        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="flex flex-col gap-0.5">
            <div className="h-0.5 w-3 rounded-full bg-cme-text-muted/40" />
            <div className="h-0.5 w-3 rounded-full bg-cme-text-muted/40" />
          </div>
        </div>
      )}
    </div>
  );
}

export { EventCard };
export type { EventCardProps };
