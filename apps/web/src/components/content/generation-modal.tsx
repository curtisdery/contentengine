'use client';

import * as React from 'react';
import { X, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PlatformSelector } from '@/components/content/platform-selector';
import { getPlatformConfig } from '@/components/content/platform-badge';
import { callFunction, ApiClientError } from '@/lib/cloud-functions';
import { getAllPlatforms } from '@/lib/platform-profiles';
import { trackEvent } from '@/lib/analytics';
import { useToast } from '@/hooks/use-toast';
import type {
  VoiceProfileResponse,
  PlatformProfileResponse,
  GenerateRequest,
  GeneratedOutputListResponse,
} from '@/types/api';

interface GenerationModalProps {
  contentId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type ModalStep = 'configure' | 'generating' | 'complete';

function GenerationModal({ contentId, isOpen, onClose, onSuccess }: GenerationModalProps) {
  const { error: showError } = useToast();

  // Form state
  const [voiceProfiles, setVoiceProfiles] = React.useState<VoiceProfileResponse[]>([]);
  const [platforms, setPlatforms] = React.useState<PlatformProfileResponse[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = React.useState<string>('');
  const [selectedPlatforms, setSelectedPlatforms] = React.useState<string[]>([]);
  const [emphasisNotes, setEmphasisNotes] = React.useState('');
  const [isLoadingData, setIsLoadingData] = React.useState(true);

  // Generation state
  const [step, setStep] = React.useState<ModalStep>('configure');
  const [currentPlatformIndex, setCurrentPlatformIndex] = React.useState(0);

  // Load voice profiles and platforms
  React.useEffect(() => {
    if (!isOpen) return;

    const loadData = async () => {
      setIsLoadingData(true);
      try {
        const voiceRes = await callFunction<Record<string, unknown>, { items: VoiceProfileResponse[]; total: number }>(
          'listVoiceProfiles', {}
        ).catch(() => ({ items: [] as VoiceProfileResponse[], total: 0 }));
        const platformProfiles = getAllPlatforms();
        const platformsRes: PlatformProfileResponse[] = platformProfiles.map((p) => ({
          platform_id: p.platformId,
          name: p.name,
          tier: p.tier,
          native_tone: '',
          media_format: p.mediaFormat,
          posting_cadence: '',
          length_range: { min: 0, ideal: 0, max: 0 },
        }));
        setVoiceProfiles(voiceRes.items);
        setPlatforms(platformsRes);

        // Select all platforms by default
        setSelectedPlatforms(platformsRes.map((p) => p.platform_id));

        // Select default voice profile if available
        const defaultProfile = voiceRes.items.find((p) => p.is_default);
        if (defaultProfile) {
          setSelectedVoiceId(defaultProfile.id);
        }
      } catch {
        showError('Failed to load configuration', 'Please try again.');
      } finally {
        setIsLoadingData(false);
      }
    };

    loadData();
  }, [isOpen, showError]);

  // Reset on close
  React.useEffect(() => {
    if (!isOpen) {
      setStep('configure');
      setCurrentPlatformIndex(0);
      setEmphasisNotes('');
    }
  }, [isOpen]);

  // Animate through platforms during generation
  React.useEffect(() => {
    if (step !== 'generating' || selectedPlatforms.length === 0) return;

    const interval = setInterval(() => {
      setCurrentPlatformIndex((prev) => (prev + 1) % selectedPlatforms.length);
    }, 1200);

    return () => clearInterval(interval);
  }, [step, selectedPlatforms.length]);

  const handleGenerate = async () => {
    if (selectedPlatforms.length === 0) {
      showError('No platforms selected', 'Select at least one platform to generate content for.');
      return;
    }

    setStep('generating');
    setCurrentPlatformIndex(0);

    try {
      const request: GenerateRequest = {
        selected_platforms: selectedPlatforms,
      };
      if (selectedVoiceId) {
        request.voice_profile_id = selectedVoiceId;
      }
      if (emphasisNotes.trim()) {
        request.emphasis_notes = emphasisNotes.trim();
      }

      await callFunction<GenerateRequest & { content_id: string }, GeneratedOutputListResponse>(
        'triggerGeneration', { content_id: contentId, ...request }
      );

      setStep('complete');
      trackEvent('content_generated', { platforms_count: selectedPlatforms.length });

      // Brief pause to show success, then navigate
      setTimeout(() => {
        onSuccess();
      }, 800);
    } catch (err) {
      setStep('configure');
      if (err instanceof ApiClientError) {
        showError('Generation failed', err.detail);
      } else {
        showError('Generation failed', 'An unexpected error occurred. Please try again.');
      }
    }
  };

  if (!isOpen) return null;

  const currentPlatformId = selectedPlatforms[currentPlatformIndex];
  const currentPlatformName = currentPlatformId
    ? getPlatformConfig(currentPlatformId).name
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={step === 'configure' ? onClose : undefined}
      />

      {/* Modal */}
      <Card className="relative z-10 mx-4 w-full max-w-xl max-h-[90vh] overflow-hidden border-cme-border shadow-2xl">
        {/* Close button */}
        {step === 'configure' && (
          <button
            onClick={onClose}
            className="absolute right-4 top-4 z-10 rounded-lg p-1.5 text-cme-text-muted hover:text-cme-text hover:bg-cme-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cme-primary"
          >
            <X className="h-5 w-5" />
          </button>
        )}

        {step === 'configure' && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-cme-primary" />
                Generate Platform Content
              </CardTitle>
              <p className="text-sm text-cme-text-muted">
                Transform your Content DNA into platform-optimized formats.
              </p>
            </CardHeader>
            <CardContent className="max-h-[60vh] space-y-6 overflow-y-auto">
              {isLoadingData ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-cme-primary" />
                </div>
              ) : (
                <>
                  {/* Voice Profile Selector */}
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-cme-text">
                      Voice Profile (optional)
                    </label>
                    <select
                      value={selectedVoiceId}
                      onChange={(e) => setSelectedVoiceId(e.target.value)}
                      className={cn(
                        'flex h-10 w-full rounded-lg border border-cme-border bg-cme-surface px-3 py-2 text-sm text-cme-text',
                        'transition-all duration-200',
                        'focus:outline-none focus:ring-2 focus:ring-cme-primary/50 focus:border-cme-primary',
                        'hover:border-cme-border-bright',
                        'appearance-none cursor-pointer'
                      )}
                    >
                      <option value="">No voice profile</option>
                      {voiceProfiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.profile_name}
                          {profile.is_default ? ' (Default)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Platform Selection */}
                  <PlatformSelector
                    selected={selectedPlatforms}
                    onChange={setSelectedPlatforms}
                    platforms={platforms}
                  />

                  {/* Emphasis Notes */}
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-cme-text">
                      Emphasis Notes (optional)
                    </label>
                    <textarea
                      value={emphasisNotes}
                      onChange={(e) => setEmphasisNotes(e.target.value)}
                      placeholder="E.g., lead with the personal story, emphasize data points, keep it conversational..."
                      rows={3}
                      className={cn(
                        'flex w-full rounded-lg border border-cme-border bg-cme-surface px-3 py-3 text-sm text-cme-text placeholder:text-cme-text-muted',
                        'transition-all duration-200 resize-y',
                        'focus:outline-none focus:ring-2 focus:ring-cme-primary/50 focus:border-cme-primary',
                        'hover:border-cme-border-bright'
                      )}
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-3 pt-2">
                    <Button
                      variant="outline"
                      onClick={onClose}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleGenerate}
                      disabled={selectedPlatforms.length === 0}
                      className="flex-1"
                    >
                      <Sparkles className="mr-2 h-4 w-4" />
                      Generate {selectedPlatforms.length} Format{selectedPlatforms.length !== 1 ? 's' : ''}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </>
        )}

        {step === 'generating' && (
          <CardContent className="flex flex-col items-center justify-center py-16">
            {/* Animated ring */}
            <div className="relative mb-8">
              <div className="h-24 w-24 rounded-full border-4 border-cme-surface-hover">
                <div className="absolute inset-0 h-24 w-24 animate-spin rounded-full border-4 border-transparent border-t-cme-primary" />
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <Sparkles className="h-8 w-8 text-cme-primary animate-pulse" />
              </div>
            </div>

            <h3 className="text-lg font-semibold text-cme-text">
              Generating Content
            </h3>
            <p className="mt-2 text-sm text-cme-text-muted">
              Creating platform-optimized versions of your content...
            </p>

            {/* Current platform indicator */}
            <div className="mt-6 flex items-center gap-2 rounded-full border border-cme-border bg-cme-surface/80 px-4 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-cme-primary" />
              <span className="text-sm font-medium text-cme-text transition-all duration-300">
                {currentPlatformName}...
              </span>
            </div>

            {/* Progress bar */}
            <div className="mt-6 h-1.5 w-64 overflow-hidden rounded-full bg-cme-surface-hover">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cme-primary to-cme-secondary animate-pulse"
                style={{ width: '60%' }}
              />
            </div>
          </CardContent>
        )}

        {step === 'complete' && (
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-cme-success/20">
              <svg
                viewBox="0 0 24 24"
                className="h-10 w-10 text-cme-success"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="mt-4 text-lg font-semibold text-cme-text">
              Generation Complete!
            </h3>
            <p className="mt-2 text-sm text-cme-text-muted">
              Redirecting to your generated outputs...
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

export { GenerationModal };
