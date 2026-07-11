import React from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  Audio,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/ZenMaruGothic";

const { fontFamily } = loadFont();

/**
 * 1シーン ＝ 背景クリップ(ゆっくりズーム) + 上下グラデ + テロップ(フワッと出る) + そのシーンの音声。
 * telopStyle="paren" は補足トーン(少し小さめ・括弧付き)。
 */
export const Scene: React.FC<{
  video: string;
  audio: string;
  telop: string;
  telopStyle?: "normal" | "paren";
}> = ({ video, audio, telop, telopStyle = "normal" }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // 背景をゆっくり拡大(1.0 → 1.12)。のっぺり感を消す
  const scale = interpolate(frame, [0, durationInFrames], [1.0, 1.12], {
    extrapolateRight: "clamp",
  });

  // テロップを最初の12フレームでフワッとフェードイン+少し上へ
  const appear = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 12 });
  const telopOpacity = interpolate(appear, [0, 1], [0, 1]);
  const telopY = interpolate(appear, [0, 1], [36, 0]);

  const isParen = telopStyle === "paren";

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

      {/* テロップ: 中央〜下、極太フォント・黒フチ */}
      <AbsoluteFill
        style={{
          justifyContent: "flex-end",
          alignItems: "center",
          paddingBottom: isParen ? 380 : 340,
          paddingLeft: 72,
          paddingRight: 72,
        }}
      >
        <div
          style={{
            fontFamily,
            fontWeight: 900,
            fontSize: isParen ? 58 : 78,
            color: "#ffffff",
            textAlign: "center",
            lineHeight: 1.32,
            opacity: telopOpacity,
            transform: `translateY(${telopY}px)`,
            WebkitTextStroke: "9px #000000",
            paintOrder: "stroke fill",
            textShadow: "0 4px 22px rgba(0,0,0,0.6)",
          }}
        >
          {isParen ? `（${telop}）` : telop}
        </div>
      </AbsoluteFill>

      {/* このシーンのナレーション音声(Fish Audio で作った 01.wav 等) */}
      <Audio src={staticFile(audio)} />
    </AbsoluteFill>
  );
};
