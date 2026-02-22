'use client';

import { redirect } from 'next/navigation';
import { ROUTES } from '@/lib/constants';

export default function VoicePage() {
  redirect(ROUTES.VOICE_PROFILES);
}
