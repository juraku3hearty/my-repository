const PASS = "armour2026";
const COOKIE = "armour_ok";

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
<meta name="robots" content="noindex,nofollow"><title>ARMOUR GYM</title>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@300;400&family=Noto+Sans+JP:wght@400&display=swap" rel="stylesheet">
<style>
*{margin:0;box-sizing:border-box}
body{font-family:'Noto Sans JP',sans-serif;min-height:100vh;display:flex;align-items:center;
justify-content:center;background:#141311;color:#f2ede5;padding:24px}
.card{width:100%;max-width:330px;text-align:center}
img{width:64px;margin:0 auto 18px;display:block;background:#fff;padding:7px;border-radius:2px}
.nm{font-family:'Jost',sans-serif;font-size:16px;letter-spacing:.18em;margin-bottom:4px}
.tag{font-size:11px;color:rgba(255,255,255,.5);margin-bottom:28px;letter-spacing:.04em}
form{display:flex;flex-direction:column;gap:12px}
input{padding:15px;border-radius:2px;border:1px solid rgba(255,255,255,.28);
background:rgba(255,255,255,.07);color:#fff;font-size:16px;text-align:center;letter-spacing:.1em}
input::placeholder{color:rgba(255,255,255,.42)}
button{padding:15px;border:0;border-radius:2px;font-weight:500;font-size:14px;
cursor:pointer;background:#bf9b57;color:#fff;letter-spacing:.08em}
.err{color:#e8b4ac;font-size:12.5px;min-height:18px}
.note{color:rgba(255,255,255,.4);font-size:11px;margin-top:18px}
</style></head>
<body><div class="card">
<img src="https://link-hokkaido.com/wp-content/uploads/2026/09/S__94535686_0.jpg" alt="ARMOUR GYM">
<div class="nm">ARMOUR GYM</div>
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
