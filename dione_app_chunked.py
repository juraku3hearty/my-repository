from flask import Flask, request, jsonify
import os, threading, pickle, time, shutil, smtplib, requests as req
from email.mime.text import MIMEText
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

app = Flask(__name__, static_folder='/root/upload/static')
# 1リクエスト = 1チャンクだけなので上限を大幅に下げられる
app.config['MAX_CONTENT_LENGTH'] = 64 * 1024 * 1024

UPLOAD_DIR = '/root/youtube/tmp'
CHUNK_DIR = '/root/youtube/chunks'
TOKEN_FILE = '/root/youtube/token.pickle'
NOTIFY_EMAIL = os.environ.get('NOTIFY_EMAIL', '')
GMAIL_USER = os.environ.get('GMAIL_USER', '')
GMAIL_PASS = os.environ.get('GMAIL_PASS', '')
LINE_TOKEN = os.environ.get('LINE_CHANNEL_ACCESS_TOKEN', '')
LINE_GROUP_ID = os.environ.get('LINE_GROUP_ID', '')
PLAYLIST_ID = os.environ.get('YOUTUBE_PLAYLIST_ID', '')

CHUNK_TTL = 24 * 3600


def get_creds():
    with open(TOKEN_FILE, 'rb') as f:
        creds = pickle.load(f)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        with open(TOKEN_FILE, 'wb') as f:
            pickle.dump(creds, f)
    return creds


PENDING_FILE = '/root/upload/pending_line.json'


def _push_line(text):
    req.post('https://api.line.me/v2/bot/message/push',
             headers={'Authorization': f'Bearer {LINE_TOKEN}', 'Content-Type': 'application/json'},
             json={'to': LINE_GROUP_ID, 'messages': [{'type': 'text', 'text': text}]})


def send_line(message):
    if not LINE_GROUP_ID:
        print("LINE GROUP ID未設定")
        return
    import datetime, json as _json
    if 0 <= datetime.datetime.now().hour < 7:
        pending = []
        if os.path.exists(PENDING_FILE):
            with open(PENDING_FILE) as f:
                pending = _json.load(f)
        pending.append(message)
        with open(PENDING_FILE, 'w') as f:
            _json.dump(pending, f)
        print(f'深夜のため保留: {message}')
        return
    # 深夜に保留した分が残っていれば先に送る
    if os.path.exists(PENDING_FILE):
        try:
            with open(PENDING_FILE) as f:
                for m in _json.load(f):
                    _push_line(m)
                    print(f'保留分を送信: {m}')
            os.remove(PENDING_FILE)
        except Exception as e:
            print(f'保留分の送信失敗: {e}')
    _push_line(message)


def send_error(title, err):
    if not GMAIL_USER:
        print(f"エラー通知（メール未設定）: {err}")
        return
    try:
        msg = MIMEText(f"動画「{title}」のアップロードに失敗しました。\n\nエラー: {err}")
        msg['Subject'] = f'【エラー】YouTube upload失敗: {title}'
        msg['From'] = GMAIL_USER
        msg['To'] = NOTIFY_EMAIL
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as s:
            s.login(GMAIL_USER, GMAIL_PASS)
            s.send_message(msg)
    except Exception as e:
        print(f"メール送信失敗: {e}")


def do_upload(file_path, title):
    try:
        creds = get_creds()
        yt = build('youtube', 'v3', credentials=creds)
        media = MediaFileUpload(file_path, resumable=True, chunksize=10 * 1024 * 1024)
        r = yt.videos().insert(
            part='snippet,status',
            body={
                'snippet': {'title': title, 'categoryId': '17'},
                'status': {'privacyStatus': 'unlisted'}
            },
            media_body=media
        )
        resp = None
        while resp is None:
            status, resp = r.next_chunk()
            if status:
                print(f"  {int(status.progress()*100)}%")
        vid = resp['id']
        url = f"https://youtu.be/{vid}"
        print(f"完了: {url}")
        try:
            yt.playlistItems().insert(part="snippet", body={"snippet": {"playlistId": PLAYLIST_ID, "resourceId": {"kind": "youtube#video", "videoId": vid}}}).execute()
            print("再生リスト追加完了")
        except Exception as pe:
            print(f"再生リスト追加失敗: {pe}")
        os.remove(file_path)
        send_line(f"🏐 {title}\n動画がアップされました！\n{url}")
    except Exception as e:
        print(f"アップロードエラー: {e}")
        send_error(title, str(e))


