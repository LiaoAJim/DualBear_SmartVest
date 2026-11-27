/**
 * ══════════════════════════════════════════════════════════════════════════════════
 * DualBear Chart Suite — 跨圖表協調層 (Single Source of Truth)
 * Phase 1：Crosshair 廣播中樞
 * ══════════════════════════════════════════════════════════════════════════════════
 * 職責：作為所有跨圖「同步狀態」的唯一寫入點。圖表引擎本身只負責畫，不負責協調。
 *
 * 設計兩層守衛（root cause of infinite feedback loop）：
 *   1. 同步 reentrancy guard：同步巢狀呼叫直接 return。
 *   2. 日期去重 (DEDUPE_MS)：相同日期短時間內的重複呼叫視為程式回觸，忽略。
 *      （LWC setCrosshairPosition 的 subscribeCrosshairMove 為非同步派發，同步守衛擋不住，
 *        必須靠日期去補足時間維度的防護。）
 *   ※ 不做 adapter 層級的 sourceId 排除：adapter 涵蓋多張圖，排除會讓兄弟圖漏接。
 *     來源圖的回觸由「底層純設定方法不再對外廣播」+ 日期去重共同阻斷。
 *     sourceId 仍透傳給 adapter，供未來細粒度排除使用。
 *
 * 向後相容：本檔只建立 window.ChartSuite，不修改任何既有全域函式。
 *           既有 JS 以能力偵測 (typeof window.ChartSuite !== 'undefined') 決定走新/舊路徑。
 * ══════════════════════════════════════════════════════════════════════════════════
 */
(function (root) {
  'use strict';

  if (root.ChartSuite) return; // 防止重複載入

  var adapters = Object.create(null); // id -> { setCrosshair(date), clearCrosshair() }
  var syncing = false;                 // 守衛 1：同步重入
  var lastDate = null;                 // 守衛 2：日期去重
  var lastTs = 0;
  var DEDUPE_MS = 120;                 // 同源回觸典型在數十 ms 內，120ms 兼顧安全與滑動靈敏度

  function broadcast(date, sourceId, isClear) {
    if (!isClear && !date) return;
    if (syncing) return; // 守衛 1

    // 守衛 2：相同日期在窗口內重複 → 視為 LWC 非同步回觸，丟棄
    if (!isClear) {
      var now = Date.now();
      if (date === lastDate && now - lastTs < DEDUPE_MS) return;
      lastDate = date;
      lastTs = now;
    } else {
      lastDate = null;
      lastTs = 0;
    }

    syncing = true;
    try {
      Object.keys(adapters).forEach(function (id) {
        // 不做 adapter 層級的 sourceId 排除：adapter 涵蓋多張圖（LWC 四圖 / 雙副圖），
        // 排除整个 adapter 會讓「兄弟圖」漏接（正2 ↔ 乖離、主圖 ↔ 量額凱）。
        // 回觸改由兩道機制阻斷：① 底層純設定方法不再對外廣播；② 日期去重擋掉短時間內的同日期回呼。
        var adapter = adapters[id];
        try {
          if (isClear) {
            if (typeof adapter.clearCrosshair === 'function') adapter.clearCrosshair(sourceId);
          } else {
            if (typeof adapter.setCrosshair === 'function') adapter.setCrosshair(date, sourceId);
          }
        } catch (e) {
          // 單一 adapter 失敗不中斷其他圖表同步
          if (root.console && console.warn) {
            console.warn('[ChartSuite] adapter ' + id + ' 同步失敗:', e);
          }
        }
      });
    } finally {
      syncing = false;
    }
  }

  root.ChartSuite = {
    /**
     * 註冊適配器（幂等：同 id 覆蓋）
     * @param {string} id 唯一識別（如 'lwc', 'subcharts'）
     * @param {object} adapter { setCrosshair(date), clearCrosshair() }
     */
    register: function (id, adapter) {
      if (!id || !adapter) return;
      adapters[id] = adapter;
    },

    unregister: function (id) {
      if (id) delete adapters[id];
    },

    /**
     * 將指定日期的十字線廣播給所有已註冊圖表（排除來源）
     * @param {string} date 目標日期 (YYYY-MM-DD)
     * @param {string} sourceId 觸發來源 adapter id（可選）
     */
    setCrosshair: function (date, sourceId) {
      broadcast(date, sourceId, false);
    },

    /** 清除所有圖表的十字線（排除來源） */
    clearCrosshair: function (sourceId) {
      broadcast(null, sourceId, true);
    },

    /** 供舊全域函式過渡期查詢（唯讀） */
    isSyncing: function () {
      return syncing;
    }
  };
})(typeof window !== 'undefined' ? window : this);
