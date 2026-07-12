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
  spring,
} from "remotion";
import { Scene } from "./Scene";
import { Telop } from "./Telop";
import { TELOP_FONT } from "./font";

export type SceneProps = {
  video: string; // 例: "bg/01.mp4"(AIフックや実写)
  audio?: string; // 例: "audio/01.wav"(Fish Audioのナレーション)。連続VO時は省略
  telop?: string; // シーンに直接持たせる場合。captions を使う時は省略
  telopStyle?: "normal" | "paren";
  raw?: boolean; // 完成デザイン(締めカード等)をそのまま出す
  noBanner?: boolean; // 上の帯を出さない(焼き込みラベル=施術前/後 と干渉する区間)
  durationInFrames: number; // Root.tsx が音声の長さから自動計算して入れる
};

/** 時刻同期テロップ。音声に合わせて出す(シーンの切れ目とは独立) */
export type CaptionProps = {
  text: string; // \n で改行可(言葉をぶった切らない)
  telopStyle?: "normal" | "paren" | "title";
  colors?: string[]; // 行ごとの色(強調語のある行だけ赤/金など)
  place?: "low" | "mid"; // 縦位置。既定mid(真ん中やや下=Meta広告CTAと被らない)
  fromFrame: number; // 出る開始フレーム
  durationInFrames: number; // 出してる長さ(フレーム)
};

/** 常時出す価格オファーの"セール札"(左上) */
export type OfferItem = {
  label: string; // 例: "カウンセリング"
  was: string; // 元値 例: "5,500円"(取り消し線)
  now: string; // 特別価格 例: "無料"(大きく赤)
};
export type OfferProps = {
  tag?: string; // 煽りタグ 例: "＼今だけ／体験会限定"
  items: OfferItem[];
  highlight?: string; // 例: "実質11,000円お得！"(黄色・脈打つ)
  note?: string; // 補足 例: "＼今だけの体験価格／"
};

