/* 藏书房 · 书架 */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var grid = $('#grid');
  var empty = $('#empty');
  var search = $('#search');
  var importInput = $('#import-input');
  var q = '';
  var importing = 0;

  function fmtSize(n) {
    if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
    if (n >= 1024) return Math.round(n / 1024) + ' KB';
    return n + ' B';
  }

  function records() {
    return Object.values(LibStore.all());
  }

  function render() {
    var list = records();
    if (q) {
      var kw = q.toLowerCase();
      list = list.filter(function (r) {
        return (r.title || '').toLowerCase().indexOf(kw) > -1 ||
               (r.author || '').toLowerCase().indexOf(kw) > -1 ||
               (r.fileName || '').toLowerCase().indexOf(kw) > -1;
      });
    }
    list.sort(function (a, b) { return (b.lastReadAt || b.addedAt) - (a.lastReadAt || a.addedAt); });

    grid.hidden = list.length === 0;
    empty.hidden = list.length > 0;
    grid.innerHTML = '';

    list.forEach(function (r) {
      var card = document.createElement('article');
      card.className = 'book-card';
      var pct = Math.round((r.progressPct || 0) * 100);
      card.innerHTML =
        '<a class="cover" href="reader.html?id=' + encodeURIComponent(r.id) + '">' +
          '<span class="ph">' + LibBook.esc((r.title || '书').slice(0, 1)) + '</span>' +
          '<span class="spine"></span>' +
          '<span class="format-tag">' + (r.format || '').toUpperCase() + '</span>' +
          '<button class="remove" title="从书架移除" data-id="' + LibBook.esc(r.id) + '">×</button>' +
          (pct > 0 ? '<span class="progress-rail"><i style="width:' + Math.min(100, pct) + '%"></i></span>' : '') +
        '</a>' +
        '<h3 class="book-title">' + LibBook.esc(r.title) + '</h3>' +
        '<p class="book-meta">' +
          (r.author ? '<span class="author">' + LibBook.esc(r.author) + '</span><span class="dot">·</span>' : '') +
          '<span>' + fmtSize(r.size || 0) + '</span>' +
          (pct > 0 ? '<span class="dot">·</span><span class="pct">读至 ' + pct + '%</span>' : '') +
        '</p>';

      card.querySelector('.cover').addEventListener('click', function (ev) {
        if (ev.target.closest('.remove')) return;
      });
      card.querySelector('.remove').addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var id = ev.currentTarget.getAttribute('data-id');
        if (confirm('把《' + r.title + '》从书架移除？本机缓存的书籍文件也会一并删除。')) {
          LibBook.removeBook(id).then(render);
        }
      });

      grid.appendChild(card);

      /* 封面异步填充 */
      var ph = card.querySelector('.ph');
      LibBook.getCover(r.id).then(function (blob) {
        if (!blob || !ph.isConnected) return;
        var img = document.createElement('img');
        img.alt = r.title || '';
        img.src = URL.createObjectURL(blob);
        img.addEventListener('load', function () { ph.replaceWith(img); });
      });
    });
  }

  function importFiles(files) {
    var arr = Array.prototype.slice.call(files).filter(function (f) {
      var ext = (f.name.split('.').pop() || '').toLowerCase();
      return ext === 'epub' || ext === 'txt';
    });
    if (!arr.length) { LibBook.toast('仅支持 EPUB / TXT 文件'); return; }
    importing += arr.length;
    var done = 0, failed = 0, firstName = '';
    arr.forEach(function (f) {
      if (!firstName) firstName = f.name;
      LibBook.importFile(f).then(function () {
        after(f, null);
      }).catch(function (err) {
        after(f, err);
      });
    });
    function after(f, err) {
      done++;
      if (err) { failed++; console.error(err); LibBook.toast(f.name + '：' + err.message, 4000); }
      if (done === importing) {
        importing = 0;
        render();
        if (!failed) LibBook.toast('已导入 ' + done + ' 本，点击书封开始阅读');
      }
    }
  }

  /* 导入按钮 */
  importInput.addEventListener('change', function () {
    importFiles(importInput.files);
    importInput.value = '';
  });

  /* 搜索 */
  search.addEventListener('input', function () { q = search.value.trim(); render(); });

  /* 拖放导入 */
  var dragDepth = 0;
  window.addEventListener('dragenter', function (e) {
    e.preventDefault();
    if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') > -1) {
      dragDepth++;
      document.body.classList.add('dragging');
    }
  });
  window.addEventListener('dragleave', function () {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) document.body.classList.remove('dragging');
  });
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) {
    e.preventDefault();
    dragDepth = 0;
    document.body.classList.remove('dragging');
    if (e.dataTransfer && e.dataTransfer.files.length) importFiles(e.dataTransfer.files);
  });

  render();
})();
