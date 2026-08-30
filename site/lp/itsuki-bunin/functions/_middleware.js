const PASS = "itsuki2026";
const COOKIE = "bunin_ok";

export const onRequest = async ({ request, next }) => {
  const u = new URL(request.url);
  const c = request.headers.get("Cookie") || "";
  if (c.includes(`${COOKIE}=1`)) return next();

  if (request.method === "POST") {
    const fd = await request.formData();
    if ((fd.get("password") || "") === PASS) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: u.pathname || "/",
          "Set-Cookie": `${COOKIE}=1; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`,
        },
      });
    }
    return gate(true);
  }
  return gate(false);
};

function gate(err) {
  const h = `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>いつき整体院</title>
<link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@600&family=Cormorant+Garamond:ital@1&family=Noto+Sans+JP:wght@400&display=swap" rel="stylesheet">
<style>
*{margin:0;box-sizing:border-box}
body{font-family:'Noto Sans JP',sans-serif;min-height:100vh;display:flex;align-items:center;
justify-content:center;background:#2f2c27;color:#f2ece1;padding:24px}
.card{width:100%;max-width:330px;text-align:center}
.en{font-family:'Cormorant Garamond',serif;font-style:italic;letter-spacing:.4em;color:#c9a97e;font-size:13px;margin-bottom:10px}
.nm{font-family:'Shippori Mincho',serif;font-size:21px;letter-spacing:.06em;margin-bottom:6px}
.tag{font-size:11px;color:rgba(255,255,255,.55);margin-bottom:28px;letter-spacing:.04em}
form{display:flex;flex-direction:column;gap:12px}
input{padding:15px;border-radius:2px;border:1px solid rgba(255,255,255,.3);
background:rgba(255,255,255,.08);color:#fff;font-size:16px;text-align:center;letter-spacing:.1em}
input::placeholder{color:rgba(255,255,255,.45)}
button{padding:15px;border:0;border-radius:2px;font-weight:500;font-size:14px;
cursor:pointer;background:#fff;color:#2f2c27;letter-spacing:.08em}
.err{color:#e8b4ac;font-size:12.5px;min-height:18px}
.note{color:rgba(255,255,255,.45);font-size:11px;margin-top:18px}
</style></head>
<body><div class="card">
<div class="en">ITSUKI</div>
<div class="nm">いつき整体院（分院）</div>
<div class="tag">制作中のページ（関係者プレビュー）</div>
<form method="POST">
<input type="password" name="password" placeholder="パスワードを入力" autofocus>
<button type="submit">見る</button>
<div class="err">${err ? "パスワードが違います" : ""}</div>
</form>
<div class="note">準備中のページです</div>
</div></body></html>`;
  return new Response(h, {
    status: err ? 401 : 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
