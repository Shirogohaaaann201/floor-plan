'use strict';
/**
 * dx_stage3.js
 * Floor Plan DX版 第3段階 (A-3) モジュール
 * - DX限定の新部屋パーツ4種（防音書斎 / サンルーム / 土間ガレージ / ランドリー室）
 * - 新コンボ8種（記録帳 38種 → 46種）
 * - 特注コンボ顧客4名（配信者 / 愛猫家 / 車マニア / 家事の達人）
 * - 検証用テストプリセット2種（a3_full_house / a3_streamer_fortress）
 */
(function (global) {
  const DEFAULT_GRID = 12;

  /* ============================================================
     1. 部屋サブタイプ判定＆図面配色ヘルパー
  ============================================================ */
  function isStudioCell(cell) {
    return Boolean(cell && (cell.pieceLibId === 'room-studio' || cell.label === '書斎'));
  }

  function isSunroomCell(cell) {
    return Boolean(cell && (cell.pieceLibId === 'room-sunroom' || cell.label === 'サンルーム'));
  }

  function isGarageCell(cell) {
    return Boolean(cell && (cell.pieceLibId === 'closet-garage' || cell.label === 'ガレージ'));
  }

  function isLaundryCell(cell) {
    return Boolean(cell && (cell.pieceLibId === 'wash-laundry' || cell.label === '家事室'));
  }

  function getSubtype(cell) {
    if (!cell) return null;
    if (isStudioCell(cell)) return 'studio';
    if (isSunroomCell(cell)) return 'sunroom';
    if (isGarageCell(cell)) return 'garage';
    if (isLaundryCell(cell)) return 'laundry';
    return null;
  }

  function getCellStyle(pieceOrCell) {
    if (!pieceOrCell) return null;
    const pid = pieceOrCell.pieceLibId || pieceOrCell.id || '';
    const lbl = pieceOrCell.label || '';
    if (pid === 'room-studio' || lbl === '書斎') return { bg: '#e0e7ff', border: '#6366f1' };
    if (pid === 'room-sunroom' || lbl === 'サンルーム') return { bg: '#fef9c3', border: '#38bdf8' };
    if (pid === 'closet-garage' || lbl === 'ガレージ') return { bg: '#e2e8f0', border: '#475569' };
    if (pid === 'wash-laundry' || lbl === '家事室') return { bg: '#ccfbf1', border: '#14b8a6' };
    return null;
  }

  function getShortLabel(cell) {
    if (!cell) return null;
    if (isSunroomCell(cell)) return 'サン';
    if (isGarageCell(cell)) return '車庫';
    if (isLaundryCell(cell)) return '家事';
    if (isStudioCell(cell)) return '書斎';
    return null;
  }

  /* ============================================================
     2. DX限定の新部屋ピース4種（すべて R&D 技術開発対象）
  ============================================================ */
  const PIECES = [
    {
      id: 'wash-laundry',
      name: 'ランドリー室(2)',
      cat: 'washroom',
      label: '家事室',
      shape: [[1, 1]],
      cost: 10.0,
      unlockCost: 130,
      desc: '洗う・干す・アイロンが完結する2マス家事室 (5.0万/マス)'
    },
    {
      id: 'room-sunroom',
      name: 'サンルーム(2)',
      cat: 'room',
      label: 'サンルーム',
      shape: [[1, 1]],
      cost: 10.0,
      unlockCost: 140,
      desc: '光あふれる2マスガラス空間。庭や南窓・回遊と好相性 (5.0万/マス)'
    },
    {
      id: 'room-studio',
      name: '防音書斎(2)',
      cat: 'room',
      label: '書斎',
      shape: [[1, 1]],
      cost: 11.0,
      unlockCost: 160,
      desc: '遮音仕様の2マス配信＆作業部屋。窓ゼロで防音スタジオ化 (5.5万/マス)'
    },
    {
      id: 'closet-garage',
      name: '土間ガレージ(4)',
      cat: 'closet',
      label: 'ガレージ',
      shape: [[1, 1], [1, 1]],
      cost: 12.0,
      unlockCost: 180,
      desc: '愛車を停められる2×2屋内車庫。玄関やLDK直結で高評価 (3.0万/マス)'
    }
  ];

  /* ============================================================
     3. 新部屋用・必須依頼定義
  ============================================================ */
  function gridHasMatchingCell(pred) {
    if (typeof grid === 'undefined' || !Array.isArray(grid)) return false;
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < (grid[r] ? grid[r].length : 0); c++) {
        if (pred(grid[r][c])) return true;
      }
    }
    return false;
  }

  const REQUEST_DEFS = {
    req_studio: {
      id: 'req_studio',
      icon: 'ph-microphone-stage',
      color: '#6366f1',
      text: '防音書斎あり',
      fn: () => gridHasMatchingCell(isStudioCell)
    },
    req_sunroom: {
      id: 'req_sunroom',
      icon: 'ph-sun',
      color: '#f59e0b',
      text: 'サンルームあり',
      fn: () => gridHasMatchingCell(isSunroomCell)
    },
    req_garage: {
      id: 'req_garage',
      icon: 'ph-car',
      color: '#475569',
      text: '土間ガレージあり',
      fn: () => gridHasMatchingCell(isGarageCell)
    },
    req_laundry: {
      id: 'req_laundry',
      icon: 'ph-washing-machine',
      color: '#0d9488',
      text: 'ランドリー室(家事室)あり',
      fn: () => gridHasMatchingCell(isLaundryCell)
    }
  };

  /* ============================================================
     4. A-3 特注コンボ顧客4名
  ============================================================ */
  const SPECIAL_CLIENTS = [
    {
      id: 'streamer_booth',
      minBrand: 2,
      clientType: 'single',
      requiredPieceId: 'room-studio',
      lotPool: ['square_s', 'square_m', 'wide_rect', 'l_shape'],
      client: {
        name: '音無 レイ',
        avatar: '🎙️',
        quote: '「深夜でも思いっきり配信したいの！窓がひとつもない、完璧な防音書斎をお願いします！」',
        typeBadge: '人気配信者'
      },
      reqKeys: ['btsep', 'reach', 'req_studio'],
      optKeys: ['opt-closet'],
      initialBudget: 1750,
      targetRent: 8.2,
      maxTurns: 13,
      customCombo: {
        name: '完全防音スタジオ',
        normalBonus: 3.0,
        customBonus: 6.0,
        isNegativeInversion: false,
        hint: '防音書斎の窓を0箇所にする (+6.0万)'
      }
    },
    {
      id: 'cat_paradise',
      minBrand: 2,
      clientType: 'dinks',
      requiredPieceId: 'room-sunroom',
      lotPool: ['square_m', 'square_l', 'l_shape', 'u_shape'],
      client: {
        name: '三毛田 タマコ',
        avatar: '🐱',
        quote: '「日向ぼっこできるサンルームと、愛猫たちがぐるぐる走り回れる回遊動線が夢なんですニャ♪」',
        typeBadge: '愛猫家'
      },
      reqKeys: ['ldk1_room1', 'btsep', 'reach', 'req_sunroom'],
      optKeys: ['opt-sunlight'],
      initialBudget: 2950,
      targetRent: 12.2,
      maxTurns: 16,
      customCombo: {
        name: 'ネコと回遊サンルーム',
        normalBonus: 3.5,
        customBonus: 6.5,
        isNegativeInversion: false,
        hint: 'サンルーム＋ぐるり一周できる回遊ループ (+6.5万)'
      }
    },
    {
      id: 'garage_lover',
      minBrand: 3,
      clientType: 'dinks',
      requiredPieceId: 'closet-garage',
      lotPool: ['square_m', 'square_l', 'corner_cut', 'l_shape'],
      client: {
        name: '轟 ギア',
        avatar: '🏎️',
        quote: '「玄関から直接愛車に乗り込めて、外にも出られる本物のインナーガレージを造ってくれ！」',
        typeBadge: '車マニア'
      },
      reqKeys: ['ldk1_room1', 'btsep', 'reach', 'req_garage'],
      optKeys: ['opt-wash'],
      initialBudget: 3300,
      targetRent: 13.5,
      maxTurns: 16,
      customCombo: {
        name: 'インナーガレージ',
        normalBonus: 3.5,
        customBonus: 6.5,
        isNegativeInversion: false,
        hint: '外周に面するガレージを玄関と直結 (+6.5万)'
      }
    },
    {
      id: 'laundry_pro',
      minBrand: 2,
      clientType: 'family',
      requiredPieceId: 'wash-laundry',
      lotPool: ['square_m', 'square_l', 'l_shape', 'u_shape'],
      client: {
        name: '家事原 スッキリ',
        avatar: '🧺',
        quote: '「お風呂・キッチン・物干し場が一直線に繋がる家事室で、洗濯の手間を半分にしたいの！」',
        typeBadge: '家事の達人'
      },
      reqKeys: ['ldk1_room1', 'btsep', 'reach', 'req_laundry'],
      optKeys: ['opt-housework'],
      initialBudget: 3400,
      targetRent: 13.8,
      maxTurns: 17,
      customCombo: {
        name: '神家事動線',
        normalBonus: 3.5,
        customBonus: 6.0,
        isNegativeInversion: false,
        hint: '家事室をLDK・浴室・収納・サンルームの2種以上と直結 (+6.0万)'
      }
    }
  ];

  /* ============================================================
     5. 記録帳マスター定義8種（ID 39〜46 / 全46種）＆珍間取りデメリット
  ============================================================ */
  const COMBO_MASTER_ITEMS = [
    {
      id: 39,
      name: '完全防音スタジオ',
      category: '王道',
      bonus: '+3.0万',
      icon: 'ph-microphone-stage',
      hint: '防音書斎に外向きの窓をひとつも付けずに囲うか赤壁で遮音すると…？',
      desc: '外壁窓が0箇所の完全遮音された防音書斎'
    },
    {
      id: 40,
      name: 'ひなたぼっこ空間',
      category: '王道',
      bonus: '+2.5万',
      icon: 'ph-sun',
      hint: 'サンルームを南側へ開けるか、敷地内の専用庭に隣接させると…？',
      desc: '南向きに開けたサンルーム、または専用庭に面するサンルーム'
    },
    {
      id: 41,
      name: 'インナーガレージ',
      category: '王道',
      bonus: '+3.5万',
      icon: 'ph-car',
      hint: '外周に面した土間ガレージを玄関と直接つなぐと…？',
      desc: '外周（車道側）に面し、かつ玄関と直結した土間ガレージ'
    },
    {
      id: 42,
      name: '神家事動線',
      category: '王道',
      bonus: '+3.5万',
      icon: 'ph-washing-machine',
      hint: 'ランドリー室をLDK・浴室・収納・サンルームのうち2種類以上と直結させると…？',
      desc: '家事室がLDK・浴室・通常収納・サンルームの2種以上と直通'
    },
    {
      id: 43,
      name: 'ガレージライフ',
      category: '王道',
      bonus: '+3.0万',
      icon: 'ph-wrench',
      hint: '土間ガレージをLDKまたは防音書斎から直接眺められるようにすると…？',
      desc: '土間ガレージとLDKまたは防音書斎が直通で接続'
    },
    {
      id: 44,
      name: 'ネコと回遊サンルーム',
      category: '珍間取り',
      bonus: '+3.5万',
      icon: 'ph-cat',
      hint: 'サンルームと、ぐるりと一周できる回遊ループ動線を組み合わせると…？',
      desc: 'サンルームがあり、室内・廊下で一周できる回遊ルートが存在'
    },
    {
      id: 45,
      name: '閉じ込めガレージ',
      category: '珍間取り',
      bonus: '+2.0万',
      icon: 'ph-lock',
      hint: '土間ガレージの周囲を4方向すべて他の部屋で囲んでしまうと…？',
      desc: '外周・庭に1辺も面さず建物内に完全に閉じ込められた土間ガレージ'
    },
    {
      id: 46,
      name: '究極の配信要塞',
      category: '珍間取り',
      bonus: '+4.0万',
      icon: 'ph-shield-star',
      hint: '防音書斎を設けたうえで、建物全体の窓を完全にゼロにすると…？',
      desc: '防音書斎があり、建物全体の外壁窓が0箇所の超没入ブース邸'
    }
  ];

  const FUNNY_LAYOUT_PROPS = {
    'ネコと回遊サンルーム': { deg: 0.1, fill: 0 },
    '閉じ込めガレージ':     { deg: 0.3, fill: -10 },
    '究極の配信要塞':       { deg: 0.4, fill: -15 }
  };

  /* ============================================================
     6. A-3 コンボ検出ロジック
  ============================================================ */
  function countAllBuildingWindows(targetGrid, edgeTypeFn, hasSolidWallFn) {
    const gSize = targetGrid.length || DEFAULT_GRID;
    const winE = typeof E !== 'undefined' ? E.WINDOW : 'window';
    let count = 0;
    for (let r = 0; r < gSize; r++) {
      for (let c = 0; c < gSize; c++) {
        if (edgeTypeFn(r, c, r, c + 1) === winE && !hasSolidWallFn(r, c, r, c + 1)) count++;
        if (edgeTypeFn(r, c, r + 1, c) === winE && !hasSolidWallFn(r, c, r + 1, c)) count++;
        if (r === 0 && edgeTypeFn(-1, c, r, c) === winE && !hasSolidWallFn(-1, c, r, c)) count++;
        if (c === 0 && edgeTypeFn(r, -1, r, c) === winE && !hasSolidWallFn(r, -1, r, c)) count++;
      }
    }
    return count;
  }

  function hasWalkableCycle(targetGrid, visited, edgeTypeFn) {
    const gSize = targetGrid.length || DEFAULT_GRID;
    const noneE = typeof E !== 'undefined' ? E.NONE : 'none';
    const doorE = typeof E !== 'undefined' ? E.DOOR : 'door';
    const entT = typeof T !== 'undefined' ? T.ENTRANCE : 'entrance';
    const corrT = typeof T !== 'undefined' ? T.CORRIDOR : 'corridor';

    // 1) 到達可能な部屋ノード間の環状ループ検出（長さ3以上の閉路）
    const adj = new Map();
    const getNodeKey = (cell, r, c) => {
      if (!cell) return null;
      if (cell.type === entT) return 'entrance';
      if (cell.roomId) return `r_${cell.roomId}`;
      return `c_${r}_${c}`;
    };

    const isWalkable = (r, c) => {
      if (r < 0 || r >= gSize || c < 0 || c >= gSize) return false;
      return !visited || visited.has(`${r},${c}`);
    };

    for (let r = 0; r < gSize; r++) {
      for (let c = 0; c < gSize; c++) {
        if (!isWalkable(r, c)) continue;
        const c1 = targetGrid[r]?.[c];
        const k1 = getNodeKey(c1, r, c);
        if (!k1) continue;
        if (!adj.has(k1)) adj.set(k1, new Set());
        for (const [nr, nc] of [[r, c + 1], [r + 1, c]]) {
          if (!isWalkable(nr, nc)) continue;
          const c2 = targetGrid[nr]?.[nc];
          const k2 = getNodeKey(c2, nr, nc);
          if (!k2 || k1 === k2) continue;
          const et = edgeTypeFn(r, c, nr, nc);
          if (et === noneE || et === doorE) {
            adj.get(k1).add(k2);
            if (!adj.has(k2)) adj.set(k2, new Set());
            adj.get(k2).add(k1);
          }
        }
      }
    }

    const seen = new Set();
    const dfs = (u, parent) => {
      seen.add(u);
      for (const v of (adj.get(u) || [])) {
        if (v === parent) continue;
        if (seen.has(v)) return true;
        if (dfs(v, u)) return true;
      }
      return false;
    };
    for (const node of adj.keys()) {
      if (!seen.has(node) && dfs(node, null)) return true;
    }

    // 2) 廊下単独での環状ループ（外周から非廊下フラッドフィルで到達できない孤立孔があるか）
    const outerReach = new Set();
    const q = [];
    for (let r = 0; r < gSize; r++) {
      for (let c = 0; c < gSize; c++) {
        if ((r === 0 || r === gSize - 1 || c === 0 || c === gSize - 1) && targetGrid[r]?.[c]?.type !== corrT) {
          outerReach.add(`${r},${c}`);
          q.push({ r, c });
        }
      }
    }
    let head = 0;
    while (head < q.length) {
      const cur = q[head++];
      for (const [nr, nc] of [[cur.r - 1, cur.c], [cur.r + 1, cur.c], [cur.r, cur.c - 1], [cur.r, cur.c + 1]]) {
        if (nr < 0 || nr >= gSize || nc < 0 || nc >= gSize) continue;
        const nk = `${nr},${nc}`;
        if (!outerReach.has(nk) && targetGrid[nr]?.[nc]?.type !== corrT) {
          outerReach.add(nk);
          q.push({ r: nr, c: nc });
        }
      }
    }
    for (let r = 0; r < gSize; r++) {
      for (let c = 0; c < gSize; c++) {
        if (targetGrid[r]?.[c]?.type !== corrT && !outerReach.has(`${r},${c}`)) {
          return true;
        }
      }
    }
    return false;
  }

  function detectStage3Combos(targetGrid, stageObj, counts, visited, edgeTypeFn, hasSolidWallFn, calcFootprintFn) {
    const combos = [];
    if (!targetGrid) return combos;

    const gSize = targetGrid.length || DEFAULT_GRID;
    const emptyT = typeof T !== 'undefined' ? T.EMPTY : 'empty';
    const gardenT = typeof T !== 'undefined' ? T.GARDEN : 'garden';
    const obsT = typeof T !== 'undefined' ? T.OBSTACLE : 'obstacle';
    const ldkT = typeof T !== 'undefined' ? T.LDK : 'ldk';
    const bathT = typeof T !== 'undefined' ? T.BATH : 'bath';
    const closetT = typeof T !== 'undefined' ? T.CLOSET : 'closet';
    const entT = typeof T !== 'undefined' ? T.ENTRANCE : 'entrance';
    const noneE = typeof E !== 'undefined' ? E.NONE : 'none';
    const doorE = typeof E !== 'undefined' ? E.DOOR : 'door';
    const winE = typeof E !== 'undefined' ? E.WINDOW : 'window';
    const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

    const studios = new Map();
    const sunrooms = new Map();
    const garages = new Map();
    const laundries = new Map();

    const addCell = (map, cell, r, c) => {
      const k = cell.roomId ? String(cell.roomId) : `${r},${c}`;
      if (!map.has(k)) map.set(k, { key: k, cells: [], reachable: false });
      const rm = map.get(k);
      rm.cells.push({ r, c, cell });
      if (!visited || visited.has(`${r},${c}`)) rm.reachable = true;
    };

    for (let r = 0; r < gSize; r++) {
      for (let c = 0; c < gSize; c++) {
        const cell = targetGrid[r]?.[c];
        if (!cell) continue;
        if (isStudioCell(cell)) addCell(studios, cell, r, c);
        else if (isSunroomCell(cell)) addCell(sunrooms, cell, r, c);
        else if (isGarageCell(cell)) addCell(garages, cell, r, c);
        else if (isLaundryCell(cell)) addCell(laundries, cell, r, c);
      }
    }

    const fp = typeof calcFootprintFn === 'function' ? calcFootprintFn(targetGrid) : null;
    const bbox = (fp && fp.hasPlacedPiece) ? fp.bbox : null;

    // 39. 完全防音スタジオ（窓0の到達可能防音書斎）
    let hasSoundproofStudio = false;
    for (const rm of studios.values()) {
      if (!rm.reachable) continue;
      let winCnt = 0;
      for (const { r, c } of rm.cells) {
        for (const [dr, dc] of DIRS) {
          const nr = r + dr, nc = c + dc;
          if (!hasSolidWallFn(r, c, nr, nc) && edgeTypeFn(r, c, nr, nc) === winE) {
            winCnt++;
          }
        }
      }
      if (winCnt === 0) {
        hasSoundproofStudio = true;
        break;
      }
    }
    if (hasSoundproofStudio) {
      combos.push({
        name: '完全防音スタジオ',
        bonus: 3.0,
        icon: 'ph-microphone-stage text-indigo-500',
        type: 'good',
        text: '【王道】完全防音スタジオ — 外壁窓ゼロで遮音されたプロ仕様配信書斎 (+3.0万)'
      });
    }

    // 40. ひなたぼっこ空間（南向き無遮蔽窓 OR 専用庭隣接の到達可能サンルーム）
    let hasSunnySunroom = false;
    for (const rm of sunrooms.values()) {
      if (!rm.reachable) continue;
      for (const { r, c } of rm.cells) {
        // 南向き窓（遮蔽なし）
        if (!hasSolidWallFn(r, c, r + 1, c) && edgeTypeFn(r, c, r + 1, c) === winE) {
          let blocked = false;
          for (let rr = r + 1; rr < gSize; rr++) {
            const nc = targetGrid[rr]?.[c];
            if (nc && nc.type !== emptyT && nc.type !== gardenT && nc.type !== obsT) {
              blocked = true;
              break;
            }
          }
          if (!blocked) {
            hasSunnySunroom = true;
            break;
          }
        }
        // 占有枠内の専用庭に隣接
        if (bbox) {
          for (const [dr, dc] of DIRS) {
            const nr = r + dr, nc = c + dc;
            if (nr >= bbox.minR && nr <= bbox.maxR && nc >= bbox.minC && nc <= bbox.maxC) {
              const nb = targetGrid[nr]?.[nc];
              if (!nb || nb.type === emptyT || nb.type === gardenT) {
                hasSunnySunroom = true;
                break;
              }
            }
          }
          if (hasSunnySunroom) break;
        }
      }
      if (hasSunnySunroom) break;
    }
    if (hasSunnySunroom) {
      combos.push({
        name: 'ひなたぼっこ空間',
        bonus: 2.5,
        icon: 'ph-sun text-amber-500',
        type: 'good',
        text: '【王道】ひなたぼっこ空間 — 南窓や専用庭に開けたサンルームで陽当たり抜群 (+2.5万)'
      });
    }

    // 41 / 43 / 45 ガレージ系コンボ
    let hasInnerGarage = false;
    let hasGarageLife = false;
    let hasTrappedGarage = false;
    for (const rm of garages.values()) {
      let touchesOutside = false;
      let connEntrance = false;
      let connLdkOrStudio = false;
      for (const { r, c } of rm.cells) {
        for (const [dr, dc] of DIRS) {
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= gSize || nc < 0 || nc >= gSize) {
            touchesOutside = true;
            continue;
          }
          const nb = targetGrid[nr]?.[nc];
          if (!nb || nb.type === emptyT || nb.type === gardenT || nb.type === obsT) {
            touchesOutside = true;
            continue;
          }
          if (!rm.reachable) continue;
          const et = edgeTypeFn(r, c, nr, nc);
          if (et === noneE || et === doorE) {
            if (nb.type === entT) connEntrance = true;
            if (nb.type === ldkT || isStudioCell(nb)) connLdkOrStudio = true;
          }
        }
      }
      if (rm.reachable && touchesOutside && connEntrance) hasInnerGarage = true;
      if (rm.reachable && connLdkOrStudio) hasGarageLife = true;
      if (!touchesOutside) hasTrappedGarage = true;
    }
    if (hasInnerGarage) {
      combos.push({
        name: 'インナーガレージ',
        bonus: 3.5,
        icon: 'ph-car text-slate-600',
        type: 'good',
        text: '【王道】インナーガレージ — 外周面＆玄関直結で雨に濡れず愛車へ乗り降り！ (+3.5万)'
      });
    }
    if (hasGarageLife) {
      combos.push({
        name: 'ガレージライフ',
        bonus: 3.0,
        icon: 'ph-wrench text-slate-600',
        type: 'good',
        text: '【王道】ガレージライフ — LDK・書斎から愛車を眺められる大人の特等席 (+3.0万)'
      });
    }
    if (hasTrappedGarage) {
      combos.push({
        name: '閉じ込めガレージ',
        bonus: 2.0,
        icon: 'ph-lock text-purple-600',
        type: 'funny',
        text: '【珍間取り】閉じ込めガレージ — 車が外へ出られない建物内完全展示スペース！ (+2.0万)'
      });
    }

    // 42. 神家事動線（家事室が LDK / 浴室 / 通常収納 / サンルーム の2種以上と直通）
    let hasGodLaundry = false;
    for (const rm of laundries.values()) {
      if (!rm.reachable) continue;
      const adjTypes = new Set();
      for (const { r, c } of rm.cells) {
        for (const [dr, dc] of DIRS) {
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= gSize || nc < 0 || nc >= gSize) continue;
          const nb = targetGrid[nr]?.[nc];
          if (!nb) continue;
          const et = edgeTypeFn(r, c, nr, nc);
          if (et !== noneE && et !== doorE) continue;
          if (nb.type === ldkT) adjTypes.add('ldk');
          else if (nb.type === bathT) adjTypes.add('bath');
          else if (nb.type === closetT && !isGarageCell(nb)) adjTypes.add('closet');
          else if (isSunroomCell(nb)) adjTypes.add('sunroom');
        }
      }
      if (adjTypes.size >= 2) {
        hasGodLaundry = true;
        break;
      }
    }
    if (hasGodLaundry) {
      combos.push({
        name: '神家事動線',
        bonus: 3.5,
        icon: 'ph-washing-machine text-teal-600',
        type: 'good',
        text: '【王道】神家事動線 — 家事室からLDK・浴室・収納・サンルームへ最短一直線！ (+3.5万)'
      });
    }

    // 44. ネコと回遊サンルーム（到達可能サンルーム ＋ 建物内ループ）
    let hasReachableSunroom = false;
    for (const rm of sunrooms.values()) {
      if (rm.reachable) { hasReachableSunroom = true; break; }
    }
    if (hasReachableSunroom && hasWalkableCycle(targetGrid, visited, edgeTypeFn)) {
      combos.push({
        name: 'ネコと回遊サンルーム',
        bonus: 3.5,
        icon: 'ph-cat text-amber-500',
        type: 'funny',
        text: '【珍間取り】ネコと回遊サンルーム — 光あふれるサンルームと無限お散歩ループを両立！ (+3.5万)'
      });
    }

    // 46. 究極の配信要塞（防音書斎あり ＋ 建物全体の窓数が0）
    if (studios.size > 0 && countAllBuildingWindows(targetGrid, edgeTypeFn, hasSolidWallFn) === 0) {
      combos.push({
        name: '究極の配信要塞',
        bonus: 4.0,
        icon: 'ph-shield-star text-purple-600',
        type: 'funny',
        text: '【珍間取り】究極の配信要塞 — 建物まるごと完全遮光の没入スタジオ邸！ (+4.0万)'
      });
    }

    return combos;
  }

  /* ============================================================
     7. 検証用テストプリセット（a3_full_house / a3_streamer_fortress）
  ============================================================ */
  function applyTestPreset(presetId, helpers) {
    if (!helpers || !helpers.stage || !helpers.grid) return false;
    const { stage, grid, setEnt, fillRect, applyLotObstacles, T } = helpers;

    if (presetId === 'a3_full_house') {
      stage.lotType = 'square_xl';
      stage.client = {
        name: '三毛田 タマコ',
        avatar: '🐱',
        quote: '「日向ぼっこできるサンルームと、愛猫たちがぐるぐる走り回れる回遊動線が夢なんですニャ♪」',
        typeBadge: '愛猫家'
      };
      stage.requiredPieceId = 'room-sunroom';
      stage.customCombo = {
        name: 'ネコと回遊サンルーム',
        normalBonus: 3.5,
        customBonus: 6.5,
        isNegativeInversion: false,
        hint: 'サンルーム＋ぐるり一周できる回遊ループ (+6.5万)'
      };
      if (typeof REQUEST_REGISTRY !== 'undefined') {
        stage.requests = ['ldk1_room1', 'btsep', 'reach', 'req_sunroom']
          .map(k => REQUEST_REGISTRY[k] ? { ...REQUEST_REGISTRY[k] } : null)
          .filter(Boolean);
      }

      // 8x4 主屋構成: 全室到達可能＆NGゼロ＆A-3王道5種＋ネコ回遊サンルーム同時成立
      setEnt(7, 4, 'bottom');
      fillRect(6, 2, 2, 2, T.CLOSET, 'ガレージ', 'closet-garage', 3.0);
      fillRect(5, 2, 1, 2, T.WASHROOM, '家事室', 'wash-laundry', 5.0);
      fillRect(4, 2, 1, 2, T.BATH, '浴室', 'bath', 6.0);
      fillRect(4, 4, 1, 1, T.TOILET, 'WC', 'toilet', 4.0);
      fillRect(4, 5, 1, 3, T.CORRIDOR, '廊下', 'corr-i3', 0.9);
      fillRect(5, 7, 2, 1, T.CORRIDOR, '廊下', 'corr-i2', 1.0);
      fillRect(7, 5, 1, 3, T.CORRIDOR, '廊下', 'corr-i3', 0.9);
      fillRect(5, 5, 1, 2, T.ROOM, '書斎', 'room-studio', 5.5);
      fillRect(5, 4, 1, 1, T.LDK, 'LDK', 'ldk-23', 4.3);
      fillRect(6, 4, 1, 3, T.LDK, 'LDK', 'ldk-23', 4.3);
      // 同一LDK統合IDで L字4マス化
      grid[5][4].roomId = grid[6][4].roomId;
      fillRect(4, 8, 2, 2, T.ROOM, '洋室', 'room-22', 3.75);
      fillRect(6, 8, 2, 2, T.ROOM, 'サンルーム', 'room-sunroom', 5.0);

      // トイレ・浴室の余計なドアを抑止（WC⇄LDKの食欲減退防止・浴室⇄廊下のプライバシーゼロ防止・WC⇄STUDIO防止）
      grid[4][3].walls.right = true;
      grid[4][4].walls.bottom = true;
      grid[4][4].walls.right = false;
      return true;
    }

    if (presetId === 'a3_streamer_fortress') {
      if (typeof applyLotObstacles === 'function') applyLotObstacles('square_l');
      stage.client = {
        name: '音無 レイ',
        avatar: '🎙️',
        quote: '「深夜でも思いっきり配信したいの！窓がひとつもない、完璧な防音書斎をお願いします！」',
        typeBadge: '人気配信者'
      };
      stage.requiredPieceId = 'room-studio';
      stage.customCombo = {
        name: '完全防音スタジオ',
        normalBonus: 3.0,
        customBonus: 6.0,
        isNegativeInversion: false,
        hint: '防音書斎の窓を0箇所にする (+6.0万)'
      };
      if (typeof REQUEST_REGISTRY !== 'undefined') {
        stage.requests = ['btsep', 'reach', 'req_studio']
          .map(k => REQUEST_REGISTRY[k] ? { ...REQUEST_REGISTRY[k] } : null)
          .filter(Boolean);
      }

      setEnt(7, 3, 'bottom');
      grid[7][3].walls.top = true; // 玄関直風呂の抑止（玄関→東側廊下から入る）
      fillRect(5, 3, 2, 1, T.BATH, '浴室', 'bath', 6.0);
      grid[5][3].walls.right = true; // BATH⇄GARAGE遮断（浴室ドアはCORR側(6,4)のみ）
      fillRect(4, 3, 1, 1, T.TOILET, 'WC', 'toilet', 4.0);
      grid[4][3].walls.bottom = true;
      grid[4][3].walls.right = true; // WCは北側CORR(3,3)のみ接続
      fillRect(3, 3, 1, 3, T.CORRIDOR, '廊下', 'corr-i3', 0.9);
      fillRect(4, 4, 2, 2, T.CLOSET, 'ガレージ', 'closet-garage', 3.0); // 4辺完全包囲→閉じ込めガレージ
      fillRect(6, 4, 1, 3, T.CORRIDOR, '廊下', 'corr-i3', 0.9);
      fillRect(7, 4, 1, 1, T.CORRIDOR, '廊下', 'corr-1', 1.2);
      fillRect(4, 6, 2, 1, T.CORRIDOR, '廊下', 'corr-i2', 1.0);
      fillRect(3, 6, 1, 2, T.ROOM, '書斎', 'room-studio', 5.5);
      // 配信書斎の北・東・南(LDK側)外周を遮光壁にしつつ北壁2枚を装飾用に確保
      grid[3][6].walls.top = true;
      grid[3][7].walls.top = true;
      grid[3][7].walls.right = true;
      grid[3][7].walls.bottom = true;
      fillRect(4, 7, 3, 1, T.LDK, 'LDK', 'ldk-23', 4.3);
      grid[4][7].walls.right = true;
      grid[5][7].walls.right = true;
      grid[6][7].walls.right = true;
      grid[6][7].walls.bottom = true;
      return true;
    }

    return false;
  }

  global.DXStage3 = {
    PIECES,
    REQUEST_DEFS,
    SPECIAL_CLIENTS,
    COMBO_MASTER_ITEMS,
    FUNNY_LAYOUT_PROPS,
    isStudioCell,
    isSunroomCell,
    isGarageCell,
    isLaundryCell,
    getSubtype,
    getCellStyle,
    getShortLabel,
    detectStage3Combos,
    applyTestPreset
  };
})(window);
