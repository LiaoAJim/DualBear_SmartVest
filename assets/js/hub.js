/**
 * DualBear SmartVest Hub - 前端非同步動態載入邏輯
 * 職責：讀取 data/public_market_state.json 渲染今日戰報快照
 */

const DRAWER_STORAGE_KEY = 'smartvest_report_drawer_state';

document.addEventListener('DOMContentLoaded', () => {
  initDrawerState();
  initAppsOrder();
  fetchPublicMarketState();
  checkSentinelAlphaHealth();
});

function initDrawerState() {
  const drawer = document.getElementById('report-drawer');
  const icon = document.getElementById('drawer-toggle-icon');
  const text = document.getElementById('drawer-toggle-text');
  if (!drawer || !icon || !text) return;

  const savedState = localStorage.getItem(DRAWER_STORAGE_KEY);
  // 若使用者先前展開過（'expanded'），則移除 collapsed class 保持展開
  if (savedState === 'expanded') {
    drawer.classList.remove('collapsed');
    icon.classList.add('expanded');
    text.textContent = '收折完整診斷報告';
  } else if (savedState === 'collapsed') {
    drawer.classList.add('collapsed');
    icon.classList.remove('expanded');
    text.textContent = '展開完整診斷報告';
  }
}

async function fetchPublicMarketState() {
  const statusBadge = document.getElementById('hub-sync-status');
  const lastUpdatedEl = document.getElementById('hub-last-updated');

  try {
    // 加上 timestamp 防止靜態快取幽靈
    const response = await fetch(`data/public_market_state.json?t=${Date.now()}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    renderMarketTicker(data);

    if (statusBadge) {
      statusBadge.innerHTML = '<span class="dot"></span> 脫敏戰情報告已同步';
    }
  } catch (err) {
    console.warn('[Hub] 無法讀取 data/public_market_state.json，採用離線展示模式:', err);
    if (statusBadge) {
      statusBadge.innerHTML = '<span class="dot" style="background-color: #f59e0b;"></span> 離線快照';
    }
    if (lastUpdatedEl) {
      lastUpdatedEl.textContent = '未同步最新戰報';
    }
  }
}

function formatCnnFng(score, rating) {
  if (score === undefined || score === null) return '--';
  const ratingMap = {
    'extreme fear': '極度恐慌',
    'fear': '恐慌',
    'neutral': '中性',
    'greed': '貪婪',
    'extreme greed': '極度貪婪'
  };
  const zhRating = ratingMap[rating?.toLowerCase()] || rating || '';
  return zhRating ? `${score} (${zhRating})` : `${score}`;
}

function renderMarketTicker(data) {
  const lastUpdatedEl = document.getElementById('hub-last-updated');
  
  const marginEl = document.getElementById('val-margin-ratio');
  const retailEl = document.getElementById('val-retail-ratio');
  const twVixEl = document.getElementById('val-tw-vix');
  const usVixEl = document.getElementById('val-us-vix');
  const cnnFngEl = document.getElementById('val-cnn-fng');

  const tickerDataTimeEl = document.getElementById('ticker-data-time');

  if (lastUpdatedEl && data.updated_at) {
    lastUpdatedEl.textContent = `戰報時間: ${data.updated_at}`;
  }

  if (tickerDataTimeEl && data.updated_at) {
    tickerDataTimeEl.textContent = `數據時間: ${data.updated_at}`;
  }

  // 渲染五大核心客觀指標
  if (marginEl && data.quant_indicators) {
    const val = data.quant_indicators.margin_maintenance_ratio;
    marginEl.textContent = val !== undefined ? `${val}%` : '--%';
  }

  if (retailEl && data.quant_indicators) {
    const val = data.quant_indicators.retail_long_short_ratio;
    retailEl.textContent = val !== undefined && val !== null ? `${val}%` : '--';
  }

  if (twVixEl && data.quant_indicators) {
    twVixEl.textContent = data.quant_indicators.tw_vix ?? '--';
  }

  if (usVixEl && data.quant_indicators) {
    usVixEl.textContent = data.quant_indicators.us_vix ?? '--';
  }

  if (cnnFngEl && data.quant_indicators) {
    cnnFngEl.textContent = formatCnnFng(
      data.quant_indicators.cnn_fng_score,
      data.quant_indicators.cnn_fng_rating
    );
  }

  // 渲染 LINE 戰報精華抽屜細項 (若有)
  renderWealthSentinelBrief(data);
}

function renderWealthSentinelBrief(data) {
  const brief = data.wealth_sentinel_brief;
  if (!brief) return;

  const ndxEl = document.getElementById('detail-ndx-pos');
  const twiiEl = document.getElementById('detail-twii-pos');
  const qqqPeEl = document.getElementById('detail-qqq-pe');
  const ewtPeEl = document.getElementById('detail-ewt-pe');
  const retailChipEl = document.getElementById('detail-retail-chip');
  const marginChipEl = document.getElementById('detail-margin-chip');
  const fullReportEl = document.getElementById('detail-full-report');

  if (ndxEl && brief.us_close) {
    const usCloseNum = parseFloat(brief.us_close);
    const usDdNum = parseFloat(brief.us_drawdown);
    const closeStr = !isNaN(usCloseNum) ? usCloseNum.toFixed(2) : brief.us_close;
    const ddStr = !isNaN(usDdNum) ? usDdNum.toFixed(2) : brief.us_drawdown;
    ndxEl.textContent = `現價 ${closeStr} (回撤 ${ddStr}%)`;
  }
  if (twiiEl && brief.tw_close) {
    const twCloseNum = parseFloat(brief.tw_close);
    const twDdNum = parseFloat(brief.tw_drawdown);
    const closeStr = !isNaN(twCloseNum) ? twCloseNum.toFixed(2) : brief.tw_close;
    const ddStr = !isNaN(twDdNum) ? twDdNum.toFixed(2) : brief.tw_drawdown;
    twiiEl.textContent = `現價 ${closeStr} (回撤 ${ddStr}%)`;
  }

  // 從 full_report 精準提取估值區塊 (P/E) 與位階判斷 (合理/偏貴/低估等)
  if (brief.full_report) {
    const reportText = brief.full_report;

    // 輔助函式：精準定位專屬估值區塊，徹底隔絕「市場位階【中檔整理】」誤判
    function parseMarketValuation(text, sectionTag) {
      const idx = text.indexOf(`[${sectionTag}]`);
      if (idx === -1) return null;
      const endIdx = text.indexOf(' [', idx + sectionTag.length + 2);
      const section = endIdx !== -1 ? text.substring(idx, endIdx) : text.substring(idx, idx + 250);

      const statusMatch = section.match(/【([^】]+)】/);
      const valMatch = section.match(/目前\s*([0-9.]+)/);
      if (!valMatch) return null;

      const val = parseFloat(valMatch[1]);
      const status = statusMatch ? statusMatch[1].trim() : '';
      return { val, status };
    }

    // 1. 那斯達克 (QQQ) 估值位階
    const qqqData = parseMarketValuation(reportText, '美股市場估值');
    if (qqqPeEl) {
      if (qqqData && !isNaN(qqqData.val)) {
        qqqPeEl.textContent = `${qqqData.val.toFixed(2)} (${qqqData.status || '合理'})`;
        // 動態樣式
        qqqPeEl.className = 'drawer-val ' + (qqqData.status.includes('便宜') || qqqData.status.includes('低估') ? 'val-green' : (qqqData.status.includes('偏貴') || qqqData.status.includes('高估') ? 'val-yellow' : 'val-green'));
      } else {
        qqqPeEl.textContent = 'N/A (未取得)';
      }
    }

    // 2. 台股大盤 (EWT) 估值位階
    const ewtData = parseMarketValuation(reportText, '台股市場估值');
    if (ewtPeEl) {
      if (ewtData && !isNaN(ewtData.val)) {
        ewtPeEl.textContent = `${ewtData.val.toFixed(2)} (${ewtData.status || '偏貴'})`;
        // 動態樣式
        ewtPeEl.className = 'drawer-val ' + (ewtData.status.includes('便宜') || ewtData.status.includes('低估') ? 'val-green' : (ewtData.status.includes('偏貴') || ewtData.status.includes('高估') ? 'val-yellow' : 'val-green'));
      } else {
        ewtPeEl.textContent = 'N/A (未取得)';
      }
    }

    if (fullReportEl) {
      fullReportEl.textContent = reportText.replace(/\s{2,}\[/g, '\n\n[');
    }
  }

  if (retailChipEl && data.quant_indicators) {
    const rRaw = data.quant_indicators.retail_long_short_ratio;
    if (rRaw !== undefined && rRaw !== null && rRaw !== '') {
      const rNum = typeof rRaw === 'number' ? rRaw : parseFloat(rRaw);
      if (!isNaN(rNum)) {
        const sign = rNum > 0 ? '+' : '';
        let rDesc = '中性觀望';
        if (rNum > 20) rDesc = '多單過熱';
        else if (rNum < -20) rDesc = '空單過高';
        retailChipEl.textContent = `${sign}${rNum.toFixed(2)}% (${rDesc})`;
      } else {
        retailChipEl.textContent = '--';
      }
    } else {
      retailChipEl.textContent = '--';
    }
  }
  if (marginChipEl && data.quant_indicators) {
    const mRaw = data.quant_indicators.margin_maintenance_ratio;
    if (mRaw !== undefined && mRaw !== null && mRaw !== '') {
      const mNum = typeof mRaw === 'number' ? mRaw : parseFloat(mRaw);
      if (!isNaN(mNum)) {
        // 2026-11-24 新制上路：維持率追繳平倉斷頭死線調降至 120%
        let statusDesc = '安全水位';
        if (mNum < 130) {
          statusDesc = '斷頭危險';
        } else if (mNum < 150) {
          statusDesc = '警戒水位';
        }
        marginChipEl.textContent = `${mNum.toFixed(2)}% (${statusDesc})`;
      } else {
        marginChipEl.textContent = '--';
      }
    } else {
      marginChipEl.textContent = '--';
    }
  }

  // 卡片 4: 恐慌與情緒監控 (VIX / F&G)
  const vixPairEl = document.getElementById('detail-vix-pair');
  const cnnFngDetailEl = document.getElementById('detail-cnn-fng');

  if (vixPairEl && data.quant_indicators) {
    const twV = typeof data.quant_indicators.tw_vix === 'number' ? data.quant_indicators.tw_vix : parseFloat(data.quant_indicators.tw_vix);
    const usV = typeof data.quant_indicators.us_vix === 'number' ? data.quant_indicators.us_vix : parseFloat(data.quant_indicators.us_vix);

    // 解析臺美雙 VIX 狀態判定
    let twDesc = '';
    if (!isNaN(twV)) {
      if (twV >= 35) twDesc = '黑天鵝';
      else if (twV >= 25) twDesc = '恐慌';
      else if (twV >= 18) twDesc = '警覺';
      else if (twV >= 13) twDesc = '舒適';
      else twDesc = '平靜';
    }

    let usDesc = '';
    if (!isNaN(usV)) {
      if (usV >= 50) usDesc = '海嘯';
      else if (usV >= 35) usDesc = '極恐';
      else if (usV >= 20) usDesc = '警惕';
      else if (usV >= 15) usDesc = '常態';
      else usDesc = '繁榮';
    }

    const twText = !isNaN(twV) ? `${twV} (${twDesc})` : '--';
    const usText = !isNaN(usV) ? `${usV} (${usDesc})` : '--';
    vixPairEl.textContent = `${twText} / ${usText}`;
  }

  if (cnnFngDetailEl && data.quant_indicators) {
    cnnFngDetailEl.textContent = formatCnnFng(
      data.quant_indicators.cnn_fng_score,
      data.quant_indicators.cnn_fng_rating
    );
  }
}

function toggleReportDrawer() {
  const drawer = document.getElementById('report-drawer');
  const icon = document.getElementById('drawer-toggle-icon');
  const text = document.getElementById('drawer-toggle-text');
  if (!drawer || !icon || !text) return;

  const isCollapsed = drawer.classList.toggle('collapsed');
  icon.classList.toggle('expanded', !isCollapsed);
  text.textContent = isCollapsed ? '展開完整診斷報告' : '收折完整診斷報告';
  
  // 持久化記憶使用者的展開/收折偏好
  try {
    localStorage.setItem(DRAWER_STORAGE_KEY, isCollapsed ? 'collapsed' : 'expanded');
  } catch (e) {
    console.warn('[Hub] 無法將抽屜狀態寫入 localStorage:', e);
  }
}

// 檢查 Sentinel Alpha (Port 8001) 服務健康狀態
async function checkSentinelAlphaHealth() {
  const card = document.getElementById('card-sentinel');
  const tag = document.getElementById('tag-sentinel');
  const btn = document.getElementById('btn-sentinel');
  if (!card || !tag || !btn) return;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const res = await fetch('http://127.0.0.1:8001/', {
      method: 'GET',
      mode: 'no-cors',
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    tag.className = 'app-tag tag-ready';
    tag.textContent = '本地服務運行中';
    card.classList.remove('disabled');
    btn.textContent = '進入儀表板 →';
  } catch (e) {
    tag.className = 'app-tag tag-ready';
    tag.textContent = '即開即用';
    card.classList.remove('disabled');
    btn.textContent = '進入 APP →';
  }
}

// ══════════════════════════════════════════════════════════════════════
// 策略 APP 卡片自由順序管線 (Apps Card Ordering Pipeline & LocalStorage)
// ══════════════════════════════════════════════════════════════════════
const APPS_ORDER_STORAGE_KEY = 'smartvest_apps_cards_order_v1';
const DEFAULT_APPS_ORDER = [
  'monte_carlo',
  'macro_valuation',
  'zengrid_2x',
  'leverage_monitor',
  'dca_lab',
  'drawdown_lab'
];

function initAppsOrder() {
  const grid = document.getElementById('apps-grid');
  if (!grid) return;

  let order = DEFAULT_APPS_ORDER;
  try {
    const raw = localStorage.getItem(APPS_ORDER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // 過濾非法或已不存在的卡片，補齊缺少的項目
        const valid = parsed.filter(id => DEFAULT_APPS_ORDER.includes(id));
        DEFAULT_APPS_ORDER.forEach(id => {
          if (!valid.includes(id)) valid.push(id);
        });
        order = valid;
      }
    }
  } catch (e) {
    console.warn('[Hub] 無法自 localStorage 載入卡片順序:', e);
  }

  applyAppsOrder(order);
}

function applyAppsOrder(order) {
  const grid = document.getElementById('apps-grid');
  if (!grid) return;

  const cardMap = {};
  const cards = Array.from(grid.children);
  cards.forEach(card => {
    const appId = card.getAttribute('data-app-id');
    if (appId) cardMap[appId] = card;
  });

  order.forEach(appId => {
    if (cardMap[appId]) {
      grid.appendChild(cardMap[appId]);
    }
  });

  updateNavButtonsState();
}

function updateNavButtonsState() {
  const grid = document.getElementById('apps-grid');
  if (!grid) return;

  const cards = Array.from(grid.children);
  cards.forEach((card, idx) => {
    const btnLeft = card.querySelector('.btn-move-left');
    const btnRight = card.querySelector('.btn-move-right');
    if (btnLeft) btnLeft.disabled = (idx === 0);
    if (btnRight) btnRight.disabled = (idx === cards.length - 1);
  });
}

function moveAppCard(event, appId, direction) {
  if (event) {
    event.preventDefault();
    event.stopPropagation(); // 避免點擊按鈕時觸發外層 <a> 鏈接開啟頁面
  }

  const grid = document.getElementById('apps-grid');
  if (!grid) return;

  const cards = Array.from(grid.children);
  const currentIdx = cards.findIndex(c => c.getAttribute('data-app-id') === appId);
  if (currentIdx === -1) return;

  const targetIdx = currentIdx + direction;
  if (targetIdx < 0 || targetIdx >= cards.length) return;

  const card = cards[currentIdx];
  const targetCard = cards[targetIdx];

  if (direction < 0) {
    grid.insertBefore(card, targetCard);
  } else {
    grid.insertBefore(card, targetCard.nextSibling);
  }

  // 儲存當前全新順序到 localStorage
  saveCurrentAppsOrder();
  updateNavButtonsState();
}
window.moveAppCard = moveAppCard;

function saveCurrentAppsOrder() {
  const grid = document.getElementById('apps-grid');
  if (!grid) return;

  const currentOrder = Array.from(grid.children)
    .map(c => c.getAttribute('data-app-id'))
    .filter(Boolean);

  try {
    localStorage.setItem(APPS_ORDER_STORAGE_KEY, JSON.stringify(currentOrder));
  } catch (e) {
    console.warn('[Hub] 無法將卡片順序寫入 localStorage:', e);
  }
}

function resetAppsOrder() {
  applyAppsOrder(DEFAULT_APPS_ORDER);
  try {
    localStorage.removeItem(APPS_ORDER_STORAGE_KEY);
  } catch (e) {}
}
window.resetAppsOrder = resetAppsOrder;

