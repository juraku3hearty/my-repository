// GAS の最小モック（このツールが使うメソッドだけ）
function makeRange(sheet, r, c, nr, nc) {
  nr = nr || 1; nc = nc || 1;
  var self = {
    getValues: function () {
      var out = [];
      for (var i = 0; i < nr; i++) {
        var row = [];
        for (var j = 0; j < nc; j++) {
          var v = (sheet._d[r - 1 + i] || [])[c - 1 + j];
          row.push(v === undefined ? '' : v);
        }
        out.push(row);
      }
      return out;
    },
    setValues: function (vals) {
      if (vals.length !== nr || vals[0].length !== nc) throw new Error('setValues size mismatch ' + vals.length + 'x' + vals[0].length + ' vs ' + nr + 'x' + nc);
      for (var i = 0; i < nr; i++) {
        sheet._d[r - 1 + i] = sheet._d[r - 1 + i] || [];
        for (var j = 0; j < nc; j++) sheet._d[r - 1 + i][c - 1 + j] = vals[i][j];
      }
      return self;
    },
    setValue: function (v) { return self.setValues([[v]]); },
    clearContent: function () {
      for (var i = 0; i < nr; i++) for (var j = 0; j < nc; j++) if (sheet._d[r - 1 + i]) sheet._d[r - 1 + i][c - 1 + j] = '';
      return self;
    }
  };
  ['setBackground','setWrap','setFontWeight','setFontColor','setVerticalAlignment','setDataValidation','setNumberFormat','setHorizontalAlignment','setFontSize']
    .forEach(function (m) { self[m] = function () { return self; }; });
  return self;
}
function makeSheet(name, data) {
  var sh = {
    _name: name, _d: data || [],
    getName: function () { return name; },
    getLastRow: function () {
      for (var i = sh._d.length - 1; i >= 0; i--) {
        if ((sh._d[i] || []).some(function (v) { return v !== '' && v !== undefined && v !== null; })) return i + 1;
      }
      return 0;
    },
    getLastColumn: function () {
      var m = 0;
      sh._d.forEach(function (row) { (row || []).forEach(function (v, j) { if (v !== '' && v !== undefined) m = Math.max(m, j + 1); }); });
      return m;
    },
    getRange: function (r, c, nr, nc) { return makeRange(sh, r, c, nr, nc); },
    getDataRange: function () { return makeRange(sh, 1, 1, Math.max(sh.getLastRow(), 1), Math.max(sh.getLastColumn(), 1)); },
    appendRow: function (row) { sh._d[sh.getLastRow()] = row.slice(); },
    clearContents: function () { sh._d = []; },
    clear: function () { sh._d = []; }
  };
  ['setColumnWidth','setFrozenRows','autoResizeColumn'].forEach(function (m) { sh[m] = function () {}; });
  return sh;
}
function makeBook(sheets) {
  var book = {
    _s: sheets,
    getSheetByName: function (n) { return book._s[n] || null; },
    insertSheet: function (n) { book._s[n] = makeSheet(n, []); return book._s[n]; },
    getSheets: function () { return Object.keys(book._s).map(function (k) { return book._s[k]; }); },
    getUrl: function () { return 'https://example/sheet'; },
    toast: function (m) { global.__toasts.push(m); }
  };
  return book;
}
module.exports = { makeSheet: makeSheet, makeBook: makeBook };
