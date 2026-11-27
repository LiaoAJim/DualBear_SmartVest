/**
 * ══════════════════════════════════════════════════════════════════════════════════
 * DualBear Chart Suite — 時間軸可見範圍協調層 (Phase 2)
 * ══════════════════════════════════════════════════════════════════════════════════
 * 職責：作為所有跨圖「可見時間範圍」寫入的唯一入口。
 *
 * 同步維度策略：
 *   - 跨序列（LWC 四圖 ⟷ 正2 / 乖離副圖）：一律用 YYYY-MM-DD 日期。
 *     副圖基座使用「大盤對照標的」資料序列，起點與筆數皆與主圖不同，
 *     邏輯索引同步會讓同一索引對應不同日期，永遠對不齊（Phase 0 實證）。
 *   - 同序列（LWC 四圖彼此）：邏輯索引同步保留在 LwcChartHub.bindTimeSync 內部封裝，
 *     因為四圖共享同一份 K 線序列，索引同步更精確且不遺失真實邊界。
 *
 * 守衛（與 Phase 1 crosshair 一致）：
 *   1. 同步 reentrancy + try/finally：攔截同步巢狀呼叫，且例外時必釋放旗標。
 *   2. 日期範圍去重 (DEDUPE_MS)：攔截 setVisibleRange 的非同步 subscribe 回觸。
 *
 * 向後相容：本檔只擴充 window.ChartSuite.setRange，不修改任何既有全域函式。
 *           一般版（無 ChartSuiteTimeSync）走原舊路徑（Phase 4 再接）。
 * ══════════════════════════════════════════════════════════════════════════════════
 */
(function (root) {
  'use strict';

  if (!root.ChartSuite || root.ChartSuiteTimeSync) return; // 需先載入 chart-suite.js；防止重複載入

  var rangeAdapters = Object.create(null); // id -> { setRange(from, to, sourceId) }
  var syncing = false;
  var lastKey = null;
  var lastTs = 0;
  var DEDUPE_MS = 120;

  /** LWC getVisibleRange() 可能回傳 business day 字串或 {year, month, day} 物件 → 統一 YYYY-MM-DD */
  function normalizeDate(t) {
    if (!t) return null;
    if (typeof t === 'string') return t.length >= 10 ? t.substring(0, 10) : t;
    if (typeof t === 'object' && t.year && t.month && t.day) {
      return t.year + '-' + String(t.month).padStart(2, '0') + '-' + String(t.day).padStart(2, '0');
    }
    return null;
  }

  function broadcast(from, to, sourceId) {
    if (!from || !to) return;
    if (syncing) return; // 守衛 1

    // 守衛 2：相同日期範圍在窗口內重複 → 視為 setVisibleRange 的非同步回觸
    var key = from + '|' + to;
    var now = Date.now();
    if (key === lastKey && now - lastTs < DEDUPE_MS) return;
    lastKey = key;
    lastTs = now;

    syncing = true;
    try {
      Object.keys(rangeAdapters).forEach(function (id) {
        var adapter = rangeAdapters[id];
        try {
          if (typeof adapter.setRange === 'function') {
            adapter.setRange(from, to, sourceId);
          }
        } catch (e) {
          // 單一 adapter 失敗不中斷其他圖表同步
          if (root.console && console.warn) {
            console.warn('[ChartSuiteTimeSync] adapter ' + id + ' 同步失敗:', e);
          }
        }
      });
    } finally {
      syncing = false;
    }
  }

  root.ChartSuiteTimeSync = {
    normalizeDate: normalizeDate,

    /** 註冊範圍適配器（冪等：同 id 覆蓋） */
    register: function (id, adapter) {
      if (!id || !adapter) return;
      rangeAdapters[id] = adapter;
    },

    unregister: function (id) {
      if (id) delete rangeAdapters[id];
    },

    isSyncing: function () {
      return syncing;
    }
  };

  // 單一公開入口：與 Phase 1 的 ChartSuite.setCrosshair 並列
  root.ChartSuite.setRange = function (from, to, sourceId) {
    broadcast(from, to, sourceId);
  };
})(typeof window !== 'undefined' ? window : this);