def sweep_stale_chunks():
    if not os.path.isdir(CHUNK_DIR):
        return
    now = time.time()
    for name in os.listdir(CHUNK_DIR):
        d = os.path.join(CHUNK_DIR, name)
        try:
            if os.path.isdir(d) and now - os.path.getmtime(d) > CHUNK_TTL:
                shutil.rmtree(d, ignore_errors=True)
                print(f"古い分割データを削除: {name}")
        except OSError:
            pass


def chunk_dir_for(uid):
    # uidは16進32文字に制限しているのでパストラバーサルは起きない
    return os.path.join(CHUNK_DIR, uid)


def valid_uid(uid):
    return isinstance(uid, str) and len(uid) == 32 and all(c in '0123456789abcdef' for c in uid)


HTML = r"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DIONE VOLLEYBALL TEAM</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#1e3569;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px}
.header{text-align:center;margin-bottom:24px}
.header img{width:110px;height:110px;object-fit:contain;filter:drop-shadow(0 0 12px rgba(255,255,255,0.3))}
.header h1{color:#fff;font-size:20px;letter-spacing:3px;margin-top:10px;font-weight:800}
.header p{color:rgba(255,255,255,0.6);font-size:12px;letter-spacing:2px;margin-top:4px}
.card{background:#fff;border-radius:20px;padding:32px;width:100%;max-width:440px;box-shadow:0 8px 40px rgba(0,0,0,0.3)}
label{display:block;font-size:12px;color:#888;margin-bottom:6px;font-weight:700;letter-spacing:1px;text-transform:uppercase}
input[type=text]{width:100%;padding:13px 14px;border:2px solid #e8e8e8;border-radius:10px;font-size:16px;margin-bottom:20px;transition:border .2s;color:#222}
input[type=text]:focus{outline:none;border-color:#1e3569}
.drop{border:2px dashed #ccd6e8;border-radius:14px;padding:40px 20px;text-align:center;cursor:pointer;margin-bottom:20px;transition:all .2s;background:#f7f9fc}
.drop:hover,.drop.ok{border-color:#1e3569;background:#eef2f9}
.drop-icon{font-size:40px;margin-bottom:10px}
.drop-hint{color:#aaa;font-size:14px}
.drop-name{color:#1e3569;font-weight:700;margin-top:8px;font-size:14px;word-break:break-all}
input[type=file]{display:none}
button{width:100%;padding:16px;background:#1e3569;color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:800;cursor:pointer;letter-spacing:1px;transition:background .2s}
button:hover{background:#162a52}
button:disabled{background:#aaa;cursor:not-allowed}
.prog{display:none;margin-top:20px}
.bar-bg{background:#e8edf5;border-radius:8px;height:8px;overflow:hidden}
.bar{background:#1e3569;height:100%;width:0;transition:width .3s;border-radius:8px}
.bar-txt{text-align:center;font-size:13px;color:#888;margin-top:8px}
.bar-sub{text-align:center;font-size:11px;color:#bbb;margin-top:4px;min-height:14px}
.done{display:none;background:#eef2f9;border:2px solid #1e3569;border-radius:14px;padding:28px;text-align:center}
.done h2{font-size:18px;color:#1e3569;margin-bottom:8px;font-weight:800}
.done p{font-size:13px;color:#555;line-height:1.8}
.err{display:none;background:#fff4f4;border:2px solid #d94040;border-radius:14px;padding:20px;text-align:center;margin-top:16px}
.err p{font-size:13px;color:#a02020;line-height:1.7}
</style>
</head>
<body>
<div class="header">
  <img src="/static/logo.jpg" alt="DIONE">
  <h1>DIONE</h1>
  <p>VOLLEYBALL TEAM</p>
</div>
<div class="card">
  <div id="frm">
    <label>タイトル</label>
    <input type="text" id="ttl" placeholder="例: 4月19日 練習試合">
    <label>動画ファイル</label>
    <div class="drop" id="drop" onclick="document.getElementById('fp').click()">
      <div class="drop-icon">🏐</div>
      <div class="drop-hint">タップして動画を選択</div>
      <div class="drop-name" id="fn"></div>
    </div>
    <input type="file" id="fp" accept="video/*">
    <button id="btn" onclick="go()" disabled>アップロード</button>
    <div class="prog" id="prog">
      <div class="bar-bg"><div class="bar" id="bar"></div></div>
      <div class="bar-txt" id="btxt">送信中...</div>
      <div class="bar-sub" id="bsub"></div>
    </div>
    <div class="err" id="err"><p id="errtxt"></p></div>
  </div>
  <div class="done" id="done">
    <h2>✅ 受け付けました！</h2>
    <p>YouTubeへの処理を開始しました。<br>完了するとLINEに通知が届きます。<br>このページは閉じて大丈夫です。</p>
  </div>
</div>
<script>
const CHUNK = 5 * 1024 * 1024;
const MAX_RETRY = 8;
const fp=document.getElementById('fp'),fn=document.getElementById('fn'),drop=document.getElementById('drop'),
      btn=document.getElementById('btn'),ttl=document.getElementById('ttl'),
      bar=document.getElementById('bar'),btxt=document.getElementById('btxt'),bsub=document.getElementById('bsub'),
      errBox=document.getElementById('err'),errTxt=document.getElementById('errtxt');

fp.addEventListener('change',()=>{
  const f=fp.files[0];if(!f)return;
  fn.textContent=f.name;drop.classList.add('ok');
  if(!ttl.value)ttl.value=f.name.replace(/\.[^/.]+$/,'');
  btn.disabled=false;
});

async function makeUid(f){
  const s=f.name+'|'+f.size+'|'+f.lastModified;
  const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].slice(0,16).map(b=>b.toString(16).padStart(2,'0')).join('');
}

function setProg(done,total){
  const p=Math.round(done/total*100);
  bar.style.width=p+'%';
  btxt.textContent='送信中... '+p+'%';
  bsub.textContent=done+' / '+total+' ブロック';
}

const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function sendChunk(uid,i,blob){
  for(let a=0;a<MAX_RETRY;a++){
    try{
      const fd=new FormData();
      fd.append('uid',uid);fd.append('index',i);fd.append('chunk',blob);
      const r=await fetch('/chunk',{method:'POST',body:fd});
      if(r.ok)return;
    }catch(e){}
    bsub.textContent='通信が不安定です。再送中... ('+(a+1)+'回目)';
    await sleep(Math.min(1000*Math.pow(2,a),15000));
  }
  throw new Error('ブロック '+(i+1)+' を送信できませんでした');
}

async function go(){
  const f=fp.files[0];
  if(!f){alert('動画を選択してください');return;}
  const title=ttl.value||f.name.replace(/\.[^/.]+$/,'');
  btn.disabled=true;
  errBox.style.display='none';
  document.getElementById('prog').style.display='block';
  try{
    const uid=await makeUid(f);
    const total=Math.ceil(f.size/CHUNK);
    let have=[];
    try{
      const s=await fetch('/status?uid='+uid);
      if(s.ok)have=(await s.json()).have||[];
    }catch(e){}
    const haveSet=new Set(have);
    let done=haveSet.size;
    setProg(done,total);
    for(let i=0;i<total;i++){
      if(haveSet.has(i))continue;
      await sendChunk(uid,i,f.slice(i*CHUNK,Math.min((i+1)*CHUNK,f.size)));
      done++;setProg(done,total);
    }
    btxt.textContent='結合中...';bsub.textContent='';
    const c=await fetch('/complete',{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({uid:uid,total:total,title:title,filename:f.name})});
    if(!c.ok)throw new Error('結合に失敗しました');
    document.getElementById('frm').style.display='none';
    document.getElementById('done').style.display='block';
  }catch(e){
    errTxt.textContent=e.message+'\n\nもう一度「アップロード」を押すと、送信済みの続きから再開します。';
    errBox.style.display='block';
    btn.disabled=false;
  }
}
</script>
</body>
</html>"""


@app.route('/')
def index():
    return HTML


@app.route('/status')
def status():
    uid = request.args.get('uid', '')
    if not valid_uid(uid):
        return jsonify({'have': []})
    d = chunk_dir_for(uid)
    if not os.path.isdir(d):
        return jsonify({'have': []})
    have = sorted(int(f[:-5]) for f in os.listdir(d) if f.endswith('.part'))
    return jsonify({'have': have})


@app.route('/chunk', methods=['POST'])
def chunk():
    uid = request.form.get('uid', '')
    idx = request.form.get('index', '')
    if not valid_uid(uid) or not idx.isdigit():
        return jsonify({'error': 'bad params'}), 400
    if 'chunk' not in request.files:
        return jsonify({'error': 'no chunk'}), 400
    d = chunk_dir_for(uid)
    os.makedirs(d, exist_ok=True)
    part = os.path.join(d, f"{int(idx):06d}.part")
    if os.path.exists(part):
        return jsonify({'status': 'skip'})
    tmp = part + '.tmp'
    request.files['chunk'].save(tmp)
    os.replace(tmp, part)
    return jsonify({'status': 'ok'})


@app.route('/complete', methods=['POST'])
def complete():
    data = request.get_json(silent=True) or {}
    uid = data.get('uid', '')
    title = (data.get('title') or '').strip() or 'untitled'
    filename = data.get('filename') or 'video.mp4'
    try:
        total = int(data.get('total', 0))
    except (TypeError, ValueError):
        total = 0
    if not valid_uid(uid) or total <= 0:
        return jsonify({'error': 'bad params'}), 400

    d = chunk_dir_for(uid)
    missing = [i for i in range(total)
               if not os.path.exists(os.path.join(d, f"{i:06d}.part"))]
    if missing:
        return jsonify({'error': 'missing', 'missing': missing[:50]}), 409

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    safe = os.path.basename(filename).replace('/', '-').replace('\\', '-')
    path = os.path.join(UPLOAD_DIR, f"{int(time.time())}_{safe}")
    with open(path, 'wb') as out:
        for i in range(total):
            with open(os.path.join(d, f"{i:06d}.part"), 'rb') as p:
                shutil.copyfileobj(p, out, 1024 * 1024)
    shutil.rmtree(d, ignore_errors=True)

    print(f"結合完了: {path} / タイトル: {title}")
    threading.Thread(target=do_upload, args=(path, title), daemon=True).start()
    return jsonify({'status': 'ok'})


@app.route('/linewebhook', methods=['POST'])
def linewebhook():
    body = request.get_json(silent=True) or {}
    print("LINE WEBHOOK:", body)
    for event in body.get('events', []):
        src = event.get('source', {})
        gid = src.get('groupId', '')
        if gid:
            print(f"★GROUP ID: {gid}")
            with open("/root/upload/groupid.txt", "w") as ff:
                ff.write(gid)
    return 'OK'


sweep_stale_chunks()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)

# ===== 履歴くん =====
import re as re_module

RIREKI_TOKEN = os.environ.get('RIREKI_LINE_TOKEN', '')
RIREKI_SHEET = os.environ.get('RIREKI_SHEET_ID', '')
RIREKI_KEYWORDS = ['休みます', 'お休み', '休みたい', '遅れます', '遅れそう', '遅刻', '早退', '半休', '欠勤', '有給', '体調不良', '体調が悪', '気分が悪', '発熱', '熱が']


def rireki_get_name(user_id):
    try:
        r = req.get(f'https://api.line.me/v2/bot/profile/{user_id}',
                    headers={'Authorization': f'Bearer {RIREKI_TOKEN}'})
        return r.json().get('displayName', user_id)
    except Exception:
        return user_id


def rireki_log(name, text, keywords):
    try:
        from google.oauth2 import service_account
        sa_creds = service_account.Credentials.from_service_account_file(
            '/root/upload/rireki_key.json',
            scopes=['https://www.googleapis.com/auth/spreadsheets']
        )
        service = build('sheets', 'v4', credentials=sa_creds)
        now = time.strftime('%Y/%m/%d %H:%M:%S')
        body = {'values': [[now, name, text, '/'.join(keywords)]]}
        service.spreadsheets().values().append(
            spreadsheetId=RIREKI_SHEET,
            range='A:D',
            valueInputOption='USER_ENTERED',
            insertDataOption='INSERT_ROWS',
            body=body
        ).execute()
        print(f'スプシ記録完了: {name} / {text}')
    except Exception as e:
        print(f'スプシ記録エラー: {e}')


@app.route('/rireki', methods=['POST'])
def rireki():
    body = request.get_json(silent=True) or {}
    for event in body.get('events', []):
        if event.get('type') != 'message':
            continue
        if event.get('message', {}).get('type') != 'text':
            continue
        text = event['message']['text']
        matched = [k for k in RIREKI_KEYWORDS if k in text]
        if not matched:
            continue
        user_id = event.get('source', {}).get('userId', '')
        name = rireki_get_name(user_id)
        t = threading.Thread(target=rireki_log, args=(name, text, matched), daemon=True)
        t.start()
    return jsonify({'status': 'ok'})
