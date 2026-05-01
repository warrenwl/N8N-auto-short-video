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

type Shared = {
  frame: number;
  segmentFrames: number;
  body: string;
  rawBody: string;
  keywords: string[];
  primaryColor: string;
  secondaryColor: string;
  cardConfig: NonNullable<RemotionVisualConfig['card']>;
  motionConfig: NonNullable<RemotionVisualConfig['motion']>;
};

const fontFamily = 'PingFang SC, Hiragino Sans GB, Noto Sans CJK SC, Microsoft YaHei, sans-serif';

const headlineSize = (text: string, base = 74) =>
  text.length > 18 ? base - 22 : text.length > 14 ? base - 14 : text.length > 10 ? base - 6 : base;

const trimText = (text: string, limit: number) =>
  text.length > limit ? `${text.slice(0, Math.max(0, limit - 1))}…` : text;

const storyPoint = (point: string, index: number) => {
  const fallback = ['起因', '经过', '转折', '结论'][index] || `节点${index + 1}`;
  const cleaned = point.trim();
  if (!cleaned) return fallback;
  if (/^(起因|经过|转折|结论|后来|最后|场景|冲突|行动)$/.test(cleaned)) return cleaned;
  return cleaned.length <= 6 ? cleaned : trimText(cleaned, 10);
};

const pop = (frame: number, index: number, motionConfig: Shared['motionConfig']) => {
  const stagger = motionConfig.keyword_stagger_frames ?? 6;
  const opacity = interpolate(frame, [10 + index * stagger, 18 + index * stagger], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const y = interpolate(frame, [10 + index * stagger, 18 + index * stagger], [24, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return {opacity, transform: `translateY(${y}px)`};
};

const Shell: React.FC<{
  children: React.ReactNode;
  top: number;
  enter: number;
  opacity: number;
  scale: number;
  wide?: boolean;
}> = ({children, top, enter, opacity, scale, wide = false}) => (
  <div
    style={{
      position: 'absolute',
      left: wide ? 44 : 64,
      right: wide ? 44 : 64,
      top,
      transform: `translateY(${(1 - enter) * 52}px) scale(${scale})`,
      opacity,
      fontFamily,
    }}
  >
    {children}
  </div>
);

const Watermark: React.FC<{segment: Segment; layout: string; enabled: boolean}> = ({segment, layout, enabled}) =>
  enabled ? (
    <div
      style={{
        position: 'absolute',
        right: layout === 'contrast' ? 18 : -8,
        top: layout === 'timeline' ? -96 : -118,
        color: 'rgba(255,255,255,0.07)',
        fontSize: layout === 'timeline' ? 176 : layout === 'contrast' ? 150 : 210,
        lineHeight: 1,
        fontWeight: 900,
        letterSpacing: 0,
      }}
    >
      {String(segment.index).padStart(2, '0')}
    </div>
  ) : null;

const KnowledgeCard: React.FC<{segment: Segment; total: number; shared: Shared}> = ({segment, total, shared}) => (
  <div style={{position: 'relative'}}>
    <Watermark segment={segment} layout="concept" enabled={shared.cardConfig.number_watermark !== false} />
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '10px 1fr',
        minHeight: 430,
        borderRadius: 0,
        overflow: 'hidden',
        background: 'linear-gradient(90deg, rgba(0,0,0,0.32), rgba(0,0,0,0.08), transparent)',
        border: 0,
        boxShadow: 'none',
      }}
    >
      <div style={{background: `linear-gradient(180deg, ${shared.primaryColor}, ${shared.secondaryColor})`}} />
      <div style={{padding: '30px 36px 34px'}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32}}>
          <div style={{color: shared.primaryColor, fontSize: 24, fontWeight: 950}}>POINT {String(segment.index).padStart(2, '0')}</div>
          <div style={{color: 'rgba(255,255,255,0.62)', fontSize: 26, fontWeight: 850}}>{segment.index}/{total}</div>
        </div>
        <div
          style={{
            color: '#fff',
            fontSize: headlineSize(segment.headline, 74),
            lineHeight: 1.08,
            fontWeight: 950,
            letterSpacing: 0,
          }}
        >
          {segment.headline}
        </div>
        {shared.body ? (
          <div style={{marginTop: 24, color: 'rgba(255,255,255,0.68)', fontSize: 28, lineHeight: 1.38, fontWeight: 720}}>
            {shared.body}
          </div>
        ) : null}
        <div style={{display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 32}}>
          {shared.keywords.slice(0, 4).map((keyword, index) => (
            <div
              key={`${keyword}-${index}`}
              style={{
                ...pop(shared.frame, index, shared.motionConfig),
                padding: '11px 16px',
                borderRadius: 999,
                color: index % 2 ? shared.secondaryColor : shared.primaryColor,
                background: 'rgba(255,255,255,0.075)',
                border: '1px solid rgba(255,255,255,0.12)',
                fontSize: keyword.length > 7 ? 24 : 28,
                fontWeight: 900,
              }}
            >
              {keyword}
            </div>
          ))}
        </div>
      </div>
    </div>
    <div style={{marginTop: 20, width: 130, height: 6, borderRadius: 999, background: `linear-gradient(90deg, ${shared.primaryColor}, ${shared.secondaryColor})`}} />
  </div>
);

