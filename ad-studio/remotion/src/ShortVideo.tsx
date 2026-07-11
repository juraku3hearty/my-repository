import React from "react";
import {
  AbsoluteFill,
  Audio,
  Series,
  staticFile,
  useVideoConfig,
  useCurrentFrame,
  interpolate,
} from "remotion";
import { Scene } from "./Scene";

export type SceneProps = {
  video: string; // 例: "bg/01.mp4"(AIフックや実写)
  audio?: string; // 例: "audio/01.wav"(Fish Audioのナレーション)。連続VO時は省略
  telop: string;
  telopStyle?: "normal" | "paren";
  durationInFrames: number; // Root.tsx が音声の長さから自動計算して入れる
};

export type ShortProps = {
  accountName: string;
  bgm?: string; // 例: "bgm/track.mp3"
  bgmVolume?: number;
  voiceover?: string; // 全編1本の連続ナレーション(既存動画の音声を丸ごと流す等)
  voiceoverVolume?: number;
  scenes: SceneProps[];
};

/** BGM: 全体にループで敷き、最初と最後をフェードイン/アウト */
const Bgm: React.FC<{ src: string; volume: number }> = ({ src, volume }) => {
  const { durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();
  const fade = interpolate(
    frame,
    [0, 20, durationInFrames - 30, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  return <Audio src={staticFile(src)} loop volume={volume * fade} />;
};

/** 全シーンを順につなぎ、BGMとアカウント名を重ねる */
export const ShortVideo: React.FC<ShortProps> = ({
  accountName,
  bgm,
  bgmVolume = 0.12,
  voiceover,
  voiceoverVolume = 1,
  scenes,
}) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <Series>
        {scenes.map((s, i) => (
          <Series.Sequence key={i} durationInFrames={s.durationInFrames}>
            <Scene
              video={s.video}
              audio={s.audio}
              telop={s.telop}
              telopStyle={s.telopStyle}
            />
          </Series.Sequence>
        ))}
      </Series>

      {/* 全編1本の連続ナレーション(シーンで割らない=BGMや息継ぎが途切れない) */}
      {voiceover ? (
        <Audio src={staticFile(voiceover)} volume={voiceoverVolume} />
      ) : null}

      {bgm ? <Bgm src={bgm} volume={bgmVolume} /> : null}

      {/* 画面上部に薄くアカウント名 */}
      <AbsoluteFill
        style={{
          justifyContent: "flex-start",
          alignItems: "center",
          paddingTop: 64,
        }}
      >
        <div
          style={{
            color: "rgba(255,255,255,0.5)",
            fontSize: 34,
            fontWeight: 700,
            letterSpacing: 1,
          }}
        >
          {accountName}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
