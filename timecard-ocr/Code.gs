/**
 * タイムカードOCR システム（100チャレ No.2 / 弁護士・未払給料案件）
 * ------------------------------------------------------------------
 * Driveの「タイムカード＿未処理」フォルダに入れたタイムカード画像を、
 * Gemini Vision で “2回” OCR し、1回目と2回目で食い違ったセルに色を付けて
 * 確認シートに書き出す。事務員さんは色の付いた所だけ確認すればよい。
 *
 *  画像 ─┬→ OCR(1回目) ┐
 *        └→ OCR(2回目) ┴→ 比較 ─ 一致:そのまま / 不一致:🟡 / 読めない:🟥
 *                                          ↓
 *                                  確認シート（人が目視）
 *                                          ↓ VBA（既存・入力欄のみ）
 *                                  「給与第一」へ転記
 *
 * 締め日=25日。カード「N月分」は (N-1)月26日〜N月25日。
 * 26〜31日は前月、1〜25日は当月としてカレンダー実日付で記録する（X案）。
 * 列マッピング（A案）: 出勤打刻→午前IN / 退勤打刻→午後OUT。
 */

const CONFIG = {
  // Gemini モデル。実地では「認識率が一番高い同一モデルで2回」読むのが最良
  //（弱いモデルと突き合わせると誤検知が増えるだけ）。
  //  ・速さ/安さ重視: 'gemini-3.5-flash'（最新Flash・印字数字は十分）
  //  ・精度最優先  : 'gemini-3.1-pro' / 'gemini-2.5-pro'（手書きに強い）
  // 「同一モデル2回でも同じ誤読で一致して隠れる」問題は、下の論理チェックで補う。
  GEMINI_MODEL: 'gemini-3.5-flash',

  // ★上位モデル(Pro)で“全セル”を再チェックする（第三の独立した目）。
  //   色付きだけ再読すると、Flash2回が同じ誤読で一致した所（色が付かない誤り）を
  //   永遠に拾えない。Proで全部読んでFlashの値と食い違う所を炙り出す＝真のエラーチェック。
  //   食い違ったセルは色を付け、メモに「Pro再読: 6:16」を添える（自動上書きはしない）。
  RECHECK_WITH_PRO: true,
  RECHECK_MODEL: 'gemini-3.1-pro',

  // 入口フォルダ（タイムカード＿未処理）
  UNPROCESSED_FOLDER_ID: '1VkjUeNaI4m4iwPMCZlm11uGhqBIMoSeE',
  // 処理が済んだ画像の移動先（空なら移動しない）
  PROCESSED_FOLDER_ID: '',

  // 確認シート（タイムカードOCR）
  CONFIRM_SHEET_ID: '1aoLD-3WAQ8MoO1DMX_y49CObAKka_pxRcPQ_cOmV2l8',
  SHEET_NAME: 'シート1', // ← 実際のシート名に合わせる

  CLOSING_DAY: 25, // 賃金締め日
};

// セルの色
const COLOR_MISMATCH = '#fff3b0'; // 🟡 2回の結果が違う＝要確認
const COLOR_UNREAD   = '#ffc7ce'; // 🟥 読み取れなかった＝要入力
const COLOR_CHECK    = '#ffd9a0'; // 🟧 論理チェックで矛盾＝要確認（一致してても付く）

// 中央値からこの分数以上ズレた打刻は外れ値（誤読の疑い）として色付け。2.5時間。
const OUTLIER_MARGIN_MIN = 150;

/**
 * 確認シートを開いた時にメニューを出す（手動実行用）。
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('タイムカード読み取り')
    .addItem('① 接続テスト', 'selfTest')
    .addItem('② 自動読み取りを設定', 'setup')
    .addItem('今すぐ読み取り', 'processUnprocessedTimecards')
    .addToUi();
}

/**
 * 接続テスト：APIキーと課金が有効か・モデルに繋がるかを確認する。
 * 画像なし・ごく短いリクエストなので費用はほぼゼロ。設置直後の確認に使う。
 */
