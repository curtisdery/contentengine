'use client';

import * as React from 'react';
import {
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Pencil,
  ShieldCheck,
  AlertTriangle,
  Save,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { VoiceScoreGauge } from '@/components/content/voice-score-gauge';
import { PlatformBadge } from '@/components/content/platform-badge';
import type { GeneratedOutputResponse, PlatformProfileResponse } from '@/types/api';

interface OutputCardProps {
  output: GeneratedOutputResponse;
  onApprove: () => void;
  onEdit: (content: string) => void;
  onSelect: () => void;
  isSelected: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  isApproving?: boolean;
  isSaving?: boolean;
  platformInfo?: PlatformProfileResponse;
}

const statusBadgeVariant: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'error' | 'outline'> = {
  draft: 'outline',
  approved: 'success',
  scheduled: 'default',
  published: 'secondary',
  rejected: 'error',
};

function getWordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function getTierFromPlatformId(platformId: string): number {
  // Default tier mapping — overridden by platformInfo when available
  const tierMap: Record<string, number> = {
    twitter: 1,
    linkedin: 1,
    instagram: 2,
    youtube: 2,
    tiktok: 2,
    reddit: 3,
    medium: 3,
    threads: 3,
    facebook: 3,
    pinterest: 4,
    bluesky: 4,
    email: 4,
    quora: 5,
    press: 5,
    slides: 6,
    substack: 4,
  };
  return tierMap[platformId.toLowerCase()] || 3;
}

function OutputCard({
  output,
  onApprove,
  onEdit,
  onSelect,
  isSelected,
  expanded,
  onToggleExpand,
  isApproving = false,
  isSaving = false,
  platformInfo,
}: OutputCardProps) {
  const [copied, setCopied] = React.useState(false);
  const [isEditing, setIsEditing] = React.useState(false);
  const [editContent, setEditContent] = React.useState(output.content);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const tier = platformInfo?.tier ?? getTierFromPlatformId(output.platform_id);
  const score = output.voice_match_score ?? 0;
  const charCount = output.content.length;
  const wordCount = getWordCount(output.content);
  const isApproved = output.status === 'approved';
  const maxLength = platformInfo?.length_range?.max;

  // Auto-resize textarea
  React.useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [isEditing, editContent]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(output.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  const handleSaveEdit = () => {
    if (editContent.trim() !== output.content) {
      onEdit(editContent.trim());
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditContent(output.content);
    setIsEditing(false);
  };

  const handleStartEdit = () => {
    setEditContent(output.content);
    setIsEditing(true);
  };

  // Glow effect based on score
  const glowClass = score >= 90
    ? 'shadow-[0_0_20px_rgba(52,211,153,0.08)]'
    : score >= 70
      ? 'shadow-[0_0_15px_rgba(0,206,201,0.06)]'
      : '';

  const preview = output.content.length > 200
    ? output.content.slice(0, 200) + '...'
    : output.content;

  return (
    <Card
      className={cn(
        'group relative transition-all duration-300',
        glowClass,
        isSelected && 'border-cme-primary shadow-[0_0_20px_rgba(108,92,231,0.2)]',
        isApproved && !isSelected && 'border-cme-success/30',
        expanded && 'col-span-full'
      )}
    >
      {/* Approved overlay indicator */}
      {isApproved && (
        <div className="absolute right-3 top-3 z-10">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-cme-success/20">
            <Check className="h-3.5 w-3.5 text-cme-success" />
          </div>
        </div>
      )}

      <CardContent className="p-5">
        {/* Header: Platform + Score + Status */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Selection checkbox */}
            <button
              type="button"
              onClick={onSelect}
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cme-primary',
                isSelected
                  ? 'border-cme-primary bg-cme-primary'
                  : 'border-cme-border bg-transparent hover:border-cme-border-bright'
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
            </button>

            <PlatformBadge
              platformId={output.platform_id}
              showTier
              tier={tier}
            />
          </div>

          <Badge variant={statusBadgeVariant[output.status] || 'outline'}>
            {output.status}
          </Badge>
        </div>

        {/* Format name */}
        <p className="mt-2 text-xs text-cme-text-muted">{output.format_name}</p>

        {/* Voice score + content preview row */}
        <div className="mt-4 flex gap-4">
          {/* Voice score gauge */}
          <div className="shrink-0">
            <VoiceScoreGauge score={score} size={expanded ? 'md' : 'sm'} />
          </div>

          {/* Content preview or full content */}
          <div className="min-w-0 flex-1">
            {!expanded && !isEditing && (
              <p className="text-sm leading-relaxed text-cme-text whitespace-pre-wrap">
                {preview}
              </p>
            )}

            {expanded && !isEditing && (
              <div className="space-y-3">
                <p className="text-sm leading-relaxed text-cme-text whitespace-pre-wrap">
                  {output.content}
                </p>

                {/* Platform info sidebar (in expanded mode) */}
                {platformInfo && (
                  <div className="rounded-lg border border-cme-border bg-cme-surface/50 p-3 space-y-2">
                    <p className="text-xs font-medium text-cme-text">Platform Details</p>
                    <div className="grid grid-cols-2 gap-2 text-xs text-cme-text-muted">
                      <div>
                        <span className="text-cme-text-muted">Tone:</span>{' '}
                        <span className="text-cme-text">{platformInfo.native_tone}</span>
                      </div>
                      <div>
                        <span className="text-cme-text-muted">Format:</span>{' '}
                        <span className="text-cme-text">{platformInfo.media_format}</span>
                      </div>
                      <div>
                        <span className="text-cme-text-muted">Cadence:</span>{' '}
                        <span className="text-cme-text">{platformInfo.posting_cadence}</span>
                      </div>
                      <div>
                        <span className="text-cme-text-muted">Length:</span>{' '}
                        <span className="text-cme-text">
                          {platformInfo.length_range.min}-{platformInfo.length_range.max} chars
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {isEditing && (
              <div className="space-y-2">
                <textarea
                  ref={textareaRef}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className={cn(
                    'w-full rounded-lg border border-cme-border bg-cme-bg px-3 py-3 text-sm text-cme-text',
                    'transition-all duration-200 resize-y min-h-[120px]',
                    'focus:outline-none focus:ring-2 focus:ring-cme-primary/50 focus:border-cme-primary',
                    'placeholder:text-cme-text-muted'
                  )}
                />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={handleSaveEdit}
                      isLoading={isSaving}
                      disabled={isSaving}
                    >
                      <Save className="mr-1.5 h-3.5 w-3.5" />
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleCancelEdit}
                      disabled={isSaving}
                    >
                      <X className="mr-1.5 h-3.5 w-3.5" />
                      Cancel
                    </Button>
                  </div>
                  {/* Char count with limit */}
                  <span
                    className={cn(
                      'text-xs',
                      maxLength && editContent.length > maxLength
                        ? 'text-red-400'
                        : 'text-cme-text-muted'
                    )}
                  >
                    {editContent.length}
                    {maxLength ? ` / ${maxLength}` : ''} chars
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Stats bar */}
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-cme-border pt-3">
          <span className="text-[11px] text-cme-text-muted">
            {charCount} chars
          </span>
          <span className="text-[11px] text-cme-text-muted">
            {wordCount} words
          </span>
          {maxLength && (
            <span
              className={cn(
                'text-[11px]',
                charCount > maxLength ? 'text-red-400' : 'text-cme-success'
              )}
            >
              {charCount > maxLength
                ? `${charCount - maxLength} over limit`
                : `${maxLength - charCount} chars remaining`}
            </span>
          )}

          {/* Moderation indicator */}
          <div className="ml-auto flex items-center gap-1">
            {output.metadata?.moderation_flagged ? (
              <span className="flex items-center gap-1 text-[11px] text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                Flagged
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] text-cme-success">
                <ShieldCheck className="h-3 w-3" />
                Safe
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={onToggleExpand}
            className="text-xs"
          >
            {expanded ? (
              <ChevronUp className="mr-1.5 h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="mr-1.5 h-3.5 w-3.5" />
            )}
            {expanded ? 'Collapse' : 'Expand'}
          </Button>

          {!isEditing && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleStartEdit}
              className="text-xs"
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Edit
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            onClick={handleCopy}
            className="text-xs"
          >
            {copied ? (
              <>
                <Check className="mr-1.5 h-3.5 w-3.5 text-cme-success" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                Copy
              </>
            )}
          </Button>

          {output.status !== 'approved' && (
            <Button
              size="sm"
              variant="secondary"
              onClick={onApprove}
              isLoading={isApproving}
              disabled={isApproving}
              className="ml-auto text-xs"
            >
              <Check className="mr-1.5 h-3.5 w-3.5" />
              Approve
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export { OutputCard };
