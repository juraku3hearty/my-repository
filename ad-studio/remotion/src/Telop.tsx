import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import { TELOP_FONT } from "./font";

const fontFamily = `${TELOP_FONT}, sans-serif`;

// 極太の黒フチ(多方向シャドウ)。縦動画っぽい"読める強い文字"にする
const STROKE = [
  "-3px -3px 0 #000",
  "3px -3px 0 #000",
  "-3px 3px 0 #000",
  "3px 3px 0 #000",
  "-4px 0 0 #000",
  "4px 0 0 #000",
  "0 -4px 0 #000",
  "0 4px 0 #000",
  "0 6px 16px rgba(0,0,0,0.5)",
].join(", ");

/**
 * 画面下・中央寄せの極太テロップ。
 * text に \n を入れると行に分かれ、1行ずつ少し遅れてポップイン(縦動画っぽさ)。
 * colors で行ごとに色を変えられる(強調したい語を含む行だけ赤/金など)。
 * telopStyle: "normal" / "paren"(補足) / "title"(大きめ)。
 * Sequence の中で使うと、その頭からアニメが始まる＝音声に合わせて出せる。
 */
export const Telop: React.FC<{
  text: string;
  telopStyle?: "normal" | "paren" | "title";
  colors?: string[]; // 行ごとの色。省略や不足分は白
  place?: "low" | "mid"; // mid=真ん中やや下(広告CTAと被らない) / low=下(QR等を避けたい時)
}> = ({ text, telopStyle = "normal", colors, place = "mid" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const isParen = telopStyle === "paren";
  const isTitle = telopStyle === "title";
  const lines = text.split("\n");

  // 下からの位置。mid=画面下から約700px(≒真ん中やや下)。low=下寄り
  const padBottom = place === "low" ? (isParen ? 360 : 300) : 720;

  const baseSize = (line: string) => {
    if (isTitle) return line.length <= 6 ? 96 : 78;
    if (isParen) return 54;
    return line.length <= 8 ? 78 : line.length <= 11 ? 68 : 58;
  };

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: padBottom,
        paddingLeft: 64,
        paddingRight: 64,
      }}
    >
      <div style={{ textAlign: "center" }}>
        {lines.map((line, i) => {
          // 1行ずつ 4フレームずらしてフワッと上へ
          const s = spring({
            frame: frame - i * 4,
            fps,
            from: 0,
            to: 1,
            durationInFrames: 12,
            config: { damping: 200 },
          });
          const opacity = interpolate(s, [0, 1], [0, 1]);
          const y = interpolate(s, [0, 1], [34, 0]);
          const shown = isParen
            ? i === 0
              ? `（${line}`
              : i === lines.length - 1
                ? `${line}）`
                : line
            : line;
          return (
            <div
              key={i}
              style={{
                fontFamily,
                fontWeight: 900,
                fontSize: baseSize(line),
                lineHeight: 1.3,
                letterSpacing: 1,
                color: colors?.[i] || "#ffffff",
                textShadow: STROKE,
                opacity,
                transform: `translateY(${y}px)`,
              }}
            >
              {shown}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
