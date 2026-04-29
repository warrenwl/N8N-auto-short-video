import React from 'react';
import {AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {RemotionVisualConfig} from '../types';
import {rgba} from '../visualConfig';

type Props = {
  coverUrl?: string | null;
  backgroundColor: string;
  primaryColor: string;
  secondaryColor: string;
  visualConfig: RemotionVisualConfig;
};

export const Background: React.FC<Props> = ({coverUrl, backgroundColor, primaryColor, secondaryColor, visualConfig}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const zoom = visualConfig.motion?.background_zoom ?? 0.08;
  const pan = visualConfig.motion?.pan_px ?? 34;
  const scale = interpolate(frame, [0, durationInFrames], [1.08, 1.08 + zoom], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const panX = interpolate(frame, [0, durationInFrames], [-pan, pan], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const panY = interpolate(frame, [0, durationInFrames], [pan * 0.25, -pan * 0.3], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{backgroundColor, overflow: 'hidden'}}>
      {coverUrl ? (
        <Img
          src={coverUrl}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: 'blur(28px) saturate(1.08)',
            transform: `translate(${panX}px, ${panY}px) scale(${scale})`,
            opacity: 0.48,
          }}
        />
      ) : null}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(7,7,8,0.68) 0%, rgba(14,15,18,0.84) 42%, rgba(3,3,4,0.95) 100%)',
        }}
      />
      <AbsoluteFill
        style={{
          background:
            `linear-gradient(135deg, ${rgba(primaryColor, 0.2)} 0%, transparent 34%, ${rgba(secondaryColor, 0.12)} 74%, transparent 100%)`,
        }}
      />
      <AbsoluteFill
        style={{
          opacity: 0.18,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.18) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
          transform: `translateY(${(frame % 72) * -0.08}px)`,
        }}
      />
    </AbsoluteFill>
  );
};
