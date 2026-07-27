import React from 'react';
import { Composition } from 'remotion';
import { GamingLoop } from './GamingLoop';
import { FPS, TOTAL_FRAMES } from './theme';

export const RemotionRoot: React.FC = () => (
    <>
        <Composition
            id="GamingLoop"
            component={GamingLoop}
            durationInFrames={TOTAL_FRAMES}
            fps={FPS}
            width={1920}
            height={1080}
        />
    </>
);
