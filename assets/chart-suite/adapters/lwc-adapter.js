/**
 * Chart Suite — LWC 四圖適配器（主 / 量 / 額 / 凱）
 * 職責：將 ChartSuite 的廣播翻譯成 LwcChartHub 的公開 API 呼叫。
 * 不直接碰 subscribeCrosshairMove（由協調層統一攔截）。
 */
(function (root) {
  'use strict';
  if (!root.ChartSuite || root.ChartSuiteAdapters_Lwc) return;

  root.ChartSuiteAdapters_Lwc = {
    id: 'lwc',

    setCrosshair: function (date) {
      if (root.LwcChartHub && typeof root.LwcChartHub.setCrosshair === 'function') {
        root.LwcChartHub.setCrosshair(date, 'chartsuite');
      }
    },

    clearCrosshair: function () {
      // LwcChartHub.clearCrosshair 內部已同步清副圖基座；此處只清 LWC 四圖避免重複
      if (root.LwcChartHub && typeof root.LwcChartHub.clearCrosshair === 'function') {
        root.LwcChartHub.clearCrosshair();
      }
    },

    /**
     * Phase 2：可見時間範圍同步（跨序列日期策略）
     * 來源為 'lwc' 時跳過：LWC 四圖共享同一 K 線序列，已由 bindTimeSync
     * 用邏輯索引同步完畢，無需再以日期回設（避免覆蓋精確邊界）。
     */
    setRange: function (from, to, sourceId) {
      if (sourceId === 'lwc') return;
      if (root.LwcChartHub && typeof root.LwcChartHub.setVisibleRange === 'function') {
        root.LwcChartHub.setVisibleRange(from, to);
      }
    }
  };

  root.ChartSuite.register('lwc', root.ChartSuiteAdapters_Lwc);
  // Phase 2：同一物件同時註冊為範圍適配器（精簡，不另建重複物件）
  if (root.ChartSuiteTimeSync && typeof root.ChartSuiteTimeSync.register === 'function') {
    root.ChartSuiteTimeSync.register('lwc', root.ChartSuiteAdapters_Lwc);
  }
})(typeof window !== 'undefined' ? window : this);
