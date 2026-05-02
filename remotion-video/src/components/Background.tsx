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

const moodFor = (layout: TemplateVisualConfig['layout'] | undefined, mood?: TemplateVisualConfig['background_mood']) =>
  mood || (layout === 'steps' ? 'bright' : layout === 'contrast' ? 'conflict' : layout === 'timeline' ? 'warm' : 'clean');

const silhouetteOpacity = (mood: TemplateVisualConfig['background_mood'] | undefined) => {
  if (mood === 'bright') return 0.038;
  if (mood === 'warm') return 0.052;
  if (mood === 'conflict') return 0.075;
  return 0.08;
};

const templateOverlay = (
  layout: TemplateVisualConfig['layout'] | undefined,
  mood: TemplateVisualConfig['background_mood'] | undefined,
  primaryColor: string,
  secondaryColor: string,
  frame: number,
) => {
  const resolvedMood = moodFor(layout, mood);

  if (resolvedMood === 'bright') {
    return (
      <>
        <AbsoluteFill
          style={{
            opacity: 0.045,
            backgroundImage:
              `linear-gradient(90deg, transparent 0 14%, ${rgba(primaryColor, 0.28)} 14% 14.35%, transparent 14.35% 100%),
               linear-gradient(rgba(255,255,255,0.12) 1px, transparent 1px)`,
            backgroundSize: '100% 100%, 100% 180px',
            transform: `translateY(${(frame % 180) * -0.04}px)`,
          }}
        />
        <AbsoluteFill
          style={{
            background:
              `radial-gradient(circle at 18% 22%, ${rgba(primaryColor, 0.36)}, transparent 34%),
               radial-gradient(circle at 82% 18%, ${rgba(secondaryColor, 0.28)}, transparent 30%),
               linear-gradient(120deg, rgba(255,255,255,0.1), transparent 38%),
               linear-gradient(90deg, ${rgba(primaryColor, 0.18)} 0%, transparent 28%, transparent 100%)`,
          }}
        />
      </>
    );
  }

  if (resolvedMood === 'conflict') {
    return (
      <>
        <AbsoluteFill
          style={{
            background:
              `linear-gradient(90deg, rgba(0,10,20,0.94) 0 49.2%, ${rgba(primaryColor, 0.48)} 49.2% 50.8%, rgba(58,23,8,0.86) 50.8% 100%),
               radial-gradient(circle at 20% 35%, rgba(65,120,190,0.24), transparent 34%),
               radial-gradient(circle at 80% 34%, ${rgba(primaryColor, 0.36)}, transparent 34%)`,
          }}
        />
        <AbsoluteFill
          style={{
            opacity: 0.035,
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.14) 1px, transparent 1px)',
            backgroundSize: '120px 120px',
            transform: `translateX(${(frame % 120) * 0.03}px)`,
          }}
        />
      </>
    );
  }

  if (resolvedMood === 'warm') {
    return (
      <>
        <AbsoluteFill
          style={{
            background:
              `radial-gradient(circle at 22% 20%, ${rgba(secondaryColor, 0.34)}, transparent 34%),
               radial-gradient(circle at 72% 66%, ${rgba(primaryColor, 0.3)}, transparent 40%),
               radial-gradient(circle at 35% 78%, rgba(255,180,105,0.18), transparent 32%),
               linear-gradient(135deg, rgba(95,42,18,0.24), transparent 52%)`,
          }}
        />
        <AbsoluteFill
          style={{
            opacity: 0.055,
            backgroundImage:
              `linear-gradient(90deg, transparent 0 22%, ${rgba(secondaryColor, 0.34)} 22% 22.4%, transparent 22.4% 100%),
               radial-gradient(circle, rgba(255,255,255,0.34) 0 2px, transparent 3px)`,
            backgroundSize: '100% 100%, 130px 170px',
            backgroundPosition: `0 0, 0 ${frame * -0.05}px`,
          }}
        />
      </>
    );
  }

  return (
    <>
      <AbsoluteFill
        style={{
          opacity: 0.025,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.18) 1px, transparent 1px)',
          backgroundSize: '110px 110px',
          transform: `translateY(${(frame % 110) * -0.04}px)`,
        }}
      />
      <AbsoluteFill
        style={{
          background:
            `radial-gradient(circle at 28% 30%, ${rgba(secondaryColor, 0.16)}, transparent 34%),
             radial-gradient(circle at 76% 64%, ${rgba(primaryColor, 0.12)}, transparent 36%),
             linear-gradient(180deg, rgba(20,30,42,0.26), transparent 56%)`,
        }}
      />
    </>
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
  const mood = moodFor(layout, templateConfig.background_mood);
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
        <>
          <Img
            src={coverUrl}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter:
                mood === 'bright'
                  ? 'blur(24px) saturate(1.28) brightness(1.12)'
                  : mood === 'conflict'
                    ? 'blur(32px) saturate(1.28) contrast(1.16)'
                    : mood === 'warm'
                      ? 'blur(26px) saturate(1.2) sepia(0.16) brightness(1.06)'
                      : 'blur(30px) saturate(0.98) contrast(1.04) brightness(0.92)',
              transform: `translate(${panX}px, ${panY}px) scale(${scale})`,
              opacity:
                mood === 'bright'
                  ? 0.46
                  : mood === 'conflict'
                    ? 0.44
                    : mood === 'warm'
                      ? 0.46
                      : 0.36,
            }}
          />
          <Img
            src={coverUrl}
            style={{
              position: 'absolute',
              inset: mood === 'bright' ? '-10% -18%' : '-6% -10%',
              width: mood === 'bright' ? '136%' : '120%',
              height: mood === 'bright' ? '118%' : '112%',
              objectFit: 'cover',
              filter:
                mood === 'bright'
                  ? 'blur(4px) saturate(0.72) contrast(0.78) brightness(0.92)'
                  : mood === 'warm'
                    ? 'blur(3px) saturate(0.78) sepia(0.12) brightness(0.9)'
                    : mood === 'conflict'
                      ? 'saturate(0.98) contrast(1.12) brightness(0.94)'
                      : 'saturate(0.9) contrast(1.05) brightness(0.82)',
              transform: `translate(${panX * -0.12}px, ${panY * -0.1}px) scale(${1.08 + (scale - 1) * 0.28})`,
              opacity: silhouetteOpacity(mood),
              maskImage:
                mood === 'bright'
                  ? 'radial-gradient(circle at 48% 36%, black 0%, black 24%, transparent 55%)'
                  : mood === 'conflict'
                  ? 'linear-gradient(90deg, transparent 0%, black 12%, black 88%, transparent 100%)'
                  : 'radial-gradient(circle at 48% 30%, black 0%, black 34%, transparent 66%)',
              WebkitMaskImage:
                mood === 'bright'
                  ? 'radial-gradient(circle at 48% 36%, black 0%, black 24%, transparent 55%)'
                  : mood === 'conflict'
                  ? 'linear-gradient(90deg, transparent 0%, black 12%, black 88%, transparent 100%)'
                  : 'radial-gradient(circle at 48% 30%, black 0%, black 34%, transparent 66%)',
            }}
          />
        </>
      ) : null}
      <AbsoluteFill
        style={{
          background:
            mood === 'bright'
              ? 'linear-gradient(180deg, rgba(10,15,12,0.56) 0%, rgba(17,18,17,0.76) 48%, rgba(5,5,5,0.92) 100%)'
              : mood === 'conflict'
                ? 'linear-gradient(180deg, rgba(2,4,7,0.62) 0%, rgba(10,9,10,0.76) 50%, rgba(2,2,3,0.95) 100%)'
                : mood === 'warm'
                  ? 'linear-gradient(180deg, rgba(26,13,7,0.54) 0%, rgba(24,13,11,0.74) 48%, rgba(5,3,3,0.94) 100%)'
                  : 'linear-gradient(180deg, rgba(4,7,10,0.74) 0%, rgba(10,13,17,0.86) 42%, rgba(2,3,4,0.96) 100%)',
        }}
      />
      <AbsoluteFill
        style={{
          background:
            mood === 'conflict'
              ? `linear-gradient(90deg, rgba(24,80,130,0.18) 0%, transparent 42%, ${rgba(primaryColor, 0.28)} 58%, transparent 100%)`
              : mood === 'bright'
                ? `linear-gradient(135deg, ${rgba(primaryColor, 0.24)} 0%, transparent 28%, rgba(255,255,255,0.1) 52%, ${rgba(secondaryColor, 0.18)} 78%, transparent 100%)`
                : mood === 'warm'
                  ? `linear-gradient(135deg, ${rgba(secondaryColor, 0.2)} 0%, transparent 38%, rgba(255,145,70,0.16) 74%, transparent 100%)`
                  : `linear-gradient(135deg, rgba(60,110,160,0.12) 0%, transparent 34%, ${rgba(primaryColor, 0.12)} 76%, transparent 100%)`,
        }}
      />
      {templateOverlay(layout, mood, primaryColor, secondaryColor, frame)}
      <AbsoluteFill
        style={{
          background:
            `radial-gradient(circle at 50% 42%, transparent 0%, transparent 48%, rgba(0,0,0,0.42) 100%),
             linear-gradient(180deg, rgba(0,0,0,${mood === 'bright' ? 0.1 : 0.18}) 0%, transparent 24%, transparent 62%, rgba(0,0,0,${mood === 'bright' ? 0.22 : 0.34}) 100%)`,
        }}
      />
      <AbsoluteFill
        style={{
          opacity: 0.18,
          background: `linear-gradient(105deg, transparent 0%, transparent ${18 + (frame % 120) * 0.18}%, ${rgba(primaryColor, 0.16)} ${24 + (frame % 120) * 0.18}%, transparent ${34 + (frame % 120) * 0.18}%, transparent 100%)`,
          mixBlendMode: 'screen',
        }}
      />
      <AbsoluteFill
        style={{
          opacity: mood === 'warm' ? 0.045 : mood === 'bright' ? 0.055 : 0.04,
          backgroundImage:
            'radial-gradient(circle, rgba(255,255,255,0.55) 0 0.8px, transparent 1.2px)',
          backgroundSize: '9px 9px',
          mixBlendMode: 'screen',
        }}
      />
    </AbsoluteFill>
  );
};
