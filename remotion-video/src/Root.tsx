import React from 'react';
import {Composition} from 'remotion';
import {DynamicShortVideo} from './DynamicShortVideo';
import type {RemotionManifest} from './types';
import {getOutroSeconds, getTimelineEnd} from './visualConfig';

const defaultManifest: RemotionManifest = {
  task_id: 'preview',
  title: '动态版式视频',
  cover_text: '动态版式视频',
  platform: 'default',
  cover_path: null,
  cover_url: null,
  voice_path: null,
  voice_url: null,
  audio_duration: 8,
  width: 1080,
  height: 1920,
  fps: 30,
  template_type: 'knowledge',
  visual_config: {
    enabled: true,
    fallback_primary_color: '#F8D66D',
    secondary_color: '#58B6FF',
    background_color: '#090A0C',
    outro: {enabled: true, duration_seconds: 1.8, title: '记住这 3 个关键词', cta: '先收藏，今晚复盘一次'},
  },
  theme: {
    style: 'clean_knowledge',
    primary_color: '#F8D66D',
    background_color: '#111111',
  },
  segments: [
    {
      index: 1,
      start: 0,
      end: 8,
      duration: 8,
      subtitle: '这是动态信息流视频模板预览。',
      headline: '动态信息流',
      keywords: ['字幕', '节奏', '观点'],
    },
  ],
};

export const Root: React.FC = () => {
  return (
    <Composition
      id="DynamicShortVideo"
      component={DynamicShortVideo}
      defaultProps={defaultManifest}
      durationInFrames={Math.ceil(defaultManifest.audio_duration * defaultManifest.fps)}
      fps={defaultManifest.fps}
      width={defaultManifest.width}
      height={defaultManifest.height}
      calculateMetadata={({props}) => {
        const manifest = props as RemotionManifest;
        const fps = manifest.fps || 30;
        const duration = getTimelineEnd(manifest) + getOutroSeconds(manifest);
        return {
          durationInFrames: Math.ceil((duration + 0.4) * fps),
          fps,
          width: manifest.width || 1080,
          height: manifest.height || 1920,
        };
      }}
    />
  );
};
