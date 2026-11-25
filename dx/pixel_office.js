'use strict';
/**
 * pixel_office.js
 * Step B: カイロソフト風 インタラクティブ・ジオラマオフィス（高精細 48x48 対応・段階進化版）
 * - 10x8 固定比率キャンパス内で Rank 1(4x4) -> Rank 5(10x8) へ拡張
 * - カウンター (1x1 -> 2x1 -> 3x1 -> 2x2 L字)・社員机 (1.0 -> 1.5 -> 1.65)・カレンダー (壁掛け -> ホワイトボード) も連動進化
 * - 広くなってもスカスカにならない業務什器（コピー機・水サーバー・商談卓・建材棚・サーバー等）を配置
 */
(function (global) {
  const COLS = 10;
  const ROWS = 8;
  const GUIDE_STORAGE_KEY = 'floorplan_pixel_office_guides';

  const RANK_LAYOUTS = [
    // Rank 1 (officeLevel 0): 一人親方 4x4 自宅兼事務所
    {
      level: 0,
      c0: 3, r0: 2, cols: 4, rows: 4,
      floor: 'floor_room',
      wallBg: '#fef3c7',
      wallTop: '#d97706',
      facadeColor: '#92400e',
      extStyle: 'home_yard',
      boss: { deskSpr: 'off_desk_boss_0', charSpr: 'boss_0', c: 5, r: 3, w: 1 },
      reception: { spr: 'off_counter_small', c: 3, r: 4, w: 1, h: 1, doorC: 4, clientC: 4, clientR: 5, tagXOffset: 0.7 },
      bookshelf: { c: 3, r: 2 },
      cabinet: { c: 6, r: 2 },
      calendar: { spr: 'off_calendar', c: 4, r: 2, w: 1 },
      trophySpot: { c: 5, r: 2 },
      staffSlots: [],
      props: [
        { spr: 'furn_rug_foyer', c: 4, r: 5, w: 1, isRug: true },
        { spr: 'furn_plant', c: 3, r: 3, w: 1 },
        { spr: 'off_stand', c: 6, r: 4, w: 1 }
      ],
      wallDecos: [
        { spr: 'wall_clock', c: 5, r: 2 }
      ]
    },
    // Rank 2 (officeLevel 1): 地元事務所 6x5
    {
      level: 1,
      c0: 2, r0: 2, cols: 6, rows: 5,
      floor: 'floor_office_blue',
      wallBg: '#f1f5f9',
      wallTop: '#475569',
      facadeColor: '#64748b',
      extStyle: 'street',
      boss: { deskSpr: 'off_desk_boss_1', charSpr: 'boss_1', c: 6, r: 3, w: 1 },
      reception: { spr: 'off_counter', c: 2, r: 5, w: 2, h: 1, doorC: 3, clientC: 3, clientR: 6 },
      bookshelf: { c: 2, r: 2 },
      cabinet: { c: 7, r: 2 },
      calendar: { spr: 'off_calendar', c: 4, r: 2, w: 1 },
      trophySpot: { c: 6, r: 2 },
      staffSlots: [{ c: 4, r: 3, w: 1, sprPrefix: 'off_desk_staff', seatFrac: 0.5 }],
      props: [
        { spr: 'furn_rug_foyer', c: 3, r: 6, w: 1, isRug: true },
        { spr: 'off_printer', c: 2, r: 3, w: 1 },
        { spr: 'off_water', c: 7, r: 4, w: 1 },
        { spr: 'off_meeting_set', c: 5, r: 5, w: 2 },
        { spr: 'furn_plant', c: 7, r: 6, w: 1 }
      ],
      wallDecos: [
        { type: 'window', c: 3, r: 2 },
        { spr: 'wall_art_1', c: 5, r: 2 },
        { spr: 'wall_clock', c: 6, r: 2 }
      ]
    },
    // Rank 3 (officeLevel 2): 駅前オフィス 8x6 (ホワイトボード＆3マス受付＆ワイド社員机登場)
    {
      level: 2,
      c0: 1, r0: 1, cols: 8, rows: 6,
      floor: 'floor_office_blue',
      wallBg: '#e2e8f0',
      wallTop: '#334155',
      facadeColor: '#475569',
      extStyle: 'plaza',
      boss: { deskSpr: 'off_desk_boss_1_wide', charSpr: 'boss_1', c: 7.0, r: 2, w: 1.5, seatFrac: 0.36 },
      reception: { spr: 'off_counter_wide', c: 1, r: 5, w: 3, h: 1, doorC: 2, clientC: 2, clientR: 6 },
      bookshelf: { c: 1, r: 1 },
      cabinet: { c: 8, r: 1 },
      calendar: { spr: 'off_whiteboard_mid', c: 3, r: 1, w: 2 },
      trophySpot: { c: 6, r: 1 },
      staffSlots: [
        { c: 2.0, r: 3, w: 1.5, sprPrefix: 'off_desk_staff_mid', seatFrac: 0.38 },
        { c: 4.5, r: 3, w: 1.5, sprPrefix: 'off_desk_staff_mid', seatFrac: 0.38 }
      ],
      props: [
        { spr: 'furn_rug_foyer', c: 2, r: 6, w: 1, isRug: true },
        { spr: 'off_printer', c: 1, r: 2, w: 1 },
        { spr: 'off_water', c: 2, r: 2, w: 1 },
        { spr: 'off_shelf_sample', c: 5, r: 2, w: 1 },
        { spr: 'off_locker', c: 8, r: 3, w: 1 },
        { spr: 'off_shelf_sample', c: 8, r: 4, w: 1 },
        { spr: 'off_stand', c: 4, r: 6, w: 1 },
        { spr: 'furn_sofa', c: 6, r: 5, w: 2 },
        { spr: 'off_lounge_table', c: 6, r: 6, w: 2 },
        { spr: 'furn_plant', c: 8, r: 6, w: 1 }
      ],
      wallDecos: [
        { type: 'window', c: 2, r: 1 },
        { type: 'window', c: 5, r: 1 },
        { spr: 'wall_clock', c: 6, r: 1 },
        { spr: 'wall_art_1', c: 7, r: 1 }
      ]
    },
    // Rank 4 (officeLevel 3): 本格スタジオ 9x7 (L字カウンター＆大型ホワイトボード＆L字プロ社員机)
    {
      level: 3,
      c0: 0, r0: 1, cols: 9, rows: 7,
      floor: 'floor_office_studio',
      wallBg: '#f8fafc',
      wallTop: '#1e293b',
      facadeColor: '#334155',
      extStyle: 'city_terrace',
      boss: { deskSpr: 'off_desk_boss_2', charSpr: 'boss_2', c: 6, r: 2, w: 2 },
      reception: { spr: 'off_counter_l', c: 1, r: 5, w: 2, h: 2, doorC: 2, clientC: 2, clientR: 6.1, tagXOffset: 1.0 },
      bookshelf: { c: 0, r: 1 },
      cabinet: { c: 8, r: 1 },
      calendar: { spr: 'off_whiteboard_pro', c: 3, r: 1, w: 2 },
      trophySpot: { c: 6, r: 1 },
      staffSlots: [
        { c: 1.0,  r: 4, w: 1.65, sprPrefix: 'off_desk_staff_pro', seatFrac: 0.50 },
        { c: 3.55, r: 4, w: 1.65, sprPrefix: 'off_desk_staff_pro', seatFrac: 0.50 },
        { c: 6.1,  r: 4, w: 1.65, sprPrefix: 'off_desk_staff_pro', seatFrac: 0.50 }
      ],
      props: [
        { spr: 'furn_rug_foyer', c: 2, r: 7, w: 1, isRug: true },
        { spr: 'off_locker', c: 0, r: 2, w: 1 },
        { spr: 'off_draft_table', c: 1, r: 2, w: 2 },
        { spr: 'furn_plant', c: 8, r: 2, w: 1 },
        { spr: 'off_printer', c: 0, r: 4, w: 1 },
        { spr: 'off_water', c: 8, r: 4, w: 1 },
        { spr: 'off_stand', c: 4, r: 6, w: 1 },
        { spr: 'furn_sofa', c: 6, r: 5, w: 2 },
        { spr: 'off_lounge_table', c: 6, r: 6, w: 2 },
        { spr: 'off_shelf_sample', c: 5, r: 7, w: 1 },
        { spr: 'furn_plant', c: 0, r: 7, w: 1 },
        { spr: 'furn_plant', c: 8, r: 7, w: 1 }
      ],
      wallDecos: [
        { type: 'window_city', c: 1, r: 1 },
        { spr: 'wall_art_1', c: 2, r: 1 },
        { type: 'window_city', c: 5, r: 1 },
        { spr: 'wall_clock', c: 6, r: 1 },
        { type: 'window_city', c: 7, r: 1 }
      ]
    },
    // Rank 5 (officeLevel 4): 本社自社ビル 10x8 (フルスタジオ＆VIPカーペット＆4人プロデスク)
    {
      level: 4,
      c0: 0, r0: 0, cols: 10, rows: 8,
      floor: 'floor_office_studio',
      vipAisleCols: [4, 5],
      wallBg: '#fef9c3',
      wallTop: '#b45309',
      facadeColor: '#1e293b',
      extStyle: 'hq',
      boss: { deskSpr: 'off_desk_boss_2', charSpr: 'boss_2', c: 4, r: 2, w: 2 },
      reception: { spr: 'off_counter_l', c: 1, r: 5, w: 2, h: 2, doorC: 2, clientC: 2, clientR: 6.1, tagXOffset: 1.0 },
      bookshelf: { c: 0, r: 0 },
      cabinet: { c: 9, r: 0 },
      calendar: { spr: 'off_whiteboard_pro', c: 4, r: 0, w: 2 },
      trophySpot: { c: 6, r: 0 },
      staffSlots: [
        { c: 0.4,  r: 3, w: 1.65, sprPrefix: 'off_desk_staff_pro', seatFrac: 0.50 },
        { c: 2.25, r: 3, w: 1.65, sprPrefix: 'off_desk_staff_pro', seatFrac: 0.50 },
        { c: 6.1,  r: 3, w: 1.65, sprPrefix: 'off_desk_staff_pro', seatFrac: 0.50 },
        { c: 7.95, r: 3, w: 1.65, sprPrefix: 'off_desk_staff_pro', seatFrac: 0.50 }
      ],
      props: [
        { spr: 'furn_rug_foyer', c: 2, r: 7, w: 1, isRug: true },
        { spr: 'off_locker', c: 0, r: 1, w: 1 },
        { spr: 'off_draft_table', c: 1, r: 1, w: 2 },
        { spr: 'furn_plant', c: 3, r: 1, w: 1 },
        { spr: 'furn_plant', c: 6, r: 1, w: 1 },
        { spr: 'off_meeting_set', c: 7, r: 1, w: 2 },
        { spr: 'off_server', c: 9, r: 1, w: 1 },
        { spr: 'off_printer', c: 0, r: 2, w: 1 },
        { spr: 'off_water', c: 9, r: 2, w: 1 },
        { spr: 'off_shelf_sample', c: 0, r: 4, w: 1 },
        { spr: 'off_stand', c: 9, r: 4, w: 1 },
        { spr: 'off_shelf_sample', c: 9, r: 5, w: 1 },
        { spr: 'furn_sofa', c: 7, r: 5, w: 2 },
        { spr: 'off_lounge_table', c: 7, r: 6, w: 2 },
        { spr: 'off_stand', c: 6, r: 6, w: 1 },
        { spr: 'furn_plant', c: 0, r: 7, w: 1 },
        { spr: 'furn_plant', c: 9, r: 7, w: 1 }
      ],
      wallDecos: [
        { type: 'window_city', c: 1, r: 0 },
        { type: 'window_city', c: 2, r: 0 },
        { spr: 'wall_clock', c: 3, r: 0 },
        { spr: 'wall_art_2', c: 6, r: 0 },
        { type: 'window_city', c: 7, r: 0 },
        { type: 'window_city', c: 8, r: 0 }
      ]
    }
  ];

  const SKILL_TO_STAFF_SPR = {
    broker: 'staff_field',
    plumber: 'staff_field',
    recycle: 'staff_field',
    space_designer: 'staff_design',
    storage_master: 'staff_design',
    hand_refresh: 'staff_design',
    negotiator: 'staff_sales',
    listener: 'staff_sales',
    concierge: 'staff_sales',
    loan_negotiator: 'staff_finance',
    property_manager: 'staff_finance'
  };

  function getClientCharPrefix(client) {
    if (global.PixelRenderer && typeof global.PixelRenderer.resolveClientActors === 'function') {
      const resolved = global.PixelRenderer.resolveClientActors({ client });
      if (resolved && Array.isArray(resolved.actors) && resolved.actors[0]) {
        return resolved.actors[0];
      }
    }
    return 'char_casual_blue';
  }

  function loadGuideSetting() {
    try {
      const v = localStorage.getItem(GUIDE_STORAGE_KEY);
      return v === null ? true : v === '1';
    } catch (e) {
      return true;
    }
  }

  let guidesEnabled = loadGuideSetting();
  let initialized = false;
  let rafId = null;
  let lastDrawAt = 0;
  let canvasEl = null;
  let logicalW = 360;
  let logicalH = 320;
  let cellSize = 36;
  let hoverTargetId = null;
  let hitHotspots = [];
  let hitStaffBoxes = [];
  let activeBubble = null;
  let bubbleTapCounts = {};

  function getOfficeSnapshot() {
    const gs = (typeof GameState !== 'undefined') ? GameState : null;
    const co = (gs && gs.company) ? gs.company : {};
    const officeLevel = Math.max(0, Math.min(RANK_LAYOUTS.length - 1, co.officeLevel || 0));
    const layout = RANK_LAYOUTS[officeLevel];
    const deskCount = Math.min(layout.staffSlots.length, co.deskCount || 0);
    const hiredStaff = Array.isArray(co.hiredStaff) ? co.hiredStaff : [];
    const hasCleared = Boolean(gs && gs.hasCleared);

    const activeCount = (typeof getActivePropertyCount === 'function')
      ? getActivePropertyCount()
      : (Array.isArray(gs?.properties) ? gs.properties.filter(p => !p.sold).length : 0);
    const maxCap = (typeof getMaxPropertyCapacity === 'function') ? getMaxPropertyCapacity() : 4;
    const isAtCap = activeCount >= maxCap;

    let vacantCount = 0;
    if (Array.isArray(gs?.properties)) {
      gs.properties.forEach(p => {
        if (!p || p.sold) return;
        const st = (typeof calcPropertyStats === 'function') ? calcPropertyStats(p) : null;
        if (st && st.isVacant) vacantCount++;
      });
    }

    const comboFound = (typeof getDiscoveredMasterComboCount === 'function')
      ? getDiscoveredMasterComboCount()
      : ((gs?.discovered?.combos || []).length);
    const comboTotal = (typeof COMBO_MASTER_LIST !== 'undefined' && Array.isArray(COMBO_MASTER_LIST))
      ? COMBO_MASTER_LIST.length : 30;
    const furnFound = (typeof getDiscoveredFurnitureCount === 'function')
      ? getDiscoveredFurnitureCount()
      : ((gs?.discovered?.furniture || []).length);
    const furnTotal = (global.FurnitureCatalog && Array.isArray(global.FurnitureCatalog.ITEMS))
      ? global.FurnitureCatalog.ITEMS.length : 0;

    const curM = gs?.month || 1;
    const curYear = Math.floor((curM - 1) / 12) + 1;
    const monthInYear = ((curM - 1) % 12) + 1;

    const tutorialPhase = (gs && gs.tutorialPhase) ? gs.tutorialPhase : 'done';
    let missionMode = 'search';
    let receptionClient = null;
    let hasSpecialWaiting = false;
    if (gs?.activeBuild && gs.activeBuild.stage) {
      missionMode = gs.activeBuild.screen === 'result' ? 'result' : 'resume';
      receptionClient = gs.activeBuild.stage.client || null;
      hasSpecialWaiting = Boolean(gs.activeBuild.stage.customCombo);
    } else if (gs?.currentMission) {
      missionMode = 'current';
      receptionClient = gs.currentMission.client || null;
      hasSpecialWaiting = Boolean(gs.currentMission.customCombo);
    } else if (tutorialPhase === 'start_home') {
      missionMode = 'tutorial_start';
      receptionClient = { typeBadge: '単身者' };
    } else if (isAtCap) {
      missionMode = 'capped';
      receptionClient = (gs?.availableMissions && gs.availableMissions[0]) ? gs.availableMissions[0].client : null;
    } else {
      missionMode = 'search';
      const pool = Array.isArray(gs?.availableMissions) ? gs.availableMissions : [];
      const spMission = pool.find(m => m && m.customCombo) || pool[0] || null;
      receptionClient = spMission ? spMission.client : null;
      hasSpecialWaiting = Boolean(spMission && spMission.customCombo);
    }

    const rankDef = (typeof UPGRADE_CONFIG !== 'undefined' && UPGRADE_CONFIG.office)
      ? (UPGRADE_CONFIG.office[officeLevel] || null) : null;

    return {
      gs, co, officeLevel, layout, deskCount, hiredStaff, hasCleared,
      activeCount, maxCap, isAtCap, vacantCount,
      comboFound, comboTotal, furnFound, furnTotal, curYear, monthInYear,
      tutorialPhase, missionMode, receptionClient, hasSpecialWaiting, rankDef,
      attempts: gs?.attempts ?? 2
    };
  }

  function resizeOfficeCanvas() {
    canvasEl = document.getElementById('office-canvas');
    if (!canvasEl) return false;
    const wrap = canvasEl.parentElement;
    const availW = (wrap && wrap.clientWidth > 120) ? wrap.clientWidth : Math.min(window.innerWidth - 48, 520);
    const cs = Math.max(24, Math.min(46, Math.floor((availW - 4) / COLS)));
    const wallH = Math.round(cs * 0.45);
    const topPad = wallH + Math.max(6, Math.round(cs * 0.14));
    const botPad = Math.round(cs * 0.36);

    cellSize = cs;
    logicalW = COLS * cs;
    logicalH = ROWS * cs + topPad + botPad;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvasEl.width !== Math.round(logicalW * dpr) || canvasEl.height !== Math.round(logicalH * dpr)) {
      canvasEl.width = Math.round(logicalW * dpr);
      canvasEl.height = Math.round(logicalH * dpr);
      canvasEl.style.width = `${logicalW}px`;
      canvasEl.style.height = `${logicalH}px`;
    }
    return { canvas: canvasEl, cs, wallH, topPad, botPad, dpr };
  }

  function drawWindowTile(ctx, x, wy, cs, wallH, isNightCity, tick) {
    const ww = Math.round(cs * 0.68);
    const wh = Math.max(7, Math.round(wallH * 0.70));
    const wx = x + Math.round((cs - ww) / 2);
    const wyTop = wy + Math.round((wallH - wh) / 2) - 1;

    ctx.fillStyle = isNightCity ? '#334155' : '#64748b';
    ctx.fillRect(wx - 1, wyTop - 1, ww + 2, wh + 2);

    if (isNightCity) {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(wx, wyTop, ww, wh);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(wx + 1, wyTop + 3, 5, wh - 3);
      ctx.fillRect(wx + 8, wyTop + 1, 6, wh - 1);
      ctx.fillRect(wx + 16, wyTop + 4, Math.max(3, ww - 17), wh - 4);
      const twinkle = (tick + Math.floor(x)) % 4;
      ctx.fillStyle = twinkle === 0 ? '#fde047' : '#fbbf24';
      ctx.fillRect(wx + 2, wyTop + 5, 2, 2);
      ctx.fillRect(wx + 10, wyTop + 3, 2, 2);
      ctx.fillStyle = twinkle === 2 ? '#38bdf8' : '#fef08a';
      ctx.fillRect(wx + 10, wyTop + 7, 2, 2);
      if (ww > 18) ctx.fillRect(wx + 17, wyTop + 6, 2, 2);
    } else {
      ctx.fillStyle = '#7dd3fc';
      ctx.fillRect(wx, wyTop, ww, wh);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(wx + 2, wyTop + 2, 5, 2);
      ctx.fillRect(wx + ww - 7, wyTop + 3, 4, 2);
      ctx.fillStyle = '#bae6fd';
      ctx.fillRect(wx, wyTop + Math.floor(wh / 2), ww, 1);
    }
    ctx.fillStyle = 'rgba(248, 250, 252, 0.55)';
    ctx.fillRect(wx + Math.floor(ww / 2), wyTop, 1, wh);
  }

  function drawGuidePill(ctx, cx, cy, text, accentColor, isUrgent, blinkOn) {
    ctx.save();
    ctx.font = '800 10.5px "Zen Kaku Gothic New", sans-serif';
    const textW = ctx.measureText(text).width;
    const padX = 7;
    const bw = Math.round(textW + padX * 2);
    const bh = 18;
    const bx = Math.round(Math.max(3, Math.min(logicalW - bw - 3, cx - bw / 2)));
    const by = Math.round(Math.max(2, Math.min(logicalH - bh - 3, cy - bh / 2)));

    ctx.fillStyle = isUrgent && blinkOn ? '#be123c' : 'rgba(15, 23, 42, 0.90)';
    ctx.strokeStyle = isUrgent ? '#fda4af' : accentColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 9);
    else ctx.rect(bx, by, bw, bh);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + bw / 2, by + bh / 2 + 0.5);
    ctx.restore();
    return { x: bx, y: by, w: bw, h: bh };
  }

  function drawAlertBadge(ctx, cx, cy, label, bgColor, borderColor, bobY) {
    ctx.save();
    ctx.font = '900 9.5px "Zen Kaku Gothic New", sans-serif';
    const w = Math.max(15, Math.ceil(ctx.measureText(label).width + 8));
    const h = 15;
    const x = Math.round(Math.max(2, Math.min(logicalW - w - 2, cx - w / 2)));
    const y = Math.round(Math.max(2, cy + bobY));
    ctx.fillStyle = bgColor;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, 7);
    else ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2 + 0.5);
    ctx.restore();
  }

  function drawStaffSpeechBubble(ctx, bubble) {
    if (!bubble || !bubble.lines || bubble.lines.length === 0) return;
    ctx.save();
    ctx.font = 'bold 10.5px "Zen Kaku Gothic New", sans-serif';
    const padX = 9;
    const padY = 6;
    const lineH = 14;
    let maxTW = 40;
    bubble.lines.forEach(line => {
      maxTW = Math.max(maxTW, ctx.measureText(line).width);
    });
    const bw = Math.min(logicalW - 12, Math.ceil(maxTW + padX * 2));
    const bh = bubble.lines.length * lineH + padY * 2;
    let bx = Math.round(bubble.x - bw / 2);
    bx = Math.max(6, Math.min(logicalW - bw - 6, bx));
    let by = Math.round(bubble.y - bh - 10);
    let tailDown = true;
    if (by < 4) {
      by = Math.round(bubble.y + 18);
      tailDown = false;
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.97)';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 8);
    else ctx.rect(bx, by, bw, bh);
    ctx.fill();
    ctx.stroke();

    const tx = Math.max(bx + 12, Math.min(bx + bw - 12, bubble.x));
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    if (tailDown) {
      ctx.moveTo(tx - 5, by + bh - 1);
      ctx.lineTo(tx + 5, by + bh - 1);
      ctx.lineTo(tx, by + bh + 6);
    } else {
      ctx.moveTo(tx - 5, by + 1);
      ctx.lineTo(tx + 5, by + 1);
      ctx.lineTo(tx, by - 6);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    bubble.lines.forEach((line, idx) => {
      ctx.fillStyle = idx === 0 ? '#1e40af' : '#334155';
      ctx.fillText(line, bx + padX, by + padY + idx * lineH, bw - padX * 2);
    });
    ctx.restore();
  }

  function renderOffice(now = performance.now()) {
    const dim = resizeOfficeCanvas();
    if (!dim || !global.PixelAssets) return;
    global.PixelAssets.initAllAssets();

    const { canvas, cs, wallH, topPad, botPad, dpr } = dim;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    const snap = getOfficeSnapshot();
    const { layout } = snap;
    const tick = Math.floor(now / 420);
    const fastTick = Math.floor(now / 260);
    const oy = topPad;

    // 1. 周辺外構エリア
    if (layout.extStyle === 'home_yard') {
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(0, 0, logicalW, logicalH);
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const x = c * cs, y = oy + r * cs;
          const isLawn = r >= 1 && r <= 6 && c >= 1 && c <= 8;
          ctx.fillStyle = isLawn ? (((r + c) % 2 === 0) ? '#bbf7d0' : '#a7f3d0') : '#cbd5e1';
          ctx.fillRect(x, y, cs, cs);
        }
      }
      for (let r = layout.r0 + layout.rows; r < ROWS; r++) {
        const ax = layout.reception.doorC * cs + cs * 0.22;
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(ax, oy + r * cs + cs * 0.2, cs * 0.56, cs * 0.6);
      }
    } else if (layout.extStyle === 'street' || layout.extStyle === 'plaza') {
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(0, 0, logicalW, logicalH);
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          global.PixelAssets.drawSprite(ctx, 'floor_outside', c * cs, oy + r * cs, cs, cs);
        }
      }
      ctx.fillStyle = '#64748b';
      ctx.fillRect(0, oy + ROWS * cs - 2, logicalW, botPad + 2);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(0, oy + ROWS * cs - 2, logicalW, 4);
    } else {
      const skyGrad = ctx.createLinearGradient(0, 0, 0, logicalH);
      skyGrad.addColorStop(0, '#0f172a');
      skyGrad.addColorStop(1, '#1e293b');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, logicalW, logicalH);
      ctx.fillStyle = '#334155';
      for (let bx = 0; bx < logicalW; bx += cs) {
        const bh = 16 + ((bx * 7) % 24);
        ctx.fillRect(bx + 2, logicalH - bh, cs - 4, bh);
      }
    }

    if (layout.level === 0) {
      global.PixelAssets.drawSprite(ctx, 'furn_tree', 1 * cs, oy + 2 * cs, cs, cs);
      global.PixelAssets.drawSprite(ctx, 'furn_flower', 2 * cs, oy + 5 * cs, cs, cs);
      global.PixelAssets.drawSprite(ctx, 'furn_tree', 8 * cs, oy + 2 * cs, cs, cs);
      global.PixelAssets.drawSprite(ctx, 'furn_flower', 7 * cs, oy + 5 * cs, cs, cs);
    } else if (layout.level === 1) {
      global.PixelAssets.drawSprite(ctx, 'furn_tree', 0 * cs, oy + 3 * cs, cs, cs);
      global.PixelAssets.drawSprite(ctx, 'furn_tree', 9 * cs, oy + 3 * cs, cs, cs);
      global.PixelAssets.drawSprite(ctx, 'furn_bench', 8 * cs, oy + 6 * cs, cs, cs);
    } else if (layout.level === 2) {
      global.PixelAssets.drawSprite(ctx, 'furn_tree', 0 * cs, oy + 4 * cs, cs, cs);
      global.PixelAssets.drawSprite(ctx, 'furn_tree', 9 * cs, oy + 4 * cs, cs, cs);
    }

    // 2. オフィス本体枠＆床タイル
    const rx = layout.c0 * cs;
    const ry = oy + layout.r0 * cs;
    const rw = layout.cols * cs;
    const rh = layout.rows * cs;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.25)';
    ctx.fillRect(rx + 4, ry + 5, rw, rh + Math.round(cs * 0.28));

    for (let r = layout.r0; r < layout.r0 + layout.rows; r++) {
      for (let c = layout.c0; c < layout.c0 + layout.cols; c++) {
        let floorSpr = layout.floor;
        if (layout.vipAisleCols && layout.vipAisleCols.includes(c)) {
          floorSpr = 'floor_office_vip';
        }
        global.PixelAssets.drawSprite(ctx, floorSpr, c * cs, oy + r * cs, cs, cs);
      }
    }

    // 3. 2.5D 北壁立ち上がり面 & 天井梁
    const wallTopY = ry - wallH;
    const roofThick = Math.max(4, Math.round(cs * 0.12));
    ctx.fillStyle = layout.wallTop;
    ctx.fillRect(rx - 3, wallTopY - roofThick, rw + 6, roofThick);

    ctx.fillStyle = layout.wallBg;
    ctx.fillRect(rx, wallTopY, rw, wallH);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(rx, wallTopY, rw, 2);
    ctx.fillStyle = 'rgba(15,23,42,0.28)';
    ctx.fillRect(rx, ry - 3, rw, 3);

    const wallDecoSkipCol = new Set();
    if (snap.hasCleared && layout.trophySpot) {
      wallDecoSkipCol.add(layout.trophySpot.c);
    }
    (layout.wallDecos || []).forEach(wd => {
      if (wallDecoSkipCol.has(wd.c)) return;
      const wx = wd.c * cs;
      if (wd.type === 'window' || wd.type === 'window_city') {
        drawWindowTile(ctx, wx, wallTopY, cs, wallH, wd.type === 'window_city', tick);
      } else if (wd.spr) {
        global.PixelAssets.drawSprite(ctx, wd.spr, wx, wallTopY + 1, cs, wallH - 2);
      }
    });

    // カレンダー ／ 大型ホワイトボード（クリック対象）
    const cal = layout.calendar;
    const calX = cal.c * cs;
    const calW = (cal.w || 1) * cs;
    global.PixelAssets.drawSprite(ctx, cal.spr || 'off_calendar', calX, wallTopY + 1, calW, wallH - 2);

    // クリア済み表彰トロフィー
    if (snap.hasCleared && layout.trophySpot) {
      global.PixelAssets.drawSprite(ctx, 'off_trophy', layout.trophySpot.c * cs, wallTopY + 1, cs, wallH - 2);
    }

    // 左右側壁 & 南側外観ファサード
    ctx.fillStyle = layout.wallTop;
    ctx.fillRect(rx - 3, wallTopY, 3, wallH + rh);
    ctx.fillRect(rx + rw, wallTopY, 3, wallH + rh);

    const extH = Math.round(cs * 0.30);
    const frontY = ry + rh;
    ctx.fillStyle = layout.facadeColor;
    ctx.fillRect(rx - 3, frontY, rw + 6, extH);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(rx - 3, frontY, rw + 6, 2);

    const doorX = layout.reception.doorC * cs + Math.round(cs * 0.14);
    const doorW = Math.round(cs * 0.72);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(doorX - 1, frontY, doorW + 2, extH);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(doorX, frontY + 1, doorW, extH - 2);
    ctx.fillStyle = '#bae6fd';
    ctx.fillRect(doorX + 2, frontY + 2, Math.max(2, Math.floor(doorW / 2) - 3), extH - 4);

    // 4. 床敷きラグ描画
    (layout.props || []).forEach(pr => {
      if (pr.isRug) {
        global.PixelAssets.drawSprite(ctx, pr.spr, pr.c * cs, oy + pr.r * cs, (pr.w || 1) * cs, (pr.h || 1) * cs);
      }
    });

    // 5. 室内オブジェクトを Y ソート（2.5D 奥→手前順）で描画
    const bsX = layout.bookshelf.c * cs;
    const bsY = oy + layout.bookshelf.r * cs;
    const cabX = layout.cabinet.c * cs;
    const cabY = oy + layout.cabinet.r * cs;

    const bCfg = layout.boss;
    const bossX = bCfg.c * cs;
    const bossY = oy + bCfg.r * cs;
    const bossW = (bCfg.w || 1) * cs;

    const rec = layout.reception;
    const recX = rec.c * cs;
    const recY = oy + rec.r * cs;
    const recW = (rec.w || 2) * cs;
    const recH = (rec.h || 1) * cs;
    const cliX = rec.clientC * cs;
    const cliY = oy + rec.clientR * cs;

    const renderQueue = [];

    // 5a. 書庫 & 物件棚
    renderQueue.push({
      sortY: layout.bookshelf.r + 1,
      draw: () => global.PixelAssets.drawSprite(ctx, 'off_bookshelf', bsX, bsY, cs, cs)
    });
    renderQueue.push({
      sortY: layout.cabinet.r + 1,
      draw: () => {
        global.PixelAssets.drawSprite(ctx, 'off_cabinet', cabX, cabY, cs, cs);
        if (snap.vacantCount > 0) {
          const bob = (fastTick % 2 === 0) ? -2 : 0;
          drawAlertBadge(ctx, cabX + cs * 0.78, cabY - 2, `! 空${snap.vacantCount}`, '#e11d48', '#fecdd3', bob);
        }
      }
    });

    // 5b. 各種オフィス什器・備品
    (layout.props || []).forEach(pr => {
      if (pr.isRug) return;
      const pw = (pr.w || 1) * cs;
      const ph = (pr.h || 1) * cs;
      renderQueue.push({
        sortY: pr.r + (pr.h || 1),
        draw: () => global.PixelAssets.drawSprite(ctx, pr.spr, pr.c * cs, oy + pr.r * cs, pw, ph)
      });
    });

    // 5c. 社長＋社長デスク
    renderQueue.push({
      sortY: bCfg.r + 1,
      draw: () => {
        const bossFrame = (tick % 4 === 1) ? 1 : 0;
        const seatFrac = bCfg.seatFrac !== undefined ? bCfg.seatFrac : 0.5;
        const bossCharX = bossX + bossW * seatFrac - cs * 0.5;
        const bossCharY = bossY - Math.round(cs * 0.34);
        global.PixelAssets.drawSprite(ctx, `${bCfg.charSpr}_${bossFrame}`, bossCharX, bossCharY, cs, cs);
        global.PixelAssets.drawSprite(ctx, bCfg.deskSpr, bossX, bossY, bossW, cs);
      }
    });

    // 5d. スタッフデスク＋雇用社員 (Rank に応じて机サイズと形状が成長)
    hitStaffBoxes = [];
    for (let i = 0; i < snap.deskCount; i++) {
      const slot = layout.staffSlots[i];
      if (!slot) break;
      const deskWUnits = slot.w || 1;
      const sx = slot.c * cs;
      const sy = oy + slot.r * cs;
      const dw = deskWUnits * cs;
      const staff = snap.hiredStaff[i] || null;
      const sprPrefixDesk = slot.sprPrefix || 'off_desk_staff';
      const seatFrac = slot.seatFrac !== undefined ? slot.seatFrac : 0.5;

      renderQueue.push({
        sortY: slot.r + 1,
        draw: () => {
          if (staff) {
            const mainSkill = (Array.isArray(staff.skills) && staff.skills[0]) ? staff.skills[0].id : null;
            const charPrefix = SKILL_TO_STAFF_SPR[mainSkill] || 'staff_design';
            const frame = ((tick + i) % 3 === 0) ? 1 : 0;
            const starCount = staff.rank === 'expert' ? 3 : (staff.rank === 'specialist' ? 2 : 1);
            const charX = sx + dw * seatFrac - cs * 0.5;
            const charY = sy - Math.round(cs * 0.34);
            global.PixelAssets.drawSprite(ctx, `${charPrefix}_${frame}`, charX, charY, cs, cs);
            global.PixelAssets.drawSprite(ctx, `${sprPrefixDesk}_${starCount}`, sx, sy, dw, cs);
            for (let st = 0; st < starCount; st++) {
              ctx.fillStyle = '#facc15';
              ctx.fillRect(Math.round(sx + dw * seatFrac - (starCount * 5) / 2 + st * 5), sy + Math.round(cs * 0.72), 3, 3);
            }
          } else {
            global.PixelAssets.drawSprite(ctx, `${sprPrefixDesk}_empty`, sx, sy, dw, cs);
          }
        }
      });

      hitStaffBoxes.push({
        id: `staff_${i}`,
        index: i,
        staff,
        x: sx - 2,
        y: sy - Math.round(cs * 0.35),
        w: dw + 4,
        h: Math.round(cs * 1.35),
        anchorX: sx + dw * seatFrac,
        anchorY: sy - Math.round(cs * 0.32)
      });
    }

    // 5e. 受付カウンター（1x1 / 2x1 / 3x1 / 2x2 L字型）
    renderQueue.push({
      sortY: rec.r + (rec.h || 1) - 0.05,
      draw: () => global.PixelAssets.drawSprite(ctx, rec.spr || 'off_counter', recX, recY, recW, recH)
    });

    // 5f. 来店客
    renderQueue.push({
      sortY: rec.clientR + 1,
      draw: () => {
        const cliPrefix = getClientCharPrefix(snap.receptionClient);
        const cliFrame = (snap.missionMode === 'result' || snap.missionMode === 'search' || snap.missionMode === 'tutorial_start') ? (fastTick % 2) : (tick % 2);
        const cliBob = (snap.missionMode === 'result' || snap.missionMode === 'tutorial_start') ? -((fastTick % 2) * 2) : 0;
        global.PixelAssets.drawSprite(ctx, `${cliPrefix}_${cliFrame}`, cliX, cliY + cliBob, cs, cs);
        if (snap.missionMode === 'result') {
          drawAlertBadge(ctx, cliX + cs * 0.5, cliY - 9, '★引渡', '#d97706', '#fef08a', cliBob);
        } else if (snap.missionMode === 'tutorial_start') {
          drawAlertBadge(ctx, cliX + cs * 0.5, cliY - 9, '★初回', '#d97706', '#fef08a', cliBob);
        } else if (snap.missionMode === 'resume' || snap.missionMode === 'current') {
          drawAlertBadge(ctx, cliX + cs * 0.5, cliY - 9, '設計中', '#2563eb', '#bfdbfe', cliBob);
        } else if (snap.isAtCap) {
          drawAlertBadge(ctx, cliX + cs * 0.5, cliY - 9, '! 上限', '#be123c', '#fecdd3', 0);
        } else if (snap.hasSpecialWaiting) {
          drawAlertBadge(ctx, cliX + cs * 0.5, cliY - 9, '★特注', '#7c3aed', '#e9d5ff', (fastTick % 2 === 0 ? -1 : 0));
        } else {
          drawAlertBadge(ctx, cliX + cs * 0.5, cliY - 9, '!', '#059669', '#a7f3d0', (fastTick % 2 === 0 ? -1 : 0));
        }
      }
    });

    renderQueue.sort((a, b) => a.sortY - b.sortY);
    renderQueue.forEach(item => item.draw());

    // 6. ホットスポット当たり判定矩形構築
    const missionLabelMap = {
      result: '引渡確認',
      tutorial_start: '初回案件',
      resume: `設計再開(${snap.attempts})`,
      current: '設計開始',
      capped: `上限(${snap.activeCount}/${snap.maxCap})`,
      search: '新規案件'
    };
    const missionColorMap = {
      result: '#f59e0b',
      tutorial_start: '#f59e0b',
      resume: '#38bdf8',
      current: '#38bdf8',
      capped: '#fb7185',
      search: '#38bdf8'
    };

    const isTutStart = snap.tutorialPhase === 'start_home';
    const isTutAdvance = snap.tutorialPhase === 'home_advance_month';
    const tutTargetId = isTutStart ? 'reception' : (isTutAdvance ? 'calendar' : null);

    const recMinX = Math.min(recX, cliX) - 4;
    const recMinY = Math.min(recY, cliY) - 4;
    const recMaxX = Math.max(recX + recW, cliX + cs) + 4;
    const recMaxY = Math.max(recY + recH, cliY + cs) + 4;

    const rawHotspots = [
      {
        id: 'bookshelf',
        x: bsX - 2,
        y: wallTopY,
        w: cs + 4,
        h: wallH + cs + 4,
        tagX: bsX + cs * 0.5,
        tagY: bsY + cs + 7,
        tagText: snap.furnTotal > 0
          ? `図鑑 ${snap.comboFound + snap.furnFound}/${snap.comboTotal + snap.furnTotal}`
          : `記録帳 ${snap.comboFound}/${snap.comboTotal}`,
        tagColor: '#fbbf24',
        tagUrgent: false
      },
      {
        id: 'calendar',
        x: calX - 4,
        y: wallTopY - 4,
        w: calW + 8,
        h: wallH + Math.round(cs * 0.65),
        tagX: calX + calW * 0.5,
        tagY: ry + Math.round(cs * 0.30),
        tagText: '月を進める',
        tagColor: isTutAdvance ? '#f59e0b' : '#f472b6',
        tagUrgent: isTutAdvance
      },
      {
        id: 'cabinet',
        x: cabX - 2,
        y: wallTopY,
        w: cs + 4,
        h: wallH + cs + 4,
        tagX: cabX + cs * 0.5,
        tagY: cabY + cs + 7,
        tagText: snap.vacantCount > 0 ? `物件(空${snap.vacantCount})` : `物件 ${snap.activeCount}/${snap.maxCap}`,
        tagColor: snap.vacantCount > 0 ? '#fb7185' : '#34d399',
        tagUrgent: snap.vacantCount > 0
      },
      {
        id: 'boss',
        x: bossX - 2,
        y: bossY - Math.round(cs * 0.42),
        w: bossW + 4,
        h: Math.round(cs * 1.44),
        tagX: bossX + bossW * 0.5,
        tagY: bossY + cs + 8,
        tagText: '会社経営',
        tagColor: '#facc15',
        tagUrgent: false
      },
      {
        id: 'reception',
        x: recMinX,
        y: recMinY,
        w: recMaxX - recMinX,
        h: recMaxY - recMinY,
        tagX: recX + (rec.tagXOffset !== undefined ? rec.tagXOffset * cs : recW * 0.5),
        tagY: recY - 8,
        tagText: missionLabelMap[snap.missionMode] || '新規案件',
        tagColor: missionColorMap[snap.missionMode] || '#38bdf8',
        tagUrgent: snap.missionMode === 'result' || isTutStart
      }
    ];

    // 7. チュートリアルスポットライト＆ホバーハイライト
    if (tutTargetId) {
      const tutBox = rawHotspots.find(h => h.id === tutTargetId);
      if (tutBox) {
        const pulse = 0.55 + 0.4 * Math.sin(now * 0.006);
        ctx.save();
        ctx.strokeStyle = `rgba(251, 191, 36, ${pulse.toFixed(2)})`;
        ctx.lineWidth = 2.5;
        ctx.fillStyle = `rgba(251, 191, 36, ${(0.12 * pulse).toFixed(2)})`;
        ctx.fillRect(tutBox.x - 2, tutBox.y - 2, tutBox.w + 4, tutBox.h + 4);
        ctx.strokeRect(tutBox.x - 2, tutBox.y - 2, tutBox.w + 4, tutBox.h + 4);
        ctx.restore();
      }
    }

    if (hoverTargetId) {
      const targetBox = rawHotspots.find(h => h.id === hoverTargetId) || hitStaffBoxes.find(s => s.id === hoverTargetId);
      if (targetBox) {
        ctx.save();
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.92)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(targetBox.x, targetBox.y, targetBox.w, targetBox.h);
        ctx.restore();
      }
    }

    // 8. ガイド表示
    hitHotspots = rawHotspots.map(h => {
      let pillRect = null;
      if (guidesEnabled || tutTargetId === h.id) {
        pillRect = drawGuidePill(ctx, h.tagX, h.tagY, h.tagText, h.tagColor, h.tagUrgent, fastTick % 2 === 0);
      }
      return { ...h, pillRect };
    });

    // 9. スタッフ吹き出し
    if (activeBubble) {
      if (now > activeBubble.expiresAt) {
        activeBubble = null;
      } else {
        drawStaffSpeechBubble(ctx, activeBubble);
      }
    }

    const rankSub = document.getElementById('office-rank-subtitle');
    if (rankSub && snap.rankDef) {
      rankSub.textContent = `${snap.rankDef.desc.replace(/。$/, '')} (${layout.cols}×${layout.rows})`;
    }
    const emptyText = document.getElementById('office-staff-count-badge');
    if (emptyText) {
      emptyText.textContent = `社員 ${snap.hiredStaff.length}/${snap.deskCount}人`;
    }
  }

  function isOfficeScreenVisible() {
    const sc = document.getElementById('screen-home');
    return Boolean(sc && sc.classList.contains('active'));
  }

  function loop(now) {
    if (!isOfficeScreenVisible()) {
      rafId = null;
      return;
    }
    if (now - lastDrawAt >= 200) {
      lastDrawAt = now;
      renderOffice(now);
    }
    rafId = requestAnimationFrame(loop);
  }

  function startLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    lastDrawAt = 0;
    rafId = requestAnimationFrame(loop);
  }

  function stopLoop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function findTargetAt(px, py) {
    for (let i = hitHotspots.length - 1; i >= 0; i--) {
      const p = hitHotspots[i].pillRect;
      if (p && px >= p.x - 3 && px <= p.x + p.w + 3 && py >= p.y - 3 && py <= p.y + p.h + 3) {
        return { kind: 'hotspot', id: hitHotspots[i].id };
      }
    }
    for (let i = hitStaffBoxes.length - 1; i >= 0; i--) {
      const sb = hitStaffBoxes[i];
      if (px >= sb.x && px <= sb.x + sb.w && py >= sb.y && py <= sb.y + sb.h) {
        return { kind: 'staff', box: sb };
      }
    }
    for (let i = hitHotspots.length - 1; i >= 0; i--) {
      const h = hitHotspots[i];
      if (px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h) {
        return { kind: 'hotspot', id: h.id };
      }
    }
    return null;
  }

  function buildStaffLines(staff, cycleIdx) {
    if (!staff) {
      return ['🪑 空席のPCデスクです', '社長机 → 人事で社員を雇用できます！'];
    }
    const defs = (typeof STAFF_SKILL_DEFS !== 'undefined') ? STAFF_SKILL_DEFS : {};
    const skills = Array.isArray(staff.skills) ? staff.skills : [];
    const primary = skills[0] ? defs[skills[0].id] : null;
    const skillStr = primary
      ? `${primary.name} Lv.${skills[0].level || 1}`
      : (staff.role || 'スタッフ');

    const linesByMode = [
      [`${staff.name} (${staff.stars || '★'})`, `得意: ${skillStr}`],
      [`${staff.name}「間取りお任せを！」`, `月給: ${Number(staff.salary || 0).toFixed(1)}万 / 業務中`],
      [`${staff.name}「良い物件を作りましょう」`, `${staff.role || '設計スタッフ'}として活躍中！`]
    ];
    return linesByMode[cycleIdx % linesByMode.length];
  }

  function triggerHotspot(id) {
    if (typeof initAudio === 'function') initAudio();
    if (typeof playSound === 'function') playSound('tap');

    const tutPhase = (typeof GameState !== 'undefined' && GameState && GameState.tutorialPhase) ? GameState.tutorialPhase : 'done';
    if (tutPhase === 'start_home' && id !== 'reception') {
      const h = hitHotspots.find(x => x.id === id);
      activeBubble = {
        targetId: id,
        x: h ? h.x + h.w * 0.5 : logicalW * 0.5,
        y: h ? Math.max(24, h.y + 4) : logicalH * 0.45,
        lines: ['💡 初回チュートリアル中', 'まずは左下の「受付（初回案件）」をタップ！'],
        expiresAt: performance.now() + 3200
      };
      renderOffice(performance.now());
      return;
    }
    if (tutPhase === 'home_advance_month' && id !== 'calendar') {
      const h = hitHotspots.find(x => x.id === id);
      activeBubble = {
        targetId: id,
        x: h ? h.x + h.w * 0.5 : logicalW * 0.5,
        y: h ? Math.max(24, h.y + 4) : logicalH * 0.45,
        lines: ['💡 初回チュートリアル中', '北壁の「カレンダー（月を進める）」をタップ！'],
        expiresAt: performance.now() + 3200
      };
      renderOffice(performance.now());
      return;
    }

    if (id === 'reception') {
      if (typeof global.openHomeMissionFlow === 'function') global.openHomeMissionFlow();
      return;
    }
    if (id === 'boss') {
      if (typeof openCompanyUpgradeModal === 'function') openCompanyUpgradeModal('company');
      return;
    }
    if (id === 'bookshelf') {
      if (typeof openRecordsModal === 'function') openRecordsModal();
      return;
    }
    if (id === 'cabinet') {
      if (typeof updateHomeUI === 'function') updateHomeUI();
      const modal = document.getElementById('office-properties-modal');
      if (modal) modal.style.display = 'flex';
      return;
    }
    if (id === 'calendar') {
      if (typeof openSkipModal === 'function') openSkipModal();
    }
  }

  function syncGuideToggleButton() {
    const btn = document.getElementById('btn-toggle-office-guides');
    if (!btn) return;
    if (guidesEnabled) {
      btn.classList.add('is-on');
      btn.innerHTML = `<i class="ph-bold ph-tag"></i> ガイド: ON`;
      btn.title = 'オブジェクト名ガイドを非表示にする';
    } else {
      btn.classList.remove('is-on');
      btn.innerHTML = `<i class="ph-bold ph-tag"></i> ガイド: OFF`;
      btn.title = 'オブジェクト名ガイドを表示する';
    }
  }

  function bindEvents() {
    canvasEl = document.getElementById('office-canvas');
    if (!canvasEl) return;

    const getLogicalXY = (e) => {
      const rect = canvasEl.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (logicalW / Math.max(1, rect.width)),
        y: (e.clientY - rect.top) * (logicalH / Math.max(1, rect.height))
      };
    };

    canvasEl.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const pt = getLogicalXY(e);
      const hit = findTargetAt(pt.x, pt.y);
      const newId = hit ? (hit.kind === 'hotspot' ? hit.id : hit.box.id) : null;
      canvasEl.style.cursor = newId ? 'pointer' : 'default';
      if (newId !== hoverTargetId) {
        hoverTargetId = newId;
        renderOffice(performance.now());
      }
    });

    canvasEl.addEventListener('pointerleave', () => {
      if (hoverTargetId !== null) {
        hoverTargetId = null;
        canvasEl.style.cursor = 'default';
        renderOffice(performance.now());
      }
    });

    canvasEl.addEventListener('click', (e) => {
      const pt = getLogicalXY(e);
      const hit = findTargetAt(pt.x, pt.y);
      if (!hit) {
        if (activeBubble) {
          activeBubble = null;
          renderOffice(performance.now());
        }
        return;
      }
      if (hit.kind === 'staff') {
        if (typeof initAudio === 'function') initAudio();
        if (typeof playSound === 'function') playSound('tap');
        const box = hit.box;
        const count = (bubbleTapCounts[box.id] || 0);
        bubbleTapCounts[box.id] = count + 1;
        activeBubble = {
          targetId: box.id,
          x: box.anchorX,
          y: box.anchorY,
          lines: buildStaffLines(box.staff, count),
          expiresAt: performance.now() + 3600
        };
        renderOffice(performance.now());
        return;
      }
      if (hit.kind === 'hotspot') {
        activeBubble = null;
        triggerHotspot(hit.id);
      }
    });

    document.getElementById('btn-toggle-office-guides')?.addEventListener('click', () => {
      if (typeof initAudio === 'function') initAudio();
      if (typeof playSound === 'function') playSound('tap');
      guidesEnabled = !guidesEnabled;
      try { localStorage.setItem(GUIDE_STORAGE_KEY, guidesEnabled ? '1' : '0'); } catch (e) {}
      syncGuideToggleButton();
      renderOffice(performance.now());
    });

    window.addEventListener('resize', () => {
      if (isOfficeScreenVisible()) renderOffice(performance.now());
    });

    syncGuideToggleButton();
  }

  function init() {
    if (initialized) return;
    initialized = true;
    if (global.PixelAssets) global.PixelAssets.initAllAssets();
    bindEvents();
    if (isOfficeScreenVisible()) {
      renderOffice(performance.now());
      startLoop();
    }
  }

  function refresh() {
    if (!initialized) init();
    if (isOfficeScreenVisible()) {
      renderOffice(performance.now());
      startLoop();
    } else {
      stopLoop();
    }
  }

  global.PixelOffice = {
    init,
    refresh,
    renderOffice,
    startLoop,
    stopLoop,
    isGuidesEnabled: () => guidesEnabled
  };
})(window);