export type ShortProps = {
  accountName: string;
  topBanner?: string; // 上に常時出す帯の文言(キャンペーン告知等)。無ければ accountName
  offer?: OfferProps; // 価格オファーを左上に常時表示(あれば上帯は出さない)
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

/** 価格オファーのセール札(左上・登場でスタンプ→常時わずかに脈打つ) */
const OfferPanel: React.FC<{ offer: OfferProps }> = ({ offer }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const font = `${TELOP_FONT}, sans-serif`;
  const stamp = spring({ frame, fps, from: 0, to: 1, durationInFrames: 14, config: { damping: 12, stiffness: 220 } });
  const appear = interpolate(stamp, [0, 1], [0.7, 1]);
  const pulse = 1 + 0.045 * Math.sin(frame / 7); // ゆっくり脈打つ
  const stroke = [
    "-2px -2px 0 #000", "2px -2px 0 #000",
    "-2px 2px 0 #000", "2px 2px 0 #000",
    "0 3px 12px rgba(0,0,0,0.5)",
  ].join(", ");
  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "flex-start", padding: "140px 0 0 30px" }}>
      <div
        style={{
          transform: `scale(${appear})`,
          transformOrigin: "top left",
          background: "rgba(12,12,14,0.66)",
          border: "3px solid #ffd23b",
          borderRadius: 22,
          padding: "16px 22px 20px",
          display: "inline-flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 8,
        }}
      >
        {offer.tag ? (
          <div style={{ fontFamily: font, background: "#ff3b3b", color: "#fff", fontSize: 30, fontWeight: 900, padding: "5px 16px", borderRadius: 10, letterSpacing: 1 }}>
            {offer.tag}
          </div>
        ) : null}
        {offer.items.map((it, i) => (
          <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 10, fontFamily: font }}>
            <span style={{ color: "#fff", fontSize: 30, fontWeight: 900, textShadow: stroke }}>{it.label}</span>
            <span style={{ color: "#cfcfcf", fontSize: 30, fontWeight: 700, textDecoration: "line-through", textDecorationColor: "#ff3b3b" }}>{it.was}</span>
            <span style={{ color: "#fff", fontSize: 30, fontWeight: 900 }}>→</span>
            <span style={{ color: "#ff4141", fontSize: 46, fontWeight: 900, textShadow: stroke }}>{it.now}</span>
          </div>
        ))}
        {offer.highlight ? (
          <div style={{ transform: `scale(${pulse})`, transformOrigin: "left center", fontFamily: font, color: "#ffd23b", fontSize: 52, fontWeight: 900, letterSpacing: 1, marginTop: 2, textShadow: stroke }}>
            {offer.highlight}
          </div>
        ) : null}
        {offer.note ? (
          <div style={{ fontFamily: font, color: "#fff", fontSize: 26, fontWeight: 700, textShadow: stroke }}>{offer.note}</div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

/** 全シーンを順につなぎ、BGMとアカウント名を重ねる */
export const ShortVideo: React.FC<ShortProps> = ({
  accountName,
  topBanner,
  offer,
  bgm,
  bgmVolume = 0.12,
  voiceover,
  voiceoverVolume = 1,
  scenes,
  captions,
}) => {
  const bannerText = topBanner || accountName;
  // 上の帯を出す区間 = raw(締めカード)でも noBanner(施術前/後)でもないシーン
  const bannerRanges: { from: number; dur: number }[] = [];
  // 価格オファーを出す区間 = raw(締めカード)以外を連続したブロックにまとめる(登場スタンプが1回で済む)
  const offerRanges: { from: number; dur: number }[] = [];
  {
    let off = 0;
    let cur: { from: number; dur: number } | null = null;
    for (const s of scenes) {
      if (!s.raw && !s.noBanner) bannerRanges.push({ from: off, dur: s.durationInFrames });
      if (!s.raw) {
        if (cur) cur.dur += s.durationInFrames;
        else cur = { from: off, dur: s.durationInFrames };
      } else if (cur) {
        offerRanges.push(cur);
        cur = null;
      }
      off += s.durationInFrames;
    }
    if (cur) offerRanges.push(cur);
  }
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
              raw={s.raw}
            />
          </Series.Sequence>
        ))}
      </Series>

      {/* 音声同期テロップ: 実際に喋ってる言葉・タイミングで出す(シーンとは独立) */}
      {captions?.map((c, i) => (
        <Sequence key={i} from={c.fromFrame} durationInFrames={c.durationInFrames}>
          <Telop text={c.text} telopStyle={c.telopStyle} colors={c.colors} place={c.place} />
        </Sequence>
      ))}

      {/* 全編1本の連続ナレーション(シーンで割らない=BGMや息継ぎが途切れない) */}
      {voiceover ? (
        <Audio src={staticFile(voiceover)} volume={voiceoverVolume} />
      ) : null}

      {bgm ? <Bgm src={bgm} volume={bgmVolume} /> : null}

      {/* 価格オファー(左上・常時)。締めカード以外ずっと出す。焼き込みラベルは上中央なので左上は被らない */}
      {offer &&
        offerRanges.map((r, i) => (
          <Sequence key={`of${i}`} from={r.from} durationInFrames={r.dur}>
            <OfferPanel offer={offer} />
          </Sequence>
        ))}

      {/* 上部の帯(キャンペーン告知/院名)。オファー表示時は出さない。施術前後の焼き込みラベルと締めカードでは非表示 */}
      {!offer &&
        bannerRanges.map((r, i) => (
        <Sequence key={i} from={r.from} durationInFrames={r.dur}>
          <AbsoluteFill
            style={{
              justifyContent: "flex-start",
              alignItems: "center",
              paddingTop: 56,
            }}
          >
            <div
              style={{
                fontFamily: `${TELOP_FONT}, sans-serif`,
                color: "#ffffff",
                fontSize: 40,
                fontWeight: 900,
                letterSpacing: 2,
                padding: "12px 30px",
                borderRadius: 999,
                background: "rgba(6,90,60,0.72)",
                // どんな明るい背景でも読めるよう黒フチ+影(モヤっと消えない)
                textShadow: [
                  "-2px -2px 0 #000", "2px -2px 0 #000",
                  "-2px 2px 0 #000", "2px 2px 0 #000",
                  "0 3px 12px rgba(0,0,0,0.5)",
                ].join(", "),
              }}
            >
              {bannerText}
            </div>
          </AbsoluteFill>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
