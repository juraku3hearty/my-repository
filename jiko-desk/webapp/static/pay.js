// 決済代行会社の画面へ送る。CSPで 'unsafe-inline' を外すため外部ファイルにしている。
(function () {
  var f = document.getElementById("pay");
  if (!f) return;
  document.getElementById("pay-button").addEventListener("click", function () { f.submit(); });
})();
