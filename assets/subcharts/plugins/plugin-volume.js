/**
 * SubChart Plugin: 成交量與均量線 (Volume)
 */
(function (root) {
  'use strict';

  const PluginVolume = {
    id: 'volume',
    name: '成交量與均量線',

    createPane: function (container, options) {
      const height = options.height || 120;
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

      const seriesVol = chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: 'right'
      });

      const seriesMa1 = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1, priceScaleId: 'right', lastValueVisible: false, priceLineVisible: false });
      const seriesMa2 = chart.addLineSeries({ color: '#ec4899', lineWidth: 1, priceScaleId: 'right', lastValueVisible: false, priceLineVisible: false });

      return {
        chart: chart,
        updateData: function (klines) {
          if (!klines || klines.length === 0) return;
          const volData = [];
          const vols = [];
          for (let i = 0; i < klines.length; i++) {
            const k = klines[i];
            const t = k.Date || k.time;
            const c = parseFloat(k.Close || k.close);
            const o = parseFloat(k.Open || k.open);
            const v = parseFloat(k.Volume || k.volume || 0);
            volData.push({
              time: t,
              value: v,
              color: c >= o ? 'rgba(239, 68, 68, 0.65)' : 'rgba(34, 197, 94, 0.65)'
            });
            vols.push(v);
          }
          seriesVol.setData(volData);

          const calcMa = (p) => {
            const res = [];
            let sum = 0;
            for (let i = 0; i < vols.length; i++) {
              sum += vols[i];
              if (i >= p) sum -= vols[i - p];
              if (i >= p - 1) res.push({ time: volData[i].time, value: sum / p });
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
  root.SubChartPlugins['volume'] = PluginVolume;
})(typeof window !== 'undefined' ? window : this);
