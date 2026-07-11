import React from "react";
import {
  AbsoluteFill,
  Audio,
  Series,
  Sequence,
  staticFile,
  useVideoConfig,
  useCurrentFrame,
  interpolate,
} from "remotion";
import { Scene } from "./Scene";
import { Telop } from "./Telop";

export type SceneProps = {
  video: string; // 例: "bg/01.mp4"(AIフックや実写)
  audio?: string; // 例: "audio/01.wav"(Fish Audioのナレーション)。連続VO時は省略
  telop?: string; // シーンに直接持たせる場合。captions を使う時は省略
  telopStyle?: "normal" | "paren";
  durationInFrames: number; // Root.tsx が音声の長さから自動計算して入れる
};

/** 時刻同期テロップ。音声に合わせて出す(シーンの切れ目とは独立) */
export type CaptionProps = {
  text: string; // \n で改行可(言葉をぶった切らない)
  telopStyle?: "normal" | "paren" | "title";
  colors?: string[]; // 行ごとの色(強調語のある行だけ赤/金など)
  fromFrame: number; // 出る開始フレーム
  durationInFrames: number; // 出してる長さ(フレーム)
};

export type ShortProps = {
  accountName: string;
  bgm?: string; // 例: "bgm/track.mp3"
  bgmVolume?: number;
  voiceover?: string; // 全編1本の連続ナレーション(既存動画の音声を丸ごと流す等)
  voiceoverVolume?: number;
  scenes: SceneProps[];
  captions?: CaptionProps[]; // これがあれば音声同期テロップを上に重ねる
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
  captions,
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

      {/* 音声同期テロップ: 実際に喋ってる言葉・タイミングで出す(シーンとは独立) */}
      {captions?.map((c, i) => (
        <Sequence key={i} from={c.fromFrame} durationInFrames={c.durationInFrames}>
          <Telop text={c.text} telopStyle={c.telopStyle} colors={c.colors} />
        </Sequence>
      ))}

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
