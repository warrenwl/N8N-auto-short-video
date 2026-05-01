import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';

type Props = {
  primaryColor: string;
};

export const ProgressBar: React.FC<Props> = ({primaryColor}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const width = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{justifyContent: 'flex-end'}}>
      <div style={{height: 5, background: 'rgba(255,255,255,0.1)'}}>
        <div
          style={{
            width: `${width * 100}%`,
            height: '100%',
            background: primaryColor,
            boxShadow: `0 0 16px ${primaryColor}`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
