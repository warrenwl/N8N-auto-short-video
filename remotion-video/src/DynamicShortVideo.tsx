import React from 'react';
import {AbsoluteFill, Audio, Sequence, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {Background} from './components/Background';
import {BrandBadge} from './components/BrandBadge';
import {Caption} from './components/Caption';
import {ChapterCard} from './components/ChapterCard';
import {Outro} from './components/Outro';
import {ProgressBar} from './components/ProgressBar';
import type {RemotionManifest, Segment} from './types';
import {getOutroSeconds, getTemplateConfig, getTemplateLabel, getTimelineEnd, getVisualConfig, rgba} from './visualConfig';

const frameFromSeconds = (seconds: number, fps: number) => Math.max(0, Math.round(seconds * fps));

const fallbackSegment = (manifest: RemotionManifest): Segment => ({
  index: 1,
  start: 0,
  end: Math.max(1, manifest.audio_duration || 8),
  duration: Math.max(1, manifest.audio_duration || 8),
  subtitle: manifest.cover_text || manifest.title,
  headline: manifest.title,
  keywords: [manifest.cover_text || manifest.title],
});

export const DynamicShortVideo: React.FC<RemotionManifest> = (manifest) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const segments = manifest.segments.length ? manifest.segments : [fallbackSegment(manifest)];
  const visualConfig = getVisualConfig(manifest);
  const templateConfig = getTemplateConfig(manifest);
  const primaryColor = manifest.theme?.primary_color || '#F8D66D';
  const secondaryColor = manifest.theme?.secondary_color || visualConfig.secondary_color || '#58B6FF';
  const backgroundColor = manifest.theme?.background_color || '#111111';
  const templateLabel = getTemplateLabel(manifest);
  const layout = templateConfig.layout || 'concept';
  const outroSeconds = getOutroSeconds(manifest);
  const timelineEnd = getTimelineEnd(manifest);
  const titleTop = manifest.account?.account_name ? 112 : 74;
  const captionCues = (manifest.caption_cues || []).filter((cue) => cue.text || cue.subtitle);
  const titleOpacity = interpolate(frame, [0, 16, 46, 78], [0, 0.62, 0.62, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{backgroundColor}}>
      <Background
        coverUrl={manifest.cover_url}
        backgroundColor={backgroundColor}
        primaryColor={primaryColor}
        secondaryColor={secondaryColor}
        visualConfig={visualConfig}
        templateConfig={templateConfig}
      />
      {manifest.voice_url ? <Audio src={manifest.voice_url} /> : null}
      <BrandBadge account={manifest.account} visualConfig={visualConfig} />

      <div
        style={{
          position: 'absolute',
          top: titleTop,
          left: 64,
          right: 64,
          opacity: titleOpacity,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 24,
          fontFamily:
            'PingFang SC, Hiragino Sans GB, Noto Sans CJK SC, Microsoft YaHei, sans-serif',
        }}
      >
        <div
          style={{
            color: 'rgba(255,255,255,0.76)',
            fontSize: layout === 'contrast' ? 29 : 30,
            lineHeight: 1.18,
            fontWeight: 850,
            maxWidth: layout === 'steps' ? 650 : 720,
            textShadow: '0 4px 20px rgba(0,0,0,0.68)',
          }}
        >
          {manifest.title}
        </div>
        <div
          style={{
            color: layout === 'contrast' ? '#111' : primaryColor,
            fontSize: layout === 'steps' ? 20 : 21,
            fontWeight: 900,
            padding: layout === 'steps' ? '7px 12px' : '8px 13px',
            borderRadius: layout === 'contrast' ? 8 : layout === 'steps' ? 14 : 999,
            border: layout === 'contrast' ? '0' : `2px solid ${primaryColor}`,
            background: layout === 'contrast'
              ? primaryColor
              : layout === 'timeline'
                ? `linear-gradient(90deg, rgba(0,0,0,0.32), ${rgba(secondaryColor, 0.16)})`
                : 'rgba(0,0,0,0.34)',
          }}
        >
          {templateLabel}
        </div>
      </div>

      {segments.map((segment) => {
        const from = frameFromSeconds(segment.start, fps);
        const durationInFrames = Math.max(1, frameFromSeconds(segment.duration, fps));
        return (
          <Sequence key={`${segment.index}-${segment.start}`} from={from} durationInFrames={durationInFrames}>
            <ChapterCard
              segment={segment}
              total={segments.length}
              primaryColor={primaryColor}
              secondaryColor={secondaryColor}
              templateType={manifest.template_type}
              templateConfig={templateConfig}
              visualConfig={visualConfig}
            />
            {captionCues.length ? null : (
              <Caption
                text={segment.subtitle}
                keywords={segment.keywords}
                primaryColor={primaryColor}
                secondaryColor={secondaryColor}
                visualConfig={visualConfig}
                templateConfig={templateConfig}
                platform={manifest.platform}
                durationInFrames={durationInFrames}
              />
            )}
          </Sequence>
        );
      })}

      {captionCues.map((cue) => {
        const from = frameFromSeconds(cue.start, fps);
        const durationInFrames = Math.max(1, frameFromSeconds(Math.max(0.1, cue.end - cue.start), fps));
        return (
          <Sequence key={`caption-${cue.index}-${cue.start}`} from={from} durationInFrames={durationInFrames}>
            <Caption
              text={cue.text || cue.subtitle || ''}
              keywords={cue.keywords || []}
              primaryColor={primaryColor}
              secondaryColor={secondaryColor}
              visualConfig={visualConfig}
              templateConfig={templateConfig}
              platform={manifest.platform}
              durationInFrames={durationInFrames}
            />
          </Sequence>
        );
      })}

      <ProgressBar primaryColor={primaryColor} />

      {outroSeconds > 0 ? (
        <Sequence from={frameFromSeconds(timelineEnd, fps)} durationInFrames={frameFromSeconds(outroSeconds, fps)}>
          <Outro
            manifest={manifest}
            primaryColor={primaryColor}
            secondaryColor={secondaryColor}
            visualConfig={visualConfig}
          />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
