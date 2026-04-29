import React from 'react';
import {Img, interpolate, useCurrentFrame} from 'remotion';
import type {AccountBrand, RemotionVisualConfig} from '../types';

type Props = {
  account?: AccountBrand;
  visualConfig: RemotionVisualConfig;
};

export const BrandBadge: React.FC<Props> = ({account, visualConfig}) => {
  const frame = useCurrentFrame();
  const brand = visualConfig.brand || {};
  const enabled = brand.enabled !== false && Boolean(account?.account_name || account?.account_logo_url);
  const opacity = interpolate(frame, [0, 14], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const position = brand.position || 'top-center';

  if (!enabled) {
    return null;
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 44,
        left: position === 'top-left' ? 54 : undefined,
        ...(position === 'top-center'
          ? {
              left: '50%',
              transform: 'translateX(-50%)',
            }
          : {}),
        right: position === 'top-right' ? 54 : undefined,
        opacity,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '9px 14px 9px 10px',
        borderRadius: 999,
        background: 'rgba(0,0,0,0.36)',
        border: '1px solid rgba(255,255,255,0.16)',
        boxShadow: '0 12px 32px rgba(0,0,0,0.22)',
        fontFamily: 'PingFang SC, Hiragino Sans GB, Noto Sans CJK SC, Microsoft YaHei, sans-serif',
      }}
    >
      {brand.show_avatar === false || !account?.account_logo_url ? null : (
        <Img
          src={account.account_logo_url}
          style={{
            width: 44,
            height: 44,
            borderRadius: 999,
            objectFit: 'cover',
            border: '2px solid rgba(255,255,255,0.72)',
          }}
        />
      )}
      {brand.show_name === false || !account?.account_name ? null : (
        <div
          style={{
            color: '#fff',
            fontSize: 24,
            lineHeight: 1,
            fontWeight: 900,
            textShadow: '0 2px 10px rgba(0,0,0,0.55)',
          }}
        >
          {account.account_name}
        </div>
      )}
    </div>
  );
};
