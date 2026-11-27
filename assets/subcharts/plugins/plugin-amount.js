/**
 * SubChart Plugin: 成交金額與均額線 (Dollar Volume)
 */
(function (root) {
  'use strict';

  const PluginAmount = {
    id: 'amount',
    name: '成交金額副圖',

    createPane: function (container, options) {
      const height = options.height || 110;
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

      const seriesAmt = chart.addHistogramSeries({
        color: 'rgba(245, 158, 11, 0.65)',
        priceFormat: { type: 'volume' },
        priceScaleId: 'right'
      });

      const seriesMa1 = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1, priceScaleId: 'right', lastValueVisible: false, priceLineVisible: false });
      const seriesMa2 = chart.addLineSeries({ color: '#ec4899', lineWidth: 1, priceScaleId: 'right', lastValueVisible: false, priceLineVisible: false });

      return {
        chart: chart,
        updateData: function (klines) {
          if (!klines || klines.length === 0) return;
          const amtData = [];
          const amts = [];
          for (let i = 0; i < klines.length; i++) {
            const k = klines[i];
            const t = k.Date || k.time;
            const c = parseFloat(k.Close || k.close);
            const o = parseFloat(k.Open || k.open);
            const v = parseFloat(k.Volume || k.volume || 0);
            const amt = parseFloat(k.Amount || k.amount || (v * c) || 0);
            amtData.push({
              time: t,
              value: amt,
              color: c >= o ? 'rgba(239, 68, 68, 0.65)' : 'rgba(34, 197, 94, 0.65)'
            });
            amts.push(amt);
          }
          seriesAmt.setData(amtData);

          const calcMa = (p) => {
            const res = [];
            let sum = 0;
            for (let i = 0; i < amts.length; i++) {
              sum += amts[i];
              if (i >= p) sum -= amts[i - p];
              if (i >= p - 1) res.push({ time: amtData[i].time, value: sum / p });
            }
            return res;
          };

          seriesMa1.setData(calcMa(5));
          seriesMa2.setData(calcMa(20));
        }
      };
    }
  };

  root.SubChartPlugins = root.SubChartPlugins || {};
  root.SubChartPlugins['amount'] = PluginAmount;
})(typeof window !== 'undefined' ? window : this);