function selfTest() {
  const ui = (function(){ try { return SpreadsheetApp.getUi(); } catch (e) { return null; } })();
  let msg;
  try {
    const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY が未設定です（プロジェクトの設定→スクリプトプロパティ）');
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/'
              + CONFIG.GEMINI_MODEL + ':generateContent?key=' + apiKey;
    const res = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({ contents: [{ parts: [{ text: '「OK」とだけ返してください' }] }] }),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) {
      throw new Error('APIエラー ' + res.getResponseCode() + '：' + res.getContentText().slice(0, 200));
    }
    msg = '接続OK：APIキー・課金・モデル（' + CONFIG.GEMINI_MODEL + '）は正常です。';
  } catch (e) {
    msg = '接続NG：' + e.message;
  }
  if (ui) ui.alert(msg); else Logger.log(msg);
}

/**
 * 使えるモデル一覧をログに出す（generateContent 対応のものだけ）。
 * RECHECK_MODEL や GEMINI_MODEL に指定できる正しいモデル名を確認するのに使う。
 */
function listModels() {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  const res = UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=' + apiKey,
    { muteHttpExceptions: true });
  const data = JSON.parse(res.getContentText());
  (data.models || []).forEach(function(m) {
    if ((m.supportedGenerationMethods || []).indexOf('generateContent') >= 0) {
      Logger.log(m.name); // 例: models/gemini-2.5-pro
    }
  });
}

/**
 * 初回セットアップ：自動実行トリガー（10分ごと）を登録する。
 * 設置時に一度だけ実行すればOK（以後は写真を入れるだけで自動処理される）。
 */
function setup() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'processUnprocessedTimecards') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processUnprocessedTimecards')
           .timeBased().everyMinutes(10).create();
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast('自動読み取りを設定しました（10分ごと）');
  } catch (e) {}
}

/**
 * 引き渡し前クリーンアップ：APIキー（スクリプトプロパティ）と自動実行トリガーを削除。
 * 自分のアカウントで動作確認した後にこれを実行してから渡せば、
 * こちらの鍵・課金・自動実行が相手側に残らない（残骸ゼロで引き渡せる）。
 * 受け取った側は自分のキーを登録し setup() を実行すれば使えます。
 */
function clearSecretsForHandoff() {
  PropertiesService.getScriptProperties().deleteProperty('GEMINI_API_KEY');
  ScriptApp.getProjectTriggers().forEach(function(t) { ScriptApp.deleteTrigger(t); });
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast('APIキーと自動実行を削除しました（引き渡し可）');
  } catch (e) {}
}

/**
 * メイン：未処理フォルダの画像を全部処理して確認シートに追記する。
 * トリガーで自動実行 or メニュー「今すぐ読み取り」から手動実行。
 */
function processUnprocessedTimecards() {
  const folder = DriveApp.getFolderById(CONFIG.UNPROCESSED_FOLDER_ID);
  const it = folder.getFiles();
  const sheet = SpreadsheetApp.openById(CONFIG.CONFIRM_SHEET_ID)
                              .getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) throw new Error('シートが見つかりません: ' + CONFIG.SHEET_NAME);

  let processed = 0;
  while (it.hasNext()) {
    const file = it.next();
    const mime = file.getMimeType();

    if (isImageMime_(mime)) {
      if (processOneImage_(file.getBlob(), file.getName(), sheet)) {
        moveProcessed_(file, folder);
        processed++;
      }
    } else if (isZip_(file, mime)) {
      // ZIPは解凍して中の画像を全部処理（先生のデータがZIPで来てもそのままでOK）。
      // 1人=1ZIPの運用に合わせ、ZIP名（拡張子なし）を中の全写真の氏名にする。
      const zipStaff = file.getName().replace(/\.[^.]+$/, '');
      let any = false;
      Utilities.unzip(file.getBlob()).forEach(function(b) {
        const nm = b.getName();
        if (/(^|\/)(__MACOSX|\._)/.test(nm)) return; // macOSのゴミファイル除外
        if (!isImageName_(nm)) return;
        if (processOneImage_(b, baseName_(nm), sheet, zipStaff)) { any = true; processed++; }
      });
      if (any) moveProcessed_(file, folder);
    }
    // それ以外のファイルはスキップ
  }
  Logger.log('完了: ' + processed + '件処理');
}

/** 1枚の画像Blobを処理（OCR2回＋Pro全件再読＋書き込み）。成功でtrue
 *  staffOverride を渡すとそれを氏名にする（ZIP名を全写真の氏名にする等） */
