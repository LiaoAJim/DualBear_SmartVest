/**
 * ══════════════════════════════════════════════════════════════════════════════════
 * DualBear SubCharts Manager (副圖指標清單管理器) v1.0 SSOT
 * 核心功能：
 * 1. 自動檢測與讀取 plugins-registry.json 副圖清單
 * 2. 呈現現代化「技術指標設定中心」核取清單彈窗
 * 3. 勾選後自動動態掛載/卸載副圖 Pane，並自動持久化至 localStorage
 * 4. 支援任意 APP (ZenGrid 2X, Sentinel Alpha, DCA Lab) 零摩擦一鍵接入
 * ══════════════════════════════════════════════════════════════════════════════════
 */
(function (root) {
  'use strict';

  const STORAGE_KEY = 'dualbear_subcharts_active_plugins';

  class DualBearSubChartsManager {
    constructor(options = {}) {
      this.options = Object.assign({
        registryUrl: '/assets/subcharts/plugins/plugins-registry.json',
        mount: null,
        onUpdate: null
      }, options);

      this.registry = [];
      this.activePlugins = this.loadSavedState();
      this.modalEl = null;

      this.init();
    }

    loadSavedState() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) return JSON.parse(saved);
      } catch (e) {}
      // 預設全啟用 volume, amount, leverage, bias5y
      return ['volume', 'amount', 'leverage', 'bias5y'];
    }

    saveState(activeList) {
      this.activePlugins = activeList;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(activeList));
      } catch (e) {}
    }

    async init() {
      await this.loadRegistry();
      this.createModalDOM();
      this.bindTriggers();
    }

    async loadRegistry() {
      try {
        const res = await fetch(this.options.registryUrl);
        if (res.ok) {
          this.registry = await res.json();
        }
      } catch (e) {
        console.warn('[SubCharts Manager] 讀取註冊表失敗，使用內建模礎清單:', e);
        this.registry = [
          { id: 'volume', name: '成交量與均量線', category: '基礎量價', icon: '📊', desc: '成交量柱狀圖，支援 5/20/60/120 N 日自訂均量線', defaultEnabled: true },
          { id: 'amount', name: '成交金額副圖', category: '基礎量價', icon: '💰', desc: '每日真實成交值 (收盤價 × 成交量)，支援 5/20 均額線', defaultEnabled: true },
          { id: 'leverage', name: '正2槓桿效率比', category: '量化指標', icon: '⚡', desc: '正2/原型波動槓桿比率、10MA 乖離通道與 4 色多空信號散點', defaultEnabled: true },
          { id: 'bias5y', name: '長週期 5 年線乖離率與資金配置階梯', category: '長線戰略', icon: '🏛️', desc: '5 年線基準軌道、2 年線試單 20%、兩線中線 50%、建議累積資金階梯', defaultEnabled: true },
          { id: 'keynes', name: '凱因斯群眾心理情緒副圖', category: '情緒循環', icon: '🧠', desc: '0 軸紅綠山丘情緒擴張/壓制、-10.00 長線價值線', defaultEnabled: false }
        ];
      }
    }

    createModalDOM() {
      if (document.getElementById('subchart-manager-modal')) return;

      const backdrop = document.createElement('div');
      backdrop.id = 'subchart-manager-modal';
      backdrop.className = 'subchart-modal-backdrop';

      backdrop.innerHTML = `
        <div class="subchart-modal-dialog">
          <div class="subchart-modal-header">
            <div class="subchart-modal-title">
              <span>📈 技術分析與副圖指標設定中心</span>
            </div>
            <button type="button" class="subchart-modal-close" id="subchart-modal-btn-x">&times;</button>
          </div>
          <div class="subchart-modal-body" id="subchart-plugin-list-container">
            <!-- 動態插入插件清單 -->
          </div>
          <div class="subchart-modal-footer">
            <span class="subchart-footer-hint">💡 設定將自動儲存於本機瀏覽器 (localStorage)，重新整理或載入不同標的皆可持續保留。</span>
            <div class="subchart-modal-btn-group">
              <button type="button" class="subchart-btn subchart-btn-cancel" id="subchart-modal-btn-cancel">取消</button>
              <button type="button" class="subchart-btn subchart-btn-save" id="subchart-modal-btn-apply">💾 儲存並套用</button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(backdrop);
      this.modalEl = backdrop;

      // 綁定關閉與儲存事件
      backdrop.querySelector('#subchart-modal-btn-x').addEventListener('click', () => this.close());
      backdrop.querySelector('#subchart-modal-btn-cancel').addEventListener('click', () => this.close());
      backdrop.querySelector('#subchart-modal-btn-apply').addEventListener('click', () => this.applySelection());

      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) this.close();
      });
    }

    renderPluginList() {
      const container = document.getElementById('subchart-plugin-list-container');
      if (!container) return;
      container.innerHTML = '';

      this.registry.forEach(item => {
        const isChecked = this.activePlugins.includes(item.id);
        const card = document.createElement('label');
        card.className = 'subchart-plugin-card';
        card.innerHTML = `
          <input type="checkbox" class="subchart-plugin-checkbox" value="${item.id}" ${isChecked ? 'checked' : ''}>
          <div class="subchart-plugin-info">
            <div class="subchart-plugin-header">
              <span class="subchart-plugin-icon">${item.icon || '📈'}</span>
              <span class="subchart-plugin-name">${item.name}</span>
              <span class="subchart-plugin-badge">${item.category || '通用指標'}</span>
            </div>
            <div class="subchart-plugin-desc">${item.desc || ''}</div>
          </div>
        `;
        container.appendChild(card);
      });
    }

    bindTriggers() {
      // 攔截並綁定所有帶有 data-action="open-indicators-modal" 或 id="btn-chart-indicators" 的按鈕
      document.addEventListener('click', (e) => {
        const trigger = e.target.closest('#btn-chart-indicators, [data-action="open-indicators-modal"]');
        if (trigger) {
          e.preventDefault();
          this.open();
        }
      });
    }

    open() {
      this.renderPluginList();
      if (this.modalEl) {
        this.modalEl.classList.add('active');
      }
    }

    close() {
      if (this.modalEl) {
        this.modalEl.classList.remove('active');
      }
    }

    applySelection() {
      const checkboxes = this.modalEl.querySelectorAll('.subchart-plugin-checkbox:checked');
      const selected = Array.from(checkboxes).map(cb => cb.value);
      this.saveState(selected);
      this.close();

      console.log('[SubCharts Manager] ✅ 已套用副圖選擇:', selected);

      if (typeof this.options.onUpdate === 'function') {
        this.options.onUpdate(selected);
      } else if (typeof window.onZenGridSubChartsUpdate === 'function') {
        window.onZenGridSubChartsUpdate(selected);
      }
    }

    isPluginActive(pluginId) {
      return this.activePlugins.includes(pluginId);
    }
  }

  root.DualBearSubChartsManager = DualBearSubChartsManager;
})(typeof window !== 'undefined' ? window : this);
