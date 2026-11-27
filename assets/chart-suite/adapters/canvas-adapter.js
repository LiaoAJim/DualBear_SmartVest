/**
 * Chart Suite — 一般版 Canvas 主圖適配器
 * 職責：將 ChartSuite 的十字線廣播翻譯成 Canvas 主圖的「純設定」呼叫。
 *
 * 與 LWC adapter 的關鍵差異：
 * - LWC 用 lwcPriceChart.setCrosshairPosition（引擎原生 API，不經 drawCharts）。
 * - Canvas 的十字線是 drawCharts(hoverBarIndex) 的繪圖參數，沒有獨立 API。
 *   因此 app-chart.js 提供 setCanvasCrosshairFromSuite()，内部以抑制旗標呼叫
 *   drawCharts(idx)，讓該次重繪「只設定位置、不再向外廣播」，切斷回觸鏈。
 *
 * 一般版（DualBear_ZenGrid_2X.html）才載入本檔；LWC 版不載入。
 */
(function (root) {
  'use strict';
  if (!root.ChartSuite || root.ChartSuiteAdapters_Canvas) return;

  root.ChartSuiteAdapters_Canvas = {
    id: 'canvas',

    setCrosshair: function (date) {
      if (typeof root.setCanvasCrosshairFromSuite === 'function') {
        root.setCanvasCrosshairFromSuite(date);
      }
    },

    clearCrosshair: function () {
      if (typeof root.clearCanvasCrosshairFromSuite === 'function') {
        root.clearCanvasCrosshairFromSuite();
      }
    }
  };

  root.ChartSuite.register('canvas', root.ChartSuiteAdapters_Canvas);
})(typeof window !== 'undefined' ? window : this);
