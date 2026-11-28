
  'use strict';
  /* ============================================================
     PLATFORM / OVERLAY DETECTION
  ============================================================ */
  function isPlicyEnvironment() {
    try {
      const host = (window.location && window.location.hostname) || '';
      if (/(^|\.)plicy\.net$/i.test(host)) return true;
      if (document.referrer) {
        const refHost = new URL(document.referrer).hostname || '';
        if (/(^|\.)plicy\.net$/i.test(refHost)) return true;
      }
      if (window.location && window.location.ancestorOrigins) {
        for (const origin of window.location.ancestorOrigins) {
          const originHost = new URL(origin).hostname || '';
          if (/(^|\.)plicy\.net$/i.test(originHost)) return true;
        }
      }
      if (new URLSearchParams(window.location.search).get('plicy') === '1') return true;
    } catch (e) {}
    return false;
  }
  if (isPlicyEnvironment()) {
    document.body.classList.add('is-plicy');
  }

  function syncPlicyHeaderActions() {
    if (!document.body.classList.contains('is-plicy')) return;
    const actions = document.querySelector('.game-header-actions');
    const header = document.querySelector('.game-header');
    const canvasArea = document.querySelector('.canvas-area');
    if (!actions || !header || !canvasArea) return;
    const targetParent = window.innerWidth <= 768 ? canvasArea : header;
    if (actions.parentElement !== targetParent) {
      targetParent.appendChild(actions);
    }
  }
  syncPlicyHeaderActions();

  /* ============================================================
     CONSTANTS
  ============================================================ */
  const GRID = 12;

  // Cell type enum
  const T = {
    EMPTY: 'empty',
    CLOSET: 'closet',
    ENTRANCE: 'entrance',
    CORRIDOR: 'corridor',
    LDK: 'ldk',
    ROOM: 'room',
    BATH: 'bath',
    TOILET: 'toilet',
    WASHROOM: 'washroom',
    GARDEN: 'garden',
    OBSTACLE: 'obstacle',
  };

  // Edge type enum
  const E = {
    NONE: 'none',
    WALL: 'wall',
    DOOR: 'door',
    WINDOW: 'window',
  };

  // Cell rendering styles
  const CELL_STYLE = {
    [T.EMPTY]:    { bg:'#f8fafc', border:'#e2e8f0' },
    [T.ENTRANCE]: { bg:'#fef08a', border:'#facc15' },
    [T.CORRIDOR]: { bg:'#e0f2fe', border:'#7dd3fc' },
    [T.LDK]:      { bg:'#fce7f3', border:'#f9a8d4' },
    [T.ROOM]:     { bg:'#dbeafe', border:'#93c5fd' },
    [T.BATH]:     { bg:'#cffafe', border:'#67e8f9' },
    [T.TOILET]:   { bg:'#f0fdf4', border:'#86efac' },
    [T.WASHROOM]: { bg:'#ecfdf5', border:'#6ee7b7' },
    [T.GARDEN]:   { bg:'#d9f99d', border:'#a3e635' },
    [T.OBSTACLE]: { bg:'#cbd5e1', border:'#94a3b8' },
    [T.CLOSET]: { bg:'#f3f4f6', border:'#d1d5db' },
  };

  // Budget & build cost state
  let budget = 0;
  let buildBaseCost = 0;        // 配置したピースの定価合計 (物件原価・売価基準)
  let buildPiecePaidCost = 0;   // 配置したピースの実支払合計 (割引・反転割増・2周目以降割増込み)
  let buildMirrorExtraCost = 0; // 反転加工による追加費用合計
  let buildCycleExtraCost = 0;  // 山札2周目以降の追加発注割増による費用合計
  let buildWallRemoveCost = 0;  // 赤壁(耐力壁)の有料撤去による費用合計
  let wallRemoveCount = 0;      // 現在のパズル中で撤去した赤壁の回数
  let buildEncroachCost = 0;    // 敷地外・障害物(✕マス)の造成・拡張による費用合計
  let encroachCount = 0;        // 現在のパズル中で造成した✕マスの数
  let buildDemolishCost = 0;    // リノベ既存間取りの解体による費用合計
  let demolishCount = 0;        // 現在のパズル中で解体した既存部屋の数
  let selectedWallTarget = null;// 赤壁撤去の選択中ターゲット { r1, c1, r2, c2, ori, mx, my }
  let selectedDemolishTarget = null; // 解体選択中の既存部屋ターゲット
  let demolishMode = false;     // リノベ解体モードON/OFF
  let hintDismissedForBuild = false; // パズル開始後、一度でも操作したら中央ヒントを再表示しないフラグ
  let buildRerollCost = 0;      // 更新(リロール)・KEEP維持による費用合計
  let deckCycle = 1;            // 現在の山札周回数 (1周目: 1, 2周目: 2, 3周目以降: 3...)

  // Piece library (Starter 11 types + R&D Unlockable 15 types = 26 types)
  // Large/advanced pieces feature bulk-discount per-cell pricing (1マスあたり割安)
  const PIECE_LIB = [
    // --- 初期解放ピース (11種: unlockCost = 0) ---
    { id:'corr-1',    name:'廊下(1)',    cat:T.CORRIDOR, label:'廊下', shape:[[1]],               cost:1.2,  unlockCost:0,   desc:'1マスの隙間を繋ぐ基本廊下 (1.2万/マス)' },
    { id:'corr-i2',   name:'廊下(直2)',  cat:T.CORRIDOR, label:'廊下', shape:[[1,1]],             cost:2.0,  unlockCost:0,   desc:'標準的な2マス直線廊下 (1.0万/マス)' },
    { id:'corr-l',    name:'廊下(L3)',   cat:T.CORRIDOR, label:'廊下', shape:[[1,0],[1,1]],       cost:2.7,  unlockCost:0,   desc:'角を曲がる3マスL字廊下 (0.9万/マス)' },
    { id:'k-1',       name:'キッチン',   cat:T.LDK,      label:'K',    shape:[[1]],               cost:5.0,  unlockCost:0,   desc:'最小1マスK。DKと連結して広々LDK化も可能 (5.0万/マス)' },
    { id:'dk-22',     name:'DK(4)',      cat:T.LDK,      label:'DK',   shape:[[1,1],[1,1]],       cost:20.0, unlockCost:0,   desc:'標準的な2×2ダイニングキッチン (5.0万/マス)' },
    { id:'room-22',   name:'洋室(小4)',  cat:T.ROOM,     label:'洋室', shape:[[1,1],[1,1]],       cost:15.0, unlockCost:0,   desc:'標準的な2×2洋室 (3.75万/マス)' },
    { id:'closet',    name:'収納(1)',    cat:T.CLOSET,   label:'収納', shape:[[1]],               cost:1.5,  unlockCost:0,   desc:'隙間に置ける1マスクローゼット (1.5万/マス)' },
    { id:'toilet',    name:'トイレ',     cat:T.TOILET,   label:'WC',   shape:[[1]],               cost:4.0,  unlockCost:0,   desc:'独立トイレ1マス (4.0万/マス)' },
    { id:'wash',      name:'洗面所',     cat:T.WASHROOM, label:'洗面', shape:[[1]],               cost:6.0,  unlockCost:0,   desc:'独立洗面所1マス (6.0万/マス)' },
    { id:'unit-bath', name:'UB(2)',      cat:T.BATH,     label:'UB',   shape:[[1,1]],             cost:10.0, unlockCost:0,   desc:'1枚で風呂＋トイレを兼ねる省スペースUB (5.0万/マス)' },
    { id:'bath',      name:'浴室(2)',    cat:T.BATH,     label:'浴室', shape:[[1,1]],             cost:12.0, unlockCost:0,   desc:'「風呂・トイレ別」を達成できる独立浴室 (6.0万/マス)' },

    // --- 技術開発（R&D）で解放される大型・特殊ピース (unlockCost > 0) ---
    { id:'corr-i3',   name:'廊下(長3)',  cat:T.CORRIDOR, label:'廊下', shape:[[1,1,1]],           cost:2.7,  unlockCost:80,  desc:'直線3マスを一気に伸ばせる割安廊下 (0.9万/マス)' },
    { id:'closet-2',  name:'WIC収納(2)', cat:T.CLOSET,   label:'収納', shape:[[1,1]],             cost:2.4,  unlockCost:100, desc:'1枚で「収納充実(2マス)」を達成する割安WIC (1.2万/マス)' },
    { id:'room-wa',   name:'和室(4)',    cat:T.ROOM,     label:'和室', shape:[[1,1],[1,1]],       cost:12.0, unlockCost:120, desc:'洋室より3万安く居室数を確保できる2×2和室 (3.0万/マス)' },
    { id:'corr-t',    name:'廊下(T4)',   cat:T.CORRIDOR, label:'廊下', shape:[[1,1,1],[0,1,0]],   cost:3.2,  unlockCost:150, desc:'3方向へ動線を分岐できるハブ廊下 (0.8万/マス)' },
    { id:'corr-s',    name:'広間廊下(4)',cat:T.CORRIDOR, label:'廊下', shape:[[1,1],[1,1]],       cost:3.2,  unlockCost:150, desc:'玄関前の広間や分岐ハブに使える2×2廊下。大ホワイエ狙いにも最適 (0.8万/マス)' },
    { id:'ldk-l',     name:'スリムDK(3)',cat:T.LDK,      label:'DK',   shape:[[1,1,1]],           cost:14.4, unlockCost:140, desc:'細長い3マスDK。大型LDK(2×3)に添えれば3×3化でき変形敷地にも便利 (4.8万/マス)' },
    { id:'room-23',   name:'洋室(中6)',  cat:T.ROOM,     label:'洋室', shape:[[1,1,1],[1,1,1]],   cost:20.0, unlockCost:220, desc:'1枚で「広々居室(6マス)」を達成する割安大部屋 (3.3万/マス)' },
    { id:'room-wa2',  name:'和室(中6)',  cat:T.ROOM,     label:'和室', shape:[[1,1,1],[1,1,1]],   cost:16.0, unlockCost:240, desc:'6マス居室をわずか16万で建てられる高コスパ和室 (2.7万/マス)' },
    { id:'bath-wide', name:'大型浴室(4)',cat:T.BATH,     label:'浴室', shape:[[1,1],[1,1]],       cost:20.0, unlockCost:260, desc:'1枚で「セレブ浴室(+4.0万)」＆ゆったり浴室達成 (5.0万/マス)' },
    { id:'ldk-23',    name:'大型LDK(6)', cat:T.LDK,      label:'LDK',  shape:[[1,1,1],[1,1,1]],   cost:26.0, unlockCost:300, desc:'ファミリー・豪邸の主役になる割安6マスLDK (4.3万/マス)' },
    { id:'ldk-33',    name:'特大LDK(9)', cat:T.LDK,      label:'LDK',  shape:[[1,1,1],[1,1,1],[1,1,1]], cost:36.0, unlockCost:350, desc:'1枚で3×3(9マス)を満たす豪邸の主役。対面アイランドやリビングラグの要 (4.0万/マス)' },
  ];
  if (typeof DXStage3 !== 'undefined' && Array.isArray(DXStage3.PIECES)) {
    PIECE_LIB.push(...DXStage3.PIECES);
  }

  const PIECE_MAP = Object.fromEntries(PIECE_LIB.map(p => [p.id, p]));
  const STARTER_UNLOCKED_IDS = PIECE_LIB.filter(p => !p.unlockCost).map(p => p.id);

  // 基礎インフラ固定枠（9枚：事故防止のため変更不可）
  const FIXED_BASE_DECK = [
    'corr-1', 'corr-i2',
    'k-1',
    'room-22', 'room-22',
    'toilet',
    'wash',
    'bath',
    'closet'
  ];

  // 入替可能枠（11枠：基本は同カテゴリ、設備枠①は水回り・収納全般と入替可能）
  const UPGRADE_DECK_SLOTS = [
    { id: 'corr_slot_1',    label: '廊下枠①', cat: T.CORRIDOR, defaultPieceId: 'corr-1' },
    { id: 'corr_slot_2',    label: '廊下枠②', cat: T.CORRIDOR, defaultPieceId: 'corr-l' },
    { id: 'ldk_slot_1',     label: 'LDK枠①',  cat: T.LDK,      defaultPieceId: 'dk-22' },
    { id: 'ldk_slot_2',     label: 'LDK枠②',  cat: T.LDK,      defaultPieceId: 'dk-22' },
    { id: 'room_slot_1',    label: '居室枠①', cat: T.ROOM,     defaultPieceId: 'room-22' },
    { id: 'room_slot_2',    label: '居室枠②', cat: T.ROOM,     defaultPieceId: 'room-22' },
    { id: 'room_slot_3',    label: '居室枠③', cat: T.ROOM,     defaultPieceId: 'room-22' },
    { id: 'utility_slot_1', label: '設備枠①', cat: null, cats: [T.TOILET, T.WASHROOM, T.BATH, T.CLOSET], defaultPieceId: 'toilet' },
    { id: 'bath_slot_1',    label: '浴室枠①', cat: T.BATH,     defaultPieceId: 'unit-bath' },
    { id: 'wash_slot_1',    label: '洗面枠①', cat: T.WASHROOM, defaultPieceId: 'wash' },
    { id: 'closet_slot_1',  label: '収納枠①', cat: T.CLOSET,   defaultPieceId: 'closet' },
  ];

  function isPieceAllowedInSlot(slot, piece) {
    if (!slot || !piece) return false;
    if (Array.isArray(slot.cats) && slot.cats.length > 0) {
      return slot.cats.includes(piece.cat);
    }
    return piece.cat === slot.cat;
  }

  // 自由追加枠（最大 +4枚：解放済みの全カテゴリから自由に追加可能、空枠も可）
  const CUSTOM_DECK_SLOTS_COUNT = 4;

  // ============================================================
  // REQUEST REGISTRY
  // ============================================================
  const REQUEST_REGISTRY = {
    btsep: {
      id: 'btsep', icon: 'ph-shower', color: '#0891b2', text: '風呂・トイレ別',
      fn: counts => !!counts.isBtSeparated
    },
    reach: {
      id: 'reach', icon: 'ph-path', color: '#3b82f6', text: '全部屋へ動線が通っている',
      fn: (counts, bfs) => counts && counts.totalOcc > 0 && counts.totalOcc > (counts.corridor || 0) && bfs && bfs.unreachable === 0
    },
    wash: {
      id: 'wash', icon: 'ph-drop', color: '#059669', text: '洗面所あり',
      fn: counts => counts.washroom > 0
    },
    ldk1_room1: {
      id: 'ldk1_room1', icon: 'ph-couch', color: '#7c3aed', text: '1LDK以上 (LDK+居室1)',
      fn: counts => counts.ldkRooms >= 1 && counts.bedRooms >= 1
    },
    ldk1_room2: {
      id: 'ldk1_room2', icon: 'ph-couch', color: '#7c3aed', text: '2LDK以上 (LDK+居室2)',
      fn: counts => counts.ldkRooms >= 1 && counts.bedRooms >= 2
    },
    ldk2: {
      id: 'ldk2', icon: 'ph-couch', color: '#7c3aed', text: '3LDK以上 (LDK+居室3)',
      fn: counts => counts.ldkRooms >= 1 && counts.bedRooms >= 3
    },
    closet2: {
      id: 'closet2', icon: 'ph-coat-hanger', color: '#f59e0b', text: '収納充実 (2マス以上)',
      fn: counts => (counts.maxClosetSize >= 2) || ((counts.closetCells || 0) >= 2)
    },
    toilet2: {
      id: 'toilet2', icon: 'ph-toilet', color: '#10b981', text: 'トイレ2箇所',
      fn: counts => counts.toilet >= 2
    },
    bed_large: {
      id: 'bed_large', icon: 'ph-bed', color: '#3b82f6', text: '広々居室 (6マス以上)',
      fn: counts => (counts.bedCells || 0) >= 6
    },
    bath2: {
      id: 'bath2', icon: 'ph-bathtub', color: '#0891b2', text: '浴室2つ以上',
      fn: counts => counts.bath >= 2
    },
    wide_ent: {
      id: 'wide_ent', icon: 'ph-door', color: '#b45309', text: 'ワイド玄関 (2マス玄関)',
      fn: (counts, bfs, stage) => {
        const s = stage || STAGE;
        return !!(s && s.entranceCells && s.entranceCells.length >= 2);
      }
    },
    room4: {
      id: 'room4', icon: 'ph-door', color: '#7c3aed', text: '4部屋以上の居室 (和室含む)',
      fn: counts => counts.bedRooms >= 4
    },
    closet4: {
      id: 'closet4', icon: 'ph-package', color: '#f59e0b', text: '大型収納 (4マス以上)',
      fn: counts => (counts.maxClosetSize >= 4) || ((counts.closetCells || 0) >= 4)
    },
    garden_small: {
      id: 'garden_small', icon: 'ph-plant', color: '#16a34a', text: '専用庭あり (庭3マス以上の塊)',
      fn: counts => (counts.maxGardenCluster || 0) >= 3
    },
    garden_large: {
      id: 'garden_large', icon: 'ph-tree', color: '#15803d', text: '広々庭園 (庭6マス以上の塊)',
      fn: counts => (counts.maxGardenCluster || 0) >= 6
    },
    compact_living: {
      id: 'compact_living', icon: 'ph-arrows-in', color: '#0284c7', text: '省スペース設計 (延床12マス以下)',
      fn: counts => (counts.floorCells || 0) <= 12 && counts.floorCells > 0
    },
    reno_no_ng: {
      id: 'reno_no_ng', icon: 'ph-shield-check', color: '#e11d48', text: 'NGコンボをゼロにする',
      fn: counts => (typeof DXStage2 !== 'undefined' && DXStage2.hasNoNegativeCombos) ? DXStage2.hasNoNegativeCombos(counts) : true
    },
    reno_no_ub: {
      id: 'reno_no_ub', icon: 'ph-bathtub', color: '#0891b2', text: '古いUBを撤去し風呂・トイレ別',
      fn: counts => !!counts.isBtSeparated && (counts.unitBathCount || 0) === 0
    },
    'opt-closet': {
      id: 'opt-closet', icon: 'ph-coat-hanger', color: '#f59e0b', text: '収納あり', tier: 'light',
      fn: counts => (counts.maxClosetSize >= 1) || ((counts.closetCells || 0) >= 1)
    },
    'opt-closet2': {
      id: 'opt-closet2', icon: 'ph-coat-hanger', color: '#f59e0b', text: '大容量収納 (3マス以上)', tier: 'standard',
      fn: counts => (counts.maxClosetSize >= 3) || ((counts.closetCells || 0) >= 3)
    },
    'opt-kitchen': {
      id: 'opt-kitchen', icon: 'ph-cooking-pot', color: '#ec4899', text: '自炊キッチンあり (K/DK/LDK)', tier: 'light',
      fn: counts => (counts.ldkCells || 0) >= 1
    },
    'opt-wash': {
      id: 'opt-wash', icon: 'ph-drop', color: '#059669', text: '独立洗面所あり', tier: 'light',
      fn: counts => counts.washroom > 0
    },
    'opt-bath': {
      id: 'opt-bath', icon: 'ph-bathtub', color: '#0891b2', text: 'ゆったり浴室 (4マス以上連結)', tier: 'standard',
      fn: counts => counts.maxBathSize >= 4
    },
    'opt-ldk8': {
      id: 'opt-ldk8', icon: 'ph-arrows-out', color: '#7c3aed', text: '広々LDK (8マス以上)', tier: 'standard',
      fn: counts => counts.ldkCells >= 8
    },
    'opt-housework': {
      id: 'opt-housework', icon: 'ph-washing-machine', color: '#0d9488', text: '家事ラク動線 (LDK↔洗面所直通)', tier: 'light',
      fn: () => hasDirectConnection(grid, T.LDK, T.WASHROOM)
    },
    'opt-circulation': {
      id: 'opt-circulation', icon: 'ph-arrows-clockwise', color: '#0d9488', text: '家事回遊動線 (洗面所↔LDK&廊下2方向通り抜け)', tier: 'expert',
      fn: () => hasCirculationRoute(grid)
    },
    'opt-south': {
      id: 'opt-south', icon: 'ph-sun', color: '#f59e0b', text: '日当たり良好 (南向きLDK)', tier: 'standard',
      fn: () => ldkFacesSouth()
    },
    'opt-plumbing': {
      id: 'opt-plumbing', icon: 'ph-drop', color: '#2563eb', text: '水回り集約 (風呂・トイレ・洗面隣接)', tier: 'expert',
      fn: () => (wetAdjacencyCluster() >= 2)
    },
    'opt-soundproof': {
      id: 'opt-soundproof', icon: 'ph-ear-slash', color: '#64748b', text: '完全防音 (トイレ廊下隔離)', tier: 'expert',
      fn: () => toiletHasCorridor()
    },
    'opt-sunlight': {
      id: 'opt-sunlight', icon: 'ph-sun-dim', color: '#eab308', text: '陽だまりの家 (窓8箇所以上)', tier: 'expert',
      fn: () => countWindows(grid) >= 8
    },
    'opt-foyer': {
      id: 'opt-foyer', icon: 'ph-columns', color: '#b45309', text: '大ホワイエ (玄関前の広間状廊下)', tier: 'expert',
      fn: (counts, bfs) => (hasGrandFoyer(bfs) >= 1)
    },
    'opt-corridor': {
      id: 'opt-corridor', icon: 'ph-arrows-left-right', color: '#0284c7', text: 'ロングコリドー (一直線の長廊下7マス以上)', tier: 'expert',
      fn: (counts, bfs) => hasLongCorridor(bfs)
    },
    'opt-garden': {
      id: 'opt-garden', icon: 'ph-plant', color: '#16a34a', text: '専用庭あり (庭3マス以上の塊)', tier: 'standard',
      fn: counts => (counts.maxGardenCluster || 0) >= 3
    },
    'opt-garden-large': {
      id: 'opt-garden-large', icon: 'ph-tree', color: '#15803d', text: '広々庭園 (庭6マス以上の塊)', tier: 'expert',
      fn: counts => (counts.maxGardenCluster || 0) >= 6
    },
    'opt-washitsu': {
      id: 'opt-washitsu', icon: 'ph-house-line', color: '#059669', text: '和の趣 (和室1室以上)', tier: 'standard',
      fn: () => {
        for (let r=0; r<GRID; r++) {
          for (let c=0; c<GRID; c++) {
            const cell = grid[r][c];
            if (cell && cell.type === T.ROOM && (cell.label === '和室' || cell.pieceLibId === 'room-wa' || cell.pieceLibId === 'room-wa2')) return true;
          }
        }
        return false;
      }
    }
  };
  if (typeof DXStage3 !== 'undefined' && DXStage3.REQUEST_DEFS) {
    Object.assign(REQUEST_REGISTRY, DXStage3.REQUEST_DEFS);
  }

  // ============================================================
  // LOT DEFINITIONS (全18種)
  // ============================================================
  const LOT_DEFINITIONS = {
    // --- スクエア5段階 (25 / 36 / 64 / 100 / 121) ---
    square_xs: {
      name: 'スクエアXS',
      minR: 3, maxR: 7, minC: 3, maxC: 7,
      obstacles: [
        { r: 0, c: 0, w: 12, h: 3 },
        { r: 8, c: 0, w: 12, h: 4 },
        { r: 3, c: 0, w: 3, h: 5 },
        { r: 3, c: 8, w: 4, h: 5 }
      ]
    },
    square_s: {
      name: 'スクエアS',
      minR: 3, maxR: 8, minC: 3, maxC: 8,
      obstacles: [
        { r: 0, c: 0, w: 12, h: 3 },
        { r: 9, c: 0, w: 12, h: 3 },
        { r: 3, c: 0, w: 3, h: 6 },
        { r: 3, c: 9, w: 3, h: 6 }
      ]
    },
    square_m: {
      name: 'スクエアM',
      minR: 2, maxR: 9, minC: 2, maxC: 9,
      obstacles: [
        { r: 0, c: 0, w: 12, h: 2 },
        { r: 10, c: 0, w: 12, h: 2 },
        { r: 2, c: 0, w: 2, h: 8 },
        { r: 2, c: 10, w: 2, h: 8 }
      ]
    },
    square_l: {
      name: 'スクエアL',
      minR: 1, maxR: 10, minC: 1, maxC: 10,
      obstacles: [
        { r: 0, c: 0, w: 12, h: 1 },
        { r: 11, c: 0, w: 12, h: 1 },
        { r: 1, c: 0, w: 1, h: 10 },
        { r: 1, c: 11, w: 1, h: 10 }
      ]
    },
    square_xl: {
      name: 'スクエアXL',
      minR: 1, maxR: 11, minC: 1, maxC: 11,
      obstacles: [
        { r: 0, c: 0, w: 12, h: 1 },
        { r: 1, c: 0, w: 1, h: 11 }
      ]
    },

    // --- 縦長・横長・細長 ---
    micro_pencil: {
      name: 'ペンシル地',
      minR: 1, maxR: 9, minC: 4, maxC: 6,
      entranceSides: ['bottom', 'top'],
      obstacles: [
        { r: 0, c: 0, w: 12, h: 1 },
        { r: 10, c: 0, w: 12, h: 2 },
        { r: 1, c: 0, w: 4, h: 9 },
        { r: 1, c: 7, w: 5, h: 9 }
      ]
    },
    wide_rect: {
      name: '横長区画',
      minR: 3, maxR: 7, minC: 2, maxC: 9,
      obstacles: [
        { r: 0, c: 0, w: 12, h: 3 },
        { r: 8, c: 0, w: 12, h: 4 },
        { r: 3, c: 0, w: 2, h: 5 },
        { r: 3, c: 10, w: 2, h: 5 }
      ]
    },
    narrow_strip: {
      name: 'うなぎの寝床',
      minR: 1, maxR: 10, minC: 4, maxC: 7,
      entranceSides: ['bottom', 'top'],
      obstacles: [
        { r: 0, c: 0, w: 12, h: 1 },
        { r: 11, c: 0, w: 12, h: 1 },
        { r: 1, c: 0, w: 4, h: 10 },
        { r: 1, c: 8, w: 4, h: 10 }
      ]
    },

    // --- 変形地 (小〜大) ---
    mini_l: {
      name: '片欠け区画',
      minR: 3, maxR: 8, minC: 3, maxC: 8,
      obstacles: [
        { r: 0, c: 0, w: 12, h: 3 },
        { r: 9, c: 0, w: 12, h: 3 },
        { r: 3, c: 0, w: 3, h: 6 },
        { r: 3, c: 9, w: 3, h: 6 },
        { r: 3, c: 7, w: 2, h: 2 }
      ]
    },
    convex_t: {
      name: '凸型区画',
      minR: 2, maxR: 8, minC: 2, maxC: 9,
      obstacles: [
        { r: 0, c: 0, w: 12, h: 2 },
        { r: 9, c: 0, w: 12, h: 3 },
        { r: 2, c: 0, w: 2, h: 7 },
        { r: 2, c: 10, w: 2, h: 7 },
        { r: 2, c: 2, w: 2, h: 3 },
        { r: 2, c: 8, w: 2, h: 3 }
      ]
    },
    crank: {
      name: 'クランク区画',
      minR: 2, maxR: 9, minC: 1, maxC: 9,
      obstacles: [
        { r: 0, c: 0, w: 12, h: 2 },
        { r: 10, c: 0, w: 12, h: 2 },
        { r: 2, c: 0, w: 1, h: 8 },
        { r: 2, c: 10, w: 2, h: 8 },
        { r: 2, c: 1, w: 3, h: 3 },
        { r: 7, c: 7, w: 3, h: 3 }
      ]
    },
    flag_lot: {
      name: '旗竿地',
      minR: 1, maxR: 10, minC: 2, maxC: 9,
      entranceSides: ['bottom'],
      obstacles: [
        { r: 0, c: 0, w: 12, h: 1 },
        { r: 11, c: 0, w: 12, h: 1 },
        { r: 1, c: 0, w: 2, h: 10 },
        { r: 1, c: 10, w: 2, h: 10 },
        { r: 7, c: 2, w: 3, h: 4 },
        { r: 7, c: 7, w: 3, h: 4 }
      ]
    },
    corner_cut: {
      name: '隅切り角地',
      minR: 2, maxR: 9, minC: 2, maxC: 9,
      obstacles: [
        { r: 0, c: 0, w: 12, h: 2 },
        { r: 10, c: 0, w: 12, h: 2 },
        { r: 2, c: 0, w: 2, h: 8 },
        { r: 2, c: 10, w: 2, h: 8 },
        { r: 2, c: 7, w: 3, h: 1 },
        { r: 3, c: 8, w: 2, h: 1 },
        { r: 4, c: 9, w: 1, h: 1 }
      ]
    },
    l_shape: {
      name: 'L字区画',
      minR: 1, maxR: 10, minC: 1, maxC: 10,
      obstacles: [
        { r: 0, c: 0, w: 12, h: 1 },
        { r: 11, c: 0, w: 12, h: 1 },
        { r: 1, c: 0, w: 1, h: 10 },
        { r: 1, c: 11, w: 1, h: 10 },
        { r: 1, c: 7, w: 4, h: 4 }
      ]
    },
    u_shape: {
      name: 'コの字区画',
      minR: 1, maxR: 10, minC: 1, maxC: 10,
      obstacles: [
        { r: 0, c: 0, w: 12, h: 1 },
        { r: 11, c: 0, w: 12, h: 1 },
        { r: 1, c: 0, w: 1, h: 10 },
        { r: 1, c: 11, w: 1, h: 10 },
        { r: 1, c: 4, w: 4, h: 4 }
      ]
    },
    hourglass: {
      name: 'くびれ区画',
      minR: 1, maxR: 10, minC: 1, maxC: 10,
      obstacles: [
        { r: 0, c: 0, w: 12, h: 1 },
        { r: 11, c: 0, w: 12, h: 1 },
        { r: 1, c: 0, w: 1, h: 10 },
        { r: 1, c: 11, w: 1, h: 10 },
        { r: 5, c: 1, w: 3, h: 2 },
        { r: 5, c: 8, w: 3, h: 2 }
      ]
    },
    courtyard: {
      name: 'ロの字敷地',
      minR: 1, maxR: 10, minC: 1, maxC: 10,
      obstacles: [
        { r: 0, c: 0, w: 12, h: 1 },
        { r: 11, c: 0, w: 12, h: 1 },
        { r: 1, c: 0, w: 1, h: 10 },
        { r: 1, c: 11, w: 1, h: 10 },
        { r: 5, c: 5, w: 2, h: 2 }
      ]
    },
    grand_step: {
      name: '雁行区画',
      minR: 1, maxR: 11, minC: 1, maxC: 11,
      obstacles: [
        { r: 0, c: 0, w: 12, h: 1 },
        { r: 1, c: 0, w: 1, h: 11 },
        { r: 1, c: 1, w: 3, h: 3 },
        { r: 9, c: 9, w: 3, h: 3 }
      ]
    }
  };
  // 旧キー互換エイリアス
  LOT_DEFINITIONS.tiny_square = LOT_DEFINITIONS.square_xs;
  LOT_DEFINITIONS.compact_square = LOT_DEFINITIONS.square_s;
  LOT_DEFINITIONS.compact_rect = LOT_DEFINITIONS.wide_rect;
  LOT_DEFINITIONS.standard = LOT_DEFINITIONS.square_l;
  LOT_DEFINITIONS.mansion = LOT_DEFINITIONS.square_xl;
  LOT_DEFINITIONS.compact = LOT_DEFINITIONS.square_s;

  function pickEntranceForLot(lot, allowWide = false) {
    const isObstacle = (r, c) => {
      for (const obs of lot.obstacles) {
        if (r >= obs.r && r < obs.r + (obs.h || 1) && c >= obs.c && c < obs.c + (obs.w || 1)) {
          return true;
        }
      }
      return false;
    };

    let preferredSides = ['bottom'];
    if (Array.isArray(lot.entranceSides) && lot.entranceSides.length > 0) {
      if (lot.entranceSides.length === 1) {
        preferredSides = [...lot.entranceSides];
      } else {
        const primary = lot.entranceSides[0];
        const alt = lot.entranceSides[1 + Math.floor(Math.random() * (lot.entranceSides.length - 1))];
        preferredSides = Math.random() < 0.85 ? [primary, alt] : [alt, primary];
      }
    } else {
      const sideRoll = Math.random();
      if (sideRoll < 0.70) preferredSides = ['bottom'];
      else if (sideRoll < 0.80) preferredSides = ['top', 'bottom'];
      else if (sideRoll < 0.90) preferredSides = ['left', 'bottom'];
      else preferredSides = ['right', 'bottom'];
    }

    for (const side of preferredSides) {
      const candidates = [];
      if (side === 'bottom') {
        const r = lot.maxR;
        for (let c = lot.minC + 1; c <= lot.maxC - (allowWide ? 1 : 0); c++) {
          if (!isObstacle(r, c) && (!allowWide || !isObstacle(r, c + 1))) {
            candidates.push(allowWide ? [{ r, c }, { r, c: c + 1 }] : [{ r, c }]);
          }
        }
      } else if (side === 'top') {
        const r = lot.minR;
        for (let c = lot.minC + 1; c <= lot.maxC - (allowWide ? 1 : 0); c++) {
          if (!isObstacle(r, c) && (!allowWide || !isObstacle(r, c + 1))) {
            candidates.push(allowWide ? [{ r, c }, { r, c: c + 1 }] : [{ r, c }]);
          }
        }
      } else if (side === 'left') {
        const c = lot.minC;
        for (let r = lot.minR + 1; r <= lot.maxR - (allowWide ? 1 : 0); r++) {
          if (!isObstacle(r, c) && (!allowWide || !isObstacle(r + 1, c))) {
            candidates.push(allowWide ? [{ r, c }, { r: r + 1, c }] : [{ r, c }]);
          }
        }
      } else if (side === 'right') {
        const c = lot.maxC;
        for (let r = lot.minR + 1; r <= lot.maxR - (allowWide ? 1 : 0); r++) {
          if (!isObstacle(r, c) && (!allowWide || !isObstacle(r + 1, c))) {
            candidates.push(allowWide ? [{ r, c }, { r: r + 1, c }] : [{ r, c }]);
          }
        }
      }

      if (candidates.length > 0) {
        const picked = candidates[Math.floor(Math.random() * candidates.length)];
        return { cells: picked, facing: side };
      }
    }
    return { cells: allowWide ? [{ r: lot.maxR, c: lot.minC + 1 }, { r: lot.maxR, c: lot.minC + 2 }] : [{ r: lot.maxR, c: lot.minC + 1 }], facing: 'bottom' };
  }

  /* ============================================================
     COMPANY UPGRADES & STAFF SYSTEM CONFIG
  ============================================================ */
  const UPGRADE_CONFIG = {
    sales: [
      { level: 1, name: '町の小さな設計所', mult: 1.0,  cost: 0,   desc: '希望家賃 ×1.0' },
      { level: 2, name: '地元で話題の事務所', mult: 1.15, cost: 300, desc: '希望家賃 +15%' },
      { level: 3, name: 'エリア屈指の実力派', mult: 1.30, cost: 800, desc: '希望家賃 +30%' },
      { level: 4, name: '有名アーキテクト',   mult: 1.45, cost: 1800,desc: '希望家賃 +45%' },
      { level: 5, name: '一流デザインファーム', mult: 1.60, cost: 4000,desc: '希望家賃 +60%' },
    ],
    brand: [
      { level: 1, name: '無名・開業直後',   cost: 0,   desc: '単身 70% / DINKS 30%' },
      { level: 2, name: '口コミの広まり',   cost: 400, desc: '単身 45% / DINKS 40% / ファミリー 15%' },
      { level: 3, name: 'メディア掲載',     cost: 1000,desc: '単身 25% / DINKS 40% / ファミリー 25% / 豪邸 10%' },
      { level: 4, name: '業界の注目株',     cost: 2500,desc: '単身 15% / DINKS 30% / ファミリー 35% / 豪邸 20%' },
      { level: 5, name: 'プレステージ',     cost: 5000,desc: '単身 10% / DINKS 20% / ファミリー 40% / 豪邸 30%' },
    ],
    // 本社オフィス（タウンホール / 会社規模）
    office: [
      {
        level: 0,
        name: '個人事務所',
        basePrice: 0,
        minPrice: 0,
        maxDesks: 0,
        maxCapacityLevel: 0,
        maxSalesLevel: 1,
        maxBrandLevel: 1,
        missions: null,
        desc: '自宅兼事務所。'
      },
      {
        level: 1,
        name: '地元事務所',
        basePrice: 1200,
        minPrice: 300,
        maxDesks: 1,
        maxCapacityLevel: 1,
        maxSalesLevel: 2,
        maxBrandLevel: 2,
        missions: [
          { type: 'cleared', label: '施工実績', target: 6, discount: 300, unit: '件' },
          { type: 'netCombos', label: '設計品質', target: 12, discount: 300, unit: '個' },
          { type: 'earnedRent', label: '賃貸実績', target: 500, discount: 300, unit: '万' }
        ],
        desc: '雑居ビルの1室。'
      },
      {
        level: 2,
        name: '駅前オフィス',
        basePrice: 3000,
        minPrice: 800,
        maxDesks: 2,
        maxCapacityLevel: 2,
        maxSalesLevel: 3,
        maxBrandLevel: 3,
        missions: [
          { type: 'cleared', label: '施工実績', target: 14, discount: 700, unit: '件' },
          { type: 'netCombos', label: '設計品質', target: 35, discount: 700, unit: '個' },
          { type: 'earnedRent', label: '賃貸実績', target: 1800, discount: 800, unit: '万' }
        ],
        desc: '駅前の自社フロア。'
      },
      {
        level: 3,
        name: '本格スタジオ',
        basePrice: 7000,
        minPrice: 2000,
        maxDesks: 3,
        maxCapacityLevel: 3,
        maxSalesLevel: 4,
        maxBrandLevel: 4,
        missions: [
          { type: 'cleared', label: '施工実績', target: 25, discount: 1600, unit: '件' },
          { type: 'netCombos', label: '設計品質', target: 75, discount: 1600, unit: '個' },
          { type: 'earnedRent', label: '賃貸実績', target: 5000, discount: 1800, unit: '万' }
        ],
        desc: 'デザインスタジオ。'
      },
      {
        level: 4,
        name: '本社自社ビル',
        basePrice: 16000,
        minPrice: 5000,
        maxDesks: 4,
        maxCapacityLevel: 4,
        maxSalesLevel: 5,
        maxBrandLevel: 5,
        missions: [
          { type: 'cleared', label: '施工実績', target: 40, discount: 3500, unit: '件' },
          { type: 'netCombos', label: '設計品質', target: 130, discount: 3500, unit: '個' },
          { type: 'earnedRent', label: '賃貸実績', target: 12000, discount: 4000, unit: '万' }
        ],
        desc: '自社ビル。'
      }
    ],
    // 執務デスク増設（スタッフ雇用枠）
    desks: [
      { slot: 1, cost: 150, reqOfficeLevel: 1, name: 'デスク1席目増設' },
      { slot: 2, cost: 350, reqOfficeLevel: 2, name: 'デスク2席目増設' },
      { slot: 3, cost: 700, reqOfficeLevel: 3, name: 'デスク3席目増設' },
      { slot: 4, cost: 1500, reqOfficeLevel: 4, name: 'デスク4席目増設' }
    ],
    // 管理システム導入（管理戸数キャパシティ）
    capacity: [
      { level: 0, capacity: 4,  cost: 0,    name: '台帳管理',       desc: '管理 4棟' },
      { level: 1, capacity: 7,  cost: 150,  name: 'PC管理システム',   desc: '管理 7棟' },
      { level: 2, capacity: 11, cost: 350,  name: 'クラウド管理システム', desc: '管理 11棟' },
      { level: 3, capacity: 16, cost: 800,  name: '自社管理サーバー',   desc: '管理 16棟' },
      { level: 4, capacity: 22, cost: 1500, name: '自社管理センター',   desc: '管理 22棟' }
    ],
    features: {
      freeFlip: {
        id: 'freeFlip',
        name: '反転加工設備',
        icon: 'ph-arrows-left-right',
        levels: [
          { level: 0, name: '外注特注加工', cost: 0,   reqOfficeLevel: 0, mult: 1.2, desc: '反転 +20%' },
          { level: 1, name: '簡易反転治具', cost: 250, reqOfficeLevel: 1, mult: 1.1, desc: '反転 +10%' },
          { level: 2, name: '自社反転ライン', cost: 500, reqOfficeLevel: 2, mult: 1.0, desc: '反転 無料' }
        ]
      },
      extraRerolls: {
        id: 'extraRerolls',
        name: '無料破棄枠',
        icon: 'ph-arrows-clockwise',
        levels: [
          { level: 0, name: '標準資材手配', cost: 0,   reqOfficeLevel: 0, bonus: 0, desc: '無料破棄 5個' },
          { level: 1, name: '迅速手配網 Lv.1', cost: 200, reqOfficeLevel: 1, bonus: 1, desc: '無料破棄 6個' },
          { level: 2, name: '迅速手配網 Lv.2', cost: 350, reqOfficeLevel: 2, bonus: 2, desc: '無料破棄 7個' },
          { level: 3, name: '直通物流網 Lv.3', cost: 600, reqOfficeLevel: 3, bonus: 3, desc: '無料破棄 8個' }
        ]
      },
      extraAttempts: {
        id: 'extraAttempts',
        name: '再設計保険',
        icon: 'ph-shield-check',
        levels: [
          { level: 0, name: '基本保証のみ', cost: 0,   reqOfficeLevel: 0, bonus: 0, desc: 'やり直し 2回' },
          { level: 1, name: '設計やり直し保険 Lv.1', cost: 400, reqOfficeLevel: 1, bonus: 1, desc: 'やり直し 3回' },
          { level: 2, name: '総合設計補償 Lv.2',     cost: 800, reqOfficeLevel: 3, bonus: 2, desc: 'やり直し 4回' }
        ]
      },
      handSize: {
        id: 'handSize',
        name: '設計テーブル拡張',
        icon: 'ph-columns',
        levels: [
          { level: 0, name: '標準デスク', cost: 0,   reqOfficeLevel: 0, slots: 3, desc: '手札 3枚' },
          { level: 1, name: 'ワイド設計デスク Lv.1', cost: 350, reqOfficeLevel: 1, slots: 4, desc: '手札 4枚' },
          { level: 2, name: '大型図面テーブル Lv.2', cost: 750, reqOfficeLevel: 3, slots: 5, desc: '手札 5枚' }
        ]
      }
    }
  };

  const BRAND_DISTRIBUTIONS = {
    1: { single: 70, dinks: 30, family: 0,  mansion: 0 },
    2: { single: 45, dinks: 40, family: 15, mansion: 0 },
    3: { single: 25, dinks: 40, family: 25, mansion: 10 },
    4: { single: 15, dinks: 30, family: 35, mansion: 20 },
    5: { single: 10, dinks: 20, family: 40, mansion: 30 },
  };

  const RECRUIT_AD_COST = 30.0;    // 初回(0人時)求人広告掲載費（30万円）
  const RECRUIT_SCOUT_COST = 50.0; // 初回(0人時)即時スカウト費（50万円）
  const RECRUIT_MAINT_COST = 15.0; // 求人広告の月次掲載維持費（15万円/月）

  function getRecruitAdCost(hiredCount = null) {
    const cnt = hiredCount !== null ? hiredCount : (GameState?.company?.hiredStaff?.length || 0);
    const table = [30.0, 60.0, 100.0, 150.0];
    return table[Math.min(cnt, table.length - 1)];
  }

  function getRecruitScoutCost(hiredCount = null) {
    const cnt = hiredCount !== null ? hiredCount : (GameState?.company?.hiredStaff?.length || 0);
    const table = [50.0, 100.0, 160.0, 240.0];
    return table[Math.min(cnt, table.length - 1)];
  }

  const STAFF_SKILL_DEFS = {
    broker: {
      name: '資材調達',
      icon: 'ph-package',
      desc: [
        '全ピースの購入コストが 5% 割引',
        '全ピースの購入コストが 10% 割引',
        '全ピースの購入コストが 15% 割引'
      ],
      salary: [0.6, 2.0, 4.8]
    },
    plumber: {
      name: '水回り設計',
      icon: 'ph-wrench',
      desc: [
        '水回りコスト10%引 ＆ 集約家賃ボーナス+0.3万/月',
        '水回りコスト20%引 ＆ 集約家賃ボーナス+0.6万/月',
        '水回りコスト30%引 ＆ 集約家賃ボーナス+1.0万/月'
      ],
      salary: [0.7, 2.2, 5.0]
    },
    space_designer: {
      name: '空間デザイン',
      icon: 'ph-compass-tool',
      desc: [
        'LDKセルの基本家賃利回り評価が +10% 向上',
        'LDKセルの基本家賃利回り評価が +20% 向上',
        'LDKセルの基本家賃利回り評価が +30% 向上'
      ],
      salary: [0.8, 2.4, 5.2]
    },
    storage_master: {
      name: '収納・管理',
      icon: 'ph-archive-box',
      desc: [
        '収納コスト30%引 ＆ 収納物件の退去リスク -1.0%',
        '収納コスト50%引 ＆ 収納物件の退去リスク -2.0%',
        '収納コスト無料 ＆ 収納物件の退去リスク -3.5%'
      ],
      salary: [0.6, 2.0, 4.6]
    },
    negotiator: {
      name: '営業交渉',
      icon: 'ph-briefcase',
      desc: [
        '目標家賃超過による不満ペナルティを 30% 軽減',
        '目標家賃超過による不満ペナルティを 50% 軽減',
        '目標家賃超過による不満ペナルティを 75% 軽減'
      ],
      salary: [0.8, 2.5, 5.5]
    },
    listener: {
      name: '顧客リレーション',
      icon: 'ph-ear',
      desc: [
        '任意オプション達成の満足度加算が約1.4倍（標準+7%/こだわり+10%）',
        '任意オプション達成の満足度加算が約2.0倍（標準+10%/こだわり+14%）',
        '任意オプション達成の満足度加算が約2.6倍（標準+14%/こだわり+18%）'
      ],
      salary: [0.6, 2.0, 4.8]
    },
    concierge: {
      name: 'ホスピタリティ',
      icon: 'ph-bell-ringing',
      desc: [
        '全物件の初期満足度 +4%（退去ゼロ期間が4ヶ月延長）',
        '全物件の初期満足度 +8%（退去ゼロ期間が8ヶ月延長）',
        '全物件の初期満足度 +12%（退去ゼロ期間が12ヶ月延長）'
      ],
      salary: [0.8, 2.4, 5.2]
    },
    recycle: {
      name: '中古調達',
      icon: 'ph-arrows-clockwise',
      desc: [
        '無料リロール枠 +1回 ＆ リロール費用 30% 割引',
        '無料リロール枠 +2回 ＆ リロール費用 50% 割引',
        '無料リロール枠 +3回 ＆ リロール費用 70% 割引'
      ],
      salary: [0.5, 1.8, 4.2]
    },
    hand_refresh: {
      name: '戦術手札',
      icon: 'ph-cards',
      desc: [
        'パズル中、1回だけ手札を山札に戻して引き直せる',
        'パズル中、2回まで手札を山札に戻して引き直せる',
        'パズル中、3回まで手札を山札に戻して引き直せる'
      ],
      salary: [0.7, 2.2, 5.0]
    },
    loan_negotiator: {
      name: '金利交渉',
      icon: 'ph-bank',
      desc: [
        '銀行融資の月次利息支払いが 15% 割引',
        '銀行融資の月次利息支払いが 30% 割引',
        '銀行融資の月次利息支払いが 50% 割引'
      ],
      salary: [0.5, 1.8, 4.4]
    },
    property_manager: {
      name: '物件管理',
      icon: 'ph-buildings',
      desc: [
        '卓越した管理手腕で、会社の管理戸数上限が +2棟 拡大',
        '卓越した管理手腕で、会社の管理戸数上限が +4棟 拡大',
        '卓越した管理手腕で、会社の管理戸数上限が +7棟 拡大'
      ],
      salary: [0.7, 2.3, 5.0]
    }
  };

  const STAFF_NAMES = {
    family: ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤', '吉田', '山田', '佐々木', '山口', '松本', '井上', '木村', '林', '斎藤', '清水'],
    given: ['大和', '蓮', '悠真', '陽翔', '湊', '陸', '颯真', '拓海', '健太', '翔太', '葵', '陽菜', '結衣', 'さくら', '凛', '結菜', '美咲', '美羽', '芽依', '愛']
  };
  const STAFF_AVATARS = ['👨‍💼', '👩‍💼', '🧑‍💼', '👨‍💻', '👩‍💻', '🧑‍🎨', '👨‍🔧', '👩‍🔬', '🤵', '📐'];

  function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function getStaffSkillLevel(skillId) {
    if (!GameState?.company?.hiredStaff) return 0;
    let maxLv = 0;
    for (const staff of GameState.company.hiredStaff) {
      if (Array.isArray(staff.skills)) {
        for (const s of staff.skills) {
          if (s.id === skillId) {
            maxLv = Math.max(maxLv, s.level || 1);
          }
        }
      }
      if (staff.id === skillId) {
        maxLv = Math.max(maxLv, 1);
      }
    }
    return maxLv;
  }

  function hasStaffBuff(skillId) {
    return getStaffSkillLevel(skillId) > 0;
  }

  function getOptionalReqBonus(opt) {
    if (!opt) return 5;
    const optDef = (typeof REQUEST_REGISTRY !== 'undefined' && REQUEST_REGISTRY[opt.id]) ? REQUEST_REGISTRY[opt.id] : opt;
    const tier = optDef.tier || opt.tier || 'standard';
    const listLv = getStaffSkillLevel('listener');
    if (tier === 'light') {
      return [3, 4, 6, 8][listLv] || 3;
    } else if (tier === 'expert') {
      return [7, 10, 14, 18][listLv] || 7;
    } else { // standard
      return [5, 7, 10, 14][listLv] || 5;
    }
  }

  function getOptionalReqText(opt) {
    if (!opt) return '';
    const cleanText = (opt.text || '').replace(/\s*\(満足度\+\d+%\)/g, '').trim();
    const optBonusPct = getOptionalReqBonus(opt);
    return `${cleanText} (満足度+${optBonusPct}%)`;
  }

  function generateCandidateStaff(officeLevel = 1) {
    const familyNames = STAFF_NAMES.family;
    const givenNames = STAFF_NAMES.given;
    const fullName = `${familyNames[Math.floor(Math.random() * familyNames.length)]} ${givenNames[Math.floor(Math.random() * givenNames.length)]}`;
    const avatar = STAFF_AVATARS[Math.floor(Math.random() * STAFF_AVATARS.length)];
    
    const skillKeys = Object.keys(STAFF_SKILL_DEFS);
    const roll = Math.random();
    let rank = 'assistant';
    
    if (officeLevel <= 1) {
      rank = roll < 0.85 ? 'assistant' : 'specialist';
    } else if (officeLevel === 2) {
      if (roll < 0.30) rank = 'assistant';
      else if (roll < 0.80) rank = 'specialist';
      else rank = 'expert';
    } else {
      if (roll < 0.10) rank = 'assistant';
      else if (roll < 0.50) rank = 'specialist';
      else rank = 'expert';
    }
    
    const shuffledKeys = shuffleArray(skillKeys);
    let chosenSkills = [];
    let baseSalary = 0.3;
    let rankLabel = 'アシスタント';
    let roleName = '設計アシスタント';
    let stars = '★';

    if (rank === 'assistant') {
      rankLabel = 'アシスタント';
      stars = '★';
      baseSalary = 0.3;
      const k = shuffledKeys[0];
      chosenSkills.push({ id: k, level: 1 });
      const def = STAFF_SKILL_DEFS[k];
      roleName = `${def ? def.name : '設計'}補佐`;
    } else if (rank === 'specialist') {
      rankLabel = 'スペシャリスト';
      stars = '★★';
      baseSalary = 0.6;
      const subRoll = Math.random();
      if (subRoll < 0.5) {
        const k = shuffledKeys[0];
        chosenSkills.push({ id: k, level: 2 });
        roleName = `${STAFF_SKILL_DEFS[k] ? STAFF_SKILL_DEFS[k].name : '設計'}主任`;
      } else {
        chosenSkills.push({ id: shuffledKeys[0], level: 1 });
        chosenSkills.push({ id: shuffledKeys[1], level: 1 });
        roleName = '設計・営業チーフ';
      }
    } else {
      rankLabel = 'エキスパート';
      stars = '★★★';
      baseSalary = 1.0;
      const subRoll = Math.random();
      if (subRoll < 0.4) {
        const k = shuffledKeys[0];
        chosenSkills.push({ id: k, level: 3 });
        roleName = `${STAFF_SKILL_DEFS[k] ? STAFF_SKILL_DEFS[k].name : '総合'}統括`;
      } else if (subRoll < 0.8) {
        chosenSkills.push({ id: shuffledKeys[0], level: 2 });
        chosenSkills.push({ id: shuffledKeys[1], level: 2 });
        roleName = 'シニアパートナー';
      } else {
        chosenSkills.push({ id: shuffledKeys[0], level: 2 });
        chosenSkills.push({ id: shuffledKeys[1], level: 2 });
        chosenSkills.push({ id: shuffledKeys[2], level: 1 });
        roleName = 'チーフエグゼクティブ';
      }
    }

    let skillSalaryTotal = 0;
    for (const cs of chosenSkills) {
      const def = STAFF_SKILL_DEFS[cs.id];
      if (def && def.salary) {
        skillSalaryTotal += def.salary[cs.level - 1] || 0.6;
      }
    }
    const totalSalary = Math.round((baseSalary + skillSalaryTotal) * 10) / 10;

    return {
      id: 'staff_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
      name: fullName,
      avatar: avatar,
      rank: rank,
      rankLabel: rankLabel,
      stars: stars,
      role: roleName,
      salary: totalSalary,
      skills: chosenSkills
    };
  }

  function generateCandidateBatch(count = 3, officeLevel = 1) {
    const list = [];
    for (let i = 0; i < count; i++) {
      list.push(generateCandidateStaff(officeLevel));
    }
    return list;
  }

  function getFeatureLevel(key) {
    const val = GameState?.company?.features?.[key];
    if (key === 'freeFlip') {
      if (val === true) return 2;
      if (val === false || !val) return 0;
      return Math.min(2, Math.max(0, Number(val) || 0));
    }
    if (key === 'extraRerolls') {
      return Math.min(3, Math.max(0, Number(val) || 0));
    }
    if (key === 'extraAttempts') {
      return Math.min(2, Math.max(0, Number(val) || 0));
    }
    if (key === 'handSize') {
      return Math.min(2, Math.max(0, Number(val) || 0));
    }
    return Number(val) || 0;
  }

  function getMaxAttempts() {
    return 2 + getFeatureLevel('extraAttempts');
  }

  function getMaxHandSlots() {
    return 3 + getFeatureLevel('handSize');
  }

  // ============================================================
  // STEP C (案B): 個性派・特注コンボ顧客定義 (ブランドLvに応じて登場)
  // ※ セリフと必須条件＋特注コンボを必ず1対1で一致させる
  // ============================================================
  const SPECIAL_CLIENT_TEMPLATES = [
    {
      id: 'bath_maniac',
      minBrand: 2,
      clientType: 'single',
      lotPool: ['square_s', 'wide_rect', 'mini_l', 'convex_t'],
      client: {
        name: '湯川 哲郎',
        avatar: '🛁',
        quote: '「帰宅したら玄関を開けて即お湯に飛び込みたい！夢のお風呂を頼みます！」',
        typeBadge: '風呂マニア'
      },
      reqKeys: ['btsep', 'reach'],
      optKeys: ['opt-closet'],
      initialBudget: 1350,
      targetRent: 6.2,
      maxTurns: 11,
      customCombo: {
        name: '玄関直風呂',
        normalBonus: -2.0,
        customBonus: 3.5,
        isNegativeInversion: true,
        hint: '玄関と浴室を直結ドアで繋ぐ (+3.5万 / 初代満足度も好転)'
      }
    },
    {
      id: 'dining_toilet',
      minBrand: 2,
      clientType: 'dinks',
      lotPool: ['square_s', 'square_m', 'wide_rect', 'corner_cut'],
      client: {
        name: '便座 崇',
        avatar: '🧻',
        quote: '「食後の移動ゼロが究極の時短！リビングからすぐ入れるトイレにしてください！」',
        typeBadge: 'トイレ評論家'
      },
      reqKeys: ['ldk1_room1', 'btsep', 'reach'],
      optKeys: ['opt-wash'],
      initialBudget: 2650,
      targetRent: 10.2,
      maxTurns: 14,
      customCombo: {
        name: '食欲減退',
        normalBonus: -3.0,
        customBonus: 4.5,
        isNegativeInversion: true,
        hint: 'LDKとトイレを直結ドアで繋ぐ (+4.5万 / 初代満足度も好転)'
      }
    },
    {
      id: 'shinobi_secret',
      minBrand: 3,
      clientType: 'single',
      lotPool: ['square_m', 'narrow_strip', 'l_shape'],
      client: {
        name: '霧隠 翔',
        avatar: '🥷',
        quote: '「収納の奥に誰も気づかぬ秘密の部屋を忍ばせてほしい。外からは見破られぬようにな！」',
        typeBadge: '現代の忍'
      },
      reqKeys: ['closet2', 'btsep', 'reach'],
      optKeys: ['opt-kitchen'],
      initialBudget: 1950,
      targetRent: 8.0,
      maxTurns: 14,
      customCombo: {
        name: '隠し部屋',
        normalBonus: 1.5,
        customBonus: 5.5,
        isNegativeInversion: false,
        hint: '収納経由でのみ入れる居室を作る (+5.5万)'
      }
    },
    {
      id: 'dracul_dark',
      minBrand: 3,
      clientType: 'dinks',
      lotPool: ['square_m', 'square_l', 'l_shape'],
      client: {
        name: 'ドラクル伯爵',
        avatar: '🧛',
        quote: '「日の光は苦手でね…光も扉も届かぬ完全な暗闇の密室を用意してくれたまえ。私だけは入れるから問題ないよ。」',
        typeBadge: '吸血鬼'
      },
      reqKeys: ['btsep', 'ldk1_room1'], // 特注例外: 全部屋動線(reach)を外す
      optKeys: ['opt-bath'],
      initialBudget: 3200,
      targetRent: 12.5,
      maxTurns: 16,
      customCombo: {
        name: '封印されし闇',
        normalBonus: 5.0,
        customBonus: 8.5,
        isNegativeInversion: false,
        allowUnreachable: true,
        hint: '到達不能かつ窓なしの密室を作る (+8.5万 / 壁抜け特注免除)'
      }
    },
    {
      id: 'sento_daimyo',
      minBrand: 3,
      clientType: 'family',
      lotPool: ['square_l', 'square_xl', 'u_shape'],
      client: {
        name: '富士山 豪',
        avatar: '♨️',
        quote: '「家の中心に大銭湯を構えたいのじゃ！広々とした湯舟こそ人生！」',
        typeBadge: '銭湯大名'
      },
      reqKeys: ['btsep', 'wash', 'reach'],
      optKeys: ['opt-bath'],
      initialBudget: 4800,
      targetRent: 16.5,
      maxTurns: 20,
      customCombo: {
        name: 'もはや銭湯',
        normalBonus: 4.0,
        customBonus: 7.5,
        isNegativeInversion: false,
        hint: '浴室を8マス以上連結させる (+7.5万)'
      }
    },
    {
      id: 'infinity_sennin',
      minBrand: 4,
      clientType: 'family',
      lotPool: ['square_l', 'square_xl', 'courtyard'],
      client: {
        name: '永田 ループ',
        avatar: '🧘',
        quote: '「廊下をぐるりと一周つなげてくれぬか？果てなく歩きながら瞑想したいのじゃ。」',
        typeBadge: '仙人・哲学者'
      },
      reqKeys: ['ldk1_room2', 'btsep', 'reach'],
      optKeys: ['opt-circulation'],
      initialBudget: 5400,
      targetRent: 18.0,
      maxTurns: 20,
      customCombo: {
        name: '無限回廊',
        normalBonus: 1.5,
        customBonus: 6.5,
        isNegativeInversion: false,
        hint: '廊下をループ状（環状）に連結させる (+6.5万)'
      }
    },
    {
      id: 'mystery_writer',
      minBrand: 2,
      clientType: 'dinks',
      lotPool: ['square_m', 'square_l', 'narrow_strip', 'l_shape'],
      client: {
        name: '綾辻 霧人',
        avatar: '🕵️',
        quote: '「新作の密室トリックの舞台にしたいんだ！部屋の奥にまた部屋が続く、迷宮みたいな造りで頼むよ！」',
        typeBadge: 'ミステリー作家'
      },
      reqKeys: ['ldk1_room2', 'btsep', 'reach'],
      optKeys: ['opt-closet'],
      initialBudget: 2700,
      targetRent: 10.5,
      maxTurns: 15,
      customCombo: {
        name: 'マトリョーシカ',
        normalBonus: -1.0,
        customBonus: 5.0,
        isNegativeInversion: true,
        hint: '居室を3室以上連続で通り抜ける構造を作る (+5.0万 / 初代満足度も好転)'
      }
    }
  ];
  if (typeof DXStage3 !== 'undefined' && Array.isArray(DXStage3.SPECIAL_CLIENTS)) {
    SPECIAL_CLIENT_TEMPLATES.push(...DXStage3.SPECIAL_CLIENTS);
  }

  function generateStage(level = 0, overrideType = null, specialTemplate = null, stageOpts = null) {
    let clientType = 'single';
    let lotKey = 'square_s';
    let allowWide = false;

    const pickFrom = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const pickSingleLot = () => pickFrom(['square_xs', 'square_s', 'micro_pencil', 'mini_l', 'wide_rect', 'narrow_strip', 'convex_t']);
    const pickDinksLot = () => pickFrom(['square_s', 'square_m', 'narrow_strip', 'wide_rect', 'convex_t', 'crank', 'corner_cut', 'flag_lot', 'square_l', 'l_shape', 'u_shape']);
    const pickFamilyLot = () => pickFrom(['square_m', 'square_l', 'corner_cut', 'crank', 'l_shape', 'u_shape', 'hourglass', 'courtyard', 'square_xl']);
    const pickMansionLot = () => pickFrom(['square_xl', 'grand_step', 'courtyard', 'hourglass', 'u_shape', 'l_shape']);

    if (specialTemplate) {
      clientType = specialTemplate.clientType;
      const validPool = (specialTemplate.lotPool || []).filter(k => LOT_DEFINITIONS[k]);
      lotKey = validPool.length > 0 ? pickFrom(validPool) : pickSingleLot();
      allowWide = clientType === 'mansion';
    } else if (overrideType) {
      clientType = overrideType;
      if (clientType === 'single') {
        lotKey = pickSingleLot();
        allowWide = false;
      } else if (clientType === 'dinks') {
        lotKey = pickDinksLot();
        allowWide = false;
      } else if (clientType === 'family') {
        lotKey = pickFamilyLot();
        allowWide = (lotKey === 'square_xl' && Math.random() < 0.5);
      } else { // mansion
        lotKey = pickMansionLot();
        allowWide = true;
      }
    } else if (level === 0) {
      clientType = 'single';
      lotKey = Math.random() < 0.5 ? 'square_xs' : 'square_s';
      allowWide = false;
    } else if (level === 1) {
      clientType = 'dinks';
      lotKey = 'square_m';
      allowWide = false;
    } else if (level === 2) {
      clientType = 'family';
      lotKey = Math.random() < 0.5 ? 'l_shape' : 'u_shape';
      allowWide = false;
    } else {
      const roll = Math.random();
      const mansionChance = Math.min(0.35, 0.10 + (level - 3) * 0.04);
      if (roll < 0.25) {
        clientType = 'single';
        lotKey = pickSingleLot();
      } else if (roll < 0.55) {
        clientType = 'dinks';
        lotKey = pickDinksLot();
      } else if (roll < 0.55 + (1 - 0.55 - mansionChance)) {
        clientType = 'family';
        lotKey = pickFamilyLot();
        allowWide = (lotKey === 'square_xl' && Math.random() < 0.5);
      } else {
        clientType = 'mansion';
        lotKey = pickMansionLot();
        allowWide = true;
      }
    }

    const lotDef = LOT_DEFINITIONS[lotKey];
    const entInfo = pickEntranceForLot(lotDef, allowWide);
    const entranceCells = entInfo.cells;
    const entranceFacing = entInfo.facing;

    let clientData;
    let reqKeys = [];
    let optKeys = [];
    let initialBudget = 1000;
    let targetRent = 5.0;
    let maxTurns = 12;
    let customComboData = null;

    if (specialTemplate) {
      clientData = { ...specialTemplate.client };
      reqKeys = [...specialTemplate.reqKeys];
      optKeys = [...(specialTemplate.optKeys || [])];
      initialBudget = specialTemplate.initialBudget;
      targetRent = specialTemplate.targetRent;
      maxTurns = specialTemplate.maxTurns;
      customComboData = { ...specialTemplate.customCombo };
    } else if (clientType === 'single') {
      const subRoll = Math.random();
      if (subRoll < 0.28) {
        // ミニマリスト・苦学生 (ユニットバス歓迎・省スペース極小住宅)
        const names = ['草野 陸', '菅原 仁', '成田 陽葵', '西山 蓮'];
        const quotes = [
          '「家賃を極力抑えたいので、ユニットバスでも全然OK！小さくても生活できる部屋を！」',
          '「物を持たないミニマリストです。極小サイズでいいので無駄のない空間をお願いします！」',
          '「家賃最優先です！お風呂とトイレが一緒でも全く気にしません！」'
        ];
        const avatars = ['🎒', '📦', '🚲', '📖'];
        clientData = {
          name: names[Math.floor(Math.random() * names.length)],
          avatar: avatars[Math.floor(Math.random() * avatars.length)],
          quote: quotes[Math.floor(Math.random() * quotes.length)],
          typeBadge: 'ミニマリスト・苦学生'
        };
        reqKeys = ['reach']; // 風呂トイレ別(btsep)を要求しない！UBで格安クリア可能
        optKeys = ['opt-closet'];
        initialBudget = 850.0 + Math.floor(Math.random() * 4) * 50;
        targetRent = 2.8 + Math.floor(Math.random() * 4) * 0.3; // 2.8〜3.7万
        maxTurns = 8;
      } else if (subRoll < 0.52) {
        // 新社会人・学生 (基本1K・BT別)
        const names = ['佐藤 翼', '鈴木 蓮', '高橋 葵', '田中 陽菜'];
        const quotes = [
          '「初めての一人暮らし！風呂とトイレは絶対別で頼みます！」',
          '「家賃控えめで、小さくても暮らしやすい部屋をお願いします！」',
          '「シンプルで無駄のないコンパクトな部屋が希望です。」'
        ];
        const avatars = ['👨‍🎓', '👩‍🎓', '🧑‍💼', '👩‍💼'];
        clientData = {
          name: names[Math.floor(Math.random() * names.length)],
          avatar: avatars[Math.floor(Math.random() * avatars.length)],
          quote: quotes[Math.floor(Math.random() * quotes.length)],
          typeBadge: '新社会人・単身'
        };
        reqKeys = ['btsep', 'reach'];
        optKeys = ['opt-closet'];
        initialBudget = 1000.0 + Math.floor(Math.random() * 5) * 100;
        targetRent = 4.4 + Math.floor(Math.random() * 4) * 0.3; // 4.4〜5.3万
        maxTurns = 10;
      } else if (subRoll < 0.76) {
        // おしゃれ単身 / 在宅ワーカー (収納 or 独立洗面台)
        const isWorker = Math.random() < 0.5;
        const names = isWorker ? ['森下 悠真', '藤原 さくら', '佐々木 凛', '内田 隼人'] : ['伊藤 健太', '渡辺 陸', '早川 玲奈', '三浦 翔'];
        const quotes = isWorker ? [
          '「家でリモートワークをするので、独立洗面台と落ち着ける居室が希望です。」',
          '「生活リズムを整えたいので、洗面所が独立している間取りをお願いします。」'
        ] : [
          '「服や靴がとにかく多いので、しっかりした収納スペースは絶対欲しいです！」',
          '「洋服の整理がしやすいように、しっかりした収納を頼みます！」'
        ];
        const avatars = isWorker ? ['🧑‍💻', '👩‍💻', '🎧', '💻'] : ['👠', '🧥', '🕶️', '👗'];
        clientData = {
          name: names[Math.floor(Math.random() * names.length)],
          avatar: avatars[Math.floor(Math.random() * avatars.length)],
          quote: quotes[Math.floor(Math.random() * quotes.length)],
          typeBadge: isWorker ? '在宅ワーカー' : 'おしゃれ単身'
        };
        reqKeys = isWorker ? ['btsep', 'wash', 'reach'] : ['btsep', 'closet2', 'reach'];
        optKeys = isWorker ? ['opt-closet2'] : ['opt-wash'];
        initialBudget = 1250.0 + Math.floor(Math.random() * 5) * 100;
        targetRent = 5.6 + Math.floor(Math.random() * 4) * 0.4;
        maxTurns = 11;
      } else {
        // 陽だまりカフェ風単身 (南向き採光)
        const names = ['松岡 楓', '杉山 晴斗', '原田 陽向'];
        const quotes = [
          '「休日に日向ぼっこしながらコーヒーを飲みたいので、南向きの明るい部屋がいいな。」',
          '「日当たりが良くて、ゆったりリラックスできる部屋をお願いします。」'
        ];
        const avatars = ['☕', '🌿', '📖'];
        clientData = {
          name: names[Math.floor(Math.random() * names.length)],
          avatar: avatars[Math.floor(Math.random() * avatars.length)],
          quote: quotes[Math.floor(Math.random() * quotes.length)],
          typeBadge: '陽だまり単身'
        };
        reqKeys = ['btsep', 'reach'];
        optKeys = ['opt-south', 'opt-closet'];
        initialBudget = 1200.0 + Math.floor(Math.random() * 5) * 100;
        targetRent = 5.4 + Math.floor(Math.random() * 4) * 0.4;
        maxTurns = 10;
      }
    } else if (clientType === 'dinks') {
      const subRoll = Math.random();
      if (subRoll < 0.22) {
        // 共働きDINKS (2LDK・洗面・家事効率)
        const names = ['小林 結衣', '加藤 大和', '山本 美咲'];
        const quotes = [
          '「朝の身支度が被るので、独立洗面所と2部屋以上の独立空間が欲しいですね。」',
          '「二人暮らしなので、ゆったりしたLDKと寝室が必要です。」'
        ];
        const avatars = ['👨‍💼', '👩‍💻', '🧑‍💼'];
        clientData = {
          name: names[Math.floor(Math.random() * names.length)],
          avatar: avatars[Math.floor(Math.random() * avatars.length)],
          quote: quotes[Math.floor(Math.random() * quotes.length)],
          typeBadge: '共働きDINKS'
        };
        reqKeys = ['ldk1_room2', 'btsep', 'wash', 'reach'];
        optKeys = ['opt-housework'];
        initialBudget = 2500.0 + Math.floor(Math.random() * 8) * 100;
        targetRent = 8.5 + Math.floor(Math.random() * 6) * 0.4;
      } else if (subRoll < 0.44) {
        // 趣味・収納重視カップル
        const names = ['中村 拓海', '斉藤 翔太', '大野 奈央'];
        const quotes = [
          '「二人の荷物が入る大きめ収納と、広々くつろげるLDKを頼みます！」',
          '「趣味の道具が多いので大きめの収納と、落ち着けるLDKがいいな。」'
        ];
        const avatars = ['🧑‍🎨', '🎨', '📸'];
        clientData = {
          name: names[Math.floor(Math.random() * names.length)],
          avatar: avatars[Math.floor(Math.random() * avatars.length)],
          quote: quotes[Math.floor(Math.random() * quotes.length)],
          typeBadge: '趣味重視DINKS'
        };
        reqKeys = ['ldk1_room1', 'closet2', 'reach'];
        optKeys = ['opt-closet2'];
        initialBudget = 2400.0 + Math.floor(Math.random() * 8) * 100;
        targetRent = 8.2 + Math.floor(Math.random() * 6) * 0.4;
      } else if (subRoll < 0.62) {
        // 快適空間重視 (完全防音)
        const names = ['吉岡 涼介', '竹内 杏奈', '岡田 優一'];
        const quotes = [
          '「お互いの時間を大切にしたいので、居室を広めに取った快適な2LDKで！」',
          '「プライバシーに配慮して、トイレの音が寝室に響かない間取りを希望します。」'
        ];
        const avatars = ['👨‍🔬', '👩‍🔬', '🎧'];
        clientData = {
          name: names[Math.floor(Math.random() * names.length)],
          avatar: avatars[Math.floor(Math.random() * avatars.length)],
          quote: quotes[Math.floor(Math.random() * quotes.length)],
          typeBadge: '快適重視DINKS'
        };
        reqKeys = ['ldk1_room2', 'btsep', 'wash', 'reach'];
        optKeys = ['opt-soundproof', 'opt-ldk8'];
        initialBudget = 2700.0 + Math.floor(Math.random() * 8) * 100;
        targetRent = 9.2 + Math.floor(Math.random() * 6) * 0.4;
      } else if (subRoll < 0.76) {
        // 陽だまりカフェ風DINKS
        const names = ['星野 蓮', '水野 茜', '長澤 悠太'];
        const quotes = [
          '「休日は二人で明るいリビングでくつろぎたいので、南向きLDKと窓の多さにこだわりたいです。」',
          '「光と風がたっぷり通る、開放感あるLDKをお願いします！」'
        ];
        const avatars = ['🌞', '🥐', '☕'];
        clientData = {
          name: names[Math.floor(Math.random() * names.length)],
          avatar: avatars[Math.floor(Math.random() * avatars.length)],
          quote: quotes[Math.floor(Math.random() * quotes.length)],
          typeBadge: '陽だまりDINKS'
        };
        reqKeys = ['ldk1_room1', 'wash', 'reach'];
        optKeys = ['opt-south', 'opt-sunlight'];
        initialBudget = 2650.0 + Math.floor(Math.random() * 8) * 100;
        targetRent = 9.5 + Math.floor(Math.random() * 6) * 0.4;
      } else if (subRoll < 0.88) {
        // 和モダン・落ち着き重視カップル
        const names = ['桐谷 健', '白川 琴音', '梶原 惣一'];
        const quotes = [
          '「フローリングだけでなく、ごろんと横になれる和室とゆったりお風呂が欲しいな。」',
          '「和洋折衷の落ち着いた空間で暮らしたいです。和室を設けていただけますか？」'
        ];
        const avatars = ['🍵', '👘', '🎍'];
        clientData = {
          name: names[Math.floor(Math.random() * names.length)],
          avatar: avatars[Math.floor(Math.random() * avatars.length)],
          quote: quotes[Math.floor(Math.random() * quotes.length)],
          typeBadge: '和モダンDINKS'
        };
        reqKeys = ['ldk1_room2', 'btsep', 'wash', 'reach'];
        optKeys = ['opt-washitsu', 'opt-bath'];
        initialBudget = 2800.0 + Math.floor(Math.random() * 8) * 100;
        targetRent = 9.8 + Math.floor(Math.random() * 6) * 0.4;
      } else {
        // シニア夫婦
        const names = ['白石 茂・和子', '大塚 邦夫・節子', '松井 孝雄・富子'];
        const quotes = [
          '「夫婦二人で穏やかに暮らせる、和室と専用庭のある落ち着いた住まいが希望です。」',
          '「セカンドライフをのんびり楽しみたいので、日当たりの良い空間と和室をお願いします。」'
        ];
        const avatars = ['👵', '🍵', '🪴'];
        clientData = {
          name: names[Math.floor(Math.random() * names.length)],
          avatar: avatars[Math.floor(Math.random() * avatars.length)],
          quote: quotes[Math.floor(Math.random() * quotes.length)],
          typeBadge: 'シニア夫婦'
        };
        reqKeys = ['ldk1_room1', 'btsep', 'wash', 'reach'];
        optKeys = ['opt-washitsu', 'opt-garden'];
        initialBudget = 2700.0 + Math.floor(Math.random() * 8) * 100;
        targetRent = 9.0 + Math.floor(Math.random() * 6) * 0.4;
      }
      maxTurns = 15;
    } else if (clientType === 'family') {
      const subRoll = Math.random();
      if (subRoll < 0.20) {
        // 子育てファミリー標準
        const names = ['吉田 夫婦', '松本 浩二', '井上 恵美'];
        const quotes = [
          '「子ども部屋と大きなLDK、家族みんなでくつろげる家を！家事がスムーズに回る回遊動線が希望です。」',
          '「朝の支度や家事がスムーズに回るよう、洗面脱衣所を通り抜けられる回遊動線をお願いします！」'
        ];
        const avatars = ['👨‍👩‍👧', '👨‍👩‍👦', '👨‍👩‍👧‍👦'];
        clientData = {
          name: names[Math.floor(Math.random() * names.length)],
          avatar: avatars[Math.floor(Math.random() * avatars.length)],
          quote: quotes[Math.floor(Math.random() * quotes.length)],
          typeBadge: '子育てファミリー'
        };
        reqKeys = ['ldk2', 'wash', 'reach'];
        optKeys = ['opt-bath', 'opt-circulation'];
        initialBudget = 3800.0 + Math.floor(Math.random() * 10) * 100;
        targetRent = 12.0 + Math.floor(Math.random() * 6) * 0.5;
      } else if (subRoll < 0.40) {
        // 大家族・トイレ渋滞対策
        const names = ['木村 達也', '清水 健一', '長谷川 誠'];
        const quotes = [
          '「朝のトイレ争奪戦が本当に大変で…トイレは2つ設置してほしいです！」',
          '「家族が多いので、トイレ2箇所と独立洗面所が必須条件です！」'
        ];
        const avatars = ['👨‍👩‍👧‍👦', '🧑‍🤝‍🧑', '🏡'];
        clientData = {
          name: names[Math.floor(Math.random() * names.length)],
          avatar: avatars[Math.floor(Math.random() * avatars.length)],
          quote: quotes[Math.floor(Math.random() * quotes.length)],
          typeBadge: '大家族ファミリー'
        };
        reqKeys = ['ldk1_room2', 'toilet2', 'wash', 'reach'];
        optKeys = ['opt-closet2', 'opt-soundproof'];
        initialBudget = 3900.0 + Math.floor(Math.random() * 10) * 100;
        targetRent = 12.8 + Math.floor(Math.random() * 6) * 0.5;
      } else if (subRoll < 0.60) {
        // 庭付き郊外ファミリー (専用庭3マス以上)
        const names = ['小川 健司', '森下 浩平', '望月 さやか'];
        const quotes = [
          '「子どもが庭でプール遊びや家庭菜園ができるように、専用の庭を作ってください！」',
          '「外の風を感じられる暮らしを。敷地内に専用の庭スペースを確保してください。」'
        ];
        const avatars = ['🏡', '🌱', '🎈'];
        clientData = {
          name: names[Math.floor(Math.random() * names.length)],
          avatar: avatars[Math.floor(Math.random() * avatars.length)],
          quote: quotes[Math.floor(Math.random() * quotes.length)],
          typeBadge: '庭付き郊外ファミリー'
        };
        reqKeys = ['ldk1_room2', 'garden_small', 'wash', 'reach'];
        optKeys = ['opt-bath', 'opt-garden'];
        initialBudget = 4000.0 + Math.floor(Math.random() * 10) * 100;
        targetRent = 13.0 + Math.floor(Math.random() * 6) * 0.5;
      } else if (subRoll < 0.80) {
        // 陽だまり育児ハウス (南向きリビング & 窓多数)
        const names = ['坂本 裕樹', '安藤 舞子', '西田 翔太'];
        const quotes = [
          '「子どもたちが明るい光の中で遊べるよう、南向きリビングとたくさんの窓を希望します！」',
          '「日当たりの良いリビングで家族の団らんを過ごしたいです。」'
        ];
        const avatars = ['🌻', '🧒', '🏡'];
        clientData = {
          name: names[Math.floor(Math.random() * names.length)],
          avatar: avatars[Math.floor(Math.random() * avatars.length)],
          quote: quotes[Math.floor(Math.random() * quotes.length)],
          typeBadge: '陽だまりファミリー'
        };
        reqKeys = ['ldk1_room2', 'closet2', 'wash', 'reach'];
        optKeys = ['opt-south', 'opt-sunlight'];
        initialBudget = 4000.0 + Math.floor(Math.random() * 10) * 100;
        targetRent = 13.5 + Math.floor(Math.random() * 6) * 0.5;
      } else {
        // 二世帯同居・和モダン / ゆとりファミリー
        const isWashitsu = Math.random() < 0.5;
        const names = isWashitsu ? ['杉本 宗治', '藤木 泰造', '原田 雅江'] : ['野村 拓也', '浅野 智子', '大橋 慶介'];
        const quotes = isWashitsu ? [
          '「親世代との同居なので、落ち着ける和室と足を伸ばせる大きなお風呂を作ってください！」',
          '「世代を超えて快適に住める家を。落ち着く和室とゆとりある水回りを頼みます。」'
        ] : [
          '「成長とともに増える荷物をすっきりしまえる大収納と、配管がまとまった水回りを！」',
          '「片付けやすく家事もしやすい、機能美あふれる広々LDKの家を。」'
        ];
        const avatars = isWashitsu ? ['👴', '👵', '🍵'] : ['📦', '🧰', '🛋️'];
        clientData = {
          name: names[Math.floor(Math.random() * names.length)],
          avatar: avatars[Math.floor(Math.random() * avatars.length)],
          quote: quotes[Math.floor(Math.random() * quotes.length)],
          typeBadge: isWashitsu ? '二世帯和風ファミリー' : '収納充実ファミリー'
        };
        reqKeys = isWashitsu ? ['ldk2', 'toilet2', 'reach'] : ['ldk2', 'closet2', 'wash', 'reach'];
        optKeys = isWashitsu ? ['opt-washitsu', 'opt-bath'] : ['opt-plumbing', 'opt-ldk8'];
        initialBudget = 4200.0 + Math.floor(Math.random() * 10) * 100;
        targetRent = 14.2 + Math.floor(Math.random() * 6) * 0.5;
      }
      maxTurns = 18;
    } else { // mansion
      const subRoll = Math.random();
      if (subRoll < 0.22) {
        // 1. 設備特注豪邸 (風呂2・トイレ2・水回り集約)
        const names = ['西園寺 龍之介', '神宮寺 秀明', '白鳥 惣一郎'];
        const quotes = [
          '「家賃は惜しみません。浴室複数にトイレ2つ、配管も美しくまとめてくれたまえ。」',
          '「妥協なき設計を。最高級の水回り設備とゆとりの空間美を期待しています。」'
        ];
        const avatars = ['🤵', '💎', '👑'];
        clientData = {
          name: names[Math.floor(Math.random() * names.length)],
          avatar: avatars[Math.floor(Math.random() * avatars.length)],
          quote: quotes[Math.floor(Math.random() * quotes.length)],
          typeBadge: '設備特注豪邸'
        };
        reqKeys = ['ldk2', 'bath2', 'toilet2', 'reach'];
        optKeys = ['opt-bath', 'opt-plumbing'];
        initialBudget = 5800.0 + Math.floor(Math.random() * 15) * 100;
        targetRent = 19.5 + Math.floor(Math.random() * 8) * 0.6;
        maxTurns = 24;
      } else if (subRoll < 0.44) {
        // 2. 庭園邸宅レジデンス (大庭園6マス以上 & 和モダン)
        const names = ['藤堂 隆成', '白川 宗憲', '鷹司 雅之'];
        const quotes = [
          '「四季の移ろいを愛でる広大な庭園と、庭園を望む格式ある和室を所望する。」',
          '「日本の自然美を邸内に宿す名邸を。広大な庭園と落ち着いた和の佇まいを期待している。」'
        ];
        const avatars = ['🌲', '🏯', '🍵'];
        clientData = {
          name: names[Math.floor(Math.random() * names.length)],
          avatar: avatars[Math.floor(Math.random() * avatars.length)],
          quote: quotes[Math.floor(Math.random() * quotes.length)],
          typeBadge: '庭園邸宅レジデンス'
        };
        reqKeys = ['ldk2', 'garden_large', 'reach'];
        optKeys = ['opt-washitsu', 'opt-garden-large'];
        initialBudget = 6300.0 + Math.floor(Math.random() * 15) * 100;
        targetRent = 21.5 + Math.floor(Math.random() * 8) * 0.6;
        maxTurns = 24;
      } else if (subRoll < 0.66) {
        // 3. 美食サロン邸宅 (大LDK & 家事回遊動線)
        const names = ['一条 麗子', '綾小路 薫', '神崎 エリザベス'];
        const quotes = [
          '「大勢の賓客を招いて料理を振る舞える広大なサロン空間と、贅沢な家事回遊動線を頼みます。」',
          '「ホームパーティーを最高のものにしたいの。広大なサロンと使いやすい回遊動線を！」'
        ];
        const avatars = ['🥂', '🍷', '💃'];
        clientData = {
          name: names[Math.floor(Math.random() * names.length)],
          avatar: avatars[Math.floor(Math.random() * avatars.length)],
          quote: quotes[Math.floor(Math.random() * quotes.length)],
          typeBadge: '美食サロン邸宅'
        };
        reqKeys = ['ldk1_room2', 'closet2', 'wash', 'reach'];
        optKeys = ['opt-ldk8', 'opt-circulation'];
        initialBudget = 6400.0 + Math.floor(Math.random() * 15) * 100;
        targetRent = 23.0 + Math.floor(Math.random() * 8) * 0.6;
        maxTurns = 24;
      } else if (subRoll < 0.85) {
        // 4. 迎賓館レジデンス (大ホワイエ & 完全防音)
        const names = ['鳳凰寺 晴彦', '皇 冴子', '真壁 伯爵'];
        const quotes = [
          '「玄関を開けた瞬間に圧倒される広大なエントランスホールと、来客に配慮した防音設計を！」',
          '「一流の館には一流の迎賓空間が必要だ。贅沢なホワイエとプライバシーを両立してくれたまえ。」'
        ];
        const avatars = ['🏛️', '🎩', '👑'];
        clientData = {
          name: names[Math.floor(Math.random() * names.length)],
          avatar: avatars[Math.floor(Math.random() * avatars.length)],
          quote: quotes[Math.floor(Math.random() * quotes.length)],
          typeBadge: '迎賓館レジデンス'
        };
        reqKeys = ['ldk2', 'toilet2', 'reach'];
        optKeys = ['opt-foyer', 'opt-soundproof'];
        initialBudget = 6800.0 + Math.floor(Math.random() * 15) * 100;
        targetRent = 25.0 + Math.floor(Math.random() * 8) * 0.7;
        maxTurns = 25;
      } else {
        // 5. 超弩級メガVIP (ペントハウス・ロングコリドー・最高額家賃)
        const names = ['アレクサンダー・ヴァン', '九条院 麗華', 'エドワード・チェン'];
        const quotes = [
          '「妥協は一切許さない。広大な敷地にすっと伸びる美しい長廊下とパノラマ採光、最高峰の空間設計を。」',
          '「世界基準のレジデンスを求めます。美学と贅を尽くした比類なき設計を期待しています。」'
        ];
        const avatars = ['💎', '🏰', '👑'];
        clientData = {
          name: names[Math.floor(Math.random() * names.length)],
          avatar: avatars[Math.floor(Math.random() * avatars.length)],
          quote: quotes[Math.floor(Math.random() * quotes.length)],
          typeBadge: '超弩級メガVIP'
        };
        reqKeys = ['ldk2', 'bath2', 'toilet2', 'closet2', 'reach'];
        optKeys = ['opt-corridor', 'opt-sunlight'];
        initialBudget = 8500.0 + Math.floor(Math.random() * 20) * 100;
        targetRent = 28.0 + Math.floor(Math.random() * 10) * 0.8; // 28.0〜35.2万 (営業バフで最大50万超！)
        maxTurns = 26;
      }
    }

    const hasBaseKitchenReq = reqKeys.some(k => k === 'ldk1_room1' || k === 'ldk1_room2' || k === 'ldk2');
    if (!hasBaseKitchenReq && !optKeys.includes('opt-kitchen')) {
      optKeys.unshift('opt-kitchen');
    }

    const requests = reqKeys.map(k => ({ ...REQUEST_REGISTRY[k] }));
    const optionalRequests = optKeys.map(k => ({ ...REQUEST_REGISTRY[k] })).filter(Boolean);

    // 営業力強化バフの適用 (Lv 1: +0%, Lv 2: +15%, Lv 3: +30%, Lv 4: +45%, Lv 5: +60%)
    const salesLevel = (GameState && GameState.company && GameState.company.salesLevel) || 1;
    const salesMultiplier = 1.0 + (salesLevel - 1) * 0.15;
    initialBudget = Math.round(initialBudget * salesMultiplier);
    targetRent = Math.round(targetRent * salesMultiplier * 10) / 10;

    let locationData = null;
    if (typeof DXStage2 !== 'undefined' && DXStage2.pickLocationForLot) {
      const opts = stageOpts || {};
      if (opts.forceLocationId) {
        locationData = DXStage2.pickLocationForLot(lotKey, entranceFacing, clientType, {
          forceId: opts.forceLocationId,
          forceSide: opts.forceLocationSide || null
        });
      } else if (opts.allowLocation !== false) {
        const locChance = opts.locationChance !== undefined ? opts.locationChance : (level === 0 ? 0.45 : 0.68);
        if (Math.random() < locChance) {
          locationData = DXStage2.pickLocationForLot(lotKey, entranceFacing, clientType, {
            avoidIds: opts.avoidLocationIds || []
          });
        }
      }
    }

    return {
      id: level + 1,
      name: `${clientData.name} 様の依頼`,
      lotName: lotDef.name,
      lotType: lotKey,
      client: clientData,
      initialBudget: initialBudget,
      targetRent: targetRent,
      maxTurns: maxTurns,
      entranceRow: entranceCells[0].r,
      entranceCol: entranceCells[0].c,
      entranceCells: entranceCells,
      entranceFacing: entranceFacing,
      obstacles: lotDef.obstacles,
      requests: requests,
      optionalRequests: optionalRequests,
      customCombo: customComboData,
      requiredPieceId: (specialTemplate && specialTemplate.requiredPieceId) || null,
      location: locationData,
      renovation: null
    };
  }

  function pickClientTypeByBrand(brandLevel = 1) {
    const dist = BRAND_DISTRIBUTIONS[brandLevel] || BRAND_DISTRIBUTIONS[1];
    const roll = Math.random() * 100;
    if (roll < dist.single) return 'single';
    if (roll < dist.single + dist.dinks) return 'dinks';
    if (roll < dist.single + dist.dinks + dist.family) return 'family';
    return 'mansion';
  }

  function generateMissionPool(level = 0) {
    const pool = [];
    const brandLevel = (GameState && GameState.company && GameState.company.brandLevel) || 1;
    const salesLevel = (GameState && GameState.company && GameState.company.salesLevel) || 1;
    const salesMultiplier = 1.0 + (salesLevel - 1) * 0.15;
    const eligibleSpecials = brandLevel >= 2
      ? SPECIAL_CLIENT_TEMPLATES.filter(t => brandLevel >= t.minBrand && (!t.requiredPieceId || isPieceUnlocked(t.requiredPieceId)))
      : [];
    const usedSpecialIds = new Set();
    const usedLocationIds = [];
    let specialCount = 0;
    let renoCount = 0;
    const maxSpecialInPool = brandLevel >= 4 ? 2 : (brandLevel >= 2 ? 1 : 0);

    for (let i = 0; i < 3; i++) {
      const spChance = brandLevel === 2 ? 0.25 : (brandLevel === 3 ? 0.35 : (brandLevel >= 4 ? 0.40 : 0));
      const candidates = eligibleSpecials.filter(t => !usedSpecialIds.has(t.id));
      if (specialCount < maxSpecialInPool && candidates.length > 0 && Math.random() < spChance) {
        const picked = candidates[Math.floor(Math.random() * candidates.length)];
        usedSpecialIds.add(picked.id);
        specialCount++;
        const stg = generateStage(level, picked.clientType, picked, { allowLocation: false });
        pool.push(stg);
      } else if (renoCount === 0 && level >= 1 && typeof DXStage2 !== 'undefined' && DXStage2.generateRenovationMission && Math.random() < (i === 1 ? 0.45 : 0.25)) {
        const renoStg = DXStage2.generateRenovationMission(level, brandLevel, salesMultiplier);
        if (renoStg) {
          renoCount++;
          if (renoStg.location && renoStg.location.id) usedLocationIds.push(renoStg.location.id);
          pool.push(renoStg);
          continue;
        }
      } else {
        const rollType = pickClientTypeByBrand(brandLevel);
        const allowLoc = (i === 0) ? true : (Math.random() < 0.72);
        const stg = generateStage(level, rollType, null, {
          allowLocation: allowLoc,
          locationChance: i === 0 ? 1.0 : 0.72,
          avoidLocationIds: usedLocationIds
        });
        if (stg.location && stg.location.id) usedLocationIds.push(stg.location.id);
        pool.push(stg);
      }
    }
    return pool;
  }

  function attachRequestFunctions(stage) {
    if (!stage) return;
    if (stage.requests) {
      stage.requests = stage.requests.filter(req => req.id !== 'wide_ent');
      stage.requests.forEach(req => {
        if (REQUEST_REGISTRY[req.id]) {
          req.fn = REQUEST_REGISTRY[req.id].fn;
          req.icon = REQUEST_REGISTRY[req.id].icon;
          req.color = REQUEST_REGISTRY[req.id].color;
          req.text = REQUEST_REGISTRY[req.id].text;
        }
      });
    }
    if (!stage.optionalRequests) stage.optionalRequests = [];
    const hasBaseKitchenReq = (stage.requests || []).some(r => r.id === 'ldk1_room1' || r.id === 'ldk1_room2' || r.id === 'ldk2');
    if (!hasBaseKitchenReq && !stage.optionalRequests.some(o => o.id === 'opt-kitchen') && REQUEST_REGISTRY['opt-kitchen']) {
      stage.optionalRequests.unshift({ ...REQUEST_REGISTRY['opt-kitchen'] });
    }
    if (stage.optionalRequests) {
      stage.optionalRequests.forEach(opt => {
        if (REQUEST_REGISTRY[opt.id]) {
          opt.fn = REQUEST_REGISTRY[opt.id].fn;
          opt.icon = REQUEST_REGISTRY[opt.id].icon;
          opt.color = REQUEST_REGISTRY[opt.id].color;
          opt.text = REQUEST_REGISTRY[opt.id].text;
          opt.tier = REQUEST_REGISTRY[opt.id].tier;
        }
      });
    }
    if (stage.location && stage.location.id && typeof DXStage2 !== 'undefined' && DXStage2.buildLocationPayload) {
      stage.location = DXStage2.buildLocationPayload(stage.location.id, stage.location.side);
    }
    return stage;
  }

  function updateStage() {
    currentLevelIdx = GameState.level;
    if (Array.isArray(GameState.availableMissions)) {
      GameState.availableMissions = GameState.availableMissions.filter(Boolean);
    }
    if (!GameState.currentMission) {
      if (!GameState.availableMissions || GameState.availableMissions.length === 0) {
        GameState.availableMissions = generateMissionPool(currentLevelIdx);
      }
      GameState.currentMission = GameState.availableMissions[0] || generateMissionPool(currentLevelIdx)[0];
      saveGame();
    }
    STAGE = GameState.currentMission;
    attachRequestFunctions(STAGE);
  }

  /* ============================================================
     FIRST-TIME ESCORTED TUTORIAL BLUEPRINT (案A: 最小構成1K・BT別)
  ============================================================ */
  const TUTORIAL_DECK_IDS = ['corr-i2', 'room-22', 'dk-22', 'bath', 'toilet', 'k-1'];
  const TUTORIAL_BATH_WALLS = [
    { r: 0, c: 0, dir: 'top' },
    { r: 0, c: 1, dir: 'top' },
    { r: 0, c: 0, dir: 'bottom' },
    { r: 0, c: 1, dir: 'right' }
  ];
  const TUTORIAL_STEPS = [
    { id: 'place_corr',    slot: 0, targetR: 5, targetC: 5, targetW: 1, targetH: 2, allowedRots: [1, 3],       allowRotate: true,  allowMirror: false, reqMirror: false },
    { id: 'place_room',    slot: 1, targetR: 4, targetC: 6, targetW: 2, targetH: 2, allowedRots: [0, 1, 2, 3], allowRotate: false, allowMirror: false, reqMirror: false },
    { id: 'reroll_hand',   slot: null, isReroll: true,  allowRotate: false, allowMirror: false },
    { id: 'place_bath',    slot: 0, targetR: 4, targetC: 4, targetW: 1, targetH: 2, allowedRots: [1],          allowRotate: true,  allowMirror: true,  reqMirror: true },
    { id: 'place_toilet',  slot: 1, targetR: 6, targetC: 4, targetW: 1, targetH: 1, allowedRots: [0, 1, 2, 3], allowRotate: false, allowMirror: false, reqMirror: false },
    { id: 'place_kitchen', slot: 2, targetR: 6, targetC: 6, targetW: 1, targetH: 1, allowedRots: [0, 1, 2, 3], allowRotate: false, allowMirror: false, reqMirror: false },
    { id: 'finish_build',  slot: null, isFinish: true,  allowRotate: false, allowMirror: false }
  ];
  let tutorialBuildStep = 0;
  let isTutorialPracticeMode = false;
  let tutorialPracticeSnapshot = null;

  function createTutorialStage() {
    const lotDef = LOT_DEFINITIONS.square_xs;
    const reqKeys = ['btsep', 'reach'];
    const optKeys = ['opt-kitchen'];
    return {
      id: 1,
      isTutorial: true,
      name: '佐藤 翼 様の依頼',
      lotName: lotDef.name,
      lotType: 'square_xs',
      client: {
        name: '佐藤 翼',
        avatar: '👨‍🎓',
        quote: '「初めての一人暮らし！お風呂とトイレが別で、暮らしやすい1Kをお願いします！」',
        typeBadge: '初回モデル案件'
      },
      initialBudget: 100.0,
      targetRent: 5.5,
      maxTurns: 10,
      entranceRow: 7,
      entranceCol: 5,
      entranceCells: [{ r: 7, c: 5 }],
      entranceFacing: 'bottom',
      obstacles: lotDef.obstacles,
      requests: reqKeys.map(k => ({ ...REQUEST_REGISTRY[k] })),
      optionalRequests: optKeys.map(k => ({ ...REQUEST_REGISTRY[k] })).filter(Boolean),
      customCombo: null
    };
  }

  function makeTutorialPiece(pieceId, withBathWalls = false) {
    const base = PIECE_MAP[pieceId] || PIECE_LIB[0];
    const p = JSON.parse(JSON.stringify(base));
    p.walls = withBathWalls ? JSON.parse(JSON.stringify(TUTORIAL_BATH_WALLS)) : [];
    p.deckCycle = 1;
    return p;
  }

  function isTutorialPhaseActive() {
    return !!((GameState && GameState.tutorialPhase && GameState.tutorialPhase !== 'done') || isTutorialPracticeMode);
  }

  function isTutorialPuzzleActive() {
    return !!(STAGE && STAGE.isTutorial && isTutorialPhaseActive());
  }

  function getCurrentTutorialStep() {
    if (!isTutorialPuzzleActive()) return null;
    const idx = Math.max(0, Math.min(tutorialBuildStep || 0, TUTORIAL_STEPS.length - 1));
    return TUTORIAL_STEPS[idx];
  }

  function isTutorialHoverAtTarget(step, gr, gc) {
    if (!step || step.targetR === undefined) return false;
    return gr === step.targetR && gc === step.targetC;
  }

  function isTutorialPointInsideTarget(step, cellR, cellC) {
    if (!step || step.targetR === undefined) return false;
    return (
      cellR >= step.targetR &&
      cellR < step.targetR + step.targetH &&
      cellC >= step.targetC &&
      cellC < step.targetC + step.targetW
    );
  }

  function isTutorialOrientationMatch(step, rot = selectedRot, mirrored = isMirrored) {
    if (!step) return true;
    const normRot = ((rot % 4) + 4) % 4;
    if (Array.isArray(step.allowedRots) && !step.allowedRots.includes(normRot)) return false;
    if (step.reqMirror !== undefined && !!mirrored !== !!step.reqMirror) return false;
    return true;
  }

  function isTutorialConfirmAllowed() {
    const step = getCurrentTutorialStep();
    if (!step) return true;
    if (step.isReroll || step.isFinish || step.targetR === undefined) return false;
    if (!hoverCell) return false;
    return isTutorialHoverAtTarget(step, hoverCell.r, hoverCell.c) && isTutorialOrientationMatch(step);
  }

  function getTutorialActionNotice(step) {
    if (!step) return '';
    const normRot = ((selectedRot % 4) + 4) % 4;
    if (step.id === 'place_corr') {
      if (!isTutorialOrientationMatch(step)) return '「回転」で縦向きにしよう';
    } else if (step.id === 'place_bath') {
      if (normRot === 0 || normRot === 2) return '「回転」で縦向きにしよう';
      if (!isMirrored) return '「反転」で壁を左にしよう';
      if (normRot !== 1) return '「回転」で壁の向きを変えよう';
    }
    return '';
  }

  function getTutorialHintText() {
    const step = getCurrentTutorialStep();
    if (!step) return '';
    const normRot = ((selectedRot % 4) + 4) % 4;
    const atTarget = !!(previewMode && hoverCell && isTutorialHoverAtTarget(step, hoverCell.r, hoverCell.c));
    const isDesktop = (typeof window !== 'undefined' && window.matchMedia) ? window.matchMedia('(min-width: 769px)').matches : false;
    const kR = isDesktop ? '[R]' : '';
    const kF = isDesktop ? '[F]' : '';

    if (step.id === 'place_corr') {
      if (!isTutorialOrientationMatch(step)) return `「回転」${kR}で廊下を縦向きに`;
      return atTarget ? '「確定」で廊下を配置' : '隣で接続！玄関の上の光る枠へ';
    }
    if (step.id === 'place_room') {
      return atTarget ? '「確定」で洋室を配置' : '光る枠に洋室を置こう（ドア接続）';
    }
    if (step.id === 'reroll_hand') {
      return isRerollConfirming
        ? 'もう一度「更新」で引き直そう'
        : 'DK不要！「更新(無料)」で入替';
    }
    if (step.id === 'place_bath') {
      if (normRot === 0 || normRot === 2) return `「回転」${kR}で浴室を縦向きに`;
      if (!isMirrored) {
        return normRot === 1
          ? `赤線は壁！「反転」${kF}で左へ逃がそう`
          : `壁が邪魔！「回転」後に「反転」${kF}`;
      }
      if (normRot !== 1) return `壁が廊下側！「回転」${kR}2回で逆に`;
      return atTarget ? '壁回避！「確定」で配置（反転+20%）' : '壁を回避！廊下の左の光る枠へ';
    }
    if (step.id === 'place_toilet') {
      return atTarget ? '「確定」でトイレを配置' : '赤壁の隣は不可！廊下の左へ';
    }
    if (step.id === 'place_kitchen') {
      return atTarget ? '「確定」でキッチンを配置' : '南向きの光る枠にキッチンを';
    }
    if (step.id === 'finish_build') {
      return '1K完成！「設計完了」をタップ';
    }
    return '';
  }

  function setElemSpotlight(el, active) {
    if (!el) return;
    el.classList.toggle('tutorial-spotlight', !!active);
  }

  function setElemLocked(el, locked) {
    if (!el) return;
    el.classList.toggle('tutorial-locked', !!locked);
    if ('disabled' in el) {
      el.disabled = !!locked;
    }
  }

  function syncTutorialPuzzleUI() {
    const active = isTutorialPuzzleActive();
    const btnRotate = document.getElementById('btn-rotate');
    const btnMirror = document.getElementById('btn-mirror');
    const btnReroll = document.getElementById('btn-reroll');
    const btnFinish = document.getElementById('btn-finish');
    const btnRefresh = document.getElementById('btn-hand-refresh');
    const btnConfirmRotate = document.getElementById('btn-confirm-rotate');
    const btnConfirmMirror = document.getElementById('btn-confirm-mirror');
    const btnConfirmPlace = document.getElementById('btn-confirm-place');
    const pcTools = document.getElementById('confirm-pc-tools');

    if (!active) {
      [btnRotate, btnMirror, btnReroll, btnFinish, btnRefresh, btnConfirmRotate, btnConfirmMirror, btnConfirmPlace].forEach(el => {
        if (el) {
          el.classList.remove('tutorial-spotlight', 'tutorial-locked');
        }
      });
      if (pcTools) pcTools.style.display = '';
      if (btnConfirmRotate) btnConfirmRotate.style.display = '';
      if (btnConfirmMirror) btnConfirmMirror.style.display = '';
      return;
    }

    const step = getCurrentTutorialStep();
    if (!step) return;

    if (step.slot !== null && step.slot !== undefined && draftSlots[step.slot]) {
      selectedSlot = step.slot;
    } else {
      selectedSlot = null;
    }

    const normRot = ((selectedRot % 4) + 4) % 4;
    const isStepReady = (step.targetR !== undefined) && isTutorialOrientationMatch(step);
    const needRotate = !!(step.allowRotate && (
      (step.id === 'place_corr' && !isTutorialOrientationMatch(step)) ||
      (step.id === 'place_bath' && (normRot === 0 || normRot === 2 || (!isMirrored && normRot === 3) || (isMirrored && normRot !== 1)))
    ));
    const needMirror = !!(step.allowMirror && step.id === 'place_bath' && normRot === 1 && !isMirrored);

    setElemLocked(btnRefresh, true);
    setElemLocked(btnReroll, !step.isReroll);
    setElemSpotlight(btnReroll, !!step.isReroll);

    setElemLocked(btnFinish, !step.isFinish);
    setElemSpotlight(btnFinish, !!step.isFinish);

    const hasSel = (selectedSlot !== null && !!draftSlots[selectedSlot]);
    setElemLocked(btnRotate, !hasSel || !step.allowRotate);
    setElemSpotlight(btnRotate, needRotate);

    setElemLocked(btnMirror, !hasSel || !step.allowMirror);
    setElemSpotlight(btnMirror, needMirror);

    if (btnConfirmRotate) {
      btnConfirmRotate.style.display = step.allowRotate ? '' : 'none';
      setElemSpotlight(btnConfirmRotate, needRotate);
    }
    if (btnConfirmMirror) {
      btnConfirmMirror.style.display = step.allowMirror ? '' : 'none';
      setElemSpotlight(btnConfirmMirror, needMirror);
    }
    if (pcTools) {
      pcTools.style.display = (step.allowRotate || step.allowMirror) ? '' : 'none';
    }
    setElemSpotlight(btnConfirmPlace, !!(previewMode && hoverCell && isTutorialConfirmAllowed()));
    if (typeof syncHintOverlay === 'function') syncHintOverlay(false);
  }

  /* ============================================================
     COMPANY STATE (Save Data)
  ============================================================ */
  const SAVE_KEY = 'floorplan_pixel_sandbox_v1';
  const GameState = {
    companyName: '焼飯不動産',
    tutorialPhase: 'start_home',
    hasCleared: false,
    clearedMonth: null,
    clearedSnapshot: null,
    funds: 100.0,
    month: 1,
    level: 0,
    attempts: 2,
    currentMission: null,
    availableMissions: [],
    properties: [],
    discovered: {
      combos: [],
      furniture: []
    },
    company: {
      salesLevel: 1,
      brandLevel: 1,
      officeLevel: 0,
      debt: 0,
      emergencyDebt: 0,
      features: {
        freeFlip: 0,
        extraRerolls: 0,
        extraAttempts: 0,
        handSize: 0
      },
      hiredStaff: [],
      unlockedPieces: [...STARTER_UNLOCKED_IDS],
      deck: {
        slotOverrides: {},
        customSlots: [null, null, null, null]
      }
    }
  };

  function ensureDeckState() {
    if (!GameState.company) {
      GameState.company = {
        salesLevel: 1,
        brandLevel: 1,
        officeLevel: 0,
        debt: 0,
        emergencyDebt: 0,
        features: { freeFlip: 0, extraRerolls: 0, extraAttempts: 0, handSize: 0 },
        hiredStaff: [],
        unlockedPieces: [...STARTER_UNLOCKED_IDS],
        deck: { slotOverrides: {}, customSlots: [null, null, null, null] }
      };
    }
    const co = GameState.company;
    if (!co.features) {
      co.features = { freeFlip: 0, extraRerolls: 0, extraAttempts: 0, handSize: 0 };
    } else {
      co.features.freeFlip = getFeatureLevel('freeFlip');
      co.features.extraRerolls = getFeatureLevel('extraRerolls');
      co.features.extraAttempts = getFeatureLevel('extraAttempts');
      co.features.handSize = getFeatureLevel('handSize');
    }
    if (co.emergencyDebt === undefined) co.emergencyDebt = 0;
    if (!Array.isArray(co.unlockedPieces)) {
      co.unlockedPieces = [...STARTER_UNLOCKED_IDS];
    } else {
      for (const sid of STARTER_UNLOCKED_IDS) {
        if (!co.unlockedPieces.includes(sid)) co.unlockedPieces.push(sid);
      }
    }
    if (!co.deck || typeof co.deck !== 'object') {
      co.deck = { slotOverrides: {}, customSlots: [null, null, null, null] };
    }
    if (!co.deck.slotOverrides || typeof co.deck.slotOverrides !== 'object') {
      co.deck.slotOverrides = {};
    }
    if (!Array.isArray(co.deck.customSlots)) {
      co.deck.customSlots = [null, null, null, null];
    }
    while (co.deck.customSlots.length < CUSTOM_DECK_SLOTS_COUNT) {
      co.deck.customSlots.push(null);
    }
    if (co.deck.customSlots.length > CUSTOM_DECK_SLOTS_COUNT) {
      co.deck.customSlots = co.deck.customSlots.slice(0, CUSTOM_DECK_SLOTS_COUNT);
    }
    if (typeof DXDeck !== 'undefined' && typeof DXDeck.ensurePresets === 'function') {
      DXDeck.ensurePresets(co);
    }
  }

  function isPieceUnlocked(pieceId) {
    ensureDeckState();
    const p = PIECE_MAP[pieceId];
    if (!p) return false;
    if (!p.unlockCost || p.unlockCost <= 0) return true;
    return GameState.company.unlockedPieces.includes(pieceId);
  }

  function getActiveDeckPieceIds(overrideDeckObj = null) {
    if (!overrideDeckObj && typeof isTutorialPuzzleActive === 'function' && isTutorialPuzzleActive()) {
      return [...TUTORIAL_DECK_IDS];
    }
    ensureDeckState();
    const co = GameState.company;
    const tempDeck = (!overrideDeckObj && typeof DXDeck !== 'undefined' && typeof DXDeck.getMissionTempDeck === 'function')
      ? DXDeck.getMissionTempDeck()
      : null;
    const deckSrc = overrideDeckObj || tempDeck || co.deck;
    const overrides = (deckSrc && deckSrc.slotOverrides && typeof deckSrc.slotOverrides === 'object')
      ? deckSrc.slotOverrides
      : {};
    const customSlots = (deckSrc && Array.isArray(deckSrc.customSlots))
      ? deckSrc.customSlots
      : [];
    const ids = [...FIXED_BASE_DECK];
    for (const slot of UPGRADE_DECK_SLOTS) {
      const ov = overrides[slot.id];
      if (ov && PIECE_MAP[ov] && isPieceAllowedInSlot(slot, PIECE_MAP[ov]) && isPieceUnlocked(ov)) {
        ids.push(ov);
      } else {
        ids.push(slot.defaultPieceId);
      }
    }
    for (let i = 0; i < CUSTOM_DECK_SLOTS_COUNT; i++) {
      const cid = customSlots[i];
      if (cid && PIECE_MAP[cid] && isPieceUnlocked(cid)) {
        ids.push(cid);
      }
    }
    return ids;
  }

  const MIN_BUILD_FUNDS = 15.0; // 最小限の間取りを建築するために必要な最低運転資金(15万円)

  function calcMarketRent(p, currentMonth = GameState.month) {
    if (!p) return 0;
    const created = p.createdMonth || 1;
    const age = Math.max(0, currentMonth - created);
    // 毎年 8% ずつ減額、最大 60ヶ月(5年)で 40% 減額（底値 60%）
    const discountRatio = Math.min(0.40, (age / 12) * 0.08);
    const base = (p.normalRent !== undefined) ? p.normalRent : (p.rent || 0);
    return Math.max(0.1, Math.round(base * (1 - discountRatio) * 10) / 10);
  }

  // 珍間取りごとの固有デメリット定義（劣化率加算 & 空室再入居率ペナルティ）
  const FUNNY_LAYOUT_PROPS = {
    '水門':             { deg: 0.5, fill: -15 },
    '秘密のトイレ':       { deg: 0.3, fill: -10 },
    'バカデカトイレ':     { deg: 0.3, fill: -5  },
    '隠し部屋':           { deg: 0.4, fill: -10 },
    '無限回廊':           { deg: 0.2, fill: -5  },
    '収納が本体':         { deg: 0.3, fill: -10 },
    'もはや銭湯':         { deg: 0.3, fill: -10 },
    '究極のオープン':     { deg: 0.2, fill: -5  },
    'ガラス張りハウス':   { deg: 0.4, fill: -10 },
    '要塞化':             { deg: 0.5, fill: -20 },
    '封印されし闇':       { deg: 0.5, fill: -20 },
    'もはや公園':         { deg: 0.4, fill: -10 }
  };
  if (typeof DXStage3 !== 'undefined' && DXStage3.FUNNY_LAYOUT_PROPS) {
    Object.assign(FUNNY_LAYOUT_PROPS, DXStage3.FUNNY_LAYOUT_PROPS);
  }

  function calcFillChance(p) {
    if (!p) return 40;
    const rent = (p.rent || p.targetRent || 5);
    // 家賃帯による基礎需要層の違い（安物件は高需要・高額物件はニッチ層）
    let chance = 40;
    if (rent <= 4.0) {
      chance = 75; // 格安・極小単身: 需要が圧倒的（ほぼ即時入居）
    } else if (rent <= 6.0) {
      chance = 60; // 一般単身: 旺盛な需要
    } else if (rent <= 10.0) {
      chance = 45; // DINKS・標準ファミリー: 標準需要
    } else if (rent <= 15.0) {
      chance = 32; // 大型ファミリー: ターゲット層が絞られる
    } else {
      chance = 22; // 高級豪邸: 富裕層限定（空室リスク大）
    }

    // 1. 間取り魅力度 (+3% 〜 +15%)
    const goodCombos = (p.goodCombos !== undefined) ? p.goodCombos : (p.combosList || []).filter(c => c && c.bonus > 0).length;
    chance += goodCombos * 3;

    if (p.satisfiedCount && p.totalRequests && p.satisfiedCount >= p.totalRequests) {
      chance += 5; // 初代依頼全達成ボーナス
    }

    // 2. 欠陥ペナルティ (-15% 〜 -30%)
    if (p.amenityPenalty && p.amenityPenalty > 0) {
      chance -= Math.min(30, p.amenityPenalty);
    }
    const badCombos = (p.badCombos !== undefined) ? p.badCombos : (p.combosList || []).filter(c => c && c.bonus < 0).length;
    if (badCombos > 0) {
      chance -= badCombos * 5;
    }
    // 珍間取りペナルティ（珍間取りは一般市場の入居希望者に敬遠されやすいため再入居率低下）
    if (p.combosList) {
      for (const c of p.combosList) {
        const cName = (typeof c === 'string') ? c : (c && c.name);
        const prop = cName ? FUNNY_LAYOUT_PROPS[cName] : null;
        if (prop && prop.fill) {
          chance += prop.fill;
        }
      }
    }

    // 3. 会社知名度・営業力 (+5% 〜 +25%)
    const brandLv = (GameState && GameState.company && GameState.company.brandLevel) || 1;
    const salesLv = (GameState && GameState.company && GameState.company.salesLevel) || 1;
    chance += (brandLv - 1) * 3 + (salesLv - 1) * 2;

    // 4. 長期空室補正（3ヶ月目以降、+10%/月）
    const vm = p.vacantMonths || 1;
    if (vm >= 3) {
      chance += (vm - 2) * 10;
    }

    return Math.min(95, Math.max(10, Math.round(chance)));
  }

  function getLifetimeStats() {
    if (!GameState.stats) {
      GameState.stats = {
        lifetimeClearedMissions: 0,
        lifetimeEarnedRent: 0,
        lifetimeGoodCombos: 0,
        lifetimeBadCombos: 0
      };
    }
    
    // 現在の所有物件から下限値を保証（セーブデータのマイグレーション対応）
    let currentEarnedRent = 0;
    let currentGoodCombos = 0;
    let currentBadCombos = 0;
    if (Array.isArray(GameState.properties)) {
      for (const p of GameState.properties) {
        currentEarnedRent += (p.earnedRent || 0);
        currentGoodCombos += (p.goodCombos || 0);
        currentBadCombos += (p.badCombos || 0);
      }
    }

    if (GameState.stats.lifetimeEarnedRent < currentEarnedRent) {
      GameState.stats.lifetimeEarnedRent = Math.round(currentEarnedRent * 10) / 10;
    }
    if (GameState.stats.lifetimeGoodCombos < currentGoodCombos) {
      GameState.stats.lifetimeGoodCombos = currentGoodCombos;
    }
    if (GameState.stats.lifetimeBadCombos < currentBadCombos) {
      GameState.stats.lifetimeBadCombos = currentBadCombos;
    }
    const builtCount = Array.isArray(GameState.properties) ? GameState.properties.length : 0;
    if (GameState.stats.lifetimeClearedMissions < builtCount) {
      GameState.stats.lifetimeClearedMissions = builtCount;
    }

    const netCombos = (GameState.stats.lifetimeGoodCombos || 0) - (GameState.stats.lifetimeBadCombos || 0);
    const cleared = GameState.stats.lifetimeClearedMissions || 0;
    const earnedRent = Math.round((GameState.stats.lifetimeEarnedRent || 0) * 10) / 10;
    const goodCombos = GameState.stats.lifetimeGoodCombos || 0;
    const badCombos = GameState.stats.lifetimeBadCombos || 0;

    return {
      cleared: cleared,
      earnedRent: earnedRent,
      goodCombos: goodCombos,
      badCombos: badCombos,
      netCombos: netCombos,
      lifetimeClearedMissions: cleared,
      lifetimeEarnedRent: earnedRent,
      lifetimeGoodCombos: goodCombos,
      lifetimeBadCombos: badCombos
    };
  }

  function getOfficeUpgradeCost(targetLevel) {
    const def = UPGRADE_CONFIG.office[targetLevel];
    if (!def) return 0;
    let price = def.basePrice;
    if (!def.missions) return price;

    const stats = getLifetimeStats();
    def.missions.forEach(m => {
      let currentVal = 0;
      if (m.type === 'cleared') currentVal = stats.cleared;
      else if (m.type === 'netCombos') currentVal = stats.netCombos;
      else if (m.type === 'earnedRent') currentVal = stats.earnedRent;

      if (currentVal >= m.target) {
        price -= m.discount;
      }
    });
    return Math.max(def.minPrice, price);
  }

  function getMaxStaffSlots() {
    const co = GameState && GameState.company;
    return (co && co.deskCount !== undefined) ? co.deskCount : 0;
  }

  function getMaxPropertyCapacity() {
    const co = GameState && GameState.company;
    const capLv = (co && co.capacityLevel !== undefined) ? co.capacityLevel : 0;
    const baseCap = (UPGRADE_CONFIG.capacity && UPGRADE_CONFIG.capacity[capLv]?.capacity) || 4;
    
    // 物件管理主任（property_manager）スキル加算
    const pmLv = getStaffSkillLevel('property_manager');
    let staffBonus = 0;
    if (pmLv === 1) staffBonus = 2;
    else if (pmLv === 2) staffBonus = 4;
    else if (pmLv >= 3) staffBonus = 7;
    
    return baseCap + staffBonus;
  }

  function getActivePropertyCount() {
    return ((GameState && GameState.properties) || []).filter(p => !p.isSold).length;
  }

  function calcCollateralStats() {
    const props = (GameState && GameState.properties) || [];
    let totalCollateral = 0;
    let activeProps = 0;
    let vacantProps = 0;
    for (const p of props) {
      if (p.isSold) continue;
      const stats = calcPropertyStats(p);
      const resale = parseFloat(stats.resaleValue) || 0;
      const isVacant = (p.vacantMonths || 0) > 0 || (p.vacancyTurns || 0) > 0;
      if (isVacant) {
        vacantProps++;
        totalCollateral += resale * 0.5; // 空室時は売価の0.5倍
      } else {
        activeProps++;
        totalCollateral += resale * 2.0; // 入居中は売価の2.0倍
      }
    }
    totalCollateral = Math.round(totalCollateral * 10) / 10;
    return { totalCollateral, activeProps, vacantProps };
  }

  function getMaxLoan() {
    const brandLv = (GameState && GameState.company && GameState.company.brandLevel) || 1;
    const { totalCollateral } = calcCollateralStats();
    // 基本枠100万 + 知名度Lvボーナス((Lv-1)*200万) + 所有物件担保評価額(入居中:売価×2.0 / 空室中:売価×0.5)
    return Math.round((100 + (brandLv - 1) * 200 + totalCollateral) * 10) / 10;
  }

  function getRemainingLoanCapacity() {
    const debt = (GameState && GameState.company && GameState.company.debt) || 0;
    return Math.max(0, Math.round((getMaxLoan() - debt) * 10) / 10);
  }

  function calcMonthlyLoanPayment(debtVal) {
    const d = debtVal !== undefined ? debtVal : ((GameState && GameState.company && GameState.company.debt) || 0);
    if (!d || d <= 0) return { principal: 0, interest: 0, total: 0 };
    // 月利 1.5% (最低0.5万) + 元本5%返済 (最低10万、残債上限)
    let interestRate = 0.015;
    const loanLv = getStaffSkillLevel('loan_negotiator');
    if (loanLv === 1) interestRate *= 0.85; // 15%割引
    else if (loanLv === 2) interestRate *= 0.70; // 30%割引
    else if (loanLv >= 3) interestRate *= 0.50; // 50%割引
    const interest = Math.max(0.2, Math.round(d * interestRate * 10) / 10);
    const principal = Math.min(d, Math.max(10.0, Math.round(d * 0.05 * 10) / 10));
    const total = Math.round((principal + interest) * 10) / 10;
    return { principal, interest, total };
  }

  function calcMonthlyEmergencyPayment(emergDebtVal) {
    const ed = emergDebtVal !== undefined ? emergDebtVal : ((GameState && GameState.company && GameState.company.emergencyDebt) || 0);
    if (!ed || ed <= 0) return { principal: 0, interest: 0, total: 0 };
    const interest = Math.round(ed * 0.10 * 10) / 10;
    const principal = Math.min(ed, Math.max(1.0, Math.round(ed * 0.05 * 10) / 10));
    const total = Math.round((principal + interest) * 10) / 10;
    return { principal, interest, total };
  }

  function checkDeadEndBankruptcy() {
    const funds = (GameState && GameState.funds) || 0;
    const propCount = (GameState && GameState.properties) ? GameState.properties.length : 0;
    const remCap = getRemainingLoanCapacity();
    const emergDebt = (GameState && GameState.company && GameState.company.emergencyDebt) || 0;
    // ホーム画面で実際に調達可能な最大着工資金（街金残債がある間は完済しない限り銀行新規融資が凍結される）
    const reachableFunds = emergDebt > 0
      ? (funds >= emergDebt ? Math.round((funds - emergDebt + remCap) * 10) / 10 : funds)
      : Math.round((funds + remCap) * 10) / 10;
    if (propCount === 0 && reachableFunds < MIN_BUILD_FUNDS) {
      const freezeNote = (emergDebt > 0 && funds < emergDebt)
        ? `街金残債（${emergDebt.toFixed(1)}万）により銀行の新規融資が凍結されており、`
        : '';
      return {
        isBankrupt: true,
        reason: `所有物件が0棟の状態で、${freezeNote}所持資金（${funds.toFixed(1)}万）と利用可能な銀行融資余力（${(emergDebt > 0 && funds < emergDebt ? 0 : remCap).toFixed(1)}万）で最低建築資金（${MIN_BUILD_FUNDS.toFixed(0)}万円）を調達できず、事業継続が不可能となりました。`
      };
    }
    return { isBankrupt: false, reason: '' };
  }

  function getEstimatedMonthlyNetIncome() {
    let income = 0;
    let maint = 0;
    if (GameState && GameState.properties) {
      for (const p of GameState.properties) {
        if (p.isSold) continue;
        const stats = calcPropertyStats(p);
        maint += (stats.maintCost || 0);
        if ((p.vacantMonths || 0) <= 0 && (p.vacancyTurns || 0) <= 0) {
          income += (p.rent || 0);
        }
      }
    }
    let salaries = 0;
    if (GameState && GameState.company && GameState.company.hiredStaff) {
      salaries = GameState.company.hiredStaff.reduce((sum, s) => sum + (s.salary || 0), 0);
    }
    const recMaint = (GameState?.company?.recruitment?.status === 'active') ? RECRUIT_MAINT_COST : 0;
    const currentDebt = (GameState && GameState.company && GameState.company.debt) || 0;
    const loanPay = calcMonthlyLoanPayment(currentDebt);
    const emergDebt = (GameState && GameState.company && GameState.company.emergencyDebt) || 0;
    const emergPay = calcMonthlyEmergencyPayment(emergDebt);
    const net = income - maint - salaries - recMaint - loanPay.total - emergPay.total;
    return Math.round(net * 10) / 10;
  }

  function processMonthEnd() {
    let totalIncome = 0;
    let totalMaintCost = 0;
    let evictedList = [];
    let reEnteredList = [];

    for (const p of GameState.properties) {
      if (p.isSold) continue;

      // 互換性確保: vacancyTurns を vacantMonths に統一
      if (p.vacantMonths === undefined) {
        p.vacantMonths = (p.vacancyTurns && p.vacancyTurns > 0) ? p.vacancyTurns : 0;
      }

      // 毎月の物件維持管理費（空室中も発生・築年数に応じて上昇）
      const preStats = calcPropertyStats(p);
      const propMaint = preStats.maintCost || 0;
      totalMaintCost = Math.round((totalMaintCost + propMaint) * 10) / 10;
      p.paidMaint = Math.round(((p.paidMaint || 0) + propMaint) * 10) / 10;

      if (p.vacantMonths > 0) {
        // 空室中: 毎月の再入居マッチング抽選！
        const fillChance = calcFillChance(p);
        if (Math.random() * 100 < fillChance) {
          // 入居決定！
          p.vacantMonths = 0;
          p.vacancyTurns = 0;
          p.moveInMonth = GameState.month;
          p.isOriginalTenant = false;
          p.rent = calcMarketRent(p, GameState.month);
          const pNum = p.propertyNo || (p.level !== undefined ? p.level + 1 : 1);
          reEnteredList.push({ num: pNum, rent: p.rent });

          // 初月分の家賃収入を計上
          totalIncome += p.rent;
          p.earnedRent = Math.round(((p.earnedRent || 0) + p.rent) * 10) / 10;
        } else {
          // 入居不成立: 空室継続
          p.vacantMonths++;
          p.vacancyTurns = p.vacantMonths;
        }
      } else {
        // 入居中: 退去判定
        const tenantTenure = Math.max(0, GameState.month - (p.moveInMonth || p.createdMonth || GameState.month));

        // 引き渡し当月（入居0ヶ月目）は退去判定をスキップ
        if (tenantTenure <= 0) {
          totalIncome += p.rent;
          p.earnedRent = Math.round(((p.earnedRent || 0) + p.rent) * 10) / 10;
          continue;
        }

        const stats = preStats;
        const evictChance = parseFloat(stats.evictRate) / 100.0;

        // サイコロを振る
        if (Math.random() < evictChance) {
          p.vacantMonths = 1; // 空室1ヶ月目へ
          p.vacancyTurns = 1;
          p.isOriginalTenant = false;
          const pNum = p.propertyNo || (p.level !== undefined ? p.level + 1 : 1);
          evictedList.push(pNum);
        } else {
          totalIncome += p.rent;
          p.earnedRent = Math.round(((p.earnedRent || 0) + p.rent) * 10) / 10;
        }
      }
    }

    GameState.month += 1;

    if (totalIncome > 0) {
      if (!GameState.stats) getLifetimeStats();
      GameState.stats.lifetimeEarnedRent = Math.round(((GameState.stats.lifetimeEarnedRent || 0) + totalIncome) * 10) / 10;
    }

    // スタッフ人件費＋求人広告維持費の控除
    let totalSalaries = 0;
    if (GameState.company && GameState.company.hiredStaff) {
      totalSalaries = GameState.company.hiredStaff.reduce((sum, s) => sum + (s.salary || 0), 0);
    }

    // スタッフ求人の月次更新（満席でも入替用に継続可能、active継続時は維持費RECRUIT_MAINT_COSTが発生）
    let recruitMaintCost = 0;
    const co = GameState.company;
    if (co) {
      if (!co.recruitment) co.recruitment = { status: 'none', candidates: [] };
      const maxSlots = co.deskCount || 0;
      if (maxSlots <= 0) {
        co.recruitment.status = 'none';
        co.recruitment.candidates = [];
      } else {
        if (co.recruitment.status === 'posted') {
          co.recruitment.status = 'active';
          co.recruitment.candidates = generateCandidateBatch(3, co.officeLevel || 1);
        } else if (co.recruitment.status === 'active') {
          recruitMaintCost = RECRUIT_MAINT_COST;
          co.recruitment.candidates = generateCandidateBatch(3, co.officeLevel || 1);
        }
      }
    }
    totalSalaries = Math.round((totalSalaries + recruitMaintCost) * 10) / 10;

    // 銀行借入の月次返済（元本＋利息）
    const currentDebt = (GameState.company && GameState.company.debt) || 0;
    const loanPay = calcMonthlyLoanPayment(currentDebt);
    if (loanPay.principal > 0 && GameState.company) {
      GameState.company.debt = Math.max(0, Math.round((currentDebt - loanPay.principal) * 10) / 10);
    }

    // 街金（緊急融資）の月次返済（元本5%＋月利10%）
    const curEmergDebt = (GameState.company && GameState.company.emergencyDebt) || 0;
    const emergPay = calcMonthlyEmergencyPayment(curEmergDebt);
    if (emergPay.principal > 0 && GameState.company) {
      GameState.company.emergencyDebt = Math.max(0, Math.round((curEmergDebt - emergPay.principal) * 10) / 10);
    }

    const netIncome = Math.round((totalIncome - totalMaintCost - totalSalaries - loanPay.total - emergPay.total) * 10) / 10;
    GameState.funds = Math.round((GameState.funds + netIncome) * 10) / 10;

    // 資金ショート（マイナス転落）時の処理
    let overdraftAmount = 0;
    let isBankrupt = false;
    let bankruptReason = '';

    if (GameState.funds < 0) {
      let deficit = Math.round(Math.abs(GameState.funds) * 10) / 10;
      const remCap = getRemainingLoanCapacity();
      if (remCap >= deficit) {
        // 融資枠内で自動つなぎ融資を実行
        GameState.company.debt = Math.round(((GameState.company.debt || 0) + deficit) * 10) / 10;
        GameState.funds = 0.0;
        overdraftAmount = deficit;
      } else {
        // 銀行枠を使い切った後、街金枠があれば街金で緊急カバー
        let coveredByBank = remCap;
        if (coveredByBank > 0) {
          GameState.company.debt = Math.round(((GameState.company.debt || 0) + coveredByBank) * 10) / 10;
          deficit = Math.round((deficit - coveredByBank) * 10) / 10;
        }
        const remEmerg = Math.max(0, 50.0 - ((GameState.company && GameState.company.emergencyDebt) || 0));
        if (remEmerg >= deficit) {
          GameState.company.emergencyDebt = Math.round(((GameState.company.emergencyDebt || 0) + deficit) * 10) / 10;
          GameState.funds = 0.0;
          overdraftAmount = coveredByBank + deficit;
        } else {
          // 融資限度額超過による不渡り（倒産）
          isBankrupt = true;
          bankruptReason = `月末の支払い（維持管理費・人件費・借入返済）により運転資金が不足し、銀行融資および街金枠の限度額を超過して不渡りが発生しました。`;
        }
      }
    }

    if (!isBankrupt) {
      const deadEnd = checkDeadEndBankruptcy();
      if (deadEnd.isBankrupt) {
        isBankrupt = true;
        bankruptReason = deadEnd.reason;
      }
    }

    saveGame();
    const remBankDebt = (GameState.company && GameState.company.debt) || 0;
    const remEmergDebt = (GameState.company && GameState.company.emergencyDebt) || 0;
    return {
      income: totalIncome,
      maintCost: totalMaintCost,
      salaries: totalSalaries,
      loanPayment: Math.round((loanPay.total + emergPay.total) * 10) / 10,
      loanPrincipal: Math.round((loanPay.principal + emergPay.principal) * 10) / 10,
      loanInterest: Math.round((loanPay.interest + emergPay.interest) * 10) / 10,
      remainingDebt: Math.round((remBankDebt + remEmergDebt) * 10) / 10,
      remainingBankDebt: remBankDebt,
      remainingEmergDebt: remEmergDebt,
      netIncome: netIncome,
      evicted: evictedList,
      reEntered: reEnteredList,
      overdraftAmount: overdraftAmount,
      isBankrupt: isBankrupt,
      bankruptReason: bankruptReason
    };
  }
  
  function formatYearMonth(m = GameState.month) {
    const cur = Math.max(1, Number(m) || 1);
    const y = Math.floor((cur - 1) / 12) + 1;
    const mo = ((cur - 1) % 12) + 1;
    return `${y}年目 ${mo}月`;
  }

  function updateCompanyUI() {
    // 旧ヘッダー(#game-subtitle)削除済みのため呼び出し互換スタブとして維持
  }

  function saveGame() {
    if (isTutorialPracticeMode) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(GameState));
    } catch(e) {}
  }

  function ensureGameState() {
    if (GameState.hasCleared === undefined) GameState.hasCleared = false;
    if (GameState.clearedMonth === undefined) GameState.clearedMonth = null;
    if (GameState.clearedSnapshot === undefined) GameState.clearedSnapshot = null;
    if (!GameState.discovered) GameState.discovered = { combos: [], furniture: [] };
    if (!Array.isArray(GameState.discovered.combos)) GameState.discovered.combos = [];
    if (!Array.isArray(GameState.discovered.furniture)) GameState.discovered.furniture = [];
    if (GameState.company && (GameState.company.officeLevel || 0) >= UPGRADE_CONFIG.office.length - 1) {
      if (!GameState.hasCleared) {
        GameState.hasCleared = true;
        if (!GameState.clearedMonth) GameState.clearedMonth = GameState.month || 1;
      }
    }
    if (Array.isArray(GameState.properties)) {
      for (const p of GameState.properties) {
        if (Array.isArray(p.combosList)) {
          for (const c of p.combosList) {
            if (c && c.name && !GameState.discovered.combos.includes(c.name)) {
              GameState.discovered.combos.push(c.name);
            }
          }
        }
      }
    }
  }

  function loadGame() {
    if (isTutorialPracticeMode) return;
    try {
      const data = localStorage.getItem(SAVE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        Object.assign(GameState, parsed);
        if (!GameState.companyName || GameState.companyName === '和歌山不動産') {
          GameState.companyName = '焼飯不動産';
        }
        if (GameState.hasNamedCompany === undefined) {
          GameState.hasNamedCompany = true;
        }
        if (parsed.tutorialPhase === undefined) {
          GameState.tutorialPhase = 'done';
        }
        if (!GameState.company) {
          GameState.company = {
            salesLevel: 1,
            brandLevel: 1,
            officeLevel: 0,
            debt: 0,
            emergencyDebt: 0,
            features: { freeFlip: false, extraRerolls: 0, extraAttempts: 0 },
            hiredStaff: [],
            recruitment: { status: 'none', candidates: [] },
            unlockedPieces: [...STARTER_UNLOCKED_IDS],
            deck: { slotOverrides: {}, customSlots: [null, null, null, null] }
          };
        } else {
          if (GameState.company.emergencyDebt === undefined) GameState.company.emergencyDebt = 0;
          if (!GameState.company.salesLevel) GameState.company.salesLevel = 1;
          if (!GameState.company.brandLevel) GameState.company.brandLevel = 1;
          if (GameState.company.officeLevel === undefined) GameState.company.officeLevel = 0;
          if (GameState.company.deskCount === undefined) {
            const offLv = GameState.company.officeLevel || 0;
            GameState.company.deskCount = Math.max(offLv, GameState.company.hiredStaff?.length || 0);
          }
          if (GameState.company.capacityLevel === undefined) {
            const offLv = GameState.company.officeLevel || 0;
            GameState.company.capacityLevel = offLv;
          }
          if (GameState.company.debt === undefined || typeof GameState.company.debt !== 'number') GameState.company.debt = 0;
          if (!GameState.company.features) GameState.company.features = { freeFlip: false, extraRerolls: 0, extraAttempts: 0 };
          if (!GameState.company.hiredStaff) GameState.company.hiredStaff = [];
          if (!GameState.company.recruitment) GameState.company.recruitment = { status: 'none', candidates: [] };
        }
        getLifetimeStats();
        ensureDeckState();
        ensureGameState();
        if (GameState.attempts === undefined || typeof GameState.attempts !== 'number' || GameState.attempts < 0) {
          GameState.attempts = getMaxAttempts();
        }
        if (GameState.currentMission) {
          attachRequestFunctions(GameState.currentMission);
          STAGE = GameState.currentMission;
        }
        if (GameState.availableMissions && Array.isArray(GameState.availableMissions)) {
          GameState.availableMissions.forEach(m => attachRequestFunctions(m));
        }
      } else {
        GameState.hasNamedCompany = false;
      }
    } catch(e) {}
    ensureDeckState();
    ensureGameState();
    if (!GameState.availableMissions || GameState.availableMissions.length === 0) {
      GameState.availableMissions = generateMissionPool(GameState.level);
      saveGame();
    }
  }

  let currentLevelIdx = 0;
  let STAGE = null;

  /* ============================================================
     STATE
  ============================================================ */
  let grid = [];
  let nextRoomId = 1;
  let draftSlots = [null, null, null];
  let keepStates = [false, false, false];
  let keepCounts = [0, 0, 0];
  let discardCount = 0;
  let selectedSlot = 0; // 0-2 for draft
  let selectedRot = 0;
  let isMirrored = false;
  let turnsLeft = 0;
  let handRefreshesRemaining = 0;
  let hoverCell = null;
  let lastPlacedAnchor = null;
  let previewMode = false;
  let cellSize = 48;
  let soundEnabled = true;
  let synth = null;
  
  /* ============================================================
     SOUND
  ============================================================ */
  function showFloatingText(text, color = null) {
    const ctnr = document.getElementById('canvas-container');
    const el = document.createElement('div');
    el.className = 'floating-text';
    el.textContent = text;
    if (color) el.style.color = color;
    const x = 50 + (Math.random() * 20 - 10);
    const y = 40 + (Math.random() * 20 - 10);
    el.style.left = x + '%';
    el.style.top = y + '%';
    ctnr.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 1500);
  }

  function initAudio() {
    if (synth || !window.Tone) return;
    try {
      synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.005, decay: 0.1, sustain: 0.1, release: 0.3 }
      }).toDestination();
      synth.volume.value = -10;
    } catch(e) {}
  }


  function getPropertyRank(degRate) {
    if (degRate <= 0.5) return 'S';
    if (degRate <= 0.7) return 'A';
    if (degRate <= 0.9) return 'B';
    if (degRate <= 1.1) return 'C';
    if (degRate <= 1.3) return 'D';
    return 'E';
  }

  function getRankBadgeStyle(rank) {
    switch(rank) {
      case 'S': return 'background:#f59e0b; color:#ffffff;'; // 琥珀ゴールド
      case 'A': return 'background:#10b981; color:#ffffff;'; // エメラルド
      case 'B': return 'background:#3b82f6; color:#ffffff;'; // ブルー
      case 'C': return 'background:#64748b; color:#ffffff;'; // スレート
      default:  return 'background:#94a3b8; color:#ffffff;'; // ライトスレート
    }
  }

  // 間取りの最小包含長方形（占有土地面積）・延床面積・余白庭面積・造成マス数を算出
  function calcFootprintStats(targetGrid, fallbackEncroachCount = 0) {
    if (!targetGrid || !Array.isArray(targetGrid)) {
      return { floorCells: 0, marginGardenCells: 0, maxGardenCluster: 0, occupiedArea: 0, encroachedCells: fallbackEncroachCount || 0, bbox: null, hasPlacedPiece: false };
    }
    const gSize = targetGrid.length || GRID;
    let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
    let hasPlacedPiece = false;
    let encroached = 0;

    // 1. プレイヤーが配置した部屋・廊下ピースから最小長方形の枠を決定
    for (let r = 0; r < gSize; r++) {
      for (let c = 0; c < gSize; c++) {
        const cell = targetGrid[r]?.[c];
        if (!cell) continue;
        if (cell.encroached) encroached++;
        if (cell.type !== T.EMPTY && cell.type !== T.GARDEN && cell.type !== T.OBSTACLE && cell.type !== T.ENTRANCE) {
          hasPlacedPiece = true;
          if (r < minR) minR = r;
          if (r > maxR) maxR = r;
          if (c < minC) minC = c;
          if (c > maxC) maxC = c;
        }
      }
    }

    // まだピースが1つも置かれていない場合は玄関セルを基準にする
    if (!hasPlacedPiece) {
      for (let r = 0; r < gSize; r++) {
        for (let c = 0; c < gSize; c++) {
          const cell = targetGrid[r]?.[c];
          if (cell && cell.type === T.ENTRANCE) {
            if (r < minR) minR = r;
            if (r > maxR) maxR = r;
            if (c < minC) minC = c;
            if (c > maxC) maxC = c;
          }
        }
      }
    }

    if (minR === Infinity) {
      return { floorCells: 0, marginGardenCells: 0, maxGardenCluster: 0, occupiedArea: 0, encroachedCells: Math.max(encroached, fallbackEncroachCount || 0), bbox: null, hasPlacedPiece: false };
    }

    let floorCells = 0;
    let marginGardenCells = 0;
    const gardenCellsSet = new Set();

    // 2. 最小長方形の枠内・枠外を走査（未開発の✕マスは計算から完全除外）
    for (let r = 0; r < gSize; r++) {
      for (let c = 0; c < gSize; c++) {
        const cell = targetGrid[r]?.[c];
        const inBox = (r >= minR && r <= maxR && c >= minC && c <= maxC);
        if (inBox) {
          if (cell && cell.type === T.OBSTACLE) {
            // 未開発の✕マス（障害物・変形敷地の欠け部分）は占有面積から除外
            continue;
          } else if (cell && cell.type !== T.EMPTY && cell.type !== T.GARDEN) {
            // 部屋・廊下・枠内に含まれる玄関は延床面積としてカウント
            floorCells++;
          } else {
            // 長方形の枠内にある空き地・庭は余白庭面積としてカウント
            marginGardenCells++;
            gardenCellsSet.add(`${r},${c}`);
          }
        } else {
          // 長方形の枠外に玄関だけが1マス出っ張っている場合は、枠を広げず延床面積にのみ加算
          if (cell && cell.type === T.ENTRANCE) {
            floorCells++;
          }
        }
      }
    }

    // 3. 庭の最大連結クラスター（塊）のマス数をBFSで算出
    let maxGardenCluster = 0;
    const visitedGarden = new Set();
    const dirs = [{dr:-1,dc:0},{dr:1,dc:0},{dr:0,dc:-1},{dr:0,dc:1}];
    for (const key of gardenCellsSet) {
      if (visitedGarden.has(key)) continue;
      let clusterSize = 0;
      const q = [key];
      visitedGarden.add(key);
      while (q.length > 0) {
        const cur = q.shift();
        clusterSize++;
        const [cr, cc] = cur.split(',').map(Number);
        for (const {dr, dc} of dirs) {
          const nr = cr + dr, nc = cc + dc;
          const nKey = `${nr},${nc}`;
          if (gardenCellsSet.has(nKey) && !visitedGarden.has(nKey)) {
            visitedGarden.add(nKey);
            q.push(nKey);
          }
        }
      }
      if (clusterSize > maxGardenCluster) {
        maxGardenCluster = clusterSize;
      }
    }

    const finalEncroached = Math.max(encroached, fallbackEncroachCount || 0);
    return {
      floorCells,
      marginGardenCells,
      maxGardenCluster,
      occupiedArea: floorCells + marginGardenCells,
      encroachedCells: finalEncroached,
      bbox: { minR, maxR, minC, maxC, w: maxC - minC + 1, h: maxR - minR + 1 },
      hasPlacedPiece
    };
  }

  function calcPropertyStats(p) {
    const targetRent = p.targetRent || 1;
    const baseRent = p.baseRent || (p.rent * 0.8) || 0;
    const satisfied = p.satisfiedCount !== undefined ? p.satisfiedCount : 1;
    const totalReq = p.totalRequests || 1;
    const created = p.createdMonth || 1;
    const buildingAge = Math.max(0, GameState.month - created);
    const tenantTenure = Math.max(0, GameState.month - (p.moveInMonth || created));
    const amenityPenalty = p.amenityPenalty || 0;
    const isVacant = (p.vacantMonths || 0) > 0 || (p.vacancyTurns || 0) > 0;
    const fillChance = isVacant ? calcFillChance(p) : 0;

    // 初代か2代目以降かによるコンボ・家賃の切り替え
    const isOriginal = p.isOriginalTenant !== false; // 未定義は初代扱い
    let currentRent = p.rent;
    let goodC = (p.goodCombos !== undefined) ? p.goodCombos : (p.combosList || []).filter(c => c && c.bonus > 0).length;
    let badC = (p.badCombos !== undefined) ? p.badCombos : (p.combosList || []).filter(c => c && c.bonus < 0).length;

    if (!isOriginal && p.customCombo) {
      // 2代目以降（一般市場）: 特注のメッキが剥がれる
      if (p.customCombo.isNegativeInversion || p.customCombo.allowUnreachable) {
        if (goodC > 0) goodC -= 1;
        badC += 1; // 本来の大惨事ペナルティが復活
      }
    }

    let rentBonus, reqBonus, comboBonus, optBonus, conciergeBonus, satisfaction;
    if (isOriginal) {
      // 1. 家賃ボーナス（見た目・挙動一致のため整数に丸める）
      const rentRatio = currentRent / targetRent;
      let rentPenalty = (rentRatio - 1.0) * 50;
      const negLv = getStaffSkillLevel('negotiator');
      if (rentPenalty > 0 && negLv > 0) {
        const red = [0, 0.30, 0.50, 0.75][negLv] || 0.50;
        rentPenalty *= (1 - red);
      }
      rentBonus = Math.round(50 - rentPenalty);

      // 2. 依頼ボーナス（整数に丸める）
      reqBonus = Math.round((satisfied / totalReq) * 50);

      // 3. コンボボーナス（整数）
      comboBonus = (goodC * 5) - (badC * 20);

      // 4. 任意オプションボーナス (難易度ティア制: ライト3%/標準5%/エキスパート7% & 顧客リレーション)
      let optBonusSum = 0;
      if (p.satisfiedOptIds && Array.isArray(p.satisfiedOptIds)) {
        for (const optId of p.satisfiedOptIds) {
          optBonusSum += getOptionalReqBonus({ id: optId });
        }
      } else if (p.optionalSatisfied) {
        // 後方互換性（既存セーブデータ用）
        const listLv = getStaffSkillLevel('listener');
        const optPerReq = listLv > 0 ? ([0, 7, 10, 14][listLv] || 8) : 5;
        optBonusSum = p.optionalSatisfied * optPerReq;
      }
      optBonus = optBonusSum;

      // 5. おもてなしコンシェルジュ (Lv1:+4%, Lv2:+8%, Lv3:+12%)
      const conLv = getStaffSkillLevel('concierge');
      conciergeBonus = conLv > 0 ? ([0, 4, 8, 12][conLv] || 5) : 0;

      // 満足度合計
      satisfaction = rentBonus + reqBonus + comboBonus + optBonus + conciergeBonus - amenityPenalty;
    } else {
      // 2代目以降（一般市場入居者）:
      // 適正相場家賃で入居するため家賃不満なし、基本要望は満点扱い
      rentBonus = 50;
      reqBonus = 50;
      comboBonus = (goodC * 5) - (badC * 20);
      optBonus = 0;
      const conLv = getStaffSkillLevel('concierge');
      conciergeBonus = conLv > 0 ? ([0, 4, 8, 12][conLv] || 5) : 0;
      satisfaction = rentBonus + reqBonus + comboBonus + conciergeBonus - amenityPenalty;
    }

    // 劣化率:
    // 初代: 基本0.5 + (未達*0.2) + (マイナス*0.5)
    // 2代目以降: 基本0.5 + (マイナス*0.5) + (欠陥*0.3)
    let baseDegRate = 0.5;
    if (isOriginal) {
      const unreached = totalReq - satisfied;
      baseDegRate += (unreached * 0.2) + (badC * 0.5);
    } else {
      baseDegRate += (badC * 0.5) + (amenityPenalty > 0 ? 0.3 : 0);
    }
    // 珍間取りペナルティ（珍間取りとしての住みづらさにより劣化・退去リスク増加）
    if (p.combosList) {
      for (const c of p.combosList) {
        const cName = (typeof c === 'string') ? c : (c && c.name);
        const prop = cName ? FUNNY_LAYOUT_PROPS[cName] : null;
        if (prop && prop.deg) {
          baseDegRate += prop.deg;
        }
      }
    }

    // 築年数による劣化加速: degRate = baseDegRate * (1 + buildingAge * 0.015)
    let degRate = baseDegRate * (1 + buildingAge * 0.015);

    const hasStorage = !!(p.hasStorage || (p.closetCells && p.closetCells > 0) || (p.combosList && p.combosList.some(c => c.name && c.name.includes('収納'))));
    const storeLv = getStaffSkillLevel('storage_master');
    if (storeLv > 0 && hasStorage) {
      const degRed = [0, 0.10, 0.20, 0.35][storeLv] || 0.20;
      degRate = Math.max(0.1, degRate - degRed);
    }

    // 退去率計算
    let evictRateVal = 0;
    let barrierMonths = 0;
    if (isVacant) {
      evictRateVal = 0; // 空室中は退去判定なし（再入居待ち）
    } else if (isOriginal) {
      if (satisfaction > 100) {
        const rawSurplus = satisfaction - 100;
        // 120%までは1%=1ヶ月、それ以上は2%=1ヶ月（ソフトキャップ）
        barrierMonths = rawSurplus <= 20 
          ? rawSurplus 
          : Math.round(20 + (rawSurplus - 20) * 0.5);
        if (tenantTenure <= barrierMonths) {
          evictRateVal = 0;
        } else {
          evictRateVal = (tenantTenure - barrierMonths) * degRate;
        }
      } else {
        const initialEvict = 100 - satisfaction;
        evictRateVal = initialEvict + (tenantTenure * degRate);
      }
    } else {
      // 2代目以降: 最初の3ヶ月は定着期間（退去率0%保護）
      if (tenantTenure <= 3) {
        evictRateVal = 0;
      } else {
        evictRateVal = Math.max(0, (100 - satisfaction) + ((tenantTenure - 3) * degRate));
      }
    }

    if (storeLv > 0 && hasStorage && evictRateVal > 0) {
      const evictDiscount = [0, 1.0, 2.0, 3.5][storeLv] || 1.0;
      evictRateVal = Math.max(0, evictRateVal - evictDiscount);
    }

    const evictRate = Math.min(100, Math.max(0, evictRateVal)).toFixed(1);

    // 売却査定額:
    const rawBaseCost = p.baseCost !== undefined ? p.baseCost : ((baseRent * 20) || 0);
    const baseCost = p.isRenovation
      ? Math.max(10, (p.baseCost || 0) + (p.demolishCost || 0) * 0.5 + (p.preservedBaseCost || 0) * 0.4)
      : rawBaseCost;
    const effectiveRent = (p.isOriginalTenant !== false) ? (p.rent || baseRent) : calcMarketRent(p, GameState.month);
    const comboRentDiff = effectiveRent - baseRent;
    const rawComboPremium = comboRentDiff * 6; // 6ヶ月分に是正（フリップ即時大儲けを抑制）
    let comboPremium = 0;
    let satPremiumRate = 1.0;
    if (rawComboPremium > 0) {
      if (satisfaction >= 100) {
        satPremiumRate = 1.0;
      } else if (satisfaction >= 80) {
        satPremiumRate = (satisfaction - 80) / 20;
      } else {
        satPremiumRate = 0;
      }
      comboPremium = Math.min(baseCost * 0.5, rawComboPremium * satPremiumRate);
    } else {
      // マイナスコンボ（構造的欠陥）は常に100%減額
      comboPremium = rawComboPremium;
    }
    const satBaseFactor = satisfaction >= 80 ? 1.0 : Math.max(0.8, 0.8 + (Math.max(0, satisfaction) / 80) * 0.2);
    const initialValuation = Math.max(baseCost * 0.3, (baseCost * satBaseFactor) + comboPremium);
    const standardResaleNum = initialValuation * Math.max(0.3, 1.0 - (buildingAge * 0.02));
    const standardResaleValue = standardResaleNum.toFixed(1);
    const resaleValue = (isVacant ? standardResaleNum * 0.8 : standardResaleNum).toFixed(1);

    const minHoldMonths = 6;
    const canSell = buildingAge >= minHoldMonths;
    const sellLockRemain = Math.max(0, minHoldMonths - buildingAge);

    const nextRecruitRent = calcMarketRent(p, GameState.month);

    // 占有面積（最小長方形）・延床面積・余白庭・造成マス数と月次維持管理費の計算
    let floorCells = p.floorCells;
    let marginGardenCells = p.marginGardenCells;
    let maxGardenCluster = p.maxGardenCluster;
    let encroachedCells = p.encroachCount || 0;
    let bbox = p.bbox || null;
    const targetG = p.propertyGrid || ((typeof grid !== 'undefined' && p === window.currentPropertyData) ? grid : null);
    if (targetG) {
      const fp = calcFootprintStats(targetG, encroachedCells);
      if (floorCells === undefined) floorCells = fp.floorCells;
      if (marginGardenCells === undefined) marginGardenCells = fp.marginGardenCells;
      if (maxGardenCluster === undefined) maxGardenCluster = fp.maxGardenCluster;
      encroachedCells = Math.max(encroachedCells, fp.encroachedCells);
      if (!bbox) bbox = fp.bbox;
    } else if (floorCells === undefined || marginGardenCells === undefined) {
      floorCells = Math.max(8, Math.round((baseRent || 3) * 4));
      marginGardenCells = 0;
      maxGardenCluster = 0;
    }
    const occupiedArea = floorCells + marginGardenCells;
    const floorMaint = Math.round(floorCells * 0.04 * 100) / 100;
    const gardenMaint = Math.round(marginGardenCells * 0.06 * 100) / 100;
    const encroachMaint = Math.round(encroachedCells * 0.20 * 100) / 100;
    const locMaintMult = (p.location && typeof p.location.maintMult === 'number') ? p.location.maintMult : 1.0;
    // 基礎維持費: 延床 0.04万/マス + 長方形内の余白庭 0.06万/マス + 造成区画 0.20万/マス (立地倍率適用・最低0.2万)
    const rawBaseMaint = (floorCells * 0.04 + marginGardenCells * 0.06 + encroachedCells * 0.20) * locMaintMult;
    const baseMaintCost = Math.max(0.2, Math.round(rawBaseMaint * 10) / 10);
    const ageMaintMult = 1 + buildingAge * 0.04;
    // 経年老朽化による修繕維持費上昇: 1ヶ月あたり +4% (1年で+48%)
    const maintCost = Math.round(baseMaintCost * ageMaintMult * 10) / 10;
    const activeRent = isVacant ? 0 : currentRent;
    const netMonthlyProfit = Math.round((activeRent - maintCost) * 10) / 10;
    const ageValFactor = Math.max(0.3, 1.0 - (buildingAge * 0.02));

    return {
      satisfaction: satisfaction,
      barrierMonths: barrierMonths,
      degRate: degRate.toFixed(1),
      baseDegRate: baseDegRate.toFixed(1),
      evictRate: evictRate,
      initialEvict: Math.max(0, 100 - satisfaction),
      resaleValue: resaleValue,
      standardResaleValue: standardResaleValue,
      baseCostVal: Math.round(baseCost * 10) / 10,
      locMaintMult: locMaintMult,
      satBaseFactor: satBaseFactor,
      comboPremiumVal: Math.round(comboPremium * 10) / 10,
      comboRentDiff: Math.round(comboRentDiff * 10) / 10,
      rawComboPremium: Math.round(rawComboPremium * 10) / 10,
      initialValuation: Math.round(initialValuation * 10) / 10,
      ageValFactor: ageValFactor,
      canSell: canSell,
      sellLockRemain: sellLockRemain,
      satPremiumRate: Math.round(satPremiumRate * 100),
      isVacant: isVacant,
      vacantMonths: p.vacantMonths || 0,
      fillChance: fillChance,
      nextRecruitRent: nextRecruitRent,
      age: buildingAge,
      buildingAge: buildingAge,
      tenantTenure: tenantTenure,
      rentBonus: rentBonus,
      reqBonus: reqBonus,
      comboBonus: comboBonus,
      optBonus: optBonus,
      conciergeBonus: conciergeBonus,
      hasStorage: hasStorage,
      storeLv: storeLv,
      amenityPenalty: amenityPenalty,
      currentRent: currentRent,
      isOriginal: isOriginal,
      floorCells: floorCells,
      marginGardenCells: marginGardenCells,
      maxGardenCluster: maxGardenCluster || 0,
      occupiedArea: occupiedArea,
      encroachedCells: encroachedCells,
      bbox: bbox,
      floorMaint: floorMaint,
      gardenMaint: gardenMaint,
      encroachMaint: encroachMaint,
      ageMaintMult: ageMaintMult,
      baseMaintCost: baseMaintCost,
      maintCost: maintCost,
      netMonthlyProfit: netMonthlyProfit
    };
  }

  function playSound(type) {
    if (!soundEnabled || !synth) return;
    try {
      if (Tone.context.state !== 'running') Tone.start();
      const now = Tone.now();
      if      (type === 'place')  synth.triggerAttackRelease(['C5','G5'], '16n', now);
      else if (type === 'rotate') synth.triggerAttackRelease('E5', '32n', now);
      else if (type === 'error')  synth.triggerAttackRelease('F3', '16n', now);
      else if (type === 'clear')  synth.triggerAttackRelease(['C4','G4','C5','E5'], '8n', now);
      else if (type === 'combo')  synth.triggerAttackRelease(['D5','F#5','A5'], '16n', now);
      else if (type === 'reveal') synth.triggerAttackRelease(['G3','C4','E4','G4'], '4n', now);
      else if (type === 'fanfare') {
        synth.triggerAttackRelease(['C4','G4','C5'], '8n', now);
        synth.triggerAttackRelease(['E4','G4','E5'], '8n', now + 0.16);
        synth.triggerAttackRelease(['G4','C5','G5'], '8n', now + 0.32);
        synth.triggerAttackRelease(['C5','E5','G5','C6'], '2n', now + 0.50);
      }
    } catch(e) {}
  }
  function toggleSound(iconId) {
    soundEnabled = !soundEnabled;
    document.querySelectorAll('[id^=icon-sound]').forEach(el => {
      el.className = soundEnabled
        ? 'ph-bold ph-speaker-high'
        : 'ph-bold ph-speaker-slash';
      el.style.color = soundEnabled ? '' : 'var(--c-text3)';
    });
    if (soundEnabled) initAudio();
  }

  /* ============================================================
     SCREEN TRANSITIONS
  ============================================================ */
  const screens = {
    home:          document.getElementById('screen-home'),
    missionSelect: document.getElementById('screen-mission-select'),
    mission:       document.getElementById('screen-mission'),
    game:          document.getElementById('screen-game'),
    result:        document.getElementById('screen-result'),
  };
  function syncAppViewport() {
    try {
      const vv = window.visualViewport;
      const vh = vv ? vv.height : window.innerHeight;
      if (vh > 0) {
        document.documentElement.style.setProperty('--app-height', `${Math.round(vh)}px`);
      }
      if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo(0, 0);
      }
      if (document.documentElement && document.documentElement.scrollTop !== 0) {
        document.documentElement.scrollTop = 0;
      }
      if (document.body && document.body.scrollTop !== 0) {
        document.body.scrollTop = 0;
      }
    } catch (e) {}
  }

  function showScreen(name) {
    syncAppViewport();
    Object.entries(screens).forEach(([k, el]) => {
      if (el) el.classList.toggle('active', k === name);
    });
    if (name === 'mission' && screens.mission) {
      screens.mission.scrollTop = 0;
    }
    if (name !== 'home') {
      const propModal = document.getElementById('office-properties-modal');
      if (propModal) propModal.style.display = 'none';
    }
    if (name === 'game') {
      if (typeof syncPlicyHeaderActions === 'function') syncPlicyHeaderActions();
      if (typeof resizeCanvas === 'function') {
        requestAnimationFrame(() => {
          syncAppViewport();
          resizeCanvas();
        });
      }
    }
    if (window.PixelOffice) {
      if (name === 'home') window.PixelOffice.refresh();
      else window.PixelOffice.stopLoop();
    }
    if (window.PixelRenderer) {
      if (name === 'mission' && typeof window.PixelRenderer.startMissionIdle === 'function') {
        window.PixelRenderer.startMissionIdle();
      } else if (typeof window.PixelRenderer.stopMissionIdle === 'function') {
        window.PixelRenderer.stopMissionIdle();
      }
      if (name === 'missionSelect' && typeof window.PixelRenderer.startMissionSelectIdle === 'function') {
        window.PixelRenderer.startMissionSelectIdle(GameState.availableMissions || []);
      } else if (typeof window.PixelRenderer.stopMissionSelectIdle === 'function') {
        window.PixelRenderer.stopMissionSelectIdle();
      }
    }
  }

  if (typeof window !== 'undefined') {
    syncAppViewport();
    const onViewportChange = () => {
      syncAppViewport();
      if (screens.game && screens.game.classList.contains('active') && typeof resizeCanvas === 'function') {
        requestAnimationFrame(() => resizeCanvas());
      }
    };
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onViewportChange);
      window.visualViewport.addEventListener('scroll', syncAppViewport);
    }
    window.addEventListener('orientationchange', () => setTimeout(onViewportChange, 120));
  }

  /* ============================================================
     GRID / SITE MANAGER
  ============================================================ */
  function initGrid() {
    grid = [];
    nextRoomId = 1;
    lastPlacedAnchor = null;
    activeMetRequestIds = new Set();
    for (let r = 0; r < GRID; r++) {
      grid.push([]);
      for (let c = 0; c < GRID; c++) {
        grid[r].push(makeCell(T.EMPTY));
      }
    }
    // Place entrance (supports 1-cell or wide 2-cell entrance)
    const entCells = (STAGE && STAGE.entranceCells) ? STAGE.entranceCells : [{ r: STAGE.entranceRow, c: STAGE.entranceCol }];
    for (const ec of entCells) {
      grid[ec.r][ec.c] = makeCell(T.ENTRANCE, 'entrance', '玄関');
    }
    
    // Place obstacles from stage definition
    if (STAGE.obstacles) {
      for (const obs of STAGE.obstacles) {
        for (let r = obs.r; r < obs.r + (obs.h || 1); r++) {
          for (let c = obs.c; c < obs.c + (obs.w || 1); c++) {
            if (r >= 0 && r < GRID && c >= 0 && c < GRID && grid[r][c].type === T.EMPTY) {
              grid[r][c] = makeCell(T.OBSTACLE, null, '');
            }
          }
        }
      }
    }

    // リノベーション案件：既存間取り（固定躯体・解体可能部屋）の初期注入
    if (STAGE.renovation && typeof DXStage2 !== 'undefined' && DXStage2.injectRenovationGrid) {
      nextRoomId = DXStage2.injectRenovationGrid(grid, STAGE, makeCell);
      if (typeof mergeSameType === 'function') mergeSameType();
    }

    turnsLeft = STAGE.maxTurns;
    activeCombos = [];
    updateTurnsDisplay();
    // リアルタイム査定の初期化（初回はトースト通知を抑止）
    if (typeof updateRealtimeRent === 'function') updateRealtimeRent(true);
  }

  function makeCell(type, roomId=null, label='', costPerCell=0.0) {
    return {
      type, roomId, pieceId: roomId, label, costPerCell, encroached: false,
      isExisting: false, locked: false, renoGroupId: '',
      walls: {top:false, right:false, bottom:false, left:false},
      lockedWalls: {top:false, right:false, bottom:false, left:false}
    };
  }

  function gardenize() {
    for (let r = 0; r < GRID; r++)
      for (let c = 0; c < GRID; c++)
        if (grid[r][c].type === T.EMPTY)
          grid[r][c].type = T.GARDEN;
  }

  /* ============================================================
     SESSION RESUME & TRANSACTION MANAGEMENT (AUTO-SAVE)
  ============================================================ */
  function serializeGrid() {
    return grid.map(row => row.map(cell => {
      if (!cell || cell.type === T.EMPTY) return null;
      return {
        type: cell.type,
        roomId: cell.roomId,
        pieceId: cell.pieceId,
        label: cell.label,
        costPerCell: cell.costPerCell || 0,
        pieceLibId: cell.pieceLibId || '',
        encroached: !!cell.encroached,
        isExisting: !!cell.isExisting,
        locked: !!cell.locked,
        renoGroupId: cell.renoGroupId || '',
        walls: cell.walls ? { ...cell.walls } : {top:false, right:false, bottom:false, left:false},
        lockedWalls: cell.lockedWalls ? { ...cell.lockedWalls } : {top:false, right:false, bottom:false, left:false}
      };
    }));
  }

  function deserializeGrid(data) {
    if (!data) return false;
    grid = [];
    for (let r = 0; r < GRID; r++) {
      const row = [];
      for (let c = 0; c < GRID; c++) {
        const d = data[r]?.[c];
        if (d && d.type && d.type !== T.EMPTY) {
          const cell = makeCell(d.type, d.roomId, d.label, d.costPerCell || 0);
          cell.pieceId = d.pieceId;
          cell.pieceLibId = d.pieceLibId || '';
          cell.encroached = !!d.encroached;
          cell.isExisting = !!d.isExisting;
          cell.locked = !!d.locked;
          cell.renoGroupId = d.renoGroupId || '';
          cell.walls = d.walls ? { ...d.walls } : {top:false, right:false, bottom:false, left:false};
          cell.lockedWalls = d.lockedWalls ? { ...d.lockedWalls } : {top:false, right:false, bottom:false, left:false};
          row.push(cell);
        } else {
          row.push(makeCell(T.EMPTY));
        }
      }
      grid.push(row);
    }
    return true;
  }

  function saveActiveBuild(screenName) {
    if (!STAGE) return;
    try {
      GameState.activeBuild = {
        screen: screenName,
        stage: STAGE,
        grid: serializeGrid(),
        nextRoomId: nextRoomId,
        budget: budget,
        buildBaseCost: buildBaseCost,
        buildPiecePaidCost: buildPiecePaidCost,
        buildMirrorExtraCost: buildMirrorExtraCost,
        buildCycleExtraCost: buildCycleExtraCost,
        buildWallRemoveCost: buildWallRemoveCost,
        wallRemoveCount: wallRemoveCount,
        buildEncroachCost: buildEncroachCost,
        encroachCount: encroachCount,
        buildDemolishCost: buildDemolishCost,
        demolishCount: demolishCount,
        hintDismissedForBuild: hintDismissedForBuild,
        tutorialBuildStep: tutorialBuildStep,
        buildRerollCost: buildRerollCost,
        deckCycle: deckCycle,
        draftSlots: draftSlots,
        keepStates: keepStates,
        keepCounts: keepCounts,
        discardCount: discardCount,
        handRefreshesRemaining: handRefreshesRemaining,
        drawPile: drawPile,
        discardPile: discardPile,
        selectedSlot: selectedSlot,
        selectedRot: selectedRot,
        isMirrored: isMirrored,
        tempDeck: (typeof DXDeck !== 'undefined' && typeof DXDeck.getMissionTempDeck === 'function')
          ? DXDeck.getMissionTempDeck()
          : null
      };
      saveGame();
    } catch(e) {
      console.error('saveActiveBuild error:', e);
    }
  }

  function clearActiveBuild() {
    GameState.activeBuild = null;
    if (typeof DXDeck !== 'undefined' && typeof DXDeck.clearMissionTempDeck === 'function') {
      DXDeck.clearMissionTempDeck();
    }
    saveGame();
  }

  function restoreActiveBuild() {
    const ab = GameState.activeBuild;
    if (!ab || !ab.stage) return false;

    try {
      STAGE = ab.stage;
      attachRequestFunctions(STAGE);
      GameState.currentMission = STAGE;
      if (typeof DXDeck !== 'undefined' && typeof DXDeck.setMissionTempDeck === 'function') {
        DXDeck.setMissionTempDeck(ab.tempDeck || null);
      }

      deserializeGrid(ab.grid);
      nextRoomId = ab.nextRoomId || (GRID * GRID + 1);

      budget = (ab.budget !== undefined) ? ab.budget : GameState.funds;
      buildBaseCost = ab.buildBaseCost || 0;
      buildPiecePaidCost = ab.buildPiecePaidCost || 0;
      buildMirrorExtraCost = ab.buildMirrorExtraCost || 0;
      buildCycleExtraCost = ab.buildCycleExtraCost || 0;
      buildWallRemoveCost = ab.buildWallRemoveCost || 0;
      wallRemoveCount = ab.wallRemoveCount || 0;
      buildEncroachCost = ab.buildEncroachCost || 0;
      encroachCount = ab.encroachCount || 0;
      buildDemolishCost = ab.buildDemolishCost || 0;
      demolishCount = ab.demolishCount || 0;
      hintDismissedForBuild = !!ab.hintDismissedForBuild || (nextRoomId > 1);
      tutorialBuildStep = (ab.tutorialBuildStep !== undefined) ? ab.tutorialBuildStep : 0;
      selectedWallTarget = null;
      selectedDemolishTarget = null;
      demolishMode = false;
      buildRerollCost = ab.buildRerollCost || 0;
      deckCycle = ab.deckCycle || 1;

      const maxSlots = getMaxHandSlots();
      draftSlots = ab.draftSlots || Array(maxSlots).fill(null);
      keepStates = ab.keepStates || Array(maxSlots).fill(false);
      keepCounts = ab.keepCounts || Array(maxSlots).fill(0);
      discardCount = ab.discardCount || 0;
      handRefreshesRemaining = (ab.handRefreshesRemaining !== undefined) ? ab.handRefreshesRemaining : 0;
      drawPile = ab.drawPile || [];
      discardPile = ab.discardPile || [];
      while (draftSlots.length < maxSlots) {
        draftSlots.push(ab.screen === 'game' ? drawPieceFromDeck() : null);
        keepStates.push(false);
        keepCounts.push(0);
      }
      selectedSlot = (ab.selectedSlot !== null && ab.selectedSlot !== undefined) ? ab.selectedSlot : 0;
      selectedRot = ab.selectedRot || 0;
      isMirrored = !!ab.isMirrored;

      updateCompanyUI();
      updateBudgetUI();
      updateDeckPeekButton();
      updateHandRefreshButton();
      if (typeof syncDemolishModeButton === 'function') syncDemolishModeButton();

      if (ab.screen === 'result') {
        evaluate(true);
        showScreen('result');
        return true;
      } else if (ab.screen === 'game') {
        const _hdrT = document.getElementById('hdr-target-rent');
        if (_hdrT) _hdrT.innerHTML = `${STAGE.targetRent.toFixed(1)}<span style="font-size:9px;color:var(--c-text2);">万</span>`;
        const mbt = document.getElementById('mission-banner-text');
        if (mbt) {
          const spPrefix = STAGE.customCombo ? `✨特注[${STAGE.customCombo.name}] ／ ` : '';
          mbt.textContent = `${spPrefix}「${STAGE.requests.map(r=>r.text).join('・')}でお願い！」`;
        }
        syncHintOverlay(false);

        showScreen('game');
        resizeCanvas();
        renderDraftUI();
        updatePieceLabel();
        drawPlan();
        if (typeof updateRealtimeRent === 'function') updateRealtimeRent(true);
        return true;
      }
    } catch(e) {
      console.error('restoreActiveBuild error:', e);
      clearActiveBuild();
      return false;
    }
    return false;
  }

  /* ============================================================
     PIECE ROTATION
  ============================================================ */
  function rotateMatrix(mat, times=1) {
    let m = mat;
    const n = ((times % 4) + 4) % 4;
    for (let t = 0; t < n; t++) {
      const rows = m.length, cols = m[0].length;
      const r2 = Array.from({length:cols}, () => Array(rows).fill(0));
      for (let ri = 0; ri < rows; ri++)
        for (let ci = 0; ci < cols; ci++)
          r2[ci][rows-1-ri] = m[ri][ci];
      m = r2;
    }
    return m;
  }
  function mirrorMatrix(mat) {
    return mat.map(row => [...row].reverse());
  }
  function getCycleMultiplier(cycle = 1) {
    const c = Number(cycle) || 1;
    if (c <= 1) return 1.0;
    if (c === 2) return 1.25; // 2周目: +25%
    return 1.50;              // 3周目以降: +50%
  }
  function getCycleSurchargePct(cycle = 1) {
    const c = Number(cycle) || 1;
    if (c <= 1) return 0;
    if (c === 2) return 25;
    return 50;
  }
  function getMirrorCostMultiplier() {
    const flipLv = getFeatureLevel('freeFlip');
    const lvDef = UPGRADE_CONFIG?.features?.freeFlip?.levels?.[flipLv];
    return (lvDef && typeof lvDef.mult === 'number') ? lvDef.mult : (flipLv >= 2 ? 1.0 : (flipLv === 1 ? 1.1 : 1.2));
  }

  function getPieceCost(piece, mirrored = false, overrideCycle = null) {
    if (!piece) return 0;
    let base = piece.cost || 0;
    const plumbLv = getStaffSkillLevel('plumber');
    if (plumbLv > 0 && (piece.cat === T.BATH || piece.cat === T.TOILET || piece.cat === T.WASHROOM)) {
      const discount = [0, 0.90, 0.80, 0.70][plumbLv] || 0.90;
      base *= discount;
    }
    const storeLv = getStaffSkillLevel('storage_master');
    if (storeLv > 0 && piece.cat === T.CLOSET) {
      const discount = [0, 0.70, 0.50, 0.00][storeLv] !== undefined ? [0, 0.70, 0.50, 0.00][storeLv] : 0.50;
      base *= discount;
    }
    const brokerLv = getStaffSkillLevel('broker');
    if (brokerLv > 0) {
      const discount = [0, 0.95, 0.90, 0.85][brokerLv] || 0.95;
      base *= discount;
    }
    const pCycle = overrideCycle !== null ? overrideCycle : (piece.deckCycle || 1);
    base *= getCycleMultiplier(pCycle);
    if (!mirrored) {
      return Math.round(base * 10) / 10;
    }
    const flipMult = getMirrorCostMultiplier();
    return Math.round(base * flipMult * 10) / 10;
  }

  function getShape(piece, rot, mirror=false) {
    let m = piece.shape;
    m = rotateMatrix(m, rot);
    if (mirror) m = mirrorMatrix(m);
    return m;
  }

  function generateRandomWalls(shape) {
    const walls = [];
    const rows = shape.length, cols = shape[0].length;
    const edges = [];
    for(let r=0; r<rows; r++){
      for(let c=0; c<cols; c++){
        if(shape[r][c]===1){
          if(r===0 || shape[r-1][c]===0) edges.push({r,c,dir:'top'});
          if(r===rows-1 || shape[r+1][c]===0) edges.push({r,c,dir:'bottom'});
          if(c===0 || shape[r][c-1]===0) edges.push({r,c,dir:'left'});
          if(c===cols-1 || shape[r][c+1]===0) edges.push({r,c,dir:'right'});
        }
      }
    }
    // 最大値を「ピースの外周 - 1」に設定
    const maxWalls = Math.max(0, edges.length - 1);
    
    // 3つの乱数の平均を取ることで、擬似的な正規分布（ベルカーブ）を作る
    // これにより、両端（0 や maxWalls）が出にくく、中央付近が出やすくなる
    const r = (Math.random() + Math.random() + Math.random()) / 3;
    const count = Math.round(r * maxWalls);
    for(let i=0; i<count; i++){
      if(edges.length > 0) {
        const idx = Math.floor(Math.random() * edges.length);
        walls.push(edges[idx]);
        edges.splice(idx, 1);
      }
    }
    return walls;
  }

  function getRotatedWalls(piece, rot, mirror=false) {
    if (!piece.walls) return [];
    let currentShape = piece.shape;
    let currentWalls = JSON.parse(JSON.stringify(piece.walls));
    
    const n = ((rot % 4) + 4) % 4;
    for (let t = 0; t < n; t++) {
      const rows = currentShape.length;
      const nextWalls = [];
      for (const w of currentWalls) {
        const dirs = { 'top':'right', 'right':'bottom', 'bottom':'left', 'left':'top' };
        nextWalls.push({ r: w.c, c: rows - 1 - w.r, dir: dirs[w.dir] });
      }
      currentWalls = nextWalls;
      currentShape = rotateMatrix(currentShape, 1);
    }

    if (mirror) {
      const cols = currentShape[0].length;
      currentWalls = currentWalls.map(w => {
        let ndir = w.dir;
        if (w.dir === 'left') ndir = 'right';
        else if (w.dir === 'right') ndir = 'left';
        return { r: w.r, c: cols - 1 - w.c, dir: ndir };
      });
    }
    
    return currentWalls;
  }

  function hasSolidWall(r1, c1, r2, c2) {
    const c1_cell = grid[r1]?.[c1];
    if (c1_cell && c1_cell.walls) {
      if (r2 === r1 - 1 && c1_cell.walls.top) return true;
      if (r2 === r1 + 1 && c1_cell.walls.bottom) return true;
      if (c2 === c1 - 1 && c1_cell.walls.left) return true;
      if (c2 === c1 + 1 && c1_cell.walls.right) return true;
    }
    const c2_cell = grid[r2]?.[c2];
    if (c2_cell && c2_cell.walls) {
      if (r1 === r2 - 1 && c2_cell.walls.top) return true;
      if (r1 === r2 + 1 && c2_cell.walls.bottom) return true;
      if (c1 === c2 - 1 && c2_cell.walls.left) return true;
      if (c1 === c2 + 1 && c2_cell.walls.right) return true;
    }
    return false;
  }


  /* ============================================================
     DRAFT CONTROLLER
  ============================================================ */
  function getDiscardCostForNext(count) {
    const recLv = getStaffSkillLevel('recycle');
    const freeSlots = 5 + getFeatureLevel('extraRerolls') + recLv;
    let cost = 0;
    if (count < freeSlots) cost = 0;
    else if (count < freeSlots + 5) cost = 2.0;
    else if (count < freeSlots + 10) cost = 4.0;
    else cost = 8.0;

    if (cost > 0 && recLv > 0) {
      const disc = [0, 0.30, 0.50, 0.70][recLv] || 0.50;
      cost *= (1 - disc);
    }
    return Math.round(cost * 10) / 10;
  }

  function getKeepCost(count) {
    if (count === 0) return 0.0;
    return Math.pow(2, count - 1);
  }

  function getRerollCost() {
    let discardCost = 0;
    let keepCost = 0;
    let tempCount = discardCount;
    for (let i = 0; i < draftSlots.length; i++) {
      if (draftSlots[i] !== null) {
        if (!keepStates[i]) {
          discardCost += getDiscardCostForNext(tempCount);
          tempCount++;
        } else {
          keepCost += getKeepCost(keepCounts[i]);
        }
      }
    }
    return { total: Math.round((discardCost + keepCost) * 10) / 10, discard: Math.round(discardCost * 10) / 10, keep: keepCost };
  }

  let drawPile = [];
  let discardPile = [];


  function initDeckPiles() {
    if (isTutorialPuzzleActive()) {
      drawPile = ['k-1', 'toilet', 'bath'];
      discardPile = [];
      deckCycle = 1;
      updateDeckPeekButton();
      return;
    }
    const activeIds = getActiveDeckPieceIds();
    drawPile = shuffleArray(activeIds);
    discardPile = [];
    deckCycle = 1;
    updateDeckPeekButton();
  }

  function updateDeckPeekButton() {
    const el = document.getElementById('deck-peek-count');
    if (el) {
      const total = getActiveDeckPieceIds().length;
      if (deckCycle >= 2) {
        const pct = getCycleSurchargePct(deckCycle);
        el.innerHTML = `山札 ${drawPile.length}/${total} <span style="font-size:9px; color:#d97706;">(${deckCycle}周+${pct}%)</span>`;
      } else {
        el.textContent = `山札 ${drawPile.length}/${total}`;
      }
    }
  }

  function updateHandRefreshButton() {
    const btn = document.getElementById('btn-hand-refresh');
    const txt = document.getElementById('hand-refresh-count');
    if (!btn) return;
    const maxUses = getStaffSkillLevel('hand_refresh');
    if (maxUses <= 0) {
      btn.style.display = 'none';
      return;
    }
    btn.style.display = 'inline-flex';
    if (txt) txt.textContent = `引直 ${handRefreshesRemaining}/${maxUses}`;
    btn.disabled = (handRefreshesRemaining <= 0);
    btn.style.opacity = (handRefreshesRemaining <= 0) ? '0.45' : '1.0';
    btn.style.cursor = (handRefreshesRemaining <= 0) ? 'not-allowed' : 'pointer';
  }

  function refreshHand() {
    if (handRefreshesRemaining <= 0) return;
    initAudio();
    let returned = 0;
    for (let i = 0; i < draftSlots.length; i++) {
      if (draftSlots[i]) {
        drawPile.push(draftSlots[i].id);
        draftSlots[i] = null;
        returned++;
      }
      keepStates[i] = false;
      keepCounts[i] = 0;
    }
    if (returned === 0) return;
    drawPile = shuffleArray(drawPile);
    handRefreshesRemaining--;
    refillDraft();
    updateRerollButton();
    updateDeckPeekButton();
    updateHandRefreshButton();
    playSound('tap');
    if (typeof showFloatingText === 'function') {
      showFloatingText(`🔄 手札引き直し！（残り${handRefreshesRemaining}回）`, '#0284c7');
    }
    saveActiveBuild('game');
  }

  function drawPieceFromDeck() {
    if (isTutorialPuzzleActive()) {
      const pieceId = drawPile.length > 0 ? drawPile.pop() : 'k-1';
      return makeTutorialPiece(pieceId, pieceId === 'bath');
    }
    if (drawPile.length === 0) {
      if (discardPile.length > 0) {
        drawPile = shuffleArray(discardPile);
        discardPile = [];
        deckCycle = (deckCycle || 1) + 1;
        if (typeof showFloatingText === 'function' && screens.game?.classList.contains('active')) {
          const pct = getCycleSurchargePct(deckCycle);
          showFloatingText(`🔄 山札${deckCycle}周目！（追加発注 +${pct}%）`, '#f59e0b');
        }
      } else {
        drawPile = shuffleArray(getActiveDeckPieceIds());
      }
    }
    const pieceId = drawPile.pop();
    const basePiece = PIECE_MAP[pieceId] || PIECE_LIB[0];
    const piece = JSON.parse(JSON.stringify(basePiece));
    piece.walls = generateRandomWalls(piece.shape);
    piece.deckCycle = deckCycle || 1;
    updateDeckPeekButton();
    return piece;
  }

  function generatePiece() {
    return drawPieceFromDeck();
  }

  function refillDraft() {
    if (isTutorialPuzzleActive()) {
      draftSlots = [
        makeTutorialPiece('corr-i2', false),
        makeTutorialPiece('room-22', false),
        makeTutorialPiece('dk-22', false)
      ];
      keepStates = [false, false, false];
      keepCounts = [0, 0, 0];
      updateDeckPeekButton();
      updateHandRefreshButton();
      renderDraftUI();
      return;
    }
    const maxSlots = getMaxHandSlots();
    while (draftSlots.length < maxSlots) {
      draftSlots.push(null);
      keepStates.push(false);
      keepCounts.push(0);
    }
    for (let i = 0; i < maxSlots; i++) {
      if (!draftSlots[i]) {
        draftSlots[i] = drawPieceFromDeck();
        keepStates[i] = false;
        keepCounts[i] = 0;
      }
    }
    updateDeckPeekButton();
    updateHandRefreshButton();
    renderDraftUI();
  }

  function renderMiniPieceShape(piece, cellPx = 10) {
    if (!piece || !piece.shape) return '';
    const shape = piece.shape;
    const rows = shape.length, cols = shape[0].length;
    const style = (typeof DXStage3 !== 'undefined' && DXStage3.getCellStyle(piece)) || CELL_STYLE[piece.cat] || { bg:'#e2e8f0', border:'#94a3b8' };
    let html = `<div style="display:inline-grid; grid-template-columns:repeat(${cols},${cellPx}px); gap:1px; vertical-align:middle;">`;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const filled = shape[r][c] === 1;
        html += `<div style="width:${cellPx}px; height:${cellPx}px; border-radius:2px; box-sizing:border-box; background:${filled ? style.bg : 'transparent'}; ${filled ? `border:1.5px solid ${style.border};` : ''}"></div>`;
      }
    }
    html += `</div>`;
    return html;
  }
  function createCardElement(piece, isSelected, clickHandler, slotIdx = null) {
    const card = document.createElement('div');
    card.className = 'draft-card' + (isSelected ? ' selected' : '');
    const shape = isSelected ? getShape(piece, selectedRot, isMirrored) : piece.shape;
    const rows = shape.length, cols = shape[0].length;
    const style = (typeof DXStage3 !== 'undefined' && DXStage3.getCellStyle(piece)) || CELL_STYLE[piece.cat] || { bg:'#e2e8f0', border:'#94a3b8' };
    const pCycle = piece.deckCycle || 1;
    let cycleBadgeHtml = '';
    if (pCycle >= 2) {
      const pct = getCycleSurchargePct(pCycle);
      const bgCol = pCycle >= 3 ? '#e11d48' : '#d97706';
      cycleBadgeHtml = `<span style="position:absolute; top:2px; right:3px; font-size:8px; font-weight:800; color:#fff; background:${bgCol}; padding:0px 3.5px; border-radius:4px; line-height:1.25; z-index:2; pointer-events:none;">${pCycle}周+${pct}%</span>`;
    }
    const keyBadgeHtml = (slotIdx !== null && slotIdx >= 0 && slotIdx < 9)
      ? `<span class="pc-slot-key">${slotIdx + 1}</span>`
      : '';
    let miniHtml = `${cycleBadgeHtml}${keyBadgeHtml}<div class="draft-card-preview"><div class="mini-grid" style="grid-template-columns:repeat(${cols}, var(--mini-cell-size, 13px));">`;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const filled = shape[r][c] === 1;
        miniHtml += `<div class="mini-cell" style="position:relative; background:${filled ? style.bg : 'transparent'};${
filled ? `border:1.5px solid ${style.border};` : ''}">`;
        if (filled && piece.walls) {
           const rw = getRotatedWalls(piece, isSelected ? selectedRot : 0, isSelected ? isMirrored : false);
           for (const w of rw) {
             if (w.r === r && w.c === c) {
               const wallColor = '#ef4444';
               const wallWidth = '3px';
               if (w.dir === 'top') miniHtml += `<div style="position:absolute; top:-1.5px; left:-1.5px; right:-1.5px; height:${wallWidth}; background:${wallColor}; border-radius:1px;"></div>`;
               if (w.dir === 'bottom') miniHtml += `<div style="position:absolute; bottom:-1.5px; left:-1.5px; right:-1.5px; height:${wallWidth}; background:${wallColor}; border-radius:1px;"></div>`;
               if (w.dir === 'left') miniHtml += `<div style="position:absolute; top:-1.5px; bottom:-1.5px; left:-1.5px; width:${wallWidth}; background:${wallColor}; border-radius:1px;"></div>`;
               if (w.dir === 'right') miniHtml += `<div style="position:absolute; top:-1.5px; bottom:-1.5px; right:-1.5px; width:${wallWidth}; background:${wallColor}; border-radius:1px;"></div>`;
             }
           }
        }
        miniHtml += `</div>`;
      }
    }
    miniHtml += `</div></div>`;
    card.innerHTML = miniHtml + `<span class="draft-card-name">${piece.name}</span>`;
    card.addEventListener('pointerdown', clickHandler);
    return card;
  }

  function renderDraftUI() {
    const container = document.getElementById('draft-container');
    container.innerHTML = '';
    const isScrollable = draftSlots.length > 3;
    
    draftSlots.forEach((piece, idx) => {
      const isSel = (idx === selectedSlot);
      const wrap = document.createElement('div');
      wrap.style.display = 'flex';
      wrap.style.flexDirection = 'column';
      wrap.style.gap = '4px';
      if (isScrollable) {
        // 3枚表示時とほぼ同じ幅を保ちつつ、4枚目の左端がチラッと見える幅（約3.22枚分）にして横スライド可能と直感的に伝える
        wrap.style.flex = '0 0 calc((100% - 16px) / 3.22)';
        wrap.style.minWidth = '88px';
        wrap.style.scrollSnapAlign = 'start';
      } else {
        wrap.style.flex = '1 1 0';
        wrap.style.minWidth = '0';
      }

      if (piece) {
        const tutStep = getCurrentTutorialStep();
        const isLockedInTut = !!(tutStep && tutStep.slot !== idx);
        const card = createCardElement(piece, isSel, () => {
          initAudio();
          cancelRerollConfirm();
          selectedWallTarget = null;
          selectedDemolishTarget = null;
          demolishMode = false;
          if (typeof syncDemolishModeButton === 'function') syncDemolishModeButton();
          if (tutStep) {
            if (tutStep.slot !== idx) {
              playSound('tap');
              showFloatingText(getTutorialHintText() || '順番に進めよう', '#fbbf24');
              return;
            }
            // チュートリアル配置ステップ中は再タップでうっかり解除しない
            selectedSlot = idx;
            playSound('tap');
            renderDraftUI();
            updatePieceLabel();
            drawPlan();
            return;
          }
          if (selectedSlot === idx) {
            // 選択中のピースを再タップ -> 選択解除！
            selectedSlot = null;
            selectedRot = 0;
            isMirrored = false;
            hoverCell = null;
            previewMode = false;
            showConfirmUI(false);
            playSound('tap');
          } else {
            selectedSlot = idx;
            selectedRot = 0;
            isMirrored = false;
            hoverCell = null;
            previewMode = false;
            showConfirmUI(false);
            playSound('rotate');
          }
          renderDraftUI();
          updatePieceLabel();
          drawPlan();
        }, idx);
        if (isLockedInTut) card.classList.add('tutorial-locked');
        if (keepStates[idx]) card.classList.add('is-kept');

        const keepBtn = document.createElement('button');
        keepBtn.type = 'button';
        keepBtn.className = 'card-keep-btn' + (keepStates[idx] ? ' kept' : '');
        const kCost = getKeepCost(keepCounts[idx]);
        keepBtn.title = kCost > 0 ? `ロック維持 (更新時 -${kCost}万)` : 'ロック維持 (更新で残す)';
        keepBtn.textContent = keepStates[idx] ? (kCost > 0 ? `🔒-${kCost}万` : '🔒KEEP') : '🔓keep';
        if (tutStep) {
          keepBtn.classList.add('tutorial-locked');
          keepBtn.disabled = true;
        }
        keepBtn.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
        });
        keepBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (isTutorialPuzzleActive()) return;
          initAudio();
          playSound('tap');
          cancelRerollConfirm();
          keepStates[idx] = !keepStates[idx];
          renderDraftUI();
          saveActiveBuild('game');
        });
        card.appendChild(keepBtn);
        wrap.appendChild(card);
      } else {
        const emptyCard = document.createElement('div');
        emptyCard.className = 'draft-card';
        emptyCard.style.opacity = '0.3';
        emptyCard.style.display = 'flex';
        emptyCard.style.alignItems = 'center';
        emptyCard.style.justifyContent = 'center';
        emptyCard.innerHTML = '<span style="font-size:11px;">空枠</span>';
        wrap.appendChild(emptyCard);
      }

      container.appendChild(wrap);
    });

    const hasSel = (selectedSlot !== null && draftSlots[selectedSlot] !== null);
    const btnRotate = document.getElementById('btn-rotate');
    const btnMirror = document.getElementById('btn-mirror');
    if (btnRotate) {
      btnRotate.disabled = !hasSel;
      btnRotate.style.opacity = hasSel ? '1' : '0.4';
      btnRotate.style.cursor = hasSel ? 'pointer' : 'not-allowed';
    }
    if (btnMirror) {
      btnMirror.disabled = !hasSel;
      btnMirror.style.opacity = hasSel ? '1' : '0.4';
      btnMirror.style.cursor = hasSel ? 'pointer' : 'not-allowed';
    }

    updatePieceLabel();
    updateRerollButton();
    updateMirrorButton();
    syncTutorialPuzzleUI();
    syncHintOverlay(previewMode || !!selectedWallTarget || !!selectedDemolishTarget);
  }

  let isRerollConfirming = false;
  let rerollConfirmTimer = null;

  function cancelRerollConfirm() {
    if (isRerollConfirming) {
      isRerollConfirming = false;
      if (rerollConfirmTimer) {
        clearTimeout(rerollConfirmTimer);
        rerollConfirmTimer = null;
      }
      updateRerollButton();
    }
  }

  function updateRerollButton() {
    const btn = document.getElementById('btn-reroll');
    if (!btn) return;
    
    let canReroll = false;
    for (let i = 0; i < draftSlots.length; i++) {
      if (draftSlots[i] === null) {
        canReroll = true; // 空枠補充のため
      } else if (!keepStates[i]) {
        canReroll = true; // 破棄できるピースがあるため
      }
    }
    
    if (!canReroll) {
      btn.disabled = true;
      btn.style.opacity = '0.4';
      btn.style.cursor = 'not-allowed';
      btn.style.background = '';
      btn.style.borderColor = '';
      btn.style.boxShadow = '';
      btn.style.color = '';
      btn.innerHTML = `<i class="ph-bold ph-arrows-clockwise" style="color:var(--c-text3);"></i> 更新不可`;
    } else {
      const costs = getRerollCost();
      const recLv = getStaffSkillLevel('recycle');
      const freeLimit = 5 + getFeatureLevel('extraRerolls') + recLv;
      const freeRemain = Math.max(0, freeLimit - discardCount);
      const overRate = getDiscardCostForNext(Math.max(discardCount, freeLimit));
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
      const costText = costs.total === 0 ? `無料残${freeRemain}枚` : `-${costs.total.toFixed(1)}万`;
      const nextCost = getDiscardCostForNext(discardCount);
      let subText = '';
      if (costs.total === 0) {
        subText = `無料枠 ${discardCount}/${freeLimit} (+${overRate.toFixed(1)}万)`;
      } else {
        subText = freeRemain > 0
          ? `無料${freeRemain}＋超過+${costs.discard.toFixed(1)}万`
          : `破棄${discardCount} (次+${nextCost.toFixed(1)}万)`;
        if (costs.keep > 0) subText += `+維持${costs.keep.toFixed(1)}万`;
      }

      if (isRerollConfirming) {
        btn.style.background = costs.total > 0 ? '#7f1d1d' : '#78350f';
        btn.style.borderColor = costs.total > 0 ? '#f87171' : '#f59e0b';
        btn.style.boxShadow = costs.total > 0 ? '0 0 12px rgba(248, 113, 113, 0.5)' : '0 0 10px rgba(245, 158, 11, 0.45)';
        btn.style.color = costs.total > 0 ? '#fecdd3' : '#fef08a';
        const confirmHead = costs.total > 0 ? `⚠️ -${costs.total.toFixed(1)}万で更新` : '再タップで更新';
        const confirmSub = costs.total > 0 ? '再タップで実行 (資金消費)' : `無料枠消費 (残${freeRemain}枚)`;
        btn.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center;">
          <div style="font-weight:bold; font-size:10px; white-space:nowrap;"><i class="ph-bold ph-warning-circle" style="color:${costs.total > 0 ? '#fca5a5' : '#fde047'};"></i> ${confirmHead}</div>
          <div style="font-size:8px; color:${costs.total > 0 ? '#fda4af' : '#fde68a'}; margin-top:1px; white-space:nowrap;">${confirmSub}</div>
        </div>`;
      } else {
        btn.style.background = '';
        btn.style.borderColor = costs.total > 0 ? 'rgba(251, 191, 36, 0.45)' : '';
        btn.style.boxShadow = '';
        btn.style.color = '';
        const labelColor = costs.total > 0 ? '#fbbf24' : 'inherit';
        btn.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center;">
          <div style="color:${labelColor}; white-space:nowrap;"><i class="ph-bold ph-arrows-clockwise" style="color:${costs.total > 0 ? '#fbbf24' : 'var(--c-blue)'};"></i> 更新 (${costText})</div>
          <div style="font-size:8px; color:var(--c-text3); margin-top:1px; white-space:nowrap;">${subText}</div>
        </div>`;
      }
    }
  }

  function getWallRemoveCost(count = wallRemoveCount) {
    const table = [5.0, 10.0, 20.0, 40.0];
    return table[Math.min(Math.max(0, count || 0), table.length - 1)];
  }

  // 現在の敷地の初期有効面積（T.OBSTACLE 以外のマス数）を返す
  function getBaseLotArea(stage = STAGE) {
    if (!stage) return 100;
    const obsSet = new Set();
    if (stage.obstacles) {
      for (const obs of stage.obstacles) {
        for (let r = obs.r; r < obs.r + (obs.h || 1); r++) {
          for (let c = obs.c; c < obs.c + (obs.w || 1); c++) {
            if (r >= 0 && r < GRID && c >= 0 && c < GRID) obsSet.add(`${r},${c}`);
          }
        }
      }
    }
    return Math.max(1, (GRID * GRID) - obsSet.size);
  }

  // 指定位置にshapeを置いた際に重なる T.OBSTACLE（✕マス）の数と造成費用を算出
  // 1マスあたり: (造成後の総面積 = baseLotArea + 既存造成数 + 1) × (1.0 + 既存造成数 × 0.2) 万円
  function getEncroachCostForPlacement(gr, gc, shape) {
    if (!shape || !grid || !grid.length) return { count: 0, cost: 0 };
    const sr = shape.length, sc = shape[0].length;
    if (gr < 0 || gc < 0 || gr + sr > GRID || gc + sc > GRID) return { count: 0, cost: 0 };
    let count = 0;
    for (let r = 0; r < sr; r++) {
      for (let c = 0; c < sc; c++) {
        if (shape[r][c] === 1 && grid[gr + r]?.[gc + c]?.type === T.OBSTACLE) {
          count++;
        }
      }
    }
    if (count === 0) return { count: 0, cost: 0 };
    const baseArea = getBaseLotArea(STAGE);
    const curCount = encroachCount || 0;
    let totalCost = 0;
    for (let i = 0; i < count; i++) {
      const n = curCount + i;
      const expandedArea = baseArea + n + 1;
      const mult = 1.0 + n * 0.2;
      totalCost += Math.round((expandedArea * mult) * 10) / 10;
    }
    return { count, cost: Math.round(totalCost * 10) / 10 };
  }

  function updatePieceLabel() {
    const p = (selectedSlot !== null) ? draftSlots[selectedSlot] : null;
    const cost = p ? getPieceCost(p, isMirrored).toFixed(1) : '0.0';
    const pCycle = p ? (p.deckCycle || 1) : 1;
    const cycleTag = pCycle >= 2 ? ` <span style="font-size:10px; color:#fbbf24;">[${pCycle}周目+${getCycleSurchargePct(pCycle)}%]</span>` : '';
    const pl = document.getElementById('piece-label');
    if (pl) {
      if (p) {
        pl.innerHTML = `<span style="color:var(--c-text2); font-size:11px;">選択中: <strong style="color:var(--c-text);">${p.name}</strong></span> <span style="color:${pCycle >= 2 ? '#fbbf24' : 'var(--c-emerald)'}; font-weight:bold; font-size:12px;">(${cost}万)</span>${cycleTag}`;
      } else {
        const wCost = getWallRemoveCost().toFixed(1);
        const demoHint = (STAGE && STAGE.renovation && typeof DXStage2 !== 'undefined' && DXStage2.hasDemolishableCells(grid))
          ? ` / 既存部屋タップ解体`
          : '';
        pl.innerHTML = `<span style="color:var(--c-text2); font-size:10.5px;">未選択 <span style="color:#fca5a5;">(🔨壁撤去 ${wCost}万${demoHint})</span></span>`;
      }
    }
      
    const btnMirror = document.getElementById('btn-mirror');
    if (btnMirror) {
      if (isMirrored && p) {
        btnMirror.style.background = '#e0e7ff';
        btnMirror.style.borderColor = '#6366f1';
      } else {
        btnMirror.style.background = '';
        btnMirror.style.borderColor = '';
      }
    }
    updateMirrorButton();
  }

  function updateMirrorButton() {
    const sub = document.getElementById('btn-mirror-sub');
    const mult = getMirrorCostMultiplier();
    const pct = Math.round((mult - 1) * 100);
    if (sub) {
      if (mult <= 1.0) {
        sub.textContent = '無料';
        sub.style.color = isMirrored ? '#047857' : 'var(--c-emerald)';
        sub.style.fontWeight = 'bold';
      } else {
        sub.textContent = `+${pct}%`;
        sub.style.color = isMirrored ? '#4338ca' : 'var(--c-text2)';
        sub.style.fontWeight = 'normal';
      }
    }
    const cmBtn = document.getElementById('btn-confirm-mirror');
    const cmLbl = document.getElementById('btn-confirm-mirror-label');
    if (cmBtn) cmBtn.classList.toggle('is-mirrored', !!isMirrored);
    if (cmLbl) {
      if (mult <= 1.0) cmLbl.textContent = isMirrored ? '反転中' : '反転';
      else cmLbl.textContent = `反転+${pct}%`;
    }
  }

  function updateBudgetUI() {
    const el = document.getElementById('hdr-budget');
    if (el) {
      el.innerHTML = `${budget.toFixed(1)}<span style="font-size:9px;color:var(--c-text2);">万</span>`;
      el.style.color = budget < 0 ? 'var(--c-rose)' : 'var(--c-emerald)';
    }
    const spentEl = document.getElementById('hdr-spent-cost');
    const breakEl = document.getElementById('hdr-cost-breakdown');
    const totalSpent = Math.round((buildPiecePaidCost + buildRerollCost + buildWallRemoveCost + buildEncroachCost + (buildDemolishCost || 0)) * 10) / 10;
    const extraSpent = Math.round((buildMirrorExtraCost + buildCycleExtraCost + buildRerollCost + buildWallRemoveCost + buildEncroachCost + (buildDemolishCost || 0)) * 10) / 10;
    const discountSaved = Math.max(0, Math.round((buildBaseCost - (buildPiecePaidCost - buildMirrorExtraCost - buildCycleExtraCost)) * 10) / 10);
    if (spentEl) {
      spentEl.innerHTML = `${totalSpent.toFixed(1)}<span style="font-size:9px;color:var(--c-text2);">万</span>`;
    }
    if (breakEl) {
      const discText = discountSaved > 0 ? `(引-${discountSaved.toFixed(1)})` : '';
      breakEl.textContent = `原価${buildBaseCost.toFixed(1)}${discText} / 諸${extraSpent.toFixed(1)}`;
      breakEl.style.color = extraSpent > 0 ? '#fcd34d' : '#94a3b8';
    }
  }

  /* ============================================================
     CANVAS / RENDERER
  ============================================================ */
  const canvas    = document.getElementById('plan-canvas');
  const ctx       = canvas.getContext('2d');
  const ctnr      = document.getElementById('canvas-container');

  function resizeCanvas() {
    const parent = document.querySelector('.canvas-area');
    const cs = window.getComputedStyle(parent);
    const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const pw = parent.clientWidth - padX - 4;
    const ph = parent.clientHeight - padY - 4;
    const maxDim = window.innerWidth >= 769 ? 648 : 520;
    const dim = Math.max(GRID * 8, Math.min(pw, ph, maxDim));
    cellSize = Math.floor(dim / GRID);
    const total = cellSize * GRID;

    canvas.width  = total * devicePixelRatio;
    canvas.height = total * devicePixelRatio;
    canvas.style.width  = `${total}px`;
    canvas.style.height = `${total}px`;
    ctx.resetTransform();
    ctx.scale(devicePixelRatio, devicePixelRatio);
    ctx.imageSmoothingEnabled = false;
    drawPlan();
    if ((previewMode && hoverCell) || selectedWallTarget || selectedDemolishTarget) {
      showConfirmUI(true);
    }
  }

  function drawTutorialTargetOverlay() {
    const step = getCurrentTutorialStep();
    if (!step || step.targetR === undefined) return;
    const x = step.targetC * cellSize;
    const y = step.targetR * cellSize;
    const w = step.targetW * cellSize;
    const h = step.targetH * cellSize;

    ctx.save();
    ctx.fillStyle = 'rgba(251, 191, 36, 0.16)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = Math.max(2, cellSize * 0.06);
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(x + 2, y + 2, Math.max(4, w - 4), Math.max(4, h - 4));
    ctx.setLineDash([]);

    if (!previewMode && cellSize >= 18) {
      const label = 'ここへ';
      const fs = Math.max(9, Math.min(11, Math.round(cellSize * 0.25)));
      ctx.font = `900 ${fs}px "Zen Kaku Gothic New", sans-serif`;
      const tw = ctx.measureText(label).width;
      const bw = tw + 8;
      const bh = fs + 5;
      const bx = x + Math.max(2, (w - bw) / 2);
      const by = y + Math.max(2, (h - bh) / 2);
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 4);
      else ctx.rect(bx, by, bw, bh);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, bx + bw / 2, by + bh / 2 + 0.5);
    }
    ctx.restore();
  }

  window.pixelPreviewMode = window.pixelPreviewMode || false;

  function drawPlan() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const reachableSet = (typeof runBFS === 'function' && STAGE) ? runBFS() : null;
    if (window.pixelPreviewMode && window.PixelRenderer) {
      try {
        const hasActiveSelection = Boolean((selectedSlot !== null && draftSlots[selectedSlot]) || selectedWallTarget || selectedDemolishTarget || hoverCell);
        PixelRenderer.drawPixelBoard(ctx, grid, cellSize, {
          showFurniture: false,
          showBlueprintOverlay: hasActiveSelection,
          showSolidRedOverlay: true,
          selectedDemolishTarget: selectedDemolishTarget,
          demolishMode: demolishMode,
          stageObj: STAGE
        });
        drawOccupiedBoxOverlay(ctx, grid, cellSize, true);
        drawTutorialTargetOverlay();
        drawPreview(reachableSet);
      } catch(e) { console.error('pixel drawPlan error:', e); }
      return;
    }
    try { drawCells(reachableSet); } catch(e) { console.error('drawCells error:', e); }
    try {
      if (typeof DXStage2 !== 'undefined') {
        DXStage2.drawBlueprintLocationOverlay(ctx, grid, STAGE, cellSize, false);
        DXStage2.drawBlueprintRenovationOverlays(ctx, grid, cellSize, {
          selectedDemolishTarget: selectedDemolishTarget,
          demolishMode: demolishMode,
          showBadges: true
        });
      }
    } catch(e) { console.error('stage2 blueprint overlay error:', e); }
    try { drawOccupiedBoxOverlay(ctx, grid, cellSize, true); } catch(e) { console.error('drawOccupiedBoxOverlay error:', e); }
    try { drawArchLines(); } catch(e) { console.error('drawArchLines error:', e); }
    try { drawLabels(reachableSet); } catch(e) { console.error('drawLabels error:', e); }
    try { drawEntrance(); } catch(e) { console.error('drawEntrance error:', e); }
    try { drawTutorialTargetOverlay(); } catch(e) { console.error('drawTutorialTargetOverlay error:', e); }
    try { drawPreview(reachableSet); } catch(e) { console.error('drawPreview error:', e); }
  }

  // 建築中の占有長方形（最小包含長方形）の境界破線を描画する共通ヘルパー
  function drawOccupiedBoxOverlay(targetCtx, targetGrid, cs, isLiveBuild = false, isCompact = false) {
    const fp = calcFootprintStats(targetGrid);
    if (!fp || !fp.bbox || (isLiveBuild && !fp.hasPlacedPiece)) return;
    const { minR, minC, w, h } = fp.bbox;
    const bx = minC * cs;
    const by = minR * cs;
    const bw = w * cs;
    const bh = h * cs;

    targetCtx.save();
    targetCtx.strokeStyle = isLiveBuild ? 'rgba(22, 163, 74, 0.7)' : 'rgba(21, 128, 61, 0.85)';
    targetCtx.lineWidth = isCompact ? 1.5 : 2;
    targetCtx.setLineDash(isCompact ? [3, 2] : [5, 3]);
    targetCtx.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
    targetCtx.setLineDash([]);
    targetCtx.restore();
  }

  function isCellAdjacentToStructure(r, c) {
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of dirs) {
      const nb = grid[r + dr]?.[c + dc];
      if (nb && nb.type !== T.EMPTY && nb.type !== T.OBSTACLE && nb.type !== T.GARDEN) {
        return true;
      }
    }
    return false;
  }

  function drawCells(reachableSet = null) {
    const fp = calcFootprintStats(grid);
    const bbox = (fp && fp.hasPlacedPiece) ? fp.bbox : null;
    const highlightConnectable = (selectedSlot !== null && !!draftSlots[selectedSlot]);

    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const cell = grid[r][c];
        const inBox = bbox && r >= bbox.minR && r <= bbox.maxR && c >= bbox.minC && c <= bbox.maxC;
        const x = c * cellSize, y = r * cellSize;
        const isAdjConnectable = (cell.type === T.EMPTY && highlightConnectable && isCellAdjacentToStructure(r, c));
        const isPlacedRoom = (cell.type !== T.EMPTY && cell.type !== T.GARDEN && cell.type !== T.OBSTACLE && cell.type !== T.ENTRANCE);
        const isUnreachableRoom = !!(isPlacedRoom && reachableSet && !reachableSet.has(`${r},${c}`));

        if (cell.type === T.EMPTY || cell.type === T.GARDEN) {
          if (cell.type === T.EMPTY && highlightConnectable) {
            if (isAdjConnectable) {
              ctx.fillStyle = inBox ? '#f0fdf4' : '#ffffff';
            } else {
              // 未接続の遠い空きマスは明度を少し落とし、接続可能な隣接マスを際立たせる
              ctx.fillStyle = inBox ? '#e2f2c0' : '#e5ebf3';
            }
          } else {
            // 占有長方形の内側の空き地は「庭（薄緑）」、外側は「未使用敷地（白グレー）」
            ctx.fillStyle = inBox ? '#ecfccb' : '#f8fafc';
          }
        } else {
          const s = (typeof DXStage3 !== 'undefined' && DXStage3.getCellStyle(cell)) || CELL_STYLE[cell.type] || CELL_STYLE[T.EMPTY];
          ctx.fillStyle = s.bg;
        }
        ctx.fillRect(x, y, cellSize, cellSize);

        // 玄関から到達できない孤立部屋は視覚的にわかるよう控えめに暗転
        if (isUnreachableRoom) {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.30)';
          ctx.fillRect(x, y, cellSize, cellSize);
        }

        // Connectable frontier subtle border & glow
        if (isAdjConnectable) {
          ctx.save();
          ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
          ctx.fillRect(x, y, cellSize, cellSize);
          ctx.strokeStyle = 'rgba(14, 165, 233, 0.6)';
          ctx.lineWidth = 1.25;
          ctx.setLineDash([3, 2]);
          ctx.strokeRect(x + 1.5, y + 1.5, Math.max(2, cellSize - 3), Math.max(2, cellSize - 3));
          ctx.restore();
        }
        
        if (cell.type === T.OBSTACLE) {
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x, y); ctx.lineTo(x+cellSize, y+cellSize);
          ctx.moveTo(x+cellSize, y); ctx.lineTo(x, y+cellSize);
          ctx.stroke();
        }

        // Grid guide
        ctx.strokeStyle = isAdjConnectable
          ? '#7dd3fc'
          : ((inBox && (cell.type === T.EMPTY || cell.type === T.GARDEN)) ? '#bef264' : (highlightConnectable && cell.type === T.EMPTY ? '#d3dce8' : '#e2e8f0'));
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, cellSize, cellSize);
      }
    }
  }

  function isPreviewReachableFromVisited(gr, gc, shape, rw, reachableSet) {
    if (!reachableSet) return true;
    const wallSet = new Set((rw || []).map(w => `${w.r},${w.c},${w.dir}`));
    const dirs = [
      { dr: -1, dc: 0, dir: 'top', opp: 'bottom' },
      { dr: 1, dc: 0, dir: 'bottom', opp: 'top' },
      { dr: 0, dc: -1, dir: 'left', opp: 'right' },
      { dr: 0, dc: 1, dir: 'right', opp: 'left' }
    ];
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[0].length; c++) {
        if (shape[r][c] !== 1) continue;
        const absR = gr + r, absC = gc + c;
        for (const d of dirs) {
          const nr = absR + d.dr, nc = absC + d.dc;
          if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID) continue;
          if (!reachableSet.has(`${nr},${nc}`)) continue;
          if (wallSet.has(`${r},${c},${d.dir}`)) continue;
          const nb = grid[nr]?.[nc];
          if (nb && nb.walls && nb.walls[d.opp]) continue;
          return true;
        }
      }
    }
    return false;
  }

  function drawPreview(reachableSet = null) {
    if (selectedWallTarget) {
      ctx.save();
      const { r1, c1, r2, c2 } = selectedWallTarget;
      let x1, y1, x2, y2;
      if (r1 === r2) {
        const col = Math.max(c1, c2);
        x1 = x2 = col * cellSize;
        y1 = r1 * cellSize;
        y2 = (r1 + 1) * cellSize;
      } else {
        const row = Math.max(r1, r2);
        x1 = c1 * cellSize;
        x2 = (c1 + 1) * cellSize;
        y1 = y2 = row * cellSize;
      }
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.55)';
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 4;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    if (!hoverCell) return;
    const piece = draftSlots[selectedSlot];
    if (!piece) return;
    const shape = getShape(piece, selectedRot, isMirrored);
    const rw = getRotatedWalls(piece, selectedRot, isMirrored);
    const { valid } = evaluatePiecePlacement(hoverCell.r, hoverCell.c, piece, selectedRot, isMirrored);
    const previewConnects = !valid || isPreviewReachableFromVisited(hoverCell.r, hoverCell.c, shape, rw, reachableSet);
    const tutStep = getCurrentTutorialStep();
    const tutOrientMismatch = !!(tutStep && !isTutorialOrientationMatch(tutStep));
    ctx.save();
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[0].length; c++) {
        if (shape[r][c] !== 1) continue;
        const gr = hoverCell.r + r, gc = hoverCell.c + c;
        const x = gc * cellSize;
        const y = gr * cellSize;
        const isObs = grid[gr]?.[gc]?.type === T.OBSTACLE;
        if (!valid) {
          ctx.fillStyle = 'rgba(239,68,68,0.35)';
          ctx.strokeStyle = '#dc2626';
        } else if (!previewConnects) {
          // 仮置きは可能だがこの向きでは未接続になる場合、文字を出さず控えめなくすみ色で知らせる
          ctx.fillStyle = isObs ? 'rgba(146, 64, 14, 0.28)' : 'rgba(51, 65, 85, 0.30)';
          ctx.strokeStyle = isObs ? '#92400e' : '#475569';
        } else if (tutOrientMismatch) {
          ctx.fillStyle = 'rgba(245, 158, 11, 0.28)';
          ctx.strokeStyle = '#d97706';
        } else if (isObs) {
          ctx.fillStyle = 'rgba(245,158,11,0.45)';
          ctx.strokeStyle = '#d97706';
        } else {
          ctx.fillStyle = 'rgba(59,130,246,0.35)';
          ctx.strokeStyle = '#2563eb';
        }
        ctx.fillRect(x, y, cellSize, cellSize);
        ctx.lineWidth = 2;
        ctx.setLineDash([4,4]);
        ctx.strokeRect(x+2, y+2, cellSize-4, cellSize-4);
        ctx.setLineDash([]);
      }
    }
    // プレビュー上に壁ギミックを赤い太線で表示
    for (const w of rw) {
      const x = (hoverCell.c + w.c) * cellSize;
      const y = (hoverCell.r + w.r) * cellSize;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.setLineDash([]);
      ctx.beginPath();
      if (w.dir === 'top')    { ctx.moveTo(x, y); ctx.lineTo(x + cellSize, y); }
      if (w.dir === 'bottom') { ctx.moveTo(x, y + cellSize); ctx.lineTo(x + cellSize, y + cellSize); }
      if (w.dir === 'left')   { ctx.moveTo(x, y); ctx.lineTo(x, y + cellSize); }
      if (w.dir === 'right')  { ctx.moveTo(x + cellSize, y); ctx.lineTo(x + cellSize, y + cellSize); }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawLabels(reachableSet = null) {
    const rooms = {};
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const cell = grid[r][c];
        if (!cell.roomId || cell.type === T.EMPTY || cell.type === T.ENTRANCE) continue;
        if (!rooms[cell.roomId]) rooms[cell.roomId] = { cells:[], label:cell.label, type:cell.type, unreachable: false };
        rooms[cell.roomId].cells.push({r,c});
        if (reachableSet && !reachableSet.has(`${r},${c}`)) {
          rooms[cell.roomId].unreachable = true;
        }
      }
    }
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const id in rooms) {
      const rm = rooms[id];
      if (rm.type === T.LDK) {
        if (rm.cells.length <= 1) rm.label = 'K';
        else if (rm.cells.length <= 4) rm.label = 'DK';
        else rm.label = 'LDK';
      }
      const { cells, label, unreachable } = rm;
      let ax = 0, ay = 0;
      cells.forEach(({r,c}) => { ax += (c+0.5)*cellSize; ay += (r+0.5)*cellSize; });
      ax /= cells.length; ay /= cells.length;
      ctx.fillStyle = '#0f172a';
      ctx.font = `bold ${Math.max(9, cellSize*0.22)}px "Zen Kaku Gothic New", sans-serif`;
      ctx.fillText(label, ax, ay - (cells.length > 1 ? 5 : 0));
      if (cells.length > 1) {
        ctx.fillStyle = unreachable ? '#334155' : '#64748b';
        ctx.font = `${Math.max(8, cellSize*0.17)}px "Space Grotesk", sans-serif`;
        ctx.fillText(`${cells.length}帖`, ax, ay + cellSize*0.18);
      }
      if (unreachable && cellSize >= 20) {
        // 部屋文字と重ならない左上セル隅へ極小の孤立マークを添える
        let anchor = cells[0];
        for (const cellPt of cells) {
          if (cellPt.r < anchor.r || (cellPt.r === anchor.r && cellPt.c < anchor.c)) anchor = cellPt;
        }
        const bx = anchor.c * cellSize + Math.max(5.5, cellSize * 0.2);
        const by = anchor.r * cellSize + Math.max(5.5, cellSize * 0.2);
        const br = Math.max(3.6, Math.min(5.2, cellSize * 0.14));
        ctx.save();
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.font = `900 ${Math.round(br * 1.55)}px "Space Grotesk", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', bx, by + 0.5);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  function drawArchLines() {
    ctx.save();
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const x = c * cellSize, y = r * cellSize;
        drawEdge(x+cellSize, y, x+cellSize, y+cellSize, r, c, r, c+1, 'v');
        drawEdge(x, y+cellSize, x+cellSize, y+cellSize, r, c, r+1, c, 'h');
        if (r === 0) drawEdge(x, y, x+cellSize, y, -1, c, r, c, 'h');
        if (c === 0) drawEdge(x, y, x, y+cellSize, r, -1, r, c, 'v');
      }
    }
    ctx.restore();
  }

  function isDesignatedDoor(r1, c1, r2, c2, id1, id2) {
    if (!id1 || !id2) return true;
    const edges = [];
    for (let r=0; r<GRID; r++) {
      for (let c=0; c<GRID; c++) {
        const cell = grid[r][c];
        if (cell.type === T.OBSTACLE) continue;
        if (cell.roomId !== id1 && cell.roomId !== id2) continue;
        if (c+1 < GRID) {
           const right = grid[r][c+1];
           if ((cell.roomId === id1 && right.roomId === id2) || (cell.roomId === id2 && right.roomId === id1)) {
              if (!hasSolidWall(r, c, r, c+1)) {
                edges.push({r1:r, c1:c, r2:r, c2:c+1});
              }
           }
        }
        if (r+1 < GRID) {
           const down = grid[r+1][c];
           if ((cell.roomId === id1 && down.roomId === id2) || (cell.roomId === id2 && down.roomId === id1)) {
              if (!hasSolidWall(r, c, r+1, c)) {
                edges.push({r1:r, c1:c, r2:r+1, c2:c});
              }
           }
        }
      }
    }
    if (edges.length === 0) return false;
    edges.sort((a,b) => {
      if (a.r1 !== b.r1) return a.r1 - b.r1;
      if (a.c1 !== b.c1) return a.c1 - b.c1;
      if (a.r2 !== b.r2) return a.r2 - b.r2;
      return a.c2 - b.c2;
    });
    let s1 = String(id1), s2 = String(id2);
    if (s1 > s2) { let tmp = s1; s1 = s2; s2 = tmp; }
    let hashVal = 0;
    for(let i=0; i<s1.length; i++) hashVal += s1.charCodeAt(i);
    for(let i=0; i<s2.length; i++) hashVal += s2.charCodeAt(i) * 17;
    const chosenIdx = hashVal % edges.length;
    const chosen = edges[chosenIdx];
    const rA = Math.min(r1, r2), rB = Math.max(r1, r2);
    const cA = Math.min(c1, c2), cB = Math.max(c1, c2);
    return (chosen.r1 === rA && chosen.c1 === cA && chosen.r2 === rB && chosen.c2 === cB);
  }

  function edgeType(r1, c1, r2, c2) {
    const c1_cell = grid[r1]?.[c1];
    const c2_cell = grid[r2]?.[c2];
    
    // 同じ部屋（統合済み）の内部なら、壁ギミックがあっても無視して完全に繋げる
    if (c1_cell && c2_cell && c1_cell.roomId && c1_cell.roomId === c2_cell.roomId) {
      return E.NONE;
    }
    
    if (hasSolidWall(r1, c1, r2, c2)) return E.WALL;
    
    const isPiece1 = c1_cell && c1_cell.type !== T.EMPTY && c1_cell.type !== T.GARDEN && c1_cell.type !== T.OBSTACLE;
    const isPiece2 = c2_cell && c2_cell.type !== T.EMPTY && c2_cell.type !== T.GARDEN && c2_cell.type !== T.OBSTACLE;
    
    if (!isPiece1 && !isPiece2) return E.NONE;
    if (!isPiece1 || !isPiece2) {
      const occ = isPiece1 ? c1_cell : c2_cell;
      if (occ && (occ.type === T.LDK || occ.type === T.ROOM)) return E.WINDOW;
      return E.WALL;
    }
    if (c1_cell.type === T.CORRIDOR && c2_cell.type === T.CORRIDOR) return E.NONE;
    // 玄関（ワイド玄関含む）と廊下が接する辺は、赤壁（耐力壁）でない限りすべて直通（E.NONE）にする
    if ((c1_cell.type === T.CORRIDOR && c2_cell.type === T.ENTRANCE) ||
        (c2_cell.type === T.CORRIDOR && c1_cell.type === T.ENTRANCE)) {
      return E.NONE;
    }
    
    if (isDesignatedDoor(r1, c1, r2, c2, c1_cell.roomId, c2_cell.roomId)) {
      return E.DOOR;
    }
    return E.WALL;
  }

  function drawEdge(x1,y1,x2,y2, r1, c1, r2, c2, ori) {
    const et = edgeType(r1, c1, r2, c2);
    if (et === E.NONE) return;

    const c1_cell = grid[r1]?.[c1], c2_cell = grid[r2]?.[c2];
    const ext = !c1_cell || c1_cell.type===T.EMPTY || c1_cell.type===T.GARDEN || c1_cell.type===T.OBSTACLE ||
                !c2_cell || c2_cell.type===T.EMPTY || c2_cell.type===T.GARDEN || c2_cell.type===T.OBSTACLE;

    if (et === E.WALL || et === E.WINDOW) {
      const isSolid = hasSolidWall(r1, c1, r2, c2);
      const isLockedW = isSolid && (typeof DXStage2 !== 'undefined') && DXStage2.hasLockedWall(grid, r1, c1, r2, c2);
      ctx.strokeStyle = isLockedW ? '#9f1239' : (isSolid ? '#ef4444' : (ext ? '#0f172a' : '#1e293b'));
      ctx.lineWidth   = isLockedW ? 4.5 : (isSolid ? 4 : (ext ? 3.5 : 2));
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
      // 耐力壁マーク: 短い斜線を等間隔に描画（固定躯体壁は鉄骨リベット表示）
      if (isSolid) {
        ctx.save();
        ctx.strokeStyle = isLockedW ? '#9f1239' : '#ef4444';
        ctx.lineWidth = 1.5;
        const len = ori === 'h' ? Math.abs(x2-x1) : Math.abs(y2-y1);
        const marks = Math.max(2, Math.round(len / 10));
        for (let i = 1; i < marks; i++) {
          const t = i / marks;
          const mx = x1 + (x2-x1)*t, my = y1 + (y2-y1)*t;
          if (ori === 'h') {
            ctx.beginPath(); ctx.moveTo(mx-3, my-4); ctx.lineTo(mx+3, my+4); ctx.stroke();
          } else {
            ctx.beginPath(); ctx.moveTo(mx-4, my-3); ctx.lineTo(mx+4, my+3); ctx.stroke();
          }
        }
        if (isLockedW) {
          ctx.fillStyle = '#fef08a';
          ctx.fillRect((x1 + x2) / 2 - 2, (y1 + y2) / 2 - 2, 4, 4);
        }
        ctx.restore();
      }
      if (et === E.WINDOW && !isSolid) drawWindowMark(x1,y1,x2,y2,ori);
    } else if (et === E.DOOR) {
      // 和室判定: セルのlabelが「和室」であるかを安全に判定 (存在しないPIECESは参照しない)
      const isWashitsu = Boolean((c1_cell && c1_cell.label === '和室') || (c2_cell && c2_cell.label === '和室'));
      drawDoor(x1, y1, x2, y2, ori, isWashitsu);
    }
  }

  function drawWindowMark(x1,y1,x2,y2,ori) {
    ctx.save();
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2;
    if (ori === 'h') {
      const w = x2-x1;
      ctx.beginPath();
      ctx.moveTo(x1+w*0.2, y1-2); ctx.lineTo(x1+w*0.8, y1-2);
      ctx.moveTo(x1+w*0.2, y1+2); ctx.lineTo(x1+w*0.8, y1+2);
      ctx.stroke();
    } else {
      const h = y2-y1;
      ctx.beginPath();
      ctx.moveTo(x1-2, y1+h*0.2); ctx.lineTo(x1-2, y1+h*0.8);
      ctx.moveTo(x1+2, y1+h*0.2); ctx.lineTo(x1+2, y1+h*0.8);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDoor(x1,y1,x2,y2,ori, isWashitsu) {
    const len = ori==='h' ? Math.abs(x2-x1) : Math.abs(y2-y1);
    const post = len * 0.18;
    ctx.save();
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';

    if (ori === 'h') {
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x1+post,y1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x2-post,y2); ctx.lineTo(x2,y2); ctx.stroke();
      const dw = len - post*2;
      if (isWashitsu) {
        ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x1+post, y1-2); ctx.lineTo(x1+post+dw, y1-2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x1+post, y1+2); ctx.lineTo(x1+post+dw, y1+2); ctx.stroke();
      } else {
        ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x1+post, y1, dw, 0, Math.PI/2, false); ctx.stroke();
        ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x1+post,y1); ctx.lineTo(x1+post+dw*0.7, y1+dw*0.7); ctx.stroke();
      }
    } else {
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x1,y1+post); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x2,y2-post); ctx.lineTo(x2,y2); ctx.stroke();
      const dw = len - post*2;
      if (isWashitsu) {
        ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x1-2, y1+post); ctx.lineTo(x1-2, y1+post+dw); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x1+2, y1+post); ctx.lineTo(x1+2, y1+post+dw); ctx.stroke();
      } else {
        ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x1, y1+post, dw, -Math.PI/2, 0, false); ctx.stroke();
        ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x1,y1+post); ctx.lineTo(x1+dw*0.7, y1+post-dw*0.7); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function getEntranceFacing(stage = STAGE, targetGrid = null) {
    if (!targetGrid && typeof grid !== 'undefined') targetGrid = grid;
    if (stage && stage.entranceFacing) {
      const f = stage.entranceFacing;
      const map = {
        bottom: { dir: 'bottom', arrow: '▼' },
        top:    { dir: 'top',    arrow: '▲' },
        left:   { dir: 'left',   arrow: '◀' },
        right:  { dir: 'right',  arrow: '▶' }
      };
      if (map[f]) return map[f];
    }

    let er = stage ? stage.entranceRow : undefined;
    let ec = stage ? stage.entranceCol : undefined;

    if ((er === undefined || ec === undefined) && targetGrid) {
      const gSize = targetGrid.length;
      for (let r = 0; r < gSize; r++) {
        for (let c = 0; c < gSize; c++) {
          if (targetGrid[r] && targetGrid[r][c] && targetGrid[r][c].type === T.ENTRANCE) {
            er = r; ec = c; break;
          }
        }
        if (er !== undefined) break;
      }
    }

    if (er === undefined) er = 0;
    if (ec === undefined) ec = 0;
    const gSize = (targetGrid && targetGrid.length) ? targetGrid.length : GRID;

    const isObstacleOrOutside = (r, c) => {
      if (r < 0 || r >= gSize || c < 0 || c >= gSize) return true;
      if (targetGrid && targetGrid[r] && targetGrid[r][c]) {
        return targetGrid[r][c].type === T.OBSTACLE;
      }
      if (stage && stage.obstacles) {
        return stage.obstacles.some(obs => 
          r >= obs.r && r < obs.r + (obs.h || 1) &&
          c >= obs.c && c < obs.c + (obs.w || 1)
        );
      }
      return false;
    };

    if (isObstacleOrOutside(er + 1, ec)) return { dir: 'bottom', arrow: '▼' };
    if (isObstacleOrOutside(er - 1, ec)) return { dir: 'top',    arrow: '▲' };
    if (isObstacleOrOutside(er, ec - 1)) return { dir: 'left',   arrow: '◀' };
    if (isObstacleOrOutside(er, ec + 1)) return { dir: 'right',  arrow: '▶' };

    return { dir: 'bottom', arrow: '▼' };
  }

  function drawEntrance() {
    if (!STAGE) return;
    const entCells = STAGE.entranceCells || [{ r: STAGE.entranceRow, c: STAGE.entranceCol }];
    const facing = getEntranceFacing(STAGE, grid);

    const minC = Math.min(...entCells.map(c => c.c));
    const maxC = Math.max(...entCells.map(c => c.c));
    const minR = Math.min(...entCells.map(c => c.r));
    const maxR = Math.max(...entCells.map(c => c.r));
    const startX = minC * cellSize;
    const endX = (maxC + 1) * cellSize;
    const startY = minR * cellSize;
    const endY = (maxR + 1) * cellSize;
    const width = endX - startX;
    const height = endY - startY;

    ctx.save();
    // 1. Threshold line (上がり框 / 土間と室内の境界破線)
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = Math.max(1.5, cellSize * 0.05);
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    const kamachiOffset = Math.max(7, cellSize * 0.28);
    if (facing.dir === 'bottom') {
      ctx.moveTo(startX + 2, endY - kamachiOffset);
      ctx.lineTo(endX - 2, endY - kamachiOffset);
    } else if (facing.dir === 'top') {
      ctx.moveTo(startX + 2, startY + kamachiOffset);
      ctx.lineTo(endX - 2, startY + kamachiOffset);
    } else if (facing.dir === 'left') {
      ctx.moveTo(startX + kamachiOffset, startY + 2);
      ctx.lineTo(startX + kamachiOffset, endY - 2);
    } else if (facing.dir === 'right') {
      ctx.moveTo(endX - kamachiOffset, startY + 2);
      ctx.lineTo(endX - kamachiOffset, endY - 2);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Entrance Label: 外壁（開口部・土間側）に寄せて描画
    const label = `${facing.arrow}玄関`;
    const fontSize = Math.max(8, Math.min(cellSize * 0.2, 11));
    ctx.font = `bold ${fontSize}px "Zen Kaku Gothic New", sans-serif`;

    let tx = startX + width / 2;
    let ty = startY + height / 2;
    if (facing.dir === 'bottom') {
      tx = startX + width / 2;
      ty = endY - 1.5;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
    } else if (facing.dir === 'top') {
      tx = startX + width / 2;
      ty = startY + 1.5;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
    } else if (facing.dir === 'left') {
      tx = startX + 1.5;
      ty = startY + height / 2;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
    } else if (facing.dir === 'right') {
      tx = endX - 1.5;
      ty = startY + height / 2;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
    }

    // 白フチで視認性確保
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.strokeText(label, tx, ty);

    ctx.fillStyle = '#92400e';
    ctx.fillText(label, tx, ty);
    ctx.restore();
  }

  /* ============================================================
     PLACEMENT
  ============================================================ */
  function getPlacementCheck(gr, gc, shape) {
    const sr = shape.length, sc = shape[0].length;
    if (gr < 0 || gc < 0 || gr + sr > GRID || gc + sc > GRID) {
      return { ok: false, reason: 'out_of_bounds', shortLabel: '敷地の外です', detailText: '敷地の枠内に入れてください' };
    }

    let hasAdjacent = false;
    for (let r = 0; r < sr; r++) {
      for (let c = 0; c < sc; c++) {
        if (shape[r][c] !== 1) continue;
        const targetType = grid[gr + r][gc + c].type;
        if (targetType !== T.EMPTY && targetType !== T.OBSTACLE) {
          return { ok: false, reason: 'overlap', shortLabel: '部屋と重なっています', detailText: '他の部屋と重なっています' };
        }
        if (targetType === T.OBSTACLE && typeof DXStage2 !== 'undefined' && DXStage2.isNonEncroachableObstacle) {
          const envBlock = DXStage2.isNonEncroachableObstacle(STAGE, gr + r, gc + c, grid);
          if (envBlock && envBlock.blocked) {
            return { ok: false, reason: 'env_blocked', shortLabel: envBlock.shortLabel, detailText: envBlock.detailText };
          }
        }
        if (isCellAdjacentToStructure(gr + r, gc + c)) {
          hasAdjacent = true;
        }
      }
    }
    if (!hasAdjacent) {
      return { ok: false, reason: 'not_adjacent', shortLabel: '玄関か部屋の隣へ', detailText: '玄関か部屋の隣に置けます' };
    }
    return { ok: true, reason: 'ok', shortLabel: '', detailText: '' };
  }

  function canPlace(gr, gc, shape) {
    return getPlacementCheck(gr, gc, shape).ok;
  }

  function evaluatePiecePlacement(gr, gc, piece, rot = selectedRot, mirrored = isMirrored) {
    const shape = getShape(piece, rot, mirrored);
    const placeCheck = getPlacementCheck(gr, gc, shape);
    const pieceCost = getPieceCost(piece, mirrored);
    const enc = getEncroachCostForPlacement(gr, gc, shape);
    const totalPlaceCost = Math.round((pieceCost + enc.cost) * 10) / 10;
    const canAfford = budget >= totalPlaceCost;
    return {
      shape,
      placeCheck,
      pieceCost,
      enc,
      totalPlaceCost,
      canAfford,
      valid: placeCheck.ok && canAfford
    };
  }

  // 同種ピース統合: 隣接する同種セルを、壁ギミックのない辺を通ってのみ連結し同一roomIdにする
  // 接触辺がすべて壁 → 統合されない / 1箇所でも壁でない辺がある → 統合される
  const MERGEABLE_TYPES = new Set([T.CORRIDOR, T.ROOM, T.LDK, T.TOILET, T.WASHROOM, T.BATH, T.CLOSET]);
  function mergeKey(cell) {
    // 和室は統合せず、独立した部屋（襖で繋がる続き間）として扱う
    if (cell.type === T.ROOM && cell.label === '和室') return null;
    // 洋室・和室・防音書斎・サンルームは別種として扱う
    if (cell.type === T.ROOM) return `${cell.type}:${cell.label}`;
    // ユニットバスは一般浴室と別種として扱う
    if (cell.pieceLibId === 'unit-bath' || cell.label === 'UB') return 'unit-bath';
    // ガレージ・家事室も通常収納・通常洗面と合体させず別種として扱う
    if (typeof DXStage3 !== 'undefined') {
      if (DXStage3.isGarageCell(cell)) return 'closet:ガレージ';
      if (DXStage3.isLaundryCell(cell)) return 'washroom:家事室';
    }
    return cell.type;
  }

  function mergeSameType() {
    const visited = new Set();
    const dirs = [{dr:-1,dc:0},{dr:1,dc:0},{dr:0,dc:-1},{dr:0,dc:1}];
    for (let r=0; r<GRID; r++) {
      for (let c=0; c<GRID; c++) {
        const start = grid[r][c];
        if (!MERGEABLE_TYPES.has(start.type) || visited.has(`${r},${c}`)) continue;
        const key = mergeKey(start);
        if (!key) continue;
        const q = [{r,c}];
        const comp = [];
        visited.add(`${r},${c}`);
        let minId = start.roomId;
        let head = 0;
        while (head < q.length) {
          const cur = q[head++];
          comp.push(cur);
          if (grid[cur.r][cur.c].roomId < minId) minId = grid[cur.r][cur.c].roomId;
          for (const {dr,dc} of dirs) {
            const nr=cur.r+dr, nc=cur.c+dc;
            if (nr<0 || nr>=GRID || nc<0 || nc>=GRID) continue;
            if (visited.has(`${nr},${nc}`)) continue;
            const nb = grid[nr][nc];
            if (!MERGEABLE_TYPES.has(nb.type) || mergeKey(nb) !== key) continue;
            if (hasSolidWall(cur.r, cur.c, nr, nc)) continue;
            visited.add(`${nr},${nc}`);
            q.push({r:nr, c:nc});
          }
        }
        for (const cell of comp) grid[cell.r][cell.c].roomId = minId;
      }
    }
  }
  const mergeCorridors = mergeSameType;

  function placePiece(gr, gc) {
    const piece = draftSlots[selectedSlot];
    if (!piece) return false;

    const tutStep = getCurrentTutorialStep();
    if (tutStep) {
      if (tutStep.targetR === undefined || !isTutorialHoverAtTarget(tutStep, gr, gc)) {
        playSound('error');
        showFloatingText('光る枠に合わせよう', '#fbbf24');
        return false;
      }
      if (!isTutorialOrientationMatch(tutStep)) {
        playSound('error');
        showFloatingText(getTutorialActionNotice(tutStep) || '向きを合わせよう', '#fbbf24');
        return false;
      }
    }
    
    const rw = getRotatedWalls(piece, selectedRot, isMirrored);
    const { shape, placeCheck, pieceCost, enc, totalPlaceCost, canAfford } = evaluatePiecePlacement(gr, gc, piece);
    if (!placeCheck.ok) {
      playSound('error');
      showFloatingText(placeCheck.detailText, '#fca5a5');
      return false;
    }

    // Check Budget (Piece Cost + Encroachment Cost on Obstacle cells)
    if (!canAfford) {
      playSound('error');
      showFloatingText('資金不足！', 'var(--c-rose)');
      showEmergencyLoanPrompt(totalPlaceCost - budget);
      return false;
    }

    const basePieceCost = piece.cost || 0;
    const cycle1UnmirroredCost = getPieceCost(piece, false, 1);
    const unmirroredCost = getPieceCost(piece, false);
    const cycleExtra = Math.max(0, Math.round((unmirroredCost - cycle1UnmirroredCost) * 10) / 10);
    const mirrorExtra = Math.max(0, Math.round((pieceCost - unmirroredCost) * 10) / 10);
    buildBaseCost = Math.round((buildBaseCost + basePieceCost) * 10) / 10;
    buildPiecePaidCost = Math.round((buildPiecePaidCost + pieceCost) * 10) / 10;
    buildCycleExtraCost = Math.round((buildCycleExtraCost + cycleExtra) * 10) / 10;
    buildMirrorExtraCost = Math.round((buildMirrorExtraCost + mirrorExtra) * 10) / 10;
    if (enc.count > 0) {
      buildEncroachCost = Math.round((buildEncroachCost + enc.cost) * 10) / 10;
      encroachCount = (encroachCount || 0) + enc.count;
    }

    budget = Math.round((budget - totalPlaceCost) * 10) / 10;
    updateBudgetUI();
    if (enc.count > 0) {
      showFloatingText(`⛏️造成${enc.count}マス (-${totalPlaceCost.toFixed(1)}万)`, '#f59e0b');
    } else {
      showFloatingText(`-${pieceCost.toFixed(1)}万`, 'var(--c-rose)');
    }

    let cellsCount = 0;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[0].length; c++) {
        if (shape[r][c] === 1) cellsCount++;
      }
    }
    // 建築予算からは特注加工費・2周目以降の追加発注割増・造成費を含めた金額を引き落とすが、
    // 基礎家賃や物件の資産価値(リセール)には割増料金や造成費を含めないため、定価(piece.cost)で按分する
    const costPerCell = basePieceCost / cellsCount;

    const rid = nextRoomId++;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[0].length; c++) {
        if (shape[r][c] === 1) {
          const wasObstacle = (grid[gr+r][gc+c].type === T.OBSTACLE);
          const cell = makeCell(piece.cat, rid, piece.label, costPerCell);
          cell.pieceLibId = piece.id;
          cell.encroached = wasObstacle;
          for (const w of rw) {
            if (w.r === r && w.c === c) cell.walls[w.dir] = true;
          }
          grid[gr+r][gc+c] = cell;
        }
      }
    }

    mergeCorridors();

    let sumR = 0, sumC = 0, placedCnt = 0;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[0].length; c++) {
        if (shape[r][c] === 1) {
          sumR += gr + r;
          sumC += gc + c;
          placedCnt++;
        }
      }
    }
    if (placedCnt > 0) {
      lastPlacedAnchor = { r: sumR / placedCnt, c: sumC / placedCnt };
    }

    hintDismissedForBuild = true;
    playSound('place');
    
    if (piece && piece.id) {
      discardPile.push(piece.id);
    }
    draftSlots[selectedSlot] = null;
    keepStates[selectedSlot] = false;
    keepCounts[selectedSlot] = 0;

    if (tutStep && tutorialBuildStep < TUTORIAL_STEPS.length - 1) {
      tutorialBuildStep++;
    }
    hoverCell = null;
    previewMode = false;
    
    let allEmpty = true;
    for (let i = 0; i < draftSlots.length; i++) {
      if (draftSlots[i] !== null) allEmpty = false;
    }
    if (allEmpty && !isTutorialPuzzleActive()) {
      const maxSlots = getMaxHandSlots();
      for (let i = 0; i < maxSlots; i++) {
        draftSlots[i] = drawPieceFromDeck();
        keepStates[i] = false;
        keepCounts[i] = 0;
      }
      selectedSlot = 0;
    } else if (!isTutorialPuzzleActive()) {
      let next = draftSlots.findIndex(p => p !== null);
      if (next !== -1) selectedSlot = next;
    }
    updateDeckPeekButton();
    
    selectedRot = 0;
    isMirrored = false;
    turnsLeft--;
    updateTurnsDisplay();
    renderDraftUI();
    drawPlan();

    if (typeof updateRealtimeRent === 'function') updateRealtimeRent();

    saveActiveBuild('game');

    if (!isTutorialPuzzleActive() && isGridFull()) setTimeout(evaluate, 300);
    return true;
  }

  function isGridFull() {
    for (let r = 0; r < GRID; r++)
      for (let c = 0; c < GRID; c++)
        if (grid[r][c].type === T.EMPTY) return false;
    return true;
  }

  function updateTurnsDisplay() {
    // UI削除につき無効化
  }

  /* ============================================================
     CANVAS POINTER EVENTS
  ============================================================ */
  function getCellFromPointer(e) {
    const rect = canvas.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    const pc = Math.floor((cx - rect.left) / cellSize);
    const pr = Math.floor((cy - rect.top)  / cellSize);
    
    let offR = 0, offC = 0;
    const piece = (selectedSlot !== null) ? draftSlots[selectedSlot] : null;
    if (piece) {
      const shape = getShape(piece, selectedRot, isMirrored);
      offR = Math.floor(shape.length / 2);
      offC = Math.floor(shape[0].length / 2);
    }
    return {r: pr - offR, c: pc - offC};
  }

  function findSolidWallNearPointer(e) {
    if (isTutorialPuzzleActive()) return null;
    const rect = canvas.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    const px = cx - rect.left;
    const py = cy - rect.top;
    const gx = px / cellSize;
    const gy = py / cellSize;

    let best = null;
    let bestDist = cellSize * 0.42; // タップ判定半径

    // 垂直な壁 (r, c) と (r, c+1) の境界
    for (let r = 0; r < GRID; r++) {
      for (let c = -1; c < GRID; c++) {
        if (!hasSolidWall(r, c, r, c + 1)) continue;
        // 同じ部屋として既に統合されている内部壁はスキップ
        const c1 = grid[r]?.[c], c2 = grid[r]?.[c + 1];
        if (c1 && c2 && c1.roomId && c1.roomId === c2.roomId) continue;
        const wx = (c + 1) * cellSize;
        const wy1 = r * cellSize;
        const wy2 = (r + 1) * cellSize;
        const clampY = Math.max(wy1, Math.min(wy2, py));
        const dist = Math.hypot(px - wx, py - clampY);
        if (dist < bestDist) {
          bestDist = dist;
          best = { r1: r, c1: c, r2: r, c2: c + 1, mx: wx, my: (wy1 + wy2) / 2 };
        }
      }
    }

    // 水平な壁 (r, c) と (r+1, c) の境界
    for (let r = -1; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (!hasSolidWall(r, c, r + 1, c)) continue;
        const c1 = grid[r]?.[c], c2 = grid[r + 1]?.[c];
        if (c1 && c2 && c1.roomId && c1.roomId === c2.roomId) continue;
        const wy = (r + 1) * cellSize;
        const wx1 = c * cellSize;
        const wx2 = (c + 1) * cellSize;
        const clampX = Math.max(wx1, Math.min(wx2, px));
        const dist = Math.hypot(px - clampX, py - wy);
        if (dist < bestDist) {
          bestDist = dist;
          best = { r1: r, c1: c, r2: r + 1, c2: c, mx: (wx1 + wx2) / 2, my: wy };
        }
      }
    }

    if (best) {
      best.dist = bestDist;
      if (typeof DXStage2 !== 'undefined' && DXStage2.hasLockedWall) {
        best.locked = DXStage2.hasLockedWall(grid, best.r1, best.c1, best.r2, best.c2);
      }
    }
    return best;
  }

  function removeSolidWall(target) {
    if (!target) return false;
    const { r1, c1, r2, c2 } = target;
    if (!hasSolidWall(r1, c1, r2, c2)) return false;
    if (typeof DXStage2 !== 'undefined' && DXStage2.hasLockedWall && DXStage2.hasLockedWall(grid, r1, c1, r2, c2)) {
      playSound('error');
      showFloatingText('🔒 固定躯体壁は撤去できません', '#fca5a5');
      return false;
    }

    const cost = getWallRemoveCost();
    if (budget < cost) {
      playSound('error');
      showFloatingText('資金不足！', 'var(--c-rose)');
      showEmergencyLoanPrompt(cost - budget);
      return false;
    }

    // 隣接する両セルの赤壁フラグを除去
    const cell1 = grid[r1]?.[c1];
    if (cell1 && cell1.walls) {
      if (r2 === r1 - 1) cell1.walls.top = false;
      if (r2 === r1 + 1) cell1.walls.bottom = false;
      if (c2 === c1 - 1) cell1.walls.left = false;
      if (c2 === c1 + 1) cell1.walls.right = false;
    }
    const cell2 = grid[r2]?.[c2];
    if (cell2 && cell2.walls) {
      if (r1 === r2 - 1) cell2.walls.top = false;
      if (r1 === r2 + 1) cell2.walls.bottom = false;
      if (c1 === c2 - 1) cell2.walls.left = false;
      if (c1 === c2 + 1) cell2.walls.right = false;
    }

    budget = Math.round((budget - cost) * 10) / 10;
    buildWallRemoveCost = Math.round((buildWallRemoveCost + cost) * 10) / 10;
    wallRemoveCount = (wallRemoveCount || 0) + 1;

    mergeCorridors();
    updateBudgetUI();
    updatePieceLabel();
    playSound('place');
    showFloatingText(`🔨 赤壁撤去 (-${cost.toFixed(1)}万)`, '#f59e0b');

    if (typeof updateRealtimeRent === 'function') updateRealtimeRent();
    saveActiveBuild('game');
    return true;
  }

  function syncDemolishModeButton() {
    const btn = document.getElementById('btn-demolish-mode');
    if (!btn) return;
    const isReno = !!(STAGE && STAGE.renovation);
    if (!isReno) {
      btn.style.display = 'none';
      demolishMode = false;
      btn.classList.remove('is-active');
      return;
    }
    const canDemo = (typeof DXStage2 !== 'undefined' && DXStage2.hasDemolishableCells)
      ? DXStage2.hasDemolishableCells(grid)
      : false;
    btn.style.display = 'inline-flex';
    btn.disabled = !canDemo;
    btn.style.opacity = canDemo ? '1' : '0.45';
    btn.style.cursor = canDemo ? 'pointer' : 'not-allowed';
    if (!canDemo) demolishMode = false;
    btn.classList.toggle('is-active', !!demolishMode);
    btn.innerHTML = demolishMode
      ? `<i class="ph-bold ph-hammer"></i> 解体中`
      : `<i class="ph-bold ph-hammer"></i> 解体`;
  }

  function demolishRoom(target) {
    if (!target || !Array.isArray(target.cells) || target.cells.length === 0) return false;
    const cost = target.cost || 0;
    if (budget < cost) {
      playSound('error');
      showFloatingText('資金不足！', 'var(--c-rose)');
      showEmergencyLoanPrompt(cost - budget);
      return false;
    }
    for (const pt of target.cells) {
      if (grid[pt.r] && grid[pt.r][pt.c]) {
        grid[pt.r][pt.c] = makeCell(T.EMPTY);
      }
    }
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const cur = grid[r][c];
        if (cur && MERGEABLE_TYPES.has(cur.type)) {
          cur.roomId = cur.pieceId || cur.roomId;
        }
      }
    }
    mergeSameType();

    budget = Math.round((budget - cost) * 10) / 10;
    buildDemolishCost = Math.round(((buildDemolishCost || 0) + cost) * 10) / 10;
    demolishCount = (demolishCount || 0) + 1;

    updateBudgetUI();
    updatePieceLabel();
    syncDemolishModeButton();
    playSound('place');
    showFloatingText(`🔨 ${target.label}を解体 (-${cost.toFixed(1)}万)`, '#f59e0b');
    if (typeof updateRealtimeRent === 'function') updateRealtimeRent();
    saveActiveBuild('game');
    return true;
  }

  document.getElementById('btn-demolish-mode')?.addEventListener('click', () => {
    initAudio();
    if (!STAGE || !STAGE.renovation) return;
    const canDemo = (typeof DXStage2 !== 'undefined' && DXStage2.hasDemolishableCells) ? DXStage2.hasDemolishableCells(grid) : false;
    if (!canDemo) {
      playSound('tap');
      showFloatingText('解体できる既存部屋はありません', '#94a3b8');
      return;
    }
    playSound('tap');
    demolishMode = !demolishMode;
    selectedWallTarget = null;
    selectedDemolishTarget = null;
    if (demolishMode) {
      selectedSlot = null;
      selectedRot = 0;
      isMirrored = false;
      hoverCell = null;
      previewMode = false;
      showConfirmUI(false);
    }
    syncDemolishModeButton();
    renderDraftUI();
    drawPlan();
    if (demolishMode) {
      showFloatingText('🔨 橙枠の既存部屋をタップして解体', '#fbbf24');
    }
  });

  let confirmOverlayShownAt = 0;

  function selectDraftSlotByNumber(idx) {
    if (idx < 0 || idx >= draftSlots.length) return;
    initAudio();
    cancelRerollConfirm();
    selectedWallTarget = null;
    selectedDemolishTarget = null;
    demolishMode = false;
    syncDemolishModeButton();
    const tutStep = getCurrentTutorialStep();
    if (tutStep) {
      if (tutStep.slot !== idx || !draftSlots[idx]) {
        playSound('tap');
        showFloatingText(getTutorialHintText() || '順番に進めよう', '#fbbf24');
        return;
      }
      selectedSlot = idx;
      playSound('tap');
      renderDraftUI();
      updatePieceLabel();
      drawPlan();
      return;
    }
    if (!draftSlots[idx]) {
      playSound('tap');
      return;
    }
    if (selectedSlot !== idx) {
      selectedSlot = idx;
      selectedRot = 0;
      isMirrored = false;
      hoverCell = null;
      previewMode = false;
      showConfirmUI(false);
      playSound('rotate');
    } else {
      playSound('tap');
    }
    renderDraftUI();
    updatePieceLabel();
    drawPlan();
    const cardsWrap = document.getElementById('draft-container');
    const cardEl = cardsWrap?.querySelectorAll('.draft-card')?.[idx];
    if (cardEl && typeof cardEl.scrollIntoView === 'function') {
      cardEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function findSmartPreviewAnchor(piece, dr, dc) {
    const shape = getShape(piece, selectedRot, isMirrored);
    const h = shape.length;
    const w = shape[0].length;
    const maxR = Math.max(0, GRID - h);
    const maxC = Math.max(0, GRID - w);
    const entR = (STAGE && typeof STAGE.entranceRow === 'number') ? STAGE.entranceRow : Math.floor(GRID / 2);
    const entC = (STAGE && typeof STAGE.entranceCol === 'number') ? STAGE.entranceCol : Math.floor(GRID / 2);
    const anchorR = lastPlacedAnchor ? lastPlacedAnchor.r : entR;
    const anchorC = lastPlacedAnchor ? lastPlacedAnchor.c : entC;

    let best = null;
    let bestScore = Infinity;
    for (let r = 0; r <= maxR; r++) {
      for (let c = 0; c <= maxC; c++) {
        const chk = getPlacementCheck(r, c, shape);
        if (!chk.ok) continue;
        const centerR = r + (h - 1) / 2;
        const centerC = c + (w - 1) / 2;
        const dist = Math.hypot(centerR - anchorR, centerC - anchorC);
        const dirDot = (centerR - anchorR) * dr + (centerC - anchorC) * dc;
        const score = dist - dirDot * 0.15;
        if (score < bestScore) {
          bestScore = score;
          best = { r, c };
        }
      }
    }
    if (best) return best;
    return {
      r: Math.max(0, Math.min(maxR, Math.round(anchorR) - Math.floor(h / 2) + dr)),
      c: Math.max(0, Math.min(maxC, Math.round(anchorC) - Math.floor(w / 2) + dc))
    };
  }

  function moveSelectedPiecePreview(dr, dc) {
    initAudio();
    cancelRerollConfirm();
    selectedWallTarget = null;
    selectedDemolishTarget = null;
    demolishMode = false;
    syncDemolishModeButton();
    if (document.activeElement && document.activeElement.tagName === 'BUTTON') {
      document.activeElement.blur();
    }
    const tutStep = getCurrentTutorialStep();
    if (tutStep) {
      if (tutStep.isReroll || tutStep.isFinish) {
        playSound('tap');
        showFloatingText(getTutorialHintText() || 'ボタンをタップしよう', '#fbbf24');
        syncTutorialPuzzleUI();
        return;
      }
      const wasReady = previewMode && hoverCell && hoverCell.r === tutStep.targetR && hoverCell.c === tutStep.targetC;
      hoverCell = { r: tutStep.targetR, c: tutStep.targetC };
      previewMode = true;
      confirmOverlayShownAt = Date.now();
      showConfirmUI(true);
      drawPlan();
      playSound('tap');
      if (wasReady) {
        showFloatingText(getTutorialActionNotice(tutStep) || 'そのまま確定しよう', '#fbbf24');
      }
      return;
    }

    if (selectedSlot === null || !draftSlots[selectedSlot]) {
      const firstIdx = draftSlots.findIndex(p => p !== null);
      if (firstIdx === -1) {
        playSound('tap');
        showFloatingText('手札が空です', '#fbbf24');
        return;
      }
      selectedSlot = firstIdx;
      selectedRot = 0;
      isMirrored = false;
      renderDraftUI();
      updatePieceLabel();
    }

    const piece = draftSlots[selectedSlot];
    const shape = getShape(piece, selectedRot, isMirrored);
    const maxR = Math.max(0, GRID - shape.length);
    const maxC = Math.max(0, GRID - shape[0].length);

    if (!previewMode && !hoverCell) {
      hoverCell = findSmartPreviewAnchor(piece, dr, dc);
      previewMode = true;
      confirmOverlayShownAt = Date.now();
      showConfirmUI(true);
      drawPlan();
      playSound('tap');
      return;
    }

    const baseR = hoverCell ? hoverCell.r : 0;
    const baseC = hoverCell ? hoverCell.c : 0;
    const nr = Math.max(0, Math.min(maxR, baseR + dr));
    const nc = Math.max(0, Math.min(maxC, baseC + dc));
    const moved = !previewMode || !hoverCell || nr !== hoverCell.r || nc !== hoverCell.c;
    hoverCell = { r: nr, c: nc };
    previewMode = true;
    confirmOverlayShownAt = Date.now();
    showConfirmUI(true);
    drawPlan();
    if (moved) playSound('tap');
  }

  function rotateSelectedPiece() {
    initAudio();
    cancelRerollConfirm();
    const tutStep = getCurrentTutorialStep();
    if (tutStep && !tutStep.allowRotate) {
      playSound('tap');
      return;
    }
    if (selectedSlot === null || !draftSlots[selectedSlot]) return;
    selectedRot = (selectedRot + 1) % 4;
    playSound('rotate');
    renderDraftUI();
    updatePieceLabel();
    if (previewMode && hoverCell) {
      if (!tutStep) {
        const sh = getShape(draftSlots[selectedSlot], selectedRot, isMirrored);
        hoverCell = {
          r: Math.max(0, Math.min(GRID - sh.length, hoverCell.r)),
          c: Math.max(0, Math.min(GRID - sh[0].length, hoverCell.c))
        };
      }
      showConfirmUI(true);
    }
    drawPlan();
  }

  function toggleMirrorSelectedPiece() {
    initAudio();
    cancelRerollConfirm();
    const tutStep = getCurrentTutorialStep();
    if (tutStep && !tutStep.allowMirror) {
      playSound('tap');
      return;
    }
    if (selectedSlot === null || !draftSlots[selectedSlot]) return;
    isMirrored = !isMirrored;
    playSound('rotate');
    renderDraftUI();
    updatePieceLabel();
    if (previewMode && hoverCell) {
      if (!tutStep) {
        const sh = getShape(draftSlots[selectedSlot], selectedRot, isMirrored);
        hoverCell = {
          r: Math.max(0, Math.min(GRID - sh.length, hoverCell.r)),
          c: Math.max(0, Math.min(GRID - sh[0].length, hoverCell.c))
        };
      }
      showConfirmUI(true);
    }
    drawPlan();
  }

  function confirmSelectedAction() {
    initAudio();
    if (selectedDemolishTarget) {
      const ok = demolishRoom(selectedDemolishTarget);
      if (ok) {
        selectedDemolishTarget = null;
        showConfirmUI(false);
        drawPlan();
      }
      return;
    }
    if (selectedWallTarget) {
      const ok = removeSolidWall(selectedWallTarget);
      if (ok) {
        selectedWallTarget = null;
        showConfirmUI(false);
        drawPlan();
      }
      return;
    }
    if (previewMode && hoverCell) {
      const tutStep = getCurrentTutorialStep();
      if (tutStep && !isTutorialConfirmAllowed()) {
        playSound('error');
        showFloatingText(getTutorialActionNotice(tutStep) || getTutorialHintText(), '#fbbf24');
        return;
      }
      const success = placePiece(hoverCell.r, hoverCell.c);
      if (success) {
        previewMode = false;
        showConfirmUI(false);
      }
    }
  }

  function getRectOverlapArea(a, b) {
    const ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return ix * iy;
  }

  function getRectGapDist(a, b) {
    const dx = Math.max(0, a.left - b.right, b.left - a.right);
    const dy = Math.max(0, a.top - b.bottom, b.top - a.bottom);
    return Math.hypot(dx, dy);
  }

  function getConfirmCanvasMetrics(area) {
    const areaRect = area.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const originX = canvasRect.left - areaRect.left - (area.clientLeft || 0);
    const originY = canvasRect.top - areaRect.top - (area.clientTop || 0);
    const canvasSize = GRID * cellSize;
    const boardRect = {
      left: originX,
      top: originY,
      right: originX + canvasSize,
      bottom: originY + canvasSize
    };
    const uiAvoidRects = [];
    const actionsEl = area.querySelector(':scope > .game-header-actions');
    if (actionsEl && getComputedStyle(actionsEl).display !== 'none') {
      const ar = actionsEl.getBoundingClientRect();
      if (ar.width > 0 && ar.height > 0) {
        uiAvoidRects.push({
          left: ar.left - areaRect.left - (area.clientLeft || 0) - 4,
          top: ar.top - areaRect.top - (area.clientTop || 0) - 4,
          right: ar.right - areaRect.left - (area.clientLeft || 0) + 4,
          bottom: ar.bottom - areaRect.top - (area.clientTop || 0) + 4
        });
      }
    }
    const entranceRects = [];
    const entCells = (STAGE && STAGE.entranceCells)
      ? STAGE.entranceCells
      : (STAGE && typeof STAGE.entranceRow === 'number' ? [{ r: STAGE.entranceRow, c: STAGE.entranceCol }] : []);
    for (const ec of entCells) {
      const left = originX + ec.c * cellSize;
      const top = originY + ec.r * cellSize;
      entranceRects.push({ left, top, right: left + cellSize, bottom: top + cellSize });
    }
    return {
      areaW: area.clientWidth,
      areaH: area.clientHeight,
      originX,
      originY,
      boardRect,
      uiAvoidRects,
      entranceRects
    };
  }

  function buildTargetBoundsFromShape(metrics, shape, hover) {
    const cellRects = [];
    let minL = Infinity, minT = Infinity, maxR = -Infinity, maxB = -Infinity;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[0].length; c++) {
        if (shape[r][c] !== 1) continue;
        const left = metrics.originX + (hover.c + c) * cellSize;
        const top = metrics.originY + (hover.r + r) * cellSize;
        const right = left + cellSize;
        const bottom = top + cellSize;
        cellRects.push({ left, top, right, bottom });
        if (left < minL) minL = left;
        if (top < minT) minT = top;
        if (right > maxR) maxR = right;
        if (bottom > maxB) maxB = bottom;
      }
    }
    if (!cellRects.length) {
      const left = metrics.originX + hover.c * cellSize;
      const top = metrics.originY + hover.r * cellSize;
      const right = left + shape[0].length * cellSize;
      const bottom = top + shape.length * cellSize;
      return { targetBBox: { left, top, right, bottom }, cellRects: [{ left, top, right, bottom }] };
    }
    return { targetBBox: { left: minL, top: minT, right: maxR, bottom: maxB }, cellRects };
  }

  function findBestOverlayCandidate(ow, oh, targetBBox, cellRects, metrics) {
    const gap = 10;
    const margin = 6;
    const { areaW, areaH, boardRect, uiAvoidRects, entranceRects = [] } = metrics;
    const maxX = Math.max(2, areaW - ow - margin);
    const minX = Math.min(margin, maxX);
    const maxY = Math.max(2, areaH - oh - margin);
    const minY = Math.min(margin, maxY);

    const tcx = (targetBBox.left + targetBBox.right) / 2;
    const tcy = (targetBBox.top + targetBBox.bottom) / 2;
    const xCentered = tcx - ow / 2;
    const yOptionsSide = [targetBBox.top, tcy - oh / 2, targetBBox.bottom - oh];
    const xOptionsVert = [xCentered, targetBBox.left, targetBBox.right - ow];

    const rawCandidates = [];
    // 右 → 左 → 下 → 上（ピースすぐ横・上下）
    yOptionsSide.forEach(y => rawCandidates.push({ x: targetBBox.right + gap, y, dirRank: 0 }));
    yOptionsSide.forEach(y => rawCandidates.push({ x: targetBBox.left - gap - ow, y, dirRank: 1 }));
    xOptionsVert.forEach(x => rawCandidates.push({ x, y: targetBBox.bottom + gap, dirRank: 2 }));
    xOptionsVert.forEach(x => rawCandidates.push({ x, y: targetBBox.top - gap - oh, dirRank: 3 }));
    // 盤面外の余白やコーナーへの退避候補（大型ピース・極狭環境向け）
    rawCandidates.push(
      { x: boardRect.right + gap, y: tcy - oh / 2, dirRank: 4 },
      { x: boardRect.left - gap - ow, y: tcy - oh / 2, dirRank: 4 },
      { x: xCentered, y: boardRect.bottom + gap, dirRank: 5 },
      { x: xCentered, y: boardRect.top - gap - oh, dirRank: 5 },
      { x: minX, y: maxY, dirRank: 6 },
      { x: maxX, y: maxY, dirRank: 6 },
      { x: minX, y: minY, dirRank: 6 },
      { x: maxX, y: minY, dirRank: 6 }
    );

    const paddedCells = cellRects.map(c => ({
      left: c.left - 6, top: c.top - 6, right: c.right + 6, bottom: c.bottom + 6
    }));

    let best = null;
    for (const cand of rawCandidates) {
      const left = Math.round(Math.max(minX, Math.min(cand.x, maxX)));
      const top = Math.round(Math.max(minY, Math.min(cand.y, maxY)));
      const box = { left, top, right: left + ow, bottom: top + oh };

      const clipOverflow =
        Math.max(0, -box.left) + Math.max(0, box.right - areaW) +
        Math.max(0, -box.top) + Math.max(0, box.bottom - areaH);

      let pieceOverlap = 0;
      for (const c of cellRects) pieceOverlap += getRectOverlapArea(box, c);

      let uiOverlap = 0;
      for (const u of uiAvoidRects) uiOverlap += getRectOverlapArea(box, u);

      let entranceOverlap = 0;
      for (const er of entranceRects) entranceOverlap += getRectOverlapArea(box, er);

      const bboxOverlap = getRectOverlapArea(box, targetBBox);

      let paddedOverlap = 0;
      for (const pc of paddedCells) paddedOverlap += getRectOverlapArea(box, pc);

      const boardOverlap = getRectOverlapArea(box, boardRect);
      const edgeDist = getRectGapDist(box, targetBBox);
      const metric = {
        left,
        top,
        clipOverflow,
        pieceOverlap,
        uiOverlap,
        entranceOverlap,
        bboxOverlap,
        paddedOverlap,
        tieScore: Math.round(edgeDist * 200 + boardOverlap + cand.dirRank * 150)
      };

      if (!best || compareOverlayCandidate(metric, best) < 0) {
        best = metric;
      }
    }
    return best;
  }

  function compareOverlayCandidate(a, b) {
    if (a.clipOverflow !== b.clipOverflow) return a.clipOverflow - b.clipOverflow;
    if (a.pieceOverlap !== b.pieceOverlap) return a.pieceOverlap - b.pieceOverlap;
    if (a.uiOverlap !== b.uiOverlap) return a.uiOverlap - b.uiOverlap;
    if (a.entranceOverlap !== b.entranceOverlap) return a.entranceOverlap - b.entranceOverlap;
    if (a.bboxOverlap !== b.bboxOverlap) return a.bboxOverlap - b.bboxOverlap;
    if (a.paddedOverlap !== b.paddedOverlap) return a.paddedOverlap - b.paddedOverlap;
    return a.tieScore - b.tieScore;
  }

  function placeConfirmOverlaySafely(co, targetBBox, cellRects, allowStack) {
    const area = document.querySelector('.canvas-area');
    if (!co || !area) return;
    const metrics = getConfirmCanvasMetrics(area);
    co.classList.remove('is-stacked');
    co.style.left = '0px';
    co.style.top = '0px';

    const ow1 = co.offsetWidth || 125;
    const oh1 = co.offsetHeight || 40;
    let chosen = findBestOverlayCandidate(ow1, oh1, targetBBox, cellRects, metrics);

    if (allowStack && chosen && (chosen.clipOverflow > 0 || chosen.pieceOverlap > 0 || chosen.uiOverlap > 0 || chosen.bboxOverlap > 0)) {
      co.classList.add('is-stacked');
      const ow2 = co.offsetWidth || ow1;
      const oh2 = co.offsetHeight || oh1;
      const stackedCand = findBestOverlayCandidate(ow2, oh2, targetBBox, cellRects, metrics);
      if (stackedCand && compareOverlayCandidate(stackedCand, chosen) < 0) {
        chosen = stackedCand;
      } else {
        co.classList.remove('is-stacked');
      }
    }

    if (chosen) {
      co.style.left = `${chosen.left}px`;
      co.style.top = `${chosen.top}px`;
    }
  }

  function syncHintOverlay(forceHide = false) {
    const hint = document.getElementById('hint-overlay');
    if (!hint) return;
    const textEl = document.getElementById('hint-pill-text');
    const skipBtn = document.getElementById('btn-skip-tutorial-game');
    const tutStep = getCurrentTutorialStep();

    if (tutStep) {
      const isBottomStep = !!(tutStep.isReroll || tutStep.isFinish);
      hint.classList.toggle('is-top', !isBottomStep);
      hint.classList.toggle('is-bottom', isBottomStep);
      if (textEl) textEl.textContent = getTutorialHintText();
      if (skipBtn) {
        skipBtn.textContent = isTutorialPracticeMode ? '練習終了' : 'スキップ';
        skipBtn.style.display = 'inline-flex';
      }
      hint.style.opacity = '1';
      return;
    }

    if (skipBtn) skipBtn.style.display = 'none';
    const entCells = (STAGE && STAGE.entranceCells) ? STAGE.entranceCells : [{ r: STAGE ? STAGE.entranceRow : 6, c: STAGE ? STAGE.entranceCol : 6 }];
    const avgR = entCells.reduce((s, cell) => s + (cell.r ?? 6), 0) / Math.max(1, entCells.length);
    hint.classList.toggle('is-top', avgR >= GRID / 2);
    hint.classList.toggle('is-bottom', avgR < GRID / 2);

    if (textEl) {
      const hasSel = (selectedSlot !== null && !!draftSlots[selectedSlot]);
      if (hasSel) {
        textEl.textContent = '玄関の隣の明るいマスをタップ';
      } else if (STAGE && STAGE.renovation) {
        textEl.textContent = '🔨「解体」で古い部屋を壊すか、カードを選んで増改築';
      } else {
        textEl.textContent = '下のカードを選んで玄関の隣へ';
      }
    }
    hint.style.opacity = (forceHide || hintDismissedForBuild) ? '0' : '1';
  }

  function showConfirmUI(show) {
    const co = document.getElementById('confirm-overlay');
    const btn = document.getElementById('btn-confirm-place');
    const pcTools = document.getElementById('confirm-pc-tools');
    if (!co) return;

    if (!show) {
      co.style.display = 'none';
      co.classList.remove('is-stacked');
      if (btn) btn.classList.remove('confirm-btn-invalid');
    } else {
      co.style.display = 'flex';
      const area = document.querySelector('.canvas-area');
      const metrics = area ? getConfirmCanvasMetrics(area) : null;

      if (selectedDemolishTarget && metrics) {
        if (pcTools) pcTools.style.display = 'none';
        const dCost = (selectedDemolishTarget.cost || 0).toFixed(1);
        const canAffordDemo = budget >= (selectedDemolishTarget.cost || 0);
        if (btn) {
          if (canAffordDemo) {
            btn.classList.remove('confirm-btn-invalid');
            btn.innerHTML = `<i class="ph-bold ph-hammer"></i> ${selectedDemolishTarget.label}解体 (-${dCost}万)`;
            btn.style.background = '#ea580c';
          } else {
            btn.classList.add('confirm-btn-invalid');
            btn.innerHTML = `<i class="ph-bold ph-warning"></i> 資金不足 (${dCost}万)`;
            btn.style.background = '';
          }
        }
        const cellRects = selectedDemolishTarget.cells.map(pt => ({
          left: metrics.originX + pt.c * cellSize,
          top: metrics.originY + pt.r * cellSize,
          right: metrics.originX + (pt.c + 1) * cellSize,
          bottom: metrics.originY + (pt.r + 1) * cellSize
        }));
        const targetBBox = {
          left: metrics.originX + selectedDemolishTarget.minC * cellSize,
          top: metrics.originY + selectedDemolishTarget.minR * cellSize,
          right: metrics.originX + (selectedDemolishTarget.maxC + 1) * cellSize,
          bottom: metrics.originY + (selectedDemolishTarget.maxR + 1) * cellSize
        };
        placeConfirmOverlaySafely(co, targetBBox, cellRects, false);
      } else if (selectedWallTarget && metrics) {
        if (pcTools) pcTools.style.display = 'none';
        const wCost = getWallRemoveCost().toFixed(1);
        if (btn) {
          btn.classList.remove('confirm-btn-invalid');
          btn.innerHTML = `<i class="ph-bold ph-hammer"></i> 壁撤去 (-${wCost}万)`;
          btn.style.background = '#e11d48';
        }
        const cx = metrics.originX + selectedWallTarget.mx;
        const cy = metrics.originY + selectedWallTarget.my;
        const wallBox = { left: cx - 14, top: cy - 14, right: cx + 14, bottom: cy + 14 };
        placeConfirmOverlaySafely(co, wallBox, [wallBox], false);
      } else if (hoverCell && selectedSlot !== null && draftSlots[selectedSlot] && metrics) {
        const tutStep = getCurrentTutorialStep();
        if (pcTools) {
          pcTools.style.display = tutStep && !tutStep.allowRotate && !tutStep.allowMirror ? 'none' : '';
        }
        updateMirrorButton();
        const piece = draftSlots[selectedSlot];
        const { shape, placeCheck, enc, totalPlaceCost, canAfford } = evaluatePiecePlacement(hoverCell.r, hoverCell.c, piece);
        const tutNotice = tutStep ? getTutorialActionNotice(tutStep) : '';
        if (btn) {
          if (tutStep && !isTutorialConfirmAllowed()) {
            btn.classList.add('confirm-btn-invalid');
            btn.innerHTML = `<i class="ph-bold ph-arrow-clockwise"></i> ${tutNotice || '向きを合わせよう'}`;
            btn.style.background = '';
          } else if (!placeCheck.ok) {
            btn.classList.add('confirm-btn-invalid');
            btn.innerHTML = `<i class="ph-bold ph-warning-circle"></i> ${placeCheck.shortLabel}`;
            btn.style.background = '';
          } else if (!canAfford) {
            btn.classList.add('confirm-btn-invalid');
            btn.innerHTML = `<i class="ph-bold ph-warning"></i> 資金不足 (${totalPlaceCost.toFixed(1)}万)`;
            btn.style.background = '';
          } else if (enc.count > 0) {
            btn.classList.remove('confirm-btn-invalid');
            btn.innerHTML = `<i class="ph-bold ph-pickaxe"></i> 確定 (+造成${enc.cost.toFixed(1)}万)`;
            btn.style.background = '#f59e0b';
          } else {
            btn.classList.remove('confirm-btn-invalid');
            btn.innerHTML = `<i class="ph-bold ph-check"></i> 確定`;
            btn.style.background = '';
          }
        }
        const { targetBBox, cellRects } = buildTargetBoundsFromShape(metrics, shape, hoverCell);
        const pcToolsVisible = pcTools && getComputedStyle(pcTools).display !== 'none';
        placeConfirmOverlaySafely(co, targetBBox, cellRects, pcToolsVisible);
      }
    }

    syncTutorialPuzzleUI();
    syncHintOverlay(show);
  }

  canvas.addEventListener('pointerdown', e => {
    initAudio();
    cancelRerollConfirm();
    const tutStep = getCurrentTutorialStep();
    if (tutStep) {
      selectedWallTarget = null;
      if (tutStep.isReroll || tutStep.isFinish) {
        playSound('tap');
        showFloatingText(getTutorialHintText() || 'ボタンをタップしよう', '#fbbf24');
        syncTutorialPuzzleUI();
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      const cy = e.touches ? e.touches[0].clientY : e.clientY;
      const rawC = Math.floor((cx - rect.left) / cellSize);
      const rawR = Math.floor((cy - rect.top) / cellSize);
      if (isTutorialPointInsideTarget(tutStep, rawR, rawC)) {
        hoverCell = { r: tutStep.targetR, c: tutStep.targetC };
        previewMode = true;
        confirmOverlayShownAt = Date.now();
        showConfirmUI(true);
        drawPlan();
      } else {
        playSound('tap');
        hoverCell = null;
        previewMode = false;
        showConfirmUI(false);
        drawPlan();
        showFloatingText('光る枠の中をタップしよう', '#fbbf24');
      }
      return;
    }
    if (selectedSlot === null || !draftSlots[selectedSlot]) {
      const rect = canvas.getBoundingClientRect();
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      const cy = e.touches ? e.touches[0].clientY : e.clientY;
      const rawC = Math.floor((cx - rect.left) / cellSize);
      const rawR = Math.floor((cy - rect.top) / cellSize);
      const wallHit = findSolidWallNearPointer(e);
      const demoHit = (typeof DXStage2 !== 'undefined' && DXStage2.findDemolishTargetAt)
        ? DXStage2.findDemolishTargetAt(grid, rawR, rawC)
        : null;

      // 解体モードOFF時は赤壁を優先。解体モードONでも未選択/固定部または壁直近タップなら壁判定を優先する
      if (wallHit && (!demolishMode || !demoHit || demoHit.locked || wallHit.dist < cellSize * 0.25)) {
        selectedDemolishTarget = null;
        if (wallHit.locked) {
          selectedWallTarget = null;
          showConfirmUI(false);
          playSound('error');
          showFloatingText('🔒 固定躯体壁は撤去できません', '#fca5a5');
          drawPlan();
          return;
        }
        selectedWallTarget = wallHit;
        playSound('tap');
        confirmOverlayShownAt = Date.now();
        showConfirmUI(true);
        drawPlan();
        return;
      }

      // リノベ解体対象の既存部屋タップ判定
      selectedWallTarget = null;
      if (demoHit && demoHit.cells) {
        selectedDemolishTarget = demoHit;
        playSound('tap');
        confirmOverlayShownAt = Date.now();
        showConfirmUI(true);
      } else {
        selectedDemolishTarget = null;
        showConfirmUI(false);
        if (demoHit && demoHit.locked) {
          playSound('error');
          showFloatingText(`🔒 ${demoHit.label}は構造固定のため解体できません`, '#fca5a5');
        } else if (demoHit && demoHit.entrance && demolishMode) {
          playSound('error');
          showFloatingText('玄関は解体できません', '#fca5a5');
        } else if (demoHit && demoHit.newlyPlaced && demolishMode) {
          playSound('tap');
          showFloatingText('新築部分は解体できません（既存部分のみ可）', '#94a3b8');
        }
      }
      drawPlan();
      return;
    }
    selectedWallTarget = null;
    selectedDemolishTarget = null;
    const pos = getCellFromPointer(e);
    if (pos) {
      hoverCell = pos;
      previewMode = true;
      confirmOverlayShownAt = Date.now();
      showConfirmUI(true);
      drawPlan();
    }
  });
  
  canvas.addEventListener('pointermove', e => {
    const tutStep = getCurrentTutorialStep();
    if (tutStep) {
      if (tutStep.isReroll || tutStep.isFinish || previewMode) return;
      const rect = canvas.getBoundingClientRect();
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      const cy = e.touches ? e.touches[0].clientY : e.clientY;
      const rawC = Math.floor((cx - rect.left) / cellSize);
      const rawR = Math.floor((cy - rect.top) / cellSize);
      const inside = isTutorialPointInsideTarget(tutStep, rawR, rawC);
      const nextHover = inside ? { r: tutStep.targetR, c: tutStep.targetC } : null;
      const changed = (!!hoverCell !== !!nextHover) || (hoverCell && nextHover && (hoverCell.r !== nextHover.r || hoverCell.c !== nextHover.c));
      if (changed) {
        hoverCell = nextHover;
        drawPlan();
      }
      return;
    }
    if (selectedSlot === null || !draftSlots[selectedSlot]) return;
    if (previewMode) {
      const isDragging = (e.pointerType === 'mouse' && e.buttons > 0) || (e.pointerType !== 'mouse');
      if (!isDragging) return; 
    }
    const pos = getCellFromPointer(e);
    if (pos && (!hoverCell || hoverCell.r !== pos.r || hoverCell.c !== pos.c)) {
      hoverCell = pos;
      if (previewMode) {
        confirmOverlayShownAt = Date.now();
        showConfirmUI(true);
      }
      drawPlan();
    }
  });
  
  canvas.addEventListener('pointerleave', () => { 
    if (!previewMode && !selectedWallTarget && !selectedDemolishTarget) {
      hoverCell = null; drawPlan(); 
    }
  });

  document.getElementById('btn-confirm-place').addEventListener('click', () => {
    // 盤面タップ／ドラッグ直後に指の下へボタンが出現して即確定する事故を防止
    if (Date.now() - confirmOverlayShownAt < 220) return;
    confirmSelectedAction();
  });


