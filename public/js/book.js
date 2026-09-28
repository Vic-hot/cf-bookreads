/* 藏书房 · 书籍导入与解析（纯本机，不上传）
 * - EPUB：浏览器内用 JSZip 解出书名 / 作者 / 封面
 * - TXT：探测编码（UTF-8 / GBK）
 * - 文件本体与封面写入 IndexedDB，元数据写入 localStorage
 */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = function () { rej(new Error('脚本加载失败: ' + src)); };
      document.head.appendChild(s);
    });
  }

  function ensureJsZip() {
    if (window.JSZip) return Promise.resolve();
    return loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
  }

  /* 依据 文件名+大小 生成稳定 id（同名同大小的副本共享阅读进度） */
  function bookId(file) {
    var h = 7;
    var name = file.name || '';
    for (var i = 0; i < name.length; i++) h = (h * 33 + name.charCodeAt(i)) >>> 0;
    return 'b' + file.size + 'x' + h.toString(36);
  }

  function detectEncoding(buf) {
    try { new TextDecoder('utf-8', { fatal: true }).decode(buf); return 'utf-8'; }
    catch (e) { return 'gbk'; }
  }

  /* 从 EPUB 包内解出 元数据 + 封面 */
  async function parseEpubMeta(file) {
    await ensureJsZip();
    var zip = await JSZip.loadAsync(file);
    var containerFile = zip.file('META-INF/container.xml');
    if (!containerFile) throw new Error('不是有效的 EPUB');
    var container = new DOMParser().parseFromString(await containerFile.async('string'), 'application/xml');
    var root = container.querySelector('rootfile');
    var opfPath = root && root.getAttribute('full-path');
    if (!opfPath) throw new Error('EPUB 结构异常');
    var opfFile = zip.file(opfPath) || zip.file(decodeURIComponent(opfPath));
    if (!opfFile) throw new Error('EPUB 结构异常');
    var opf = new DOMParser().parseFromString(await opfFile.async('string'), 'application/xml');

    var pick = function (sel) {
      var el = opf.querySelector(sel);
      return el && el.textContent ? el.textContent.trim() : '';
    };
    var title = pick('metadata title') || pick('title');
    var author = pick('metadata creator') || pick('creator');

    var coverBlob = null;
    var item = opf.querySelector('manifest item[properties~="cover-image"]');
    if (!item) {
      var metaId = null;
      var meta = opf.querySelector('metadata meta[name="cover"]');
      if (meta) metaId = meta.getAttribute('content');
      if (metaId) item = opf.querySelector('manifest item[id="' + metaId + '"]');
    }
    if (item) {
      var href = item.getAttribute('href') || '';
      var base = opfPath.indexOf('/') > -1 ? opfPath.replace(/\/[^/]*$/, '/') : '';
      var f = zip.file(base + href) || zip.file(decodeURIComponent(base + href)) || zip.file(href);
      if (f) {
        try {
          var raw = await f.async('blob');
          var ext = (href.split('.').pop() || '').toLowerCase();
          var mime = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }[ext] || 'image/jpeg';
          coverBlob = raw.type ? raw : new Blob([raw], { type: mime });
        } catch (e) { coverBlob = null; }
      }
    }
    return { title: title, author: author, cover: coverBlob };
  }

  /* 导入一本书：返回书籍记录 */
  async function importFile(file) {
    var ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext !== 'epub' && ext !== 'txt') throw new Error('仅支持 EPUB / TXT 文件');
    var format = ext;
    var id = bookId(file);

    var title = file.name.replace(/\.[^.]+$/, '');
    var author = '';
    var cover = null;
    var encoding = '';

    if (format === 'epub') {
      try {
        var m = await parseEpubMeta(file);
        if (m.title) title = m.title;
        if (m.author) author = m.author;
        cover = m.cover;
      } catch (e) { /* 解析失败则回退为文件名 */ }
    } else {
      try {
        var buf = await file.slice(0, 65536).arrayBuffer();
        encoding = detectEncoding(buf);
      } catch (e) { encoding = 'utf-8'; }
    }

    try {
      await LibDB.put('files', id, file);
      if (cover) await LibDB.put('covers', id, cover);
    } catch (e) {
      throw new Error('本机存储失败：可能是隐私模式或浏览器空间不足');
    }

    var rec = LibStore.get(id) || {};
    rec.id = id;
    rec.title = title;
    rec.author = author;
    rec.format = format;
    rec.encoding = encoding;
    rec.fileName = file.name;
    rec.size = file.size;
    rec.addedAt = rec.addedAt || Date.now();
    LibStore.put(id, rec);
    return rec;
  }

  /* 从本机缓存取出文件（阅读器用） */
  function getFile(id) { return LibDB.get('files', id); }
  function getCover(id) { return LibDB.get('covers', id); }
  function removeBook(id) {
    LibStore.remove(id);
    return Promise.all([LibDB.del('files', id), LibDB.del('covers', id)]).catch(function () {});
  }

  function toast(msg, ms) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._tm);
    toast._tm = setTimeout(function () { t.hidden = true; }, ms || 2600);
  }

  window.LibBook = {
    esc: esc,
    loadScript: loadScript,
    bookId: bookId,
    detectEncoding: detectEncoding,
    importFile: importFile,
    getFile: getFile,
    getCover: getCover,
    removeBook: removeBook,
    toast: toast
  };
})();
