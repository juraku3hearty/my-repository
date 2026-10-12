// ログイン用トークンの取り出し。
// トークンは URL のフラグメント（#）で渡される。フラグメントはサーバーに送られないため、
// アクセスログにも Referer にも残らない。読み取ったら即座にURLから消す。
// CSPで 'unsafe-inline' を外すため、インラインではなく外部ファイルにしている。
(function () {
  var root = document.getElementById("login-root");
  if (!root) return;
  var m = (location.hash || "").match(/[#&]t=([^&]+)/);
  if (!m) return;
  var token = m[1];
  history.replaceState(null, "", location.pathname);
  document.getElementById("working").style.display = "block";
  var body = new FormData();
  body.append("t", token);
  body.append("_csrf", root.getAttribute("data-csrf"));
  fetch(root.getAttribute("data-consume"), { method: "POST", body: body })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.ok) { location.replace(root.getAttribute("data-home")); }
      else {
        document.getElementById("working").style.display = "none";
        document.getElementById("failed").style.display = "block";
      }
    })
    .catch(function () {
      document.getElementById("working").style.display = "none";
      document.getElementById("failed").style.display = "block";
    });
})();
