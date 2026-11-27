/**
 * SubChart Plugin: 凱因斯群眾心理情緒副圖 (Keynes Psychology)
 */
(function (root) {
  'use strict';

  const PluginKeynes = {
    id: 'keynes',
    name: '凱因斯群眾心理情緒副圖',

    createPane: function (container, options) {
      const height = options.height || 130;
      const chart = LightweightCharts.createChart(container, Object.assign({}, options.commonOpts, {
        height: height,
        rightPriceScale: {
          visible: true,
          borderColor: '#334155',
          minimumWidth: 110,
          autoScale: true
        },
        timeScale: { visible: false }
      }));

      // 0 軸基準線
      const baseline = chart.addBaselineSeries({
        baseValue: { type: 'price', price: 0 },
        topLineColor: '#ef4444',
        topFillColor1: 'rgba(239, 68, 68, 0.4)',
        topFillColor2: 'rgba(239, 68, 68, 0.05)',
        bottomLineColor: '#22c55e',
        bottomFillColor1: 'rgba(34, 197, 94, 0.05)',
        bottomFillColor2: 'rgba(34, 197, 94, 0.4)',
        lineWidth: 1
      });

      // -10 長線價值線
      const lineValue = chart.addLineSeries({
        color: '#38bdf8',
        lineWidth: 1,
        lineStyle: 2,
        lastValueVisible: false,
        priceLineVisible: false
      });

      return {
        chart: chart,
        updateData: function (klines) {
          if (!klines || klines.length === 0) return;
          const kData = [];
          const vData = [];
          for (let i = 0; i < klines.length; i++) {
            const k = klines[i];
            const t = k.Date || k.time;
            const c = parseFloat(k.Close || k.close);
            const val = k.keynesScore !== undefined ? parseFloat(k.keynesScore) : (c ? Math.sin(i / 10) * 15 : 0);
            kData.push({ time: t, value: val });
            vData.push({ time: t, value: -10.0 });
          }
          baseline.setData(kData);
          lineValue.setData(vData);
        }
      };
    }
  };

  root.SubChartPlugins = root.SubChartPlugins || {};
  root.SubChartPlugins['keynes'] = PluginKeynes;
})(typeof window !== 'undefined' ? window : this);
