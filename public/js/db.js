/* 藏书房 · 本地存储层
 * 书籍文件(File/Blob)与封面存 IndexedDB，书籍元数据与阅读进度存 localStorage。
 * 任何数据都不会发送到服务器。
 */
(function () {
  'use strict';

  /* ---------- IndexedDB ---------- */
  var DB_NAME = 'pl-files';
  var DB_VER = 1;
  var dbp = null;

  function openDb() {
    if (!dbp) {
      dbp = new Promise(function (resolve, reject) {
        var req = indexedDB.open(DB_NAME, DB_VER);
        req.onupgradeneeded = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
          if (!db.objectStoreNames.contains('covers')) db.createObjectStore('covers');
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    }
    return dbp;
  }

  function tx(store, mode, fn) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(store, mode);
        var out = null;
        try { out = fn(t.objectStore(store)); } catch (e) { reject(e); return; }
        t.oncomplete = function () { resolve(out && out.result !== undefined ? out.result : undefined); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }

  var LibDB = {
    put: function (store, key, val) { return tx(store, 'readwrite', function (s) { return s.put(val, key); }); },
    get: function (store, key) { return tx(store, 'readonly', function (s) { return s.get(key); }); },
    del: function (store, key) { return tx(store, 'readwrite', function (s) { return s.delete(key); }); },
    keys: function (store) { return tx(store, 'readonly', function (s) { return s.getAllKeys(); }); }
  };
  window.LibDB = LibDB;

  /* ---------- localStorage 书籍记录 ---------- */
  var LS_KEY = 'pl_records_v1';

  var LibStore = {
    all: function () {
      try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }
      catch (e) { return {}; }
    },
    get: function (id) { return this.all()[id] || null; },
    put: function (id, rec) {
      var all = this.all();
      all[id] = rec;
      localStorage.setItem(LS_KEY, JSON.stringify(all));
      return rec;
    },
    remove: function (id) {
      var all = this.all();
      delete all[id];
      localStorage.setItem(LS_KEY, JSON.stringify(all));
    }
  };
  window.LibStore = LibStore;
})();
