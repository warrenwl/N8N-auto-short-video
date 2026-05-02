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
  activeKeywordIndex: number;
  primaryColor: string;
  secondaryColor: string;
  templateConfig: TemplateVisualConfig;
  cardConfig: NonNullable<RemotionVisualConfig['card']>;
  motionConfig: NonNullable<RemotionVisualConfig['motion']>;
};

const fontFamily = 'PingFang SC, Hiragino Sans GB, Noto Sans CJK SC, Microsoft YaHei, sans-serif';

const headlineSize = (text: string, base = 74) =>
  text.length > 18 ? base - 22 : text.length > 14 ? base - 14 : text.length > 10 ? base - 6 : base;

const trimText = (text: string, limit: number) =>
  text.length > limit ? `${text.slice(0, Math.max(0, limit - 1))}…` : text;

const compactHeadline = (text: string, limit = 16) => trimText(text.replace(/[，。！？,.!?：:；;]/g, ' ').replace(/\s+/g, ' ').trim(), limit);

const insightLine = (headline: string, keywords: string[], body: string) => {
  const first = keywords[0] || compactHeadline(headline, 8);
  const second = keywords[1] || keywords[0] || '真正原因';
  if (first && second && first !== second) return `${first} 不是终点`;
  return compactHeadline(body || headline, 22);
};

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

