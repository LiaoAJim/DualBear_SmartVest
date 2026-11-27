/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Chart Suite — 日期軸標籤 SSOT (Date Axis Formatter)
 * ═══════════════════════════════════════════════════════════════════════════
 * 目的：統一 ZenGrid 一般版（Canvas 手繪分隔線標籤）與 LWC 版
 *       （price / vol / amt / keynes / chartSub / chartBias 六圖 timeScale）
 *       的日期刻度格式，根除三份重複 formatter 造成的格式漂移。
 *
 * 格式：一律 YYYY-MM-DD（例如 2026-11-23）。
 * 載入：必須在 app-chart.js / app-chart-lwc.js / dualbear-subcharts.js 之前。
 * ═══════════════════════════════════════════════════════════════════════════
 */
(function (global) {
  "use strict";

  /**
   * 將 LWC time 物件或日期字串轉為統一的 YYYY-MM-DD 標籤。
   * @param {string|{year:number, month:number, day?:number}} time
   * @returns {string}
   */
  function format(time) {
    if (typeof time === "string") {
      // 後端 Date 皆為完整 YYYY-MM-DD；僅在字串足夠長時截斷，不硬補不存在之日
      return time.length >= 10 ? time.substring(0, 10) : time;
    }
    if (time && time.year && time.month) {
      const m = String(time.month).padStart(2, "0");
      // LWC business day 物件：帶 day 才輸出完整年月日
      if (time.day) {
        const d = String(time.day).padStart(2, "0");
        return `${time.year}-${m}-${d}`;
      }
      // 僅有 year/month（如月 K 刻度）且無 day：不硬補假日，退回 YYYY-MM
      return `${time.year}-${m}`;
    }
    return time;
  }

  /**
   * 是否為月 K（供一般版分隔線週期判斷共用）。
   * @param {string} interval
   * @returns {boolean}
   */
  function isMonthly(interval) {
    return interval === "1mo" || interval === "1m";
  }

  global.ChartSuiteDateAxis = Object.freeze({ format, isMonthly });
})(window);
