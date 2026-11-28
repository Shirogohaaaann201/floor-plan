'use strict';
/**
 * pixel_office.js
 * Step B+: チラシ2.5D統一ジオラマオフィス（太壁・壁寄せスナップ・主役リンク強調版）
 * - 10x8 固定比率キャンパス内で Rank 1(4x4) -> Rank 5(10x8) へ拡張
 * - チラシ画像と同じ 2.5D 北壁・濃紺太壁・アルミサッシ窓＆外観でビジュアル統一
 * - 5大リンク家具（受付・社長机・書庫・物件棚・カレンダー/ボード）を主役サイズ化＆動的ディテール追加
 * - 実ピクセル計測に基づく壁寄せスナップ & 横向き脇役什器（_west / _east）配置
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
      wallBg: '#fef6e4',
      wallTopShade: '#f5e4c3',
      trimCol: '#b4845a',
      facadeStyle: 'home',
      facadeColor: '#e2e8f0',
      facadeTrim: '#64748b',
      extStyle: 'home_yard',
      boss: {
        deskSpr: 'off_desk_boss_0', charSpr: 'boss_0',
        rugSpr: 'off_boss_rug_warm', rugW: 1.72, rugH: 1.12,
        c: 5.42, r: 3.32, w: 1.50, h: 1.0, snap: 'east', seatFrac: 0.44
      },
      reception: {
        spr: 'off_counter_small', c: 3, r: 4.24, w: 1.50, h: 1.0, snap: 'west',
        doorC: 3.55, clientC: 3.52, clientR: 5.06, tagPos: 'top'
      },
      bookshelf: {
        spr: 'off_bookshelf_mid', c: 3, r: 2, w: 1.24, h: 1.08, snap: 'nw', northReach: 0.52
      },
      cabinet: {
        spr: 'off_cabinet_mid', c: 5.76, r: 2, w: 1.24, h: 1.08, snap: 'ne', northReach: 0.52
      },
      calendar: {
        spr: 'off_calendar_wide', c: 4.31, r: 2, w: 1.38, h: 0.72, isWallPanel: true,
        calRect: { x: 4 / 72, y: 12 / 36, w: 27 / 72, h: 17 / 36 }
      },
      trophySpot: { c: 4.08, mini: true },
      staffSlots: [],
      props: [
        { spr: 'furn_rug_foyer', c: 3.52, r: 5.08, w: 1.0, h: 0.92, isRug: true },
        { spr: 'off_plant_slim', c: 3, r: 2.94, w: 0.85, h: 0.88, snap: 'west' },
        { spr: 'off_stand_east', c: 6.1, r: 5.02, w: 0.95, h: 0.95, snap: 'se' }
      ],
      wallDecos: [],
      facadeWindows: [4.75, 5.75]
    },
    // Rank 2 (officeLevel 1): 地元事務所 6x5
    {
      level: 1,
      c0: 2, r0: 2, cols: 6, rows: 5,
      floor: 'floor_office_blue',
      wallBg: '#f1f5f9',
      wallTopShade: '#e2e8f0',
      trimCol: '#94a3b8',
      facadeStyle: 'office',
      facadeColor: '#e2e8f0',
      facadeTrim: '#475569',
      extStyle: 'street',
      boss: {
        deskSpr: 'off_desk_boss_1', charSpr: 'boss_1',
        rugSpr: 'off_boss_rug_blue', rugW: 1.82, rugH: 1.16,
        c: 6.28, r: 3.45, w: 1.60, h: 1.0, snap: 'east', seatFrac: 0.44
      },
      reception: {
        spr: 'off_counter', c: 2, r: 5.02, w: 2.0, h: 1.0, snap: 'west',
        doorC: 2.68, clientC: 2.62, clientR: 5.95, tagPos: 'top'
      },
      bookshelf: {
        spr: 'off_bookshelf_mid', c: 2, r: 2, w: 1.54, h: 1.08, snap: 'nw', northReach: 0.52
      },
      cabinet: {
        spr: 'off_cabinet_mid', c: 6.46, r: 2, w: 1.54, h: 1.08, snap: 'ne', northReach: 0.52
      },
      calendar: {
        spr: 'off_calendar_wide', c: 4.30, r: 2, w: 1.56, h: 0.72, isWallPanel: true,
        calRect: { x: 4 / 72, y: 12 / 36, w: 27 / 72, h: 17 / 36 }
      },
      trophySpot: { c: 5.88, w: 0.58 },
      staffSlots: [
        { c: 3.55, r: 3.55, w: 1.22, sprPrefix: 'off_desk_staff', seatFrac: 0.5 }
      ],
      props: [
        { spr: 'furn_rug_foyer', c: 2.62, r: 6.02, w: 1.0, h: 0.94, isRug: true },
        { spr: 'off_printer_west', c: 2, r: 3.20, w: 1.0, h: 1.0, snap: 'west' },
        { spr: 'off_water_east', c: 7, r: 4.72, w: 1.0, h: 1.0, snap: 'east' },
        { spr: 'off_meeting_set', c: 5.05, r: 5.88, w: 1.86, h: 0.94, snap: 'south' },
        { spr: 'off_plant_slim', c: 7, r: 6.0, w: 0.95, h: 0.95, snap: 'se' }
      ],
      wallDecos: [
        { type: 'window', c: 3.60, w: 0.66 },
        { spr: 'wall_clock', c: 5.88, w: 0.56 }
      ],
      facadeWindows: [4.2, 5.4, 6.6]
    },
    // Rank 3 (officeLevel 2): 駅前オフィス 8x6（石目来客ロビー＆木枠すりガラス仕切り）
    {
      level: 2,
      c0: 1, r0: 1, cols: 8, rows: 6,
      floor: 'floor_office_blue',
      lobbyFloor: 'floor_office_lobby',
      lobbyEdgeRow: 5.05,
      lobbyTrimColor: '#94a3b8',
      wallBg: '#eef2f6',
      wallTopShade: '#dde5ee',
      trimCol: '#64748b',
      facadeStyle: 'office',
      facadeColor: '#cbd5e1',
      facadeTrim: '#475569',
      extStyle: 'plaza',
      boss: {
        deskSpr: 'off_desk_boss_1_wide', charSpr: 'boss_1',
        rugSpr: 'off_boss_rug_blue', rugW: 2.15, rugH: 1.18,
        c: 6.85, r: 2.58, w: 2.0, h: 1.0, snap: 'east', seatFrac: 0.40
      },
      reception: {
        spr: 'off_counter_wide', c: 1, r: 4.72, w: 2.95, h: 1.0, snap: 'west',
        doorC: 2.05, clientC: 2.02, clientR: 5.92, tagPos: 'top'
      },
      bookshelf: {
        spr: 'off_bookshelf_wide', c: 1, r: 1, w: 2.0, h: 1.10, snap: 'nw', northReach: 0.52
      },
      cabinet: {
        spr: 'off_cabinet_wide', c: 7, r: 1, w: 2.0, h: 1.10, snap: 'ne', northReach: 0.52
      },
      calendar: {
        spr: 'off_whiteboard_stand_mid', c: 3.92, r: 1, w: 2.16, h: 0.94, isStanding: true, northReach: 0.62,
        calRect: { x: 9 / 96, y: 11 / 44, w: 30 / 96, h: 18 / 44 }
      },
      trophySpot: { c: 6.18, w: 0.72 },
      staffSlots: [
        { c: 2.12, r: 3.12, w: 1.54, sprPrefix: 'off_desk_staff_mid', seatFrac: 0.38 },
        { c: 4.10, r: 3.12, w: 1.54, sprPrefix: 'off_desk_staff_mid', seatFrac: 0.38 }
      ],
      props: [
        { spr: 'furn_rug_foyer', c: 2.02, r: 6.0, w: 1.05, h: 0.96, isRug: true },
        { spr: 'off_lounge_rug', c: 5.56, r: 5.38, w: 2.34, h: 1.48, isRug: true },
        { spr: 'off_printer_west', c: 1, r: 2.08, w: 1.0, h: 1.0, snap: 'west' },
        { spr: 'off_locker_west', c: 1, r: 3.12, w: 1.0, h: 1.0, snap: 'west' },
        { spr: 'off_water_east', c: 8, r: 3.74, w: 1.0, h: 1.0, snap: 'east' },
        { spr: 'off_part_planter_h', c: 5.20, r: 4.76, w: 0.92, h: 0.56 },
        { spr: 'off_part_wood_h', c: 6.12, r: 4.80, w: 1.98, h: 0.52 },
        { spr: 'off_part_planter_h', c: 8.10, r: 4.76, w: 0.85, h: 0.56, snap: 'east' },
        { spr: 'off_stand', c: 4.30, r: 6.0, w: 0.92, h: 0.92, snap: 'south' },
        { spr: 'furn_sofa_v_west', c: 5.78, r: 5.32, w: 0.90, h: 1.56 },
        { spr: 'off_lounge_table_v', c: 6.25, r: 5.32, w: 0.95, h: 1.56 },
        { spr: 'furn_sofa_v_east', c: 6.76, r: 5.32, w: 0.90, h: 1.56 },
        { spr: 'off_plant_slim', c: 8, r: 6.0, w: 0.92, h: 0.92, snap: 'se' }
      ],
      wallDecos: [
        { type: 'window', c: 3.10, w: 0.76 },
        { type: 'window', c: 6.18, w: 0.76 }
      ],
      facadeWindows: [3.6, 4.9, 6.2, 7.5]
    },
    // Rank 4 (officeLevel 3): 本格スタジオ 9x7（石目ロビー＆クリアガラス＋ゲート柱仕切り）
    {
      level: 3,
      c0: 0, r0: 1, cols: 9, rows: 7,
      floor: 'floor_office_studio',
      lobbyFloor: 'floor_office_lobby',
      lobbyEdgeRow: 5.82,
      lobbyTrimColor: '#64748b',
      wallBg: '#f8fafc',
      wallTopShade: '#e2e8f0',
      trimCol: '#1e293b',
      facadeStyle: 'studio',
      facadeColor: '#94a3b8',
      facadeTrim: '#1e293b',
      extStyle: 'city_terrace',
      boss: {
        deskSpr: 'off_desk_boss_2', charSpr: 'boss_2',
        rugSpr: 'off_boss_rug_exec', rugW: 2.26, rugH: 1.20,
        c: 5.45, r: 2.40, w: 2.08, h: 1.0, seatFrac: 0.50
      },
      reception: {
        spr: 'off_counter_l', c: 0, r: 5.84, w: 2.12, h: 2.12, snap: 'sw', isLShape: true,
        doorC: 1.18, clientC: 1.10, clientR: 6.92, tagPos: 'top', tagXOffset: 1.06
      },
      bookshelf: {
        spr: 'off_bookshelf_wide', c: 0, r: 1, w: 2.04, h: 1.10, snap: 'nw', northReach: 0.52
      },
      cabinet: {
        spr: 'off_cabinet_wide', c: 6.96, r: 1, w: 2.04, h: 1.10, snap: 'ne', northReach: 0.52
      },
      calendar: {
        spr: 'off_whiteboard_stand_pro', c: 3.22, r: 1, w: 2.50, h: 0.96, isStanding: true, northReach: 0.60,
        calRect: { x: 9 / 108, y: 12 / 48, w: 32 / 108, h: 20 / 48 }
      },
      trophySpot: { c: 5.78, w: 0.52 },
      staffSlots: [
        { c: 1.05, r: 3.92, w: 1.65, sprPrefix: 'off_desk_staff_pro', seatFrac: 0.50 },
        { c: 3.55, r: 3.92, w: 1.65, sprPrefix: 'off_desk_staff_pro', seatFrac: 0.50 },
        { c: 6.05, r: 3.92, w: 1.65, sprPrefix: 'off_desk_staff_pro', seatFrac: 0.50 }
      ],
      props: [
        { spr: 'furn_rug_foyer', c: 1.10, r: 7.0, w: 1.0, h: 0.94, isRug: true },
        { spr: 'off_lounge_rug', c: 5.24, r: 6.12, w: 2.52, h: 1.72, isRug: true },
        { spr: 'off_locker_west', c: 0, r: 2.32, w: 1.0, h: 1.0, snap: 'west' },
        { spr: 'off_draft_table', c: 1.18, r: 2.34, w: 1.88, h: 0.92 },
        { spr: 'off_printer_west', c: 0, r: 3.84, w: 1.0, h: 1.0, snap: 'west' },
        { spr: 'off_plant_slim', c: 8, r: 2.30, w: 0.95, h: 0.95, snap: 'east' },
        { spr: 'off_water_east', c: 8, r: 3.74, w: 1.0, h: 1.0, snap: 'east' },
        { spr: 'off_shelf_sample_east', c: 8, r: 4.66, w: 1.0, h: 1.0, snap: 'east' },
        { spr: 'off_gate_post', c: 2.22, r: 5.46, w: 0.42, h: 0.62 },
        { spr: 'off_gate_post', c: 3.92, r: 5.46, w: 0.42, h: 0.62 },
        { spr: 'off_part_planter_h', c: 4.34, r: 5.48, w: 0.92, h: 0.56 },
        { spr: 'off_part_glass_h', c: 5.26, r: 5.52, w: 1.98, h: 0.52 },
        { spr: 'off_part_glass_h', c: 7.22, r: 5.52, w: 1.72, h: 0.52, snap: 'east' },
        { spr: 'off_stand', c: 3.12, r: 7.0, w: 0.92, h: 0.92, snap: 'south' },
        { spr: 'furn_sofa_v_west', c: 5.52, r: 6.12, w: 0.92, h: 1.70 },
        { spr: 'off_lounge_table_v', c: 6.02, r: 6.12, w: 0.96, h: 1.70 },
        { spr: 'furn_sofa_v_east', c: 6.56, r: 6.12, w: 0.92, h: 1.70 },
        { spr: 'off_plant_slim', c: 8, r: 7.0, w: 0.92, h: 0.92, snap: 'se' }
      ],
      wallDecos: [
        { type: 'window_city', c: 2.15, w: 0.88 },
        { spr: 'wall_clock', c: 5.78, w: 0.52 },
        { type: 'window_city', c: 6.32, w: 0.62 }
      ],
      facadeWindows: [2.8, 4.1, 5.5, 6.9]
    },
    // Rank 5 (officeLevel 4): 本社自社ビル 10x8（案A：右奥オープン社長コーナー＋左2x2チーム執務＋大理石ロビー）
    {
      level: 4,
      c0: 0, r0: 0, cols: 10, rows: 8,
      floor: 'floor_office_studio',
      lobbyFloor: 'floor_office_marble',
      lobbyEdgeRow: 5.68,
      lobbyTrimColor: '#cbd5e1',
      wallBg: '#f8fafc',
      wallTopShade: '#e2e8f0',
      trimCol: '#b45309',
      facadeStyle: 'hq',
      facadeColor: '#cbd5e1',
      facadeTrim: '#1e293b',
      extStyle: 'hq',
      boss: {
        deskSpr: 'off_desk_boss_2', charSpr: 'boss_2',
        rugSpr: 'off_boss_rug_exec', rugW: 2.34, rugH: 1.24,
        c: 6.50, r: 2.26, w: 2.10, h: 1.0, seatFrac: 0.50
      },
      reception: {
        spr: 'off_counter_l', c: 0, r: 5.84, w: 2.12, h: 2.12, snap: 'sw', isLShape: true,
        doorC: 1.18, clientC: 1.10, clientR: 6.92, tagPos: 'top', tagXOffset: 1.06
      },
      bookshelf: {
        spr: 'off_bookshelf_wide', c: 0, r: 0, w: 2.08, h: 1.12, snap: 'nw', northReach: 0.52
      },
      cabinet: {
        spr: 'off_cabinet_wide', c: 7.92, r: 0, w: 2.08, h: 1.12, snap: 'ne', northReach: 0.52
      },
      calendar: {
        spr: 'off_whiteboard_stand_pro', c: 3.74, r: 0, w: 2.52, h: 0.96, isStanding: true, northReach: 0.60,
        calRect: { x: 9 / 108, y: 12 / 48, w: 32 / 108, h: 20 / 48 }
      },
      trophySpot: { c: 6.32, w: 0.72 },
      staffSlots: [
        { c: 1.02, r: 2.84, w: 1.62, sprPrefix: 'off_desk_staff_pro', seatFrac: 0.50 },
        { c: 2.96, r: 2.84, w: 1.62, sprPrefix: 'off_desk_staff_pro', seatFrac: 0.50 },
        { c: 1.02, r: 4.24, w: 1.62, sprPrefix: 'off_desk_staff_pro', seatFrac: 0.50 },
        { c: 2.96, r: 4.24, w: 1.62, sprPrefix: 'off_desk_staff_pro', seatFrac: 0.50 }
      ],
      props: [
        { spr: 'furn_rug_foyer', c: 1.10, r: 7.0, w: 1.0, h: 0.94, isRug: true },
        { spr: 'off_lounge_rug', c: 5.92, r: 6.04, w: 2.66, h: 1.80, isRug: true },
        { spr: 'off_locker_west', c: 0, r: 1.48, w: 1.0, h: 1.0, snap: 'west' },
        { spr: 'off_draft_table', c: 1.18, r: 1.38, w: 1.94, h: 0.88 },
        { spr: 'off_printer_west', c: 0, r: 2.82, w: 1.0, h: 1.0, snap: 'west' },
        { spr: 'off_shelf_sample_west', c: 0, r: 4.10, w: 1.0, h: 1.0, snap: 'west' },
        { spr: 'off_part_glass_v', c: 5.56, r: 1.72, w: 0.42, h: 1.68 },
        { spr: 'off_part_planter_v', c: 5.54, r: 3.44, w: 0.46, h: 0.92 },
        { spr: 'off_meeting_set', c: 6.60, r: 3.96, w: 1.90, h: 0.90 },
        { spr: 'off_server_east', c: 9, r: 1.50, w: 1.0, h: 1.0, snap: 'east' },
        { spr: 'off_water_east', c: 9, r: 2.82, w: 1.0, h: 1.0, snap: 'east' },
        { spr: 'off_shelf_sample_east', c: 9, r: 4.10, w: 1.0, h: 1.0, snap: 'east' },
        { spr: 'off_gate_post', c: 2.26, r: 5.38, w: 0.42, h: 0.62 },
        { spr: 'off_gate_post', c: 4.36, r: 5.38, w: 0.42, h: 0.62 },
        { spr: 'off_part_planter_h', c: 4.78, r: 5.36, w: 0.94, h: 0.58 },
        { spr: 'off_part_glass_h', c: 5.72, r: 5.40, w: 2.04, h: 0.52 },
        { spr: 'off_part_glass_h', c: 7.74, r: 5.40, w: 2.18, h: 0.52, snap: 'east' },
        { spr: 'off_stand', c: 3.22, r: 7.0, w: 0.92, h: 0.92, snap: 'south' },
        { spr: 'furn_sofa_v_west', c: 6.24, r: 6.06, w: 0.94, h: 1.76 },
        { spr: 'off_lounge_table_v', c: 6.76, r: 6.06, w: 0.98, h: 1.76 },
        { spr: 'furn_sofa_v_east', c: 7.32, r: 6.06, w: 0.94, h: 1.76 },
        { spr: 'off_plant_slim', c: 9, r: 7.0, w: 0.92, h: 0.92, snap: 'se' }
      ],
      wallDecos: [
        { type: 'window_city', c: 2.18, w: 0.78 },
        { spr: 'wall_clock', c: 3.02, w: 0.68 },
        { spr: 'wall_art_2', c: 6.32, w: 0.72 },
        { type: 'window_city', c: 7.08, w: 0.78 }
      ],
      facadeWindows: [2.8, 4.1, 4.9, 6.2, 7.6]
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
  const spriteBoundsCache = new Map();

  function getSpriteBounds(sprId) {
    if (spriteBoundsCache.has(sprId)) return spriteBoundsCache.get(sprId);
    const spr = global.PixelAssets && global.PixelAssets.getSprite ? global.PixelAssets.getSprite(sprId) : null;
    if (!spr || !spr.canvas) return null;
    try {
      const sctx = spr.canvas.getContext('2d');
      const w = spr.width || spr.canvas.width;
      const h = spr.height || spr.canvas.height;
      const data = sctx.getImageData(0, 0, w, h).data;
      let minX = w, minY = h, maxX = -1, maxY = -1;
      for (let y = 0; y < h; y++) {
        const off = y * w * 4;
        for (let x = 0; x < w; x++) {
          if (data[off + x * 4 + 3] >= 120) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      const res = (maxX >= minX && maxY >= minY) ? { minX, minY, maxX, maxY, w, h } : null;
      spriteBoundsCache.set(sprId, res);
      return res;
    } catch (e) {
      spriteBoundsCache.set(sprId, null);
      return null;
    }
  }

  /**
   * チラシレンダーと同等の実ピクセル境界計測＋壁寄せスナップを計算し、
   * 実際の描画位置と視覚バウンディング矩形を返す。
   */
  function computeOfficePlacement(sprId, drawX, drawY, drawW, drawH, boundsInfo) {
    const { snap, northReach = 0.48, wallH, wallTopY, innerLeft, innerRight, innerTopY, innerBotY } = boundsInfo;
    const b = getSpriteBounds(sprId);
    if (!b) {
      return {
        dx: drawX, dy: drawY, dw: drawW, dh: drawH,
        vis: { x: drawX, y: drawY, w: drawW, h: drawH }
      };
    }

    const sx = drawW / b.w;
    const sy = drawH / b.h;
    const bodyLeft = b.minX * sx;
    const bodyRight = (b.maxX + 1) * sx;
    const bodyTop = b.minY * sy;
    const bodyBot = (b.maxY + 1) * sy;
    const bodyW = bodyRight - bodyLeft;
    const bodyH = bodyBot - bodyTop;

    let offX = 0;
    let offY = 0;

    if (snap === 'west' || snap === 'nw' || snap === 'sw') {
      offX = Math.round(innerLeft - (drawX + bodyLeft));
    } else if (snap === 'east' || snap === 'ne' || snap === 'se') {
      offX = Math.round(innerRight - (drawX + bodyRight));
    }

    if (snap === 'north' || snap === 'nw' || snap === 'ne') {
      const targetTop = innerTopY - Math.round(wallH * northReach);
      offY = Math.round(targetTop - (drawY + bodyTop));
      const minWallTop = wallTopY + 2;
      if (drawY + bodyTop + offY < minWallTop) {
        offY = Math.ceil(minWallTop - (drawY + bodyTop));
      }
      if (drawY + bodyBot + offY < innerTopY + 6) {
        offY = Math.ceil((innerTopY + 6) - (drawY + bodyBot));
      }
    } else if (snap === 'south' || snap === 'sw' || snap === 'se') {
      offY = Math.round(innerBotY - (drawY + bodyBot));
    }

    // 横クランプ（左右壁の枠内に必ず収める）
    if (drawX + bodyLeft + offX < innerLeft) {
      offX = Math.ceil(innerLeft - (drawX + bodyLeft));
    }
    if (drawX + bodyRight + offX > innerRight) {
      offX = Math.floor(innerRight - (drawX + bodyRight));
    }
    // 下端クランプ（南外壁にはみ出させない）
    if (drawY + bodyBot + offY > innerBotY) {
      offY = Math.floor(innerBotY - (drawY + bodyBot));
    }

    return {
      dx: drawX + offX,
      dy: drawY + offY,
      dw: drawW,
      dh: drawH,
      vis: {
        x: drawX + offX + bodyLeft,
        y: drawY + offY + bodyTop,
        w: bodyW,
        h: bodyH
      }
    };
  }

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
      ? COMBO_MASTER_LIST.length : 46;
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
    const wallH = Math.max(10, Math.round(cs * 0.46));
    const rawT = Math.round(cs * 0.14);
    const wallThick = Math.max(4, rawT % 2 === 0 ? rawT : rawT + 1);
    const halfT = wallThick / 2;
    const topPad = wallH + halfT + Math.max(4, Math.round(cs * 0.08));
    const botPad = halfT + Math.round(cs * 0.42);

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
    return { canvas: canvasEl, cs, wallH, wallThick, halfT, topPad, botPad, dpr };
  }

  // チラシと同じトーンの 2.5D アルミサッシ窓 / 都市夜景窓
  function drawWindowTile(ctx, x, wy, cellW, wallH, isNightCity, tick) {
    const ww = Math.max(10, Math.round(cellW * 0.72));
    const wh = Math.max(7, wallH - 6);
    const wx = Math.round(x + (cellW - ww) / 2);
    const wyTop = Math.round(wy + 3);

    if (isNightCity) {
      ctx.fillStyle = '#334155';
      ctx.fillRect(wx - 1, wyTop - 1, ww + 2, wh + 2);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(wx, wyTop, ww, wh);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(wx + 1, wyTop + 3, Math.max(3, Math.floor(ww * 0.28)), wh - 3);
      ctx.fillRect(wx + Math.floor(ww * 0.35), wyTop + 1, Math.max(4, Math.floor(ww * 0.30)), wh - 1);
      ctx.fillRect(wx + Math.floor(ww * 0.68), wyTop + 4, Math.max(3, Math.floor(ww * 0.28)), wh - 4);
      const twinkle = (tick + Math.floor(x)) % 4;
      ctx.fillStyle = twinkle === 0 ? '#fde047' : '#fbbf24';
      ctx.fillRect(wx + 2, wyTop + 4, 2, 2);
      ctx.fillRect(wx + Math.floor(ww * 0.42), wyTop + 3, 2, 2);
      ctx.fillStyle = twinkle === 2 ? '#38bdf8' : '#fef08a';
      ctx.fillRect(wx + Math.floor(ww * 0.42), wyTop + 7, 2, 2);
      if (ww > 18) ctx.fillRect(wx + Math.floor(ww * 0.74), wyTop + 6, 2, 2);
      ctx.fillStyle = 'rgba(224, 242, 254, 0.35)';
      ctx.fillRect(wx + Math.floor(ww / 2), wyTop, 1, wh);
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(wx - 1, wyTop, ww + 2, wh);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(wx, wyTop + 1, ww, wh - 2);
      ctx.fillStyle = '#e0f2fe';
      ctx.fillRect(wx + 2, wyTop + 2, Math.max(2, Math.round(ww * 0.34)), Math.max(2, wh - 5));
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(wx + Math.floor(ww / 2), wyTop + 1, 1, wh - 2);
      ctx.fillRect(wx, wyTop + Math.floor(wh / 2), ww, 1);
      // 淡いカーテン両袖
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(wx - 1, wyTop, 2, wh);
      ctx.fillRect(wx + ww - 1, wyTop, 2, wh);
    }
  }

  function drawFacadeWindow(ctx, x, fy, cs, extH, layout) {
    const winW = Math.round(cs * 0.54);
    const winX = Math.round(x + (cs - winW) / 2);
    const winH = Math.max(5, extH - 5);
    const wy = fy + 2;

    if (layout.facadeStyle === 'home') {
      ctx.fillStyle = '#475569';
      ctx.fillRect(winX - 1, wy, winW + 2, winH);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(winX, wy + 1, winW, winH - 2);
    } else {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(winX - 1, wy, winW + 2, winH);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(winX, wy + 1, winW, winH - 2);
    }
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(winX + 1, wy + 2, Math.max(2, winW - 2), Math.max(2, winH - 4));
    ctx.fillStyle = '#bae6fd';
    ctx.fillRect(winX + 2, wy + 2, Math.max(2, Math.floor(winW * 0.36)), Math.max(1, winH - 5));
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(winX + Math.floor(winW / 2), wy + 1, 1, winH - 2);
    ctx.fillStyle = '#64748b';
    ctx.fillRect(winX - 1, wy + winH, winW + 2, 1);
  }

  // 太い濃紺外壁フレームを 2.5D 北壁天端・東西・南側でシームレス描画
  function drawPerimeterFrame(ctx, rx, wallTopY, rw, fullH, doorStartX, doorEndX, wallThick) {
    const halfT = wallThick / 2;
    const inset = wallThick >= 6 ? Math.max(1, Math.round(wallThick * 0.22)) : 1;
    const coreThick = Math.max(2, wallThick - inset * 2);
    const x1 = rx;
    const x2 = rx + rw;
    const y1 = wallTopY;
    const y2 = wallTopY + fullH;

    // Pass 1: base (#0f172a)
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x1 - halfT, y1 - halfT, rw + wallThick, wallThick); // 北
    ctx.fillRect(x1 - halfT, y1 - halfT, wallThick, fullH + wallThick); // 西
    ctx.fillRect(x2 - halfT, y1 - halfT, wallThick, fullH + wallThick); // 東
    // 南（ドア開口あり）
    if (doorStartX > x1) {
      ctx.fillRect(x1 - halfT, y2 - halfT, (doorStartX - x1) + halfT, wallThick);
    }
    if (doorEndX < x2) {
      ctx.fillRect(doorEndX, y2 - halfT, (x2 - doorEndX) + halfT, wallThick);
    }

    // Pass 2: inner core (#1e293b) & specular (#334155)
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x1 - halfT + inset, y1 - halfT + inset, rw + wallThick - inset * 2, coreThick);
    ctx.fillRect(x1 - halfT + inset, y1 - halfT + inset, coreThick, fullH + wallThick - inset * 2);
    ctx.fillRect(x2 - halfT + inset, y1 - halfT + inset, coreThick, fullH + wallThick - inset * 2);
    if (doorStartX > x1) {
      ctx.fillRect(x1 - halfT + inset, y2 - halfT + inset, (doorStartX - x1) + halfT - inset, coreThick);
    }
    if (doorEndX < x2) {
      ctx.fillRect(doorEndX, y2 - halfT + inset, (x2 - doorEndX) + halfT - inset, coreThick);
    }

    if (coreThick >= 2) {
      ctx.fillStyle = '#334155';
      ctx.fillRect(x1 - halfT + inset, y1 - halfT + inset, rw + wallThick - inset * 2, 1);
      ctx.fillRect(x1 - halfT + inset, y1 - halfT + inset, 1, fullH + wallThick - inset * 2);
    }
  }

  function drawGuidePill(ctx, cx, cy, text, accentColor, isUrgent, blinkOn) {
    ctx.save();
    ctx.font = '800 9.5px "Zen Kaku Gothic New", sans-serif';
    const textW = ctx.measureText(text).width;
    const padX = 5.5;
    const bw = Math.round(textW + padX * 2);
    const bh = 15;
    const bx = Math.round(Math.max(3, Math.min(logicalW - bw - 3, cx - bw / 2)));
    const by = Math.round(Math.max(2, Math.min(logicalH - bh - 2, cy - bh / 2)));

    ctx.fillStyle = isUrgent && blinkOn ? '#be123c' : 'rgba(15, 23, 42, 0.86)';
    ctx.strokeStyle = isUrgent ? '#fda4af' : accentColor;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 7.5);
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
    ctx.font = '900 9px "Zen Kaku Gothic New", sans-serif';
    const w = Math.max(14, Math.ceil(ctx.measureText(label).width + 7));
    const h = 14;
    const x = Math.round(Math.max(2, Math.min(logicalW - w - 2, cx - w / 2)));
    const y = Math.round(Math.max(2, cy + bobY));
    ctx.fillStyle = bgColor;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1.4;
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

    const { canvas, cs, wallH, wallThick, halfT, topPad, botPad, dpr } = dim;
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
      for (let r = -1; r <= ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          global.PixelAssets.drawSprite(ctx, 'floor_outside', c * cs, oy + r * cs, cs, cs);
        }
      }
      for (let r = 1; r <= 6; r++) {
        for (let c = 1; c <= 8; c++) {
          ctx.fillStyle = ((r + c) % 2 === 0) ? '#bbf7d0' : '#a7f3d0';
          ctx.fillRect(c * cs, oy + r * cs, cs, cs);
        }
      }
      // 庭の境界ライン（やさしい生垣トーン）
      ctx.fillStyle = '#86efac';
      ctx.fillRect(1 * cs, oy + 1 * cs, 8 * cs, 2);
      ctx.fillRect(1 * cs, oy + 1 * cs, 2, 6 * cs);
      ctx.fillRect(9 * cs - 2, oy + 1 * cs, 2, 6 * cs);
      ctx.fillRect(1 * cs, oy + 7 * cs - 2, 8 * cs, 2);
      // 玄関飛び石アプローチ（最下部まで連続）
      for (let r = layout.r0 + layout.rows; r <= ROWS; r++) {
        const ax = layout.reception.doorC * cs + cs * 0.14;
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(ax, oy + r * cs + cs * 0.16, cs * 0.64, cs * 0.56);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(ax + 2, oy + r * cs + cs * 0.16 + 2, cs * 0.64 - 4, cs * 0.56 - 4);
      }
    } else if (layout.extStyle === 'street' || layout.extStyle === 'plaza') {
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(0, 0, logicalW, logicalH);
      for (let r = -1; r <= ROWS; r++) {
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
      // 夜景ビルシルエット＋窓明かり
      for (let bx = 0; bx < logicalW; bx += cs) {
        const bh = 20 + ((bx * 7) % 28);
        const by = logicalH - bh;
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(bx + 2, by, cs - 4, bh);
        ctx.fillStyle = '#334155';
        ctx.fillRect(bx + 3, by + 1, cs - 6, 2);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(bx + 6, by + 5, 2, 2);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(bx + cs - 10, by + 9, 2, 2);
      }
      // Rank 4 屋上テラス右端デッキ（9x7時の東側バルコニー表現）
      if (layout.level === 3) {
        const tx = (layout.c0 + layout.cols) * cs;
        const tw = logicalW - tx;
        const ty = oy + layout.r0 * cs - wallH;
        const th = layout.rows * cs + wallH + Math.round(cs * 0.34);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(tx, ty + 8, tw - 4, th - 8);
        ctx.fillStyle = '#334155';
        for (let r = layout.r0; r < layout.r0 + layout.rows; r++) {
          ctx.fillRect(tx, oy + r * cs, tw - 4, 1);
        }
        // テラス手すり＆コーナーランプ
        ctx.fillStyle = '#475569';
        ctx.fillRect(tx + tw - 6, ty + 8, 2, th - 8);
        ctx.fillRect(tx, ty + th - 2, tw - 4, 2);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(tx + tw - 8, oy + 2 * cs, 4, 4);
        ctx.fillRect(tx + tw - 8, oy + 6 * cs, 4, 4);
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
    const wallTopY = ry - wallH;
    const extH = Math.max(8, Math.round(cs * 0.34));
    const frontWallY = ry + rh;

    // 建物ドロップシャドウ
    ctx.fillStyle = 'rgba(15, 23, 42, 0.24)';
    ctx.fillRect(rx + 4, wallTopY + 5, rw, wallH + rh + extH);

    for (let r = layout.r0; r < layout.r0 + layout.rows; r++) {
      for (let c = layout.c0; c < layout.c0 + layout.cols; c++) {
        let floorSpr = layout.floor;
        if (layout.vipAisleCols && layout.vipAisleCols.includes(c)) {
          floorSpr = 'floor_office_vip';
        }
        global.PixelAssets.drawSprite(ctx, floorSpr, c * cs, oy + r * cs, cs, cs);
      }
    }

    // Rank 3〜5: 手前「来客ロビー」の床材ゾーニング＆見切り材ライン
    if (layout.lobbyFloor && layout.lobbyEdgeRow !== undefined) {
      const lobY = Math.round(oy + layout.lobbyEdgeRow * cs);
      if (lobY < frontWallY) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(rx, lobY, rw, frontWallY - lobY);
        ctx.clip();
        const rStart = Math.max(layout.r0, Math.floor(layout.lobbyEdgeRow));
        for (let r = rStart; r < layout.r0 + layout.rows; r++) {
          for (let c = layout.c0; c < layout.c0 + layout.cols; c++) {
            global.PixelAssets.drawSprite(ctx, layout.lobbyFloor, c * cs, oy + r * cs, cs, cs);
          }
        }
        ctx.restore();
        ctx.fillStyle = layout.lobbyTrimColor || '#94a3b8';
        ctx.fillRect(rx, lobY - 1, rw, 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.fillRect(rx, lobY + 1, rw, 1);
      }
    }

    // 3. 2.5D 北壁立ち上がり面（天井影＋壁紙＋幅木：チラシ準拠）
    ctx.fillStyle = layout.wallBg;
    ctx.fillRect(rx, wallTopY, rw, wallH);
    ctx.fillStyle = layout.wallTopShade || '#e8e2d5';
    ctx.fillRect(rx, wallTopY, rw, Math.max(2, Math.round(wallH * 0.16)));
    ctx.fillStyle = layout.trimCol || '#64748b';
    ctx.fillRect(rx, ry - 3, rw, 3);

    // 北壁装飾（窓・時計・アート）※背高家具の背後に綺麗に収まる区間のみ
    const wallDecoSkipCol = new Set();
    if (snap.hasCleared && layout.trophySpot && !layout.trophySpot.mini) {
      wallDecoSkipCol.add(layout.trophySpot.c);
    }
    (layout.wallDecos || []).forEach(wd => {
      if (wallDecoSkipCol.has(wd.c)) return;
      const wx = wd.c * cs;
      const ww = (wd.w || 1) * cs;
      if (wd.type === 'window' || wd.type === 'window_city') {
        drawWindowTile(ctx, wx, wallTopY, ww, wallH, wd.type === 'window_city', tick);
      } else if (wd.spr) {
        global.PixelAssets.drawSprite(ctx, wd.spr, wx, wallTopY + 2, ww, wallH - 5);
      }
    });

    if (snap.hasCleared && layout.trophySpot) {
      const tx = layout.trophySpot.c * cs;
      const tw = (layout.trophySpot.w || 0.72) * cs;
      global.PixelAssets.drawSprite(ctx, 'off_trophy', tx, wallTopY + 2, tw, wallH - 5);
    }

    // スナップ基準境界
    const boundsInfo = {
      wallH,
      wallTopY,
      innerLeft: rx + halfT + 1,
      innerRight: rx + rw - halfT - 1,
      innerTopY: ry,
      innerBotY: frontWallY - halfT - 1
    };

    // 4. ラグ描画（玄関ラグ & 社長デスク足元ラグ）
    (layout.props || []).forEach(pr => {
      if (pr.isRug) {
        global.PixelAssets.drawSprite(ctx, pr.spr, pr.c * cs, oy + pr.r * cs, (pr.w || 1) * cs, (pr.h || 1) * cs);
      }
    });

    // 5. 家具・什器・人物の配置計算 & Yソート描画
    const renderQueue = [];
    const bsCfg = layout.bookshelf;
    const cabCfg = layout.cabinet;
    const calCfg = layout.calendar;
    const bCfg = layout.boss;
    const rec = layout.reception;

    // 5a. 壁掛けカレンダー（Rank 1–2）または自立スタンドボード（Rank 3–5）
    let calDraw = null;
    const calBaseX = calCfg.c * cs;
    const calBaseW = (calCfg.w || 1.4) * cs;
    const calBaseH = (calCfg.h || 0.72) * cs;
    if (calCfg.isWallPanel) {
      // Rank 1–2: 北壁面中心からやや床上部へ跨ぐ視認性の高い壁掛けコンボボード
      const cdx = calBaseX;
      const cdy = wallTopY + Math.max(2, Math.round(wallH * 0.14));
      calDraw = {
        dx: cdx, dy: cdy, dw: calBaseW, dh: calBaseH,
        vis: { x: cdx + 2, y: cdy + 1, w: calBaseW - 4, h: calBaseH - 3 }
      };
    } else {
      calDraw = computeOfficePlacement(
        calCfg.spr,
        calBaseX,
        oy + calCfg.r * cs,
        calBaseW,
        calBaseH,
        { ...boundsInfo, snap: 'north', northReach: calCfg.northReach || 0.60 }
      );
    }

    const drawCalendarNode = () => {
      global.PixelAssets.drawSprite(ctx, calCfg.spr, calDraw.dx, calDraw.dy, calDraw.dw, calDraw.dh);
      // 現在月マーカー（1..12月の位置をカレンダーグリッド上にさりげなく赤ハイライト）
      if (calCfg.calRect) {
        const cr = calCfg.calRect;
        const mIdx = (snap.monthInYear - 1) % 12;
        const colsCal = 4;
        const mCol = mIdx % colsCal;
        const mRow = Math.floor(mIdx / colsCal);
        const mx = calDraw.dx + calDraw.dw * cr.x + (calDraw.dw * cr.w) * (mCol / colsCal);
        const my = calDraw.dy + calDraw.dh * cr.y + (calDraw.dh * cr.h) * (mRow / 3);
        const mw = Math.max(3, (calDraw.dw * cr.w) / colsCal - 1);
        const mh = Math.max(2.5, (calDraw.dh * cr.h) / 3 - 0.8);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.85)';
        ctx.fillRect(Math.round(mx), Math.round(my), Math.round(mw), Math.round(mh));
      }
    };

    if (calCfg.isWallPanel) {
      drawCalendarNode();
    } else {
      renderQueue.push({ sortY: calDraw.vis.y + calDraw.vis.h, draw: drawCalendarNode });
    }

    // 5b. 書庫（図鑑・記録帳リンク）
    const bsDraw = computeOfficePlacement(
      bsCfg.spr || 'off_bookshelf',
      bsCfg.c * cs,
      oy + bsCfg.r * cs,
      (bsCfg.w || 1) * cs,
      (bsCfg.h || 1) * cs,
      { ...boundsInfo, snap: bsCfg.snap || 'nw', northReach: bsCfg.northReach || 0.52 }
    );
    const totalColItems = Math.max(1, snap.comboTotal + snap.furnTotal);
    const discRatio = (snap.comboFound + snap.furnFound) / totalColItems;
    renderQueue.push({
      sortY: bsDraw.vis.y + bsDraw.vis.h,
      draw: () => {
        global.PixelAssets.drawSprite(ctx, bsCfg.spr || 'off_bookshelf', bsDraw.dx, bsDraw.dy, bsDraw.dw, bsDraw.dh);
        // 収集率に応じた天板・陳列キラキラ演出
        if (discRatio >= 0.30) {
          const glOn = (tick % 3 === 0);
          ctx.fillStyle = discRatio >= 0.65 ? (glOn ? '#fde047' : '#ffffff') : (glOn ? '#bae6fd' : '#f8fafc');
          ctx.fillRect(Math.round(bsDraw.vis.x + bsDraw.vis.w * 0.48), Math.round(bsDraw.vis.y + 3), 2, 2);
          if (discRatio >= 0.65) {
            ctx.fillRect(Math.round(bsDraw.vis.x + bsDraw.vis.w * 0.25), Math.round(bsDraw.vis.y + 4), 2, 2);
            ctx.fillRect(Math.round(bsDraw.vis.x + bsDraw.vis.w * 0.74), Math.round(bsDraw.vis.y + 4), 2, 2);
          }
        }
      }
    });

    // 5c. 物件棚・マイソク掲示ボード（保有物件リンク）
    const cabDraw = computeOfficePlacement(
      cabCfg.spr || 'off_cabinet',
      cabCfg.c * cs,
      oy + cabCfg.r * cs,
      (cabCfg.w || 1) * cs,
      (cabCfg.h || 1) * cs,
      { ...boundsInfo, snap: cabCfg.snap || 'ne', northReach: cabCfg.northReach || 0.52 }
    );
    renderQueue.push({
      sortY: cabDraw.vis.y + cabDraw.vis.h,
      draw: () => {
        global.PixelAssets.drawSprite(ctx, cabCfg.spr || 'off_cabinet', cabDraw.dx, cabDraw.dy, cabDraw.dw, cabDraw.dh);
        if (snap.vacantCount > 0) {
          // 掲示ボード上部LEDランプ赤点滅
          ctx.fillStyle = (fastTick % 2 === 0) ? '#ef4444' : '#fca5a5';
          ctx.fillRect(Math.round(cabDraw.vis.x + cabDraw.vis.w * 0.80), Math.round(cabDraw.vis.y + 2), 4, 2);
          const bob = (fastTick % 2 === 0) ? -2 : 0;
          drawAlertBadge(ctx, cabDraw.vis.x + cabDraw.vis.w * 0.78, cabDraw.vis.y - 3, `! 空${snap.vacantCount}`, '#e11d48', '#fecdd3', bob);
        }
      }
    });

    // 5d. 各種オフィス什器・備品（横向き脇役什器を壁スナップ）
    (layout.props || []).forEach(pr => {
      if (pr.isRug) return;
      const pDraw = computeOfficePlacement(
        pr.spr,
        pr.c * cs,
        oy + pr.r * cs,
        (pr.w || 1) * cs,
        (pr.h || 1) * cs,
        { ...boundsInfo, snap: pr.snap || null, northReach: 0.20 }
      );
      renderQueue.push({
        sortY: pDraw.vis.y + pDraw.vis.h,
        draw: () => global.PixelAssets.drawSprite(ctx, pr.spr, pDraw.dx, pDraw.dy, pDraw.dw, pDraw.dh)
      });
    });

    // 5e. 社長＋社長デスク＋足元ラグ（司令塔演出）
    const bossDraw = computeOfficePlacement(
      bCfg.deskSpr,
      bCfg.c * cs,
      oy + bCfg.r * cs,
      (bCfg.w || 1.5) * cs,
      (bCfg.h || 1.0) * cs,
      { ...boundsInfo, snap: bCfg.snap || null }
    );
    if (bCfg.rugSpr) {
      const rugW = (bCfg.rugW || 1.8) * cs;
      const rugH = (bCfg.rugH || 1.15) * cs;
      const rugX = Math.round(bossDraw.vis.x + bossDraw.vis.w * 0.5 - rugW * 0.5);
      const rugY = Math.round(bossDraw.vis.y + bossDraw.vis.h * 0.52 - rugH * 0.45);
      const clampedRugX = Math.max(boundsInfo.innerLeft, Math.min(boundsInfo.innerRight - rugW, rugX));
      const clampedRugY = Math.max(boundsInfo.innerTopY + 1, Math.min(boundsInfo.innerBotY - rugH, rugY));
      global.PixelAssets.drawSprite(ctx, bCfg.rugSpr, clampedRugX, clampedRugY, rugW, rugH);
    }
    const bossCharTopY = bossDraw.dy - Math.round(cs * 0.34);
    const seatFracBoss = bCfg.seatFrac !== undefined ? bCfg.seatFrac : 0.5;
    const bossCharX = bossDraw.dx + bossDraw.dw * seatFracBoss - cs * 0.5;
    renderQueue.push({
      sortY: bossDraw.vis.y + bossDraw.vis.h,
      draw: () => {
        const bossFrame = (tick % 4 === 1) ? 1 : 0;
        global.PixelAssets.drawSprite(ctx, `${bCfg.charSpr}_${bossFrame}`, bossCharX, bossCharTopY, cs, cs);
        global.PixelAssets.drawSprite(ctx, bCfg.deskSpr, bossDraw.dx, bossDraw.dy, bossDraw.dw, bossDraw.dh);
      }
    });

    // 5f. スタッフデスク＋雇用社員
    hitStaffBoxes = [];
    for (let i = 0; i < snap.deskCount; i++) {
      const slot = layout.staffSlots[i];
      if (!slot) break;
      const dw = (slot.w || 1) * cs;
      const sprPrefixDesk = slot.sprPrefix || 'off_desk_staff';
      const staff = snap.hiredStaff[i] || null;
      const starCount = staff ? (staff.rank === 'expert' ? 3 : (staff.rank === 'specialist' ? 2 : 1)) : 0;
      const deskSprId = staff ? `${sprPrefixDesk}_${starCount}` : `${sprPrefixDesk}_empty`;
      const sDraw = computeOfficePlacement(
        deskSprId,
        slot.c * cs,
        oy + slot.r * cs,
        dw,
        cs,
        { ...boundsInfo, snap: null }
      );
      const seatFrac = slot.seatFrac !== undefined ? slot.seatFrac : 0.5;
      const charX = sDraw.dx + dw * seatFrac - cs * 0.5;
      const charY = sDraw.dy - Math.round(cs * 0.34);

      renderQueue.push({
        sortY: sDraw.vis.y + sDraw.vis.h,
        draw: () => {
          if (staff) {
            const mainSkill = (Array.isArray(staff.skills) && staff.skills[0]) ? staff.skills[0].id : null;
            const charPrefix = SKILL_TO_STAFF_SPR[mainSkill] || 'staff_design';
            const frame = ((tick + i) % 3 === 0) ? 1 : 0;
            global.PixelAssets.drawSprite(ctx, `${charPrefix}_${frame}`, charX, charY, cs, cs);
            global.PixelAssets.drawSprite(ctx, deskSprId, sDraw.dx, sDraw.dy, dw, cs);
            for (let st = 0; st < starCount; st++) {
              ctx.fillStyle = '#facc15';
              ctx.fillRect(Math.round(sDraw.dx + dw * seatFrac - (starCount * 5) / 2 + st * 5), Math.round(sDraw.dy + cs * 0.72), 3, 3);
            }
          } else {
            global.PixelAssets.drawSprite(ctx, deskSprId, sDraw.dx, sDraw.dy, dw, cs);
          }
        }
      });

      hitStaffBoxes.push({
        id: `staff_${i}`,
        index: i,
        staff,
        x: Math.round(sDraw.vis.x - 1),
        y: Math.round(charY + 3),
        w: Math.round(sDraw.vis.w + 2),
        h: Math.round((sDraw.vis.y + sDraw.vis.h) - (charY + 3) + 2),
        anchorX: sDraw.dx + dw * seatFrac,
        anchorY: charY + 2
      });
    }

    // 5g. 受付カウンター & 来店客
    const recDraw = computeOfficePlacement(
      rec.spr || 'off_counter',
      rec.c * cs,
      oy + rec.r * cs,
      (rec.w || 2) * cs,
      (rec.h || 1) * cs,
      { ...boundsInfo, snap: rec.snap || 'west' }
    );
    const cliX = rec.clientC * cs;
    const cliY = oy + rec.clientR * cs;

    renderQueue.push({
      sortY: rec.isLShape
        ? (recDraw.vis.y + recDraw.vis.h * 0.44)
        : (recDraw.vis.y + recDraw.vis.h - 2),
      draw: () => global.PixelAssets.drawSprite(ctx, rec.spr || 'off_counter', recDraw.dx, recDraw.dy, recDraw.dw, recDraw.dh)
    });

    renderQueue.push({
      sortY: cliY + cs * 0.92,
      draw: () => {
        const cliPrefix = getClientCharPrefix(snap.receptionClient);
        const cliFrame = (snap.missionMode === 'result' || snap.missionMode === 'search' || snap.missionMode === 'tutorial_start') ? (fastTick % 2) : (tick % 2);
        const cliBob = (snap.missionMode === 'result' || snap.missionMode === 'tutorial_start') ? -((fastTick % 2) * 2) : 0;
        global.PixelAssets.drawSprite(ctx, `${cliPrefix}_${cliFrame}`, cliX, cliY + cliBob, cs, cs);
        if (snap.missionMode === 'result') {
          drawAlertBadge(ctx, cliX + cs * 0.5, cliY - 6, '★引渡', '#d97706', '#fef08a', cliBob);
        } else if (snap.missionMode === 'tutorial_start') {
          drawAlertBadge(ctx, cliX + cs * 0.5, cliY - 6, '★初回', '#d97706', '#fef08a', cliBob);
        } else if (snap.missionMode === 'resume' || snap.missionMode === 'current') {
          drawAlertBadge(ctx, cliX + cs * 0.5, cliY - 6, '設計中', '#2563eb', '#bfdbfe', cliBob);
        } else if (snap.isAtCap) {
          drawAlertBadge(ctx, cliX + cs * 0.5, cliY - 6, '! 上限', '#be123c', '#fecdd3', 0);
        } else if (snap.hasSpecialWaiting) {
          drawAlertBadge(ctx, cliX + cs * 0.5, cliY - 6, '★特注', '#7c3aed', '#e9d5ff', (fastTick % 2 === 0 ? -1 : 0));
        } else {
          drawAlertBadge(ctx, cliX + cs * 0.5, cliY - 6, '!', '#059669', '#a7f3d0', (fastTick % 2 === 0 ? -1 : 0));
        }
      }
    });

    renderQueue.sort((a, b) => a.sortY - b.sortY);
    renderQueue.forEach(item => item.draw());

    // 6. 太い濃紺外壁フレーム（2パス接続）＆ 南側外観ファサード＋玄関ドア＋アルミ外観窓
    const isWideDoor = layout.level >= 3;
    const doorW = Math.round(cs * (isWideDoor ? 0.88 : 0.70));
    const doorX = Math.round(rec.doorC * cs + (cs - doorW) * 0.5);
    const doorStartX = Math.max(rx + halfT + 2, doorX - 1);
    const doorEndX = Math.min(rx + rw - halfT - 2, doorX + doorW + 1);

    drawPerimeterFrame(ctx, rx, wallTopY, rw, wallH + rh, doorStartX, doorEndX, wallThick);

    const extTopY = frontWallY + halfT;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.20)';
    ctx.fillRect(rx - halfT, extTopY + extH, rw + wallThick, 3);
    ctx.fillStyle = layout.facadeColor || '#e2e8f0';
    ctx.fillRect(rx - halfT + 1, extTopY, rw + wallThick - 2, extH);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(rx - halfT + 1, extTopY + Math.round(extH * 0.44), rw + wallThick - 2, 1);
    ctx.fillStyle = layout.facadeTrim || '#475569';
    ctx.fillRect(rx - halfT + 1, extTopY + extH - 3, rw + wallThick - 2, 3);

    // 南外壁外観窓（玄関ドアと重ならないもの）
    (layout.facadeWindows || []).forEach(fc => {
      const fx = fc * cs;
      if (fx + cs * 0.8 < doorStartX - 3 || fx + cs * 0.2 > doorEndX + 3) {
        drawFacadeWindow(ctx, fx, extTopY, cs, extH, layout);
      }
    });

    // 南側玄関ドア & ウェルカムマット
    const doorFullY = frontWallY - halfT + 1;
    const doorFullH = extH + halfT - 1;
    if (layout.facadeStyle === 'home') {
      ctx.fillStyle = '#451a03';
      ctx.fillRect(doorStartX, doorFullY, doorEndX - doorStartX, doorFullH);
      ctx.fillStyle = '#b45309';
      ctx.fillRect(doorStartX + 2, doorFullY + 1, doorEndX - doorStartX - 4, doorFullH - 2);
      ctx.fillStyle = '#bae6fd';
      ctx.fillRect(Math.round((doorStartX + doorEndX) / 2) - 3, doorFullY + 3, 6, Math.max(3, doorFullH - 8));
      ctx.fillStyle = '#facc15';
      ctx.fillRect(doorEndX - 5, doorFullY + Math.round(doorFullH * 0.52), 2, 2);
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(doorStartX + 1, extTopY + extH + 1, doorEndX - doorStartX - 2, Math.max(3, Math.round(cs * 0.11)));
    } else {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(doorStartX, doorFullY, doorEndX - doorStartX, doorFullH);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(doorStartX + 2, doorFullY + 1, doorEndX - doorStartX - 4, doorFullH - 2);
      ctx.fillStyle = '#bae6fd';
      ctx.fillRect(doorStartX + 3, doorFullY + 2, Math.max(3, Math.floor((doorEndX - doorStartX) * 0.35)), doorFullH - 4);
      ctx.fillStyle = isWideDoor ? '#facc15' : '#e2e8f0';
      ctx.fillRect(Math.round((doorStartX + doorEndX) / 2), doorFullY + 1, 1, doorFullH - 2);
      ctx.fillStyle = layout.level >= 4 ? '#be123c' : '#0284c7';
      ctx.fillRect(doorStartX + 1, extTopY + extH + 1, doorEndX - doorStartX - 2, Math.max(3, Math.round(cs * 0.11)));
    }

    // 7. 実描画境界ベースの 5大リンクホットスポット構築
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

    const cliVisMinX = cliX + cs * 0.16;
    const cliVisMaxX = cliX + cs * 0.84;
    const cliVisMinY = cliY + cs * 0.10;
    const cliVisMaxY = cliY + cs * 0.94;

    const recMinX = Math.min(recDraw.vis.x, cliVisMinX) - 2;
    const recMinY = Math.min(recDraw.vis.y, cliVisMinY) - 2;
    const recMaxX = Math.max(recDraw.vis.x + recDraw.vis.w, cliVisMaxX) + 2;
    const recMaxY = Math.max(recDraw.vis.y + recDraw.vis.h, cliVisMaxY) + 2;

    const bossTopY = Math.min(bossDraw.vis.y, bossCharTopY + 3);
    const bossBotY = bossDraw.vis.y + bossDraw.vis.h;

    const rawHotspots = [
      {
        id: 'bookshelf',
        x: Math.round(bsDraw.vis.x - 2),
        y: Math.round(bsDraw.vis.y - 2),
        w: Math.round(bsDraw.vis.w + 4),
        h: Math.round(bsDraw.vis.h + 4),
        tagX: bsDraw.vis.x + bsDraw.vis.w * 0.5,
        tagY: bsDraw.vis.y + bsDraw.vis.h + 6,
        tagText: snap.furnTotal > 0
          ? `図鑑 ${snap.comboFound + snap.furnFound}/${snap.comboTotal + snap.furnTotal}`
          : `記録帳 ${snap.comboFound}/${snap.comboTotal}`,
        tagColor: '#fbbf24',
        tagUrgent: false
      },
      {
        id: 'calendar',
        x: Math.round(calDraw.vis.x - 3),
        y: Math.round(calDraw.vis.y - 2),
        w: Math.round(calDraw.vis.w + 6),
        h: Math.round(calDraw.vis.h + 5),
        tagX: calDraw.vis.x + calDraw.vis.w * 0.5,
        tagY: calDraw.vis.y + calDraw.vis.h + 7,
        tagText: '月を進める',
        tagColor: isTutAdvance ? '#f59e0b' : '#f472b6',
        tagUrgent: isTutAdvance
      },
      {
        id: 'cabinet',
        x: Math.round(cabDraw.vis.x - 2),
        y: Math.round(cabDraw.vis.y - 2),
        w: Math.round(cabDraw.vis.w + 4),
        h: Math.round(cabDraw.vis.h + 4),
        tagX: cabDraw.vis.x + cabDraw.vis.w * 0.5,
        tagY: cabDraw.vis.y + cabDraw.vis.h + 6,
        tagText: snap.vacantCount > 0 ? `物件(空${snap.vacantCount})` : `物件 ${snap.activeCount}/${snap.maxCap}`,
        tagColor: snap.vacantCount > 0 ? '#fb7185' : '#34d399',
        tagUrgent: snap.vacantCount > 0
      },
      {
        id: 'boss',
        x: Math.round(bossDraw.vis.x - 2),
        y: Math.round(bossTopY),
        w: Math.round(bossDraw.vis.w + 4),
        h: Math.round(bossBotY - bossTopY + 3),
        tagX: bossDraw.vis.x + bossDraw.vis.w * 0.5,
        tagY: bossBotY + 7,
        tagText: '会社経営',
        tagColor: '#facc15',
        tagUrgent: false
      },
      {
        id: 'reception',
        x: Math.round(recMinX),
        y: Math.round(recMinY),
        w: Math.round(recMaxX - recMinX),
        h: Math.round(recMaxY - recMinY),
        tagX: rec.tagXOffset !== undefined
          ? (recDraw.dx + rec.tagXOffset * cs)
          : (recDraw.vis.x + recDraw.vis.w * 0.5),
        tagY: recDraw.vis.y - 9,
        tagText: missionLabelMap[snap.missionMode] || '新規案件',
        tagColor: missionColorMap[snap.missionMode] || '#38bdf8',
        tagUrgent: snap.missionMode === 'result' || isTutStart
      }
    ];

    // 8. チュートリアルスポットライト＆ホバーハイライト
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
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(targetBox.x, targetBox.y, targetBox.w, targetBox.h, 5);
        else ctx.rect(targetBox.x, targetBox.y, targetBox.w, targetBox.h);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 9. スリムガイドピル表示
    hitHotspots = rawHotspots.map(h => {
      let pillRect = null;
      if (guidesEnabled || tutTargetId === h.id) {
        pillRect = drawGuidePill(ctx, h.tagX, h.tagY, h.tagText, h.tagColor, h.tagUrgent, fastTick % 2 === 0);
      }
      return { ...h, pillRect };
    });

    // 10. スタッフ吹き出し
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
        lines: ['💡 初回チュートリアル中', '北壁の「カレンダー／ボード（月を進める）」をタップ！'],
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
