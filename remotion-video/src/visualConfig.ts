import type {RemotionManifest, RemotionVisualConfig, TemplateVisualConfig} from './types';

export const getVisualConfig = (manifest: RemotionManifest): RemotionVisualConfig =>
  manifest.visual_config?.enabled === false ? {} : manifest.visual_config || {};

export const getTemplateConfig = (manifest: RemotionManifest): TemplateVisualConfig => {
  const config = getVisualConfig(manifest);
  return config.templates?.[manifest.template_type || 'knowledge'] || {};
};

export const getTemplateLabel = (manifest: RemotionManifest) =>
  manifest.theme?.template_label ||
  getTemplateConfig(manifest).label ||
  (manifest.template_type === 'list'
    ? '清单拆解'
    : manifest.template_type === 'contrast'
      ? '对比观点'
      : manifest.template_type === 'story'
        ? '故事口播'
        : '知识口播');

export const hexToRgb = (hex: string, fallback = {r: 248, g: 214, b: 109}) => {
  const normalized = hex.replace('#', '').trim();
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return fallback;
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
};

export const rgba = (hex: string, alpha: number) => {
  const {r, g, b} = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
};

export const getOutroSeconds = (manifest: RemotionManifest) => {
  const outro = getVisualConfig(manifest).outro;
  if (outro?.enabled === false) return 0;
  const configured = Math.max(0, Number(outro?.duration_seconds ?? 1.8));
  const spoken = Math.max(0, Number(outro?.summary_seconds ?? 1) + Number(manifest.outro_audio_duration || 0) + 0.2);
  return Math.max(configured, spoken);
};

export const getTimelineEnd = (manifest: RemotionManifest) =>
  Math.max(manifest.audio_duration || 0, manifest.segments.at(-1)?.end || 0, 1);
