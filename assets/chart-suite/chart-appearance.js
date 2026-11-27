/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Chart Suite — 圖表外觀 SSOT (Chart Appearance Governance)
 * ═══════════════════════════════════════════════════════════════════════════
 * 目的：統一 ZenGrid 六圖（price / vol / amt / keynes / chartSub / chartBias）
 *       的外框「寬度」幾何、格線與十字線外觀，根除下列三套色值漂移：
 *         - LWC 四圖 grid : rgba(51, 65, 85, 0.35)
 *         - 副圖兩圖 grid : rgba(51, 65, 85, 0.4)
 *         - 一般版 Canvas 手繪 : rgba(255, 255, 255, 0.05 ~ 0.08)
 *
 * 設計：高度「刻意不納入」本 SSOT —— 各圖高度可獨立拖曳調整與記憶，
 *       本 SSOT 僅統一寬度相關的 padL / padR 與左右軸寬，確保六圖等寬。
 *
 * 載入：必須在 app-chart.js / app-chart-lwc.js / dualbear-subcharts.js 之前，
 *       緊鄰 date-axis-formatter.js 之後即可。
 * ═══════════════════════════════════════════════════════════════════════════
 */
(function (global) {
  "use strict";

  // LWC 既有基準色（app-chart-lwc.js commonOpts.grid）→ 六圖統一道此值
  var GRID_COLOR = "rgba(51, 65, 85, 0.35)";

  // LWC / 副圖既有垂直虛線色 → 一般版 Canvas 手绘同步套用
  var CROSSHAIR_COLOR = "rgba(148, 163, 184, 0.75)";

  global.ChartAppearance = Object.freeze({
    // ─── 外框寬度幾何：一般版 Canvas 與 LWC 軸共用同一組基準 ───
    frame: Object.freeze({
      padL: 86,             // 一般版 plot 起點 = LWC leftPriceScale.minimumWidth
      padR: 110,            // 一般版 plot 終點 = LWC rightPriceScale.minimumWidth
      leftAxisWidth: 86,
      rightAxisWidth: 110,
      timeAxisHeight: 25    // LWC timeScale 底部軸高（vertLine label 依附）
    }),

    // ─── 格線：六圖共用同一色值（垂直 + 水平） ───
    grid: Object.freeze({
      vertColor: GRID_COLOR,
      horzColor: GRID_COLOR
    }),

    // ─── 十字線：六圖共用，垂直線日期標籤「各圖同步顯示」 ───
    crosshair: Object.freeze({
      vertColor: CROSSHAIR_COLOR,
      horzColor: CROSSHAIR_COLOR,
      width: 1,
      style: 3,                    // LWC LineStyle.Dashed
      dash: [4, 3],                // 一般版 Canvas setLineDash
      vertLabelVisible: true,      // 👈 垂直線日期標籤六圖同步開啟
      horzLabelVisible: true,
      badge: Object.freeze({
        bg: "#0F172A",
        border: "#38BDF8",
        text: "#38BDF8",
        height: 18,
        fontSize: 11
      })
    }),

    // ─── 按鈕模板（Commit 2 控制統一使用，此版先定義不啟用） ───
    buttons: Object.freeze({
      up: "▲",
      down: "▼",
      collapse: "👁️",
      upClass: "chart-move-up",
      downClass: "chart-move-down",
      collapseClass: "chart-collapse"
    })
  });
})(window);
