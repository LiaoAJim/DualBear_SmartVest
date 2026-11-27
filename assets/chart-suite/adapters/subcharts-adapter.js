/**
 * Chart Suite — 雙副圖適配器（正2效率比 / 大週期乖離率）
 * 職責：將 ChartSuite 的廣播翻譯成 DualBearSubCharts 的公開方法呼叫。
 * 使用 instance 的「純設定」方法 setCrosshairFromSuite / hideCrosshair，
 * 这些方法只設定本身位置，不會再向外廣播（避免回觸）。
 */
(function (root) {
  'use strict';
  if (!root.ChartSuite || root.ChartSuiteAdapters_SubCharts) return;

  root.ChartSuiteAdapters_SubCharts = {
    id: 'subcharts',

    setCrosshair: function (date) {
      var inst = root.zenGridSubChartsInstance;
      if (inst && typeof inst.setCrosshairFromSuite === 'function') {
        inst.setCrosshairFromSuite(date);
      }
    },

    clearCrosshair: function () {
      var inst = root.zenGridSubChartsInstance;
      if (inst && typeof inst.hideCrosshair === 'function') {
        inst.hideCrosshair();
      }
    },

    /**
     * Phase 2：可見時間範圍同步。
     * 副圖基座與主圖使用不同資料序列，必須用日期同步（邏輯索引會錯位）。
     * syncToTimeRange 為純設定方法，不會對外廣播（僅更新 badge）。
     */
    setRange: function (from, to) {
      var inst = root.zenGridSubChartsInstance;
      if (inst && typeof inst.syncToTimeRange === 'function') {
        inst.syncToTimeRange(from, to);
      }
    }
  };

  root.ChartSuite.register('subcharts', root.ChartSuiteAdapters_SubCharts);
  // Phase 2：同一物件同時註冊為範圍適配器（精簡，不另建重複物件）
  if (root.ChartSuiteTimeSync && typeof root.ChartSuiteTimeSync.register === 'function') {
    root.ChartSuiteTimeSync.register('subcharts', root.ChartSuiteAdapters_SubCharts);
  }
})(typeof window !== 'undefined' ? window : this);