function processOneImage_(blob, name, sheet, staffOverride) {
  try {
    const m = mimeFromName_(name);
    if (m) blob.setContentType(m);
    const staff = staffOverride || extractStaffName_(name);

    // 同一モデルで2回読む（認識率最優先）。温度差で“判読が怪しい所だけ”結果が揺れ、
    // 食い違いとして拾える。同一誤読の隠れは下のPro全件再読＋論理チェックで補う。
    const passA = ocrTimecard_(blob, CONFIG.GEMINI_MODEL, 0.0);
    const passB = ocrTimecard_(blob, CONFIG.GEMINI_MODEL, 0.6);
    const rows = buildRows_(staff, passA, passB);

    // 上位モデルで全件再読し、Flashの値と食い違うセルを炙り出す
    // （再読がコケても主役のFlash結果は残す＝再チェック失敗で全体を止めない）
    if (CONFIG.RECHECK_WITH_PRO) {
      try {
        checkAgainstPro_(rows, ocrTimecard_(blob, CONFIG.RECHECK_MODEL, 0.0));
      } catch (e) {
        Logger.log('Pro再読スキップ（' + CONFIG.RECHECK_MODEL + '）: ' + e.message);
      }
    }
    writeRows_(sheet, rows);
    Logger.log('OK: ' + name + ' (' + rows.length + '日)');
    return true;
  } catch (err) {
    Logger.log('NG: ' + name + ' / ' + err.message);
    return false;
  }
}

/** 処理済みファイルを移動（PROCESSED_FOLDER_ID未設定なら何もしない） */
function moveProcessed_(file, folder) {
  if (!CONFIG.PROCESSED_FOLDER_ID) return;
  DriveApp.getFolderById(CONFIG.PROCESSED_FOLDER_ID).addFile(file);
  folder.removeFile(file);
}

/* --- ファイル種別ヘルパー --- */
function isImageMime_(mime) { return mime === 'image/jpeg' || mime === 'image/png'; }
function isImageName_(name) { return /\.(jpe?g|png)$/i.test(name); }
function isZip_(file, mime) {
  return mime === 'application/zip' || mime === 'application/x-zip-compressed'
      || /\.zip$/i.test(file.getName());
}
function mimeFromName_(name) {
  if (/\.png$/i.test(name)) return 'image/png';
  if (/\.jpe?g$/i.test(name)) return 'image/jpeg';
  return '';
}
function baseName_(path) { return path.replace(/^.*\//, ''); }

/**
 * Gemini に1回OCRさせて、構造化JSONで受け取る。
 */
function ocrTimecard_(blob, model, temperature) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error('スクリプトプロパティ GEMINI_API_KEY が未設定です');

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/'
            + model + ':generateContent?key=' + apiKey;

  const prompt =
    'これは日本のタイムカード（TIME CARD）の写真です。正確に読み取って厳密なJSONで返してください。\n' +
    '【ヘッダ】上部に「令和○年 ○月分」または「20XX年 ○月分」と書かれています。\n' +
    '  - year_western: 西暦（令和○年は 2018+○ で西暦化。例 令和7年=2025）\n' +
    '  - month_label : 「○月分」の月（1〜12の整数）\n' +
    '【各行】日付ごとに「定時 出（出勤）」「定時 退（退勤）」の打刻があります。\n' +
    '  - day      : 日付（1〜31の整数）\n' +
    '  - weekday  : 曜日の漢字1文字（無ければ空文字）\n' +
    '  - in       : 出勤打刻 "H:MM"（24時間制。無ければ null）\n' +
    '  - out      : 退勤打刻 "H:MM"（無ければ null）\n' +
    '  - holiday  : 日付が丸囲み・三角・斜線などで休みを示す場合 true、通常は false\n' +
    '打刻が薄い/判読できない数字は推測せず null にしてください（後で人が確認します）。\n' +
    '出力は次の形だけ:\n' +
    '{"year_western":2025,"month_label":1,"rows":[{"day":26,"weekday":"木","in":"6:16","out":"17:02","holiday":false}]}';

  const payload = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) } }
      ]
    }],
    generationConfig: {
      temperature: temperature,
      responseMimeType: 'application/json'
    }
  };

  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('Gemini API ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
  }
  const json = JSON.parse(res.getContentText());
  const text = json.candidates[0].content.parts[0].text;
  return JSON.parse(text);
}

