import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import type {RemotionVisualConfig, TemplateVisualConfig} from '../types';
import {rgba} from '../visualConfig';

type Props = {
  text: string;
  keywords: string[];
  primaryColor: string;
  secondaryColor: string;
  visualConfig: RemotionVisualConfig;
  templateConfig: TemplateVisualConfig;
  platform?: string;
  durationInFrames?: number;
};

const splitForHighlight = (text: string, keywords: string[]) => {
  const keyword = keywords
    .filter((item) => item.length >= 2)
    .sort((a, b) => b.length - a.length)
    .find((item) => text.includes(item));
  if (!keyword) {
    return [{text, highlight: false}];
  }
  const parts = text.split(keyword);
  const chunks: Array<{text: string; highlight: boolean}> = [];
  parts.forEach((part, index) => {
    if (part) chunks.push({text: part, highlight: false});
    if (index < parts.length - 1) chunks.push({text: keyword, highlight: true});
  });
  return chunks;
};

const wrapCaptionLines = (text: string, maxChars: number) => {
  const lines: string[] = [];
  let current = '';
  for (const ch of text) {
    current += ch;
    const isSoftBreak = '，；,;'.includes(ch) && current.length >= Math.floor(maxChars * 0.58);
    const isHardBreak = '。！？!?'.includes(ch);
    if (current.length >= maxChars || isSoftBreak || isHardBreak) {
      lines.push(current.trim());
      current = '';
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
};

const paginateLines = (lines: string[], maxLines: number) => {
  const pages: string[] = [];
  for (let index = 0; index < lines.length; index += maxLines) {
    pages.push(lines.slice(index, index + maxLines).join('\n'));
  }
  return pages.length ? pages : [''];
};

export const Caption: React.FC<Props> = ({
  text,
  keywords,
  primaryColor,
  secondaryColor,
  visualConfig,
  templateConfig,
  platform,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const captionConfig = visualConfig.caption || {};
  const platformProfile =
    visualConfig.platform_profiles?.[platform || 'default'] || visualConfig.platform_profiles?.default || {};
  const layout = templateConfig.layout || 'concept';
  const captionLeft = platformProfile.caption_left_px ?? captionConfig.left_px ?? 64;
  const captionRight = platformProfile.caption_right_px ?? captionConfig.right_px ?? 64;
  const captionBottom = platformProfile.caption_bottom_px ?? captionConfig.bottom_px ?? 154;
  const lines = wrapCaptionLines(text, captionConfig.max_chars_per_line ?? 18);
  const pages = paginateLines(lines, captionConfig.max_lines ?? 2);
  const pageFrameCount = Math.max(24, Math.floor((durationInFrames || 1) / pages.length));
  const activePage = Math.min(pages.length - 1, Math.floor(frame / pageFrameCount));
  const displayText = pages[activePage];
  const chunks = splitForHighlight(displayText, keywords);
  const fontSize =
    text.length > 48
      ? captionConfig.font_size_long ?? 34
      : text.length > 30
        ? captionConfig.font_size_medium ?? 40
        : captionConfig.font_size_short ?? 48;
  const scaledFontSize = fontSize * (platformProfile.caption_scale ?? 1);
  const highlightProgress = interpolate(
    frame,
    [captionConfig.highlight_delay_frames ?? 6, (captionConfig.highlight_delay_frames ?? 6) + 10],
    [0, 1],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );
  const emphasis = interpolate(frame, [0, 8, 18], [0.985, captionConfig.emphasis_scale ?? 1.012, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const isContrast = layout === 'contrast';
  const isList = layout === 'steps';
  const isStory = layout === 'timeline';
  return (
    <div
      style={{
        position: 'absolute',
        left: isList ? captionLeft + 28 : captionLeft,
        right: isContrast ? captionRight + 22 : captionRight,
        bottom: captionBottom,
        padding: isStory ? '18px 28px' : isList ? '18px 30px' : '20px 32px',
        borderRadius: isContrast ? 999 : isList ? 14 : isStory ? 22 : 20,
        background: isContrast
          ? `linear-gradient(90deg, rgba(0,0,0,0.44), ${rgba(primaryColor, 0.14)})`
          : isList
            ? 'rgba(0,0,0,0.36)'
            : isStory
              ? `linear-gradient(90deg, rgba(0,0,0,0.4), ${rgba(secondaryColor, 0.1)})`
              : 'rgba(0,0,0,0.42)',
        border: isList ? `1px solid ${rgba(primaryColor, 0.14)}` : '1px solid rgba(255,255,255,0.1)',
        color: 'white',
        fontSize: scaledFontSize,
        lineHeight: 1.26,
        textAlign: isList || isStory ? 'left' : 'center',
        fontWeight: 850,
        whiteSpace: 'pre-line',
        textShadow: '0 3px 14px rgba(0,0,0,0.85)',
        fontFamily:
          'PingFang SC, Hiragino Sans GB, Noto Sans CJK SC, Microsoft YaHei, sans-serif',
        transform: `scale(${emphasis})`,
      }}
    >
      {chunks.length === 1 && chunks[0].text === displayText ? displayText : chunks.map((chunk, index) => (
        <span
          key={`${chunk.text}-${index}`}
          style={{
            color: chunk.highlight ? primaryColor : '#fff',
            background: chunk.highlight ? rgba(primaryColor, 0.12 * highlightProgress) : 'transparent',
            borderRadius: 8,
            padding: chunk.highlight ? '0 4px' : 0,
          }}
        >
          {chunk.text}
        </span>
      ))}
    </div>
  );
};
