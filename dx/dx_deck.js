'use strict';
/**
 * dx_deck.js
 * DX版 デッキプリセット（会社規模連動 2〜6枠）・案件別不足診断・パズル直前調整モジュール
 */
(function (global) {
  const DEFAULT_PRESET_NAMES = [
    '標準バランス',
    'サブ編成',
    'プリセット3',
    'プリセット4',
    'プリセット5',
    'プリセット6'
  ];

  const OFFICE_FALLBACK_NAMES = [
    '個人事務所',
    '地元事務所',
    '駅前オフィス',
    '本格スタジオ',
    '本社自社ビル'
  ];

  let _ctx = {};
  let _missionTempDeck = null; // { basePresetId, slotOverrides, customSlots }
  let _editorDraft = null;     // { presetId, basePresetId, slotOverrides, customSlots, editingSlot }
  let _officeRenamingId = null;
  let _preRenamingId = null;
  let _pendingProceedFn = null;
  let _confirmKey = null;
  let _confirmTimer = null;

  function init(ctx) {
    _ctx = ctx || {};
  }

  /* ============================================================
     0. 2回クリック確認＆スクロール維持ヘルパー
  ============================================================ */
  function isConfirming(key) {
    return Boolean(key && _confirmKey === key);
  }

  function clearConfirm(silent = true) {
    if (_confirmTimer) {
      clearTimeout(_confirmTimer);
      _confirmTimer = null;
    }
    const had = Boolean(_confirmKey);
    _confirmKey = null;
    if (!silent && had) {
      if (_ctx.renderCompanyUpgradeUI) _ctx.renderCompanyUpgradeUI();
      else if (typeof renderCompanyUpgradeUI === 'function') renderCompanyUpgradeUI();
    }
  }

  function armOrExecute(key, onExecute) {
    if (!key) {
      if (typeof onExecute === 'function') onExecute();
      return true;
    }
    if (_confirmKey === key) {
      clearConfirm(true);
      if (typeof onExecute === 'function') onExecute();
      return true;
    }
    clearConfirm(true);
    _confirmKey = key;
    if (typeof window !== 'undefined') window.dismissConfirmingStaffId = null;
    callPlaySound('rotate');
    _confirmTimer = setTimeout(() => {
      _confirmTimer = null;
      if (_confirmKey === key) {
        _confirmKey = null;
        if (_ctx.renderCompanyUpgradeUI) _ctx.renderCompanyUpgradeUI();
        else if (typeof renderCompanyUpgradeUI === 'function') renderCompanyUpgradeUI();
      }
    }, 3500);
    if (_ctx.renderCompanyUpgradeUI) _ctx.renderCompanyUpgradeUI();
    else if (typeof renderCompanyUpgradeUI === 'function') renderCompanyUpgradeUI();
    return false;
  }

  function captureScrollState(container) {
    const h = {};
    if (!container) return { top: 0, h };
    container.querySelectorAll('.deck-hscroll-row[data-hscroll-key]').forEach(el => {
      const k = el.getAttribute('data-hscroll-key');
      if (k) h[k] = el.scrollLeft;
    });
    return { top: container.scrollTop, h };
  }

  function restoreScrollState(container, state) {
    if (!container || !state) return;
    container.scrollTop = state.top || 0;
    const h = state.h || {};
    container.querySelectorAll('.deck-hscroll-row[data-hscroll-key]').forEach(el => {
      const k = el.getAttribute('data-hscroll-key');
      if (k && Object.prototype.hasOwnProperty.call(h, k)) {
        el.scrollLeft = h[k];
      }
    });
  }

  function escHtml(str) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(str == null ? '' : str).replace(/[\x26\x3c\x3e\x22\x27]/g, ch => map[ch]);
  }

  function getGameState() {
    if (_ctx.getGameState) return _ctx.getGameState();
    return (typeof GameState !== 'undefined') ? GameState : null;
  }

  function getStage() {
    if (_ctx.getStage) return _ctx.getStage();
    return (typeof STAGE !== 'undefined') ? STAGE : null;
  }

  function getPieceMap() {
    if (_ctx.getPieceMap) return _ctx.getPieceMap();
    return (typeof PIECE_MAP !== 'undefined') ? PIECE_MAP : {};
  }

  function getPieceLib() {
    if (_ctx.getPieceLib) return _ctx.getPieceLib();
    return (typeof PIECE_LIB !== 'undefined') ? PIECE_LIB : [];
  }

  function getFixedDeck() {
    if (_ctx.getFixedDeck) return _ctx.getFixedDeck();
    return (typeof FIXED_BASE_DECK !== 'undefined') ? FIXED_BASE_DECK : [];
  }

  function getUpgradeSlots() {
    if (_ctx.getUpgradeSlots) return _ctx.getUpgradeSlots();
    return (typeof UPGRADE_DECK_SLOTS !== 'undefined') ? UPGRADE_DECK_SLOTS : [];
  }

  function getCustomSlotsCount() {
    if (_ctx.getCustomSlotsCount) return _ctx.getCustomSlotsCount();
    return (typeof CUSTOM_DECK_SLOTS_COUNT !== 'undefined') ? CUSTOM_DECK_SLOTS_COUNT : 4;
  }

  function getT() {
    if (_ctx.getT) return _ctx.getT();
    return (typeof T !== 'undefined') ? T : {
      ROOM: 'room', CORRIDOR: 'corridor', LDK: 'ldk',
      BATH: 'bath', TOILET: 'toilet', WASHROOM: 'washroom', CLOSET: 'closet'
    };
  }

  function isPieceUnlockedSafe(pid) {
    if (_ctx.isPieceUnlocked) return _ctx.isPieceUnlocked(pid);
    if (typeof isPieceUnlocked === 'function') return isPieceUnlocked(pid);
    const p = getPieceMap()[pid];
    return Boolean(p && (!p.unlockCost || p.unlockCost <= 0));
  }

  function isPieceAllowedSafe(slot, piece) {
    if (_ctx.isPieceAllowedInSlot) return _ctx.isPieceAllowedInSlot(slot, piece);
    if (typeof isPieceAllowedInSlot === 'function') return isPieceAllowedInSlot(slot, piece);
    if (!slot || !piece) return false;
    return Array.isArray(slot.cats) && slot.cats.length > 0
      ? slot.cats.includes(piece.cat)
      : piece.cat === slot.cat;
  }

  function getPieceCostSafe(piece, mirrored = false) {
    if (_ctx.getPieceCost) return _ctx.getPieceCost(piece, mirrored);
    if (typeof getPieceCost === 'function') return getPieceCost(piece, mirrored);
    return (piece && piece.cost) || 0;
  }

  function getActiveDeckIdsSafe(overrideDeck) {
    if (_ctx.getActiveDeckPieceIds) return _ctx.getActiveDeckPieceIds(overrideDeck);
    if (typeof getActiveDeckPieceIds === 'function') return getActiveDeckPieceIds(overrideDeck);
    return [];
  }

  function renderMiniShapeSafe(piece, cellPx) {
    if (_ctx.renderMiniPieceShape) return _ctx.renderMiniPieceShape(piece, cellPx);
    if (typeof renderMiniPieceShape === 'function') return renderMiniPieceShape(piece, cellPx);
    return '';
  }

  function countCells(shape) {
    let n = 0;
    if (!Array.isArray(shape)) return 0;
    for (const row of shape) {
      for (const v of (row || [])) {
        if (v === 1) n++;
      }
    }
    return n;
  }

  function callSaveGame() {
    if (_ctx.saveGame) _ctx.saveGame();
    else if (typeof saveGame === 'function') saveGame();
  }

  function callInitAudio() {
    if (_ctx.initAudio) _ctx.initAudio();
    else if (typeof initAudio === 'function') initAudio();
  }

  function callPlaySound(id) {
    if (_ctx.playSound) _ctx.playSound(id);
    else if (typeof playSound === 'function') playSound(id);
  }

  function callRefreshHomeAndOffice() {
    if (_ctx.renderCompanyUpgradeUI) _ctx.renderCompanyUpgradeUI();
    else if (typeof renderCompanyUpgradeUI === 'function') renderCompanyUpgradeUI();
    if (_ctx.updateHomeUI) _ctx.updateHomeUI();
    else if (typeof updateHomeUI === 'function') updateHomeUI();
  }

  /* ============================================================
     1. 会社規模連動プリセット管理（2〜6枠）
  ============================================================ */
  function getMaxPresetCount(officeLevel) {
    const lv = Math.max(0, Number(officeLevel) || 0);
    return Math.min(6, 2 + lv);
  }

  function getNextUnlockOfficeInfo(officeLevel) {
    const lv = Math.max(0, Number(officeLevel) || 0);
    if (lv >= 4) return null;
    const nextLv = lv + 1;
    const cfg = (_ctx.getUpgradeConfig && _ctx.getUpgradeConfig())
      || (typeof UPGRADE_CONFIG !== 'undefined' ? UPGRADE_CONFIG : null);
    const officeName = (cfg && cfg.office && cfg.office[nextLv] && cfg.office[nextLv].name)
      || OFFICE_FALLBACK_NAMES[nextLv]
      || `Rank ${nextLv + 1}`;
    return {
      nextLv,
      rankNum: nextLv + 1,
      officeName,
      nextCount: getMaxPresetCount(nextLv)
    };
  }

  function normalizeDeckObj(raw) {
    const cnt = getCustomSlotsCount();
    const ovOut = {};
    if (raw && raw.slotOverrides && typeof raw.slotOverrides === 'object') {
      for (const [k, v] of Object.entries(raw.slotOverrides)) {
        if (typeof v === 'string' && v) ovOut[k] = v;
      }
    }
    const custOut = [];
    const srcCust = (raw && Array.isArray(raw.customSlots)) ? raw.customSlots : [];
    for (let i = 0; i < cnt; i++) {
      custOut.push(typeof srcCust[i] === 'string' && srcCust[i] ? srcCust[i] : null);
    }
    return { slotOverrides: ovOut, customSlots: custOut };
  }

  function ensurePresetStructureOnly(co) {
    if (!co || typeof co !== 'object') return [];
    const maxCount = getMaxPresetCount(co.officeLevel || 0);
    const seedDeck = normalizeDeckObj(co.deck);

    if (!Array.isArray(co.deckPresets) || co.deckPresets.length === 0) {
      co.deckPresets = [];
      for (let i = 0; i < maxCount; i++) {
        const d = (i === 0) ? seedDeck : normalizeDeckObj(null);
        co.deckPresets.push({
          id: `preset_${i + 1}`,
          name: DEFAULT_PRESET_NAMES[i] || `プリセット${i + 1}`,
          slotOverrides: d.slotOverrides,
          customSlots: d.customSlots
        });
      }
    } else {
      const targetLen = Math.max(co.deckPresets.length, maxCount);
      for (let i = 0; i < targetLen; i++) {
        const cur = co.deckPresets[i];
        const d = normalizeDeckObj(cur);
        const rawName = (cur && typeof cur.name === 'string') ? cur.name.trim().slice(0, 12) : '';
        co.deckPresets[i] = {
          id: `preset_${i + 1}`,
          name: rawName || DEFAULT_PRESET_NAMES[i] || `プリセット${i + 1}`,
          slotOverrides: d.slotOverrides,
          customSlots: d.customSlots
        };
      }
    }

    const unlocked = co.deckPresets.slice(0, maxCount);
    if (!co.activePresetId || !unlocked.some(p => p.id === co.activePresetId)) {
      co.activePresetId = unlocked[0] ? unlocked[0].id : 'preset_1';
    }
    return unlocked;
  }

  function copyDeckIntoCo(co, deckData) {
    const norm = normalizeDeckObj(deckData);
    co.deck = {
      slotOverrides: norm.slotOverrides,
      customSlots: norm.customSlots
    };
  }

  function ensurePresets(co) {
    const unlocked = ensurePresetStructureOnly(co);
    if (!unlocked.length) return [];
    const active = unlocked.find(p => p.id === co.activePresetId) || unlocked[0];
    copyDeckIntoCo(co, active);
    return unlocked;
  }

  function syncActivePresetFromDeck(co) {
    if (!co) return;
    const unlocked = ensurePresetStructureOnly(co);
    const active = unlocked.find(p => p.id === co.activePresetId) || unlocked[0];
    if (!active) return;
    const norm = normalizeDeckObj(co.deck);
    active.slotOverrides = norm.slotOverrides;
    active.customSlots = norm.customSlots;
    copyDeckIntoCo(co, active);
  }

  function getActivePreset(co) {
    const gs = getGameState();
    const targetCo = co || (gs && gs.company);
    if (!targetCo) return null;
    const unlocked = ensurePresetStructureOnly(targetCo);
    return unlocked.find(p => p.id === targetCo.activePresetId) || unlocked[0] || null;
  }

  function selectPreset(presetId, context = 'office') {
    const gs = getGameState();
    if (!gs || !gs.company) return;
    callInitAudio();
    const unlocked = ensurePresetStructureOnly(gs.company);
    const found = unlocked.find(p => p.id === presetId);
    if (!found) return;

    gs.company.activePresetId = found.id;
    copyDeckIntoCo(gs.company, found);
    _missionTempDeck = null;
    _officeRenamingId = null;
    _preRenamingId = null;
    clearConfirm(true);
    if (typeof window !== 'undefined') window.activeDeckEditingSlot = null;

    callPlaySound('rotate');
    callSaveGame();

    if (context === 'office') {
      if (_ctx.showUpgradeFeedback) {
        _ctx.showUpgradeFeedback(`📁 プリセット「${found.name}」に切り替えました`, 'var(--c-emerald)');
      }
      callRefreshHomeAndOffice();
    } else if (context === 'mission') {
      if (_ctx.showFloatingText) {
        _ctx.showFloatingText(`🃏 デッキ「${found.name}」に切替`, '#38bdf8');
      }
      renderMissionDeckPanel(getStage());
      callRefreshHomeAndOffice();
    } else if (context === 'pre') {
      if (_editorDraft) {
        const d = normalizeDeckObj(found);
        _editorDraft.presetId = found.id;
        _editorDraft.basePresetId = found.id;
        _editorDraft.slotOverrides = d.slotOverrides;
        _editorDraft.customSlots = d.customSlots;
        _editorDraft.editingSlot = null;
        renderPrePuzzleModal();
      }
    }
  }

  function toggleRenameUI(presetId, context = 'office') {
    callInitAudio();
    callPlaySound('tap');
    clearConfirm(true);
    if (context === 'office') {
      _officeRenamingId = (_officeRenamingId === presetId) ? null : presetId;
      callRefreshHomeAndOffice();
      if (_officeRenamingId) {
        setTimeout(() => {
          const inp = document.getElementById('dx-office-rename-input');
          if (inp) { inp.focus(); inp.select(); }
        }, 20);
      }
    } else {
      _preRenamingId = (_preRenamingId === presetId) ? null : presetId;
      renderPrePuzzleModal();
      if (_preRenamingId) {
        setTimeout(() => {
          const inp = document.getElementById('dx-pre-rename-input');
          if (inp) { inp.focus(); inp.select(); }
        }, 20);
      }
    }
  }

  function commitRename(context = 'office') {
    const gs = getGameState();
    if (!gs || !gs.company) return;
    const presetId = (context === 'office') ? _officeRenamingId : _preRenamingId;
    const inpId = (context === 'office') ? 'dx-office-rename-input' : 'dx-pre-rename-input';
    const inp = document.getElementById(inpId);
    if (!presetId || !inp) return;

    const unlocked = ensurePresetStructureOnly(gs.company);
    const idx = unlocked.findIndex(p => p.id === presetId);
    if (idx < 0) return;

    const raw = (inp.value || '').trim().slice(0, 12);
    unlocked[idx].name = raw || DEFAULT_PRESET_NAMES[idx] || `プリセット${idx + 1}`;
    if (context === 'office') _officeRenamingId = null;
    else _preRenamingId = null;

    callInitAudio();
    callPlaySound('place');
    callSaveGame();

    if (context === 'office') {
      if (_ctx.showUpgradeFeedback) {
        _ctx.showUpgradeFeedback(`✏️ プリセット名を「${unlocked[idx].name}」に変更しました`, 'var(--c-emerald)');
      }
      callRefreshHomeAndOffice();
      const stg = getStage();
      if (stg && document.getElementById('screen-mission')?.classList.contains('active')) {
        renderMissionDeckPanel(stg);
      }
    } else {
      renderPrePuzzleModal();
      renderMissionDeckPanel(getStage());
    }
  }

  function cancelRename(context = 'office') {
    if (context === 'office') {
      _officeRenamingId = null;
      callRefreshHomeAndOffice();
    } else {
      _preRenamingId = null;
      renderPrePuzzleModal();
    }
  }

  /* ============================================================
     2. パズル一時デッキ状態
  ============================================================ */
  function getMissionTempDeck() {
    if (!_missionTempDeck) return null;
    return {
      basePresetId: _missionTempDeck.basePresetId || 'preset_1',
      slotOverrides: { ...(_missionTempDeck.slotOverrides || {}) },
      customSlots: [...(_missionTempDeck.customSlots || [])]
    };
  }

  function setMissionTempDeck(deckObj) {
    if (!deckObj) {
      _missionTempDeck = null;
      return;
    }
    const norm = normalizeDeckObj(deckObj);
    _missionTempDeck = {
      basePresetId: deckObj.basePresetId || 'preset_1',
      slotOverrides: norm.slotOverrides,
      customSlots: norm.customSlots
    };
  }

  function clearMissionTempDeck() {
    _missionTempDeck = null;
  }

  function revertMissionTempDeck() {
    callInitAudio();
    callPlaySound('rotate');
    _missionTempDeck = null;
    if (_ctx.showFloatingText) {
      _ctx.showFloatingText('↩ プリセットの標準構成に戻しました', '#38bdf8');
    }
    renderMissionDeckPanel(getStage());
  }

  /* ============================================================
     3. 案件別2段階診断（🔴必須欠落 / 🟡1周目不足＆任意部屋）
  ============================================================ */
  function diagnoseMissionDeck(stage, overrideDeckData = null) {
    const errors = [];
    const hints = [];
    if (!stage || stage.isTutorial) {
      return { errors, hints, hasError: false, hasHint: false };
    }

    const ids = getActiveDeckIdsSafe(overrideDeckData || null);
    const pMap = getPieceMap();
    const tEnum = getT();

    const hasReq = (id) => Array.isArray(stage.requests) && stage.requests.some(r => r && r.id === id);
    const hasOpt = (id) => Array.isArray(stage.optionalRequests) && stage.optionalRequests.some(o => o && o.id === id);

    let studioCount = 0;
    let sunroomCount = 0;
    let garageCount = 0;
    let laundryCount = 0;
    let washitsuCount = 0;
    let sepToiletCount = 0;
    let bathTotalCount = 0;
    let sepBathCount = 0;
    let normalClosetCells = 0;

    for (const pid of ids) {
      const p = pMap[pid];
      if (!p) continue;
      if (pid === 'room-studio') studioCount++;
      if (pid === 'room-sunroom') sunroomCount++;
      if (pid === 'closet-garage') garageCount++;
      if (pid === 'wash-laundry') laundryCount++;
      if (pid === 'room-wa' || pid === 'room-wa2') washitsuCount++;
      if (p.cat === tEnum.TOILET) sepToiletCount++;
      if (p.cat === tEnum.BATH) {
        bathTotalCount++;
        if (pid !== 'unit-bath') sepBathCount++;
      }
      if (p.cat === tEnum.CLOSET && pid !== 'closet-garage') {
        normalClosetCells += countCells(p.shape);
      }
    }

    // 🔴 Tier 1: 基本依頼に必須の専用部屋が0枚（達成不可）
    if (hasReq('req_studio') && studioCount === 0) {
      errors.push('必須の「防音書斎(2)」がデッキに入っていません');
    }
    if (hasReq('req_sunroom') && sunroomCount === 0) {
      errors.push('必須の「サンルーム(2)」がデッキに入っていません');
    }
    if (hasReq('req_garage') && garageCount === 0) {
      errors.push('必須の「土間ガレージ(4)」がデッキに入っていません');
    }
    if (hasReq('req_laundry') && laundryCount === 0) {
      errors.push('必須の「ランドリー室(2)」がデッキに入っていません');
    }
    if ((hasReq('btsep') || hasReq('reno_no_ub')) && sepBathCount === 0) {
      errors.push('必須の「風呂・トイレ別」に必要な独立浴室がデッキに入っていません');
    }

    // 🟡 Tier 2: 枚数不足（2周目割増待ち）＆ 開発済み任意部屋未編成ヒント
    if (hasReq('toilet2') && sepToiletCount < 2) {
      hints.push(`トイレが${sepToiletCount}枚のみです（2箇所必須のため、このままでは山札2周目の割増コスト待ちになります）`);
    }
    if (hasReq('bath2')) {
      const needSep = hasReq('btsep') || hasReq('reno_no_ub');
      const availBath = needSep ? sepBathCount : bathTotalCount;
      if (availBath < 2) {
        hints.push(`条件に合う浴室が${availBath}枚のみです（2つ以上必須のため、このままでは山札2周目の割増コスト待ちになります）`);
      }
    }
    if (hasReq('closet4') && normalClosetCells < 4) {
      hints.push(`通常収納が合計${normalClosetCells}マスのため、大型収納(4マス以上)は山札2周目待ちになります`);
    } else if (hasReq('closet2') && normalClosetCells < 2) {
      hints.push(`通常収納が合計${normalClosetCells}マスのため、収納充実(2マス以上)は山札2周目待ちになります`);
    }

    const washitsuUnlocked = isPieceUnlockedSafe('room-wa') || isPieceUnlockedSafe('room-wa2');
    if (hasOpt('opt-washitsu') && washitsuCount === 0 && washitsuUnlocked) {
      hints.push('任意要望「和の趣」用の和室がデッキに入っていません（プリセット切替や調整で狙えます）');
    }

    return {
      errors,
      hints,
      hasError: errors.length > 0,
      hasHint: hints.length > 0
    };
  }

  function renderDiagnosisBannerHtml(diag, opts = {}) {
    const compact = !!opts.compact;
    const pad = compact ? '7px 9px' : '9px 11px';
    const fontSz = compact ? '10.5px' : '11.5px';
    let html = '';

    if (diag.hasError) {
      const items = diag.errors.map(e => `<li>${escHtml(e)}</li>`).join('');
      html += `
        <div style="padding:${pad}; border-radius:7px; background:rgba(244,63,94,0.16); border:1.5px solid rgba(244,63,94,0.55); color:#fecdd3; font-size:${fontSz}; line-height:1.45; margin-bottom:${diag.hasHint ? '6px' : '0'};">
          <div style="font-weight:900; color:#fda4af; display:flex; align-items:center; gap:5px; margin-bottom:2px;">
            <span>🔴 デッキ構成の警告（必須ピース不足）</span>
          </div>
          <ul style="margin:2px 0 0 16px; padding:0;">${items}</ul>
        </div>
      `;
    }
    if (diag.hasHint) {
      const items = diag.hints.map(h => `<li>${escHtml(h)}</li>`).join('');
      html += `
        <div style="padding:${pad}; border-radius:7px; background:rgba(245,158,11,0.14); border:1px solid rgba(245,158,11,0.48); color:#fef3c7; font-size:${fontSz}; line-height:1.45;">
          <div style="font-weight:800; color:#fcd34d; display:flex; align-items:center; gap:5px; margin-bottom:2px;">
            <span>🟡 デッキ調整のヒント</span>
          </div>
          <ul style="margin:2px 0 0 16px; padding:0;">${items}</ul>
        </div>
      `;
    }
    if (!diag.hasError && !diag.hasHint) {
      html = `
        <div style="padding:6px 9px; border-radius:6px; background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.34); color:#a7f3d0; font-size:10.5px; display:flex; align-items:center; gap:5px;">
          <span>✅</span><span>この案件の要件を満たすピース構成が揃っています</span>
        </div>
      `;
    }
    return html;
  }

  /* ============================================================
     4. オフィス＞デッキタブ用 プリセットバー
  ============================================================ */
  function renderOfficePresetBarHtml(co) {
    if (!co) return '';
    const unlocked = ensurePresetStructureOnly(co);
    const maxCount = unlocked.length;
    const active = unlocked.find(p => p.id === co.activePresetId) || unlocked[0];
    const nextInfo = getNextUnlockOfficeInfo(co.officeLevel || 0);

    let tabsHtml = '';
    for (const p of unlocked) {
      const isAct = active && p.id === active.id;
      tabsHtml += `
        <button type="button" onclick="DXDeck.selectPreset('${escHtml(p.id)}', 'office')"
          style="padding:5px 9px; border-radius:6px; font-size:11px; font-weight:${isAct ? '900' : 'bold'}; cursor:pointer; border:1.5px solid ${isAct ? '#f59e0b' : 'rgba(148,163,184,0.32)'}; background:${isAct ? 'rgba(245,158,11,0.22)' : 'rgba(15,23,42,0.55)'}; color:${isAct ? '#fde047' : '#cbd5e1'}; white-space:nowrap;">
          ${isAct ? '● ' : ''}${escHtml(p.name)}
        </button>
      `;
    }

    const nextBadgeHtml = nextInfo
      ? `<span style="font-size:10px; color:#94a3b8; background:rgba(15,23,42,0.5); border:1px dashed rgba(148,163,184,0.28); padding:3px 7px; border-radius:5px;">🔒 Rank${nextInfo.rankNum}「${escHtml(nextInfo.officeName)}」で${nextInfo.nextCount}枠に拡張</span>`
      : `<span style="font-size:10px; color:#6ee7b7; font-weight:bold;">✨ 最大${maxCount}枠解放済</span>`;

    let renameRowHtml = '';
    if (active && _officeRenamingId === active.id) {
      renameRowHtml = `
        <div style="display:flex; gap:5px; align-items:center; margin-top:7px; padding-top:7px; border-top:1px dashed rgba(255,255,255,0.12);">
          <input id="dx-office-rename-input" type="text" maxlength="12" value="${escHtml(active.name)}"
            onkeydown="if(event.key==='Enter'){event.preventDefault();DXDeck.commitRename('office');}else if(event.key==='Escape'){DXDeck.cancelRename('office');}"
            style="flex:1; min-width:0; padding:5px 8px; border-radius:5px; border:1px solid #38bdf8; background:#0f172a; color:#fff; font-size:11.5px;">
          <button type="button" class="btn btn-primary" onclick="DXDeck.commitRename('office')" style="padding:5px 9px; font-size:10.5px;">保存</button>
          <button type="button" class="btn btn-slate" onclick="DXDeck.cancelRename('office')" style="padding:5px 8px; font-size:10.5px;">取消</button>
        </div>
      `;
    }

    return `
      <div style="background:rgba(15,23,42,0.72); border:1px solid rgba(56,189,248,0.28); border-radius:8px; padding:9px 10px; margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:6px;">
          <div style="font-size:11.5px; font-weight:bold; color:#7dd3fc; display:flex; align-items:center; gap:5px;">
            <i class="ph-bold ph-folders"></i> デッキプリセット (${maxCount}/6枠)
          </div>
          ${active ? `
            <button type="button" class="btn btn-slate" onclick="DXDeck.toggleRenameUI('${escHtml(active.id)}', 'office')" style="padding:3px 7px; font-size:10px;">
              ✏️ 名前変更
            </button>
          ` : ''}
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:5px; align-items:center;">
          ${tabsHtml}
          ${nextBadgeHtml}
        </div>
        ${renameRowHtml}
      </div>
    `;
  }

  /* ============================================================
     5. パズル直前画面（screen-mission）内デッキパネル
  ============================================================ */
  function renderMissionDeckPanel(stage) {
    const panel = document.getElementById('mission-deck-panel');
    if (!panel) return;
    if (!stage || stage.isTutorial) {
      panel.style.display = 'none';
      panel.innerHTML = '';
      return;
    }

    const gs = getGameState();
    const co = gs && gs.company;
    if (!co) return;
    const unlocked = ensurePresets(co);
    const activePreset = unlocked.find(p => p.id === co.activePresetId) || unlocked[0];
    const isTemp = Boolean(_missionTempDeck);
    const deckIds = getActiveDeckIdsSafe(null);
    const diag = diagnoseMissionDeck(stage, null);
    const nextInfo = getNextUnlockOfficeInfo(co.officeLevel || 0);

    let presetBtnsHtml = '';
    for (const p of unlocked) {
      const isSelected = !isTemp && activePreset && p.id === activePreset.id;
      presetBtnsHtml += `
        <button type="button" onclick="DXDeck.selectPreset('${escHtml(p.id)}', 'mission')"
          style="padding:4px 8px; border-radius:5px; font-size:10.5px; font-weight:${isSelected ? '900' : 'bold'}; cursor:pointer; border:1px solid ${isSelected ? '#38bdf8' : 'rgba(148,163,184,0.3)'}; background:${isSelected ? 'rgba(56,189,248,0.22)' : 'rgba(15,23,42,0.6)'}; color:${isSelected ? '#e0f2fe' : '#94a3b8'};">
          ${escHtml(p.name)}
        </button>
      `;
    }

    const activeLabelHtml = isTemp
      ? `<span style="font-size:11px; font-weight:bold; color:#fde047;">⚡ この案件だけ調整中</span>
         <button type="button" class="btn btn-slate" onclick="DXDeck.revertMissionTempDeck()" style="padding:2px 7px; font-size:9.5px;">元に戻す</button>`
      : `<span style="font-size:11.5px; font-weight:bold; color:#e0f2fe;">📁 ${escHtml(activePreset ? activePreset.name : '標準バランス')}</span>`;

    const lockHintHtml = nextInfo
      ? `<span style="font-size:9.5px; color:#64748b;">🔒${escHtml(nextInfo.officeName)}で${nextInfo.nextCount}枠目</span>`
      : '';

    panel.style.display = 'block';
    panel.innerHTML = `
      <div class="mission-card-title" style="display:flex; justify-content:space-between; align-items:center; gap:6px; margin-bottom:7px;">
        <span style="display:inline-flex; align-items:center; gap:6px;">
          <i class="ph-bold ph-cards" style="color:#38bdf8;"></i> 使用デッキ
          <span style="font-size:10.5px; color:#fbbf24; font-weight:bold;">(計 ${deckIds.length}枚)</span>
        </span>
        <button type="button" class="btn btn-slate" onclick="DXDeck.openPrePuzzleEditor()" style="padding:3px 9px; font-size:10.5px; font-weight:bold; border:1px solid rgba(56,189,248,0.45); color:#bae6fd;">
          🃏 調整する
        </button>
      </div>
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:6px; margin-bottom:7px;">
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          ${activeLabelHtml}
        </div>
        ${lockHintHtml}
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:8px;">
        ${presetBtnsHtml}
      </div>
      ${renderDiagnosisBannerHtml(diag, { compact: true })}
    `;
  }

  /* ============================================================
     6. パズル直前 インライン調整モーダル
  ============================================================ */
  function openPrePuzzleEditor() {
    const gs = getGameState();
    const stg = getStage();
    if (!gs || !gs.company || !stg) return;
    if (stg.isTutorial) return;

    callInitAudio();
    callPlaySound('tap');

    const co = gs.company;
    const unlocked = ensurePresets(co);
    const active = unlocked.find(p => p.id === co.activePresetId) || unlocked[0];
    const sourceDeck = _missionTempDeck || active;
    const norm = normalizeDeckObj(sourceDeck);

    _editorDraft = {
      presetId: active ? active.id : 'preset_1',
      basePresetId: (_missionTempDeck && _missionTempDeck.basePresetId) || (active ? active.id : 'preset_1'),
      slotOverrides: norm.slotOverrides,
      customSlots: norm.customSlots,
      editingSlot: null
    };
    _preRenamingId = null;

    renderPrePuzzleModal();
    const modal = document.getElementById('pre-puzzle-deck-modal');
    if (modal) modal.style.display = 'flex';
  }

  function closePrePuzzleEditor() {
    _preRenamingId = null;
    if (_editorDraft) _editorDraft.editingSlot = null;
    const modal = document.getElementById('pre-puzzle-deck-modal');
    if (modal) modal.style.display = 'none';
  }

  function togglePreSlotEditor(type, id) {
    if (!_editorDraft) return;
    callInitAudio();
    callPlaySound('rotate');
    const cur = _editorDraft.editingSlot;
    if (!type || (cur && cur.type === type && cur.id === id)) {
      _editorDraft.editingSlot = null;
    } else {
      _editorDraft.editingSlot = { type, id };
    }
    renderPrePuzzleModal();
  }

  function setPreSlotOverride(slotId, pieceId) {
    if (!_editorDraft) return;
    const slots = getUpgradeSlots();
    const slot = slots.find(s => s.id === slotId);
    const p = getPieceMap()[pieceId];
    if (!slot || !p || !isPieceAllowedSafe(slot, p) || !isPieceUnlockedSafe(pieceId)) return;

    callInitAudio();
    callPlaySound('place');
    if (pieceId === slot.defaultPieceId) {
      delete _editorDraft.slotOverrides[slotId];
    } else {
      _editorDraft.slotOverrides[slotId] = pieceId;
    }
    _editorDraft.editingSlot = null;
    renderPrePuzzleModal();
  }

  function setPreCustomSlot(index, pieceId) {
    if (!_editorDraft) return;
    const cnt = getCustomSlotsCount();
    if (index < 0 || index >= cnt) return;

    callInitAudio();
    if (!pieceId) {
      _editorDraft.customSlots[index] = null;
      callPlaySound('rotate');
    } else {
      const p = getPieceMap()[pieceId];
      if (!p || !isPieceUnlockedSafe(pieceId)) return;
      _editorDraft.customSlots[index] = pieceId;
      callPlaySound('place');
    }
    _editorDraft.editingSlot = null;
    renderPrePuzzleModal();
  }

  function resetPreDraftToDefault() {
    if (!_editorDraft) return;
    callInitAudio();
    callPlaySound('rotate');
    const norm = normalizeDeckObj(null);
    _editorDraft.slotOverrides = norm.slotOverrides;
    _editorDraft.customSlots = norm.customSlots;
    _editorDraft.editingSlot = null;
    renderPrePuzzleModal();
  }

  function applyPrePuzzleTemp() {
    if (!_editorDraft) return;
    callInitAudio();
    callPlaySound('place');
    setMissionTempDeck({
      basePresetId: _editorDraft.presetId,
      slotOverrides: _editorDraft.slotOverrides,
      customSlots: _editorDraft.customSlots
    });
    closePrePuzzleEditor();
    renderMissionDeckPanel(getStage());
    if (_ctx.showFloatingText) {
      _ctx.showFloatingText('⚡ この案件限定の仮デッキを適用しました', '#fbbf24');
    }
  }

  function applyPrePuzzleSave() {
    const gs = getGameState();
    if (!_editorDraft || !gs || !gs.company) return;
    callInitAudio();
    callPlaySound('clear');

    const co = gs.company;
    const unlocked = ensurePresetStructureOnly(co);
    const target = unlocked.find(p => p.id === _editorDraft.presetId) || unlocked[0];
    if (target) {
      const norm = normalizeDeckObj(_editorDraft);
      target.slotOverrides = norm.slotOverrides;
      target.customSlots = norm.customSlots;
      co.activePresetId = target.id;
      copyDeckIntoCo(co, target);
    }
    clearMissionTempDeck();
    callSaveGame();
    closePrePuzzleEditor();
    renderMissionDeckPanel(getStage());
    callRefreshHomeAndOffice();
    if (_ctx.showFloatingText && target) {
      _ctx.showFloatingText(`💾 「${target.name}」に保存して適用しました`, '#10b981');
    }
  }

  function openOfficeFromPreEditor() {
    closePrePuzzleEditor();
    if (_ctx.setDeckSubTab) _ctx.setDeckSubTab('rd');
    else if (typeof window !== 'undefined' && typeof window.setDeckSubTab === 'function') window.setDeckSubTab('rd');
    if (_ctx.openCompanyUpgradeModal) _ctx.openCompanyUpgradeModal('deck');
    else if (typeof openCompanyUpgradeModal === 'function') openCompanyUpgradeModal('deck');
  }

  function buildDeckBinderGroups() {
    return [
      {
        key: 'room',
        title: '🛏️ 居室 (5)',
        fixedIds: ['room-22', 'room-22'],
        slotIds: ['room_slot_1', 'room_slot_2', 'room_slot_3']
      },
      {
        key: 'corr',
        title: '🏃 廊下 (4)',
        fixedIds: ['corr-1', 'corr-i2'],
        slotIds: ['corr_slot_1', 'corr_slot_2']
      },
      {
        key: 'ldk',
        title: '🛋️ LDK (3)',
        fixedIds: ['k-1'],
        slotIds: ['ldk_slot_1', 'ldk_slot_2']
      },
      {
        key: 'wet_closet',
        title: '🚿 水回り・収納 (8)',
        fixedIds: ['toilet', 'wash', 'bath', 'closet'],
        slotIds: ['utility_slot_1', 'bath_slot_1', 'wash_slot_1', 'closet_slot_1']
      }
    ];
  }

  function renderPrePuzzleModal() {
    const body = document.getElementById('pre-puzzle-deck-body');
    if (!body || !_editorDraft) return;
    const gs = getGameState();
    const stg = getStage();
    const co = gs && gs.company;
    if (!co) return;
    const scrollState = captureScrollState(body);

    const unlocked = ensurePresetStructureOnly(co);
    const curPreset = unlocked.find(p => p.id === _editorDraft.presetId) || unlocked[0];
    const pMap = getPieceMap();
    const pLib = getPieceLib();
    const slots = getUpgradeSlots();
    const customCnt = getCustomSlotsCount();
    const tEnum = getT();

    const catNameMap = {
      [tEnum.CORRIDOR]: '廊下',
      [tEnum.LDK]:      'LDK',
      [tEnum.ROOM]:     '居室',
      [tEnum.BATH]:     '浴室',
      [tEnum.TOILET]:   'トイレ',
      [tEnum.WASHROOM]: '洗面',
      [tEnum.CLOSET]:   '収納'
    };

    const draftIds = getActiveDeckIdsSafe(_editorDraft);
    const diag = diagnoseMissionDeck(stg, _editorDraft);
    const unlockedList = pLib.filter(p => isPieceUnlockedSafe(p.id));

    // プリセットバー
    let presetTabsHtml = '';
    for (const p of unlocked) {
      const isAct = curPreset && p.id === curPreset.id;
      presetTabsHtml += `
        <button type="button" onclick="DXDeck.selectPreset('${escHtml(p.id)}', 'pre')"
          style="padding:4px 8px; border-radius:5px; font-size:10.5px; font-weight:${isAct ? '900' : 'bold'}; cursor:pointer; border:1.5px solid ${isAct ? '#f59e0b' : 'rgba(148,163,184,0.3)'}; background:${isAct ? 'rgba(245,158,11,0.22)' : 'rgba(15,23,42,0.6)'}; color:${isAct ? '#fde047' : '#cbd5e1'};">
          ${escHtml(p.name)}
        </button>
      `;
    }

    let renameRowHtml = '';
    if (curPreset && _preRenamingId === curPreset.id) {
      renameRowHtml = `
        <div style="display:flex; gap:5px; align-items:center; margin-top:6px;">
          <input id="dx-pre-rename-input" type="text" maxlength="12" value="${escHtml(curPreset.name)}"
            onkeydown="if(event.key==='Enter'){event.preventDefault();DXDeck.commitRename('pre');}else if(event.key==='Escape'){DXDeck.cancelRename('pre');}"
            style="flex:1; min-width:0; padding:5px 8px; border-radius:5px; border:1px solid #38bdf8; background:#0f172a; color:#fff; font-size:11px;">
          <button type="button" class="btn btn-primary" onclick="DXDeck.commitRename('pre')" style="padding:4px 9px; font-size:10.5px;">保存</button>
          <button type="button" class="btn btn-slate" onclick="DXDeck.cancelRename('pre')" style="padding:4px 8px; font-size:10.5px;">取消</button>
        </div>
      `;
    }

    const renderCard = (pieceId, opts = {}) => {
      const p = pMap[pieceId];
      if (!p) return '';
      const cells = countCells(p.shape);
      const effCost = getPieceCostSafe(p, false);
      const isLocked = !!opts.locked;
      const isEditing = !!opts.isEditing;
      const isModified = !!opts.isModified;
      const clickAttr = opts.onClick ? `onclick="${opts.onClick}"` : '';

      if (isLocked) {
        return `
          <div class="deck-hscroll-card" style="display:flex; flex-direction:column; align-items:center; justify-content:space-between; padding:5px 4px; border-radius:7px; background:rgba(15,23,42,0.45); border:1px solid rgba(148,163,184,0.18); opacity:0.75; min-height:72px;">
            <div style="width:100%; display:flex; justify-content:space-between; font-size:8px; color:#94a3b8;">
              <span>🔒固定</span><span>${cells}ﾏｽ</span>
            </div>
            <div style="margin:3px 0; min-height:22px; display:flex; align-items:center; justify-content:center;">
              ${renderMiniShapeSafe(p, 6)}
            </div>
            <div style="text-align:center; width:100%;">
              <div style="font-size:9.5px; font-weight:bold; color:#cbd5e1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escHtml(p.name)}</div>
              <div style="font-size:8px; color:#94a3b8;">${effCost.toFixed(1)}万</div>
            </div>
          </div>
        `;
      }

      const borderColor = isEditing ? '#f59e0b' : (isModified ? 'rgba(56,189,248,0.8)' : 'rgba(56,189,248,0.4)');
      const bgStyle = isEditing
        ? 'rgba(245,158,11,0.22)'
        : (isModified ? 'rgba(56,189,248,0.14)' : 'rgba(30,41,59,0.88)');
      const badge = isEditing ? '🎯選択' : (isModified ? '✨変更' : '🔄入替');

      return `
        <div ${clickAttr} class="deck-hscroll-card" style="display:flex; flex-direction:column; align-items:center; justify-content:space-between; padding:5px 4px; border-radius:7px; background:${bgStyle}; border:1.5px solid ${borderColor}; min-height:72px; cursor:pointer;">
          <div style="width:100%; display:flex; justify-content:space-between; font-size:8px; font-weight:bold; color:${isEditing ? '#fde047' : '#38bdf8'};">
            <span>${badge}</span><span style="color:#cbd5e1;">${cells}ﾏｽ</span>
          </div>
          <div style="margin:3px 0; min-height:22px; display:flex; align-items:center; justify-content:center;">
            ${renderMiniShapeSafe(p, 6)}
          </div>
          <div style="text-align:center; width:100%;">
            <div style="font-size:9.5px; font-weight:bold; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escHtml(p.name)}</div>
            <div style="font-size:8px; color:var(--c-emerald); font-weight:bold;">${effCost.toFixed(1)}万</div>
          </div>
        </div>
      `;
    };

    const renderTray = (slotType, slotKey, curPieceId, slotDef = null) => {
      const candidates = slotDef
        ? unlockedList.filter(p => isPieceAllowedSafe(slotDef, p))
        : unlockedList;
      const lockedCandidates = slotDef
        ? pLib.filter(p => isPieceAllowedSafe(slotDef, p) && !isPieceUnlockedSafe(p.id))
        : pLib.filter(p => !isPieceUnlockedSafe(p.id));
      const defPiece = slotDef && slotDef.defaultPieceId ? pMap[slotDef.defaultPieceId] : null;

      let cardsHtml = `<div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:5px; margin-top:6px;">`;
      if (slotType === 'custom') {
        const isEmptySel = !curPieceId;
        cardsHtml += `
          <div onclick="DXDeck.setPreCustomSlot(${slotKey}, '')" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:6px 4px; border-radius:6px; background:${isEmptySel ? 'rgba(244,63,94,0.18)' : 'rgba(15,23,42,0.6)'}; border:1.5px dashed ${isEmptySel ? '#f43f5e' : '#475569'}; cursor:pointer; min-height:70px;">
            <i class="ph-bold ph-prohibit" style="font-size:16px; color:#94a3b8; margin-bottom:2px;"></i>
            <div style="font-size:9.5px; font-weight:bold; color:#cbd5e1;">外す</div>
          </div>
        `;
      }
      for (const p of candidates) {
        const isSel = p.id === curPieceId;
        const cells = countCells(p.shape);
        const effCost = getPieceCostSafe(p, false);
        const fnCall = slotType === 'upgrade'
          ? `DXDeck.setPreSlotOverride('${escHtml(slotKey)}', '${escHtml(p.id)}')`
          : `DXDeck.setPreCustomSlot(${slotKey}, '${escHtml(p.id)}')`;
        cardsHtml += `
          <div onclick="${fnCall}" style="display:flex; flex-direction:column; align-items:center; justify-content:space-between; padding:5px 4px; border-radius:6px; background:${isSel ? 'rgba(16,185,129,0.22)' : 'rgba(15,23,42,0.75)'}; border:1.5px solid ${isSel ? '#10b981' : 'rgba(255,255,255,0.15)'}; cursor:pointer; min-height:70px;">
            <div style="width:100%; display:flex; justify-content:space-between; font-size:8px; color:${isSel ? '#6ee7b7' : '#94a3b8'};">
              <span>${isSel ? '✓編成中' : (catNameMap[p.cat] || '')}</span><span>${cells}ﾏｽ</span>
            </div>
            <div style="margin:2px 0; min-height:22px; display:flex; align-items:center; justify-content:center;">
              ${renderMiniShapeSafe(p, 6)}
            </div>
            <div style="text-align:center; width:100%;">
              <div style="font-size:9.5px; font-weight:bold; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escHtml(p.name)}</div>
              <div style="font-size:8px; color:var(--c-emerald); font-weight:bold;">${effCost.toFixed(1)}万</div>
            </div>
          </div>
        `;
      }
      for (const lp of lockedCandidates) {
        const cells = countCells(lp.shape);
        cardsHtml += `
          <div style="display:flex; flex-direction:column; align-items:center; justify-content:space-between; padding:5px 4px; border-radius:6px; background:rgba(15,23,42,0.35); border:1px dashed rgba(148,163,184,0.2); opacity:0.55; min-height:70px;">
            <div style="width:100%; display:flex; justify-content:space-between; font-size:8px; color:#f59e0b;">
              <span>🔒${lp.unlockCost}万</span><span style="color:#94a3b8;">${cells}ﾏｽ</span>
            </div>
            <div style="margin:2px 0; min-height:22px; display:flex; align-items:center; justify-content:center;">
              ${renderMiniShapeSafe(lp, 5)}
            </div>
            <div style="text-align:center; width:100%;">
              <div style="font-size:9px; color:#94a3b8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escHtml(lp.name)}</div>
            </div>
          </div>
        `;
      }
      cardsHtml += `</div>`;

      return `
        <div style="margin-top:6px; padding:8px; border-radius:7px; background:#0f172a; border:1.5px solid #f59e0b;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="font-size:10.5px; font-weight:bold; color:#fde047;">
              ${slotType === 'upgrade' ? `${escHtml(slotDef?.label || '入替枠')}（初期: ${escHtml(defPiece ? defPiece.name : '')}）` : `追加枠${slotKey + 1} の選択`}
            </div>
            <button type="button" class="btn btn-slate" onclick="DXDeck.togglePreSlotEditor(null, null)" style="padding:2px 6px; font-size:9.5px;">閉じる</button>
          </div>
          ${cardsHtml}
        </div>
      `;
    };

    const editingSlot = _editorDraft.editingSlot;
    const groups = buildDeckBinderGroups();
    let groupsHtml = '';
    for (const grp of groups) {
      let rowHtml = `<div class="deck-hscroll-row" data-hscroll-key="pre_${grp.key}">`;
      for (const fid of grp.fixedIds) {
        rowHtml += renderCard(fid, { locked: true });
      }
      let activeSlot = null;
      for (const sid of grp.slotIds) {
        const sDef = slots.find(s => s.id === sid);
        if (!sDef) continue;
        const ov = _editorDraft.slotOverrides[sid];
        const curId = (ov && pMap[ov] && isPieceAllowedSafe(sDef, pMap[ov]) && isPieceUnlockedSafe(ov))
          ? ov
          : sDef.defaultPieceId;
        const isEd = editingSlot && editingSlot.type === 'upgrade' && editingSlot.id === sid;
        if (isEd) activeSlot = { sDef, curId };
        rowHtml += renderCard(curId, {
          locked: false,
          isEditing: isEd,
          isModified: curId !== sDef.defaultPieceId,
          onClick: `DXDeck.togglePreSlotEditor('upgrade', '${escHtml(sid)}')`
        });
      }
      rowHtml += `</div>`;
      const trayHtml = activeSlot ? renderTray('upgrade', activeSlot.sDef.id, activeSlot.curId, activeSlot.sDef) : '';
      const hasOverflow = (grp.fixedIds.length + grp.slotIds.length) >= 5;
      groupsHtml += `
        <div style="margin-bottom:7px; padding:7px; background:rgba(15,23,42,0.42); border-radius:7px; border:1px solid rgba(255,255,255,0.06);">
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:10px; font-weight:bold; color:#e2e8f0; margin-bottom:5px;">
            <span>${grp.title}</span>
            ${hasOverflow ? '<span style="font-size:9px; color:#7dd3fc; font-weight:normal;">↔ 横スクロール</span>' : ''}
          </div>
          ${rowHtml}
          ${trayHtml}
        </div>
      `;
    }

    let customGridHtml = `<div class="deck-hscroll-row" data-hscroll-key="pre_custom">`;
    let activeCustIdx = null;
    for (let i = 0; i < customCnt; i++) {
      const cid = _editorDraft.customSlots[i] || '';
      const isEd = editingSlot && editingSlot.type === 'custom' && editingSlot.id === i;
      if (isEd) activeCustIdx = i;
      if (cid && pMap[cid]) {
        customGridHtml += renderCard(cid, {
          locked: false,
          isEditing: isEd,
          isModified: true,
          onClick: `DXDeck.togglePreSlotEditor('custom', ${i})`
        });
      } else {
        customGridHtml += `
          <div class="deck-hscroll-card" onclick="DXDeck.togglePreSlotEditor('custom', ${i})" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:5px 4px; border-radius:7px; background:${isEd ? 'rgba(245,158,11,0.18)' : 'rgba(15,23,42,0.45)'}; border:1.5px dashed ${isEd ? '#f59e0b' : 'rgba(56,189,248,0.45)'}; min-height:72px; cursor:pointer;">
            <i class="ph-bold ph-plus-circle" style="font-size:16px; color:${isEd ? '#fde047' : '#38bdf8'}; margin-bottom:2px;"></i>
            <div style="font-size:9px; font-weight:bold; color:${isEd ? '#fde047' : '#bae6fd'};">＋ 追加</div>
          </div>
        `;
      }
    }
    customGridHtml += `</div>`;
    const customTrayHtml = (activeCustIdx !== null)
      ? renderTray('custom', activeCustIdx, _editorDraft.customSlots[activeCustIdx] || '', null)
      : '';

    const presetName = curPreset ? curPreset.name : '標準バランス';

    body.innerHTML = `
      <div style="background:rgba(15,23,42,0.75); border:1px solid rgba(56,189,248,0.28); border-radius:8px; padding:8px 9px; margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
          <span style="font-size:11px; font-weight:bold; color:#7dd3fc;">📁 プリセット (${unlocked.length}枠)</span>
          <div style="display:flex; gap:5px;">
            ${curPreset ? `<button type="button" class="btn btn-slate" onclick="DXDeck.toggleRenameUI('${escHtml(curPreset.id)}', 'pre')" style="padding:2px 7px; font-size:9.5px;">✏️ 名前変更</button>` : ''}
            <button type="button" class="btn btn-slate" onclick="DXDeck.resetPreDraftToDefault()" style="padding:2px 7px; font-size:9.5px;">初期値</button>
          </div>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:4px;">${presetTabsHtml}</div>
        ${renameRowHtml}
      </div>

      <div style="margin-bottom:8px;">
        ${renderDiagnosisBannerHtml(diag, { compact: true })}
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; padding:0 2px;">
        <span style="font-size:11px; font-weight:bold; color:#cbd5e1;">カードをタップして差し替え</span>
        <span style="font-size:12px; font-weight:900; color:#fbbf24;">合計 ${draftIds.length} 枚</span>
      </div>

      ${groupsHtml}

      <div style="padding:7px; background:rgba(15,23,42,0.42); border-radius:7px; border:1px solid rgba(56,189,248,0.25); margin-bottom:10px;">
        <div style="font-size:10px; font-weight:bold; color:#38bdf8; margin-bottom:5px;">＋ 追加枠（最大 +${customCnt}枚）</div>
        ${customGridHtml}
        ${customTrayHtml}
      </div>

      <div style="text-align:center; margin-bottom:4px;">
        <button type="button" class="btn btn-slate" onclick="DXDeck.openOfficeFromPreEditor()" style="padding:5px 12px; font-size:10.5px; color:#6ee7b7; border:1px solid rgba(16,185,129,0.35);">
          🔬 オフィスで新しいピースを開発する
        </button>
      </div>
    `;

    const saveBtn = document.getElementById('btn-pre-deck-save');
    if (saveBtn) {
      saveBtn.textContent = `💾 「${presetName}」に保存して適用`;
    }
    restoreScrollState(body, scrollState);
  }

  /* ============================================================
     7. 必須ピース欠落時の開始確認ダイアログ
  ============================================================ */
  function confirmStartWithDiagnosis(stage, onProceed) {
    if (!stage || stage.isTutorial) {
      if (typeof onProceed === 'function') onProceed();
      return;
    }
    const diag = diagnoseMissionDeck(stage, null);
    if (!diag.hasError) {
      if (typeof onProceed === 'function') onProceed();
      return;
    }

    _pendingProceedFn = onProceed;
    const modal = document.getElementById('deck-warn-confirm-modal');
    const msgEl = document.getElementById('deck-warn-confirm-list');
    if (!modal || !msgEl) {
      if (typeof onProceed === 'function') onProceed();
      return;
    }
    msgEl.innerHTML = diag.errors.map(e => `<li>${escHtml(e)}</li>`).join('');
    modal.style.display = 'flex';
  }

  function closeWarnModal() {
    const modal = document.getElementById('deck-warn-confirm-modal');
    if (modal) modal.style.display = 'none';
    _pendingProceedFn = null;
  }

  function bindStaticListeners() {
    document.getElementById('btn-close-pre-deck')?.addEventListener('click', closePrePuzzleEditor);
    document.getElementById('btn-pre-deck-cancel')?.addEventListener('click', closePrePuzzleEditor);
    document.getElementById('btn-pre-deck-temp')?.addEventListener('click', applyPrePuzzleTemp);
    document.getElementById('btn-pre-deck-save')?.addEventListener('click', applyPrePuzzleSave);
    document.getElementById('pre-puzzle-deck-modal')?.addEventListener('pointerdown', (e) => {
      if (e.target && e.target.id === 'pre-puzzle-deck-modal') closePrePuzzleEditor();
    });

    document.getElementById('btn-deck-warn-adjust')?.addEventListener('click', () => {
      closeWarnModal();
      openPrePuzzleEditor();
    });
    document.getElementById('btn-deck-warn-proceed')?.addEventListener('click', () => {
      const fn = _pendingProceedFn;
      closeWarnModal();
      if (typeof fn === 'function') fn();
    });
    document.getElementById('btn-close-deck-warn')?.addEventListener('click', closeWarnModal);
    document.getElementById('deck-warn-confirm-modal')?.addEventListener('pointerdown', (e) => {
      if (e.target && e.target.id === 'deck-warn-confirm-modal') closeWarnModal();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindStaticListeners);
  } else {
    bindStaticListeners();
  }

  global.DXDeck = {
    DEFAULT_PRESET_NAMES,
    init,
    isConfirming,
    clearConfirm,
    armOrExecute,
    captureScrollState,
    restoreScrollState,
    getMaxPresetCount,
    getNextUnlockOfficeInfo,
    ensurePresets,
    syncActivePresetFromDeck,
    getActivePreset,
    selectPreset,
    toggleRenameUI,
    commitRename,
    cancelRename,
    getMissionTempDeck,
    setMissionTempDeck,
    clearMissionTempDeck,
    revertMissionTempDeck,
    diagnoseMissionDeck,
    renderOfficePresetBarHtml,
    renderMissionDeckPanel,
    openPrePuzzleEditor,
    closePrePuzzleEditor,
    renderPrePuzzleModal,
    togglePreSlotEditor,
    setPreSlotOverride,
    setPreCustomSlot,
    resetPreDraftToDefault,
    applyPrePuzzleTemp,
    applyPrePuzzleSave,
    openOfficeFromPreEditor,
    confirmStartWithDiagnosis,
    closeWarnModal
  };
})(window);