const ListCard: React.FC<{segment: Segment; total: number; shared: Shared}> = ({segment, total, shared}) => {
  const items = shared.keywords.length ? shared.keywords.slice(0, 4) : [segment.headline];
  return (
    <div style={{position: 'relative'}}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '106px 1fr',
          gap: 22,
          minHeight: 460,
          padding: 0,
          borderRadius: 0,
          background: 'transparent',
          border: 0,
          boxShadow: 'none',
        }}
      >
        <div
          style={{
            borderRadius: 999,
            background: `linear-gradient(180deg, ${rgba(shared.primaryColor, 0.82)}, ${rgba(shared.secondaryColor, 0.22)})`,
            padding: '24px 16px',
            color: '#101113',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 18px 54px rgba(0,0,0,0.22)',
          }}
        >
          <div style={{fontSize: 22, fontWeight: 950, writingMode: 'vertical-rl', letterSpacing: 2}}>STEP</div>
          <div style={{fontSize: 70, lineHeight: 0.9, fontWeight: 950}}>{String(segment.index).padStart(2, '0')}</div>
          <div style={{fontSize: 18, fontWeight: 900}}>{segment.index}/{total}</div>
        </div>
        <div style={{display: 'grid', alignContent: 'center', padding: '16px 0'}}>
          <div style={{color: '#fff', fontSize: headlineSize(segment.headline, 64), lineHeight: 1.12, fontWeight: 950}}>
            {segment.headline}
          </div>
          {shared.body ? (
            <div style={{marginTop: 18, color: 'rgba(255,255,255,0.64)', fontSize: 24, lineHeight: 1.34, fontWeight: 720}}>
              {trimText(shared.rawBody, 50)}
            </div>
          ) : null}
          <div style={{display: 'grid', gap: 12, marginTop: 30}}>
            {items.map((keyword, index) => (
              <div
                key={`${keyword}-${index}`}
                style={{
                  ...pop(shared.frame, index, shared.motionConfig),
                  display: 'grid',
                  gridTemplateColumns: '58px 1fr',
                  alignItems: 'center',
                  gap: 18,
                  minHeight: 52,
                  padding: '6px 4px',
                  borderRadius: 0,
                  background: 'transparent',
                  borderBottom: `1px solid ${index === 0 ? rgba(shared.primaryColor, 0.5) : 'rgba(255,255,255,0.14)'}`,
                  color: '#fff',
                }}
              >
                <span style={{color: shared.primaryColor, fontSize: 30, fontWeight: 950}}>{index + 1}</span>
                <span style={{fontSize: keyword.length > 8 ? 25 : 29, fontWeight: 900}}>{keyword}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const ContrastCard: React.FC<{segment: Segment; total: number; shared: Shared}> = ({segment, total, shared}) => {
  const left = shared.keywords[0] || '误区';
  const right = shared.keywords[1] || shared.keywords[0] || '正解';
  return (
    <div style={{position: 'relative'}}>
      <Watermark segment={segment} layout="contrast" enabled={shared.cardConfig.number_watermark !== false} />
      <div style={{display: 'grid', gap: 20}}>
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
          <div style={{color: shared.primaryColor, fontSize: 28, fontWeight: 950}}>VIEW {String(segment.index).padStart(2, '0')}</div>
          <div style={{color: 'rgba(255,255,255,0.62)', fontSize: 24, fontWeight: 850}}>{segment.index}/{total}</div>
        </div>
        <div style={{color: '#fff', fontSize: headlineSize(segment.headline, 64), lineHeight: 1.08, fontWeight: 950, maxWidth: 850}}>
          {segment.headline}
        </div>
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24}}>
          {[
            {label: '误区', value: left, bg: 'rgba(255,255,255,0.085)', color: '#fff'},
            {label: '正解', value: right, bg: rgba(shared.primaryColor, 0.22), color: shared.primaryColor},
          ].map((item, index) => (
            <div
              key={item.label}
              style={{
                ...pop(shared.frame, index, shared.motionConfig),
                minHeight: 250,
                padding: '26px 10px 26px 0',
                borderRadius: 0,
                background: 'transparent',
                borderTop: `4px solid ${index === 0 ? 'rgba(255,255,255,0.28)' : rgba(shared.primaryColor, 0.8)}`,
                boxShadow: 'none',
              }}
            >
              <div style={{color: item.color, fontSize: 32, fontWeight: 950, marginBottom: 28}}>{item.label}</div>
              <div style={{color: '#fff', fontSize: item.value.length > 8 ? 39 : 48, lineHeight: 1.12, fontWeight: 950}}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
        {segment.layout_hint ? (
          <div style={{width: 'fit-content', color: shared.primaryColor, fontSize: 24, lineHeight: 1.2, fontWeight: 900, padding: '10px 14px', borderRadius: 999, background: rgba(shared.primaryColor, 0.12), border: `1px solid ${rgba(shared.primaryColor, 0.24)}`}}>
            {segment.layout_hint}
          </div>
        ) : null}
      </div>
    </div>
  );
};

const StoryCard: React.FC<{segment: Segment; total: number; shared: Shared}> = ({segment, total, shared}) => {
  const points = shared.keywords.length ? shared.keywords.slice(0, 4) : [segment.headline];
  return (
    <div style={{position: 'relative'}}>
      <Watermark segment={segment} layout="timeline" enabled={shared.cardConfig.number_watermark !== false} />
      <div
        style={{
          minHeight: 500,
          padding: '28px 34px',
          borderRadius: 0,
          background: 'linear-gradient(90deg, rgba(0,0,0,0.26), rgba(0,0,0,0.08), transparent)',
          border: 0,
          boxShadow: 'none',
        }}
      >
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32}}>
          <div style={{color: shared.secondaryColor, fontSize: 28, fontWeight: 950}}>STORY {String(segment.index).padStart(2, '0')}</div>
          <div style={{color: 'rgba(255,255,255,0.62)', fontSize: 24, fontWeight: 850}}>{segment.index}/{total}</div>
        </div>
        <div style={{color: '#fff', fontSize: headlineSize(segment.headline, 62), lineHeight: 1.1, fontWeight: 950}}>
          {segment.headline}
        </div>
        {shared.body ? (
          <div style={{marginTop: 20, color: 'rgba(255,255,255,0.66)', fontSize: 24, lineHeight: 1.34, fontWeight: 700}}>
            {trimText(shared.rawBody, 58)}
          </div>
        ) : null}
        <div style={{position: 'relative', display: 'grid', gap: 18, marginTop: 34, paddingLeft: 42}}>
          <div style={{position: 'absolute', left: 15, top: 8, bottom: 10, width: 3, borderRadius: 999, background: `linear-gradient(180deg, ${shared.secondaryColor}, ${shared.primaryColor})`}} />
          {points.map((point, index) => (
            <div key={`${point}-${index}`} style={{...pop(shared.frame, index, shared.motionConfig), position: 'relative'}}>
              <div style={{position: 'absolute', left: -36, top: 13, width: 18, height: 18, borderRadius: 999, background: index % 2 ? shared.primaryColor : shared.secondaryColor, boxShadow: `0 0 28px ${rgba(index % 2 ? shared.primaryColor : shared.secondaryColor, 0.7)}`}} />
              <div style={{color: '#fff', fontSize: point.length > 9 ? 28 : 33, lineHeight: 1.18, fontWeight: 900}}>
                {storyPoint(point, index)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const ChapterCard: React.FC<Props> = ({
  segment,
  total,
  primaryColor,
  secondaryColor,
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
  const body = trimText(rawBody, bodyLimit);
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
  const layout = templateConfig.layout || 'concept';
  const top = layout === 'contrast' ? 250 : layout === 'timeline' ? 254 : layout === 'steps' ? 292 : rawBody.length > 78 ? 284 : 302;
  const shared: Shared = {
    frame,
    segmentFrames,
    body,
    rawBody,
    keywords: segment.keywords || [],
    primaryColor,
    secondaryColor,
    cardConfig,
    motionConfig,
  };

  const content =
    layout === 'steps' ? (
      <ListCard segment={segment} total={total} shared={shared} />
    ) : layout === 'contrast' ? (
      <ContrastCard segment={segment} total={total} shared={shared} />
    ) : layout === 'timeline' ? (
      <StoryCard segment={segment} total={total} shared={shared} />
    ) : (
      <KnowledgeCard segment={segment} total={total} shared={shared} />
    );

  return (
    <Shell top={top} enter={enter} opacity={enterOpacity * exitOpacity} scale={segmentScale * pauseScale * emphasisScale} wide={layout === 'contrast'}>
      {content}
    </Shell>
  );
};
