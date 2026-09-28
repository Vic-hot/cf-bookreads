/* 藏书房 · 阅读器
 * EPUB：epub.js 分页渲染（目录 / 字号 / 三主题 / 进度记忆）
 * TXT：本机解码（UTF-8/GBK）→ 章节切分 → 滚动阅读
 */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };

  var params = new URLSearchParams(location.search);
  var id = params.get('id');
  var rec = id ? LibStore.get(id) : null;

  var file = null;
  var format = rec ? rec.format : 'epub';
  var book = null;       // epub.js Book
  var rendition = null;

  var THEMES = ['paper', 'sepia', 'night'];
  var EPUB_THEME = {
    paper: { bg: '#F5F0E6', ink: '#2C2620', accent: '#A5402D' },
    sepia: { bg: '#EFE3C4', ink: '#3A2F1E', accent: '#8A4A22' },
    night: { bg: '#16130F', ink: '#D8CFBC', accent: '#C56A4A' }
  };

  var theme = localStorage.getItem('pl_theme') || 'paper';
  if (THEMES.indexOf(theme) < 0) theme = 'paper';
  var fontPct = parseInt(localStorage.getItem('pl_font') || '100', 10) || 100;
  if (fontPct < 70) fontPct = 70; if (fontPct > 220) fontPct = 220;
  var serifOn = localStorage.getItem('pl_serif') !== '0';

  document.body.dataset.theme = theme;

  /* ---------- 顶部工具条自动隐藏 ---------- */
  var topbar = $('#topbar');
  var hideTimer = null;
  function pokeBar() {
    topbar.classList.remove('hide');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      if (!$('#toc-drawer').classList.contains('open')) topbar.classList.add('hide');
    }, 3200);
  }
  document.addEventListener('mousemove', pokeBar);
  document.addEventListener('touchstart', pokeBar, { passive: true });

  /* ---------- 工具条控件 ---------- */
  function setPct(p) { $('#tb-pct').textContent = Math.max(0, Math.min(100, Math.round(p))) + '%'; }

  $('#theme-btn').addEventListener('click', function () {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    document.body.dataset.theme = theme;
    localStorage.setItem('pl_theme', theme);
    applyThemeStyles();
    LibBook.toast('主题：' + { paper: '纸', sepia: '杏', night: '夜' }[theme]);
  });
  $('#font-plus').addEventListener('click', function () { setFont(Math.min(220, fontPct + 15)); });
  $('#font-minus').addEventListener('click', function () { setFont(Math.max(70, fontPct - 15)); });
  function setFont(v) {
    fontPct = v;
    localStorage.setItem('pl_font', String(v));
    applyThemeStyles();
  }
  $('#font-toggle').addEventListener('click', function () {
    serifOn = !serifOn;
    localStorage.setItem('pl_serif', serifOn ? '1' : '0');
    $('#font-toggle').textContent = serifOn ? '宋' : '黑';
    applyThemeStyles();
  });
  $('#font-toggle').textContent = serifOn ? '宋' : '黑';

  /* ---------- 目录 ---------- */
  var tocItems = [];
  function buildToc(items, onClick) {
    tocItems = items || [];
    var ul = $('#toc-list');
    ul.innerHTML = '';
    tocItems.forEach(function (it, i) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.textContent = it.label || ('第 ' + (i + 1) + ' 节');
      b.addEventListener('click', function () {
        onClick(it, i);
        closeToc();
      });
      li.appendChild(b);
      ul.appendChild(li);
    });
  }
  function markToc(key) {
    var lis = $('#toc-list').children;
    var idx = -1;
    tocItems.forEach(function (it, i) {
      if (key instanceof Array ? key.indexOf(i) > -1 : (it.href && key && String(key).indexOf(it.href) > -1) || it.idx === key) idx = i;
    });
    for (var i = 0; i < lis.length; i++) lis[i].classList.toggle('active', i === idx);
  }
  function openToc() { $('#toc-drawer').classList.add('open'); }
  function closeToc() { $('#toc-drawer').classList.remove('open'); pokeBar(); }
  $('#toc-btn').addEventListener('click', openToc);
  $('#toc-close').addEventListener('click', closeToc);

  /* ---------- 主题应用到阅读内容 ---------- */
  function applyThemeStyles() {
    if (rendition) {
      var t = EPUB_THEME[theme];
      rendition.themes.register('pl-theme', {
        'body': {
          'background': t.bg + ' !important',
          'color': t.ink + ' !important',
          'font-family': (serifOn ? 'Georgia, "Noto Serif SC", "Songti SC", serif' : '"Noto Sans SC", "PingFang SC", sans-serif') + ' !important'
        },
        'p, div, span, li, h1, h2, h3, h4, h5, h6': { 'line-height': '1.9 !important' },
        'a': { 'color': t.accent + ' !important' }
      });
      rendition.themes.select('pl-theme');
      rendition.themes.fontSize(fontPct + '%');
    }
    var tv = $('#txt-view');
    if (!tv.hidden) {
      tv.style.setProperty('--reader-size', String(fontPct / 100));
      tv.style.setProperty('--reader-font', serifOn ? 'var(--serif)' : 'var(--sans)');
    }
  }

  /* ---------- 打开 / 兜底选择文件 ---------- */
  var gate = $('#gate');
  function showGate(title, text) {
    $('#gate-title').textContent = title;
    $('#gate-text').textContent = text;
    gate.hidden = false;
  }
  $('#gate-file').addEventListener('change', async function () {
    var f = this.files && this.files[0];
    this.value = '';
    if (!f) return;
    try {
      var newRec = await LibBook.importFile(f);
      gate.hidden = true;
      if (newRec.id === id) { rec = newRec; startRender(); }
      else location.href = 'reader.html?id=' + encodeURIComponent(newRec.id);
    } catch (err) {
      LibBook.toast(err.message || '导入失败', 4000);
    }
  });

  /* ---------- TXT 章节切分 ---------- */
  function splitChapters(text) {
    var lines = text.replace(/\r\n?/g, '\n').split('\n');
    var re = /^\s*(第\s*[0-9〇零一二两三四五六七八九十百千万]+\s*[章回节卷集部][^\n]{0,30}|序章|楔子|前言|后记|尾声|终章|Chapter\s+\d+[^\n]{0,30})\s*$/;
    var chs = [];
    var cur = { title: '开篇', body: [] };
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      if (re.test(line)) {
        if (cur.body.length || chs.length) chs.push(cur);
        cur = { title: line, body: [] };
      } else {
        cur.body.push(line);
      }
    }
    chs.push(cur);
    if (chs.length <= 1) return [{ title: (rec && rec.title) || '正文', body: chs[0].body }];
    return chs;
  }

  function activeChapterIndex(tv, sections) {
    var y = tv.scrollTop + 140;
    var idx = 0;
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].offsetTop <= y) idx = i;
    }
    return idx;
  }

  /* ---------- 渲染：TXT ---------- */
  async function renderTxt() {
    $('#txt-view').hidden = false;
    var tv = $('#txt-view');
    var inner = $('#txt-inner');
    var buf = await file.arrayBuffer();
    var enc = rec.encoding || LibBook.detectEncoding(buf);
    var text;
    try { text = new TextDecoder(enc).decode(buf); }
    catch (e) { text = new TextDecoder('utf-8').decode(buf); }

    var chs = splitChapters(text);
    inner.innerHTML = chs.map(function (c, i) {
      var ps = c.body.length
        ? c.body.map(function (p) { return '<p>' + LibBook.esc(p) + '</p>'; }).join('')
        : '<p class="txt-empty-note">（本章无内容）</p>';
      return '<section class="txt-ch" id="ch-' + i + '"><h2>' + LibBook.esc(c.title) + '</h2>' + ps + '</section>';
    }).join('');

    buildToc(chs.map(function (c, i) { return { label: c.title, idx: i }; }), function (it) {
      var el = document.getElementById('ch-' + it.idx);
      if (el) tv.scrollTop = el.offsetTop - 20;
    });

    applyThemeStyles();

    /* 恢复进度 */
    var saved = parseFloat(rec.progressData || rec.progressPct || 0);
    if (saved > 0 && saved <= 1) {
      requestAnimationFrame(function () {
        tv.scrollTop = (tv.scrollHeight - tv.clientHeight) * saved;
        setPct(saved * 100);
      });
    }

    var sections = [];
    var collect = function () {
      sections = Array.prototype.slice.call(inner.querySelectorAll('.txt-ch'));
    };
    collect();

    var lastSave = 0;
    tv.addEventListener('scroll', function () {
      var max = tv.scrollHeight - tv.clientHeight;
      var p = max > 0 ? tv.scrollTop / max : 0;
      setPct(p * 100);
      var ai = activeChapterIndex(tv, sections);
      var label = chs[ai] ? chs[ai].title : '';
      $('#tb-sub').textContent = label.slice(0, 24);
      markToc(ai);
      var now = Date.now();
      if (now - lastSave > 800) {
        lastSave = now;
        rec.progressPct = p;
        rec.progressData = String(p);
        rec.lastReadAt = now;
        LibStore.put(id, rec);
      }
    }, { passive: true });
  }

  /* ---------- 渲染：EPUB ---------- */
  async function renderEpub() {
    $('#viewer').hidden = false;
    $('#nav-prev').hidden = false;
    $('#nav-next').hidden = false;

    await LibBook.loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
    await LibBook.loadScript('https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js');

    var buf = await file.arrayBuffer();
    book = ePub(buf);
    rendition = book.renderTo('viewer', { width: '100%', height: '100%', flow: 'paginated' });
    applyThemeStyles();

    try {
      await rendition.display(rec.progressData || undefined);
    } catch (e) {
      await rendition.display();
    }

    var nav = await book.loaded.navigation;
    var flat = [];
    (function walk(items) {
      (items || []).forEach(function (t) {
        flat.push({ label: (t.label || '').trim(), href: (t.href || '').split('#')[0] });
        if (t.subitems && t.subitems.length) walk(t.subitems.toArray ? t.subitems.toArray() : t.subitems);
      });
    })(nav.toc && nav.toc.length ? nav.toc : (nav.toArray ? nav.toArray() : []));

    buildToc(flat, function (it) { rendition.display(it.href); });

    /* 后台生成分页定位，让百分比精确到页 */
    book.ready.then(async function () {
      try { await book.locations.generate(1200); } catch (e) { /* 大书可跳过 */ }
      try {
        var cur = rendition.currentLocation();
        if (cur && cur.start && cur.start.percentage != null) {
          setPct(Math.max(1, Math.min(99, Math.round(cur.start.percentage * 100))));
        }
      } catch (e) { /* ignored */ }
    });

    rendition.on('relocated', function (loc) {
      var pct;
      if (book.locations && book.locations.length && loc.start && loc.start.percentage != null) {
        pct = Math.max(1, Math.min(99, Math.round(loc.start.percentage * 100)));
      } else {
        var total = (book.spine && (book.spine.length || (book.spine.items && book.spine.items.length))) || 1;
        pct = Math.max(1, Math.min(99, Math.round(((loc.start.index + 1) / total) * 100)));
      }
      setPct(pct);
      rec.progressPct = pct / 100;
      rec.progressData = loc.start.cfi;
      rec.lastReadAt = Date.now();
      LibStore.put(id, rec);

      var cur = null;
      for (var i = 0; i < flat.length; i++) {
        if (flat[i].href && loc.start.href && loc.start.href.indexOf(flat[i].href) > -1) cur = flat[i];
      }
      $('#tb-sub').textContent = cur ? cur.label.slice(0, 24) : '';
      markToc(loc.start.href);
    });

    /* 键盘 / 边缘 / 触摸翻页 */
    $('#nav-prev').addEventListener('click', function () { rendition.prev(); });
    $('#nav-next').addEventListener('click', function () { rendition.next(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft' && rendition) rendition.prev();
      if (e.key === 'ArrowRight' && rendition) rendition.next();
      if (e.key === 'Escape') closeToc();
    });
    var sx = null;
    document.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
    document.addEventListener('touchend', function (e) {
      if (sx == null || !rendition) return;
      var dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 60) { dx < 0 ? rendition.next() : rendition.prev(); }
      sx = null;
    }, { passive: true });

    if (rec.progressPct > 0) LibBook.toast('继续上次阅读 · ' + Math.round(rec.progressPct * 100) + '%');
  }

  /* ---------- 启动 ---------- */
  function startRender() {
    format = rec.format || format;
    if (format === 'txt') renderTxt().catch(function (e) { LibBook.toast('打开失败：' + e.message, 4000); });
    else renderEpub().catch(function (e) { LibBook.toast('打开失败：' + e.message, 4000); });
  }

  async function boot() {
    pokeBar();
    if (!rec) {
      showGate('打开书籍', '没有找到该书记录，请重新选择文件');
      return;
    }
    file = await LibBook.getFile(id);
    if (!file) {
      showGate('《' + rec.title + '》', '书籍文件已不在本机缓存中（可能被浏览器清理），请重新选择该文件');
      return;
    }
    $('#tb-title').textContent = rec.title;
    document.title = rec.title + ' · 藏书房';
    startRender();
  }

  boot();
})();
