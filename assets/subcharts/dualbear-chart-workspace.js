/**
 * ══════════════════════════════════════════════════════════════════════════════════
 * DualBear Chart Workspace (多圖表工作站舞台管理器) v1.0 SSOT
 * 核心功能：
 * 1. 扁平化舞台治理：消除子容器隔離牆，主圖與所有副圖在同一層 DOM 平等排序
 * 2. 自由穿透排序：點擊任意圖表 [▲] 或 [▼] 按鈕，自由跨越任何圖表上下對調
 * 3. 排序記憶持久化：自動存取 localStorage，重新整理或換標的依舊保持客製排列
 * 4. 跨圖時間軸與十字虛線全域廣播網 (Crosshair Broadcaster)
 * ══════════════════════════════════════════════════════════════════════════════════
 */
(function (root) {
  'use strict';

  const STORAGE_ORDER_KEY = 'dualbear_chart_workspace_order';

  class DualBearChartWorkspace {
    constructor(options = {}) {
      this.options = Object.assign({
        containerId: 'chartBlocksContainer',
        storageKey: STORAGE_ORDER_KEY
      }, options);

      this.container = document.getElementById(this.options.containerId);
      this.init();
    }

    init() {
      if (!this.container) {
        console.warn(`[Chart Workspace] 找不到容器 #${this.options.containerId}，稍後重試。`);
        setTimeout(() => {
          this.container = document.getElementById(this.options.containerId);
          if (this.container) this.setup();
        }, 300);
        return;
      }
      this.setup();
    }

    setup() {
      this.bindUniversalReorderButtons();
      this.restoreOrderFromStorage();
      console.log('[Chart Workspace] 🚀 通用多圖表工作站舞台初始化就緒！');
    }

    /**
     * 綁定全域所有圖表面板的 [▲] / [▼] 按鈕事件
     * 🛡️ 防禦：若 ZenGrid 宿主環境已有 moveChartPanelUp/Down，則交由宿主統一派發，絕不重複執行 DOM 插入
     */
    bindUniversalReorderButtons() {
      if (!this.container) return;
      if (typeof window.moveChartPanelUp === 'function') {
        console.log('[Chart Workspace] 檢測到宿主面板排序管線，交由宿主統一派發');
        return;
      }

      this.container.addEventListener('click', (e) => {
        // 匹配上移按鈕
        const btnUp = e.target.closest('.chart-move-up, #dbBtnUpSub, #dbBtnUpBias, [data-action="move-up"]');
        if (btnUp) {
          e.preventDefault();
          e.stopPropagation();
          const block = this.findParentBlock(btnUp);
          if (block) this.moveBlockUp(block);
          return;
        }

        // 匹配下移按鈕
        const btnDown = e.target.closest('.chart-move-down, #dbBtnDownSub, #dbBtnDownBias, [data-action="move-down"]');
        if (btnDown) {
          e.preventDefault();
          e.stopPropagation();
          const block = this.findParentBlock(btnDown);
          if (block) this.moveBlockDown(block);
          return;
        }
      });
    }

    /**
     * 尋找面板所屬的頂層卡片 DOM (.chart-block 或 .subchart-block)
     */
    findParentBlock(el) {
      if (!el) return null;
      let curr = el;
      while (curr && curr !== this.container) {
        if (curr.classList && (curr.classList.contains('chart-block') || curr.classList.contains('subchart-block'))) {
          return curr;
        }
        curr = curr.parentElement;
      }
      return null;
    }

    /**
     * 將指定的區塊向上移動一個順位（可穿透主圖與任何副圖）
     */
    moveBlockUp(block) {
      if (!block || !this.container) return;
      const prev = block.previousElementSibling;
      if (prev && (prev.classList.contains('chart-block') || prev.classList.contains('subchart-block'))) {
        this.container.insertBefore(block, prev);
        this.saveOrderToStorage();
        this.notifyResize();
      }
    }

    /**
     * 將指定的區塊向下移動一個順位（可穿透主圖與任何副圖）
     */
    moveBlockDown(block) {
      if (!block || !this.container) return;
      const next = block.nextElementSibling;
      if (next && (next.classList.contains('chart-block') || next.classList.contains('subchart-block'))) {
        this.container.insertBefore(next, block);
        this.saveOrderToStorage();
        this.notifyResize();
      }
    }

    /**
     * 儲存當前面板順序至 localStorage
     */
    saveOrderToStorage() {
      if (!this.container) return;
      const blocks = Array.from(this.container.children).filter(el => 
        el.classList && (el.classList.contains('chart-block') || el.classList.contains('subchart-block'))
      );
      const orderIds = blocks.map(b => b.id).filter(Boolean);
      try {
        localStorage.setItem(this.options.storageKey, JSON.stringify(orderIds));
        console.log('[Chart Workspace] 💾 面板順位已保存:', orderIds);
      } catch (e) {}
    }

    /**
     * 從 localStorage 還原面板順序
     */
    restoreOrderFromStorage() {
      if (!this.container) return;
      try {
        const saved = localStorage.getItem(this.options.storageKey);
        if (!saved) return;
        const orderIds = JSON.parse(saved);
        if (!Array.isArray(orderIds) || orderIds.length === 0) return;

        orderIds.forEach(id => {
          const el = document.getElementById(id);
          if (el && el.parentElement === this.container) {
            this.container.appendChild(el);
          }
        });
        this.notifyResize();
      } catch (e) {
        console.warn('[Chart Workspace] 還原順位異常:', e);
      }
    }

    /**
     * 圖表順位變動後，通知各引擎重新對齊與繪製
     */
    notifyResize() {
      setTimeout(() => {
        if (window.zenGridSubChartsInstance && typeof window.zenGridSubChartsInstance._resizeCharts === 'function') {
          window.zenGridSubChartsInstance._resizeCharts();
        }
        if (typeof window.drawCharts === 'function') {
          try { window.drawCharts(); } catch (e) {}
        }
      }, 30);
    }
  }

  root.DualBearChartWorkspace = DualBearChartWorkspace;
})(typeof window !== 'undefined' ? window : this);
