import React from "react";
import { Composition, staticFile } from "remotion";
import { getAudioDurationInSeconds } from "@remotion/media-utils";
import { ShortVideo, ShortProps } from "./ShortVideo";
import defaultProps from "../props.example.json";

const FPS = 30;
const PAD = 10; // 各シーンの音声の後ろに足す余白(フレーム)

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Short"
      component={ShortVideo as React.FC<Record<string, unknown>>}
      fps={FPS}
      width={1080}
      height={1920}
      durationInFrames={300} // calculateMetadata で音声から上書きされる(仮値)
      defaultProps={defaultProps as unknown as Record<string, unknown>}
      // 各シーンの長さ ＝ 音声の長さ + 余白 で自動計算し、全体尺も決める
      calculateMetadata={async ({ props }) => {
        const p = props as unknown as ShortProps;
        const scenes = [] as ShortProps["scenes"];
        let total = 0;
        for (const s of p.scenes) {
          const dur = await getAudioDurationInSeconds(staticFile(s.audio));
          const frames = Math.ceil(dur * FPS) + PAD;
          scenes.push({ ...s, durationInFrames: frames });
          total += frames;
        }
        return {
          durationInFrames: Math.max(total, 1),
          props: { ...p, scenes } as unknown as Record<string, unknown>,
        };
      }}
    />
  );
};
