import React from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  Audio,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from "remotion";
import { Telop } from "./Telop";

/**
 * 1シーン ＝ 背景クリップ(ゆっくりズーム) + 上下グラデ + (任意)テロップ + (任意)そのシーンの音声。
 * telop を省略すると背景だけ(テロップは上のレイヤーで時刻同期して出す時に使う)。
 */
export const Scene: React.FC<{
  video: string;
  audio?: string; // シーンごとの音声。連続VO(ShortVideo側で一括再生)の時は省略
  telop?: string; // 省略時はテロップ無し(背景のみ)
  telopStyle?: "normal" | "paren";
}> = ({ video, audio, telop, telopStyle = "normal" }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // 背景をゆっくり拡大(1.0 → 1.12)。のっぺり感を消す
  const scale = interpolate(frame, [0, durationInFrames], [1.0, 1.12], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      {/* 背景動画: 全画面cover + ゆっくりズーム */}
      <AbsoluteFill style={{ transform: `scale(${scale})` }}>
        <OffthreadVideo
          src={staticFile(video)}
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>

      {/* 上下の暗転グラデ(文字を読みやすくする) */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 28%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.8) 100%)",
        }}
      />

      {/* テロップ(このシーンに直接持たせる場合) */}
      {telop ? <Telop text={telop} telopStyle={telopStyle} /> : null}

      {/* このシーンのナレーション音声(Fish Audio で作った 01.wav 等)。連続VO時は無し */}
      {audio ? <Audio src={staticFile(audio)} /> : null}
    </AbsoluteFill>
  );
};