/**
 * 2回分の結果を突き合わせ、確認シート用の行配列を作る。
 * 各セルは {value, flag} 形式。flag: '' | 'mismatch' | 'unread'
 */
function buildRows_(staff, passA, passB) {
  const year  = passA.year_western || passB.year_western;
  const month = passA.month_label  || passB.month_label;

  const mapA = indexByDay_(passA.rows);
  const mapB = indexByDay_(passB.rows);
  const days = Object.keys(mapA).concat(Object.keys(mapB))
                     .map(Number).filter((v, i, a) => a.indexOf(v) === i)
                     .sort((x, y) => x - y);

  const out = [];
  days.forEach(function(day) {
    const a = mapA[day] || {};
    const b = mapB[day] || {};

    // 休日（打刻なし）は確認シートには出さない（働いた日だけ）
    const aHol = a.holiday, bHol = b.holiday;
    const aIn = norm_(a.in),  bIn = norm_(b.in);
    const aOut = norm_(a.out), bOut = norm_(b.out);
    if ((aHol && bHol) || (!aIn && !aOut && !bIn && !bOut)) return;

    // カレンダー実日付（締め日25・X案）
    const cal = toCalendarDate_(year, month, day);

    const inCell  = reconcile_(aIn, bIn);
    const outCell = reconcile_(aOut, bOut);

    // ★論理チェック（2回が一致していても矛盾を炙り出す）
    // 1) 曜日：カード印字の曜日 vs カレンダー計算の曜日
    const readWd = a.weekday || b.weekday || '';
    const calcWd = calcWeekday_(cal.year, cal.month, cal.day);
    if (readWd && readWd !== calcWd) {        // 日付ズレ・行ズレの疑い
      inCell.flag  = upgrade_(inCell.flag, 'check');
      outCell.flag = upgrade_(outCell.flag, 'check');
    }
    // 2) 出 < 退 でなければ異常
    if (inCell.value && outCell.value && toMin_(inCell.value) >= toMin_(outCell.value)) {
      inCell.flag  = upgrade_(inCell.flag, 'check');
      outCell.flag = upgrade_(outCell.flag, 'check');
    }
    // 3) 外れ値はカード全体の中央値を出してから後段でまとめて判定（下の flagOutliers_）

    out.push({
      staff: staff, year: cal.year, month: cal.month, day: cal.day,
      cardDay: day,    // カード上の日付（Pro再読の突き合わせ用）
      amIn: inCell,    // 午前IN ← 出勤
      pmOut: outCell,  // 午後OUT ← 退勤
    });
  });

  // ★勤務時間は時間帯が集中する → 中央値から大きく外れた打刻は誤読として色付け
  flagOutliers_(out);
  return out;
}

/**
 * 出勤・退勤それぞれの中央値を求め、そこから OUTLIER_MARGIN_MIN 以上外れた値を
 * 'check' で色付け。例: 出勤が毎日6時台なのに1件だけ16時台→桁誤りとして炙り出す。
 */
function flagOutliers_(rows) {
  const medIn  = median_(rows.map(function(r){ return toMin_(r.amIn.value); }).filter(function(m){ return m >= 0; }));
  const medOut = median_(rows.map(function(r){ return toMin_(r.pmOut.value); }).filter(function(m){ return m >= 0; }));
  rows.forEach(function(r) {
    const mi = toMin_(r.amIn.value);
    if (mi >= 0 && medIn  !== null && Math.abs(mi - medIn)  > OUTLIER_MARGIN_MIN)
      r.amIn.flag  = upgrade_(r.amIn.flag, 'check');
    const mo = toMin_(r.pmOut.value);
    if (mo >= 0 && medOut !== null && Math.abs(mo - medOut) > OUTLIER_MARGIN_MIN)
      r.pmOut.flag = upgrade_(r.pmOut.flag, 'check');
  });
}

