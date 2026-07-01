/**
 * 動画生成プロバイダのレジストリ。
 * Higgsfield をやめたくなったら新アダプタを1ファイル作って registry に足すだけ。
 * インターフェース:
 *   generate({ prompt, durationSec, aspectRatio }) => Promise<{ filePath | null, note }>
 *     filePath: 生成された動画のローカルパス。manual運用等で即時生成できない場合は null。
 */
import { config } from '../../config.js';
import * as higgsfield from './higgsfield.js';
import * as manual from './manual.js';

const registry = {
  higgsfield,
  manual,
};

export function getVideoProvider() {
  const p = registry[config.videoProvider];
  if (!p) {
    throw new Error(
      `動画プロバイダ '${config.videoProvider}' は未登録です。候補: ${Object.keys(registry).join(', ')}`,
    );
  }
  return p;
}
