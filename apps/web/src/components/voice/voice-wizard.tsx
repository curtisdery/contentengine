'use client';

import * as React from 'react';
import { Plus, Trash2, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ToneMeter } from '@/components/voice/tone-meter';
import { AttributePicker } from '@/components/voice/attribute-picker';
import { apiClient } from '@/lib/api';
import type { VoiceProfileCreateRequest, VoiceSampleAnalysis } from '@/types/api';

interface VoiceWizardProps {
  onComplete: (data: VoiceProfileCreateRequest) => void;
}

interface WizardState {
  samples: string[];
  analysis: VoiceSampleAnalysis | null;
  voiceAttributes: string[];
  bannedTerms: string;
  preferredTerms: string;
  audienceLabel: string;
  profileName: string;
  isDefault: boolean;
}

const TOTAL_STEPS = 4;

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-0">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => {
        const step = i + 1;
        const isCompleted = step < currentStep;
        const isActive = step === currentStep;

        return (
          <React.Fragment key={step}>
            {i > 0 && (
              <div
                className={cn(
                  'h-0.5 w-12 transition-colors duration-300',
                  isCompleted ? 'bg-cme-secondary' : 'bg-cme-border'
                )}
              />
            )}
            <div
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-bold transition-all duration-300',
                isCompleted &&
                  'border-cme-secondary bg-cme-secondary/20 text-cme-secondary',
                isActive &&
                  'border-cme-primary bg-cme-primary/20 text-cme-primary shadow-[0_0_16px_rgba(108,92,231,0.3)]',
                !isCompleted &&
                  !isActive &&
                  'border-cme-border bg-cme-surface text-cme-text-muted'
              )}
            >
              {isCompleted ? <Check className="h-4 w-4" /> : step}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function VoiceWizard({ onComplete }: VoiceWizardProps) {
  const [currentStep, setCurrentStep] = React.useState(1);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [analysisError, setAnalysisError] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const [state, setState] = React.useState<WizardState>({
    samples: [''],
    analysis: null,
    voiceAttributes: [],
    bannedTerms: '',
    preferredTerms: '',
    audienceLabel: '',
    profileName: '',
    isDefault: false,
  });

  const updateState = (updates: Partial<WizardState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  const addSample = () => {
    if (state.samples.length < 3) {
      updateState({ samples: [...state.samples, ''] });
    }
  };

  const removeSample = (index: number) => {
    if (state.samples.length > 1) {
      updateState({
        samples: state.samples.filter((_, i) => i !== index),
      });
    }
  };

  const updateSample = (index: number, value: string) => {
    const newSamples = [...state.samples];
    newSamples[index] = value;
    updateState({ samples: newSamples });
  };

  const analyzeVoice = async () => {
    const nonEmptySamples = state.samples.filter((s) => s.trim().length > 0);
    if (nonEmptySamples.length === 0) {
      setErrors({ samples: 'Please provide at least one content sample.' });
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);
    setErrors({});

    try {
      const analysis = await apiClient.post<VoiceSampleAnalysis>(
        '/api/v1/voice/analyze',
        { samples: nonEmptySamples }
      );
      updateState({ analysis });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to analyze voice samples';
      setAnalysisError(message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const validateStep = (): boolean => {
    const newErrors: Record<string, string> = {};

    switch (currentStep) {
      case 1: {
        const nonEmpty = state.samples.filter((s) => s.trim().length > 0);
        if (nonEmpty.length === 0) {
          newErrors.samples = 'Please provide at least one content sample.';
        }
        break;
      }
      case 2: {
        if (state.voiceAttributes.length === 0) {
          newErrors.attributes = 'Please select at least one voice attribute.';
        }
        break;
      }
      case 3:
        // No required fields in step 3
        break;
      case 4: {
        if (!state.profileName.trim()) {
          newErrors.profileName = 'Profile name is required.';
        }
        break;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (!validateStep()) return;
    setCurrentStep((prev) => Math.min(prev + 1, TOTAL_STEPS));
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
    setErrors({});
  };

  const handleCreate = () => {
    if (!validateStep()) return;

    const bannedTermsList = state.bannedTerms
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const preferredTermsList = state.preferredTerms
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const data: VoiceProfileCreateRequest = {
      profile_name: state.profileName.trim(),
      voice_attributes: state.voiceAttributes,
      sample_content: state.samples.filter((s) => s.trim().length > 0),
      banned_terms: bannedTermsList,
      preferred_terms: preferredTermsList,
      audience_label: state.audienceLabel.trim(),
      signature_phrases: state.analysis?.signature_phrases || [],
      emoji_policy: {},
      cta_library: [],
      approved_topics: [],
      restricted_topics: [],
      is_default: state.isDefault,
    };

    onComplete(data);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <StepIndicator currentStep={currentStep} />

      {/* Step 1: Voice Samples */}
      {currentStep === 1 && (
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-cme-text">
              Let&apos;s learn your voice
            </h2>
            <p className="mt-2 text-cme-text-muted">
              Paste 2-3 examples of your best-performing content
            </p>
          </div>

          <div className="space-y-4">
            {state.samples.map((sample, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-cme-text">
                    Sample {index + 1}
                  </label>
                  {state.samples.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSample(index)}
                      className="rounded-md p-1 text-cme-text-muted hover:text-cme-error hover:bg-cme-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cme-primary"
                      aria-label={`Remove sample ${index + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <textarea
                  value={sample}
                  onChange={(e) => updateSample(index, e.target.value)}
                  placeholder="Paste your content here..."
                  rows={6}
                  disabled={isAnalyzing}
                  className={cn(
                    'flex w-full rounded-lg border bg-cme-surface px-3 py-3 text-sm text-cme-text placeholder:text-cme-text-muted',
                    'transition-all duration-200 resize-y min-h-[120px]',
                    'focus:outline-none focus:ring-2 focus:ring-cme-primary/50 focus:border-cme-primary',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    'border-cme-border hover:border-cme-border-bright'
                  )}
                />
              </div>
            ))}

            {state.samples.length < 3 && (
              <Button
                type="button"
                variant="outline"
                onClick={addSample}
                disabled={isAnalyzing}
                className="w-full"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add another sample
              </Button>
            )}
          </div>

          {errors.samples && (
            <p className="text-sm text-cme-error">{errors.samples}</p>
          )}

          {/* Analyze Button */}
          {!state.analysis && (
            <Button
              onClick={analyzeVoice}
              isLoading={isAnalyzing}
              disabled={isAnalyzing}
              size="lg"
              className="w-full"
            >
              {isAnalyzing ? 'Reading your voice patterns...' : 'Analyze My Voice'}
            </Button>
          )}

          {isAnalyzing && (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="h-8 w-8 animate-spin text-cme-primary" />
              <p className="text-sm text-cme-text-muted">
                Reading your voice patterns...
              </p>
            </div>
          )}

          {analysisError && (
            <div className="rounded-lg border border-cme-error/30 bg-cme-error/10 p-4">
              <p className="text-sm text-cme-error">{analysisError}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={analyzeVoice}
                className="mt-3"
              >
                Try Again
              </Button>
            </div>
          )}

          {/* Analysis Results */}
          {state.analysis && (
            <Card>
              <CardContent className="space-y-6 p-6">
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-cme-text">
                    Detected Tone Metrics
                  </h3>
                  <ToneMeter metrics={state.analysis.tone_metrics} size="md" />
                </div>

                {state.analysis.signature_phrases.length > 0 && (
                  <div>
                    <h3 className="mb-3 text-sm font-semibold text-cme-text">
                      Detected Signature Phrases
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {state.analysis.signature_phrases.map((phrase, i) => (
                        <Badge key={i} variant="default">
                          {phrase}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {state.analysis.suggested_attributes.length > 0 && (
                  <div>
                    <h3 className="mb-3 text-sm font-semibold text-cme-text">
                      Suggested Attributes
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {state.analysis.suggested_attributes.map((attr, i) => (
                        <Badge key={i} variant="secondary">
                          {attr}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {state.analysis && (
            <div className="flex justify-end">
              <Button onClick={handleNext} size="lg">
                Next
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Voice Attributes */}
      {currentStep === 2 && (
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-cme-text">
              How do you want to come across?
            </h2>
            <p className="mt-2 text-cme-text-muted">
              Pick 3-5 words that describe your voice
            </p>
          </div>

          <AttributePicker
            selected={state.voiceAttributes}
            onChange={(attrs) => {
              updateState({ voiceAttributes: attrs });
              if (errors.attributes) {
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.attributes;
                  return next;
                });
              }
            }}
            max={5}
          />

          {errors.attributes && (
            <p className="text-sm text-cme-error">{errors.attributes}</p>
          )}

          <div className="flex items-center justify-between pt-4">
            <Button variant="ghost" onClick={handleBack}>
              Back
            </Button>
            <Button onClick={handleNext} size="lg">
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Boundaries */}
      {currentStep === 3 && (
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-cme-text">
              Set your boundaries
            </h2>
            <p className="mt-2 text-cme-text-muted">
              Anything you&apos;d never say?
            </p>
          </div>

          <div className="space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-cme-text">
                Banned terms / phrases
              </label>
              <textarea
                value={state.bannedTerms}
                onChange={(e) => updateState({ bannedTerms: e.target.value })}
                placeholder="e.g., grind, hustle, guru (comma-separated)"
                rows={3}
                className={cn(
                  'flex w-full rounded-lg border border-cme-border bg-cme-surface px-3 py-3 text-sm text-cme-text placeholder:text-cme-text-muted',
                  'transition-all duration-200 resize-y',
                  'focus:outline-none focus:ring-2 focus:ring-cme-primary/50 focus:border-cme-primary',
                  'hover:border-cme-border-bright'
                )}
              />
              <p className="mt-1 text-xs text-cme-text-muted">
                Separate multiple terms with commas
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-cme-text">
                Preferred terms / phrases
              </label>
              <textarea
                value={state.preferredTerms}
                onChange={(e) =>
                  updateState({ preferredTerms: e.target.value })
                }
                placeholder="e.g., build, create, ship (comma-separated)"
                rows={3}
                className={cn(
                  'flex w-full rounded-lg border border-cme-border bg-cme-surface px-3 py-3 text-sm text-cme-text placeholder:text-cme-text-muted',
                  'transition-all duration-200 resize-y',
                  'focus:outline-none focus:ring-2 focus:ring-cme-primary/50 focus:border-cme-primary',
                  'hover:border-cme-border-bright'
                )}
              />
              <p className="mt-1 text-xs text-cme-text-muted">
                Separate multiple terms with commas
              </p>
            </div>

            <Input
              label="What do you call your audience?"
              placeholder="e.g., founders, creators, friends"
              value={state.audienceLabel}
              onChange={(e) =>
                updateState({ audienceLabel: e.target.value })
              }
            />
          </div>

          <div className="flex items-center justify-between pt-4">
            <Button variant="ghost" onClick={handleBack}>
              Back
            </Button>
            <Button onClick={handleNext} size="lg">
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Profile Name & Summary */}
      {currentStep === 4 && (
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-cme-text">
              Name your voice profile
            </h2>
            <p className="mt-2 text-cme-text-muted">
              Give it a name you&apos;ll remember
            </p>
          </div>

          <Input
            label="Profile Name"
            placeholder="e.g., Professional Me, Casual Vibes"
            value={state.profileName}
            onChange={(e) => {
              updateState({ profileName: e.target.value });
              if (errors.profileName) {
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.profileName;
                  return next;
                });
              }
            }}
            error={errors.profileName}
          />

          {/* Summary Card */}
          <Card>
            <CardContent className="space-y-4 p-6">
              <h3 className="text-sm font-semibold text-cme-text">
                Profile Summary
              </h3>

              <div className="space-y-3">
                <div>
                  <span className="text-xs font-medium text-cme-text-muted">
                    Voice Attributes
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {state.voiceAttributes.map((attr) => (
                      <Badge key={attr} variant="default">
                        {attr}
                      </Badge>
                    ))}
                  </div>
                </div>

                {state.analysis && (
                  <div>
                    <span className="text-xs font-medium text-cme-text-muted">
                      Tone Metrics
                    </span>
                    <div className="mt-1">
                      <ToneMeter
                        metrics={state.analysis.tone_metrics}
                        size="sm"
                      />
                    </div>
                  </div>
                )}

                {state.bannedTerms.trim() && (
                  <div>
                    <span className="text-xs font-medium text-cme-text-muted">
                      Banned Terms
                    </span>
                    <p className="mt-1 text-sm text-cme-text">
                      {state.bannedTerms}
                    </p>
                  </div>
                )}

                {state.preferredTerms.trim() && (
                  <div>
                    <span className="text-xs font-medium text-cme-text-muted">
                      Preferred Terms
                    </span>
                    <p className="mt-1 text-sm text-cme-text">
                      {state.preferredTerms}
                    </p>
                  </div>
                )}

                {state.audienceLabel.trim() && (
                  <div>
                    <span className="text-xs font-medium text-cme-text-muted">
                      Audience
                    </span>
                    <p className="mt-1 text-sm text-cme-text">
                      {state.audienceLabel}
                    </p>
                  </div>
                )}

                <div>
                  <span className="text-xs font-medium text-cme-text-muted">
                    Samples Provided
                  </span>
                  <p className="mt-1 text-sm text-cme-text">
                    {state.samples.filter((s) => s.trim()).length} sample(s)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Default Checkbox */}
          <label className="flex cursor-pointer items-center gap-3">
            <div className="relative">
              <input
                type="checkbox"
                checked={state.isDefault}
                onChange={(e) =>
                  updateState({ isDefault: e.target.checked })
                }
                className="peer sr-only"
              />
              <div
                className={cn(
                  'h-5 w-5 rounded border transition-all duration-200',
                  'peer-focus-visible:ring-2 peer-focus-visible:ring-cme-primary peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-cme-bg',
                  state.isDefault
                    ? 'border-cme-primary bg-cme-primary'
                    : 'border-cme-border bg-cme-surface hover:border-cme-border-bright'
                )}
              >
                {state.isDefault && (
                  <Check className="h-full w-full p-0.5 text-white" />
                )}
              </div>
            </div>
            <span className="text-sm text-cme-text">
              Set as default voice profile
            </span>
          </label>

          <div className="flex items-center justify-between pt-4">
            <Button variant="ghost" onClick={handleBack}>
              Back
            </Button>
            <Button onClick={handleCreate} size="lg">
              Create Profile
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export { VoiceWizard };
