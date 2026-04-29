import React from 'react';
import {AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {RemotionManifest, RemotionVisualConfig} from '../types';
import {rgba} from '../visualConfig';

type Props = {
  manifest: RemotionManifest;
  primaryColor: string;
  secondaryColor: string;
  visualConfig: RemotionVisualConfig;
};

export const Outro: React.FC<Props> = ({manifest, primaryColor, secondaryColor, visualConfig}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const opacity = interpolate(frame, [0, 16], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const y = interpolate(frame, [0, 18], [42, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const keywords = Array.from(new Set(manifest.segments.flatMap((segment) => segment.keywords || []))).slice(0, 3);
  const outro = visualConfig.outro || {};
  const summaryFrames = Math.max(12, Math.round((outro.summary_seconds ?? 1.0) * fps));
  const showFollow = outro.show_follow_animation !== false;
  const summaryOpacity = showFollow
    ? interpolate(frame, [summaryFrames - 8, summaryFrames + 4], [1, 0.34], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 1;
  const followOpacity = showFollow
    ? interpolate(frame, [summaryFrames - 4, summaryFrames + 12], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 0;
  const cleanFollowOpacity = showFollow
    ? interpolate(frame, [summaryFrames, summaryFrames + 8], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 0;
  const plusPop = spring({frame: Math.max(0, frame - summaryFrames), fps, config: {damping: 10, stiffness: 180}});
  const followFrame = Math.max(0, frame - summaryFrames);
  const clickFrame = Math.round(fps * 0.52);
  const disappearFrame = clickFrame + Math.round(fps * 0.28);
  const plusBaseScale = interpolate(plusPop, [0, 0.72, 1], [0.55, 1.2, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const pressScale = interpolate(
    followFrame,
    [clickFrame - 5, clickFrame, clickFrame + 6, disappearFrame],
    [1, 0.78, 1.08, 0.12],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    },
  );
  const plusScale = plusBaseScale * pressScale;
  const plusOpacity = interpolate(followFrame, [disappearFrame - 8, disappearFrame], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const tapRippleScale = interpolate(followFrame, [clickFrame - 2, clickFrame + 13], [0.45, 1.85], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const tapRippleOpacity = interpolate(followFrame, [clickFrame - 2, clickFrame + 13], [0.52, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const tapDotScale = interpolate(followFrame, [clickFrame - 6, clickFrame, clickFrame + 5], [0, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const ringScale = interpolate(frame, [summaryFrames, summaryFrames + 20], [0.88, 1.32], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const ringOpacity = interpolate(frame, [summaryFrames, summaryFrames + 20], [0.42, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        opacity,
        transform: `translateY(${y}px)`,
        padding: '310px 72px 0',
        background:
          'linear-gradient(180deg, rgba(9,10,12,0.98) 0%, rgba(10,11,13,0.99) 48%, rgba(4,4,5,1) 100%)',
        fontFamily: 'PingFang SC, Hiragino Sans GB, Noto Sans CJK SC, Microsoft YaHei, sans-serif',
      }}
    >
      <div style={{opacity: summaryOpacity}}>
        <div style={{fontSize: 32, fontWeight: 900, color: primaryColor, marginBottom: 22}}>RECAP</div>
        <div
          style={{
            color: '#fff',
            fontSize: 76,
            lineHeight: 1.08,
            fontWeight: 950,
            letterSpacing: 0,
            marginBottom: 48,
          }}
        >
          {outro.title || '记住这 3 个关键词'}
        </div>
        <div style={{display: 'grid', gap: 18}}>
          {keywords.map((keyword, index) => (
            <div
              key={`${keyword}-${index}`}
              style={{
                padding: '22px 26px',
                borderRadius: 22,
                background: index === 0 ? rgba(primaryColor, 0.2) : 'rgba(255,255,255,0.09)',
                border: `1px solid ${index === 0 ? rgba(primaryColor, 0.42) : 'rgba(255,255,255,0.14)'}`,
                color: '#fff',
                fontSize: 42,
                fontWeight: 900,
              }}
            >
              <span style={{color: index % 2 ? secondaryColor : primaryColor, marginRight: 16}}>{index + 1}</span>
              {keyword}
            </div>
          ))}
        </div>
      </div>

      {showFollow ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: followOpacity,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            color: '#fff',
            zIndex: 20,
            background:
              `linear-gradient(180deg, rgba(8,9,11,${0.98 * cleanFollowOpacity}) 0%, rgba(10,10,12,${cleanFollowOpacity}) 54%, rgba(3,3,4,${cleanFollowOpacity}) 100%)`,
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              opacity: 0.16 * cleanFollowOpacity,
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.14) 1px, transparent 1px)',
              backgroundSize: '72px 72px',
            }}
          />
          <div style={{position: 'relative', width: 170, height: 196, display: 'flex', justifyContent: 'center'}}>
            <div
              style={{
                position: 'absolute',
                top: -12,
                width: 156,
                height: 156,
                borderRadius: 999,
                border: `3px solid ${primaryColor}`,
                transform: `scale(${ringScale})`,
                opacity: ringOpacity,
              }}
            />
            {manifest.account?.account_logo_url ? (
              <Img
                src={manifest.account.account_logo_url}
                style={{
                  width: 146,
                  height: 146,
                  borderRadius: 999,
                  objectFit: 'cover',
                  border: '4px solid rgba(255,255,255,0.92)',
                  boxShadow: '0 16px 50px rgba(0,0,0,0.35)',
                }}
              />
            ) : (
              <div
                style={{
                  width: 122,
                  height: 122,
                  borderRadius: 999,
                  background: rgba(primaryColor, 0.28),
                  border: '4px solid rgba(255,255,255,0.92)',
                }}
              />
            )}
            <div
              style={{
                position: 'absolute',
                top: 116,
                width: 80,
                height: 80,
                borderRadius: 999,
                border: '4px solid rgba(255,255,255,0.82)',
                transform: `scale(${tapRippleScale})`,
                opacity: tapRippleOpacity,
                boxShadow: '0 0 30px rgba(255,255,255,0.32)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: 116,
                width: 62,
                height: 62,
                borderRadius: 999,
                background: '#FE2C55',
                border: '4px solid #fff',
                transform: `scale(${plusScale})`,
                opacity: plusOpacity,
                color: '#fff',
                fontSize: 48,
                lineHeight: '50px',
                textAlign: 'center',
                fontWeight: 950,
                boxShadow: '0 12px 34px rgba(254,44,85,0.42)',
              }}
            >
              +
            </div>
            <div
              style={{
                position: 'absolute',
                top: 138,
                width: 22,
                height: 22,
                borderRadius: 999,
                background: 'rgba(255,255,255,0.96)',
                transform: `scale(${tapDotScale})`,
                boxShadow: '0 0 26px rgba(255,255,255,0.72)',
              }}
            />
          </div>
          <div
            style={{
              marginTop: 14,
              fontSize: 42,
              lineHeight: 1.18,
              fontWeight: 950,
              textShadow: '0 4px 18px rgba(0,0,0,0.54)',
            }}
          >
            {manifest.account?.account_name || '关注账号'}
          </div>
          <div style={{marginTop: 12, fontSize: 30, fontWeight: 850, color: 'rgba(255,255,255,0.82)'}}>
            {outro.follow_hint || '点击头像下方 + 关注'}
          </div>
        </div>
      ) : null}

      <div
        style={{
          marginTop: 56,
          color: 'rgba(255,255,255,0.78)',
          fontSize: 34,
          lineHeight: 1.28,
          fontWeight: 800,
          opacity: summaryOpacity,
        }}
      >
        {outro.cta || '先收藏，今晚复盘一次'}
      </div>
    </AbsoluteFill>
  );
};
