'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, FileText, AlertCircle, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/content/status-badge';
import { callFunction, ApiClientError } from '@/lib/cloud-functions';
import { useToast } from '@/hooks/use-toast';
import { ROUTES } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import { PageTitle } from '@/components/layout/page-title';
import type { ContentListResponse, ContentUploadResponse } from '@/types/api';

function cleanTitle(title: string): string {
  return title.replace(/^(x account|twitter|linkedin|facebook|instagram)\s+/i, '').trim();
}

const contentTypeBadgeVariant: Record<string, 'default' | 'secondary' | 'outline'> = {
  blog: 'default',
  video_transcript: 'secondary',
  podcast_transcript: 'outline',
};

const contentTypeLabels: Record<string, string> = {
  blog: 'Blog',
  video_transcript: 'Video',
  podcast_transcript: 'Podcast',
};

function ContentCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="space-y-3">
          <Skeleton className="h-5 w-3/4" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="h-4 w-1/3" />
        </div>
      </CardContent>
    </Card>
  );
}

function ContentCard({
  item,
  onDelete,
}: {
  item: ContentUploadResponse;
  onDelete: (id: string) => void;
}) {
  const router = useRouter();

  return (
    <Card
      className="group relative cursor-pointer transition-all duration-200 hover:border-cme-border-bright hover:bg-cme-surface-hover/50"
      onClick={() => router.push(`${ROUTES.CONTENT_DETAIL}/${item.id}`)}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          router.push(`${ROUTES.CONTENT_DETAIL}/${item.id}`);
        }
      }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(item.id);
        }}
        className="absolute right-3 top-3 rounded-lg p-1.5 text-cme-text-muted opacity-0 transition-all hover:bg-cme-error/10 hover:text-cme-error group-hover:opacity-100 focus-visible:opacity-100"
        aria-label={`Delete ${item.title}`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <CardContent className="p-5">
        <div className="space-y-3">
          <h3 className="text-base font-semibold text-cme-text group-hover:text-cme-primary transition-colors line-clamp-2 pr-8">
            {cleanTitle(item.title)}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={contentTypeBadgeVariant[item.content_type] || 'outline'}
            >
              {contentTypeLabels[item.content_type] || item.content_type}
            </Badge>
            <StatusBadge status={item.status} />
          </div>
          <p className="text-xs text-cme-text-muted">
            {formatDate(item.created_at)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-cme-surface-hover">
        <FileText className="h-8 w-8 text-cme-text-muted" />
      </div>
      <h3 className="mt-6 text-lg font-semibold text-cme-text">
        No content yet
      </h3>
      <p className="mt-2 max-w-sm text-center text-sm text-cme-text-muted">
        Upload your first piece of content to start multiplying it across
        platforms.
      </p>
      <Button className="mt-6" onClick={() => router.push(ROUTES.CONTENT_UPLOAD)}>
        <Plus className="mr-2 h-4 w-4" />
        Upload Your First Content
      </Button>
    </div>
  );
}

export default function ContentListPage() {
  const router = useRouter();
  const { success: showSuccess, error: showError } = useToast();
  const [items, setItems] = React.useState<ContentUploadResponse[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const handleDelete = async () => {
    if (!deletingId) return;
    setIsDeleting(true);
    try {
      await callFunction('deleteContent', { content_id: deletingId });
      setItems((prev) => prev.filter((item) => item.id !== deletingId));
      showSuccess('Content deleted', 'The content has been removed.');
      setDeletingId(null);
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError('Delete failed', err.detail);
      } else {
        showError('Delete failed', 'Could not delete content. Please try again.');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  React.useEffect(() => {
    async function fetchContent() {
      try {
        const response = await callFunction<Record<string, unknown>, ContentListResponse>(
          'listContent', {}
        );
        setItems(response.items);
      } catch (err) {
        if (err instanceof ApiClientError) {
          setError(err.detail);
        } else {
          setError('Failed to load content. Please try again.');
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchContent();
  }, []);

  return (
    <div className="space-y-6">
      <PageTitle title="Content" />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-cme-text">Your Content</h1>
          <p className="mt-1 text-sm text-cme-text-muted">
            Manage and analyze your uploaded content
          </p>
        </div>
        <Button onClick={() => router.push(ROUTES.CONTENT_UPLOAD)}>
          <Plus className="mr-2 h-4 w-4" />
          Upload New
        </Button>
      </div>

      {/* Error State */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-cme-error/30 bg-cme-error/10 p-4">
          <AlertCircle className="h-5 w-5 shrink-0 text-cme-error" />
          <p className="text-sm text-cme-error">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setError(null);
              setIsLoading(true);
              callFunction<Record<string, unknown>, ContentListResponse>('listContent', {})
                .then((res) => setItems(res.items))
                .catch(() => setError('Failed to load content.'))
                .finally(() => setIsLoading(false));
            }}
            className="ml-auto shrink-0"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div
          className={cn(
            'grid gap-4',
            'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
          )}
        >
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <ContentCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && items.length === 0 && <EmptyState />}

      {/* Content Grid */}
      {!isLoading && items.length > 0 && (
        <div
          className={cn(
            'grid gap-4',
            'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
          )}
        >
          {items.map((item) => (
            <ContentCard
              key={item.id}
              item={item}
              onDelete={(id) => setDeletingId(id)}
            />
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={() => !isDeleting && setDeletingId(null)}
          />
          <Card className="relative z-10 mx-4 w-full max-w-sm border-cme-border shadow-2xl">
            <button
              onClick={() => !isDeleting && setDeletingId(null)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-cme-text-muted hover:text-cme-text hover:bg-cme-surface-hover transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            <CardContent className="flex flex-col items-center py-8 px-6 text-center">
              <div className="mb-4 rounded-2xl bg-cme-error/10 p-4">
                <Trash2 className="h-8 w-8 text-cme-error" />
              </div>
              <h3 className="text-lg font-semibold text-cme-text">
                Delete Content
              </h3>
              <p className="mt-2 text-sm text-cme-text-muted">
                Are you sure you want to delete this content? This action cannot
                be undone.
              </p>
              <div className="mt-6 flex w-full gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setDeletingId(null)}
                  disabled={isDeleting}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={handleDelete}
                  isLoading={isDeleting}
                  disabled={isDeleting}
                >
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
