/**
 * 音声プロバイダのレジストリ。
 * 乗り換えたくなったら新しいファイルを作って registry に1行足すだけ。
 * インターフェース: synthesize({ text, voiceId }) => Promise<{ filePath, chars }>
 */
import { config } from '../../config.js';
import * as fishaudio from './fishaudio.js';

const registry = {
  fishaudio,
};

export function getVoiceProvider() {
  const p = registry[config.voiceProvider];
  if (!p) {
    throw new Error(
      `音声プロバイダ '${config.voiceProvider}' は未登録です。候補: ${Object.keys(registry).join(', ')}`,
    );
  }
  return p;
}
