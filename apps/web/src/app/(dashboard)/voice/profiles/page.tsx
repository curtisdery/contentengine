'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Mic, Trash2, Pencil, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ToneMeter } from '@/components/voice/tone-meter';
import { useToast } from '@/hooks/use-toast';
import { callFunction, ApiClientError } from '@/lib/cloud-functions';
import { ROUTES } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import { PageTitle } from '@/components/layout/page-title';
import type { VoiceProfileResponse } from '@/types/api';

function ProfileCardSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-20 rounded-full" />
          </div>
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-14 rounded-full" />
        </div>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-3 w-24" />
      </CardContent>
    </Card>
  );
}

interface DeleteConfirmProps {
  profileName: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}

function DeleteConfirm({
  profileName,
  onConfirm,
  onCancel,
  isDeleting,
}: DeleteConfirmProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <Card className="mx-4 w-full max-w-md">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-cme-text">
            Delete Voice Profile
          </h3>
          <p className="mt-2 text-sm text-cme-text-muted">
            Are you sure you want to delete &ldquo;{profileName}&rdquo;? This
            action cannot be undone.
          </p>
          <div className="mt-6 flex items-center justify-end gap-3">
            <Button
              variant="ghost"
              onClick={onCancel}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirm}
              isLoading={isDeleting}
            >
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-cme-surface-hover">
        <Mic className="h-8 w-8 text-cme-text-muted" />
      </div>
      <h3 className="mt-6 text-lg font-semibold text-cme-text">
        No voice profiles yet
      </h3>
      <p className="mt-2 max-w-sm text-center text-sm text-cme-text-muted">
        Set up your first voice profile to ensure every output sounds like you.
      </p>
      <Button className="mt-6" onClick={() => router.push(ROUTES.VOICE_SETUP)}>
        <Plus className="mr-2 h-4 w-4" />
        Create Your First Profile
      </Button>
    </div>
  );
}

export default function VoiceProfilesPage() {
  const router = useRouter();
  const { success, error: showError } = useToast();
  const [profiles, setProfiles] = React.useState<VoiceProfileResponse[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<VoiceProfileResponse | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const fetchProfiles = React.useCallback(async () => {
    try {
      const response = await callFunction<Record<string, unknown>, { items: VoiceProfileResponse[]; total: number }>(
        'listVoiceProfiles',
        {}
      );
      setProfiles(response.items);
      setError(null);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.detail);
      } else {
        setError('Failed to load voice profiles.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      await callFunction('deleteVoiceProfile', { profile_id: deleteTarget.id });
      setProfiles((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      success(
        'Profile deleted',
        `"${deleteTarget.profile_name}" has been removed.`
      );
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError('Delete failed', err.detail);
      } else {
        showError('Delete failed', 'Please try again.');
      }
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageTitle title="Voice Profiles" />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-cme-text">Voice Profiles</h1>
          <p className="mt-1 text-sm text-cme-text-muted">
            Manage your voice profiles for consistent content generation
          </p>
        </div>
        <Button onClick={() => router.push(ROUTES.VOICE_SETUP)}>
          <Plus className="mr-2 h-4 w-4" />
          Create New Profile
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
              fetchProfiles();
            }}
            className="ml-auto shrink-0"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <ProfileCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && profiles.length === 0 && <EmptyState />}

      {/* Profiles Grid */}
      {!isLoading && profiles.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map((profile) => (
            <Card
              key={profile.id}
              className="group transition-all duration-200 hover:border-cme-border-bright"
            >
              <CardContent className="space-y-4 p-5">
                {/* Name & Default Badge */}
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-cme-text">
                      {profile.profile_name}
                    </h3>
                    {profile.is_default && (
                      <Badge variant="secondary" className="mt-1">
                        Default
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => router.push(`${ROUTES.VOICE_SETUP}?edit=${profile.id}`)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 hover:text-cme-error"
                      onClick={() => setDeleteTarget(profile)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Voice Attributes */}
                {(profile.voice_attributes ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {profile.voice_attributes.map((attr) => (
                      <span
                        key={attr}
                        className="rounded-full border border-cme-primary/30 bg-cme-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-cme-primary"
                      >
                        {attr}
                      </span>
                    ))}
                  </div>
                )}

                {/* Tone Metrics */}
                {profile.tone_metrics && Object.keys(profile.tone_metrics).length > 0 && (
                  <ToneMeter metrics={profile.tone_metrics} size="sm" />
                )}

                {/* Date */}
                <p className="text-xs text-cme-text-muted">
                  Created {formatDate(profile.created_at)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <DeleteConfirm
          profileName={deleteTarget.profile_name}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          isDeleting={isDeleting}
        />
      )}
    </div>
  );
}
