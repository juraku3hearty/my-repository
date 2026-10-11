/**
 * 04_Draft.gs — 下書き状態の保持
 *
 * LINE は画像とテキストを別メッセージで送ってくるため、
 * 揃うまでユーザー単位で保持する必要がある。
 */

function draftKey_(userId) {
  return 'draft_' + userId;
}

/** 下書きを取得する。期限切れなら空の下書きを返す */
function getDraft_(userId) {
  var raw = PropertiesService.getScriptProperties().getProperty(draftKey_(userId));
  if (!raw) return {};

  var draft;
  try {
    draft = JSON.parse(raw);
  } catch (_) {
    return {};
  }

  var ageMs = Date.now() - (draft.updatedAt || 0);
  if (ageMs > CONFIG.DRAFT_TTL_HOURS * 3600 * 1000) {
    clearDraft_(userId);
    return {};
  }
  return draft;
}

function saveDraft_(userId, draft) {
  draft.updatedAt = Date.now();
  PropertiesService.getScriptProperties()
    .setProperty(draftKey_(userId), JSON.stringify(draft));
}

function clearDraft_(userId) {
  PropertiesService.getScriptProperties().deleteProperty(draftKey_(userId));
}

/** 下書きの中身を人が読める形にする */
function describeDraft_(draft) {
  if (!draft || (!draft.text && !draft.imageUrl && !draft.dateStr)) {
    return '下書きはありません。';
  }
  var lines = ['📋 現在の下書き', ''];
  lines.push('投稿日: ' + (draft.dateStr || '（未指定・自動割り当て）'));
  lines.push('画像: ' + (draft.imageUrl ? 'あり（' + (draft.imageInfo || '') + '）' : 'なし'));
  lines.push('投稿文: ' + (draft.text ? draft.text.length + '文字' : 'なし'));
  if (draft.text) {
    lines.push('');
    lines.push('--- 本文 ---');
    lines.push(truncate_(draft.text, 600));
  }
  if (draft.imageUrl) {
    lines.push('');
    lines.push(draft.imageUrl);
  }
  return lines.join('\n');
}
