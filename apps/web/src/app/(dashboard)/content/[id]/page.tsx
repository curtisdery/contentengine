'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, AlertCircle, Sparkles, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/content/status-badge';
import { DNACard, DNACardSkeleton } from '@/components/content/dna-card';
import { GenerationModal } from '@/components/content/generation-modal';
import { useToast } from '@/hooks/use-toast';
import { apiClient, ApiClientError } from '@/lib/api';
import { ROUTES } from '@/lib/constants';
import type { ContentUploadResponse, ContentUpdateRequest } from '@/types/api';

const contentTypeLabels: Record<string, string> = {
  blog: 'Blog',
  video_transcript: 'Video Transcript',
  podcast_transcript: 'Podcast Transcript',
};

export default function ContentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { success, error: showError } = useToast();
  const id = params.id as string;

  const [content, setContent] = React.useState<ContentUploadResponse | null>(
    null
  );
  const [isLoading, setIsLoading] = React.useState(true);
  const [isReanalyzing, setIsReanalyzing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedHookIndex, setSelectedHookIndex] = React.useState<
    number | null
  >(null);
  const [emphasisNotes, setEmphasisNotes] = React.useState('');
  const [isGenerationModalOpen, setIsGenerationModalOpen] = React.useState(false);

  const fetchContent = React.useCallback(async () => {
    try {
      const response = await apiClient.get<ContentUploadResponse>(
        `/api/v1/content/${id}`
      );
      setContent(response);
      setError(null);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 404) {
          setError('Content not found.');
        } else {
          setError(err.detail);
        }
      } else {
        setError('Failed to load content. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  // Poll while analyzing
  React.useEffect(() => {
    if (content?.status !== 'analyzing') return;

    const interval = setInterval(async () => {
      try {
        const response = await apiClient.get<ContentUploadResponse>(
          `/api/v1/content/${id}`
        );
        setContent(response);
        if (response.status !== 'analyzing') {
          clearInterval(interval);
        }
      } catch {
        // Silently retry on next interval
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [content?.status, id]);

  const handleReanalyze = async () => {
    setIsReanalyzing(true);
    try {
      await apiClient.post<ContentUploadResponse>(
        `/api/v1/content/${id}/analyze`
      );
      success('Re-analysis started', 'Your content is being re-analyzed.');
      // Refetch to get new status
      const updated = await apiClient.get<ContentUploadResponse>(
        `/api/v1/content/${id}`
      );
      setContent(updated);
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError('Re-analysis failed', err.detail);
      } else {
        showError('Re-analysis failed', 'Please try again.');
      }
    } finally {
      setIsReanalyzing(false);
    }
  };

  const handleUpdateContent = async () => {
    const updates: ContentUpdateRequest = {};
    if (emphasisNotes.trim()) {
      updates.emphasis_notes = emphasisNotes.trim();
    }
    if (selectedHookIndex !== null) {
      updates.focus_hook_index = selectedHookIndex;
    }

    if (Object.keys(updates).length === 0) return;

    try {
      const updated = await apiClient.patch<ContentUploadResponse>(
        `/api/v1/content/${id}`,
        updates
      );
      setContent(updated);
      success('Content updated', 'Your preferences have been saved.');
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError('Update failed', err.detail);
      } else {
        showError('Update failed', 'Please try again.');
      }
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <DNACardSkeleton />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center gap-4">
          <Link href={ROUTES.CONTENT}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-cme-text">Content Detail</h1>
        </div>

        <div className="flex flex-col items-center justify-center py-20">
          <AlertCircle className="h-12 w-12 text-cme-error" />
          <h2 className="mt-4 text-lg font-semibold text-cme-text">
            Something went wrong
          </h2>
          <p className="mt-2 text-sm text-cme-text-muted">{error}</p>
          <div className="mt-6 flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => router.push(ROUTES.CONTENT)}
            >
              Go Back
            </Button>
            <Button
              onClick={() => {
                setIsLoading(true);
                setError(null);
                fetchContent();
              }}
            >
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!content) return null;

  const isAnalyzing = content.status === 'analyzing';
  const hasDNA = content.content_dna !== null;
  const isFailed = content.status === 'failed';

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Link href={ROUTES.CONTENT}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-cme-text">
              {content.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                {contentTypeLabels[content.content_type] ||
                  content.content_type}
              </Badge>
              <StatusBadge status={content.status} />
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={handleReanalyze}
          isLoading={isReanalyzing}
          disabled={isReanalyzing || isAnalyzing}
        >
          <RefreshCw
            className={cn('mr-2 h-4 w-4', isReanalyzing && 'animate-spin')}
          />
          Re-analyze
        </Button>
      </div>

      {/* Failed State */}
      {isFailed && (
        <Card className="border-cme-error/30">
          <CardContent className="flex items-center gap-4 p-6">
            <AlertCircle className="h-8 w-8 shrink-0 text-cme-error" />
            <div className="flex-1">
              <h3 className="font-semibold text-cme-text">Analysis Failed</h3>
              <p className="mt-1 text-sm text-cme-text-muted">
                Something went wrong during analysis. Please try re-analyzing
                your content.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={handleReanalyze}
              isLoading={isReanalyzing}
            >
              Retry Analysis
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Analyzing State */}
      {isAnalyzing && <DNACardSkeleton />}

      {/* DNA Card */}
      {hasDNA && content.content_dna && (
        <DNACard
          dna={content.content_dna}
          isLoading={false}
          selectedHookIndex={selectedHookIndex}
          onSelectHook={setSelectedHookIndex}
        />
      )}

      {/* Bottom Action Bar */}
      {hasDNA && (
        <Card>
          <CardHeader>
            <CardTitle>Next Steps</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-cme-text">
                Emphasis Notes
              </label>
              <textarea
                value={emphasisNotes}
                onChange={(e) => setEmphasisNotes(e.target.value)}
                placeholder="Adjust the focus (optional) — e.g., emphasize the data points, lead with the personal story..."
                rows={3}
                className={cn(
                  'flex w-full rounded-lg border border-cme-border bg-cme-surface px-3 py-3 text-sm text-cme-text placeholder:text-cme-text-muted',
                  'transition-all duration-200 resize-y',
                  'focus:outline-none focus:ring-2 focus:ring-cme-primary/50 focus:border-cme-primary',
                  'hover:border-cme-border-bright'
                )}
              />
            </div>

            {(emphasisNotes.trim() || selectedHookIndex !== null) && (
              <Button variant="outline" onClick={handleUpdateContent}>
                Save Preferences
              </Button>
            )}

            <div className="flex items-center gap-3 rounded-lg border border-cme-primary/30 bg-gradient-to-r from-cme-primary/5 to-cme-secondary/5 p-4">
              <Sparkles className="h-5 w-5 shrink-0 text-cme-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium text-cme-text">
                  Generate Content
                </p>
                <p className="text-xs text-cme-text-muted">
                  Transform your Content DNA into platform-specific formats
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => setIsGenerationModalOpen(true)}
              >
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                Generate
              </Button>
            </div>

            {/* View existing outputs link */}
            <div className="flex items-center gap-3 rounded-lg border border-cme-border bg-cme-surface/50 p-4">
              <FileText className="h-5 w-5 shrink-0 text-cme-text-muted" />
              <div className="flex-1">
                <p className="text-sm font-medium text-cme-text">
                  View Generated Outputs
                </p>
                <p className="text-xs text-cme-text-muted">
                  Review, edit, and approve your generated content
                </p>
              </div>
              <Link href={`${ROUTES.CONTENT_DETAIL}/${id}/outputs`}>
                <Button variant="outline" size="sm">
                  View Outputs
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Generation Modal */}
      <GenerationModal
        contentId={id}
        isOpen={isGenerationModalOpen}
        onClose={() => setIsGenerationModalOpen(false)}
        onSuccess={() => {
          setIsGenerationModalOpen(false);
          router.push(`${ROUTES.CONTENT_DETAIL}/${id}/outputs`);
        }}
      />

      {/* Uploaded but not analyzed yet */}
      {!hasDNA && !isAnalyzing && !isFailed && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <p className="text-lg font-semibold text-cme-text">
              Content uploaded successfully
            </p>
            <p className="mt-2 text-sm text-cme-text-muted">
              Click &ldquo;Re-analyze&rdquo; to extract the Content DNA.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
