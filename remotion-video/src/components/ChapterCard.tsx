import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {RemotionVisualConfig, Segment, TemplateVisualConfig} from '../types';
import {rgba} from '../visualConfig';

type Props = {
  segment: Segment;
  total: number;
  primaryColor: string;
  secondaryColor: string;
  templateType?: string;
  templateConfig: TemplateVisualConfig;
  visualConfig: RemotionVisualConfig;
};

export const ChapterCard: React.FC<Props> = ({
  segment,
  total,
  primaryColor,
  secondaryColor,
  templateType,
  templateConfig,
  visualConfig,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const rawBody = segment.body || segment.subtitle || segment.visual_prompt || '';
  const cardConfig = visualConfig.card || {};
  const motionConfig = visualConfig.motion || {};
  const audioConfig = visualConfig.audio_reactive || {};
  const maxBodyChars = cardConfig.max_body_chars ?? 64;
  const compactBodyChars = cardConfig.compact_body_chars ?? 42;
  const bodyLimit = rawBody.length > 72 ? compactBodyChars : maxBodyChars;
  const body = rawBody.length > bodyLimit ? `${rawBody.slice(0, Math.max(0, bodyLimit - 1))}…` : rawBody;
  const transitionFrames = motionConfig.transition_frames ?? 8;
  const segmentFrames = Math.max(1, Math.round(segment.duration * fps));
  const enter = spring({frame, fps, config: {damping: 18, stiffness: 110}});
  const enterOpacity = interpolate(frame, [0, 14], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const exitOpacity = interpolate(frame, [Math.max(1, segmentFrames - transitionFrames), segmentFrames], [1, 0.82], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const segmentScale = interpolate(frame, [0, segmentFrames], [1, 1 + (motionConfig.segment_zoom ?? 0.018)], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const pauseScale = audioConfig.use_subtitle_boundaries === false ? 1 : audioConfig.pause_emphasis_scale ?? 1.012;
  const emphasisScale = motionConfig.emphasis_scale ?? 1.018;
  const keywordStyle = templateConfig.keyword_style || 'chips';
  const layout = templateConfig.layout || 'concept';
  const cardTop = layout === 'timeline' ? 250 : rawBody.length > 78 ? 268 : 290;

  return (
    <div
      style={{
        position: 'absolute',
        left: 64,
        right: 64,
        top: cardTop,
        transform: `translateY(${(1 - enter) * 54}px) scale(${segmentScale * pauseScale * emphasisScale})`,
        opacity: enterOpacity * exitOpacity,
        fontFamily:
          'PingFang SC, Hiragino Sans GB, Noto Sans CJK SC, Microsoft YaHei, sans-serif',
      }}
    >
      {cardConfig.number_watermark === false ? null : (
        <div
          style={{
            position: 'absolute',
            right: -8,
            top: -118,
            color: 'rgba(255,255,255,0.07)',
            fontSize: layout === 'timeline' ? 178 : 210,
            lineHeight: 1,
            fontWeight: 900,
            letterSpacing: 0,
          }}
        >
          {String(segment.index).padStart(2, '0')}
        </div>
      )}
      <div
        style={{
          padding: '36px 38px 42px',
          borderRadius: cardConfig.corner_radius ?? 30,
          background: `rgba(10, 10, 12, ${cardConfig.glass_opacity ?? 0.62})`,
          border: `1px solid rgba(255,255,255,${cardConfig.border_opacity ?? 0.12})`,
          boxShadow: `0 28px 90px rgba(0,0,0,${cardConfig.shadow_opacity ?? 0.28})`,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 30,
          }}
        >
          <div
            style={{
              color: '#111',
              background: primaryColor,
              borderRadius: templateType === 'contrast' ? 10 : 999,
              padding: '10px 18px',
              fontSize: 28,
              fontWeight: 900,
              letterSpacing: 0,
            }}
          >
            {layout === 'steps' ? 'STEP' : layout === 'contrast' ? 'VIEW' : layout === 'timeline' ? 'STORY' : 'POINT'}{' '}
            {String(segment.index).padStart(2, '0')}
          </div>
          <div
            style={{
              color: 'rgba(255,255,255,0.66)',
              fontSize: 28,
              fontWeight: 800,
            }}
          >
            {segment.index}/{total}
          </div>
        </div>

        <div
          style={{
              color: '#FFFFFF',
            fontSize: segment.headline.length > 14 ? 52 : segment.headline.length > 12 ? 58 : segment.headline.length > 9 ? 66 : 78,
            lineHeight: 1.12,
            fontWeight: 950,
            letterSpacing: 0,
            maxWidth: layout === 'contrast' ? 760 : '100%',
          }}
        >
          {segment.headline}
        </div>

        {body ? (
          <div
            style={{
              color: 'rgba(255,255,255,0.72)',
              fontSize: body.length > 54 ? 25 : body.length > 42 ? 27 : 31,
              lineHeight: 1.38,
              fontWeight: 700,
              marginTop: 26,
              maxHeight: 150,
              overflow: 'hidden',
            }}
          >
            {body}
          </div>
        ) : null}

        {segment.layout_hint ? (
          <div
            style={{
              color: primaryColor,
              fontSize: 24,
              lineHeight: 1.22,
              fontWeight: 850,
              marginTop: 18,
              opacity: 0.82,
            }}
          >
            {segment.layout_hint}
          </div>
        ) : null}

        {layout === 'contrast' ? (
          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 38}}>
            {['误区', '正解'].map((label, index) => (
              <div
                key={label}
                style={{
                  minHeight: 110,
                  padding: '20px',
                  borderRadius: 18,
                  background: index === 0 ? 'rgba(255,255,255,0.08)' : rgba(primaryColor, 0.18),
                  border: `1px solid ${index === 0 ? 'rgba(255,255,255,0.13)' : rgba(primaryColor, 0.42)}`,
                  color: '#fff',
                  fontSize: 29,
                  fontWeight: 900,
                }}
              >
                <div style={{color: index === 0 ? 'rgba(255,255,255,0.58)' : primaryColor, fontSize: 23, marginBottom: 12}}>
                  {label}
                </div>
                {segment.keywords[index] || segment.keywords[0] || segment.headline}
              </div>
            ))}
          </div>
        ) : null}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: keywordStyle === 'timeline' ? '1fr' : '1fr 1fr',
            gap: 16,
            marginTop: layout === 'contrast' ? 22 : 40,
          }}
        >
          {segment.keywords.slice(0, 4).map((keyword, index) => {
            const stagger = motionConfig.keyword_stagger_frames ?? 6;
            const popFrames = visualConfig.audio_reactive?.keyword_pop_frames ?? 8;
            const itemOpacity = interpolate(frame, [10 + index * stagger, 10 + index * stagger + popFrames], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            const itemY = interpolate(frame, [10 + index * stagger, 10 + index * stagger + popFrames], [26, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            const itemPrefix = keywordStyle === 'timeline' ? '•' : keywordStyle === 'split' ? ['A', 'B', 'C', 'D'][index] : index + 1;
            return (
              <div
                key={`${keyword}-${index}`}
                style={{
                  opacity: itemOpacity,
                  transform: `translateY(${itemY}px)`,
                  minHeight: keywordStyle === 'timeline' ? 68 : 82,
                  padding: '16px 18px',
                  borderRadius: keywordStyle === 'numbered' ? 16 : 20,
                  color: '#fff',
                  background: keywordStyle === 'timeline' ? 'rgba(255,255,255,0.075)' : 'rgba(255,255,255,0.105)',
                  border: `1px solid ${keywordStyle === 'numbered' ? rgba(primaryColor, 0.22) : 'rgba(255,255,255,0.14)'}`,
                  fontSize: keyword.length > 7 ? 27 : 31,
                  lineHeight: 1.18,
                  fontWeight: 850,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <span style={{color: index % 2 ? secondaryColor : primaryColor, marginRight: 10}}>{itemPrefix}</span>
                <span>{keyword}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div
        style={{
          marginTop: 26,
          height: 8,
          width: 170,
          borderRadius: 999,
          background: `linear-gradient(90deg, ${primaryColor}, ${secondaryColor})`,
        }}
      />
    </div>
  );
};
