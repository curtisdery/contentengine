import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 6,
          background: '#0a0a0f',
        }}
      >
        <span
          style={{
            fontSize: 22,
            fontWeight: 800,
            lineHeight: 1,
            background: 'linear-gradient(135deg, #00cec9, #6c5ce7)',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          P
        </span>
      </div>
    ),
    { ...size }
  );
}
