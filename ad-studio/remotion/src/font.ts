import { staticFile, delayRender, continueRender } from "remotion";

/**
 * テロップ用フォントをローカル(public/fonts/)から読み込む。
 * Google Fontsに取りに行かないので、オフラインでも・どのMacでも同じ結果になる。
 * 太さは実質1ウェイトなので、極太感は Scene.tsx 側の黒フチ(WebkitTextStroke)で出す。
 * 別のフォントにしたい時は public/fonts/jp-gothic.ttf を差し替えるだけ。
 */
export const TELOP_FONT = "JP Gothic Local";

const handle = delayRender("Loading telop font");
const font = new FontFace(
  TELOP_FONT,
  `url(${staticFile("fonts/jp-gothic.ttf")}) format('truetype')`
);
font
  .load()
  .then(() => {
    document.fonts.add(font);
    continueRender(handle);
  })
  .catch((err) => {
    // 読み込めなくてもレンダリングは止めない(sans-serifで代替)
    console.error("font load failed", err);
    continueRender(handle);
  });