/** 数値配列の中央値（空なら null） */
function median_(arr) {
  if (!arr.length) return null;
  const s = arr.slice().sort(function(a, b){ return a - b; });
  const m = Math.floor(s.length / 2);
  return (s.length % 2) ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * 上位モデル(Pro)の全件再読と突き合わせ。Flashの値とProが食い違うセルを
 * 'check' で色付けし、メモにProの読みを添える（Flash2回が同じ誤読で一致した
 * “色の付かない誤り”をここで初めて検出できる）。
 */
function checkAgainstPro_(rows, proRead) {
  const map = indexByDay_(proRead.rows);
  rows.forEach(function(r) {
    const p = map[r.cardDay] || {};
    compareCellToPro_(r.amIn,  norm_(p.in));
    compareCellToPro_(r.pmOut, norm_(p.out));
  });
}

function compareCellToPro_(cell, proVal) {
  if (!proVal) return;                 // Proが読めない所は判定材料にしない
  if (cell.value !== proVal) {         // Flashの値とProが食い違う＝要確認
    cell.flag = upgrade_(cell.flag, 'check');
    cell.note = 'Pro再読: ' + proVal;  // 第三の読みをメモに残す
  }
}

/** 1回目/2回目の値を突き合わせて {value, flag} を返す */
function reconcile_(va, vb) {
  if (!va && !vb) return { value: '', flag: 'unread' };       // 両方読めない
  if (!va || !vb) return { value: va || vb, flag: 'mismatch' };// 片方だけ読めた
  if (va !== vb)  return { value: va, flag: 'mismatch' };      // 食い違い
  return { value: va, flag: '' };                             // 一致
}

/** 確認シートに追記（10列）し、不一致/未読セルに色を付ける */
function writeRows_(sheet, rows) {
  if (!rows.length) return;
  const startRow = sheet.getLastRow() + 1;

  const values = rows.map(function(r) {
    return [r.staff, r.year, r.month, r.day,
            r.amIn.value, '', '', r.pmOut.value, '', ''];
  });
  sheet.getRange(startRow, 1, values.length, 10).setValues(values);

  // 色付け＋Pro再読メモ（E列=午前IN=5, H列=午後OUT=8）
  rows.forEach(function(r, i) {
    const row = startRow + i;
    paintCell_(sheet, row, 5, r.amIn.flag);
    paintCell_(sheet, row, 8, r.pmOut.flag);
    if (r.amIn.note)  sheet.getRange(row, 5).setNote(r.amIn.note);
    if (r.pmOut.note) sheet.getRange(row, 8).setNote(r.pmOut.note);
  });
}

function paintCell_(sheet, row, col, flag) {
  if (flag === 'unread')        sheet.getRange(row, col).setBackground(COLOR_UNREAD);
  else if (flag === 'mismatch') sheet.getRange(row, col).setBackground(COLOR_MISMATCH);
  else if (flag === 'check')    sheet.getRange(row, col).setBackground(COLOR_CHECK);
}

/** フラグの強さ: '' < check < mismatch < unread（強い方を残す） */
function upgrade_(cur, next) {
  const rank = { '': 0, 'check': 1, 'mismatch': 2, 'unread': 3 };
  return (rank[next] > rank[cur]) ? next : cur;
}

/** 年月日から曜日漢字を返す */
function calcWeekday_(y, m, d) {
  return ['日','月','火','水','木','金','土'][new Date(y, m - 1, d).getDay()];
}

/** "6:16" → 分（376）。空は -1 */
function toMin_(t) {
  const m = String(t).match(/^(\d{1,2}):(\d{2})$/);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : -1;
}


/* ---------- ヘルパー ---------- */

/** 締め日25・X案で (年,月,日) をカレンダー実日付に変換 */
function toCalendarDate_(year, month, day) {
  if (day >= 26) { // 前月扱い
    if (month === 1) return { year: year - 1, month: 12, day: day };
    return { year: year, month: month - 1, day: day };
  }
  return { year: year, month: month, day: day };
}

function indexByDay_(rows) {
  const m = {};
  (rows || []).forEach(function(r) { if (r && r.day) m[r.day] = r; });
  return m;
}

/** "6:16" / "06:16" / "6時16分" などを "6:16" に正規化。空は '' */
function norm_(t) {
  if (!t) return '';
  const s = String(t).replace(/[^0-9:：]/g, '').replace('：', ':');
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return '';
  return parseInt(m[1], 10) + ':' + m[2];
}

/** ファイル名から氏名を取り出す（"2025-01_田中太郎.jpg" → "田中太郎"。無ければ拡張子抜き） */
function extractStaffName_(filename) {
  const base = filename.replace(/\.[^.]+$/, '');
  const m = base.match(/_(.+)$/);
  return m ? m[1] : base;
}
