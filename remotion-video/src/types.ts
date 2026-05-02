export type Segment = {
  index: number;
  start: number;
  end: number;
  duration: number;
  subtitle: string;
  headline: string;
  keywords: string[];
  body?: string;
  layout_hint?: string;
  visual_prompt?: string;
};

export type CaptionCue = {
  index: number;
  shot_index?: number;
  phrase_index?: number;
  start: number;
  end: number;
  duration: number;
  text: string;
  subtitle?: string;
  keywords?: string[];
  alignment_method?: string;
};

export type Theme = {
  style: string;
  primary_color: string;
  secondary_color?: string;
  background_color: string;
  template_label?: string;
};

export type AccountBrand = {
  account_name?: string;
  account_logo?: string;
  account_logo_path?: string | null;
  account_logo_url?: string | null;
};

export type TemplateVisualConfig = {
  label?: string;
  accent?: string;
  layout?: 'concept' | 'steps' | 'contrast' | 'timeline';
  motion?: 'steady' | 'step' | 'snap' | 'drift';
  keyword_style?: 'chips' | 'numbered' | 'split' | 'timeline';
  background_mood?: 'clean' | 'bright' | 'conflict' | 'warm';
};

export type RemotionVisualConfig = {
  enabled?: boolean;
  auto_from_cover?: boolean;
  fallback_primary_color?: string;
  secondary_color?: string;
  background_color?: string;
  templates?: Record<string, TemplateVisualConfig>;
  motion?: {
    background_zoom?: number;
    pan_px?: number;
    segment_zoom?: number;
    keyword_stagger_frames?: number;
    transition_frames?: number;
    emphasis_scale?: number;
  };
  caption?: {
    max_chars_per_line?: number;
    box_opacity?: number;
    highlight_delay_frames?: number;
    font_size_short?: number;
    font_size_medium?: number;
    font_size_long?: number;
    max_lines?: number;
    bottom_px?: number;
    left_px?: number;
    right_px?: number;
    emphasis_scale?: number;
  };
  card?: {
    glass_opacity?: number;
    border_opacity?: number;
    shadow_opacity?: number;
    corner_radius?: number;
    number_watermark?: boolean;
    max_body_chars?: number;
    compact_body_chars?: number;
  };
  outro?: {
    enabled?: boolean;
    duration_seconds?: number;
    summary_seconds?: number;
    follow_seconds?: number;
    title?: string;
    cta?: string;
    follow_hint?: string;
    show_follow_animation?: boolean;
    voice_enabled?: boolean;
    voice_text?: string;
  };
  brand?: {
    enabled?: boolean;
    position?: 'top-left' | 'top-center' | 'top-right';
    show_avatar?: boolean;
    show_name?: boolean;
  };
  platform_profiles?: Record<string, {
    caption_scale?: number;
    caption_bottom_px?: number;
    caption_left_px?: number;
    caption_right_px?: number;
    top_safe_px?: number;
    bottom_safe_px?: number;
    right_safe_px?: number;
    tempo?: 'fast' | 'balanced' | 'calm';
  }>;
  audio_reactive?: {
    use_subtitle_boundaries?: boolean;
    keyword_pop_frames?: number;
    pause_emphasis_scale?: number;
  };
};

export type SubtitleAlignment = {
  method?: string;
  selected_boundaries?: number[];
  expected_boundaries?: number[];
  silence_midpoints?: number[];
};

export type RemotionManifest = {
  task_id: string;
  title: string;
  cover_text: string;
  platform?: string;
  cover_path: string | null;
  cover_url?: string | null;
  voice_path: string | null;
  voice_url?: string | null;
  audio_duration: number;
  outro_audio_duration?: number;
  voice_total_duration?: number;
  outro_voice_text?: string;
  width: number;
  height: number;
  fps: number;
  template_type?: string;
  source_audio_duration?: number;
  subtitle_alignment?: SubtitleAlignment;
  caption_cues?: CaptionCue[];
  visual_config?: RemotionVisualConfig;
  account?: AccountBrand;
  theme: Theme;
  segments: Segment[];
};