const stickerPop = (frame: number, index: number, motionConfig: Shared['motionConfig']) => {
  const base = pop(frame, index, motionConfig);
  const scale = interpolate(frame, [10 + index * 5, 18 + index * 5, 28 + index * 5], [0.82, 1.08, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const rotate = index % 2 === 0 ? -2 : 2;
  const floatY = Math.sin(frame / 24 + index) * 2.5;
  return {...base, transform: `${base.transform} translateY(${floatY}px) scale(${scale}) rotate(${rotate}deg)`};
};

const Shell: React.FC<{
  children: React.ReactNode;
  top: number;
  enter: number;
  opacity: number;
  scale: number;
  frame: number;
  wide?: boolean;
}> = ({children, top, enter, opacity, scale, frame, wide = false}) => {
  const driftX = Math.sin(frame / 38) * 3;
  const driftY = Math.cos(frame / 44) * 4;
  return (
    <div
      style={{
        position: 'absolute',
        left: wide ? 44 : 64,
        right: wide ? 44 : 64,
        top,
        transform: `translate(${driftX}px, ${(1 - enter) * 52 + driftY}px) scale(${scale})`,
        opacity,
        fontFamily,
      }}
    >
      {children}
    </div>
  );
};

const Watermark: React.FC<{
  segment: Segment;
  layout: string;
  enabled: boolean;
  frame: number;
}> = ({segment, layout, enabled, frame}) => {
  if (!enabled) return null;
  const opacity = interpolate(frame, [0, 12, 42, 70], [0, 0.08, 0.08, 0.018], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <div
      style={{
        position: 'absolute',
        right: layout === 'contrast' ? 18 : -8,
        top: layout === 'timeline' ? -96 : -118,
        color: `rgba(255,255,255,${opacity})`,
        fontSize: layout === 'timeline' ? 176 : layout === 'contrast' ? 150 : 210,
        lineHeight: 1,
        fontWeight: 900,
        letterSpacing: 0,
      }}
    >
      {String(segment.index).padStart(2, '0')}
    </div>
  );
};

const KnowledgeCard: React.FC<{segment: Segment; total: number; shared: Shared}> = ({segment, total, shared}) => (
  <div style={{position: 'relative'}}>
    <Watermark segment={segment} layout="concept" enabled={shared.cardConfig.number_watermark !== false} frame={shared.frame} />
    <div
      style={{
        minHeight: 300,
        paddingLeft: 18,
        borderLeft: `5px solid ${shared.primaryColor}`,
        background: 'linear-gradient(90deg, rgba(0,0,0,0.14), rgba(0,0,0,0.025), transparent 70%)',
      }}
    >
      <div style={{padding: '12px 0 18px 24px'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20}}>
          <div style={{color: shared.primaryColor, fontSize: 26, fontWeight: 950}}>这一句先记住</div>
          <div style={{width: 86, height: 3, borderRadius: 999, background: `linear-gradient(90deg, ${shared.primaryColor}, transparent)`}} />
          <div style={{color: 'rgba(255,255,255,0.6)', fontSize: 25, fontWeight: 850}}>{segment.index}/{total}</div>
        </div>
        <div
          style={{
            color: '#fff',
            fontSize: headlineSize(segment.headline, 62),
            lineHeight: 1.08,
            fontWeight: 950,
            letterSpacing: 0,
            maxWidth: 860,
            textShadow: '0 5px 28px rgba(0,0,0,0.72)',
          }}
        >
          {compactHeadline(segment.headline, 20)}
        </div>
        <div
          style={{
            marginTop: 20,
            display: 'inline-flex',
            maxWidth: 820,
            padding: '11px 16px',
            borderRadius: 14,
            background: `linear-gradient(90deg, ${rgba(shared.primaryColor, 0.24)}, rgba(0,0,0,0.18))`,
            border: `1px solid ${rgba(shared.primaryColor, 0.34)}`,
            color: '#fff',
            fontSize: 30,
            lineHeight: 1.18,
            fontWeight: 950,
            textShadow: '0 4px 18px rgba(0,0,0,0.66)',
          }}
        >
          {insightLine(segment.headline, shared.keywords, shared.rawBody)}
        </div>
        {shared.body ? (
          <div style={{marginTop: 16, maxWidth: 800, color: 'rgba(255,255,255,0.78)', fontSize: 28, lineHeight: 1.32, fontWeight: 780, textShadow: '0 4px 18px rgba(0,0,0,0.82)'}}>
            {trimText(shared.rawBody, 36)}
          </div>
        ) : null}
        <div style={{display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 24}}>
          {shared.keywords.slice(0, 4).map((keyword, index) => (
            <div
              key={`${keyword}-${index}`}
              style={{
                ...stickerPop(shared.frame, index, shared.motionConfig),
                display: 'inline-flex',
                alignItems: 'center',
                padding: '7px 11px',
                borderRadius: 10,
                background: index === shared.activeKeywordIndex
                  ? rgba(index % 2 ? shared.secondaryColor : shared.primaryColor, 0.24)
                  : index % 2 ? 'rgba(255,255,255,0.09)' : rgba(shared.primaryColor, 0.16),
                border: `1px solid ${index === shared.activeKeywordIndex ? rgba(index % 2 ? shared.secondaryColor : shared.primaryColor, 0.46) : index % 2 ? 'rgba(255,255,255,0.12)' : rgba(shared.primaryColor, 0.24)}`,
                color: index % 2 ? shared.secondaryColor : shared.primaryColor,
                fontSize: (keyword.length > 7 ? 27 : 31) + (index === shared.activeKeywordIndex ? 2 : 0),
                fontWeight: 950,
                textShadow: `0 0 24px ${rgba(index % 2 ? shared.secondaryColor : shared.primaryColor, 0.42)}`,
                boxShadow: index === shared.activeKeywordIndex
                  ? `0 0 28px ${rgba(index % 2 ? shared.secondaryColor : shared.primaryColor, 0.32)}, 0 10px 30px rgba(0,0,0,0.2)`
                  : '0 10px 30px rgba(0,0,0,0.18)',
              }}
            >
              #{keyword}
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const ListCard: React.FC<{segment: Segment; total: number; shared: Shared}> = ({segment, total, shared}) => {
  const items = shared.keywords.length ? shared.keywords.slice(0, 4) : [segment.headline];
  const activeIndex = Math.min(items.length - 1, shared.activeKeywordIndex);
  return (
    <div style={{position: 'relative'}}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '104px 1fr',
          gap: 18,
          minHeight: 380,
          padding: 0,
          borderRadius: 0,
          background: 'transparent',
          border: 0,
          boxShadow: 'none',
        }}
      >
        <div
          style={{
            color: rgba(shared.primaryColor, 0.9),
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            textShadow: `0 0 34px ${rgba(shared.primaryColor, 0.34)}`,
          }}
        >
          <div style={{fontSize: 25, fontWeight: 950, writingMode: 'vertical-rl', letterSpacing: 2}}>STEP</div>
          <div style={{fontSize: 86, lineHeight: 0.9, fontWeight: 950}}>{String(segment.index).padStart(2, '0')}</div>
          <div style={{width: 3, height: 96, marginTop: 18, borderRadius: 999, background: `linear-gradient(180deg, ${shared.primaryColor}, transparent)`}} />
        </div>
        <div style={{display: 'grid', alignContent: 'center', padding: '8px 0'}}>
          <div style={{color: 'rgba(255,255,255,0.84)', fontSize: 29, lineHeight: 1.25, fontWeight: 900, textShadow: '0 4px 18px rgba(0,0,0,0.72)'}}>
            {compactHeadline(segment.headline, 24)}
          </div>
          <div
            style={{
              marginTop: 18,
              color: '#fff',
              fontSize: items[activeIndex].length > 8 ? 50 : 62,
              lineHeight: 1.08,
              fontWeight: 950,
              maxWidth: 820,
              textShadow: '0 5px 26px rgba(0,0,0,0.72)',
            }}
          >
            {items[activeIndex]}
          </div>
          {shared.body ? (
            <div style={{marginTop: 16, color: 'rgba(255,255,255,0.78)', fontSize: 28, lineHeight: 1.3, fontWeight: 780, maxWidth: 800, textShadow: '0 4px 18px rgba(0,0,0,0.72)'}}>
              {trimText(shared.rawBody, 38)}
            </div>
          ) : null}
          <div style={{display: 'grid', gap: 10, marginTop: 24, maxWidth: 740}}>
            {items.map((keyword, index) => (
              <div
                key={`${keyword}-${index}`}
                style={{
                  ...stickerPop(shared.frame, index, shared.motionConfig),
                  display: 'inline-grid',
                  gridTemplateColumns: '38px auto',
                  alignItems: 'center',
                  justifySelf: 'start',
                  gap: 12,
                  width: index === activeIndex ? 660 : 520,
                  maxWidth: '100%',
                  minHeight: index === activeIndex ? 58 : 46,
                  padding: index === activeIndex ? '8px 16px 10px 10px' : '6px 14px 8px 10px',
                  borderRadius: 12,
                  background: index === shared.activeKeywordIndex
                    ? rgba(shared.primaryColor, 0.26)
                    : 'rgba(0,0,0,0.2)',
                  border: `1px solid ${index === shared.activeKeywordIndex ? rgba(shared.primaryColor, 0.48) : index === 0 ? rgba(shared.primaryColor, 0.3) : 'rgba(255,255,255,0.08)'}`,
                  color: '#fff',
                  boxShadow: index === shared.activeKeywordIndex
                    ? `0 0 28px ${rgba(shared.primaryColor, 0.24)}, 0 14px 38px rgba(0,0,0,0.2)`
                    : '0 14px 38px rgba(0,0,0,0.18)',
                  marginLeft: index === activeIndex ? 0 : 28 + index * 12,
                  transform: `${stickerPop(shared.frame, index, shared.motionConfig).transform} translateY(${(index - activeIndex) * 4}px)`,
                  opacity: index === shared.activeKeywordIndex ? 1 : 0.5,
                }}
              >
                <span style={{color: shared.primaryColor, fontSize: index === activeIndex ? 34 : 28, fontWeight: 950}}>{index + 1}</span>
                <span style={{fontSize: index === activeIndex ? (keyword.length > 8 ? 30 : 34) : 27, fontWeight: index === activeIndex ? 920 : 840}}>{keyword}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const ContrastCard: React.FC<{segment: Segment; total: number; shared: Shared}> = ({segment, total, shared}) => {
  const contrastConfig = shared.templateConfig.contrast || {};
  const left = shared.keywords[0] || contrastConfig.left_fallback || '误区';
  const right = shared.keywords[1] || shared.keywords[0] || contrastConfig.right_fallback || '正解';
  const summary = trimText(shared.rawBody, right.length > 6 ? 34 : 40);
  const push = interpolate(shared.frame, [0, shared.segmentFrames * 0.42, shared.segmentFrames * 0.72], [0, 0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const glow = interpolate(shared.frame, [0, 16, shared.segmentFrames * 0.65], [0.22, 0.48, 0.62], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const panels = [
    {
      eyebrow: contrastConfig.left_eyebrow || '旧想法',
      label: contrastConfig.left_label || '先放下',
      mark: '×',
      value: left,
      body: compactHeadline(segment.headline, 18),
      active: false,
    },
    {
      eyebrow: contrastConfig.right_eyebrow || '新答案',
      label: contrastConfig.right_label || '真正要换成',
      mark: '✓',
      value: right,
      body: summary,
      active: true,
    },
  ];
  return (
    <div style={{position: 'relative', minHeight: 560}}>
      <Watermark segment={segment} layout="contrast" enabled={shared.cardConfig.number_watermark !== false} frame={shared.frame} />
      <div
        style={{
          position: 'absolute',
          left: 500,
          top: 18,
          bottom: 34,
          width: 6,
          borderRadius: 999,
          background: `linear-gradient(180deg, transparent, ${rgba(shared.primaryColor, 0.82)}, transparent)`,
          boxShadow: `0 0 34px ${rgba(shared.primaryColor, 0.36)}`,
          opacity: 0.72,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 520,
          right: -26,
          top: 70,
          height: 330,
          borderRadius: 34,
          background: `radial-gradient(circle at 42% 46%, ${rgba(shared.primaryColor, glow)}, ${rgba(shared.primaryColor, 0.12)} 42%, rgba(0,0,0,0) 72%)`,
          filter: 'blur(2px)',
          opacity: 0.88,
        }}
      />
      <div style={{position: 'relative'}}>
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 28}}>
          <div style={{color: 'rgba(255,255,255,0.62)', fontSize: 26, fontWeight: 850}}>{segment.index}/{total}</div>
        </div>
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 62}}>
          {panels.map((panel, index) => {
            const wordSize = panel.value.length > 8 ? 58 : panel.value.length > 5 ? 72 : 88;
            const isActive = panel.active;
            const panelMotion = pop(shared.frame, 0, shared.motionConfig);
            return (
              <div
                key={panel.label}
                style={{
                  ...panelMotion,
                  minHeight: 430,
                  padding: '20px 8px 0',
                  opacity: isActive ? 0.88 + push * 0.12 : 0.72 - push * 0.22,
                  transform: panelMotion.transform,
                }}
              >
                <div
                  style={{
                    color: isActive ? shared.primaryColor : 'rgba(255,255,255,0.56)',
                    fontSize: 29,
                    fontWeight: 950,
                    marginBottom: 22,
                    textShadow: isActive ? `0 0 24px ${rgba(shared.primaryColor, 0.24)}` : '0 4px 18px rgba(0,0,0,0.52)',
                  }}
                >
                  {panel.eyebrow}
                </div>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 12,
                    minHeight: 52,
                    padding: '8px 17px 9px 12px',
                    borderRadius: 999,
                    color: isActive ? '#111' : 'rgba(255,255,255,0.72)',
                    background: isActive ? shared.primaryColor : 'rgba(255,255,255,0.1)',
                    border: isActive ? 0 : '1px solid rgba(255,255,255,0.16)',
                    boxShadow: isActive ? `0 0 30px ${rgba(shared.primaryColor, 0.38)}` : '0 12px 34px rgba(0,0,0,0.16)',
                    fontSize: 29,
                    fontWeight: 950,
                  }}
                >
                  <span
                    style={{
                      display: 'inline-grid',
                      placeItems: 'center',
                      width: 34,
                      height: 34,
                      borderRadius: 999,
                      background: isActive ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.68)',
                      color: '#111',
                    }}
                  >
                    {panel.mark}
                  </span>
                  <span>{panel.label}</span>
                </div>
                <div
                  style={{
                    position: 'relative',
                    marginTop: 28,
                    maxWidth: 440,
                    color: '#fff',
                    fontSize: wordSize,
                    lineHeight: 0.98,
                    fontWeight: 950,
                    textShadow: isActive
                      ? `0 7px 30px rgba(0,0,0,0.8), 0 0 38px ${rgba(shared.primaryColor, 0.34)}`
                      : '0 5px 24px rgba(0,0,0,0.68)',
                    textDecoration: isActive ? 'none' : 'line-through',
                    textDecorationColor: rgba(shared.primaryColor, 0.86),
                    textDecorationThickness: isActive ? undefined : 5,
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      left: -10,
                      top: -36,
                      color: isActive ? rgba(shared.primaryColor, 0.18) : 'rgba(255,255,255,0.06)',
                      fontSize: wordSize * 1.14,
                      lineHeight: 1,
                      fontWeight: 950,
                      WebkitTextStroke: `1px ${isActive ? rgba(shared.primaryColor, 0.18) : 'rgba(255,255,255,0.08)'}`,
                    }}
                  >
                    {panel.value}
                  </span>
                  <span style={{position: 'relative', color: isActive ? '#fff' : 'rgba(255,255,255,0.78)'}}>{panel.value}</span>
                </div>
                {panel.body ? (
                  <div
                    style={{
                      marginTop: 26,
                      maxWidth: 430,
                      minHeight: 116,
                      paddingLeft: 18,
                      borderLeft: `4px solid ${isActive ? rgba(shared.primaryColor, 0.86) : 'rgba(255,255,255,0.24)'}`,
                      color: isActive ? 'rgba(255,255,255,0.84)' : 'rgba(255,255,255,0.56)',
                      fontSize: isActive ? 30 : 28,
                      lineHeight: 1.28,
                      fontWeight: isActive ? 850 : 780,
                      textShadow: '0 4px 18px rgba(0,0,0,0.76)',
                    }}
                  >
                    <span style={{opacity: isActive ? 1 : 0.74}}>{panel.body}</span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const StoryCard: React.FC<{segment: Segment; total: number; shared: Shared}> = ({segment, total, shared}) => {
  const points = shared.keywords.length ? shared.keywords.slice(0, 4) : [segment.headline];
  const activeIndex = Math.min(points.length - 1, Math.floor(shared.frame / Math.max(1, shared.segmentFrames / points.length)));
  return (
    <div style={{position: 'relative'}}>
      <Watermark segment={segment} layout="timeline" enabled={shared.cardConfig.number_watermark !== false} frame={shared.frame} />
      <div
        style={{
          minHeight: 430,
          padding: '16px 0',
          borderRadius: 0,
          background: 'transparent',
          border: 0,
          boxShadow: 'none',
        }}
      >
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22}}>
          <div style={{color: shared.secondaryColor, fontSize: 29, fontWeight: 950, textShadow: `0 0 24px ${rgba(shared.secondaryColor, 0.36)}`}}>故事推进中</div>
          <div style={{color: 'rgba(255,255,255,0.66)', fontSize: 27, fontWeight: 850}}>{segment.index}/{total}</div>
        </div>
        <div style={{color: 'rgba(255,255,255,0.84)', fontSize: 30, lineHeight: 1.25, fontWeight: 880, maxWidth: 880, textShadow: '0 4px 18px rgba(0,0,0,0.78)'}}>
          {compactHeadline(segment.headline, 28)}
        </div>
        <div
          style={{
            marginTop: 22,
            display: 'inline-flex',
            maxWidth: 760,
            padding: '14px 18px',
            borderRadius: 14,
            background: `linear-gradient(90deg, ${rgba(shared.secondaryColor, 0.24)}, rgba(0,0,0,0.18))`,
            border: `1px solid ${rgba(shared.secondaryColor, 0.3)}`,
            color: '#fff',
            fontSize: storyPoint(points[activeIndex], activeIndex).length > 8 ? 38 : 48,
            lineHeight: 1.12,
            fontWeight: 950,
            textShadow: '0 5px 24px rgba(0,0,0,0.72)',
          }}
        >
          {storyPoint(points[activeIndex], activeIndex)}
        </div>
        {shared.body ? (
          <div style={{marginTop: 16, maxWidth: 820, color: 'rgba(255,255,255,0.78)', fontSize: 28, lineHeight: 1.3, fontWeight: 780, textShadow: '0 4px 18px rgba(0,0,0,0.78)'}}>
            {trimText(shared.rawBody, 42)}
          </div>
        ) : null}
        <div style={{position: 'relative', display: 'grid', gap: 16, marginTop: 28, paddingLeft: 42}}>
          <div style={{position: 'absolute', left: 15, top: 8, bottom: 10, width: 3, borderRadius: 999, background: `linear-gradient(180deg, ${shared.secondaryColor}, ${shared.primaryColor})`}} />
          {points.map((point, index) => {
            const active = index === activeIndex;
            const color = index % 2 ? shared.primaryColor : shared.secondaryColor;
            return (
              <div key={`${point}-${index}`} style={{...pop(shared.frame, index, shared.motionConfig), position: 'relative', opacity: active ? 1 : 0.54}}>
                <div style={{position: 'absolute', left: active ? -39 : -34, top: active ? 10 : 15, width: active ? 24 : 14, height: active ? 24 : 14, borderRadius: 999, background: color, boxShadow: active ? `0 0 34px ${rgba(color, 0.82)}` : `0 0 16px ${rgba(color, 0.42)}`}} />
                <div style={{color: '#fff', fontSize: active ? (point.length > 9 ? 35 : 40) : (point.length > 9 ? 28 : 32), lineHeight: 1.16, fontWeight: active ? 950 : 860, textShadow: active ? '0 4px 18px rgba(0,0,0,0.78)' : '0 3px 12px rgba(0,0,0,0.55)'}}>
                  {storyPoint(point, index)}
                </div>
              </div>
            );
          })}
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
  const top = layout === 'contrast' ? 300 : layout === 'timeline' ? 306 : layout === 'steps' ? 338 : rawBody.length > 78 ? 330 : 348;
  const keywordCount = Math.max(1, Math.min(4, (segment.keywords || []).length));
  const activeKeywordIndex = Math.min(keywordCount - 1, Math.floor(frame / Math.max(1, segmentFrames / keywordCount)));
  const shared: Shared = {
    frame,
    segmentFrames,
    body,
    rawBody,
    keywords: segment.keywords || [],
    activeKeywordIndex,
    primaryColor,
    secondaryColor,
    templateConfig,
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
    <Shell top={top} enter={enter} opacity={enterOpacity * exitOpacity} scale={segmentScale * pauseScale * emphasisScale} frame={frame} wide={layout === 'contrast'}>
      {content}
    </Shell>
  );
};
