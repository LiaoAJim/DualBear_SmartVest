/**
 * ══════════════════════════════════════════════════════════════════════════════════
 * DualBear SubCharts Hub — 通用量化副圖基座核心模組 v2.8 (1:1 完整信號高保真旗艦版)
 * 遵循 05_frontend_governance & AGENTS.md 標準：
 * 1. 禁用內部滾輪縮放 (handleScroll/handleScale mouseWheel: false)，放行頁面垂直滾動
 * 2. 移除手動高度拖曳手柄，副圖高度固定為標準黃金尺寸 (160px / 185px)
 * 3. 標題列具備 ▲/▼ 順位調整、👁️ 收折、原型/正2 基準切換
 * 4. 繪圖格線與刻度 100% 絕對齊平主圖 (padL: 86px, padR: 110px)
 * 5. 底部副圖完整顯示時間軸與清晰日期刻度 (timeScale: visible: true)
 * 6. 1:1 還原原版完整 4 色散點信號體系 (🟡壓力做頭 / 🔵支撐打底 / 🔶空頭防守 / 🔷多頭守護)
 * 7. 1:1 還原副圖 3 之 4 檔階梯警戒水平線 (20% 警戒線 / 50% 半倉線 / 85% 積極線 / 100% 滿倉線)
 * ══════════════════════════════════════════════════════════════════════════════════
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DualBearSubCharts = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ══════ 純數學演算法工具庫 ══════
  const SubChartMath = {
    /**
     * 計算簡單移動平均線 (SMA)
     */
    sma: function (data, period) {
      const result = [];
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        sum += data[i];
        if (i >= period) {
          sum -= data[i - period];
        }
        if (i >= period - 1) {
          result.push(sum / period);
        } else {
          result.push(null);
        }
      }
      return result;
    },

    /**
     * 1:1 還原 Leverage-Monitor 正2 相對於原型的 20 日滾動槓桿效率比
     * 效率比 = 正2 20D 漲跌幅 / (原型 20D 漲跌幅 * 2)
     */
    calcLeverageRatio: function (candles1X, candles2X, lookback) {
      if (!candles1X || !candles2X || !candles1X.length || !candles2X.length) {
        return [];
      }
      const lb = lookback || 20;
      const map1X = new Map();
      candles1X.forEach(c => map1X.set(c.time, c.close));

      // 取得兩者日曆時間交集的對齊數據
      const synced2X = [];
      const synced1XCloses = [];
      for (let i = 0; i < candles2X.length; i++) {
        const c2 = candles2X[i];
        const p1 = map1X.get(c2.time);
        if (p1 !== undefined) {
          synced2X.push(c2);
          synced1XCloses.push(p1);
        }
      }

      const ratioList = [];
      for (let i = 0; i < synced2X.length; i++) {
        const tStr = synced2X[i].time;
        if (i < lb) {
          ratioList.push({ time: tStr, value: 1.0 });
          continue;
        }
        const baseP = synced1XCloses[i - lb];
        const baseL = synced2X[i - lb].close;
        const curP = synced1XCloses[i];
        const curL = synced2X[i].close;

        const chgP = baseP > 0 ? ((curP - baseP) / baseP) * 100 : 0;
        const chgL = baseL > 0 ? ((curL - baseL) / baseL) * 100 : 0;

        let ratio = 1.0;
        if (Math.abs(chgP * 2) > 0.1) {
          ratio = chgL / (chgP * 2);
        }
        ratioList.push({ time: tStr, value: parseFloat(ratio.toFixed(2)) });
      }
      return ratioList;
    },

    /**
     * 1:1 還原原版散點信號狀態機演算法 (支援 10MA 預警與確立模式)
     */
    calcSignals: function (candlesP, activeCandles, ratioData, signalPeriod, mode) {
      const lookback = 20; // 20D 波段
      const p = signalPeriod || 10;
      const triggerMode = mode || 'alert'; // 'alert' 預警, 'confirmed' 確立

      if (!candlesP || !activeCandles || candlesP.length <= lookback) {
        return {
          resPoints: [],
          supPoints: [],
          resHolding: [],
          supHolding: [],
          signalList: [],
          latestStatus: '無訊號 (盤整中)',
          latestType: 'none',
          latestRatio: 1.0
        };
      }

      // 建立日期對齊索引映射
      const mapP = new Map();
      candlesP.forEach(c => mapP.set(c.time, c));

      // 計算目標主標的之訊號濾網 MA
      const closes = activeCandles.map(c => c.close);
      const maVals = SubChartMath.sma(closes, p);
      const signalMaMap = new Map();
      for (let i = 0; i < activeCandles.length; i++) {
        if (maVals[i] !== null) {
          signalMaMap.set(activeCandles[i].time, maVals[i]);
        }
      }

      const ratioMap = new Map();
      ratioData.forEach(r => ratioMap.set(r.time, r.value));

      const historyResPoints = [];
      const historySupPoints = [];
      const historyResHolding = [];
      const historySupHolding = [];
      const signalList = [];

      let inPressureTrend = false;
      let inSupportTrend = false;
      let latestSignalStatus = '無訊號 (盤整中)';
      let latestSignalType = 'none';

      // 取得同時存在於 activeCandles 與 candlesP 的有效對齊清單
      const syncedActive = [];
      const syncedPCloses = [];
      for (let i = 0; i < activeCandles.length; i++) {
        const cA = activeCandles[i];
        const cP = mapP.get(cA.time);
        if (cP !== undefined) {
          syncedActive.push(cA);
          syncedPCloses.push(cP.close);
        }
      }

      for (let i = lookback; i < syncedActive.length; i++) {
        const tStr = syncedActive[i].time;
        const curClose = syncedActive[i].close;
        const curSignalMa = signalMaMap.get(tStr);

        if (curClose === undefined || curSignalMa === undefined) continue;

        const prevPClose = syncedPCloses[i - lookback];
        const curPClose = syncedPCloses[i];
        const chgP = prevPClose > 0 ? ((curPClose - prevPClose) / prevPClose) * 100 : 0;
        const rCurr = ratioMap.get(tStr) ?? 1.0;

        let isPressure = false;
        let isSupport = false;

        if (triggerMode === 'alert') {
          // 【預警模式】高檔摸頂 (Close > MA) / 低檔摸底 (Close < MA)
          isPressure = (curClose > curSignalMa) && (chgP > 0 && rCurr < 1.0);
          isSupport = (curClose < curSignalMa) && (chgP < 0 && rCurr < 1.0);
        } else {
          // 【確立模式】跌破 MA (Close < MA) / 站上 MA (Close > MA)
          isPressure = (curClose < curSignalMa) && (chgP > -5.0 && rCurr < 1.0);
          isSupport = (curClose > curSignalMa) && (chgP < 5.0 && (rCurr > 1.0 || (chgP < 0 && rCurr < 1.0)));
        }

        let dayStatus = '無訊號 (盤整中)';
        let dayType = 'none';

        if (isPressure) {
          inPressureTrend = true;
          inSupportTrend = false;
          historyResPoints.push({ time: tStr, value: 1 });
          dayStatus = triggerMode === 'alert' ? '壓力預警觸發' : '壓力確立 (做頭)';
          dayType = 'res_trigger';
        } else if (isSupport) {
          inSupportTrend = true;
          inPressureTrend = false;
          historySupPoints.push({ time: tStr, value: 1 });
          dayStatus = triggerMode === 'alert' ? '支撐預警觸發' : '支撐確立 (打底)';
          dayType = 'sup_trigger';
        } else {
          if (inPressureTrend) {
            if (triggerMode === 'alert') {
              if (curClose < curSignalMa) {
                inPressureTrend = false;
              } else {
                historyResHolding.push({ time: tStr, value: 1 });
                dayStatus = '壓力趨勢延伸中';
                dayType = 'res_holding';
              }
            } else {
              if (curClose >= curSignalMa) {
                inPressureTrend = false;
              } else {
                historyResHolding.push({ time: tStr, value: 1 });
                dayStatus = '空頭防守延伸中';
                dayType = 'res_holding';
              }
            }
          }

          if (inSupportTrend) {
            if (triggerMode === 'alert') {
              if (curClose > curSignalMa) {
                inSupportTrend = false;
              } else {
                historySupHolding.push({ time: tStr, value: 1 });
                dayStatus = '支撐趨勢延伸中';
                dayType = 'sup_holding';
              }
            } else {
              if (curClose <= curSignalMa) {
                inSupportTrend = false;
              } else {
                historySupHolding.push({ time: tStr, value: 1 });
                dayStatus = '多頭守護延伸中';
                dayType = 'sup_holding';
              }
            }
          }
        }

        signalList.push({
          time: tStr,
          status: dayStatus,
          type: dayType,
        });

        if (i === candlesP.length - 1) {
          latestSignalStatus = dayStatus;
          latestSignalType = dayType;
        }
      }

      const latestRatio = ratioData.length > 0 ? ratioData[ratioData.length - 1].value : 1.0;

      return {
        resPoints: historyResPoints,
        supPoints: historySupPoints,
        resHolding: historyResHolding,
        supHolding: historySupHolding,
        signalList: signalList,
        latestStatus: latestSignalStatus,
        latestType: latestSignalType,
        latestRatio: latestRatio
      };
    },

    /**
     * 1:1 還原原版大週期 5 年線與 2 年線雙軌動態門檻與資金配置
     * 支援自適應自動換算 (日K: 480/1200, 週K: 104/260, 月K: 24/60) 與兩線中線自動動態平均
     */
    calc5YearBiasAndTiers: function (candles, options) {
      if (!candles || candles.length < 20) return {
        biasData: [],
        bias2yData: [],
        biasMidData: [],
        allocData: [],
        cachedList: []
      };

      const opts = options || {};
      const interval = opts.interval || '1d';
      
      // 根據週期自適應計算基準根數：
      // 日K: 1年約240天 -> 2Y=480, 5Y=1200
      // 週K: 1年約52週 -> 2Y=104, 5Y=260
      // 月K: 1年約12月 -> 2Y=24, 5Y=60
      let def2Y = 480;
      let def5Y = 1200;
      if (interval === '1wk') {
        def2Y = 104;
        def5Y = 260;
      } else if (interval === '1mo') {
        def2Y = 24;
        def5Y = 60;
      }

      const p2y = Math.max(5, parseInt(opts.period2Y, 10) || def2Y);
      const p5y = Math.max(p2y + 5, parseInt(opts.period5Y, 10) || def5Y);
      const pMid = Math.round((p2y + p5y) / 2);

      const biasData = [];
      const bias2yData = [];
      const biasMidData = [];
      const allocData = [];
      const cachedList = [];

      for (let i = 0; i < candles.length; i++) {
        const curP = candles[i].close;
        const tStr = candles[i].time;

        const startIdx5y = Math.max(0, i - p5y + 1);
        let s5 = 0;
        for (let j = startIdx5y; j <= i; j++) s5 += candles[j].close;
        const ma5y = s5 / (i - startIdx5y + 1);

        const startIdx2y = Math.max(0, i - p2y + 1);
        let s2 = 0;
        for (let j = startIdx2y; j <= i; j++) s2 += candles[j].close;
        const ma2y = s2 / (i - startIdx2y + 1);

        // 兩線中線價格 = (2年線 + 5年線) / 2
        const maMid = (ma2y + ma5y) / 2;

        // 5 年線乖離率 = (標的價格 - 5年線) / 5年線 * 100%
        const bias5y = ((curP - ma5y) / ma5y) * 100;
        biasData.push({ time: tStr, value: parseFloat(bias5y.toFixed(2)) });

        // 動態門檻值 (右軸)
        const b2y = ((ma2y - ma5y) / ma5y) * 100;
        const bMid = ((maMid - ma5y) / ma5y) * 100;
        bias2yData.push({ time: tStr, value: parseFloat(b2y.toFixed(2)) });
        biasMidData.push({ time: tStr, value: parseFloat(bMid.toFixed(2)) });

        // 建議累積資金配置比例 (左軸 0% ~ 100%)
        let allocPct = 0;
        let stageText = '多頭/觀望區';
        let badgeCls = 'badge-wait';

        if (curP <= ma2y) {
          const totalGap = ma2y - ma5y;
          const dropFrom2Y = ma2y - curP;
          const progress = totalGap > 0 ? (dropFrom2Y / totalGap) * 100 : 0;

          if (curP < ma5y) {
            allocPct = 100;
            stageText = '破 5 年線 (極端 100%)';
            badgeCls = 'badge-bear';
          } else if (curP <= ma5y || progress >= 100) {
            allocPct = 85;
            stageText = '觸及 5 年線 (累積 85%)';
            badgeCls = 'badge-warn';
          } else if (progress >= 50) {
            allocPct = 50;
            stageText = '兩線中線 (累積 50%)';
            badgeCls = 'badge-bull';
          } else {
            allocPct = 20;
            stageText = '破 2 年線 (試單 20%)';
            badgeCls = 'badge-bull';
          }
        }

        allocData.push({
          time: tStr,
          value: allocPct,
          color: allocPct >= 100 ? 'rgba(239, 68, 68, 0.65)' :
                 allocPct >= 85 ? 'rgba(245, 158, 11, 0.65)' :
                 allocPct >= 50 ? 'rgba(56, 189, 248, 0.65)' :
                 allocPct >= 20 ? 'rgba(168, 85, 247, 0.65)' : 'transparent'
        });

        cachedList.push({
          time: tStr,
          biasPct: parseFloat(bias5y.toFixed(2)),
          tier: allocPct,
          tierDesc: stageText,
          badgeCls: badgeCls
        });
      }

      return {
        biasData: biasData,
        bias2yData: bias2yData,
        biasMidData: biasMidData,
        allocData: allocData,
        cachedList: cachedList,
        p2y: p2y,
        p5y: p5y,
        pMid: pMid
      };
    }
  };

  /**
   * ══════ 主控制器建構子 ══════
   */
  function DualBearSubCharts(options) {
    this.options = Object.assign({
      mountId: 'subcharts-mount',
      mount: null,
      masterChart: null,
      data1X: [],
      data2X: [],
      rawData1X: [],
      rawData2X: [],
      biasBase: localStorage.getItem('dualbear_subcharts_bias_base') || 'proxy',
      biasMarketKey: localStorage.getItem('dualbear_subcharts_bias_market_key') || 'TW_50', // 階梯對照基準：'TW_50', 'US', 'TW', 'ACTIVE'
      period2Y: parseInt(localStorage.getItem('dualbear_subcharts_bias_p2y'), 10) || null,
      period5Y: parseInt(localStorage.getItem('dualbear_subcharts_bias_p5y'), 10) || null,
      interval: '1d',
      marketKey: localStorage.getItem('dualbear_subcharts_market_key') || 'US', // 'US', 'TW_50', 'TW'
      signalPeriod: parseInt(localStorage.getItem('dualbear_subcharts_signal_period'), 10) || 10,
      signalMode: localStorage.getItem('dualbear_subcharts_signal_mode') || 'alert' // 'alert' 預警, 'confirm' 確立
    }, options);

    this.marketKey = this.options.marketKey;
    this.signalPeriod = this.options.signalPeriod;
    this.signalMode = this.options.signalMode;
    this.biasBase = this.options.biasBase;
    this.biasMarketKey = this.options.biasMarketKey;
    this.interval = this.options.interval || '1d';
    this.period2Y = this.options.period2Y;
    this.period5Y = this.options.period5Y;

    const targetMount = this.options.mount || this.options.mountId;
    this.mount = typeof targetMount === 'string'
      ? document.getElementById(targetMount)
      : targetMount;

    if (!this.mount) {
      throw new Error(`[DualBearSubCharts] 找不到掛載目標容器: ${this.options.mountId || this.options.mount}`);
    }

    this.chartSub = null;
    this.chartBias = null;
    this.seriesSubRatio = null;
    this.seriesResPoints = null;
    this.seriesSupPoints = null;
    this.seriesResHolding = null;
    this.seriesSupHolding = null;

    this.seriesBiasTier = null;
    this._biasFloatLayer = null;
    this.seriesBiasPct = null;
    this.seriesBias2y = null;
    this.seriesBiasMid = null;

    this.masterChart = this.options.masterChart;
    this.rawData1X = this.options.data1X.length > 0 ? this.options.data1X : (this.options.rawData1X || []);
    this.rawData2X = this.options.data2X.length > 0 ? this.options.data2X : (this.options.rawData2X || []);
    this.sym1X = this.options.sym1X || this.options.proxyTicker || '0050';
    this.sym2X = this.options.sym2X || this.options.ticker || '00631L';
    this.biasBase = this.options.biasBase;
    this.signalPeriod = this.options.signalPeriod || 10;
    this.signalMode = this.options.signalMode || 'alert';
    this.heightSub = parseInt(localStorage.getItem('dualbear_subcharts_h_sub') || '185', 10);
    this.heightBias = parseInt(localStorage.getItem('dualbear_subcharts_h_bias') || '205', 10);

    this.subRatioList = [];
    this.subRatioMap = new Map();
    this.subSignalData = null;

    this.biasList = [];
    this.biasMap = new Map();

    this._initDom();
    this._initCharts();
    this._calculateAndRender();
    this._bindMasterSync();
    this._bindCrosshairSync();
  }

  DualBearSubCharts.prototype._initDom = function () {
    const sym1X = this.sym1X || '0050';
    const sym2X = this.sym2X || '00631L';
    const biasTargetSym = (this.biasBase === 'lev') ? sym2X : sym1X;

    this.mount.innerHTML = `
      <!-- 副圖 2：正2 槓桿效率比 -->
      <div id="dbBlockSubChart" class="subchart-block chart-block" data-panel="subratio" data-subpanel="subratio">
        <div class="subchart-header">
          <div class="subchart-title-wrap">
            <span class="subchart-title" id="dbTitleSubText">⚡ 正2 槓桿效率比 [ <span style="color:#f59e0b;">${sym2X}</span> / <span style="color:#38bdf8;">${sym1X}</span> ]</span>
            <span id="dbBadgeSubStatus" class="subchart-status-badge">計算中...</span>
          </div>
          <div class="subchart-btn-group">
            <!-- 🎯 預警 / 確立雙分段切換按鈕 (1:1 Segmented Toggle) -->
            <div class="subchart-signal-mode-group" id="dbGroupSignalMode" role="group" aria-label="訊號判定模式">
              <button type="button" class="subchart-signal-mode-btn ${this.signalMode === 'alert' ? 'is-active' : ''}" id="dbBtnSignalAlert" title="【預警模式】Close > MA 做頭摸頂 / Close < MA 摸底抄底">預警</button>
              <button type="button" class="subchart-signal-mode-btn ${this.signalMode === 'confirm' ? 'is-active' : ''}" id="dbBtnSignalConfirm" title="【確立模式】Close < MA 失守做頭確認 / Close > MA 站上打底確認">確立</button>
            </div>
            <button type="button" class="subchart-btn chart-action-btn chart-move-up" id="dbBtnUpSub" data-panel="subratio" title="將正2效率比副圖上移">▲</button>
            <button type="button" class="subchart-btn chart-action-btn chart-move-down" id="dbBtnDownSub" data-panel="subratio" title="將正2效率比副圖下移">▼</button>
            <button type="button" class="subchart-btn chart-action-btn chart-collapse" id="dbBtnCollapseSub" data-panel="subratio" title="收折/展開副圖">👁️</button>
          </div>
        </div>
        <div class="subchart-collapsible-area" id="dbCollapsibleSub">
          <div class="subchart-legend-bar">
            <span class="subchart-legend-item">0.00 基準軸 (虛線)</span>
            <span class="subchart-legend-item subchart-legend-bull">■ 正向複利 (&gt;1.0)</span>
            <span class="subchart-legend-item subchart-legend-bear">■ 震盪磨損 (&lt;1.0)</span>
            <span class="subchart-legend-item subchart-legend-sup-trigger">🔵 支撐打底 (點火)</span>
            <span class="subchart-legend-item subchart-legend-sup-hold">🔷 多頭守護 (延伸)</span>
            <span class="subchart-legend-item subchart-legend-res-trigger">🟡 壓力做頭 (點火)</span>
            <span class="subchart-legend-item subchart-legend-res-hold">🔶 空頭防守 (延伸)</span>
          </div>
          <div class="subchart-canvas-box" id="dbSubCanvasBox"></div>
          <div class="subchart-resizer-bar" id="dbResizerSub" title="按住拖曳調整正2效率比高度">
            <div class="subchart-resizer-handle"></div>
          </div>
        </div>
      </div>

      <!-- 副圖 3：大週期均線乖離率與資金階梯 -->
      <div id="dbBlockBiasChart" class="subchart-block chart-block" data-panel="bias" data-subpanel="bias">
        <div class="subchart-header">
          <div class="subchart-title-wrap">
            <span class="subchart-title" id="dbTitleBiasText">🏛️ 大週期均線乖離率與建議資金配置階梯 [ <span style="color:#38bdf8;">${biasTargetSym}</span> ${this.biasBase === 'lev' ? '正2' : '原型'} ]</span>
            <span id="dbBadgeBiasStatus" class="subchart-status-badge">計算中...</span>
          </div>
          <div class="subchart-btn-group">
            <button type="button" class="subchart-btn ${this.biasBase === 'proxy' ? 'is-active' : ''}" id="dbBtnBiasProxy" title="原型基準 (00662/0050)">原型</button>
            <button type="button" class="subchart-btn ${this.biasBase === 'lev' ? 'is-active' : ''}" id="dbBtnBiasLev" title="正2基準 (00670L/00631L)">正2</button>
            <button type="button" class="subchart-btn chart-action-btn chart-move-up" id="dbBtnUpBias" data-panel="bias" title="將大週期階梯副圖上移">▲</button>
            <button type="button" class="subchart-btn chart-action-btn chart-move-down" id="dbBtnDownBias" data-panel="bias" title="將大週期階梯副圖下移">▼</button>
            <button type="button" class="subchart-btn chart-action-btn chart-collapse" id="dbBtnCollapseBias" data-panel="bias" title="收折/展開副圖">👁️</button>
          </div>
        </div>
        <div class="subchart-collapsible-area" id="dbCollapsibleBias">
          <div class="subchart-legend-bar" id="dbLegendBiasBar">
            <span class="subchart-legend-item subchart-legend-tier">■ 建議累積資金階梯 % (浮動標籤: 0/20/50/85/100%)</span>
            <span class="subchart-legend-item subchart-legend-bias" id="lbl-legend-bias-pct">─ 基準線乖離率 % (右軸)</span>
            <span class="subchart-legend-item" id="lbl-legend-bias-2y" style="color:#22c55e;">─ 短階長線 (試單 20%)</span>
            <span class="subchart-legend-item" id="lbl-legend-bias-mid" style="color:#f59e0b;">─ 兩線中線 (加碼 50%)</span>
            <span class="subchart-legend-item" id="lbl-legend-bias-5y" style="color:#ffffff;">─ 長階基準線 (滿倉 85~100%)</span>
          </div>
          <div class="subchart-canvas-box" id="dbBiasCanvasBox"></div>
          <div class="subchart-resizer-bar" id="dbResizerBias" title="按住拖曳調整階梯副圖高度">
            <div class="subchart-resizer-handle"></div>
          </div>
        </div>
      </div>
    `;

    this._bindDomEvents();
  };

  DualBearSubCharts.prototype._bindDomEvents = function () {
    const self = this;

    // 順位調整 ▲ / ▼（由頂層容器事件委派統一處理，此處留空避免重複綁定觸發跳2層）
    const btnUpSub = document.getElementById('dbBtnUpSub');
    const btnDownSub = document.getElementById('dbBtnDownSub');
    const btnUpBias = document.getElementById('dbBtnUpBias');
    const btnDownBias = document.getElementById('dbBtnDownBias');
    if (btnUpSub) btnUpSub.onclick = null;
    if (btnDownSub) btnDownSub.onclick = null;
    if (btnUpBias) btnUpBias.onclick = null;
    if (btnDownBias) btnDownBias.onclick = null;

    // 收折按鈕：已收編至 app-chart.js 頂層容器事件委派（toggleChartPanelVisibility）統一管理，
    // 此處必須清空 onclick，否則與委派雙重 toggle 互相抵消（▲/▼ 亦同，見上方 L549-557）。
    const btnSub = document.getElementById('dbBtnCollapseSub');
    const btnBias = document.getElementById('dbBtnCollapseBias');
    if (btnSub) btnSub.onclick = null;
    if (btnBias) btnBias.onclick = null;

    // 基準切換 (原型 vs 正2)
    const btnProxy = document.getElementById('dbBtnBiasProxy');
    const btnLev = document.getElementById('dbBtnBiasLev');
    if (btnProxy && btnLev) {
      btnProxy.onclick = function () {
        btnProxy.classList.add('is-active');
        btnLev.classList.remove('is-active');
        self.biasBase = 'proxy';
        localStorage.setItem('dualbear_subcharts_bias_base', 'proxy');
        self._updateTitleText();
        self._calculateAndRenderBias();
      };
      btnLev.onclick = function () {
        btnLev.classList.add('is-active');
        btnProxy.classList.remove('is-active');
        self.biasBase = 'lev';
        localStorage.setItem('dualbear_subcharts_bias_base', 'lev');
        self._updateTitleText();
        self._calculateAndRenderBias();
      };
    }

    // 🎯 預警 / 確立雙分段按鈕點擊事件 (1:1 還原 Leverage Monitor 規格)
    const btnAlert = document.getElementById('dbBtnSignalAlert');
    const btnConfirm = document.getElementById('dbBtnSignalConfirm');
    if (btnAlert && btnConfirm) {
      btnAlert.onclick = function () {
        if (self.signalMode === 'alert') return;
        self.signalMode = 'alert';
        localStorage.setItem('dualbear_subcharts_signal_mode', 'alert');
        self._updateTriggerModeBtnUI();
        self._calculateAndRenderLeverage();
      };
      btnConfirm.onclick = function () {
        if (self.signalMode === 'confirm') return;
        self.signalMode = 'confirm';
        localStorage.setItem('dualbear_subcharts_signal_mode', 'confirm');
        self._updateTriggerModeBtnUI();
        self._calculateAndRenderLeverage();
      };
    }

    // 4. 綁定高度拖曳調整手柄 (Resizer Bar)
    this._bindResizers();

    window.addEventListener('resize', () => {
      self._resizeCharts();
    });
  };

  DualBearSubCharts.prototype._updateTriggerModeBtnUI = function () {
    const btnAlert = document.getElementById('dbBtnSignalAlert');
    const btnConfirm = document.getElementById('dbBtnSignalConfirm');
    if (btnAlert && btnConfirm) {
      btnAlert.classList.toggle('is-active', this.signalMode === 'alert');
      btnConfirm.classList.toggle('is-active', this.signalMode === 'confirm');
    }
  };

  DualBearSubCharts.prototype._bindResizers = function () {
    const self = this;

    const setupDrag = (handleId, boxId, heightProp, storageKey, chartProp, minH = 100, maxH = 500) => {
      const handle = document.getElementById(handleId);
      const box = document.getElementById(boxId);
      if (!handle || !box) return;

      let startY = 0;
      let startH = 0;
      let isDragging = false;

      const onPointerMove = (e) => {
        if (!isDragging) return;
        const deltaY = e.clientY - startY;
        let newH = Math.max(minH, Math.min(maxH, startH + deltaY));
        box.style.height = `${newH}px`;
        self[heightProp] = newH;
        if (self[chartProp]) {
          self[chartProp].resize(box.clientWidth, newH);
        }
      };

      const onPointerUp = () => {
        if (!isDragging) return;
        isDragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        localStorage.setItem(storageKey, self[heightProp]);
      };

      handle.addEventListener('pointerdown', (e) => {
        isDragging = true;
        startY = e.clientY;
        startH = box.clientHeight;
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        e.preventDefault();
      });
    };

    setupDrag('dbResizerSub', 'dbSubCanvasBox', 'heightSub', 'dualbear_subcharts_h_sub', 'chartSub', 120, 450);
    setupDrag('dbResizerBias', 'dbBiasCanvasBox', 'heightBias', 'dualbear_subcharts_h_bias', 'chartBias', 140, 500);
  };

  DualBearSubCharts.prototype._resizeCharts = function () {
    const subBox = document.getElementById('dbSubCanvasBox');
    const biasBox = document.getElementById('dbBiasCanvasBox');
    if (subBox && this.chartSub) {
      const w = subBox.clientWidth;
      if (w > 50) this.chartSub.resize(w, this.heightSub || 185);
    }
    if (biasBox && this.chartBias) {
      const w = biasBox.clientWidth;
      if (w > 50) this.chartBias.resize(w, this.heightBias || 205);
    }
  };

  /**
   * 方案 A：建立大週期乖離率階梯（0/20/50/85/100%）浮動標籤層。
   * 左軸已隱藏以統一各圖有效繪圖區寬度，原由 LWC 軸標籤繪製的百分比改由本 DOM 層承接。
   * 位置完全由 CSS class 的固定百分比定義（autoscaleInfoProvider 鎖定 0~100），
   * 符合「JS 不碰 style、只切 class」的前端鐵律。
   */
  DualBearSubCharts.prototype._buildBiasTierFloatLabels = function (stepLevels, biasBox) {
    if (!biasBox || this._biasFloatLayer) return;
    const layer = document.createElement('div');
    layer.className = 'subchart-bias-float-layer';
    stepLevels.forEach(step => {
      const lbl = document.createElement('div');
      lbl.className = `subchart-bias-tier-label tier-${step.price}`;
      lbl.textContent = step.label;
      layer.appendChild(lbl);
    });
    biasBox.appendChild(layer);
    this._biasFloatLayer = layer;
  };

  DualBearSubCharts.prototype._initCharts = function () {
    if (typeof LightweightCharts === 'undefined') {
      console.warn('[DualBearSubCharts] 未檢測到 LightweightCharts 函式庫，副圖以純狀態條模式運作。');
      return;
    }

    const subBox = document.getElementById('dbSubCanvasBox');
    const biasBox = document.getElementById('dbBiasCanvasBox');
    this.chartSubElement = subBox;
    this.chartBiasElement = biasBox;

    const commonOpts = {
      layout: { background: { color: '#0b0f19' }, textColor: '#94a3b8' },
      // 🎯 外觀 SSOT：格線色值與軸寬六圖共用（ChartAppearance）
      grid: { vertLines: { color: ChartAppearance.grid.vertColor }, horzLines: { color: ChartAppearance.grid.horzColor } },
      timeScale: {
        visible: false,
        borderColor: '#334155'
      },
      rightPriceScale: {
        visible: true,
        borderColor: '#334155',
        minimumWidth: ChartAppearance.frame.rightAxisWidth
      },
      leftPriceScale: {
        visible: false,
        minimumWidth: ChartAppearance.frame.leftAxisWidth
      },
      // 🔒 嚴格禁用圖表內部滾輪縮放，徹底放行瀏覽器頁面垂直滾動！
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: false,
        horzTouchDrag: false,
        vertTouchDrag: false
      },
      handleScale: {
        mouseWheel: false,
        pinch: false,
        axisPressedMouseMove: false,
        axisDoubleClickReset: false
      },
      // 🎯 游標垂直虛線底部日期標籤：走日期軸 SSOT（YYYY-MM-DD），
      //    覆寫 LWC 內建 dd MMM 'yy，timeVisible:true 時也不帶出時間。
      localization: { timeFormatter: ChartSuiteDateAxis.format },
      crosshair: {
        vertLine: {
          color: ChartAppearance.crosshair.vertColor,
          width: ChartAppearance.crosshair.width,
          style: ChartAppearance.crosshair.style, // Dashed
          visible: true,
          labelVisible: ChartAppearance.crosshair.vertLabelVisible // 👈 垂直線日期標籤六圖同步顯示
        },
        horzLine: {
          color: ChartAppearance.crosshair.horzColor,
          width: ChartAppearance.crosshair.width,
          style: ChartAppearance.crosshair.style, // Dashed
          visible: true,
          labelVisible: ChartAppearance.crosshair.horzLabelVisible
        }
      }
    };

    const initialW = (subBox && subBox.clientWidth > 50) ? subBox.clientWidth : 800;

    // ══════ 1. 初始化副圖 2 (正2 槓桿效率比) ══════
    if (subBox) {
      if (this.heightSub) subBox.style.height = `${this.heightSub}px`;
      this.chartSub = LightweightCharts.createChart(subBox, Object.assign({}, commonOpts, {
        width: initialW,
        height: this.heightSub || 185,
        timeScale: {
          visible: true,
          borderColor: '#334155',
          timeVisible: true,
          secondsVisible: false,
          tickMarkFormatter: ChartSuiteDateAxis.format
        }
      }));

      // 基準線：以 1.0 為分水嶺 (紅 > 1.0 爆發, 綠 < 1.0 磨損)
      this.seriesSubRatio = this.chartSub.addBaselineSeries({
        baseValue: { type: 'price', price: 1.0 },
        topLineColor: '#ef4444',
        bottomLineColor: '#22c55e',
        lineWidth: 2,
        autoscaleInfoProvider: (original) => {
          const res = original();
          if (!res || !res.priceRange) return res;
          const maxAbs = Math.max(Math.abs(res.priceRange.maxValue), Math.abs(res.priceRange.minValue), 1.0);
          return {
            priceRange: {
              minValue: -maxAbs,
              maxValue: maxAbs,
            },
          };
        }
      });

      // 0.00 基準水平虛線
      this.seriesSubRatio.createPriceLine({
        price: 0.0,
        color: '#475569',
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: false,
        title: ''
      });

      // 頂部壓力守護 (灰/橘) 系列
      this.seriesResHolding = this.chartSub.addLineSeries({
        color: 'rgba(245, 158, 11, 0.45)', // 🔶 空頭防守延伸
        lineWidth: 1,
        lineVisible: false,
        pointMarkersVisible: true,
        pointMarkersRadius: 4,
        priceScaleId: 'scale_res_top',
        lastValueVisible: false,
        priceLineVisible: false
      });
      this.seriesResPoints = this.chartSub.addLineSeries({
        color: '#f59e0b', // 🟡 壓力做頭點火
        lineWidth: 1,
        lineVisible: false,
        pointMarkersVisible: true,
        pointMarkersRadius: 5,
        priceScaleId: 'scale_res_top',
        lastValueVisible: false,
        priceLineVisible: false
      });
      this.chartSub.priceScale('scale_res_top').applyOptions({
        scaleMargins: { top: 0.05, bottom: 0.90 },
        visible: false
      });

      // 底部多頭守護 (灰/藍) 系列
      this.seriesSupHolding = this.chartSub.addLineSeries({
        color: 'rgba(56, 189, 248, 0.45)', // 🔷 多頭守護延伸
        lineWidth: 1,
        lineVisible: false,
        pointMarkersVisible: true,
        pointMarkersRadius: 4,
        priceScaleId: 'scale_sup_bottom',
        lastValueVisible: false,
        priceLineVisible: false
      });
      this.seriesSupPoints = this.chartSub.addLineSeries({
        color: '#38bdf8', // 🔵 支撐打底點火
        lineWidth: 1,
        lineVisible: false,
        pointMarkersVisible: true,
        pointMarkersRadius: 5,
        priceScaleId: 'scale_sup_bottom',
        lastValueVisible: false,
        priceLineVisible: false
      });
      this.chartSub.priceScale('scale_sup_bottom').applyOptions({
        scaleMargins: { top: 0.90, bottom: 0.05 },
        visible: false
      });
    }

    // ══════ 2. 初始化副圖 3 (大週期 5 年線乖離率與資金階梯) ══════
    if (biasBox) {
      if (this.heightBias) biasBox.style.height = `${this.heightBias}px`;
      this.chartBias = LightweightCharts.createChart(biasBox, Object.assign({}, commonOpts, {
        width: initialW,
        height: this.heightBias || 205,
        timeScale: {
          visible: true,
          borderColor: '#334155',
          timeVisible: true,
          secondsVisible: false,
          tickMarkFormatter: ChartSuiteDateAxis.format
        },
        // 🔒 方案 A：左軸改浮動標籤——隱藏實體左軸，徹底統一各圖有效繪圖區寬度
        leftPriceScale: {
          visible: false,
          borderColor: '#334155',
          minimumWidth: ChartAppearance.frame.leftAxisWidth
        },
        rightPriceScale: {
          visible: true,
          borderColor: '#334155',
          minimumWidth: ChartAppearance.frame.rightAxisWidth
        }
      }));

      // 建議累積資金長條圖 (0% ~ 100%)：尺度仍鎖定 0~100，僅軸標籤改由 DOM 浮動層顯示
      this.seriesBiasTier = this.chartBias.addHistogramSeries({
        priceScaleId: 'left',
        color: 'rgba(56, 189, 248, 0.45)',
        lastValueVisible: false,
        priceLineVisible: false,
        priceFormat: {
          type: 'custom',
          formatter: () => ''
        },
        autoscaleInfoProvider: () => ({
          priceRange: {
            minValue: 0,
            maxValue: 100
          }
        })
      });

      // 🎯 為階梯（0%、20%、50%、85%、100%）建立 100% 必定顯示的水平線
      //    左軸已隱藏 → axisLabelVisible 改 false，標籤改由 DOM 浮動層顯示（見 _buildBiasTierFloatLabels）
      const stepLevels = [
        { price: 0, color: '#94a3b8', lineWidth: 1, lineStyle: 0, label: '0%' },
        { price: 20, color: '#c084fc', lineWidth: 1.5, lineStyle: 2, label: '20%' },
        { price: 50, color: '#38bdf8', lineWidth: 1.5, lineStyle: 2, label: '50%' },
        { price: 85, color: '#fbbf24', lineWidth: 1.5, lineStyle: 2, label: '85%' },
        { price: 100, color: '#f87171', lineWidth: 1.5, lineStyle: 2, label: '100%' }
      ];
      stepLevels.forEach(step => {
        this.seriesBiasTier.createPriceLine({
          price: step.price,
          color: step.color,
          lineWidth: step.lineWidth,
          lineStyle: step.lineStyle,
          axisLabelVisible: false,
          title: step.label
        });
      });
      this._buildBiasTierFloatLabels(stepLevels, biasBox);

      // 右軸：5 年線乖離率折線 % (🔒 保證垂直刻度恆常包含 0.0% 5年線基準水平白線)
      this.seriesBiasPct = this.chartBias.addLineSeries({
        priceScaleId: 'right',
        color: '#ef4444',
        lineWidth: 2,
        lastValueVisible: true,
        priceLineVisible: false,
        priceFormat: {
          type: 'custom',
          formatter: (price) => `${price >= 0 ? '+' : ''}${price.toFixed(1)}%`
        },
        autoscaleInfoProvider: (original) => {
          const res = original();
          if (!res || !res.priceRange) return res;
          return {
            priceRange: {
              minValue: Math.min(res.priceRange.minValue, -5.0),
              maxValue: Math.max(res.priceRange.maxValue, 25.0)
            }
          };
        }
      });

      // 右軸：破 2 年線動態門檻折線 (綠色實線：試單 20%)
      this.seriesBias2y = this.chartBias.addLineSeries({
        priceScaleId: 'right',
        color: '#22c55e',
        lineWidth: 1.5,
        lineStyle: 0, // Solid (實線)
        lastValueVisible: true,
        priceLineVisible: false
      });

      // 右軸：兩線中線動態門檻折線 (黃色實線：加碼 50%)
      this.seriesBiasMid = this.chartBias.addLineSeries({
        priceScaleId: 'right',
        color: '#f59e0b',
        lineWidth: 1.5,
        lineStyle: 0, // Solid (實線)
        lastValueVisible: true,
        priceLineVisible: false
      });

      // 右軸：5 年線 0.0% 基準水平白線 (觸及 85% / 破線 100%)
      this.seriesBiasPct.createPriceLine({
        price: 0.0,
        color: '#ffffff',
        lineWidth: 1.5,
        lineStyle: 0, // Solid
        axisLabelVisible: true,
        title: '5Y 0.0%'
      });


    }

    setTimeout(() => {
      this._resizeCharts();
    }, 100);
  };

  DualBearSubCharts.prototype._calculateAndRender = function () {
    this._calculateAndRenderLeverage();
    this._calculateAndRenderBias();
  };

  DualBearSubCharts.prototype._calculateAndRenderLeverage = function () {
    const list = SubChartMath.calcLeverageRatio(this.rawData1X, this.rawData2X);
    this.subRatioList = list;
    this.subRatioMap.clear();
    list.forEach(item => this.subRatioMap.set(item.time, item.value));

    // 計算 1:1 散點信號
    const activeCandles = this.rawData2X.length > 0 ? this.rawData2X : this.rawData1X;
    const signals = SubChartMath.calcSignals(
      this.rawData1X,
      activeCandles,
      list,
      this.signalPeriod,
      this.signalMode
    );
    this.subSignalData = signals;

    const badge = document.getElementById('dbBadgeSubStatus');
    if (list.length > 0) {
      if (badge) {
        const valStr = (signals.latestRatio >= 0 ? '+' : '') + signals.latestRatio.toFixed(2);
        let icon = '⚪';
        let cls = 'badge-wait';
        if (signals.latestType === 'sup_trigger') {
          icon = '🔵'; cls = 'badge-bull';
        } else if (signals.latestType === 'sup_holding') {
          icon = '🔷'; cls = 'badge-bull';
        } else if (signals.latestType === 'res_trigger') {
          icon = '🟡'; cls = 'badge-bear';
        } else if (signals.latestType === 'res_holding') {
          icon = '🔶'; cls = 'badge-bear';
        }
        const modeText = (this.signalMode === 'alert') ? '預警' : '確立';
        badge.innerText = `${this.signalPeriod}MA ${modeText} ｜ 效率比: ${valStr} ｜ ${icon} ${signals.latestStatus}`;
        badge.className = `subchart-status-badge ${cls}`;
      }

      if (this.seriesSubRatio) {
        this.seriesSubRatio.setData(list);
      }
      if (this.seriesResPoints) {
        this.seriesResPoints.setData(signals.resPoints);
      }
      if (this.seriesSupPoints) {
        this.seriesSupPoints.setData(signals.supPoints);
      }
      if (this.seriesResHolding) {
        this.seriesResHolding.setData(signals.resHolding);
      }
      if (this.seriesSupHolding) {
        this.seriesSupHolding.setData(signals.supHolding);
      }
    } else {
      if (badge) {
        badge.innerText = '等待行情數據...';
        badge.className = 'subchart-status-badge badge-wait';
      }
    }
  };

  DualBearSubCharts.prototype._calculateAndRenderBias = function () {
    const targetData = (this.biasBase === 'lev') ? this.rawData2X : this.rawData1X;
    const res = SubChartMath.calc5YearBiasAndTiers(targetData, {
      interval: this.interval || '1d',
      period2Y: this.period2Y,
      period5Y: this.period5Y
    });
    this.biasList = res.cachedList;
    this.biasMap.clear();
    res.cachedList.forEach(item => this.biasMap.set(item.time, item));

    // 動態更新圖例 (方案 A：智慧年數標籤，不寫死 2Y / 5Y)
    const curInt = this.interval || '1d';
    const barsPerY = (curInt === '1mo') ? 12 : (curInt === '1wk' ? 52 : 240);
    const y2 = (res.p2y / barsPerY).toFixed(1);
    const y5 = (res.p5y / barsPerY).toFixed(1);
    const yMid = (res.pMid / barsPerY).toFixed(1);

    const legPct = document.getElementById('lbl-legend-bias-pct');
    const leg2Y = document.getElementById('lbl-legend-bias-2y');
    const legMid = document.getElementById('lbl-legend-bias-mid');
    const leg5Y = document.getElementById('lbl-legend-bias-5y');
    if (legPct) legPct.textContent = `─ ${y5}Y 基準乖離率 % (右軸)`;
    if (leg2Y) leg2Y.textContent = `─ 短線 ${y2}Y (試單 20%)`;
    if (legMid) legMid.textContent = `─ 中線 ${yMid}Y (加碼 50%)`;
    if (leg5Y) leg5Y.textContent = `─ 長線 ${y5}Y (滿倉 85~100%)`;

    const badge = document.getElementById('dbBadgeBiasStatus');
    if (res.cachedList.length > 0) {
      const last = res.cachedList[res.cachedList.length - 1];
      if (badge) {
        const biasStr = (last.biasPct >= 0 ? '+' : '') + last.biasPct.toFixed(1) + '%';
        badge.innerText = `基準乖離: ${biasStr} ｜ 建議累積: ${last.tier}%`;
        badge.className = `subchart-status-badge ${last.badgeCls}`;
      }
      if (this.seriesBiasTier) {
        this.seriesBiasTier.setData(res.allocData);
      }
      if (this.seriesBiasPct) {
        this.seriesBiasPct.setData(res.biasData);
      }
      if (this.seriesBias2y) {
        this.seriesBias2y.setData(res.bias2yData);
      }
      if (this.seriesBiasMid) {
        this.seriesBiasMid.setData(res.biasMidData);
      }
    } else {
      if (badge) {
        badge.innerText = '等待大週期階梯數據...';
        badge.className = 'subchart-status-badge badge-wait';
      }
    }
  };

  DualBearSubCharts.prototype._bindMasterSync = function () {
    if (!this.masterChart) return;
    const self = this;
    try {
      this.masterChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (!range) return;

        // Chart Suite 模式：master 與副圖基座未必同序列 → 統一中樞以日期廣播
        // （目前 masterChart 恆為 null，此路徑休眠；保留導向以避免未來接入時又多一個寫入點）
        if (typeof window !== 'undefined' && window.ChartSuite && window.ChartSuiteTimeSync) {
          const vr = self.masterChart.timeScale().getVisibleRange();
          const norm = window.ChartSuiteTimeSync.normalizeDate;
          const sDate = norm(vr && vr.from);
          const eDate = norm(vr && vr.to);
          if (sDate && eDate) window.ChartSuite.setRange(sDate, eDate, 'subcharts');
          return;
        }

        // 舊路徑（一般版 / 無 ChartSuite）：維持原有邏輯索引同步
        if (self.chartSub) self.chartSub.timeScale().setVisibleLogicalRange(range);
        if (self.chartBias) self.chartBias.timeScale().setVisibleLogicalRange(range);
      });
    } catch (e) {
      console.warn('[DualBearSubCharts] 訂閱主圖時間軸異常:', e);
    }
  };

  DualBearSubCharts.prototype._bindCrosshairSync = function () {
    const self = this;

    // Chart Suite 模式：來源回呼統一導向中樞，由中樞做來源排除 + 日期去重，根除無限回饋迴圈。
    // 一般版（無 ChartSuite）維持舊路徑，行為不變（Phase 4 再接）。
    const hasSuite = (typeof window !== 'undefined' && window.ChartSuite);

    if (this.chartSub) {
      this.chartSub.subscribeCrosshairMove(param => {
        if (!param || !param.time) return;
        if (hasSuite) {
          window.ChartSuite.setCrosshair(param.time, 'subcharts');
        } else {
          self.showCrosshairAtDate(param.time, 'sub');
        }
      });
    }
    if (this.chartBias) {
      this.chartBias.subscribeCrosshairMove(param => {
        if (!param || !param.time) return;
        if (hasSuite) {
          window.ChartSuite.setCrosshair(param.time, 'subcharts');
        } else {
          self.showCrosshairAtDate(param.time, 'bias');
        }
      });
    }
  };

  DualBearSubCharts.prototype.updateData = function (data1X, data2X, sym1X, sym2X, interval) {
    this.rawData1X = data1X || [];
    this.rawData2X = data2X || [];
    if (sym1X) this.sym1X = sym1X;
    if (sym2X) this.sym2X = sym2X;
    if (interval) this.interval = interval;
    this._updateTitleText();
    this._calculateAndRender();
  };

  DualBearSubCharts.prototype._updateTitleText = function () {
    const elSub = document.getElementById('dbTitleSubText');
    const elBias = document.getElementById('dbTitleBiasText');
    const sym1X = this.sym1X || '0050';
    const sym2X = this.sym2X || '00631L';
    const biasTargetSym = (this.biasBase === 'lev') ? sym2X : sym1X;

    if (elSub) {
      elSub.innerHTML = `⚡ 正2 槓桿效率比 [ <span style="color:#f59e0b;">${sym2X}</span> / <span style="color:#38bdf8;">${sym1X}</span> ]`;
    }
    if (elBias) {
      elBias.innerHTML = `🏛️ 大週期均線乖離率與建議資金配置階梯 [ <span style="color:#38bdf8;">${biasTargetSym}</span> ${this.biasBase === 'lev' ? '正2' : '原型'} ]`;
    }
  };

  DualBearSubCharts.prototype.syncToTimeRange = function (startDate, endDate) {
    if (!endDate) return;

    if (startDate && endDate) {
      try {
        const range = { from: startDate, to: endDate };
        if (this.chartSub) this.chartSub.timeScale().setVisibleRange(range);
        if (this.chartBias) this.chartBias.timeScale().setVisibleRange(range);
      } catch (e) {}
    }

    // 動態同步副圖 2
    const ratioVal = this._lookupAsOf(this.subRatioList, endDate, item => item.value);
    const badgeSub = document.getElementById('dbBadgeSubStatus');
    if (badgeSub && ratioVal !== undefined) {
      const valStr = (ratioVal >= 0 ? '+' : '') + ratioVal.toFixed(2);
      let dayStatus = '無訊號 (盤整中)';
      let icon = '⚪';
      let cls = 'badge-wait';
      if (this.subSignalData && this.subSignalData.signalList) {
        const sigObj = this._lookupAsOf(this.subSignalData.signalList, endDate, item => item);
        if (sigObj) {
          dayStatus = sigObj.status;
          if (sigObj.type === 'sup_trigger') { icon = '🔵'; cls = 'badge-bull'; }
          else if (sigObj.type === 'sup_holding') { icon = '🔷'; cls = 'badge-bull'; }
          else if (sigObj.type === 'res_trigger') { icon = '🟡'; cls = 'badge-bear'; }
          else if (sigObj.type === 'res_holding') { icon = '🔶'; cls = 'badge-bear'; }
        }
      }
      const modeText = (this.signalMode === 'alert') ? '預警' : '確立';
      badgeSub.innerText = `${this.signalPeriod}MA ${modeText} ｜ 效率比: ${valStr} ｜ ${icon} ${dayStatus}`;
      badgeSub.className = `subchart-status-badge ${cls}`;
    }

    // 動態同步副圖 3
    const biasObj = this._lookupAsOf(this.biasList, endDate, item => item);
    const badgeBias = document.getElementById('dbBadgeBiasStatus');
    if (badgeBias && biasObj !== undefined) {
      const biasStr = (biasObj.biasPct >= 0 ? '+' : '') + biasObj.biasPct.toFixed(1) + '%';
      badgeBias.innerText = `基準乖離: ${biasStr} ｜ 建議累積: ${biasObj.tier}%`;
      badgeBias.className = `subchart-status-badge ${biasObj.badgeCls}`;
    }
  };

  /**
   * 【純設定】僅設定兩副圖自身的十字線位置，不對外廣播。
   * 供 ChartSuite adapter 呼叫，避免 setCrosshairPosition → subscribeCrosshairMove → 再廣播的迴圈。
   */
  DualBearSubCharts.prototype.setCrosshairFromSuite = function (targetDate) {
    if (!targetDate) return;
    try {
      if (this.chartSub && this.seriesSubRatio) {
        const val = this.subRatioMap.get(targetDate) ?? 1.0;
        this.chartSub.setCrosshairPosition(val, targetDate, this.seriesSubRatio);
      }
      if (this.chartBias && this.seriesBiasPct) {
        const biasObj = this.biasMap.get(targetDate);
        const val = biasObj ? biasObj.biasPct : 0.0;
        this.chartBias.setCrosshairPosition(val, targetDate, this.seriesBiasPct);
      }
    } catch (e) {}
  };

  DualBearSubCharts.prototype.showCrosshairAtDate = function (targetDate, source) {
    if (!targetDate) return;

    // Chart Suite 模式：導向中樞統一廣播（中樞會排除來源、日期去重），不再自行互斥分支。
    if (typeof window !== 'undefined' && window.ChartSuite && !source) {
      window.ChartSuite.setCrosshair(targetDate, 'subcharts');
      return;
    }

    // 1. 若十字線來自外部 (如主圖滑動)，設定副圖內部的十字線位置
    if (!source) {
      this.setCrosshairFromSuite(targetDate);
    }

    // 2. 若十字線來自副圖本身，反向廣播驅動主圖繪製
    if (source && typeof window.setZenGridCrosshairDate === 'function') {
      window.setZenGridCrosshairDate(targetDate);
    }
  };

  DualBearSubCharts.prototype.hideCrosshair = function () {
    try {
      if (this.chartSub) this.chartSub.clearCrosshairPosition();
      if (this.chartBias) this.chartBias.clearCrosshairPosition();
    } catch (e) {}
  };

  DualBearSubCharts.prototype._lookupAsOf = function (list, targetDate, valueExtractor) {
    if (!list || list.length === 0 || !targetDate) return undefined;
    let low = 0;
    let high = list.length - 1;
    let bestIdx = -1;

    while (low <= high) {
      const mid = (low + high) >> 1;
      if (list[mid].time <= targetDate) {
        bestIdx = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    if (bestIdx !== -1) {
      return valueExtractor(list[bestIdx]);
    }
    return undefined;
  };

  DualBearSubCharts.SubChartMath = SubChartMath;

  return DualBearSubCharts;
});
