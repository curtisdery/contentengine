'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VoiceWizard } from '@/components/voice/voice-wizard';
import { useToast } from '@/hooks/use-toast';
import { apiClient, ApiClientError } from '@/lib/api';
import { ROUTES } from '@/lib/constants';
import type { VoiceProfileCreateRequest, VoiceProfileResponse } from '@/types/api';

export default function VoiceSetupPage() {
  const router = useRouter();
  const { success, error: showError } = useToast();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleComplete = async (data: VoiceProfileCreateRequest) => {
    setIsSubmitting(true);

    try {
      await apiClient.post<VoiceProfileResponse>(
        '/api/v1/voice/profiles',
        data
      );
      success(
        'Voice profile created',
        `"${data.profile_name}" is ready to use.`
      );
      router.push(ROUTES.VOICE_PROFILES);
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError('Failed to create profile', err.detail);
      } else {
        showError(
          'Failed to create profile',
          'An unexpected error occurred. Please try again.'
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push(ROUTES.VOICE_PROFILES)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-cme-text">
            Voice Profile Setup
          </h1>
          <p className="mt-1 text-sm text-cme-text-muted">
            Teach Pandocast how you write and speak
          </p>
        </div>
      </div>

      {/* Wizard */}
      {isSubmitting ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-cme-primary border-t-transparent" />
          <p className="mt-4 text-sm text-cme-text-muted">
            Creating your voice profile...
          </p>
        </div>
      ) : (
        <VoiceWizard onComplete={handleComplete} />
      )}
    </div>
  );
}
