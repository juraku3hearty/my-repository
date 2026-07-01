import { config } from './config.js';

/** LINEに完成/失敗を通知(未設定なら何もしない) */
export async function notifyLine(text) {
  if (!config.line.token || !config.line.userId) return;
  try {
    await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.line.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: config.line.userId,
        messages: [{ type: 'text', text }],
      }),
    });
  } catch (err) {
    console.error('LINE通知失敗(処理は継続):', err.message);
  }
}
