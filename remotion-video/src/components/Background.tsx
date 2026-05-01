import React from 'react';
import {AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {RemotionVisualConfig, TemplateVisualConfig} from '../types';
import {rgba} from '../visualConfig';

type Props = {
  coverUrl?: string | null;
  backgroundColor: string;
  primaryColor: string;
  secondaryColor: string;
  visualConfig: RemotionVisualConfig;
  templateConfig: TemplateVisualConfig;
};

const templateOverlay = (
  layout: TemplateVisualConfig['layout'] | undefined,
  primaryColor: string,
  secondaryColor: string,
  frame: number,
) => {
  if (layout === 'steps') {
    return (
      <>
        <AbsoluteFill
          style={{
            opacity: 0.2,
            backgroundImage:
              `linear-gradient(90deg, transparent 0 16%, ${rgba(primaryColor, 0.24)} 16% 16.8%, transparent 16.8% 100%),
               linear-gradient(rgba(255,255,255,0.16) 1px, transparent 1px)`,
            backgroundSize: '100% 100%, 100% 132px',
            transform: `translateY(${(frame % 132) * -0.06}px)`,
          }}
        />
        <AbsoluteFill
          style={{
            background:
              `linear-gradient(90deg, ${rgba(primaryColor, 0.22)} 0%, transparent 28%, transparent 100%)`,
          }}
        />
      </>
    );
  }

  if (layout === 'contrast') {
    return (
      <>
        <AbsoluteFill
          style={{
            background:
              `linear-gradient(90deg, rgba(5,7,10,0.76) 0 49.6%, ${rgba(primaryColor, 0.22)} 49.6% 50.4%, rgba(18,12,9,0.74) 50.4% 100%)`,
          }}
        />
        <AbsoluteFill
          style={{
            opacity: 0.2,
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.14) 1px, transparent 1px)',
            backgroundSize: '86px 86px',
            transform: `translateX(${(frame % 86) * 0.05}px)`,
          }}
        />
      </>
    );
  }

  if (layout === 'timeline') {
    return (
      <>
        <AbsoluteFill
          style={{
            background:
              `radial-gradient(circle at 26% 24%, ${rgba(secondaryColor, 0.25)}, transparent 30%),
               radial-gradient(circle at 72% 68%, ${rgba(primaryColor, 0.18)}, transparent 34%)`,
          }}
        />
        <AbsoluteFill
          style={{
            opacity: 0.22,
            backgroundImage:
              `linear-gradient(90deg, transparent 0 22%, ${rgba(secondaryColor, 0.34)} 22% 22.4%, transparent 22.4% 100%),
               radial-gradient(circle, rgba(255,255,255,0.34) 0 2px, transparent 3px)`,
            backgroundSize: '100% 100%, 96px 126px',
            backgroundPosition: `0 0, 0 ${frame * -0.05}px`,
          }}
        />
      </>
    );
  }

  return (
    <AbsoluteFill
      style={{
        opacity: 0.18,
        backgroundImage:
          'linear-gradient(rgba(255,255,255,0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.18) 1px, transparent 1px)',
        backgroundSize: '72px 72px',
        transform: `translateY(${(frame % 72) * -0.08}px)`,
      }}
    />
  );
};

export const Background: React.FC<Props> = ({
  coverUrl,
  backgroundColor,
  primaryColor,
  secondaryColor,
  visualConfig,
  templateConfig,
}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const zoom = visualConfig.motion?.background_zoom ?? 0.08;
  const pan = visualConfig.motion?.pan_px ?? 34;
  const layout = templateConfig.layout || 'concept';
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
            filter: layout === 'contrast' ? 'blur(32px) saturate(1.18) contrast(1.08)' : 'blur(28px) saturate(1.08)',
            transform: `translate(${panX}px, ${panY}px) scale(${scale})`,
            opacity: layout === 'steps' ? 0.38 : layout === 'contrast' ? 0.42 : layout === 'timeline' ? 0.44 : 0.48,
          }}
        />
      ) : null}
      <AbsoluteFill
        style={{
          background:
            layout === 'steps'
              ? 'linear-gradient(180deg, rgba(8,9,11,0.74) 0%, rgba(14,15,18,0.9) 48%, rgba(3,3,4,0.96) 100%)'
              : layout === 'contrast'
                ? 'linear-gradient(180deg, rgba(6,7,8,0.7) 0%, rgba(12,12,14,0.86) 50%, rgba(3,3,4,0.96) 100%)'
                : layout === 'timeline'
                  ? 'linear-gradient(180deg, rgba(7,7,8,0.66) 0%, rgba(13,12,16,0.82) 48%, rgba(3,3,4,0.95) 100%)'
                  : 'linear-gradient(180deg, rgba(7,7,8,0.68) 0%, rgba(14,15,18,0.84) 42%, rgba(3,3,4,0.95) 100%)',
        }}
      />
      <AbsoluteFill
        style={{
          background:
            layout === 'contrast'
              ? `linear-gradient(90deg, ${rgba(secondaryColor, 0.13)} 0%, transparent 42%, ${rgba(primaryColor, 0.2)} 58%, transparent 100%)`
              : `linear-gradient(135deg, ${rgba(primaryColor, 0.2)} 0%, transparent 34%, ${rgba(secondaryColor, 0.12)} 74%, transparent 100%)`,
        }}
      />
      {templateOverlay(layout, primaryColor, secondaryColor, frame)}
    </AbsoluteFill>
  );
};
