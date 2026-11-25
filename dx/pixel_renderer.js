'use strict';
/**
 * pixel_renderer.js
 * 2Dゼルダ風トップダウン盤面レンダラー & 完成演出・連隊内見ツアーエンジン
 * (STEP2_PIXEL_SPEC.md Step A 実装)
 */
(function (global) {
  const DIRS = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 }
  ];

  // スピード設定の保存
  let tourSpeed = 1;
  try {
    const savedSpeed = parseFloat(localStorage.getItem('floorplan_pixel_speed') || '1');
    if ([1, 2, 4].includes(savedSpeed)) tourSpeed = savedSpeed;
  } catch (e) {}

  // 空室モードでも残す造り付け設備・外構アセットID
  const BUILTIN_ASSET_IDS = new Set([
    'furn_kitchen', 'furn_kitchen_v_west', 'furn_kitchen_v_east', 'furn_island_kitchen',
    'furn_bath_tub', 'furn_sento_tub', 'furn_ub', 'furn_fuji',
    'furn_toilet', 'furn_washbasin', 'furn_shoesbox_slim',
    'furn_tree', 'furn_flower', 'furn_pond', 'furn_lantern',
    'furn_stepping_stone', 'furn_rose_arch', 'furn_birdbath'
  ]);

  // 部屋中央に置くもの（ラグ・マット・食卓・こたつ・アイランド・布団・囲炉裏等）
  const CENTER_SNAP_ASSETS = new Set([
    'furn_bathmat', 'furn_rug_foyer', 'furn_rug_red', 'furn_living_rug',
    'furn_toy_box', 'furn_dining', 'furn_dining_lr', 'furn_cafe_table', 'furn_cafe_table_tb',
    'furn_chabudai', 'furn_chabudai_lr', 'furn_kotatsu', 'furn_kotatsu_v',
    'furn_tea_set', 'furn_tea_set_center', 'furn_tea_set_center_v', 'furn_coffin', 'furn_island_kitchen',
    'furn_futon', 'furn_futon_west', 'furn_futon_east', 'furn_futon_south'
  ]);

  const spriteBoundsCache = new Map();
  function getSpriteContentBounds(spriteId) {
    if (spriteBoundsCache.has(spriteId)) return spriteBoundsCache.get(spriteId);
    const spr = global.PixelAssets && global.PixelAssets.getSprite(spriteId);
    if (!spr || !spr.canvas) return null;
    try {
      const ctx = spr.canvas.getContext('2d');
      const w = spr.width || spr.canvas.width;
      const h = spr.height || spr.canvas.height;
      const data = ctx.getImageData(0, 0, w, h).data;
      let minX = w, minY = h, maxX = -1, maxY = -1;
      for (let y = 0; y < h; y++) {
        const rowOff = y * w * 4;
        for (let x = 0; x < w; x++) {
          if (data[rowOff + x * 4 + 3] >= 120) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      const res = (maxX >= minX && maxY >= minY) ? { minX, minY, maxX, maxY, w, h } : null;
      spriteBoundsCache.set(spriteId, res);
      return res;
    } catch (e) {
      spriteBoundsCache.set(spriteId, null);
      return null;
    }
  }

  function getRoomThemeSeed(cells, idx, stageObj) {
    let h = (idx || 0) * 7 + (cells ? cells.length * 13 : 0);
    if (cells && cells[0]) {
      h += cells[0].r * 31 + cells[0].c * 17;
    }
    const badge = stageObj?.client?.typeBadge || '';
    for (let i = 0; i < badge.length; i++) {
      h += badge.charCodeAt(i) * (i + 3);
    }
    return Math.abs(h);
  }

  /* ============================================================
     1. 部屋・壁・コンボ解析ヘルパー
  ============================================================ */
  function safeEdgeType(targetGrid, r1, c1, r2, c2, fallbackFn) {
    // ライブ盤面と一致している場合は既存の edgeType をそのまま使う
    if (typeof grid !== 'undefined' && targetGrid === grid && typeof fallbackFn === 'function') {
      return fallbackFn(r1, c1, r2, c2);
    }
    const gSize = targetGrid.length;
    const c1_cell = (r1 >= 0 && r1 < gSize && c1 >= 0 && c1 < gSize) ? targetGrid[r1][c1] : null;
    const c2_cell = (r2 >= 0 && r2 < gSize && c2 >= 0 && c2 < gSize) ? targetGrid[r2][c2] : null;

    if (c1_cell && c2_cell && c1_cell.roomId && c1_cell.roomId === c2_cell.roomId) return E.NONE;

    // 簡易 solidWall 判定
    const hasSolid = (() => {
      if (c1_cell && c1_cell.walls) {
        if (r2 === r1 - 1 && c1_cell.walls.top) return true;
        if (r2 === r1 + 1 && c1_cell.walls.bottom) return true;
        if (c2 === c1 - 1 && c1_cell.walls.left) return true;
        if (c2 === c1 + 1 && c1_cell.walls.right) return true;
      }
      if (c2_cell && c2_cell.walls) {
        if (r1 === r2 - 1 && c2_cell.walls.top) return true;
        if (r1 === r2 + 1 && c2_cell.walls.bottom) return true;
        if (c1 === c2 - 1 && c2_cell.walls.left) return true;
        if (c1 === c2 + 1 && c2_cell.walls.right) return true;
      }
      return false;
    })();
    if (hasSolid) return E.WALL;

    const isP1 = c1_cell && c1_cell.type !== T.EMPTY && c1_cell.type !== T.GARDEN && c1_cell.type !== T.OBSTACLE;
    const isP2 = c2_cell && c2_cell.type !== T.EMPTY && c2_cell.type !== T.GARDEN && c2_cell.type !== T.OBSTACLE;
    if (!isP1 && !isP2) return E.NONE;
    if (!isP1 || !isP2) {
      const occ = isP1 ? c1_cell : c2_cell;
      if (occ && (occ.type === T.LDK || occ.type === T.ROOM)) return E.WINDOW;
      return E.WALL;
    }
    if (c1_cell.type === T.CORRIDOR && c2_cell.type === T.CORRIDOR) return E.NONE;
    if ((c1_cell.type === T.CORRIDOR && c2_cell.type === T.ENTRANCE) ||
        (c2_cell.type === T.CORRIDOR && c1_cell.type === T.ENTRANCE)) return E.NONE;

    // 過去物件データ復元時は隣接異種セル間の最初の接触辺に自動ドアを割り当てる
    const id1 = String(c1_cell.roomId || `${r1},${c1}`);
    const id2 = String(c2_cell.roomId || `${r2},${c2}`);
    const edges = [];
    for (let rr = 0; rr < gSize; rr++) {
      for (let cc = 0; cc < gSize; cc++) {
        const ca = targetGrid[rr]?.[cc];
        if (!ca) continue;
        const ida = String(ca.roomId || `${rr},${cc}`);
        if (cc + 1 < gSize && targetGrid[rr][cc + 1]) {
          const cb = targetGrid[rr][cc + 1];
          const idb = String(cb.roomId || `${rr},${cc + 1}`);
          if ((ida === id1 && idb === id2) || (ida === id2 && idb === id1)) {
            edges.push({ r1: rr, c1: cc, r2: rr, c2: cc + 1 });
          }
        }
        if (rr + 1 < gSize && targetGrid[rr + 1]?.[cc]) {
          const cb = targetGrid[rr + 1][cc];
          const idb = String(cb.roomId || `${rr + 1},${cc}`);
          if ((ida === id1 && idb === id2) || (ida === id2 && idb === id1)) {
            edges.push({ r1: rr, c1: cc, r2: rr + 1, c2: cc });
          }
        }
      }
    }
    if (!edges.length) return E.WALL;
    let s1 = id1, s2 = id2;
    if (s1 > s2) [s1, s2] = [s2, s1];
    let hashVal = 0;
    for (let i = 0; i < s1.length; i++) hashVal += s1.charCodeAt(i);
    for (let i = 0; i < s2.length; i++) hashVal += s2.charCodeAt(i) * 17;
    const ch = edges[hashVal % edges.length];
    const rA = Math.min(r1, r2), rB = Math.max(r1, r2);
    const cA = Math.min(c1, c2), cB = Math.max(c1, c2);
    return (ch.r1 === rA && ch.c1 === cA && ch.r2 === rB && ch.c2 === cB) ? E.DOOR : E.WALL;
  }

  function hasCellSolidWall(targetGrid, r1, c1, r2, c2) {
    if (typeof grid !== 'undefined' && targetGrid === grid && typeof hasSolidWall === 'function') {
      return hasSolidWall(r1, c1, r2, c2);
    }
    const c1_cell = targetGrid[r1]?.[c1];
    const c2_cell = targetGrid[r2]?.[c2];
    if (c1_cell && c1_cell.walls) {
      if (r2 === r1 - 1 && c1_cell.walls.top) return true;
      if (r2 === r1 + 1 && c1_cell.walls.bottom) return true;
      if (c2 === c1 - 1 && c1_cell.walls.left) return true;
      if (c2 === c1 + 1 && c1_cell.walls.right) return true;
    }
    if (c2_cell && c2_cell.walls) {
      if (r1 === r2 - 1 && c2_cell.walls.top) return true;
      if (r1 === r2 + 1 && c2_cell.walls.bottom) return true;
      if (c1 === c2 - 1 && c2_cell.walls.left) return true;
      if (c1 === c2 + 1 && c2_cell.walls.right) return true;
    }
    return false;
  }

  function computeVisitedSet(targetGrid, stageObj) {
    const gSize = targetGrid.length;
    const entCells = [];
    for (let r = 0; r < gSize; r++) {
      for (let c = 0; c < gSize; c++) {
        if (targetGrid[r]?.[c]?.type === T.ENTRANCE) entCells.push({ r, c });
      }
    }
    if (entCells.length === 0 && stageObj) {
      if (Array.isArray(stageObj.entranceCells)) {
        entCells.push(...stageObj.entranceCells);
      } else if (stageObj.entranceRow !== undefined) {
        entCells.push({ r: stageObj.entranceRow, c: stageObj.entranceCol });
      }
    }
    const visited = new Set(entCells.map(x => `${x.r},${x.c}`));
    const q = [...entCells];
    while (q.length) {
      const cur = q.shift();
      for (const { dr, dc } of DIRS) {
        const nr = cur.r + dr, nc = cur.c + dc;
        const k = `${nr},${nc}`;
        if (nr < 0 || nr >= gSize || nc < 0 || nc >= gSize || visited.has(k)) continue;
        const et = safeEdgeType(targetGrid, cur.r, cur.c, nr, nc, typeof edgeType === 'function' ? edgeType : null);
        if (et === E.NONE || et === E.DOOR) {
          visited.add(k);
          q.push({ r: nr, c: nc });
        }
      }
    }
    return { visited, entCells };
  }

  function analyzeRoomsAndClusters(targetGrid, visited) {
    const gSize = targetGrid.length;
    const fp = calcFootprintStats(targetGrid);
    const bbox = (fp && fp.hasPlacedPiece) ? fp.bbox : null;

    const roomMap = new Map(); // key -> { id, type, label, pieceLibId, cells, hasWindow, reachable, minR, maxR, minC, maxC }
    for (let r = 0; r < gSize; r++) {
      for (let c = 0; c < gSize; c++) {
        const cell = targetGrid[r]?.[c];
        if (!cell || cell.type === T.EMPTY || cell.type === T.GARDEN || cell.type === T.OBSTACLE) continue;
        const key = cell.roomId ? `id_${cell.roomId}` : `pos_${r}_${c}_${cell.type}`;
        if (!roomMap.has(key)) {
          roomMap.set(key, {
            key,
            roomId: cell.roomId,
            type: cell.type,
            label: cell.label || '',
            pieceLibId: cell.pieceLibId || '',
            cells: [],
            hasWindow: false,
            reachable: false,
            minR: r, maxR: r, minC: c, maxC: c
          });
        }
        const rm = roomMap.get(key);
        rm.cells.push({ r, c });
        rm.minR = Math.min(rm.minR, r);
        rm.maxR = Math.max(rm.maxR, r);
        rm.minC = Math.min(rm.minC, c);
        rm.maxC = Math.max(rm.maxC, c);
        if (visited.has(`${r},${c}`)) rm.reachable = true;
        // 窓チェック
        for (const { dr, dc } of DIRS) {
          const et = safeEdgeType(targetGrid, r, c, r + dr, c + dc, typeof edgeType === 'function' ? edgeType : null);
          if (et === E.WINDOW) rm.hasWindow = true;
        }
      }
    }

    // 庭クラスター解析
    const gardenCells = new Set();
    if (bbox) {
      for (let r = bbox.minR; r <= bbox.maxR; r++) {
        for (let c = bbox.minC; c <= bbox.maxC; c++) {
          const cell = targetGrid[r]?.[c];
          if (!cell || cell.type === T.EMPTY || cell.type === T.GARDEN) {
            gardenCells.add(`${r},${c}`);
          }
        }
      }
    }
    const gVisited = new Set();
    const gardenClusters = [];
    for (const k of gardenCells) {
      if (gVisited.has(k)) continue;
      const cluster = [];
      const q = [k];
      gVisited.add(k);
      while (q.length) {
        const cur = q.shift();
        const [cr, cc] = cur.split(',').map(Number);
        cluster.push({ r: cr, c: cc });
        for (const { dr, dc } of DIRS) {
          const nk = `${cr + dr},${cc + dc}`;
          if (gardenCells.has(nk) && !gVisited.has(nk)) {
            gVisited.add(nk);
            q.push(nk);
          }
        }
      }
      gardenClusters.push(cluster);
    }

    return { rooms: Array.from(roomMap.values()), gardenClusters, bbox, fp };
  }

  function computeDoorSwingPlan(targetGrid, rooms) {
    const gSize = targetGrid.length;
    const cellRoomMap = new Map();
    const cellRoomSize = new Map();
    for (const rm of rooms) {
      for (const pt of rm.cells) {
        cellRoomMap.set(`${pt.r},${pt.c}`, rm);
        cellRoomSize.set(`${pt.r},${pt.c}`, rm.cells.length);
      }
    }
    const fn = typeof edgeType === 'function' ? edgeType : null;
    const edgeAt = (r1, c1, r2, c2) => safeEdgeType(targetGrid, r1, c1, r2, c2, fn);

    const vDoors = new Map();
    const hDoors = new Map();
    const cellSwingInfo = new Map();
    const addCellSwing = (r, c, dirKey) => {
      const k = `${r},${c}`;
      if (!cellSwingInfo.has(k)) cellSwingInfo.set(k, { count: 0, fromNorth: false, fromWest: false, fromEast: false });
      const info = cellSwingInfo.get(k);
      info.count++;
      info[dirKey] = true;
    };

    const scoreRoomForSwing = (rm, cellR, cellC) => {
      if (!rm) return -999;
      let sc = 0;
      if (rm.type === T.CORRIDOR) sc += 120;
      else if (rm.type === T.ENTRANCE) sc += 50;
      else sc += Math.min(4, rm.cells.length) * 18;
      if ((rm.type === T.TOILET || rm.type === T.WASHROOM || rm.type === T.CLOSET || rm.type === T.BATH || rm.type === T.LDK) && rm.cells.length <= 1) {
        sc -= 80;
      }
      if (edgeAt(cellR - 1, cellC, cellR, cellC) !== E.DOOR) sc += 15;
      return sc;
    };

    // 1) 縦ドア（左右セル間）の開き先・蝶番位置を先決（襖・大型浴室引き戸はスキップ）
    for (let r = 0; r < gSize; r++) {
      for (let c = 0; c < gSize - 1; c++) {
        if (edgeAt(r, c, r, c + 1) !== E.DOOR) continue;
        const rmL = cellRoomMap.get(`${r},${c}`);
        const rmR = cellRoomMap.get(`${r},${c + 1}`);
        const cL = targetGrid[r]?.[c];
        const cR = targetGrid[r]?.[c + 1];
        const kind = resolveDoorKind(cL, cR, r, c, r, c + 1, cellRoomSize);
        if (kind === 'fusuma' || kind === 'bath_slide') continue;

        const scL = scoreRoomForSwing(rmL, r, c);
        const scR = scoreRoomForSwing(rmR, r, c + 1);
        const dirX = (kind === 'bath_fold')
          ? ((cR?.type === T.BATH && cL?.type !== T.BATH) ? 1 : ((cL?.type === T.BATH && cR?.type !== T.BATH) ? -1 : ((scR >= scL) ? 1 : -1)))
          : ((scR >= scL) ? 1 : -1);
        const targetC = dirX > 0 ? c + 1 : c;
        const topIsDoor = edgeAt(r - 1, targetC, r, targetC) === E.DOOR;
        const botIsDoor = edgeAt(r, targetC, r + 1, targetC) === E.DOOR;
        const hingeAt = (topIsDoor && !botIsDoor) ? 'bottom' : 'top';

        vDoors.set(`${r},${c}`, { dirX, hingeAt, targetR: r, targetC, kind });
        addCellSwing(r, targetC, dirX > 0 ? 'fromWest' : 'fromEast');
      }
    }

    // 2) 横ドア（上下セル間）の蝶番左右を決定（縦ドア・壁際家具の邪魔にならない側を優先）
    for (let r = 1; r < gSize; r++) {
      for (let c = 0; c < gSize; c++) {
        if (edgeAt(r - 1, c, r, c) !== E.DOOR) continue;
        const cTop = targetGrid[r - 1]?.[c];
        const cCur = targetGrid[r]?.[c];
        const kind = resolveDoorKind(cTop, cCur, r - 1, c, r, c, cellRoomSize);
        if (kind === 'fusuma' || kind === 'bath_slide') continue;

        const sw = cellSwingInfo.get(`${r},${c}`) || {};
        const vL = edgeAt(r, c - 1, r, c);
        const vR = edgeAt(r, c, r, c + 1);
        const topHasDoor = edgeAt(r - 1, c - 1, r - 1, c) === E.DOOR;
        let hingeSide = 'left';
        if (sw.fromWest && !sw.fromEast) hingeSide = 'right';
        else if (sw.fromEast && !sw.fromWest) hingeSide = 'left';
        else if (vR === E.WALL && vL === E.DOOR && !sw.fromWest) hingeSide = 'left';
        else if (vL === E.WALL && vR === E.DOOR && !sw.fromEast) hingeSide = 'right';
        else if (vR === E.DOOR && vL !== E.DOOR) hingeSide = 'left';
        else if (vL === E.DOOR && vR !== E.DOOR) hingeSide = 'right';
        else if (topHasDoor) hingeSide = 'right';

        hDoors.set(`${r},${c}`, { hingeSide, targetR: r, targetC: c, kind });
        addCellSwing(r, c, 'fromNorth');
      }
    }

    return { vDoors, hDoors, cellSwingInfo, cellRoomSize };
  }

  /* ============================================================
     2. 家具レイアウトプランナー (STEP2_PIXEL_SPEC 第6章準拠)
  ============================================================ */
  function collectFurnitureCatalogIds(plan) {
    if (!plan) return [];
    const cat = global.FurnitureCatalog || null;
    const norm = (rawId) => {
      if (!rawId) return null;
      return (cat && typeof cat.normalizeAssetId === 'function') ? cat.normalizeAssetId(rawId) : rawId;
    };
    const seen = new Set();
    const out = [];
    const addId = (rawId) => {
      const id = norm(rawId);
      if (id && !seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    };
    if (Array.isArray(plan.items)) {
      for (const it of plan.items) {
        if (it && it.assetId) addId(it.assetId);
      }
    }
    if (Array.isArray(plan.wallDecoRooms)) {
      const decoMap = (cat && cat.WALL_DECO_TYPE_TO_ID) || {
        fuji: 'wall_fuji',
        shower: 'wall_shower',
        kakejiku: 'wall_kakejiku',
        scroll_ninja: 'wall_scroll_ninja',
        art_1: 'wall_art_1',
        art_2: 'wall_art_2',
        clock: 'wall_clock'
      };
      for (const wd of plan.wallDecoRooms) {
        if (wd && wd.type) addId(decoMap[wd.type] || `wall_${wd.type}`);
      }
    }
    if (Array.isArray(plan.extraAssetIds)) {
      for (const ex of plan.extraAssetIds) addId(ex);
    }
    return out;
  }

  function buildFurniturePlan(targetGrid, combos, visited, stageObj) {
    if (!visited) visited = computeVisitedSet(targetGrid, stageObj).visited;
    const comboNames = new Set((combos || []).map(c => typeof c === 'string' ? c : c.name));
    const { rooms, gardenClusters } = analyzeRoomsAndClusters(targetGrid, visited);
    const doorPlan = computeDoorSwingPlan(targetGrid, rooms);
    const gSize = targetGrid.length;
    const items = []; // { assetId, r, c, wCells, hCells, roomKey, delayMs, animated, kind }
    const darkRooms = new Set(); // roomKey for 封印されし闇 / 要塞化
    const usedCells = new Set(); // 重複配置防止 "r,c"

    const markUsed = (r, c, w = 1, h = 1) => {
      for (let dr = 0; dr < h; dr++) {
        for (let dc = 0; dc < w; dc++) {
          usedCells.add(`${r + dr},${c + dc}`);
        }
      }
    };
    const isFree = (r, c, w = 1, h = 1, cellSet = null) => {
      for (let dr = 0; dr < h; dr++) {
        for (let dc = 0; dc < w; dc++) {
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || rr >= gSize || cc < 0 || cc >= gSize) return false;
          const k = `${rr},${cc}`;
          if (usedCells.has(k)) return false;
          if (cellSet && !cellSet.has(k)) return false;
        }
      }
      return true;
    };
    const addItem = (assetId, r, c, wCells = 1, hCells = 1, roomKey = null, extra = {}) => {
      markUsed(r, c, wCells, hCells);
      items.push({
        assetId,
        r, c,
        wCells, hCells,
        roomKey,
        delayMs: 0,
        ...extra
      });
    };

    const facingDir = ((typeof getEntranceFacing === 'function') ? getEntranceFacing(stageObj, targetGrid)?.dir : null) || 'bottom';

    // セル上下左右の壁・ドア状態を調べるヘルパー
    const getCellEdges = (r, c) => {
      const top = safeEdgeType(targetGrid, r - 1, c, r, c, typeof edgeType === 'function' ? edgeType : null);
      const bottom = safeEdgeType(targetGrid, r, c, r + 1, c, typeof edgeType === 'function' ? edgeType : null);
      const left = safeEdgeType(targetGrid, r, c - 1, r, c, typeof edgeType === 'function' ? edgeType : null);
      const right = safeEdgeType(targetGrid, r, c, r, c + 1, typeof edgeType === 'function' ? edgeType : null);
      const isWall = (e) => (e === E.WALL || e === E.WINDOW);
      return {
        top, bottom, left, right,
        wTop: isWall(top), wBottom: isWall(bottom), wLeft: isWall(left), wRight: isWall(right),
        hasSolidTop: top === E.WALL, hasSolidLeft: left === E.WALL, hasSolidRight: right === E.WALL, hasSolidBottom: bottom === E.WALL,
        hasDoor: (top === E.DOOR || bottom === E.DOOR || left === E.DOOR || right === E.DOOR)
      };
    };

    const pickSnapDir = (eInfo, preferSide = false, preferNorth = true, preferEast = false) => {
      if (preferSide) {
        if (preferEast) {
          if (eInfo.hasSolidRight) return 'east';
          if (eInfo.hasSolidLeft) return 'west';
          if (eInfo.wRight) return 'east';
          if (eInfo.wLeft) return 'west';
        } else {
          if (eInfo.hasSolidLeft) return 'west';
          if (eInfo.hasSolidRight) return 'east';
          if (eInfo.wLeft) return 'west';
          if (eInfo.wRight) return 'east';
        }
      }
      if (!preferNorth && eInfo.wBottom) return 'south';
      // 窓なし壁を優先（窓の前に本棚等を置かない工夫）
      if (eInfo.hasSolidTop) return 'north';
      if (preferEast) {
        if (eInfo.hasSolidRight) return 'east';
        if (eInfo.hasSolidLeft) return 'west';
      } else {
        if (eInfo.hasSolidLeft) return 'west';
        if (eInfo.hasSolidRight) return 'east';
      }
      if (eInfo.wTop) return 'north';
      if (preferEast) {
        if (eInfo.wRight) return 'east';
        if (eInfo.wLeft) return 'west';
      } else {
        if (eInfo.wLeft) return 'west';
        if (eInfo.wRight) return 'east';
      }
      if (eInfo.wBottom) return 'south';
      return 'center';
    };

    const countCellDoors = (r, c) => {
      const e = getCellEdges(r, c);
      let n = 0;
      if (e.top === E.DOOR) n++;
      if (e.bottom === E.DOOR) n++;
      if (e.left === E.DOOR) n++;
      if (e.right === E.DOOR) n++;
      return n;
    };

    const getSwingPenalty = (r, c) => {
      const sw = doorPlan.cellSwingInfo.get(`${r},${c}`);
      return sw ? sw.count * 240 : 0;
    };

    const wallDecoRooms = []; // 立ち上がり北壁に掛ける装飾情報
    const northWallDecoCells = new Set(); // 北壁装飾が専有するセル（背の高い壁寄せ家具と相互排他）
    const registerWallDeco = (type, r, c, wCells = 1) => {
      wallDecoRooms.push({ type, r, c, wCells });
      for (let dc = 0; dc < wCells; dc++) {
        northWallDecoCells.add(`${r},${c + dc}`);
      }
    };

    // 壁寄せ配置（壁が1辺もないセルには置かない：requireWall）
    const findWallSingle = (cells, cellSet, preferNorth = true, opts = {}) => {
      const { preferSide = false, requireWall = true, preferEast = false } = opts;
      const freeCells = cells.filter(pt => isFree(pt.r, pt.c, 1, 1, cellSet));
      const candidates = freeCells.map(pt => {
        const e = getCellEdges(pt.r, pt.c);
        const hasAnyWall = e.wTop || e.wLeft || e.wRight || e.wBottom;
        const dc = countCellDoors(pt.r, pt.c);
        let score = 0;
        if (preferSide) {
          if (e.wLeft || e.wRight) score += 150;
          if (e.hasSolidLeft || e.hasSolidRight) score += 30;
          if (preferEast) {
            if (e.hasSolidRight) score += 20;
            else if (e.wRight) score += 12;
          } else {
            if (e.hasSolidLeft) score += 20;
            else if (e.wLeft) score += 12;
          }
          if (e.wTop) score += 40;
          if (e.wBottom) score += 20;
        } else {
          if (e.hasSolidTop) score += preferNorth ? 140 : 70;
          else if (e.wTop) score += preferNorth ? 95 : 55;
          if (e.hasSolidLeft || e.hasSolidRight) score += 90;
          else if (e.wLeft || e.wRight) score += 70;
          if (e.wBottom) score += preferNorth ? 35 : 110;
        }
        if (e.hasDoor) score -= 90;
        if (e.top === E.DOOR) score -= 70;
        if (e.top === E.WINDOW) score -= 35;
        if (dc >= 2) score -= (dc - 1) * 180;
        if (northWallDecoCells.has(`${pt.r},${pt.c}`)) score -= 180;
        score -= getSwingPenalty(pt.r, pt.c);
        return { pt, score, hasAnyWall, snap: pickSnapDir(e, preferSide, preferNorth, preferEast) };
      });
      const filtered = requireWall ? candidates.filter(c => c.hasAnyWall) : candidates;
      const list = filtered.length > 0 ? filtered : (requireWall ? [] : candidates);
      list.sort((a, b) => b.score - a.score || (a.pt.r - b.pt.r) || (a.pt.c - b.pt.c));
      return list[0] ? { ...list[0].pt, snap: list[0].snap } : null;
    };

    const findWallPair = (cells, cellSet, preferNorth = true) => {
      const scored = cells
        .filter(pt => isFree(pt.r, pt.c, 2, 1, cellSet))
        .map(pt => {
          const e1 = getCellEdges(pt.r, pt.c);
          const e2 = getCellEdges(pt.r, pt.c + 1);
          const hasEdgeWall = (e1.wTop && e2.wTop) || (e1.wBottom && e2.wBottom);
          let score = 0;
          if (e1.wTop && e2.wTop) score += preferNorth ? 140 : 70;
          else if (e1.wTop || e2.wTop) score += 75;
          if (e1.wBottom && e2.wBottom) score += preferNorth ? 25 : 120;
          if (e1.wLeft || e2.wRight) score += 30;
          if (e1.hasDoor || e2.hasDoor) score -= 95;
          if (e1.top === E.DOOR || e2.top === E.DOOR) score -= 70;
          if (northWallDecoCells.has(`${pt.r},${pt.c}`) || northWallDecoCells.has(`${pt.r},${pt.c + 1}`)) score -= 220;
          score -= getSwingPenalty(pt.r, pt.c) + getSwingPenalty(pt.r, pt.c + 1);
          let snap;
          if (!preferNorth && e1.wBottom && e2.wBottom) snap = 'south';
          else if (e1.wTop && e2.wTop && !(northWallDecoCells.has(`${pt.r},${pt.c}`) || northWallDecoCells.has(`${pt.r},${pt.c + 1}`))) snap = 'north';
          else if (e1.wBottom && e2.wBottom) snap = 'south';
          else if (e1.wTop || e2.wTop) snap = 'north';
          else snap = 'center';
          return { pt, score, hasEdgeWall, snap };
        })
        .filter(x => x.snap !== 'center')
        .sort((a, b) => b.score - a.score || (a.pt.r - b.pt.r) || (a.pt.c - b.pt.c));
      return scored[0] ? { ...scored[0].pt, snap: scored[0].snap } : null;
    };

    // 縦2マス（1x2）の壁沿いペア（西壁／東壁用）
    const findWallVerticalPair = (cells, cellSet) => {
      const scored = cells
        .filter(pt => isFree(pt.r, pt.c, 1, 2, cellSet))
        .map(pt => {
          const e1 = getCellEdges(pt.r, pt.c);
          const e2 = getCellEdges(pt.r + 1, pt.c);
          let score = 0;
          let snap = null;
          if (e1.wLeft && e2.wLeft) { score += 130; snap = 'west'; }
          else if (e1.wRight && e2.wRight) { score += 130; snap = 'east'; }
          if (e1.hasDoor || e2.hasDoor) score -= 90;
          score -= getSwingPenalty(pt.r, pt.c) + getSwingPenalty(pt.r + 1, pt.c);
          return { pt, score, snap };
        })
        .filter(x => x.snap !== null)
        .sort((a, b) => b.score - a.score || (a.pt.r - b.pt.r) || (a.pt.c - b.pt.c));
      return scored[0] ? { ...scored[0].pt, snap: scored[0].snap } : null;
    };

    // 部屋中央・フリー配置（ダイニング・ちゃぶ台・こたつ・中央便器など）
    const findCenterSingle = (cells, cellSet) => {
      const avgR = cells.reduce((s, p) => s + p.r, 0) / Math.max(1, cells.length);
      const avgC = cells.reduce((s, p) => s + p.c, 0) / Math.max(1, cells.length);
      const sorted = cells
        .filter(pt => isFree(pt.r, pt.c, 1, 1, cellSet))
        .map(pt => {
          const e = getCellEdges(pt.r, pt.c);
          const dist = Math.hypot(pt.r - avgR, pt.c - avgC);
          return { pt, score: -dist * 10 - (e.hasDoor ? 60 : 0) - getSwingPenalty(pt.r, pt.c) };
        })
        .sort((a, b) => b.score - a.score);
      return sorted[0] ? { ...sorted[0].pt, snap: 'center' } : null;
    };

    // 庭など壁制約のないスペース用汎用検索
    const findHorizontalPair = (cells, cellSet, preferTop = true) => {
      const sorted = [...cells].sort((a, b) => preferTop ? (a.r - b.r || a.c - b.c) : (b.r - a.r || a.c - b.c));
      for (const pt of sorted) {
        if (isFree(pt.r, pt.c, 2, 1, cellSet)) return pt;
      }
      return null;
    };
    const findSingleCell = (cells, cellSet, preferTop = true) => {
      const sorted = [...cells].sort((a, b) => preferTop ? (a.r - b.r || a.c - b.c) : (b.r - a.r || a.c - b.c));
      for (const pt of sorted) {
        if (isFree(pt.r, pt.c, 1, 1, cellSet)) return pt;
      }
      return null;
    };

    // 和室が複数ある場合（特に古き良き日本家屋）、役割をローテーション
    let washitsuIdx = 0;
    let westernRoomIdx = 0;
    const stageBadge = stageObj?.client?.typeBadge || '';
    const isWashitsuRoom = (r) => r.type === T.ROOM && (r.label === '和室' || r.pieceLibId === 'room-wa' || r.pieceLibId === 'room-wa2');
    const totalWashitsu = rooms.filter(isWashitsuRoom).length;
    const hasAnyWashitsu = totalWashitsu > 0;
    const isFortress = comboNames.has('要塞化');
    const isGlassHouse = comboNames.has('ガラス張りハウス');
    const hasTanoji = comboNames.has('古き良き日本家屋');
    const hasWaterGate = comboNames.has('水門');
    const hasInfinityLoop = comboNames.has('無限回廊');
    const sunnyRoomKeys = new Set();
    const hiddenRoomKeys = new Set();
    const badSpots = [];

    // 隠し部屋／秘密のトイレ・日当たり良好・バッドコンボ箇所検出
    const roomByCoord = new Map();
    for (const rm of rooms) {
      for (const pt of rm.cells) roomByCoord.set(`${pt.r},${pt.c}`, rm);
    }
    const fnEdge = typeof edgeType === 'function' ? edgeType : null;
    for (const rm of rooms) {
      if (rm.reachable && (rm.type === T.ROOM || rm.type === T.TOILET)) {
        let sawCloset = false;
        let sawOther = false;
        for (const pt of rm.cells) {
          for (const { dr, dc } of DIRS) {
            const nr = pt.r + dr, nc = pt.c + dc;
            if (nr < 0 || nr >= gSize || nc < 0 || nc >= gSize) continue;
            const nbCell = targetGrid[nr]?.[nc];
            if (!nbCell || nbCell.type === T.EMPTY || nbCell.type === T.GARDEN || nbCell.type === T.OBSTACLE) continue;
            const nbRm = roomByCoord.get(`${nr},${nc}`);
            if (nbRm && nbRm.key === rm.key) continue;
            const et = safeEdgeType(targetGrid, pt.r, pt.c, nr, nc, fnEdge);
            if (et === E.NONE || et === E.DOOR) {
              if (nbCell.type === T.CLOSET) sawCloset = true;
              else sawOther = true;
            }
          }
        }
        if (sawCloset && !sawOther) hiddenRoomKeys.add(rm.key);
      }
      if (comboNames.has('日当たり良好') && rm.type === T.LDK) {
        for (const pt of rm.cells) {
          const e = getCellEdges(pt.r, pt.c);
          if (e.bottom === E.WINDOW) {
            sunnyRoomKeys.add(rm.key);
            break;
          }
        }
      }
    }

    // 食欲減退／玄関直風呂の視覚スポット記録
    for (let r = 0; r < gSize; r++) {
      for (let c = 0; c < gSize; c++) {
        const cur = targetGrid[r]?.[c];
        if (!cur) continue;
        for (const { dr, dc } of [{ dr: 0, dc: 1 }, { dr: 1, dc: 0 }]) {
          const nr = r + dr, nc = c + dc;
          if (nr >= gSize || nc >= gSize) continue;
          const nb = targetGrid[nr]?.[nc];
          if (!nb) continue;
          const et = safeEdgeType(targetGrid, r, c, nr, nc, fnEdge);
          if (et !== E.NONE && et !== E.DOOR) continue;
          if ((cur.type === T.LDK && nb.type === T.TOILET) || (cur.type === T.TOILET && nb.type === T.LDK)) {
            badSpots.push({ kind: 'odor', r: (r + nr) / 2, c: (c + nc) / 2 });
          }
          if (cur.type === T.ENTRANCE && nb.type === T.BATH) {
            badSpots.push({ kind: 'puddle', r, c });
          } else if (cur.type === T.BATH && nb.type === T.ENTRANCE) {
            badSpots.push({ kind: 'puddle', r: nr, c: nc });
          }
        }
      }
    }
    if (comboNames.has('スケルトンバス')) {
      const entC = (stageObj?.entranceCells && stageObj.entranceCells[0]) || null;
      let firstBath = null;
      for (const rm of rooms) {
        if (rm.type === T.BATH && rm.cells[0]) { firstBath = rm.cells[0]; break; }
      }
      if (entC && firstBath) {
        badSpots.push({ kind: 'sight', r1: entC.r, c1: entC.c, r2: firstBath.r, c2: firstBath.c });
      }
    }

    for (const rm of rooms) {
      const cellSet = new Set(rm.cells.map(x => `${x.r},${x.c}`));
      const count = rm.cells.length;
      const isSealedDark = (!rm.reachable && !rm.hasWindow && rm.type !== T.ENTRANCE && rm.type !== T.CORRIDOR);
      const isHiddenAccess = hiddenRoomKeys.has(rm.key);
      if (isSealedDark || isFortress) {
        darkRooms.add(rm.key);
      }

      // 封印されし闇は特別家具（棺桶＋ロウソク）を優先配置！
      if (isSealedDark && (rm.type === T.ROOM || rm.type === T.LDK || rm.type === T.CLOSET || rm.type === T.TOILET || rm.type === T.BATH)) {
        const pCenter = findCenterSingle(rm.cells, cellSet);
        if (pCenter) addItem('furn_coffin', pCenter.r, pCenter.c, 1, 1, rm.key, { snap: 'center' });
        const pCandle = findWallSingle(rm.cells, cellSet, true, { requireWall: false });
        if (pCandle) addItem('furn_candle', pCandle.r, pCandle.c, 1, 1, rm.key, { candle: true, snap: pCandle.snap });
        continue;
      }

      // 1) 玄関：入って正面ではなく、外向きと直交する横壁(左右or上下)にスリム下駄箱を密着させる
      if (rm.type === T.ENTRANCE) {
        const preferSide = (facingDir === 'bottom' || facingDir === 'top');
        const pBox = findWallSingle(rm.cells, cellSet, facingDir !== 'top', { preferSide, requireWall: true });
        if (pBox) {
          const e = getCellEdges(pBox.r, pBox.c);
          let chosenSnap = pBox.snap;
          if ((facingDir === 'bottom' && chosenSnap === 'south') ||
              (facingDir === 'top' && chosenSnap === 'north') ||
              (facingDir === 'left' && chosenSnap === 'west') ||
              (facingDir === 'right' && chosenSnap === 'east')) {
            if (e.wLeft && facingDir !== 'left') chosenSnap = 'west';
            else if (e.wRight && facingDir !== 'right') chosenSnap = 'east';
            else if (e.wTop && facingDir !== 'top') chosenSnap = 'north';
            else if (e.wBottom && facingDir !== 'bottom') chosenSnap = 'south';
            else chosenSnap = null;
          }
          if (chosenSnap) {
            addItem('furn_shoesbox_slim', pBox.r, pBox.c, 1, 1, rm.key, { snap: chosenSnap });
          }
        }
        if (hasWaterGate) {
          const bMat = findSingleCell(rm.cells, cellSet, false);
          if (bMat) addItem('furn_bathmat', bMat.r, bMat.c, 1, 1, rm.key, { snap: 'center' });
        }
        continue;
      }

      // 2) 廊下（大ホワイエ / 無限回廊ランプ / 壁沿い隅植物）
      if (rm.type === T.CORRIDOR) {
        if (hasInfinityLoop && count >= 4) {
          const l1 = findWallSingle(rm.cells, cellSet, true, { requireWall: false });
          if (l1) addItem('furn_infinity_lamp', l1.r, l1.c, 1, 1, rm.key, { snap: l1.snap, candle: true });
          if (count >= 8) {
            const l2 = findWallSingle(rm.cells, cellSet, false, { requireWall: false });
            if (l2) addItem('furn_infinity_lamp', l2.r, l2.c, 1, 1, rm.key, { snap: l2.snap, candle: true });
          }
        } else if (comboNames.has('大ホワイエ') && count >= 6) {
          const corner = findWallSingle(rm.cells, cellSet, true);
          if (corner) addItem('furn_plant', corner.r, corner.c, 1, 1, rm.key, { snap: corner.snap });
        }
        continue;
      }

      // 3) ユニットバス (UB)
      if (rm.type === T.BATH && (rm.pieceLibId === 'unit-bath' || rm.label === 'UB')) {
        const pair = findWallPair(rm.cells, cellSet, true);
        if (pair) {
          addItem('furn_ub', pair.r, pair.c, 2, 1, rm.key, { snap: pair.snap });
        } else {
          const p1 = findWallSingle(rm.cells, cellSet, true);
          if (p1) addItem('furn_ub', p1.r, p1.c, 1, 1, rm.key, { snap: p1.snap });
        }
        continue;
      }

      // 4) 浴室（通常 / セレブ浴室 / もはや銭湯：富士山は立ち上がり北壁に貼り、浴槽は壁画を避けて下段側へ）
      if (rm.type === T.BATH) {
        const placeShowerIfOpen = () => {
          const showerCands = rm.cells
            .filter(pt => {
              if (usedCells.has(`${pt.r},${pt.c}`)) return false;
              if (northWallDecoCells.has(`${pt.r},${pt.c}`)) return false;
              return getCellEdges(pt.r, pt.c).hasSolidTop;
            })
            .sort((a, b) => {
              const da = countCellDoors(a.r, a.c), db = countCellDoors(b.r, b.c);
              return da - db || a.r - b.r || a.c - b.c;
            });
          if (showerCands[0]) {
            registerWallDeco('shower', showerCands[0].r, showerCands[0].c, 1);
          }
          return showerCands[0] || null;
        };

        const placeStoolIfSafe = (preferredCell = null) => {
          const cands = rm.cells
            .filter(pt => isFree(pt.r, pt.c, 1, 1, cellSet))
            .map(pt => {
              const e = getCellEdges(pt.r, pt.c);
              const dc = countCellDoors(pt.r, pt.c);
              const sw = getSwingPenalty(pt.r, pt.c);
              let sc = 100 - dc * 120 - sw;
              if (e.top === E.DOOR) sc -= 80;
              if (preferredCell && pt.r === preferredCell.r && pt.c === preferredCell.c) sc += 45;
              if (e.wLeft || e.wRight || e.wBottom) sc += 15;
              return { pt, dc, sw, e, sc };
            })
            .filter(x => x.dc === 0 || (x.dc === 1 && x.sw === 0 && x.e.top !== E.DOOR && count >= 4))
            .sort((a, b) => b.sc - a.sc || a.pt.r - b.pt.r || a.pt.c - b.pt.c);
          if (cands[0]) {
            addItem('furn_bath_stool', cands[0].pt.r, cands[0].pt.c, 1, 1, rm.key, { snap: 'center' });
          }
        };

        if (count >= 8) {
          const fujiCands = rm.cells.filter(pt => {
            const e1 = getCellEdges(pt.r, pt.c);
            const e2 = getCellEdges(pt.r, pt.c + 1);
            return cellSet.has(`${pt.r},${pt.c + 1}`) && e1.wTop && e2.wTop;
          }).sort((a, b) => {
            const sa = (getCellEdges(a.r, a.c).hasSolidTop && getCellEdges(a.r, a.c + 1).hasSolidTop) ? 1 : 0;
            const sb = (getCellEdges(b.r, b.c).hasSolidTop && getCellEdges(b.r, b.c + 1).hasSolidTop) ? 1 : 0;
            const midC = (rm.minC + rm.maxC) / 2;
            return sb - sa || a.r - b.r || (Math.abs(a.c + 0.5 - midC) - Math.abs(b.c + 0.5 - midC));
          });
          const fujiWallCell = fujiCands[0] || null;
          if (fujiWallCell) {
            registerWallDeco('fuji', fujiWallCell.r, fujiWallCell.c, 2);
          } else {
            const fujiPt = findWallPair(rm.cells, cellSet, true);
            if (fujiPt) addItem('furn_fuji', fujiPt.r, fujiPt.c, 2, 1, rm.key, { snap: 'north' });
          }

          const lowerCells = fujiWallCell ? rm.cells.filter(pt => pt.r > fujiWallCell.r) : rm.cells;
          const lowerSet = new Set(lowerCells.map(pt => `${pt.r},${pt.c}`));
          let placedSentoTub = false;
          const lowerPair = findWallPair(lowerCells, lowerSet, false);
          if (lowerPair) {
            addItem('furn_sento_tub', lowerPair.r, lowerPair.c, 2, 1, rm.key, { steam: true, snap: lowerPair.snap });
            placedSentoTub = true;
          } else {
            const midPairCells = (lowerCells.length >= 2 ? lowerCells : rm.cells);
            const tpC = midPairCells.find(pt => isFree(pt.r, pt.c, 2, 1, cellSet));
            if (tpC) {
              addItem('furn_sento_tub', tpC.r, tpC.c, 2, 1, rm.key, { steam: true, snap: 'center' });
              placedSentoTub = true;
            }
          }
          if (!placedSentoTub) {
            const tp = findWallPair(rm.cells, cellSet, false);
            if (tp) addItem('furn_sento_tub', tp.r, tp.c, 2, 1, rm.key, { steam: true, snap: tp.snap });
          }

          const shPt = placeShowerIfOpen();
          placeStoolIfSafe(shPt);
          for (let k = 0; k < 2; k++) {
            const kPt = findWallSingle(rm.cells, cellSet, false);
            if (kPt) addItem('furn_kerorin', kPt.r, kPt.c, 1, 1, rm.key, { snap: kPt.snap });
          }
        } else if (count >= 4) {
          const tubPt = findWallPair(rm.cells, cellSet, true);
          if (tubPt) addItem('furn_sento_tub', tubPt.r, tubPt.c, 2, 1, rm.key, { steam: true, snap: tubPt.snap });
          else {
            const p1 = findWallSingle(rm.cells, cellSet, true);
            if (p1) addItem('furn_bath_tub', p1.r, p1.c, 1, 1, rm.key, { steam: true, snap: p1.snap });
          }
          const shPt = placeShowerIfOpen();
          placeStoolIfSafe(shPt);
        } else {
          const p1 = findWallSingle(rm.cells, cellSet, true);
          if (p1) addItem('furn_bath_tub', p1.r, p1.c, 1, 1, rm.key, { steam: true, snap: p1.snap });
          if (count >= 2) {
            const shPt = placeShowerIfOpen();
            placeStoolIfSafe(shPt);
          }
        }
        continue;
      }

      // 5) トイレ（通常 / 秘密のトイレ / バカデカトイレ両採用）
      if (rm.type === T.TOILET) {
        if (isHiddenAccess) {
          const scrollPt = rm.cells.find(pt => getCellEdges(pt.r, pt.c).hasSolidTop);
          if (scrollPt) registerWallDeco('scroll_ninja', scrollPt.r, scrollPt.c, 1);
        }
        if (count >= 4) {
          const midPt = findCenterSingle(rm.cells, cellSet);
          const isLivablyLuxury = (count >= 6) || ((rm.roomId || 0) % 2 === 1);
          if (midPt) addItem('furn_toilet', midPt.r, midPt.c, 1, 1, rm.key, { snap: 'center' });

          if (isLivablyLuxury) {
            const sofaPt = findWallPair(rm.cells, cellSet, false);
            if (sofaPt) addItem('furn_sofa', sofaPt.r, sofaPt.c, 2, 1, rm.key, { snap: sofaPt.snap });
            const tvPt = findWallSingle(rm.cells, cellSet, true);
            if (tvPt) addItem('furn_tv', tvPt.r, tvPt.c, 1, 1, rm.key, { snap: tvPt.snap });
            const basinPt = findWallSingle(rm.cells, cellSet, true);
            if (basinPt) addItem('furn_washbasin', basinPt.r, basinPt.c, 1, 1, rm.key, { snap: basinPt.snap });
            const plantPt = findWallSingle(rm.cells, cellSet, false);
            if (plantPt) addItem('furn_plant', plantPt.r, plantPt.c, 1, 1, rm.key, { snap: plantPt.snap });
          }
        } else {
          const p1 = findWallSingle(rm.cells, cellSet, true);
          if (p1) addItem('furn_toilet', p1.r, p1.c, 1, 1, rm.key, { snap: p1.snap });
          if (count >= 3) {
            const p2 = findWallSingle(rm.cells, cellSet, false);
            if (p2) addItem('furn_washbasin', p2.r, p2.c, 1, 1, rm.key, { snap: p2.snap });
          }
          if (isHiddenAccess && count >= 2) {
            const sg = findWallSingle(rm.cells, cellSet, false);
            if (sg) addItem('furn_safe_box', sg.r, sg.c, 1, 1, rm.key, { snap: sg.snap });
          }
        }
        continue;
      }

      // 6) 洗面所（壁寄せ・扉塞ぎ洗濯機の抑止）
      if (rm.type === T.WASHROOM) {
        const p1 = findWallSingle(rm.cells, cellSet, true);
        if (p1) addItem('furn_washbasin', p1.r, p1.c, 1, 1, rm.key, { snap: p1.snap });
        if (count >= 2) {
          const freeCells = rm.cells.filter(pt => {
            if (!isFree(pt.r, pt.c, 1, 1, cellSet)) return false;
            const e = getCellEdges(pt.r, pt.c);
            if (!(e.wTop || e.wLeft || e.wRight || e.wBottom)) return false;
            const dc = countCellDoors(pt.r, pt.c);
            if (e.top === E.DOOR || getSwingPenalty(pt.r, pt.c) > 0) return false;
            return count === 2 ? dc === 0 : dc <= 1;
          });
          const picked = freeCells.length > 0 ? findWallSingle(freeCells, cellSet, false) : null;
          if (picked) addItem('furn_washer', picked.r, picked.c, 1, 1, rm.key, { snap: picked.snap });
        }
        continue;
      }

      // 7) 収納（通常 / 倉庫付き / 収納が本体: 台車・木箱・金庫も並べて完全倉庫化）
      if (rm.type === T.CLOSET) {
        if (count >= 8) {
          const targetCount = Math.ceil(count * 0.60);
          for (let i = 0; i < targetCount; i++) {
            const pt = findWallSingle(rm.cells, cellSet, i % 2 === 0, { requireWall: false });
            if (!pt) break;
            const ids = ['furn_rack_steel', 'furn_warehouse_crate', 'furn_closet_rack', 'furn_safe_box'];
            addItem(ids[i % ids.length], pt.r, pt.c, 1, 1, rm.key, { snap: pt.snap });
          }
        } else if (count >= 4) {
          const p1 = findWallSingle(rm.cells, cellSet, true);
          if (p1) addItem('furn_rack_steel', p1.r, p1.c, 1, 1, rm.key, { snap: p1.snap });
          const p2 = findWallSingle(rm.cells, cellSet, false);
          if (p2) addItem('furn_warehouse_crate', p2.r, p2.c, 1, 1, rm.key, { snap: p2.snap });
          const p3 = findWallSingle(rm.cells, cellSet, true);
          if (p3) addItem('furn_closet_rack', p3.r, p3.c, 1, 1, rm.key, { snap: p3.snap });
        } else {
          const maxItems = Math.max(1, Math.min(2, Math.floor(count / 2) || 1));
          for (let i = 0; i < maxItems; i++) {
            const pt = findWallSingle(rm.cells, cellSet, i % 2 === 0);
            if (pt) addItem(i === 0 ? 'furn_closet_rack' : 'furn_rack_steel', pt.r, pt.c, 1, 1, rm.key, { snap: pt.snap });
          }
        }
        continue;
      }

      // 8) LDK (要塞化時は監視モニター＋備蓄も併設 / 広いLDKで対面アイランド＋中央ソファ対応)
      if (rm.type === T.LDK) {
        const rmW = rm.maxC - rm.minC + 1;
        const rmH = rm.maxR - rm.minR + 1;
        const isSpaciousLdk = (count >= 9) && (rmW >= 3) && (rmH >= 3);
        let placedIsland = false;
        let islandRow = -1;

        if (isSpaciousLdk) {
          const islandCandidates = [];
          for (const pt of rm.cells) {
            if (!isFree(pt.r, pt.c, 2, 1, cellSet)) continue;
            if (!cellSet.has(`${pt.r - 1},${pt.c}`) || !cellSet.has(`${pt.r + 1},${pt.c}`)) continue;
            if (!cellSet.has(`${pt.r - 1},${pt.c + 1}`) || !cellSet.has(`${pt.r + 1},${pt.c + 1}`)) continue;
            const e1 = getCellEdges(pt.r, pt.c);
            const e2 = getCellEdges(pt.r, pt.c + 1);
            if (e1.hasDoor || e2.hasDoor) continue;
            if (e1.top !== E.NONE || e2.top !== E.NONE || e1.bottom !== E.NONE || e2.bottom !== E.NONE) continue;
            if (getSwingPenalty(pt.r, pt.c) > 0 || getSwingPenalty(pt.r, pt.c + 1) > 0) continue;
            let score = (pt.r === rm.minR + 1) ? 120 : 80;
            if (e1.wLeft || e2.wRight) score += 15;
            score -= Math.abs(pt.c + 0.5 - (rm.minC + rm.maxC) * 0.5) * 6;
            islandCandidates.push({ pt, score });
          }
          islandCandidates.sort((a, b) => b.score - a.score || (a.pt.r - b.pt.r) || (a.pt.c - b.pt.c));
          const isl = islandCandidates[0]?.pt || null;
          if (isl) {
            addItem('furn_island_kitchen', isl.r, isl.c, 2, 1, rm.key, { snap: 'center', floating: true });
            placedIsland = true;
            islandRow = isl.r;
          }
        }

        if (!placedIsland) {
          const kitchenH = findWallPair(rm.cells, cellSet, true);
          if (kitchenH) {
            addItem('furn_kitchen', kitchenH.r, kitchenH.c, 2, 1, rm.key, { snap: kitchenH.snap });
          } else {
            const kitchenV = findWallVerticalPair(rm.cells, cellSet);
            if (kitchenV) {
              addItem(`furn_kitchen_v_${kitchenV.snap}`, kitchenV.r, kitchenV.c, 1, 2, rm.key, { snap: kitchenV.snap });
            } else {
              const k1 = findWallSingle(rm.cells, cellSet, true);
              if (k1) addItem('furn_kitchen', k1.r, k1.c, 1, 1, rm.key, { snap: k1.snap });
            }
          }
        }

        if (isFortress) {
          const supPt = findWallSingle(rm.cells, cellSet, false);
          if (supPt) addItem('furn_supplies', supPt.r, supPt.c, 1, 1, rm.key, { snap: supPt.snap });
        }
        const ldkSeed = getRoomThemeSeed(rm.cells, 0, stageObj);
        const isCafeLdk = !isFortress && (stageBadge.includes('陽だまり') || stageBadge.includes('おしゃれ') || stageBadge.includes('DINKS') || (ldkSeed % 3 === 0));
        const pickLdkTableAsset = (pt, wantCafe, seedOffset = 0) => {
          const e = getCellEdges(pt.r, pt.c);
          const lrBlocked = (e.wLeft || e.left === E.DOOR ? 1 : 0) + (e.wRight || e.right === E.DOOR ? 1 : 0);
          const tbBlocked = (e.wTop || e.top === E.DOOR ? 1 : 0) + (e.wBottom || e.bottom === E.DOOR ? 1 : 0);
          let useLR;
          if (lrBlocked !== tbBlocked) {
            useLR = (lrBlocked < tbBlocked);
          } else if (rmW !== rmH) {
            useLR = (rmW > rmH);
          } else {
            useLR = (((ldkSeed + pt.r * 3 + pt.c * 5 + seedOffset) % 2) === 0);
          }
          if (wantCafe) return useLR ? 'furn_cafe_table' : 'furn_cafe_table_tb';
          return useLR ? 'furn_dining_lr' : 'furn_dining';
        };
        if (count >= 3 && count < 6) {
          const dPt = findCenterSingle(rm.cells, cellSet);
          if (dPt) addItem(pickLdkTableAsset(dPt, isCafeLdk, 0), dPt.r, dPt.c, 1, 1, rm.key, { snap: 'center' });
        }
        if (count >= 6) {
          const backWallCells = placedIsland ? rm.cells.filter(pt => pt.r === islandRow - 1) : [];
          const fPt = (backWallCells.length > 0 && findWallSingle(backWallCells, cellSet, true))
            || findWallSingle(rm.cells, cellSet, true);
          if (fPt) addItem('furn_fridge', fPt.r, fPt.c, 1, 1, rm.key, { snap: fPt.snap });

          let placedFloatingLiving = false;
          if (count >= 8 && rmW >= 3 && rmH >= 3 && !isFortress) {
            const livingPairs = [];
            for (const tvPt of rm.cells) {
              if (!isFree(tvPt.r, tvPt.c, 1, 1, cellSet)) continue;
              const te = getCellEdges(tvPt.r, tvPt.c);
              if (te.hasDoor || getSwingPenalty(tvPt.r, tvPt.c) > 0) continue;

              // 北壁にTV → 1マス南に北向きソファ＋ラグ
              if (te.wTop) {
                for (const scStart of [tvPt.c, tvPt.c - 1]) {
                  const sr = tvPt.r + 1;
                  if (sr > rm.maxR || !isFree(sr, scStart, 2, 1, cellSet)) continue;
                  const se1 = getCellEdges(sr, scStart), se2 = getCellEdges(sr, scStart + 1);
                  if (se1.hasDoor || se2.hasDoor || getSwingPenalty(sr, scStart) > 0 || getSwingPenalty(sr, scStart + 1) > 0) continue;
                  let sc = te.hasSolidTop ? 120 : 90;
                  if (placedIsland && sr === islandRow) sc -= 40;
                  if (se1.wBottom || se2.wBottom) sc -= 20;
                  livingPairs.push({ tvPt, tvSnap: 'north', sr, scCol: scStart, sofaAsset: 'furn_sofa_south', score: sc });
                }
              }
              // 南壁にTV → 1マス北に南向きソファ＋ラグ
              if (te.wBottom) {
                for (const scStart of [tvPt.c, tvPt.c - 1]) {
                  const sr = tvPt.r - 1;
                  if (sr < rm.minR || !isFree(sr, scStart, 2, 1, cellSet)) continue;
                  const se1 = getCellEdges(sr, scStart), se2 = getCellEdges(sr, scStart + 1);
                  if (se1.hasDoor || se2.hasDoor || getSwingPenalty(sr, scStart) > 0 || getSwingPenalty(sr, scStart + 1) > 0) continue;
                  let sc = te.hasSolidBottom ? 115 : 85;
                  if (placedIsland && sr === islandRow) sc -= 40;
                  if (se1.wTop || se2.wTop) sc -= 20;
                  livingPairs.push({ tvPt, tvSnap: 'south', sr, scCol: scStart, sofaAsset: 'furn_sofa', score: sc });
                }
              }
            }
            livingPairs.sort((a, b) => b.score - a.score);
            const best = livingPairs[0];
            if (best) {
              addItem('furn_tv', best.tvPt.r, best.tvPt.c, 1, 1, rm.key, { snap: best.tvSnap });
              items.push({
                assetId: 'furn_living_rug',
                r: best.sr, c: best.scCol, wCells: 2, hCells: 1,
                roomKey: rm.key, delayMs: 0, snap: 'center', floating: true, isFloorRug: true
              });
              addItem(best.sofaAsset, best.sr, best.scCol, 2, 1, rm.key, { snap: 'center', floating: true });
              placedFloatingLiving = true;
            }
          }

          if (!placedFloatingLiving) {
            const sH = findWallPair(rm.cells, cellSet, false);
            if (sH) {
              addItem('furn_sofa', sH.r, sH.c, 2, 1, rm.key, { snap: sH.snap });
              if (isCafeLdk) {
                const cafePt = findCenterSingle(rm.cells, cellSet);
                if (cafePt) addItem(pickLdkTableAsset(cafePt, true, 1), cafePt.r, cafePt.c, 1, 1, rm.key, { snap: 'center' });
              }
            } else {
              const sV = findWallVerticalPair(rm.cells, cellSet);
              if (sV) {
                addItem(`furn_sofa_v_${sV.snap}`, sV.r, sV.c, 1, 2, rm.key, { snap: sV.snap });
              } else {
                const dPt = findCenterSingle(rm.cells, cellSet);
                if (dPt) addItem(pickLdkTableAsset(dPt, isCafeLdk, 2), dPt.r, dPt.c, 1, 1, rm.key, { snap: 'center' });
              }
            }
            if (count >= 8) {
              const tPt = findWallSingle(rm.cells, cellSet, true);
              if (tPt) addItem(isFortress ? 'furn_fortress_console' : 'furn_tv', tPt.r, tPt.c, 1, 1, rm.key, { snap: tPt.snap });
              if (isCafeLdk) {
                const plPt = findWallSingle(rm.cells, cellSet, false, { requireWall: false });
                if (plPt) addItem('furn_plant', plPt.r, plPt.c, 1, 1, rm.key, { snap: plPt.snap });
              }
            }
          } else if (count >= 9) {
            const dPt = findCenterSingle(rm.cells, cellSet);
            if (dPt) addItem(pickLdkTableAsset(dPt, isCafeLdk, 3), dPt.r, dPt.c, 1, 1, rm.key, { snap: 'center' });
          }
        }
        continue;
      }

      // 9) 和室（0客間 / 1寝間 / 2こたつ間 / 3茶室※田の字限定）
      if (rm.type === T.ROOM && (rm.label === '和室' || rm.pieceLibId === 'room-wa' || rm.pieceLibId === 'room-wa2')) {
        const wSeed = getRoomThemeSeed(rm.cells, washitsuIdx, stageObj);
        const mode = hasTanoji ? (washitsuIdx % 4) : ((wSeed + washitsuIdx) % 3);
        washitsuIdx++;
        const kakePt = rm.cells.find(pt => {
          const e = getCellEdges(pt.r, pt.c);
          return e.wTop && e.top !== E.WINDOW;
        });
        if (kakePt) {
          registerWallDeco(isHiddenAccess ? 'scroll_ninja' : 'kakejiku', kakePt.r, kakePt.c, 1);
        }
        if (isHiddenAccess) {
          const ng = findCenterSingle(rm.cells, cellSet);
          if (ng) addItem('furn_ninja_gear', ng.r, ng.c, 1, 1, rm.key, { snap: 'center' });
          const sb = findWallSingle(rm.cells, cellSet, false);
          if (sb) addItem('furn_safe_box', sb.r, sb.c, 1, 1, rm.key, { snap: sb.snap });
          continue;
        }
        const rmW = rm.maxC - rm.minC + 1;
        const rmH = rm.maxR - rm.minR + 1;
        const midR1 = Math.floor((rm.minR + rm.maxR) / 2);
        const midR2 = Math.ceil((rm.minR + rm.maxR) / 2);
        const midC1 = Math.floor((rm.minC + rm.maxC) / 2);
        const midC2 = Math.ceil((rm.minC + rm.maxC) / 2);
        const coreCovered = (rmW >= 2 && rmH >= 2)
          && cellSet.has(`${midR1},${midC1}`)
          && cellSet.has(`${midR1},${midC2}`)
          && cellSet.has(`${midR2},${midC1}`)
          && cellSet.has(`${midR2},${midC2}`);
        const centerBounds = { minR: rm.minR, maxR: rm.maxR, minC: rm.minC, maxC: rm.maxC };
        const pickSideOrNorthWall = (cellsForPick) => {
          const nonDecoCells = cellsForPick.filter(pt => !northWallDecoCells.has(`${pt.r},${pt.c}`));
          if (nonDecoCells.length === 0) return null;
          const cand = findWallSingle(nonDecoCells, cellSet, true, { preferSide: true });
          if (!cand) return null;
          if (cand.snap === 'west' || cand.snap === 'east' || (cand.snap === 'north' && !northWallDecoCells.has(`${cand.r},${cand.c}`))) {
            return cand;
          }
          return null;
        };
        const pickWashitsuCenterHoriz = (ptOrNull, extraSeed = 0) => {
          if (rmW !== rmH) return rmW > rmH;
          if (ptOrNull) {
            const e = getCellEdges(ptOrNull.r, ptOrNull.c);
            const lrBlocked = (e.wLeft || e.left === E.DOOR ? 1 : 0) + (e.wRight || e.right === E.DOOR ? 1 : 0);
            const tbBlocked = (e.wTop || e.top === E.DOOR ? 1 : 0) + (e.wBottom || e.bottom === E.DOOR ? 1 : 0);
            if (lrBlocked !== tbBlocked) return lrBlocked < tbBlocked;
          }
          return (((wSeed + washitsuIdx + extraSeed) % 2) === 0);
        };
        const pickSingleFutonAsset = (pt, idx = 0) => {
          const e = getCellEdges(pt.r, pt.c);
          const opts = [
            { id: 'furn_futon', sc: (e.wTop ? 30 : 0) - (e.top === E.DOOR ? 50 : 0) + (rmH >= rmW ? 8 : 0) },
            { id: 'furn_futon_west', sc: (e.wLeft ? 30 : 0) - (e.left === E.DOOR ? 50 : 0) + (rmW > rmH ? 8 : 0) },
            { id: 'furn_futon_east', sc: (e.wRight ? 30 : 0) - (e.right === E.DOOR ? 50 : 0) + (rmW > rmH ? 8 : 0) }
          ];
          if (e.wBottom && e.top === E.DOOR) {
            opts.push({ id: 'furn_futon_south', sc: 32 });
          }
          const maxSc = Math.max(...opts.map(o => o.sc));
          const best = opts.filter(o => o.sc >= maxSc - 8);
          return best[(wSeed + washitsuIdx + idx) % best.length].id;
        };

        if (mode === 1) {
          const pairCands = rm.cells
            .filter(pt => isFree(pt.r, pt.c, 2, 1, cellSet))
            .map(pt => {
              const e1 = getCellEdges(pt.r, pt.c);
              const e2 = getCellEdges(pt.r, pt.c + 1);
              let sc = 120;
              if (northWallDecoCells.has(`${pt.r},${pt.c}`) || northWallDecoCells.has(`${pt.r},${pt.c + 1}`)) sc -= 90;
              if (e1.hasDoor || e2.hasDoor) sc -= 80;
              sc -= getSwingPenalty(pt.r, pt.c) + getSwingPenalty(pt.r, pt.c + 1);
              if (pt.r === rm.maxR) sc += 25;
              return { pt, sc };
            })
            .sort((a, b) => b.sc - a.sc || b.pt.r - a.pt.r || a.pt.c - b.pt.c);
          const vPairs = rm.cells
            .filter(pt => isFree(pt.r, pt.c, 1, 2, cellSet))
            .map(pt => {
              const e1 = getCellEdges(pt.r, pt.c);
              const e2 = getCellEdges(pt.r + 1, pt.c);
              let sc = 120;
              if (northWallDecoCells.has(`${pt.r},${pt.c}`)) sc -= 50;
              if (e1.hasDoor || e2.hasDoor) sc -= 80;
              sc -= getSwingPenalty(pt.r, pt.c) + getSwingPenalty(pt.r + 1, pt.c);
              const leftWall = (e1.wLeft ? 1 : 0) + (e2.wLeft ? 1 : 0);
              const rightWall = (e1.wRight ? 1 : 0) + (e2.wRight ? 1 : 0);
              const leftDoor = (e1.left === E.DOOR ? 1 : 0) + (e2.left === E.DOOR ? 1 : 0);
              const rightDoor = (e1.right === E.DOOR ? 1 : 0) + (e2.right === E.DOOR ? 1 : 0);
              if (leftWall === 2 || rightWall === 2) sc += 20;
              const leftSc = leftWall * 2 - leftDoor * 3;
              const rightSc = rightWall * 2 - rightDoor * 3;
              let futonId;
              if (leftSc > rightSc) futonId = 'furn_futon_west';
              else if (rightSc > leftSc) futonId = 'furn_futon_east';
              else futonId = (((wSeed + pt.r + pt.c) % 2) === 0) ? 'furn_futon_west' : 'furn_futon_east';
              return { pt, sc, futonId };
            })
            .sort((a, b) => b.sc - a.sc || a.pt.r - b.pt.r || a.pt.c - b.pt.c);
          const bestH = pairCands[0] || null;
          const bestV = vPairs[0] || null;
          const wantHorizFuton = (rmH > rmW) ? true : (rmW > rmH ? false : (((wSeed + washitsuIdx) % 2) === 1));
          let useV = false;
          if (bestV && !bestH) useV = true;
          else if (bestV && bestH) {
            useV = (wantHorizFuton && bestV.sc >= bestH.sc - 60) || (!wantHorizFuton && bestV.sc >= bestH.sc + 80);
          }
          if (useV) {
            const p = bestV.pt;
            addItem(bestV.futonId, p.r, p.c, 1, 1, rm.key, { snap: 'center' });
            addItem(bestV.futonId, p.r + 1, p.c, 1, 1, rm.key, { snap: 'center' });
          } else if (bestH) {
            const p = bestH.pt;
            addItem('furn_futon', p.r, p.c, 1, 1, rm.key, { snap: 'center' });
            addItem('furn_futon', p.r, p.c + 1, 1, 1, rm.key, { snap: 'center' });
          } else {
            const f1 = findCenterSingle(rm.cells, cellSet);
            if (f1) addItem(pickSingleFutonAsset(f1, 0), f1.r, f1.c, 1, 1, rm.key, { snap: 'center' });
            if (count >= 3) {
              const f2 = findCenterSingle(rm.cells, cellSet);
              if (f2) addItem(pickSingleFutonAsset(f2, 1), f2.r, f2.c, 1, 1, rm.key, { snap: 'center' });
            }
          }
          if (count >= 4) {
            const wt = findWallSingle(rm.cells, cellSet, true);
            if (wt) addItem('furn_watansu', wt.r, wt.c, 1, 1, rm.key, { snap: wt.snap });
          }
          if (count >= 6) {
            const bs = findWallSingle(rm.cells, cellSet, false);
            if (bs) addItem('furn_bonsai', bs.r, bs.c, 1, 1, rm.key, { snap: bs.snap });
          }
        } else if (mode === 2) {
          const freeNorthForToko = rm.cells.find(pt =>
            isFree(pt.r, pt.c, 1, 1, cellSet) &&
            !northWallDecoCells.has(`${pt.r},${pt.c}`) &&
            getCellEdges(pt.r, pt.c).hasSolidTop
          );
          if (coreCovered) {
            items.push({
              assetId: pickWashitsuCenterHoriz(null, 2) ? 'furn_kotatsu' : 'furn_kotatsu_v',
              r: midR1, c: midC1, wCells: 1, hCells: 1,
              roomKey: rm.key, delayMs: 0, snap: 'center', centerInRoom: centerBounds
            });
            if (count <= 5) {
              if (freeNorthForToko && ((wSeed + mode) % 2 === 0 || hasTanoji)) {
                addItem('furn_tokonoma', freeNorthForToko.r, freeNorthForToko.c, 1, 1, rm.key, { snap: 'north' });
              } else {
                const wSide = pickSideOrNorthWall(rm.cells);
                if (wSide) addItem('furn_watansu', wSide.r, wSide.c, 1, 1, rm.key, { snap: wSide.snap });
              }
            } else {
              if (freeNorthForToko && (wSeed % 2 === 0)) {
                addItem('furn_tokonoma', freeNorthForToko.r, freeNorthForToko.c, 1, 1, rm.key, { snap: 'north' });
              }
              const wt = findWallSingle(rm.cells, cellSet, true);
              if (wt) addItem('furn_watansu', wt.r, wt.c, 1, 1, rm.key, { snap: wt.snap });
              const bs = findWallSingle(rm.cells, cellSet, false);
              if (bs) addItem('furn_bonsai', bs.r, bs.c, 1, 1, rm.key, { snap: bs.snap });
            }
          } else {
            const kt = findCenterSingle(rm.cells, cellSet);
            if (kt) addItem(pickWashitsuCenterHoriz(kt, 2) ? 'furn_kotatsu' : 'furn_kotatsu_v', kt.r, kt.c, 1, 1, rm.key, { snap: 'center' });
            if (count >= 4) {
              const wt = pickSideOrNorthWall(rm.cells);
              if (wt) addItem('furn_watansu', wt.r, wt.c, 1, 1, rm.key, { snap: wt.snap });
            }
          }
        } else if (mode === 3) {
          if (coreCovered) {
            rm.cells.forEach(pt => markUsed(pt.r, pt.c, 1, 1));
            items.push({
              assetId: pickWashitsuCenterHoriz(null, 3) ? 'furn_tea_set_center' : 'furn_tea_set_center_v',
              r: midR1, c: midC1, wCells: 1, hCells: 1,
              roomKey: rm.key, delayMs: 0, snap: 'center', steam: true, centerInRoom: centerBounds
            });
          } else {
            const ts = findCenterSingle(rm.cells, cellSet);
            if (ts) addItem('furn_tea_set', ts.r, ts.c, 1, 1, rm.key, { snap: 'center', steam: true });
          }
        } else {
          const freeNorthForToko = rm.cells.find(pt =>
            isFree(pt.r, pt.c, 1, 1, cellSet) &&
            !northWallDecoCells.has(`${pt.r},${pt.c}`) &&
            getCellEdges(pt.r, pt.c).hasSolidTop
          );
          if (coreCovered) {
            items.push({
              assetId: pickWashitsuCenterHoriz(null, 1) ? 'furn_chabudai_lr' : 'furn_chabudai',
              r: midR1, c: midC1, wCells: 1, hCells: 1,
              roomKey: rm.key, delayMs: 0, snap: 'center', centerInRoom: centerBounds
            });
            if (count <= 5) {
              if (freeNorthForToko && ((wSeed + mode) % 2 === 0 || hasTanoji)) {
                addItem('furn_tokonoma', freeNorthForToko.r, freeNorthForToko.c, 1, 1, rm.key, { snap: 'north' });
              } else {
                const wSide = pickSideOrNorthWall(rm.cells);
                if (wSide) addItem('furn_bonsai', wSide.r, wSide.c, 1, 1, rm.key, { snap: wSide.snap });
              }
            } else {
              if (freeNorthForToko && (wSeed % 2 === 0)) {
                addItem('furn_tokonoma', freeNorthForToko.r, freeNorthForToko.c, 1, 1, rm.key, { snap: 'north' });
              }
              const wt = findWallSingle(rm.cells, cellSet, true);
              if (wt) addItem('furn_watansu', wt.r, wt.c, 1, 1, rm.key, { snap: wt.snap });
              const bs = findWallSingle(rm.cells, cellSet, false);
              if (bs) addItem('furn_bonsai', bs.r, bs.c, 1, 1, rm.key, { snap: bs.snap });
            }
          } else {
            const ch = findCenterSingle(rm.cells, cellSet);
            if (ch) addItem(pickWashitsuCenterHoriz(ch, 1) ? 'furn_chabudai_lr' : 'furn_chabudai', ch.r, ch.c, 1, 1, rm.key, { snap: 'center' });
            if (count >= 4) {
              const bs = pickSideOrNorthWall(rm.cells);
              if (bs) addItem('furn_bonsai', bs.r, bs.c, 1, 1, rm.key, { snap: bs.snap });
            }
          }
        }
        continue;
      }

      // 10) 洋室 (隠し部屋 / 要塞化 / 通常テーマ別：bedroom / gaming / kids / study)
      if (rm.type === T.ROOM) {
        if (isHiddenAccess) {
          const wallPt = rm.cells.find(pt => getCellEdges(pt.r, pt.c).hasSolidTop);
          if (wallPt) registerWallDeco('scroll_ninja', wallPt.r, wallPt.c, 1);
          const ng = findWallSingle(rm.cells, cellSet, true, { requireWall: false });
          if (ng) addItem('furn_ninja_gear', ng.r, ng.c, 1, 1, rm.key, { snap: ng.snap });
          const sb = findWallSingle(rm.cells, cellSet, false, { requireWall: false });
          if (sb) addItem('furn_safe_box', sb.r, sb.c, 1, 1, rm.key, { snap: sb.snap });
          if (count >= 4) {
            const ft = findWallSingle(rm.cells, cellSet, true, { requireWall: false });
            if (ft) addItem('furn_futon', ft.r, ft.c, 1, 1, rm.key, { snap: ft.snap });
          }
          continue;
        }
        if (isFortress) {
          const fc = findWallSingle(rm.cells, cellSet, true, { requireWall: false });
          if (fc) addItem('furn_fortress_console', fc.r, fc.c, 1, 1, rm.key, { snap: fc.snap });
          if (count >= 2) {
            const bs = findWallSingle(rm.cells, cellSet, false, { requireWall: false });
            if (bs) addItem('furn_bed_s', bs.r, bs.c, 1, 1, rm.key, { snap: bs.snap });
          }
          if (count >= 4) {
            const sp = findWallSingle(rm.cells, cellSet, false, { requireWall: false });
            if (sp) addItem('furn_supplies', sp.r, sp.c, 1, 1, rm.key, { snap: sp.snap });
          }
          continue;
        }
        const rSeed = getRoomThemeSeed(rm.cells, westernRoomIdx, stageObj);
        let theme = 'bedroom';
        if (westernRoomIdx === 0) {
          if (stageBadge.includes('ワーカー')) theme = 'gaming';
          else if (stageBadge.includes('ミステリー')) theme = 'study';
          else theme = 'bedroom';
        } else if (westernRoomIdx === 1) {
          if (stageBadge.includes('ファミリー') || stageBadge.includes('大家族')) theme = 'kids';
          else if (stageBadge.includes('ワーカー') || stageBadge.includes('趣味')) theme = 'gaming';
          else if (stageBadge.includes('豪邸') || stageBadge.includes('VIP') || stageBadge.includes('シニア') || stageBadge.includes('ミステリー')) theme = 'study';
          else theme = ['gaming', 'study', 'kids'][rSeed % 3];
        } else {
          theme = ['kids', 'study', 'gaming', 'bedroom'][(rSeed + westernRoomIdx) % 4];
        }
        westernRoomIdx++;
        const deskDirMode = (rSeed + westernRoomIdx) % 4; // 0: north, 1: west, 2: east, 3: south
        const deskPreferNorth = (deskDirMode !== 3);
        const deskWallOpts = (requireWall) => ({
          requireWall,
          preferSide: (deskDirMode === 1 || deskDirMode === 2),
          preferEast: (deskDirMode === 2)
        });

        if (theme === 'gaming') {
          const gd = findWallSingle(rm.cells, cellSet, deskPreferNorth, deskWallOpts(false));
          if (gd) addItem('furn_gaming_desk', gd.r, gd.c, 1, 1, rm.key, { snap: gd.snap });
          if (count >= 3) {
            const bs = findWallSingle(rm.cells, cellSet, true, { requireWall: false });
            if (bs) addItem('furn_bed_s', bs.r, bs.c, 1, 1, rm.key, { snap: bs.snap });
          }
          if (count >= 5) {
            const ex = findWallSingle(rm.cells, cellSet, false, { requireWall: false });
            if (ex) addItem(rSeed % 2 === 0 ? 'furn_bookshelf' : 'furn_plant', ex.r, ex.c, 1, 1, rm.key, { snap: ex.snap });
          }
        } else if (theme === 'kids') {
          const kb = findWallSingle(rm.cells, cellSet, true, { requireWall: false });
          if (kb) addItem('furn_kids_bed', kb.r, kb.c, 1, 1, rm.key, { snap: kb.snap });
          if (count >= 2) {
            const tb = findCenterSingle(rm.cells, cellSet) || findWallSingle(rm.cells, cellSet, false, { requireWall: false });
            if (tb) addItem('furn_toy_box', tb.r, tb.c, 1, 1, rm.key, { snap: tb.snap });
          }
          if (count >= 4) {
            const dk = findWallSingle(rm.cells, cellSet, deskPreferNorth, deskWallOpts(false));
            if (dk) addItem('furn_desk', dk.r, dk.c, 1, 1, rm.key, { snap: dk.snap });
          }
          if (count >= 6) {
            const bk = findWallSingle(rm.cells, cellSet, false, { requireWall: false });
            if (bk) addItem('furn_bookshelf', bk.r, bk.c, 1, 1, rm.key, { snap: bk.snap });
          }
        } else if (theme === 'study') {
          const bd = findWallSingle(rm.cells, cellSet, deskPreferNorth, deskWallOpts(false));
          if (bd) addItem('furn_book_desk', bd.r, bd.c, 1, 1, rm.key, { snap: bd.snap });
          if (count >= 2) {
            const bk = findWallSingle(rm.cells, cellSet, true, { requireWall: false });
            if (bk) addItem('furn_bookshelf', bk.r, bk.c, 1, 1, rm.key, { snap: bk.snap });
          }
          if (count >= 4) {
            const bs = findWallSingle(rm.cells, cellSet, false, { requireWall: false });
            if (bs) addItem('furn_bed_s', bs.r, bs.c, 1, 1, rm.key, { snap: bs.snap });
          }
          if (count >= 6) {
            const pl = findWallSingle(rm.cells, cellSet, false, { requireWall: false });
            if (pl) addItem('furn_plant', pl.r, pl.c, 1, 1, rm.key, { snap: pl.snap });
          }
        } else if (count >= 6) {
          const bw = findWallPair(rm.cells, cellSet, true);
          if (bw) {
            addItem('furn_bed_w', bw.r, bw.c, 2, 1, rm.key, { snap: bw.snap });
          } else {
            const bwV = findWallVerticalPair(rm.cells, cellSet);
            if (bwV) addItem(`furn_bed_w_v_${bwV.snap}`, bwV.r, bwV.c, 1, 2, rm.key, { snap: bwV.snap });
            else {
              const bs = findWallSingle(rm.cells, cellSet, true);
              if (bs) addItem('furn_bed_s', bs.r, bs.c, 1, 1, rm.key, { snap: bs.snap });
            }
          }
          const dk = findWallSingle(rm.cells, cellSet, deskPreferNorth, deskWallOpts(true));
          if (dk) addItem('furn_desk', dk.r, dk.c, 1, 1, rm.key, { snap: dk.snap });
          const bk = findWallSingle(rm.cells, cellSet, false);
          if (bk) addItem('furn_bookshelf', bk.r, bk.c, 1, 1, rm.key, { snap: bk.snap });
        } else if (count >= 3) {
          const bs = findWallSingle(rm.cells, cellSet, true);
          if (bs) addItem('furn_bed_s', bs.r, bs.c, 1, 1, rm.key, { snap: bs.snap });
          const dk = findWallSingle(rm.cells, cellSet, deskPreferNorth, deskWallOpts(true));
          if (dk) addItem('furn_desk', dk.r, dk.c, 1, 1, rm.key, { snap: dk.snap });
        } else {
          const bs = findWallSingle(rm.cells, cellSet, true, { requireWall: false });
          if (bs) addItem('furn_bed_s', bs.r, bs.c, 1, 1, rm.key, { snap: bs.snap });
        }
      }
    }

    // 11) 庭クラスター配置（もはや公園 / 和風庭園・イングリッシュガーデン差分）
    const isParkCombo = comboNames.has('もはや公園');
    gardenClusters.forEach((cluster, gIdx) => {
      const cSet = new Set(cluster.map(x => `${x.r},${x.c}`));
      const len = cluster.length;
      const gSeed = getRoomThemeSeed(cluster, gIdx, stageObj);
      let isJapaneseGarden = false;
      if (hasAnyWashitsu || stageBadge.includes('和') || stageBadge.includes('庭園') || stageBadge.includes('二世帯') || stageBadge.includes('シニア') || stageBadge.includes('忍') || stageBadge.includes('仙')) {
        isJapaneseGarden = true;
      } else if (stageBadge.includes('陽だまり') || stageBadge.includes('おしゃれ') || stageBadge.includes('ファミリー') || stageBadge.includes('VIP') || stageBadge.includes('美食')) {
        isJapaneseGarden = false;
      } else {
        isJapaneseGarden = (gSeed % 2 === 0);
      }

      if (isParkCombo || len >= 12) {
        const sb = findHorizontalPair(cluster, cSet, true);
        if (sb) addItem('furn_sandbox', sb.r, sb.c, 2, 1, null);
        const sl = findSingleCell(cluster, cSet, true);
        if (sl) addItem('furn_slide', sl.r, sl.c, 1, 1, null);
        const bn = findSingleCell(cluster, cSet, false);
        if (bn) addItem('furn_bench', bn.r, bn.c, 1, 1, null);
        const tr1 = findSingleCell(cluster, cSet, true);
        if (tr1) addItem('furn_tree', tr1.r, tr1.c, 1, 1, null);
        const fl = findSingleCell(cluster, cSet, false);
        if (fl) addItem('furn_flower', fl.r, fl.c, 1, 1, null);
      } else if (len >= 8) {
        if (isJapaneseGarden) {
          const pd = findHorizontalPair(cluster, cSet, true);
          if (pd) addItem('furn_pond', pd.r, pd.c, 2, 1, null);
          const ln = findSingleCell(cluster, cSet, true);
          if (ln) addItem('furn_lantern', ln.r, ln.c, 1, 1, null);
          const ss = findSingleCell(cluster, cSet, false);
          if (ss) addItem('furn_stepping_stone', ss.r, ss.c, 1, 1, null);
          const tr1 = findSingleCell(cluster, cSet, true);
          if (tr1) addItem('furn_tree', tr1.r, tr1.c, 1, 1, null);
          const fl1 = findSingleCell(cluster, cSet, false);
          if (fl1) addItem('furn_flower', fl1.r, fl1.c, 1, 1, null);
        } else {
          const ra = findSingleCell(cluster, cSet, true);
          if (ra) addItem('furn_rose_arch', ra.r, ra.c, 1, 1, null);
          const gt = findSingleCell(cluster, cSet, false);
          if (gt) addItem('furn_garden_table', gt.r, gt.c, 1, 1, null);
          const bb = findSingleCell(cluster, cSet, true);
          if (bb) addItem('furn_birdbath', bb.r, bb.c, 1, 1, null);
          const tr1 = findSingleCell(cluster, cSet, true);
          if (tr1) addItem('furn_tree', tr1.r, tr1.c, 1, 1, null);
          const fl1 = findSingleCell(cluster, cSet, false);
          if (fl1) addItem('furn_flower', fl1.r, fl1.c, 1, 1, null);
        }
      } else if (len >= 4) {
        if (isJapaneseGarden) {
          const ln = findSingleCell(cluster, cSet, true);
          if (ln) addItem('furn_lantern', ln.r, ln.c, 1, 1, null);
          const ss = findSingleCell(cluster, cSet, false);
          if (ss) addItem('furn_stepping_stone', ss.r, ss.c, 1, 1, null);
          const tr = findSingleCell(cluster, cSet, true);
          if (tr) addItem('furn_tree', tr.r, tr.c, 1, 1, null);
        } else {
          const ra = findSingleCell(cluster, cSet, true);
          if (ra) addItem('furn_rose_arch', ra.r, ra.c, 1, 1, null);
          const bb = findSingleCell(cluster, cSet, false);
          if (bb) addItem('furn_birdbath', bb.r, bb.c, 1, 1, null);
          const fl = findSingleCell(cluster, cSet, false);
          if (fl) addItem('furn_flower', fl.r, fl.c, 1, 1, null);
          const tr = findSingleCell(cluster, cSet, true);
          if (tr) addItem('furn_tree', tr.r, tr.c, 1, 1, null);
        }
      } else if (len >= 2) {
        const pt = findSingleCell(cluster, cSet, false);
        if (pt) addItem(isJapaneseGarden ? 'furn_stepping_stone' : 'furn_flower', pt.r, pt.c, 1, 1, null);
      }
    });

    // ポップバウンス用：ランダム順の遅延（合計約1.0秒: delay 0..760ms + anim 240ms）
    const indices = items.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const maxDelay = Math.min(760, Math.max(0, (items.length - 1) * 55));
    indices.forEach((origIdx, orderIdx) => {
      items[origIdx].delayMs = items.length <= 1 ? 0 : (orderIdx / (items.length - 1)) * maxDelay;
    });

    // 北壁に密接する背高・壁寄せ家具のセルを記録（時計・絵画等と喧嘩しないよう排他制御）
    const northWallOccupiedByFurn = new Set();
    for (const it of items) {
      if (!it.roomKey || it.floating || it.isFloorRug || it.snap === 'center' || CENTER_SNAP_ASSETS.has(it.assetId)) continue;
      if (it.snap === 'south' || it.assetId.startsWith('furn_futon') || it.assetId === 'furn_bath_stool') continue;
      const wc = it.wCells || 1;
      for (let dc = 0; dc < wc; dc++) {
        const r = it.r, c = it.c + dc;
        if (getCellEdges(r, c).hasSolidTop) {
          northWallOccupiedByFurn.add(`${r},${c}`);
        }
      }
    }

    // 北壁のランダム装飾（絵画・時計）と床小物（靴・廊下絨毯）もプラン内に統一記録し、描画と図鑑認識を一致させる
    const facing = (typeof getEntranceFacing === 'function') ? getEntranceFacing(stageObj, targetGrid) : { dir: 'bottom' };
    let hasEnt = false;
    let hasFoyerRugSpot = false;
    let hasLongCorridor = false;
    const isLongCorridorCombo = comboNames.has('ロングコリドー');
    const isFoyerCombo = comboNames.has('大ホワイエ');

    for (let r = 0; r < gSize; r++) {
      for (let c = 0; c < gSize; c++) {
        const cCur = targetGrid[r]?.[c];
        if (!cCur || cCur.type === T.EMPTY || cCur.type === T.GARDEN || cCur.type === T.OBSTACLE) continue;

        if (cCur.type === T.ENTRANCE) hasEnt = true;
        if (cCur.type === T.CORRIDOR) {
          if (isLongCorridorCombo) hasLongCorridor = true;
          if (isFoyerCombo && !hasFoyerRugSpot) {
            const upSame = targetGrid[r - 1]?.[c]?.type === T.CORRIDOR;
            const dnSame = targetGrid[r + 1]?.[c]?.type === T.CORRIDOR;
            const lfSame = targetGrid[r]?.[c - 1]?.type === T.CORRIDOR;
            const rtSame = targetGrid[r]?.[c + 1]?.type === T.CORRIDOR;
            if (upSame && dnSame && lfSame && rtSame) hasFoyerRugSpot = true;
          }
        }

        const key = `${r},${c}`;
        if (northWallDecoCells.has(key) || northWallOccupiedByFurn.has(key)) continue;
        const e = getCellEdges(r, c);
        if (!e.hasSolidTop) continue;
        const cTop = (r - 1 >= 0) ? targetGrid[r - 1]?.[c] : null;
        const occTop = cTop && cTop.type !== T.EMPTY && cTop.type !== T.GARDEN && cTop.type !== T.OBSTACLE;
        if (cCur.type === T.ENTRANCE && !occTop && facing && facing.dir === 'top') continue;

        const isWashitsuCell = (cCur.type === T.ROOM) && (cCur.label === '和室' || cCur.pieceLibId === 'room-wa' || cCur.pieceLibId === 'room-wa2');
        if (cCur.type === T.CORRIDOR && ((r * 7 + c * 11) % 3 === 0)) {
          registerWallDeco(((r + c) % 2 === 0) ? 'art_1' : 'art_2', r, c, 1);
        } else if (cCur.type === T.LDK && ((r * 3 + c * 5) % 4 === 1)) {
          registerWallDeco('clock', r, c, 1);
        } else if (cCur.type === T.ROOM && !isWashitsuCell && ((r * 5 + c * 9) % 4 === 0)) {
          registerWallDeco('art_1', r, c, 1);
        }
      }
    }

    const extraAssetIds = [];
    if (hasEnt) extraAssetIds.push('furn_shoes_pair');
    if (hasFoyerRugSpot) extraAssetIds.push('furn_rug_foyer');
    if (hasLongCorridor) extraAssetIds.push('furn_rug_red');

    const built = {
      items, darkRooms, isGlassHouse, isFortress, comboNames, rooms,
      wallDecoRooms, northWallDecoCells, northWallOccupiedByFurn,
      sunnyRoomKeys, hiddenRoomKeys, badSpots, doorPlan, extraAssetIds
    };
    built.catalogIds = collectFurnitureCatalogIds(built);
    return built;
  }

  /* ============================================================
     3. 2Dゼルダ風トップダウン盤面描画
  ============================================================ */
  function getFloorAssetId(cell, inBox, darkRooms) {
    if (!cell || cell.type === T.EMPTY || cell.type === T.GARDEN) {
      return inBox ? 'floor_garden' : 'floor_gravel_lot';
    }
    if (cell.type === T.OBSTACLE) return 'floor_obstacle';
    const key = cell.roomId ? `id_${cell.roomId}` : null;
    if (key && darkRooms && darkRooms.has(key) && cell.type !== T.ENTRANCE) {
      // 封印されし闇のみ暗い床に
      if (cell._isDarkFloor) return 'floor_darkness';
    }
    if (cell.type === T.ENTRANCE) return 'floor_entrance';
    if (cell.type === T.CORRIDOR) return 'floor_corridor';
    if (cell.type === T.LDK) return 'floor_ldk';
    if (cell.type === T.ROOM) {
      if (cell.label === '和室' || cell.pieceLibId === 'room-wa' || cell.pieceLibId === 'room-wa2') {
        return 'floor_washitsu';
      }
      return 'floor_room';
    }
    if (cell.type === T.BATH) {
      if (cell.pieceLibId === 'unit-bath' || cell.label === 'UB') return 'floor_ub';
      return 'floor_bath';
    }
    if (cell.type === T.TOILET) return 'floor_toilet';
    if (cell.type === T.WASHROOM) return 'floor_washroom';
    if (cell.type === T.CLOSET) return 'floor_closet';
    return 'floor_outside';
  }

  function isWashitsuDoorCell(cell) {
    return Boolean(cell && (cell.label === '和室' || cell.pieceLibId === 'room-wa' || cell.pieceLibId === 'room-wa2'));
  }

  function isLargeNonUbBath(cell, r, c, sizeMap) {
    if (!cell || cell.type !== T.BATH) return false;
    if (cell.pieceLibId === 'unit-bath' || cell.label === 'UB') return false;
    const roomSize = sizeMap?.get(`${r},${c}`) || 0;
    return roomSize >= 4 || cell.pieceLibId === 'bath-wide';
  }

  function resolveDoorKind(c1, c2, r1, col1, r2, col2, sizeMap) {
    if (isWashitsuDoorCell(c1) || isWashitsuDoorCell(c2)) return 'fusuma';
    if (c1?.type === T.BATH || c2?.type === T.BATH) {
      if (isLargeNonUbBath(c1, r1, col1, sizeMap) || isLargeNonUbBath(c2, r2, col2, sizeMap)) {
        return 'bath_slide';
      }
      return 'bath_fold';
    }
    return 'hinged';
  }

  function getDoorOpeningPost(len, doorKind) {
    if (doorKind === 'hinged' || doorKind === 'bath_fold') {
      return Math.max(3, Math.round(len * 0.24));
    }
    return Math.max(2, Math.round(len * 0.16));
  }

  const SLIDE_THEME_FUSUMA = {
    headerCol: '#5c2d0c',
    sillCol: '#92400e',
    railH: '#92400e',
    backFill: '#f5ebd1',
    backStroke: '#78350f',
    frontFill: '#fffbeb',
    frontStroke: '#5c2d0c',
    topWoodV: '#d97706',
    glareCol: null,
    handleCol: '#334155',
    isBathGlass: false
  };

  const SLIDE_THEME_BATH = {
    headerCol: '#334155',
    sillCol: '#64748b',
    railH: '#e2e8f0',
    backFill: '#7dd3fc',
    backStroke: '#334155',
    frontFill: '#bae6fd',
    frontStroke: '#1e293b',
    topWoodV: '#f8fafc',
    glareCol: '#f0f9ff',
    handleCol: '#1e293b',
    isBathGlass: true
  };

  // 浴室用・立ち上がり2.5D折れ戸（蛇腹3連パネル）共通レンダラー（横・縦共通）
  function drawStandingAccordionPanels(ctx, pts, doorH) {
    if (!pts || pts.length < 2) return;

    ctx.save();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.28)';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y + 1.5);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y + 1.5);
    }
    ctx.stroke();

    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      segs.push({ a, b, idx: i, depth: Math.min(a.y, b.y) + Math.max(a.y, b.y) });
    }
    segs.sort((s1, s2) => s1.depth - s2.depth);

    for (const seg of segs) {
      const { a, b, idx } = seg;
      const isLit = (idx % 2 === 0);
      ctx.fillStyle = isLit ? '#bae6fd' : '#60a5fa';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - doorH);
      ctx.lineTo(b.x, b.y - doorH);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(a.x, a.y);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = isLit ? 'rgba(240, 249, 255, 0.72)' : 'rgba(224, 242, 254, 0.40)';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - doorH + 1);
      ctx.lineTo(b.x, b.y - doorH + 1);
      ctx.lineTo(b.x, b.y - doorH + Math.max(2, Math.round(doorH * 0.42)));
      ctx.lineTo(a.x, a.y - doorH + Math.max(2, Math.round(doorH * 0.42)));
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y - doorH);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y - doorH);
    }
    ctx.stroke();

    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y - doorH);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y - doorH);
    }
    ctx.stroke();

    ctx.fillStyle = '#334155';
    for (let i = 0; i < pts.length; i++) {
      ctx.fillRect(Math.round(pts[i].x) - 0.5, Math.round(pts[i].y - doorH), 1.5, doorH);
    }
    const lastPt = pts[pts.length - 1];
    const prevPt = pts[pts.length - 2];
    const hx = Math.round(lastPt.x * 0.72 + prevPt.x * 0.28);
    const hy = Math.round((lastPt.y * 0.72 + prevPt.y * 0.28) - doorH * 0.48);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(hx - 1, hy - 1, 2, 2);
    ctx.restore();
  }

  // 横向き引き違い戸（和室襖／大型浴室フロスト引き戸共通）
  function drawSlidingDoorPanelsH(ctx, x, y, post, dw, wallH, theme) {
    ctx.fillStyle = theme.headerCol;
    ctx.fillRect(x + post, y, dw, 2);
    ctx.fillStyle = theme.sillCol;
    ctx.fillRect(x + post, y + wallH - 2, dw, 2);
    if (theme.isBathGlass) {
      ctx.fillStyle = theme.railH;
      ctx.fillRect(x + post, y + wallH - 2, dw, 1);
    }
    const innerH = Math.max(3, wallH - 4);
    const panW = Math.max(4, Math.round(dw * 0.48));

    ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
    ctx.fillRect(x + post + panW + 2, y + wallH - 1, Math.max(2, dw - panW - 2), 2);

    const backX = x + post + Math.round(dw * 0.16);
    ctx.fillStyle = theme.backFill;
    ctx.fillRect(backX, y + 2, panW, innerH);
    if (theme.isBathGlass && innerH >= 5) {
      ctx.fillStyle = theme.railH;
      ctx.fillRect(backX + 1, y + 2 + Math.round(innerH * 0.52), Math.max(1, panW - 2), 1);
    }
    ctx.strokeStyle = theme.backStroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(backX, y + 2, panW, innerH);

    const frontX = x + post + 1;
    ctx.fillStyle = theme.frontFill;
    ctx.fillRect(frontX, y + 2, panW, innerH);
    if (theme.isBathGlass && innerH >= 5) {
      ctx.fillStyle = theme.glareCol;
      ctx.fillRect(frontX + 1, y + 3, Math.max(2, panW - 2), Math.max(2, Math.round(innerH * 0.34)));
      ctx.fillStyle = '#64748b';
      ctx.fillRect(frontX + 1, y + 2 + Math.round(innerH * 0.54), Math.max(1, panW - 2), 1);
    }
    ctx.strokeStyle = theme.frontStroke;
    ctx.strokeRect(frontX, y + 2, panW, innerH);
    ctx.fillStyle = theme.handleCol;
    if (theme.isBathGlass) {
      ctx.fillRect(frontX + panW - 3, y + 3, 1, Math.max(3, innerH - 3));
    } else {
      ctx.fillRect(frontX + panW - 3, y + Math.round(wallH * 0.52), 2, 2);
    }
  }

  // 縦向き引き違い戸（和室襖／大型浴室フロスト引き戸共通）
  function drawSlidingDoorPanelsV(ctx, x1, gy1, gap, wallThick, theme) {
    ctx.fillStyle = theme.sillCol;
    ctx.fillRect(x1 - 2, gy1, 1, gap);
    ctx.fillRect(x1 + 1, gy1, 1, gap);
    const panLen = Math.max(4, Math.round(gap * 0.36));
    const panThick = Math.max(2, Math.round(wallThick * 0.55));
    const shift2 = Math.max(2, Math.round(gap * 0.24));

    ctx.fillStyle = 'rgba(15, 23, 42, 0.20)';
    ctx.fillRect(x1 + 2, gy1 + 2, panThick + 2, panLen + shift2);

    ctx.fillStyle = theme.backStroke;
    ctx.fillRect(x1 - panThick, gy1 + shift2, panThick, panLen);
    ctx.fillStyle = theme.backFill;
    ctx.fillRect(x1 - panThick + 1, gy1 + shift2 + 1, Math.max(1, panThick - 2), Math.max(2, panLen - 2));

    ctx.fillStyle = theme.frontStroke;
    ctx.fillRect(x1, gy1, panThick, panLen);
    ctx.fillStyle = theme.frontFill;
    ctx.fillRect(x1 + 1, gy1 + 1, Math.max(1, panThick - 2), Math.max(2, panLen - 2));
    if (theme.isBathGlass && panLen >= 6) {
      ctx.fillStyle = theme.glareCol;
      ctx.fillRect(x1 + 1, gy1 + 2, Math.max(1, panThick - 2), Math.max(2, Math.round(panLen * 0.35)));
    }
    if (panThick >= 3) {
      ctx.fillStyle = theme.topWoodV;
      ctx.fillRect(x1 - panThick + 1, gy1 + shift2, Math.max(1, panThick - 2), 1);
      ctx.fillRect(x1 + 1, gy1, Math.max(1, panThick - 2), 1);
    }
    ctx.fillStyle = theme.handleCol;
    ctx.fillRect(x1 + 1, gy1 + Math.max(1, Math.round(panLen * 0.72)), 1, theme.isBathGlass ? 2 : 1);
  }

  function drawStanding3DVerticalDoor(ctx, hx, gy1, gy2, dirX, hingeAt, cs, doorFill, isHidden) {
    const gap = Math.max(6, gy2 - gy1);
    const doorH = Math.max(5, Math.round(cs * 0.23));
    const openX = dirX * Math.max(4, Math.round(gap * 0.60));
    const slantY = (hingeAt === 'bottom')
      ? -Math.max(2, Math.round(gap * 0.24))
      : Math.max(3, Math.round(gap * 0.36));
    const botY = (hingeAt === 'bottom') ? (gy2 - 2) : (gy1 + 2);
    const topY = botY - doorH;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.24)';
    ctx.beginPath();
    ctx.moveTo(hx, botY);
    ctx.lineTo(hx + openX + dirX * 1.5, botY + slantY + 2);
    ctx.lineTo(hx + openX - dirX * 1.5, botY + slantY + 3);
    ctx.lineTo(hx, botY + 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = isHidden ? '#92400e' : doorFill;
    ctx.beginPath();
    ctx.moveTo(hx, topY);
    ctx.lineTo(hx + openX, topY + slantY);
    ctx.lineTo(hx + openX, botY + slantY);
    ctx.lineTo(hx, botY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#5c2d0c';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (Math.abs(openX) >= 6 && doorH >= 8) {
      const insetX = dirX * Math.max(1.5, Math.abs(openX) * 0.22);
      const insetY = Math.max(2, Math.round(doorH * 0.22));
      ctx.fillStyle = '#92400e';
      ctx.beginPath();
      ctx.moveTo(hx + insetX, topY + insetY);
      ctx.lineTo(hx + openX - insetX, topY + insetY + slantY);
      ctx.lineTo(hx + openX - insetX, botY - insetY + slantY);
      ctx.lineTo(hx + insetX, botY - insetY);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = Math.max(1, Math.round(cs * 0.03));
    ctx.beginPath();
    ctx.moveTo(hx, topY + 0.5);
    ctx.lineTo(hx + openX, topY + slantY + 0.5);
    ctx.stroke();

    const kSize = Math.abs(openX) >= 10 ? 2 : 1;
    const kx = Math.round(hx + openX * 0.76);
    const ky = Math.round(topY + doorH * 0.54 + slantY * 0.76);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(kx - (kSize > 1 ? 1 : 0), ky - (kSize > 1 ? 1 : 0), kSize, kSize);
  }

  function drawAngledDoorLeaf(ctx, hx, hy, tipX, tipY, thick, fillCol, borderCol, drawKnob) {
    const dx = tipX - hx;
    const dy = tipY - hy;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;
    const nx = -dy / len;
    const ny = dx / len;

    const fillQuad = (ox, oy, halfW, col) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(hx + ox + nx * halfW, hy + oy + ny * halfW);
      ctx.lineTo(tipX + ox + nx * halfW, tipY + oy + ny * halfW);
      ctx.lineTo(tipX + ox - nx * halfW, tipY + oy - ny * halfW);
      ctx.lineTo(hx + ox - nx * halfW, hy + oy - ny * halfW);
      ctx.closePath();
      ctx.fill();
    };

    fillQuad(2, 2.5, thick * 0.5 + 0.6, 'rgba(15, 23, 42, 0.22)');
    fillQuad(0, 0, thick * 0.5 + 1, borderCol);
    fillQuad(0, 0, thick * 0.5, fillCol);

    if (drawKnob) {
      const kx = hx + dx * 0.78;
      const ky = hy + dy * 0.78;
      ctx.fillStyle = '#facc15';
      ctx.fillRect(Math.round(kx - 1), Math.round(ky - 1), 2, 2);
    }
  }

  function drawFlatBifoldPolyline(ctx, pts) {
    ctx.save();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();

    ctx.strokeStyle = '#bae6fd';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.restore();
  }

  function drawPixelWallEdge(ctx, x1, y1, x2, y2, r1, c1, r2, c2, ori, cs, targetGrid, showSolidRedOverlay, enable25DWalls = false, pass = 'all', doorPlan = null) {
    const et = safeEdgeType(targetGrid, r1, c1, r2, c2, typeof edgeType === 'function' ? edgeType : null);
    if (et === E.NONE) return;

    const gSize = targetGrid.length;
    const c1_cell = (r1 >= 0 && r1 < gSize && c1 >= 0 && c1 < gSize) ? targetGrid[r1][c1] : null;
    const c2_cell = (r2 >= 0 && r2 < gSize && c2 >= 0 && c2 < gSize) ? targetGrid[r2][c2] : null;
    const isExt = !c1_cell || c1_cell.type === T.EMPTY || c1_cell.type === T.GARDEN || c1_cell.type === T.OBSTACLE ||
                  !c2_cell || c2_cell.type === T.EMPTY || c2_cell.type === T.GARDEN || c2_cell.type === T.OBSTACLE;
    const isSolid = hasCellSolidWall(targetGrid, r1, c1, r2, c2);

    ctx.save();
    const rawT = Math.round(cs * 0.15);
    const wallThick = Math.max(4, rawT % 2 === 0 ? rawT : rawT + 1);
    const halfT = wallThick / 2;
    const borderCol = '#0f172a';
    const topCol = '#1e293b';
    const inset = wallThick >= 6 ? Math.max(1, Math.round(wallThick * 0.22)) : 1;
    const coreThick = Math.max(2, wallThick - inset * 2);

    if (et === E.DOOR) {
      const len = ori === 'h' ? Math.abs(x2 - x1) : Math.abs(y2 - y1);
      const doorKind = resolveDoorKind(c1_cell, c2_cell, r1, c1, r2, c2, doorPlan?.cellRoomSize);
      const isBathDoor = (doorKind === 'bath_fold' || doorKind === 'bath_slide');
      const post = getDoorOpeningPost(len, doorKind);
      const gap = Math.max(4, len - post * 2);
      const isWashitsu = (doorKind === 'fusuma');
      const isHidden = Boolean(
        ((c1_cell?.type === T.CLOSET && (c2_cell?.type === T.ROOM || c2_cell?.type === T.TOILET)) ||
         (c2_cell?.type === T.CLOSET && (c1_cell?.type === T.ROOM || c1_cell?.type === T.TOILET)))
      );

      // 1) 両端の壁スタブ（2パスで壁角をシームレス接続）
      if (pass === 'all' || pass === 'base') {
        ctx.fillStyle = borderCol;
        if (ori === 'h') {
          ctx.fillRect(x1 - halfT, y1 - halfT, post + halfT, wallThick);
          ctx.fillRect(x2 - post, y1 - halfT, post + halfT, wallThick);
        } else {
          ctx.fillRect(x1 - halfT, y1 - halfT, wallThick, post + halfT);
          ctx.fillRect(x1 - halfT, y2 - post, wallThick, post + halfT);
        }
      }
      if (pass === 'all' || pass === 'top') {
        ctx.fillStyle = topCol;
        if (ori === 'h') {
          ctx.fillRect(x1 - halfT + inset, y1 - halfT + inset, Math.max(1, post + halfT - inset * 2), coreThick);
          ctx.fillRect(x2 - post + inset, y1 - halfT + inset, Math.max(1, post + halfT - inset * 2), coreThick);
          if (wallThick >= 4) {
            ctx.fillStyle = '#334155';
            ctx.fillRect(x1 - halfT + inset, y1 - halfT + inset, Math.max(1, post + halfT - inset * 2), 1);
            ctx.fillRect(x2 - post + inset, y1 - halfT + inset, Math.max(1, post + halfT - inset * 2), 1);
          }
        } else {
          ctx.fillRect(x1 - halfT + inset, y1 - halfT + inset, coreThick, Math.max(1, post + halfT - inset * 2));
          ctx.fillRect(x1 - halfT + inset, y2 - post + inset, coreThick, Math.max(1, post + halfT - inset * 2));
          if (wallThick >= 4) {
            ctx.fillStyle = '#334155';
            ctx.fillRect(x1 - halfT + inset, y1 - halfT + inset, 1, Math.max(1, post + halfT - inset * 2));
            ctx.fillRect(x1 - halfT + inset, y2 - post + inset, 1, Math.max(1, post + halfT - inset * 2));
          }
        }

        // 2) ドア表現
        const doorFill = isHidden ? '#92400e' : (isWashitsu ? '#fef3c7' : '#b45309');
        const leafThick = Math.max(2.6, wallThick * 0.65);

        if (ori === 'h') {
          if (!enable25DWalls) {
            // パズル実物プレビュー（フラット時）
            const gx1 = x1 + post;
            const gx2 = x2 - post;
            ctx.fillStyle = isBathDoor ? '#475569' : '#78350f';
            ctx.fillRect(gx1 - 1, y1 - halfT, 2, wallThick);
            ctx.fillRect(gx2 - 1, y1 - halfT, 2, wallThick);
            ctx.fillStyle = isBathDoor ? '#94a3b8' : 'rgba(120, 53, 15, 0.30)';
            ctx.fillRect(gx1, y1, gap, 1);

            if (isWashitsu || doorKind === 'bath_slide') {
              const th = doorKind === 'bath_slide' ? SLIDE_THEME_BATH : SLIDE_THEME_FUSUMA;
              const panW = Math.max(4, Math.round(gap * 0.42));
              const panH = Math.max(2, Math.round(wallThick * 0.52));
              const shift = Math.max(2, Math.round(gap * 0.24));
              ctx.fillStyle = th.backStroke;
              ctx.fillRect(gx1 + shift, y1 - panH, panW, panH);
              ctx.fillStyle = th.backFill;
              ctx.fillRect(gx1 + shift + 1, y1 - panH + 1, Math.max(1, panW - 2), Math.max(1, panH - 2));
              ctx.fillStyle = th.frontStroke;
              ctx.fillRect(gx1, y1, panW, panH);
              ctx.fillStyle = th.frontFill;
              ctx.fillRect(gx1 + 1, y1 + 1, Math.max(1, panW - 2), Math.max(1, panH - 2));
            } else if (doorKind === 'bath_fold') {
              const swH = doorPlan?.hDoors?.get(`${Math.max(r1, r2)},${c1}`);
              const hSide = swH?.hingeSide || 'left';
              const sx = hSide === 'right' ? -1 : 1;
              const hx0 = hSide === 'right' ? (gx2 - 1) : (gx1 + 1);
              const span = Math.min(Math.max(4, gap - 2), Math.max(6, Math.round(gap * 0.58)));
              const stepX = span / 3;
              const foldD = Math.max(3, Math.round(gap * 0.28));
              drawFlatBifoldPolyline(ctx, [
                { x: hx0, y: y1 + 1 },
                { x: hx0 + sx * stepX, y: y1 + 1 + foldD },
                { x: hx0 + sx * (stepX * 2), y: y1 + 2 },
                { x: hx0 + sx * span, y: y1 + 1 + foldD }
              ]);
            } else {
              const swH = doorPlan?.hDoors?.get(`${Math.max(r1, r2)},${c1}`);
              const hSide = swH?.hingeSide || 'left';
              const hx = hSide === 'right' ? (gx2 - 1) : (gx1 + 1);
              const dirX = hSide === 'right' ? -1 : 1;
              const doorR = Math.max(5, gap - 2);
              const swingAng = 0.28 * Math.PI;
              drawAngledDoorLeaf(
                ctx, hx, y1 + 1,
                hx + dirX * Math.cos(swingAng) * doorR,
                (y1 + 1) + Math.sin(swingAng) * doorR,
                leafThick, doorFill, '#5c2d0c', true
              );
            }
          }
          // 2.5D 時は draw25DWallsAndDeco が開口奥床・敷居・各種扉を描画
        } else {
          // 縦辺 (ori === 'v')
          const gy1 = y1 + post;
          const gy2 = y2 - post;
          ctx.fillStyle = isBathDoor ? '#475569' : '#78350f';
          ctx.fillRect(x1 - halfT, gy1 - 1, wallThick, 2);
          ctx.fillRect(x1 - halfT, gy2 - 1, wallThick, 2);

          if (isWashitsu) {
            drawSlidingDoorPanelsV(ctx, x1, gy1, gap, wallThick, SLIDE_THEME_FUSUMA);
          } else if (doorKind === 'bath_slide') {
            drawSlidingDoorPanelsV(ctx, x1, gy1, gap, wallThick, SLIDE_THEME_BATH);
          } else if (doorKind === 'bath_fold') {
            ctx.fillStyle = '#94a3b8';
            ctx.fillRect(x1 - 1, gy1, 2, gap);
            const rMin = Math.min(r1, r2), cMin = Math.min(c1, c2);
            const sw = doorPlan?.vDoors?.get(`${rMin},${cMin}`) || { dirX: 1, hingeAt: 'top' };
            const bx = x1 + (sw.dirX > 0 ? 1 : -1);
            const sy = sw.hingeAt === 'bottom' ? -1 : 1;
            const hy0 = sw.hingeAt === 'bottom' ? (gy2 - 1) : (gy1 + 1);
            const span = Math.min(Math.max(5, gap - 2), Math.max(6, Math.round(gap * 0.68)));
            const stepY = span / 3;
            const foldD = Math.max(3, Math.round(gap * 0.34));
            const inD = Math.max(1, Math.round(foldD * 0.15));
            const pts = [
              { x: bx, y: hy0 },
              { x: bx + sw.dirX * foldD, y: hy0 + sy * stepY },
              { x: bx + sw.dirX * inD, y: hy0 + sy * (stepY * 2) },
              { x: bx + sw.dirX * foldD, y: hy0 + sy * span }
            ];
            if (enable25DWalls) {
              const doorH = Math.max(4, Math.round(cs * 0.16));
              drawStandingAccordionPanels(ctx, pts, doorH);
            } else {
              drawFlatBifoldPolyline(ctx, pts);
            }
          } else {
            ctx.fillStyle = 'rgba(146, 64, 14, 0.45)';
            ctx.fillRect(x1 - 1, gy1, 2, gap);
            const rMin = Math.min(r1, r2), cMin = Math.min(c1, c2);
            const sw = doorPlan?.vDoors?.get(`${rMin},${cMin}`) || { dirX: 1, hingeAt: 'top' };
            const hx = x1 + (sw.dirX > 0 ? 1 : -1);
            if (enable25DWalls) {
              drawStanding3DVerticalDoor(ctx, hx, gy1, gy2, sw.dirX, sw.hingeAt, cs, '#b45309', isHidden);
            } else {
              const hy = sw.hingeAt === 'bottom' ? (gy2 - 1) : (gy1 + 1);
              const dirY = sw.hingeAt === 'bottom' ? -1 : 1;
              const doorR = Math.max(5, gap - 2);
              const openAng = 0.24 * Math.PI;
              drawAngledDoorLeaf(
                ctx, hx, hy,
                hx + sw.dirX * Math.cos(openAng) * doorR,
                hy + dirY * Math.sin(openAng) * doorR,
                leafThick, doorFill, '#5c2d0c', true
              );
            }
          }
        }
      }
      ctx.restore();
      return;
    }

    // 壁（外壁・内壁を太めの濃紺ベース＋明るい境界ハイライトで統一し2パス接続）
    if (pass === 'all' || pass === 'base') {
      ctx.fillStyle = borderCol;
      if (ori === 'h') {
        ctx.fillRect(x1 - halfT, y1 - halfT, (x2 - x1) + wallThick, wallThick);
      } else {
        ctx.fillRect(x1 - halfT, y1 - halfT, wallThick, (y2 - y1) + wallThick);
      }
    }
    if (pass === 'all' || pass === 'top') {
      if (ori === 'h') {
        const w = x2 - x1;
        ctx.fillStyle = topCol;
        ctx.fillRect(x1 - halfT + inset, y1 - halfT + inset, w + wallThick - inset * 2, coreThick);
        if (coreThick >= 2) {
          ctx.fillStyle = '#334155';
          ctx.fillRect(x1 - halfT + inset, y1 - halfT + inset, w + wallThick - inset * 2, 1);
        }
        if (et === E.WINDOW && !isSolid) {
          const winStart = x1 + Math.round(w * 0.20);
          const winLen = Math.round(w * 0.60);
          const w1 = isWashitsuDoorCell(c1_cell);
          const w2 = isWashitsuDoorCell(c2_cell);
          if ((w1 !== w2) && coreThick >= 2) {
            const halfC = Math.floor(coreThick / 2);
            const remC = coreThick - halfC;
            const topIsShoji = w1;
            ctx.fillStyle = topIsShoji ? '#fef3c7' : '#38bdf8';
            ctx.fillRect(winStart, y1 - halfT + inset, winLen, halfC);
            ctx.fillStyle = topIsShoji ? '#38bdf8' : '#fef3c7';
            ctx.fillRect(winStart, y1 - halfT + inset + halfC, winLen, remC);
          } else {
            ctx.fillStyle = '#38bdf8';
            ctx.fillRect(winStart, y1 - halfT + inset, winLen, coreThick);
            ctx.fillStyle = '#e0f2fe';
            ctx.fillRect(winStart + 2, y1 - halfT + inset, Math.max(2, Math.round(winLen * 0.42)), 1);
          }
        }
      } else {
        const h = y2 - y1;
        ctx.fillStyle = topCol;
        ctx.fillRect(x1 - halfT + inset, y1 - halfT + inset, coreThick, h + wallThick - inset * 2);
        if (coreThick >= 2) {
          ctx.fillStyle = '#334155';
          ctx.fillRect(x1 - halfT + inset, y1 - halfT + inset, 1, h + wallThick - inset * 2);
        }
        if (et === E.WINDOW && !isSolid) {
          const winStart = y1 + Math.round(h * 0.20);
          const winLen = Math.round(h * 0.60);
          const w1 = isWashitsuDoorCell(c1_cell);
          const w2 = isWashitsuDoorCell(c2_cell);
          if ((w1 !== w2) && coreThick >= 2) {
            const halfC = Math.floor(coreThick / 2);
            const remC = coreThick - halfC;
            const leftIsShoji = w1;
            ctx.fillStyle = leftIsShoji ? '#fef3c7' : '#38bdf8';
            ctx.fillRect(x1 - halfT + inset, winStart, halfC, winLen);
            ctx.fillStyle = leftIsShoji ? '#38bdf8' : '#fef3c7';
            ctx.fillRect(x1 - halfT + inset + halfC, winStart, remC, winLen);
          } else {
            ctx.fillStyle = '#38bdf8';
            ctx.fillRect(x1 - halfT + inset, winStart, coreThick, winLen);
            ctx.fillStyle = '#e0f2fe';
            ctx.fillRect(x1 - halfT + inset, winStart + 2, 1, Math.max(2, Math.round(winLen * 0.42)));
          }
        }
      }

      // パズル中のみ：赤壁（耐力壁）を明示的に赤線オーバーレイ表示（固定躯体壁は鉄骨リベット付濃紅）
      if (isSolid && showSolidRedOverlay) {
        const isLockedW = Boolean(global.DXStage2 && global.DXStage2.hasLockedWall(targetGrid, r1, c1, r2, c2));
        ctx.strokeStyle = isLockedW ? '#9f1239' : '#ef4444';
        ctx.lineWidth = isLockedW ? 4.5 : 3.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        if (isLockedW) {
          ctx.fillStyle = '#fef08a';
          ctx.fillRect(Math.round((x1 + x2) / 2 - 1.5), Math.round((y1 + y2) / 2 - 1.5), 3, 3);
        }
      }
    }

    ctx.restore();
  }

  function isOccupiedCell(cell) {
    return Boolean(cell && cell.type !== T.EMPTY && cell.type !== T.GARDEN && cell.type !== T.OBSTACLE);
  }

  // 玄関セル専用：外向き(facing.dir)に応じて土間・上がり框・靴・廊下床を描き分ける
  function drawEntranceFloorAndShoes(ctx, targetGrid, r, c, cs, facing, enable25DWalls, entranceBoxSnap = null, showShoes = true) {
    const x = c * cs, y = r * cs;
    const dir = (facing && facing.dir) || 'bottom';
    // まず室内側床（廊下木目）を全面に敷く
    PixelAssets.drawSprite(ctx, 'floor_corridor', x, y, cs, cs);

    ctx.save();
    // 土間領域（外側の約42%）＋ 上がり框ライン（木材段差）
    let dx = x, dy = y, dw = cs, dh = cs;
    let kx = x, ky = y, kw = cs, kh = Math.max(2, Math.round(cs * 0.08));
    if (dir === 'bottom') {
      dh = Math.round(cs * 0.40);
      dy = y + cs - dh;
      ky = dy - kh;
    } else if (dir === 'top') {
      const topOffset = enable25DWalls ? Math.round(cs * 0.34) : 0;
      dh = Math.round(cs * 0.34);
      dy = y + topOffset;
      ky = dy + dh;
    } else if (dir === 'left') {
      dw = Math.round(cs * 0.42);
      dx = x;
      kx = dx + dw; kw = kh; kh = cs;
    } else if (dir === 'right') {
      dw = Math.round(cs * 0.42);
      dx = x + cs - dw;
      kx = dx - kh; kw = kh; kh = cs;
    }

    // 石タイル土間（クリップ描画）
    ctx.beginPath();
    ctx.rect(dx, dy, dw, dh);
    ctx.clip();
    PixelAssets.drawSprite(ctx, 'floor_entrance', x, y, cs, cs);
    ctx.restore();

    // 上がり框（木の段差）
    ctx.save();
    ctx.fillStyle = '#92400e';
    ctx.fillRect(kx, ky, kw, kh);
    ctx.fillStyle = '#d97706';
    if (dir === 'bottom' || dir === 'top') {
      ctx.fillRect(kx, ky, kw, Math.max(1, kh - 1));
    } else {
      ctx.fillRect(kx, ky, Math.max(1, kw - 1), kh);
    }

    // 土間に脱いだ靴（furn_shoes_pair: 24x12）を下駄箱側と反対寄りへ配置
    if (showShoes) {
      const sw = cs * 0.50, sh = cs * 0.25;
      let sx = dx + (dw - sw) / 2;
      let sy = dy + (dh - sh) / 2;
      if (dir === 'bottom' || dir === 'top') {
        if (entranceBoxSnap === 'west') sx = dx + cs * 0.36;
        else if (entranceBoxSnap === 'east') sx = dx + cs * 0.14;
      } else {
        if (entranceBoxSnap === 'north') sy = dy + cs * 0.42;
        else if (entranceBoxSnap === 'south') sy = dy + cs * 0.18;
      }
      PixelAssets.drawSprite(ctx, 'furn_shoes_pair', sx, sy, sw, sh);
    }
    ctx.restore();
  }

  // 完成時専用：2.5D 北側立ち上がり壁面（高さ約42%：1.55倍拡大！）＋ 南側外壁外観 ＋ 窓・壁装飾・外扉
  function draw25DWallsAndDeco(ctx, targetGrid, cs, plan, stageObj, facing, vacantMode = false) {
    const gSize = targetGrid.length;
    const wallH = Math.max(9, Math.round(cs * 0.42));
    const extH = Math.max(7, Math.round(cs * 0.34));
    const fn = typeof edgeType === 'function' ? edgeType : null;
    const wallDecoMap = new Map();
    if (plan && plan.wallDecoRooms) {
      for (const wd of plan.wallDecoRooms) {
        wallDecoMap.set(`${wd.r},${wd.c}`, wd);
      }
    }
    const skipCells = new Set();

    for (let r = 0; r <= gSize; r++) {
      for (let c = 0; c < gSize; c++) {
        const cTop = (r - 1 >= 0) ? targetGrid[r - 1]?.[c] : null;
        const cCur = (r < gSize) ? targetGrid[r]?.[c] : null;
        const occTop = isOccupiedCell(cTop);
        const occCur = isOccupiedCell(cCur);
        if (!occTop && !occCur) continue;

        const et = safeEdgeType(targetGrid, r - 1, c, r, c, fn);
        if (et === E.NONE) continue;

        const x = c * cs, y = r * cs;

        // A. 室内マスの北側立ち上がり壁（y から下へ wallH 分）
        if (occCur) {
          const isWashitsu = cCur.type === T.ROOM && (cCur.label === '和室' || cCur.pieceLibId === 'room-wa' || cCur.pieceLibId === 'room-wa2');
          const isBath = cCur.type === T.BATH;
          const isDark = cCur.roomId && plan.darkRooms.has(`id_${cCur.roomId}`) && !plan.isFortress;

          let wallBg = '#f3efe6';
          let wallTopShade = '#e8e2d5';
          let trimCol = '#b4845a';
          if (isWashitsu) { wallBg = '#e3d5b8'; wallTopShade = '#d6c5a3'; trimCol = '#855832'; }
          else if (isBath) { wallBg = '#e0f4fe'; wallTopShade = '#bae6fd'; trimCol = '#7dd3fc'; }
          else if (isDark) { wallBg = '#2c2547'; wallTopShade = '#201a36'; trimCol = '#141024'; }

          if (et === E.DOOR) {
            const doorKind = resolveDoorKind(cTop, cCur, r - 1, c, r, c, plan?.doorPlan?.cellRoomSize);
            const isBathDoor = (doorKind === 'bath_fold' || doorKind === 'bath_slide');
            // 立ち上がり壁＋ドア開口
            const post = getDoorOpeningPost(cs, doorKind);
            const dw = Math.max(4, cs - post * 2);
            ctx.fillStyle = wallBg;
            ctx.fillRect(x, y, post, wallH);
            ctx.fillRect(x + cs - post, y, post, wallH);
            ctx.fillStyle = trimCol;
            ctx.fillRect(x, y + wallH - 3, post, 3);
            ctx.fillRect(x + cs - post, y + wallH - 3, post, 3);

            // 開口奥に北側の本来の部屋の床を描画＋敷居ライン
            if (occTop) {
              const northFloorId = (cTop.type === T.ENTRANCE)
                ? 'floor_wood'
                : getFloorAssetId(cTop, true, plan.darkRooms);
              ctx.save();
              ctx.beginPath();
              ctx.rect(x + post, y, dw, Math.max(1, wallH - 2));
              ctx.clip();
              PixelAssets.drawSprite(ctx, northFloorId, x, y - (cs - wallH), cs, cs);
              ctx.fillStyle = isBathDoor ? 'rgba(15, 23, 42, 0.16)' : 'rgba(15, 23, 42, 0.08)';
              ctx.fillRect(x + post, y, dw, Math.max(2, Math.round(wallH * 0.14)));
              ctx.restore();
              ctx.fillStyle = isBathDoor ? '#94a3b8' : (doorKind === 'fusuma' ? '#78350f' : '#92400e');
              ctx.fillRect(x + post, y + wallH - 2, dw, 2);
              if (isBathDoor) {
                ctx.fillStyle = '#e2e8f0';
                ctx.fillRect(x + post, y + wallH - 2, dw, 1);
              }
            }

            // 縦枠（左右柱：浴室＝アルミサッシ／居室・和室＝木枠）
            ctx.fillStyle = isBathDoor ? '#475569' : '#78350f';
            ctx.fillRect(x + post - 1, y + 1, 2, wallH - 1);
            ctx.fillRect(x + cs - post - 1, y + 1, 2, wallH - 1);

            if (doorKind === 'fusuma') {
              // 和室（横・2.5D北壁）：引き違い襖
              drawSlidingDoorPanelsH(ctx, x, y, post, dw, wallH, SLIDE_THEME_FUSUMA);
            } else if (doorKind === 'bath_slide') {
              // 大型浴室（横・2.5D北壁）：フロストガラス引き戸
              drawSlidingDoorPanelsH(ctx, x, y, post, dw, wallH, SLIDE_THEME_BATH);
            } else if (doorKind === 'bath_fold') {
              // 狭浴室・UB（横・2.5D北壁）：アルミ蛇腹折れ戸
              ctx.fillStyle = '#475569';
              ctx.fillRect(x + post, y, dw, 2);
              const hSide = plan?.doorPlan?.hDoors?.get(`${r},${c}`)?.hingeSide || 'left';
              const sx = hSide === 'right' ? -1 : 1;
              const hx0 = hSide === 'right' ? (x + cs - post - 1) : (x + post + 1);
              const span = Math.min(Math.max(4, dw - 2), Math.max(6, Math.round(dw * 0.58)));
              const stepX = span / 3;
              const foldD = Math.max(3, Math.round(dw * 0.28));
              const inD = Math.max(1, Math.round(foldD * 0.15));
              const by = y + wallH - 1;
              const doorH = Math.max(5, wallH - 2);
              drawStandingAccordionPanels(ctx, [
                { x: hx0, y: by },
                { x: hx0 + sx * stepX, y: by + foldD },
                { x: hx0 + sx * (stepX * 2), y: by + inD },
                { x: hx0 + sx * span, y: by + foldD }
              ], doorH);
            } else {
              // 居室・一般（横・2.5D北壁）：全部屋統一サイズの立体斜め開き戸
              ctx.fillStyle = '#78350f';
              ctx.fillRect(x + post, y, dw, 2);
              const openW = Math.min(Math.max(4, dw - 2), Math.max(5, Math.round(dw * 0.62)));
              const dropY = Math.max(3, Math.round(dw * 0.40));
              const hSide = plan?.doorPlan?.hDoors?.get(`${r},${c}`)?.hingeSide || 'left';
              const lx1 = hSide === 'right' ? (x + cs - post - 1) : (x + post + 1);
              const lx2 = hSide === 'right' ? (lx1 - openW) : (lx1 + openW);
              const dirSign = hSide === 'right' ? -1 : 1;
              const baseFloorY = y + wallH - 1;

              ctx.fillStyle = 'rgba(15, 23, 42, 0.24)';
              ctx.beginPath();
              ctx.moveTo(lx1, baseFloorY);
              ctx.lineTo(lx2 + dirSign * 2, baseFloorY + dropY + 2);
              ctx.lineTo(lx2 - dirSign * 3, baseFloorY + dropY + 3);
              ctx.lineTo(lx1 - dirSign * 1, baseFloorY + 2);
              ctx.closePath();
              ctx.fill();

              ctx.fillStyle = '#b45309';
              ctx.beginPath();
              ctx.moveTo(lx1, y + 1);
              ctx.lineTo(lx2, y + 1 + dropY);
              ctx.lineTo(lx2, baseFloorY + dropY);
              ctx.lineTo(lx1, baseFloorY);
              ctx.closePath();
              ctx.fill();
              ctx.strokeStyle = '#5c2d0c';
              ctx.lineWidth = 1;
              ctx.stroke();

              if (openW >= 8 && (baseFloorY - y) >= 8) {
                ctx.fillStyle = '#92400e';
                ctx.beginPath();
                ctx.moveTo(lx1 + dirSign * 2, y + 4);
                ctx.lineTo(lx2 - dirSign * 2, y + 4 + Math.round(dropY * 0.72));
                ctx.lineTo(lx2 - dirSign * 2, baseFloorY - 3 + Math.round(dropY * 0.72));
                ctx.lineTo(lx1 + dirSign * 2, baseFloorY - 3);
                ctx.closePath();
                ctx.fill();
              }
              const kSize = cs >= 36 ? 2 : 1;
              ctx.fillStyle = '#facc15';
              ctx.fillRect(lx2 - dirSign * (cs >= 36 ? 3 : 2), y + Math.round(wallH * 0.54) + Math.round(dropY * 0.78), kSize, kSize);
            }
          } else {
            // 壁本体（上部陰影＋壁紙＋下端の巾木・長押）
            ctx.fillStyle = wallBg;
            ctx.fillRect(x, y, cs, wallH);
            ctx.fillStyle = wallTopShade;
            ctx.fillRect(x, y, cs, 2);
            if (isBath) {
              ctx.fillStyle = '#bae6fd';
              ctx.fillRect(x + Math.round(cs * 0.5), y, 1, wallH);
              ctx.fillRect(x, y + Math.round(wallH * 0.48), cs, 1);
            }
            ctx.fillStyle = trimCol;
            ctx.fillRect(x, y + wallH - 3, cs, 3);

            // 北向き玄関の外扉
            if (cCur.type === T.ENTRANCE && !occTop && facing && facing.dir === 'top') {
              const dw = Math.round(cs * 0.56);
              const dx = x + Math.round((cs - dw) / 2);
              ctx.fillStyle = '#78350f';
              ctx.fillRect(dx, y + 1, dw, wallH - 1);
              ctx.fillStyle = '#b45309';
              ctx.fillRect(dx + 2, y + 2, dw - 4, wallH - 3);
              ctx.fillStyle = '#facc15';
              ctx.fillRect(dx + dw - 5, y + Math.round(wallH * 0.5), 2, 2);
              if (r - 1 >= 0) {
                ctx.fillStyle = '#dc2626';
                ctx.fillRect(dx + 1, y - Math.max(4, Math.round(cs * 0.14)), dw - 2, Math.max(3, Math.round(cs * 0.1)));
              }
            } else if (et === E.WINDOW) {
              if (isWashitsu) {
                // 和室北壁：内障子（木枠＋明るい生成り和紙＋組子格子）
                const winW = Math.round(cs * 0.62);
                const winX = x + Math.round((cs - winW) / 2);
                const winY = y + 2;
                const winH = Math.max(7, wallH - 5);
                ctx.fillStyle = '#78350f';
                ctx.fillRect(winX - 1, winY, winW + 2, winH);
                ctx.fillStyle = '#fefce8';
                ctx.fillRect(winX, winY + 1, winW, winH - 2);
                ctx.fillStyle = '#fef9c3';
                ctx.fillRect(winX + 1, winY + 2, Math.round(winW * 0.52), Math.max(2, winH - 4));
                ctx.fillStyle = '#b45309';
                ctx.fillRect(winX, winY + 1 + Math.round((winH - 2) * 0.34), winW, 1);
                ctx.fillRect(winX, winY + 1 + Math.round((winH - 2) * 0.67), winW, 1);
                ctx.fillStyle = '#c28550';
                ctx.fillRect(winX + Math.round(winW * 0.17), winY + 1, 1, winH - 2);
                ctx.fillRect(winX + Math.round(winW * 0.33), winY + 1, 1, winH - 2);
                ctx.fillRect(winX + Math.round(winW * 0.67), winY + 1, 1, winH - 2);
                ctx.fillRect(winX + Math.round(winW * 0.83), winY + 1, 1, winH - 2);
                ctx.fillStyle = '#78350f';
                ctx.fillRect(winX + Math.floor(winW / 2) - 1, winY + 1, 2, winH - 2);
              } else {
                // 窓ガラス＋白サッシ＋小さなカーテン両袖！
                const winW = Math.round(cs * 0.58);
                const winX = x + Math.round((cs - winW) / 2);
                const winY = y + 2;
                const winH = Math.max(6, wallH - 5);
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(winX - 1, winY, winW + 2, winH);
                ctx.fillStyle = '#38bdf8';
                ctx.fillRect(winX, winY + 1, winW, winH - 2);
                ctx.fillStyle = '#e0f2fe';
                ctx.fillRect(winX + 2, winY + 2, Math.round(winW * 0.35), Math.max(2, winH - 5));
                // 中央の縦桟＆横桟
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(winX + Math.round(winW / 2), winY + 1, 1, winH - 2);
                ctx.fillRect(winX, winY + Math.round(winH / 2), winW, 1);
                // 左右の小さなカーテン（空室時は外す）
                if (!vacantMode) {
                  ctx.fillStyle = '#f59e0b';
                  ctx.fillRect(winX - 2, winY, 3, winH);
                  ctx.fillRect(winX + winW - 1, winY, 3, winH);
                }
              }
            } else {
              // 壁面装飾（プラン生成時に確定した壁飾りをそのまま描画）
              const key = `${r},${c}`;
              const wd = wallDecoMap.get(key);
              if (wd && wd.type === 'fuji') {
                PixelAssets.drawSprite(ctx, 'wall_fuji', x + 1, y + 2, cs * 2 - 2, wallH - 5);
                skipCells.add(`${r},${c + 1}`);
              } else if (wd && wd.type === 'shower') {
                PixelAssets.drawSprite(ctx, 'wall_shower', x + 1, y + 2, cs - 2, wallH - 4);
              } else if (!vacantMode && wd && wd.type === 'kakejiku') {
                PixelAssets.drawSprite(ctx, 'wall_kakejiku', x, y + 2, cs, wallH - 4);
              } else if (!vacantMode && wd && wd.type === 'scroll_ninja') {
                PixelAssets.drawSprite(ctx, 'wall_scroll_ninja', x, y + 2, cs, wallH - 4);
              } else if (!vacantMode && wd && !skipCells.has(key) && wd.type === 'art_1') {
                PixelAssets.drawSprite(ctx, 'wall_art_1', x, y + 2, cs, wallH - 4);
              } else if (!vacantMode && wd && !skipCells.has(key) && wd.type === 'art_2') {
                PixelAssets.drawSprite(ctx, 'wall_art_2', x, y + 2, cs, wallH - 4);
              } else if (!vacantMode && wd && !skipCells.has(key) && wd.type === 'clock') {
                PixelAssets.drawSprite(ctx, 'wall_clock', x, y + 2, cs, wallH - 5);
              }
            }
          }
        }

        // B. 建物の南端外壁（上が室内、下が屋外/庭）→ 外観外壁＋外窓＋南玄関ドア＆マット！
        if (!occCur && occTop) {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.18)';
          ctx.fillRect(x, y + extH, cs, 3);
          ctx.fillStyle = '#e2e8f0';
          ctx.fillRect(x, y, cs, extH);
          ctx.fillStyle = '#cbd5e1';
          ctx.fillRect(x, y + Math.round(extH * 0.45), cs, 1); // サイディング目地
          ctx.fillStyle = '#64748b';
          ctx.fillRect(x, y + extH - 3, cs, 3); // 基礎ライン

          if (cTop.type === T.ENTRANCE && facing && facing.dir === 'bottom') {
            const dw = Math.round(cs * 0.56);
            const dx = x + Math.round((cs - dw) / 2);
            ctx.fillStyle = '#451a03';
            ctx.fillRect(dx, y, dw, extH);
            ctx.fillStyle = '#b45309';
            ctx.fillRect(dx + 1, y + 1, dw - 2, extH - 2);
            ctx.fillStyle = '#bae6fd';
            ctx.fillRect(dx + Math.round(dw * 0.40), y + 2, Math.max(2, Math.round(dw * 0.20)), extH - 5);
            ctx.fillStyle = '#facc15';
            ctx.fillRect(dx + dw - 4, y + Math.round(extH * 0.5), 2, 2);
            // 外の赤いウェルカムマット
            ctx.fillStyle = '#991b1b';
            ctx.fillRect(dx, y + extH + 1, dw, Math.max(3, Math.round(cs * 0.12)));
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(dx + 1, y + extH + 1, dw - 2, Math.max(2, Math.round(cs * 0.09)));
          } else if (et === E.WINDOW) {
            const isWaTop = isWashitsuDoorCell(cTop);
            const winW = Math.round(cs * 0.56);
            const winX = x + Math.round((cs - winW) / 2);
            const winH = Math.max(5, extH - 5);
            if (isWaTop) {
              const stBadge = stageObj?.client?.typeBadge || '';
              const useLattice = Boolean(
                plan?.comboNames?.has('古き良き日本家屋') ||
                stBadge.includes('和') || stBadge.includes('庭園') || stBadge.includes('シニア') ||
                stBadge.includes('二世帯') || stBadge.includes('忍') || stBadge.includes('仙') ||
                (((stageObj?.id || 0) + (cTop.roomId || 0)) % 3 === 0)
              );
              if (useLattice) {
                // 案B：和風の縦木格子（面格子）窓
                ctx.fillStyle = '#5c371e';
                ctx.fillRect(winX - 1, y + 2, winW + 2, winH);
                const upperH = Math.floor((winH - 2) / 2);
                ctx.fillStyle = '#e0f2fe';
                ctx.fillRect(winX, y + 3, winW, upperH);
                ctx.fillStyle = '#fef9c3';
                ctx.fillRect(winX, y + 3 + upperH, winW, (winH - 2) - upperH);
                ctx.fillStyle = '#92400e';
                ctx.fillRect(winX, y + 3 + upperH, winW, 1);
                ctx.fillStyle = '#78350f';
                for (let lx = winX + 2; lx < winX + winW - 1; lx += 3) {
                  ctx.fillRect(lx, y + 3, 1, winH - 2);
                }
              } else {
                // 案A：濃茶サッシ＋ガラス越し内障子透け
                ctx.fillStyle = '#5c371e';
                ctx.fillRect(winX - 1, y + 2, winW + 2, winH);
                ctx.fillStyle = '#f5f2dc';
                ctx.fillRect(winX, y + 3, winW, winH - 2);
                ctx.fillStyle = '#cbd5e1';
                ctx.fillRect(winX, y + 3 + Math.floor((winH - 2) / 2), winW, 1);
                ctx.fillRect(winX + Math.round(winW * 0.25), y + 3, 1, winH - 2);
                ctx.fillRect(winX + Math.round(winW * 0.75), y + 3, 1, winH - 2);
                ctx.fillStyle = '#78350f';
                ctx.fillRect(winX + Math.floor(winW / 2), y + 3, 1, winH - 2);
                ctx.fillStyle = 'rgba(56, 189, 248, 0.28)';
                ctx.fillRect(winX, y + 3, winW, winH - 2);
                ctx.fillStyle = 'rgba(224, 242, 254, 0.72)';
                ctx.fillRect(winX + 2, y + 4, Math.round(winW * 0.36), Math.max(2, winH - 5));
              }
              ctx.fillStyle = '#475569';
              ctx.fillRect(winX - 1, y + 2 + winH, winW + 2, 1);
            } else {
              // 洋室・LDK 等の外観窓：濃灰外枠＋明るいアルミサッシ枠＋引き違い中桟＋水切り
              ctx.fillStyle = '#334155';
              ctx.fillRect(winX - 1, y + 2, winW + 2, winH);
              ctx.fillStyle = '#e2e8f0';
              ctx.fillRect(winX, y + 3, winW, winH - 2);
              const midX = winX + Math.floor(winW / 2);
              if (winW >= 8 && winH >= 7) {
                const glassX = winX + 1;
                const glassY = y + 4;
                const glassW = winW - 2;
                const glassH = winH - 4;
                ctx.fillStyle = '#38bdf8';
                ctx.fillRect(glassX, glassY, glassW, glassH);
                ctx.fillStyle = '#bae6fd';
                ctx.fillRect(glassX + 1, glassY + 1, Math.max(2, Math.floor((glassW - 2) * 0.42)), Math.max(2, glassH - 2));
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(glassX + 2, glassY + 1, Math.max(1, Math.floor(glassW * 0.16)), 1);
                ctx.fillStyle = '#7dd3fc';
                ctx.fillRect(midX + 2, glassY + 1, Math.max(1, Math.floor(glassW * 0.22)), Math.max(1, Math.floor(glassH * 0.45)));
                ctx.fillStyle = '#cbd5e1';
                ctx.fillRect(midX - 1, y + 3, 2, winH - 2);
                ctx.fillStyle = '#64748b';
                ctx.fillRect(midX, y + 3, 1, winH - 2);
              } else {
                ctx.fillStyle = '#38bdf8';
                ctx.fillRect(winX + 1, y + 3, Math.max(2, winW - 2), Math.max(2, winH - 2));
                ctx.fillStyle = '#bae6fd';
                ctx.fillRect(winX + 1, y + 3, Math.max(1, Math.floor(winW * 0.35)), Math.max(1, winH - 3));
                ctx.fillStyle = '#cbd5e1';
                ctx.fillRect(midX, y + 3, 1, winH - 2);
              }
              ctx.fillStyle = '#94a3b8';
              ctx.fillRect(winX - 1, y + 2 + winH, winW + 2, 1);
            }
          }
        }
      }
    }

    // C. 東西向きの玄関外扉＋ウェルカムマット
    if (stageObj && stageObj.entranceCells && facing && (facing.dir === 'left' || facing.dir === 'right')) {
      for (const ec of stageObj.entranceCells) {
        const ex = (facing.dir === 'left') ? ec.c * cs : (ec.c + 1) * cs;
        const ey = ec.r * cs;
        const dh = Math.round(cs * 0.56);
        const dy = ey + Math.round((cs - dh) / 2);
        const matW = Math.max(4, Math.round(cs * 0.14));
        const mx = (facing.dir === 'left') ? ex - matW - 2 : ex + 2;
        ctx.fillStyle = '#991b1b';
        ctx.fillRect(mx, dy, matW, dh);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(mx + 1, dy + 1, Math.max(1, matW - 2), dh - 2);
        // 玄関ドア枠
        ctx.fillStyle = '#b45309';
        ctx.fillRect(ex - 2, dy, 4, dh);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(ex - 1, dy + dh - 4, 2, 2);
      }
    }
  }

  function resolveLocationEnvTileId(r, c, loc, lotBounds, timeMs) {
    if (!loc || !lotBounds) return 'floor_obstacle';
    if (loc.id === 'park_south') {
      if ((r * 7 + c * 13) % 5 === 0) return 'env_park_tree';
      if ((loc.side === 'south' && r === lotBounds.maxR + 1 && (r + c) % 2 === 0) || (r * 3 + c * 5) % 4 === 0) {
        return 'env_park_path';
      }
      return 'env_park_grass';
    }
    if (loc.id === 'ocean_view') {
      if (loc.side === 'south' && r === lotBounds.maxR + 1) return 'env_shore_south';
      if (loc.side === 'north' && r === lotBounds.minR - 1) return 'env_shore_north';
      if (loc.side === 'west' && c === lotBounds.minC - 1) return 'env_shore_west';
      if (loc.side === 'east' && c === lotBounds.maxC + 1) return 'env_shore_east';
      const wavePhase = Math.floor(((timeMs || 0) / 520) + r + c) % 2;
      return wavePhase === 0 ? 'env_ocean_0' : 'env_ocean_1';
    }
    if (loc.id === 'highway_road') {
      return (loc.side === 'north' || loc.side === 'south') ? 'env_road_h' : 'env_road_v';
    }
    if (loc.id === 'sakura_alley') {
      return ((r * 5 + c * 7) % 3 === 0) ? 'env_sakura_tree' : 'env_sakura_path';
    }
    if (loc.id === 'station_front') {
      return ((r * 3 + c * 11) % 6 === 0) ? 'env_station_plaza' : 'env_station_tile';
    }
    return 'floor_obstacle';
  }

  function drawPixelBoard(ctx, targetGrid, cs, opts = {}) {
    if (global.PixelAssets && global.PixelAssets.initAllAssets) {
      global.PixelAssets.initAllAssets();
    }
    const gSize = targetGrid.length;
    const {
      showFurniture = true,
      vacantMode = false,
      enable25DWalls = false,
      showBlueprintOverlay = false,
      showSolidRedOverlay = false,
      showRoomLabels = false,
      selectedDemolishTarget = null,
      demolishMode = false,
      furniturePlan = null,
      furnitureElapsedMs = 99999,
      timeMs = 0,
      combos = [],
      stageObj = (typeof STAGE !== 'undefined' ? STAGE : null)
    } = opts;

    const s2 = global.DXStage2 || null;
    const loc = stageObj && stageObj.location;
    const lotBounds = (s2 && stageObj) ? s2.getLotBounds(stageObj, targetGrid) : null;

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    const { visited } = computeVisitedSet(targetGrid, stageObj);
    const plan = furniturePlan || buildFurniturePlan(targetGrid, combos, visited, stageObj);
    const fp = calcFootprintStats(targetGrid);
    const bbox = (fp && fp.hasPlacedPiece) ? fp.bbox : null;
    const comboNames = plan.comboNames || new Set();
    const isLongCorridor = comboNames.has('ロングコリドー');
    const isFoyer = comboNames.has('大ホワイエ');
    const facing = (typeof getEntranceFacing === 'function') ? getEntranceFacing(stageObj, targetGrid) : { arrow: '▼', dir: 'bottom' };

    // 玄関セルの下駄箱向きを調べて靴の配置と干渉しないようにする
    const entBoxSnapMap = new Map();
    if (plan && plan.items) {
      for (const it of plan.items) {
        if (it.assetId === 'furn_shoesbox_slim') {
          entBoxSnapMap.set(`${it.r},${it.c}`, it.snap);
        }
      }
    }

    // 1. 床タイル描画
    for (let r = 0; r < gSize; r++) {
      for (let c = 0; c < gSize; c++) {
        const cell = targetGrid[r]?.[c];
        const inBox = bbox && r >= bbox.minR && r <= bbox.maxR && c >= bbox.minC && c <= bbox.maxC;
        const key = cell?.roomId ? `id_${cell.roomId}` : null;
        const isDarkSealed = key && plan.darkRooms.has(key) && (!visited.has(`${r},${c}`) && !plan.isFortress);
        const x = c * cs, y = r * cs;

        if (cell && cell.type === T.ENTRANCE) {
          drawEntranceFloorAndShoes(ctx, targetGrid, r, c, cs, facing, enable25DWalls, entBoxSnapMap.get(`${r},${c}`) || null, !vacantMode);
        } else {
          let floorId = getFloorAssetId(cell, inBox, plan.darkRooms);
          if (cell && cell.type === T.OBSTACLE && loc && s2 && lotBounds && s2.isCellInLocationBand(r, c, loc, lotBounds)) {
            floorId = resolveLocationEnvTileId(r, c, loc, lotBounds, timeMs);
          } else if (isDarkSealed && cell && cell.type !== T.CORRIDOR) {
            floorId = 'floor_darkness';
          }
          PixelAssets.drawSprite(ctx, floorId, x, y, cs, cs);
        }

        // 廊下コンボの床装飾（大ホワイエ／ロングコリドー）
        if (!vacantMode && cell && cell.type === T.CORRIDOR) {
          if (isFoyer) {
            const upSame = targetGrid[r - 1]?.[c]?.type === T.CORRIDOR;
            const dnSame = targetGrid[r + 1]?.[c]?.type === T.CORRIDOR;
            const lfSame = targetGrid[r]?.[c - 1]?.type === T.CORRIDOR;
            const rtSame = targetGrid[r]?.[c + 1]?.type === T.CORRIDOR;
            if (upSame && dnSame && lfSame && rtSame) {
              PixelAssets.drawSprite(ctx, 'furn_rug_foyer', x, y, cs, cs);
            }
          }
          if (isLongCorridor) {
            PixelAssets.drawSprite(ctx, 'furn_rug_red', x, y, cs, cs);
          }
        }

        // ガラス張りハウス / 日当たり良好：斜めの日光差し込み
        const isSunnyCell = plan.sunnyRoomKeys && key && plan.sunnyRoomKeys.has(key);
        if ((plan.isGlassHouse || isSunnyCell) && cell && cell.type !== T.EMPTY && cell.type !== T.GARDEN && cell.type !== T.OBSTACLE) {
          ctx.fillStyle = plan.isGlassHouse ? 'rgba(254, 249, 195, 0.28)' : 'rgba(254, 240, 138, 0.20)';
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + cs * 0.55, y);
          ctx.lineTo(x + cs, y + cs);
          ctx.lineTo(x + cs * 0.45, y + cs);
          ctx.closePath();
          ctx.fill();
        }

        // 要塞化／封印されし闇：暗闇オーバーレイ
        if (key && plan.darkRooms.has(key) && cell.type !== T.ENTRANCE) {
          ctx.fillStyle = plan.isFortress ? 'rgba(15, 23, 42, 0.26)' : 'rgba(15, 10, 32, 0.44)';
          ctx.fillRect(x, y, cs, cs);
        }
      }
    }

    // 1.5 敷地境界線＆境界杭（自分の敷地の未使用砂利と周辺OBSTACLEを明確に分離）
    ctx.save();
    for (let r = 0; r < gSize; r++) {
      for (let c = 0; c < gSize; c++) {
        const curObs = targetGrid[r]?.[c]?.type === T.OBSTACLE;
        const x = c * cs, y = r * cs;
        if (c + 1 < gSize) {
          const rightObs = targetGrid[r]?.[c + 1]?.type === T.OBSTACLE;
          if (curObs !== rightObs) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
            ctx.fillRect(x + cs - 1, y, 2, cs);
            ctx.fillStyle = '#64748b';
            ctx.fillRect(x + cs - 1, y + Math.round(cs * 0.45), 2, Math.max(2, Math.round(cs * 0.12)));
          }
        }
        if (r + 1 < gSize) {
          const downObs = targetGrid[r + 1]?.[c]?.type === T.OBSTACLE;
          if (curObs !== downObs) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
            ctx.fillRect(x, y + cs - 1, cs, 2);
            ctx.fillStyle = '#64748b';
            ctx.fillRect(x + Math.round(cs * 0.45), y + cs - 1, Math.max(2, Math.round(cs * 0.12)), 2);
          }
        }
      }
    }

    // 1.6 立地環境演出（幹線道路の車走行／桜並木の花びら）
    if (loc && s2 && lotBounds) {
      if (loc.id === 'highway_road') {
        const horiz = (loc.side === 'north' || loc.side === 'south');
        const bandRows = [];
        const bandCols = [];
        for (let r = 0; r < gSize; r++) {
          for (let c = 0; c < gSize; c++) {
            if (targetGrid[r]?.[c]?.type === T.OBSTACLE && s2.isCellInLocationBand(r, c, loc, lotBounds)) {
              if (!bandRows.includes(r)) bandRows.push(r);
              if (!bandCols.includes(c)) bandCols.push(c);
            }
          }
        }
        if (horiz && bandRows.length > 0) {
          const roadR = loc.side === 'north' ? bandRows[bandRows.length - 1] : bandRows[0];
          const cy1 = roadR * cs;
          const phase1 = ((timeMs || 1200) * 0.0022) % (gSize + 2);
          const phase2 = ((timeMs || 3800) * 0.0017 + 5.5) % (gSize + 2);
          PixelAssets.drawSprite(ctx, 'env_car_red_h', (phase1 - 1) * cs, cy1, cs, cs);
          PixelAssets.drawSprite(ctx, 'env_car_blue_h', (gSize - phase2) * cs, cy1, cs, cs);
        } else if (!horiz && bandCols.length > 0) {
          const roadC = loc.side === 'west' ? bandCols[bandCols.length - 1] : bandCols[0];
          const cx1 = roadC * cs;
          const phase1 = ((timeMs || 1400) * 0.0020) % (gSize + 2);
          const phase2 = ((timeMs || 4200) * 0.0016 + 4.8) % (gSize + 2);
          PixelAssets.drawSprite(ctx, 'env_car_red_v', cx1, (phase1 - 1) * cs, cs, cs);
          PixelAssets.drawSprite(ctx, 'env_car_blue_v', cx1, (gSize - phase2) * cs, cs, cs);
        }
      } else if (loc.id === 'sakura_alley' && timeMs > 0) {
        ctx.fillStyle = 'rgba(249, 168, 212, 0.85)';
        for (let r = 0; r < gSize; r++) {
          for (let c = 0; c < gSize; c++) {
            if (targetGrid[r]?.[c]?.type === T.OBSTACLE && s2.isCellInLocationBand(r, c, loc, lotBounds) && (r + c) % 2 === 0) {
              const px = (c + 0.2 + ((Math.sin(timeMs / 500 + r + c) + 1) * 0.3)) * cs;
              const py = (r + (((timeMs / 1800) + r * 0.3 + c * 0.2) % 0.85)) * cs;
              ctx.fillRect(Math.round(px), Math.round(py), Math.max(2, cs * 0.09), Math.max(2, cs * 0.07));
            }
          }
        }
      }
    }
    ctx.restore();

    // 玄関直風呂のつるっと水たまり（床層）
    if (showFurniture && !vacantMode && Array.isArray(plan.badSpots)) {
      for (const sp of plan.badSpots) {
        if (sp.kind !== 'puddle') continue;
        const px = (sp.c + 0.5) * cs;
        const py = (sp.r + 0.55) * cs;
        ctx.fillStyle = 'rgba(56, 189, 248, 0.42)';
        ctx.beginPath();
        ctx.ellipse(px, py, cs * 0.28, cs * 0.14, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(224, 242, 254, 0.65)';
        ctx.fillRect(Math.round(px - cs * 0.1), Math.round(py - 2), Math.max(2, cs * 0.12), 2);
      }
    }

    // 2. パズル中オーバーレイ（マス目・未配置ガイド）
    if (showBlueprintOverlay) {
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.16)';
      ctx.lineWidth = 0.8;
      for (let r = 0; r < gSize; r++) {
        for (let c = 0; c < gSize; c++) {
          ctx.strokeRect(c * cs, r * cs, cs, cs);
        }
      }
    }

    // 2.5 完成時専用：立ち上がり北壁・外観壁・壁装飾
    if (enable25DWalls) {
      draw25DWallsAndDeco(ctx, targetGrid, cs, plan, stageObj, facing, vacantMode);
    }

    // 3. 家具描画（ポップバウンス & ピクセル実寸ベースの壁・角ピタ寄せ対応）
    if (showFurniture && plan.items) {
      const fn = typeof edgeType === 'function' ? edgeType : null;
      const orderedItems = [
        ...plan.items.filter(it => it.isFloorRug),
        ...plan.items.filter(it => !it.isFloorRug)
      ];

      const computeTightOffset = (item, drawAssetId) => {
        const bw = (item.wCells || 1) * cs;
        const bh = (item.hCells || 1) * cs;
        const wc = item.wCells || 1;
        const hc = item.hCells || 1;
        const isWall = (e) => (e === E.WALL || e === E.WINDOW);

        let topAnyWall = false, topHasDoor = false, topHasWindow = false, topAllWall = true;
        let botHasDoor = false, botAllWall = true;
        let leftHasDoor = false, leftAllWall = true;
        let rightHasDoor = false, rightAllWall = true;

        for (let dc = 0; dc < wc; dc++) {
          const t = safeEdgeType(targetGrid, item.r - 1, item.c + dc, item.r, item.c + dc, fn);
          const b = safeEdgeType(targetGrid, item.r + hc - 1, item.c + dc, item.r + hc, item.c + dc, fn);
          if (t === E.WALL || t === E.WINDOW || t === E.DOOR) topAnyWall = true;
          if (t === E.DOOR) topHasDoor = true;
          if (t === E.WINDOW) topHasWindow = true;
          if (!isWall(t)) topAllWall = false;
          if (b === E.DOOR) botHasDoor = true;
          if (!isWall(b)) botAllWall = false;
        }
        for (let dr = 0; dr < hc; dr++) {
          const l = safeEdgeType(targetGrid, item.r + dr, item.c - 1, item.r + dr, item.c, fn);
          const ri = safeEdgeType(targetGrid, item.r + dr, item.c + wc - 1, item.r + dr, item.c + wc, fn);
          if (l === E.DOOR) leftHasDoor = true;
          if (!isWall(l)) leftAllWall = false;
          if (ri === E.DOOR) rightHasDoor = true;
          if (!isWall(ri)) rightAllWall = false;
        }

        const hasNorthWallDeco = Boolean(plan?.northWallDecoCells?.has(`${item.r},${item.c}`));

        if (item.assetId.startsWith('furn_futon')) {
          const boundsF = getSpriteContentBounds(drawAssetId);
          if (!boundsF) {
            return { offX: 0, offY: topAnyWall ? Math.round(cs * 0.22) : 0 };
          }
          const sxF = bw / boundsF.w;
          const syF = bh / boundsF.h;
          const bLeftF = boundsF.minX * sxF;
          const bRightF = (boundsF.maxX + 1) * sxF;
          const bTopF = boundsF.minY * syF;
          const bBotF = (boundsF.maxY + 1) * syF;
          const rawTF = Math.round(cs * 0.15);
          const halfTF = Math.max(4, rawTF % 2 === 0 ? rawTF : rawTF + 1) / 2;
          const wallHF = Math.max(9, Math.round(cs * 0.42));
          const reqTopF = hasNorthWallDeco
            ? Math.round(wallHF * 0.90)
            : (topAnyWall ? Math.round(wallHF * 0.65) : 0);
          let offXF = 0;
          const minLeftF = (leftAllWall || leftHasDoor) ? (halfTF + 2) : 1;
          const maxRightF = (rightAllWall || rightHasDoor) ? (bw - halfTF - 2) : (bw - 1);
          if (bLeftF + offXF < minLeftF) offXF = Math.ceil(minLeftF - bLeftF);
          if (bRightF + offXF > maxRightF) offXF = Math.floor(maxRightF - bRightF);
          let offYF = 0;
          if (reqTopF > 0 && bTopF + offYF < reqTopF) {
            offYF = Math.ceil(reqTopF - bTopF);
          }
          const maxBotF = (botAllWall || botHasDoor) ? (bh - halfTF - 3) : (bh - 2);
          if (bBotF + offYF > maxBotF) {
            offYF = Math.floor(maxBotF - bBotF);
          }
          if (reqTopF > 0 && bTopF + offYF < Math.round(wallHF * 0.45)) {
            offYF = Math.ceil(Math.round(wallHF * 0.45) - bTopF);
          }
          return { offX: offXF, offY: offYF };
        }

        const isCenterOnly = !item.roomKey || item.floating || item.isFloorRug || item.snap === 'center' || CENTER_SNAP_ASSETS.has(item.assetId);
        if (isCenterOnly) {
          const boundsC = getSpriteContentBounds(drawAssetId);
          let offYC = (topAnyWall && !item.floating && !item.isFloorRug) ? Math.round(cs * (hasNorthWallDeco ? 0.34 : 0.20)) : 0;
          if (boundsC && !item.floating && !item.isFloorRug) {
            const syC = bh / boundsC.h;
            const rawTC = Math.round(cs * 0.15);
            const halfTC = Math.max(4, rawTC % 2 === 0 ? rawTC : rawTC + 1) / 2;
            const wallHC = Math.max(9, Math.round(cs * 0.42));
            const bTopC = boundsC.minY * syC;
            const bBotC = (boundsC.maxY + 1) * syC;
            if (hasNorthWallDeco && bTopC + offYC < Math.round(wallHC * 0.88)) {
              offYC = Math.ceil(Math.round(wallHC * 0.88) - bTopC);
            }
            const maxBotC = (botAllWall || botHasDoor) ? (bh - halfTC - 1) : (bh - 1);
            if (bBotC + offYC > maxBotC) {
              offYC = Math.floor(maxBotC - bBotC);
            }
            const minTopC = (topAllWall || topHasDoor) ? Math.round(wallHC * 0.40) : 1;
            if (bTopC + offYC < minTopC) {
              offYC = Math.ceil(minTopC - bTopC);
            }
          }
          return { offX: 0, offY: offYC };
        }

        const bounds = getSpriteContentBounds(drawAssetId);
        if (!bounds) {
          return { offX: 0, offY: topAnyWall ? Math.round(cs * 0.22) : 0 };
        }

        const sx = bw / bounds.w;
        const sy = bh / bounds.h;
        const bodyLeft = bounds.minX * sx;
        const bodyRight = (bounds.maxX + 1) * sx;
        const bodyTop = bounds.minY * sy;
        const bodyBot = (bounds.maxY + 1) * sy;

        const rawT = Math.round(cs * 0.15);
        const wallThick = Math.max(4, rawT % 2 === 0 ? rawT : rawT + 1);
        const halfT = wallThick / 2;
        const wallH = Math.max(9, Math.round(cs * 0.42));
        const bodyH = bodyBot - bodyTop;
        const maxBot = (botAllWall || botHasDoor) ? (bh - halfT) : (bh - 1);

        const westTargetX = halfT;
        const eastTargetRight = bw - halfT;
        const isSideSnap = (item.snap === 'west' || item.snap === 'east');
        const floorLineY = Math.min(wallH - 1, Math.max(halfT, Math.floor(maxBot - bodyH)));
        const northTargetY = hasNorthWallDeco
          ? Math.min(Math.round(wallH * 0.90), Math.max(halfT, Math.floor(maxBot - bodyH)))
          : ((topHasWindow || isSideSnap) ? floorLineY : Math.round(wallH * 0.44));
        const southTargetBot = bh - halfT;

        let offX = 0;
        let offY = 0;

        if (item.snap === 'west' && leftAllWall && !leftHasDoor) {
          offX = Math.round(westTargetX - bodyLeft);
        } else if (item.snap === 'east' && rightAllWall && !rightHasDoor) {
          offX = Math.round(eastTargetRight - bodyRight);
        } else if (leftAllWall && !leftHasDoor && !rightAllWall && !rightHasDoor) {
          offX = Math.round(westTargetX - bodyLeft);
        } else if (rightAllWall && !rightHasDoor && !leftAllWall && !leftHasDoor) {
          offX = Math.round(eastTargetRight - bodyRight);
        }

        if (item.assetId === 'furn_shoesbox_slim') {
          if (item.snap === 'south' && botAllWall && !botHasDoor) {
            offY = Math.round(southTargetBot - bodyBot);
          } else if (topAllWall && !topHasDoor) {
            offY = Math.round(northTargetY - bodyTop);
          } else if (topAnyWall) {
            offY = Math.round(cs * 0.18);
          }
        } else if ((item.snap === 'south' && botAllWall && !botHasDoor) || (topHasDoor && botAllWall && !botHasDoor)) {
          offY = Math.round(southTargetBot - bodyBot);
        } else if (item.snap === 'north' && topAllWall && !topHasDoor) {
          offY = Math.round(northTargetY - bodyTop);
        } else if (botAllWall && !botHasDoor && !topAllWall) {
          offY = Math.round(southTargetBot - bodyBot);
        } else if (topAllWall && !topHasDoor) {
          offY = Math.round(northTargetY - bodyTop);
        } else if (topHasDoor) {
          offY = Math.max(0, Math.round(wallH * 0.88 - bodyTop));
        }

        const minLeft = (leftAllWall || leftHasDoor) ? halfT : 1;
        const maxRight = (rightAllWall || rightHasDoor) ? (bw - halfT) : (bw - 1);
        if (bodyLeft + offX < minLeft) offX = Math.ceil(minLeft - bodyLeft);
        if (bodyRight + offX > maxRight) offX = Math.floor(maxRight - bodyRight);

        const rawMinTop = hasNorthWallDeco
          ? Math.round(wallH * 0.88)
          : (topHasWindow
            ? (wallH - 1)
            : ((topAllWall || topHasDoor) ? Math.max(halfT, Math.round(wallH * (isSideSnap ? 0.88 : 0.38))) : 1));
        const minTop = Math.min(rawMinTop, Math.max(1, Math.floor(maxBot - bodyH)));
        if (bodyBot + offY > maxBot) offY = Math.floor(maxBot - bodyBot);
        if (bodyTop + offY < minTop) offY = Math.ceil(minTop - bodyTop);

        return { offX, offY };
      };

      for (const item of orderedItems) {
        if (vacantMode && !BUILTIN_ASSET_IDS.has(item.assetId)) continue;
        const localMs = item.isFloorRug ? 99999 : (furnitureElapsedMs - (item.delayMs || 0));
        if (localMs <= 0) continue;

        const dur = 240;
        let t = Math.min(1, localMs / dur);
        let scale = 1;
        let yBounce = 0;
        if (t < 1) {
          if (t < 0.6) {
            const p = t / 0.6;
            scale = 0.15 + 1.03 * Math.sin(p * Math.PI * 0.5);
          } else {
            const p = (t - 0.6) / 0.4;
            scale = 1.18 - 0.18 * Math.sin(p * Math.PI * 0.5);
          }
          yBounce = -Math.sin(t * Math.PI) * cs * 0.22;
        }

        // 向き別スプライト解決（west / east / north / south）
        let drawAssetId = item.assetId;
        if (item.snap && PixelAssets.getSprite(`${item.assetId}_${item.snap}`)) {
          drawAssetId = `${item.assetId}_${item.snap}`;
        }

        let bx, by, bw, bh;
        if (enable25DWalls && item.centerInRoom) {
          const b = item.centerInRoom;
          const rawT = Math.round(cs * 0.15);
          const halfT = Math.max(4, rawT % 2 === 0 ? rawT : rawT + 1) / 2;
          const wallH = Math.max(9, Math.round(cs * 0.42));
          let hasTopWall = false;
          for (let cc = b.minC; cc <= b.maxC; cc++) {
            const topEt = safeEdgeType(targetGrid, b.minR - 1, cc, b.minR, cc, fn);
            if (topEt === E.WALL || topEt === E.WINDOW || topEt === E.DOOR) {
              hasTopWall = true;
              break;
            }
          }
          const floorTop = b.minR * cs + (hasTopWall ? wallH : halfT);
          const floorBot = (b.maxR + 1) * cs - halfT;
          const floorLeft = b.minC * cs + halfT;
          const floorRight = (b.maxC + 1) * cs - halfT;
          const spr = PixelAssets.getSprite(drawAssetId);
          const targetW = Math.round((spr ? spr.width : 64) * (cs / 48));
          const targetH = Math.round((spr ? spr.height : 52) * (cs / 48));
          const availW = Math.max(16, floorRight - floorLeft - 4);
          const availH = Math.max(16, floorBot - floorTop - 4);
          const fitScale = Math.min(1, availW / targetW, availH / targetH);
          bw = Math.round(targetW * fitScale);
          bh = Math.round(targetH * fitScale);
          bx = Math.round((floorLeft + floorRight - bw) / 2);
          by = Math.round((floorTop + floorBot - bh) / 2);
        } else {
          // 壁寄せ・2.5D北壁への食い込み防止オフセット
          let offX = 0, offY = 0;
          if (enable25DWalls) {
            const tightOff = computeTightOffset(item, drawAssetId);
            offX = tightOff.offX;
            offY = tightOff.offY;
          }
          bx = item.c * cs + offX;
          by = item.r * cs + offY;
          bw = (item.wCells || 1) * cs;
          bh = (item.hCells || 1) * cs;
        }
        const cx = bx + bw / 2;
        const cy = by + bh / 2;

        if (t < 1) {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
          ctx.beginPath();
          ctx.ellipse(cx, by + bh * 0.85, bw * 0.3 * Math.min(1, scale), bh * 0.11, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.save();
        ctx.translate(cx, cy + yBounce);
        ctx.scale(scale, scale);
        PixelAssets.drawSprite(ctx, drawAssetId, -bw / 2, -bh / 2, bw, bh);
        ctx.restore();

        if (!vacantMode && t >= 1 && item.steam) {
          const phase = ((timeMs / 450) + item.c * 0.4) % 1;
          ctx.fillStyle = `rgba(255, 255, 255, ${0.55 * (1 - phase)})`;
          const sx = cx - 4 + Math.sin(timeMs / 300 + item.r) * 3;
          const sy = by + bh * 0.35 - phase * (cs * 0.35);
          ctx.fillRect(Math.round(sx), Math.round(sy), Math.max(2, cs * 0.08), Math.max(2, cs * 0.08));
          ctx.fillRect(Math.round(sx + 6), Math.round(sy + 4), Math.max(2, cs * 0.06), Math.max(2, cs * 0.06));
        }
        if (!vacantMode && t >= 1 && item.candle) {
          const flicker = 0.2 + 0.1 * Math.sin(timeMs / 110);
          ctx.fillStyle = `rgba(251, 146, 60, ${flicker})`;
          ctx.beginPath();
          ctx.arc(cx, cy - cs * 0.1, cs * 0.55, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 4. 境界壁（天面・縦壁・室内ドア）描画（base→top の2パスで壁角をシームレス接続）
    for (const pass of ['base', 'top']) {
      for (let r = 0; r < gSize; r++) {
        for (let c = 0; c < gSize; c++) {
          const x = c * cs, y = r * cs;
          drawPixelWallEdge(ctx, x + cs, y, x + cs, y + cs, r, c, r, c + 1, 'v', cs, targetGrid, showSolidRedOverlay, enable25DWalls, pass, plan.doorPlan);
          drawPixelWallEdge(ctx, x, y + cs, x + cs, y + cs, r, c, r + 1, c, 'h', cs, targetGrid, showSolidRedOverlay, enable25DWalls, pass, plan.doorPlan);
          if (r === 0) drawPixelWallEdge(ctx, x, y, x + cs, y, -1, c, r, c, 'h', cs, targetGrid, showSolidRedOverlay, enable25DWalls, pass, plan.doorPlan);
          if (c === 0) drawPixelWallEdge(ctx, x, y, x, y + cs, r, -1, r, c, 'v', cs, targetGrid, showSolidRedOverlay, enable25DWalls, pass, plan.doorPlan);
        }
      }
    }

    // 4.2 パズル中のみ：リノベ固定躯体・解体可能部屋のガイド枠
    if (showSolidRedOverlay && s2) {
      s2.drawBlueprintRenovationOverlays(ctx, targetGrid, cs, {
        selectedDemolishTarget,
        demolishMode,
        showBadges: true
      });
    }

    // 4.5 バッドコンボ視覚エフェクト（食欲減退の悪臭モヤ / スケルトンバス視線）
    if (showFurniture && !vacantMode && enable25DWalls && Array.isArray(plan.badSpots)) {
      const odorInverted = stageObj?.customCombo?.name === '食欲減退' && stageObj.customCombo.isNegativeInversion;
      for (const sp of plan.badSpots) {
        if (sp.kind === 'odor') {
          const cx = (sp.c + 0.5) * cs;
          const cy = (sp.r + 0.5) * cs;
          for (let k = 0; k < 3; k++) {
            const ph = ((timeMs / 650) + k * 0.33) % 1;
            const ox = cx + Math.sin(timeMs / 240 + k * 2.1) * (cs * 0.14);
            const oy = cy - ph * (cs * 0.42);
            ctx.fillStyle = odorInverted
              ? `rgba(244, 114, 182, ${(1 - ph) * 0.72})`
              : `rgba(132, 204, 22, ${(1 - ph) * 0.65})`;
            ctx.beginPath();
            ctx.arc(ox, oy, Math.max(2, cs * 0.09), 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (sp.kind === 'sight') {
          ctx.save();
          ctx.strokeStyle = `rgba(244, 63, 94, ${0.35 + 0.25 * Math.sin(timeMs / 220)})`;
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo((sp.c1 + 0.5) * cs, (sp.r1 + 0.5) * cs);
          ctx.lineTo((sp.c2 + 0.5) * cs, (sp.r2 + 0.5) * cs);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // 5. パズル中の実物プレビュー時のみ、外向き補助矢印を表示（完成後はドアとマットで直感化）
    if (!enable25DWalls && stageObj && stageObj.entranceCells) {
      const ec0 = stageObj.entranceCells[0];
      if (ec0) {
        const ex = ec0.c * cs + cs * 0.5;
        const ey = ec0.r * cs + cs * 0.85;
        ctx.font = `bold ${Math.max(8, Math.round(cs * 0.22))}px "Zen Kaku Gothic New", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(15,23,42,0.75)';
        ctx.lineWidth = 2.5;
        ctx.strokeText(facing.arrow, ex, ey);
        ctx.fillStyle = '#fef08a';
        ctx.fillText(facing.arrow, ex, ey);
      }
    }

    // 6. パズル中・空室完成図の部屋名ラベル
    if (showBlueprintOverlay || showRoomLabels) {
      const lblFontSize = showBlueprintOverlay
        ? Math.max(8, Math.round(cs * 0.22))
        : Math.max(8, Math.round(cs * 0.29));
      const fallbackNames = { ldk: 'LDK', room: '洋室', bath: '浴室', toilet: 'トイレ', washroom: '洗面', closet: '収納', corridor: '廊下' };
      ctx.font = `bold ${lblFontSize}px "Zen Kaku Gothic New", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      for (const rm of plan.rooms) {
        if (rm.type === T.CORRIDOR && rm.cells.length <= 1) continue;
        const ax = (rm.cells.reduce((s, p) => s + p.c, 0) / rm.cells.length + 0.5) * cs;
        let ay = (rm.cells.reduce((s, p) => s + p.r, 0) / rm.cells.length + 0.5) * cs;
        if (enable25DWalls && rm.minR === rm.maxR) ay += cs * 0.14;
        const entTxt = (showRoomLabels && !showBlueprintOverlay) ? `${facing.arrow}玄関` : '玄関';
        const txt = rm.type === T.ENTRANCE ? entTxt : (rm.label || fallbackNames[rm.type] || '');
        if (!txt) continue;
        ctx.strokeStyle = 'rgba(255,255,255,0.92)';
        ctx.lineWidth = showBlueprintOverlay ? 3 : 3.2;
        ctx.strokeText(txt, ax, ay);
        ctx.fillStyle = rm.type === T.ENTRANCE ? '#92400e' : '#0f172a';
        ctx.fillText(txt, ax, ay);
      }
    }

    ctx.restore();
  }

  /* ============================================================
     4. BFS動線パス生成 & 連隊キャラクター構成
  ============================================================ */
  function selectTourActors(stageObj, combos, isVampireDemo = false) {
    const badge = stageObj?.client?.typeBadge || '';
    const comboNames = new Set((combos || []).map(c => typeof c === 'string' ? c : c.name));
    if (isVampireDemo || badge.includes('吸血鬼') || badge.includes('闇')) {
      return { actors: ['char_vampire'], isVampire: true, label: '吸血鬼' };
    }
    if (badge.includes('忍')) {
      return { actors: ['char_ninja'], isVampire: false, label: '現代の忍' };
    }
    if (badge.includes('銭湯大名')) {
      return { actors: ['char_king', 'char_sento'], isVampire: false, label: '銭湯大名一行' };
    }
    if (badge.includes('風呂マニア')) {
      return { actors: ['char_sento'], isVampire: false, label: '風呂マニア' };
    }
    if (badge.includes('トイレ評論')) {
      return { actors: ['char_toilet_critic'], isVampire: false, label: 'トイレ評論家' };
    }
    if (badge.includes('仙') || badge.includes('哲学')) {
      return { actors: ['char_sennin'], isVampire: false, label: '哲学者' };
    }
    if (badge.includes('ミステリー')) {
      return { actors: ['char_mystery'], isVampire: false, label: '作家' };
    }
    if (badge.includes('美食サロン')) {
      return { actors: ['char_lady_vip', 'char_sp'], isVampire: false, label: '貴婦人＋SP' };
    }
    if (badge.includes('豪邸') || badge.includes('VIP') || badge.includes('レジデンス')) {
      return { actors: ['char_vip', 'char_sp'], isVampire: false, label: 'VIP＋SP' };
    }
    if (badge.includes('二世帯')) {
      return { actors: ['char_senior_m', 'char_senior_f', 'char_suit', 'char_kid_1'], isVampire: false, label: '二世帯ファミリー(4人)' };
    }
    if (badge.includes('シニア')) {
      return { actors: ['char_senior_m', 'char_senior_f'], isVampire: false, label: 'シニア夫婦(2人)' };
    }
    if (badge.includes('大家族')) {
      return { actors: ['char_suit', 'char_casual_pink', 'char_kid_1', 'char_kid_2'], isVampire: false, label: '大家族ファミリー(4人)' };
    }
    if (badge.includes('ファミリー')) {
      return { actors: ['char_suit', 'char_casual_pink', 'char_kid_1'], isVampire: false, label: 'ファミリー(3人)' };
    }
    if (badge.includes('和モダン')) {
      return { actors: ['char_wa', 'char_casual_pink'], isVampire: false, label: '和モダンDINKS(2人)' };
    }
    if (badge.includes('DINKS')) {
      return { actors: ['char_suit', 'char_casual_pink'], isVampire: false, label: 'DINKS(2人)' };
    }
    if (badge.includes('ミニマリスト')) {
      return { actors: ['char_minimal'], isVampire: false, label: 'ミニマリスト' };
    }
    if (badge.includes('おしゃれ')) {
      return { actors: ['char_fashion'], isVampire: false, label: 'おしゃれ単身' };
    }
    if (badge.includes('ワーカー')) {
      return { actors: ['char_worker'], isVampire: false, label: '在宅ワーカー' };
    }
    if (badge.includes('陽だまり')) {
      return { actors: ['char_cafe'], isVampire: false, label: '陽だまり単身' };
    }
    if (badge.includes('新社会人')) {
      return { actors: ['char_suit'], isVampire: false, label: '新社会人' };
    }
    if (badge.includes('初回モデル')) {
      return { actors: ['char_casual_blue'], isVampire: false, label: '初回モデル案件' };
    }
    if (comboNames.has('古き良き日本家屋')) {
      return { actors: ['char_wa'], isVampire: false, label: '和風住人' };
    }
    return { actors: ['char_casual_blue'], isVampire: false, label: '単身' };
  }

  function buildShortestGridPath(targetGrid, start, goal) {
    const gSize = targetGrid.length;
    const key = (r, c) => `${r},${c}`;
    const q = [start];
    const prev = new Map();
    prev.set(key(start.r, start.c), null);
    while (q.length) {
      const cur = q.shift();
      if (cur.r === goal.r && cur.c === goal.c) break;
      for (const { dr, dc } of DIRS) {
        const nr = cur.r + dr, nc = cur.c + dc;
        const nk = key(nr, nc);
        if (nr < 0 || nr >= gSize || nc < 0 || nc >= gSize || prev.has(nk)) continue;
        const et = safeEdgeType(targetGrid, cur.r, cur.c, nr, nc, typeof edgeType === 'function' ? edgeType : null);
        if (et === E.NONE || et === E.DOOR) {
          prev.set(nk, cur);
          q.push({ r: nr, c: nc });
        }
      }
    }
    const gKey = key(goal.r, goal.c);
    if (!prev.has(gKey)) return null;
    const path = [];
    let cur = goal;
    while (cur) {
      path.push(cur);
      cur = prev.get(key(cur.r, cur.c));
    }
    path.reverse();
    return path;
  }

  function getRoomReactionSpeech(rm, comboNames, stageObj, hiddenRoomKeys) {
    const cc = stageObj?.customCombo || null;
    const invName = (cc && cc.isNegativeInversion) ? cc.name : null;
    const targetName = cc ? cc.name : null;
    const isHidden = Boolean(hiddenRoomKeys && hiddenRoomKeys.has(rm.key));

    if (rm.type === T.BATH) {
      if (comboNames.has('海見えビューバス')) {
        return { text: '🌊 水平線を眺めながらのバスタイム最高！', mood: 'love' };
      }
      if (comboNames.has('もはや銭湯') && rm.cells.length >= 8) {
        return { text: targetName === 'もはや銭湯' ? '♨️ 自宅に理想の富士山銭湯！最高！' : '♨️ 家に富士山と銭湯が！', mood: 'love' };
      }
      if (comboNames.has('玄関直風呂')) {
        return invName === '玄関直風呂'
          ? { text: '😍 帰宅して0秒で湯船！最高だ！', mood: 'love' }
          : { text: '😱 玄関から丸見え風呂！？', mood: 'shock' };
      }
      if (comboNames.has('プライバシーゼロ')) return { text: '😳 浴室が通り抜け通路！？', mood: 'shock' };
      if (comboNames.has('セレブ浴室') && rm.cells.length >= 4) return { text: '✨ 豪華なジャグジーだ！', mood: 'love' };
      return { text: '🛁 ゆっくり浸かれそう♪', mood: 'good' };
    }
    if (rm.type === T.TOILET) {
      if (comboNames.has('食欲減退')) {
        return invName === '食欲減退'
          ? { text: '😍 LDKから1歩のトイレ！神動線！', mood: 'love' }
          : { text: '🤢 LDKの隣がトイレで臭いが…', mood: 'bad' };
      }
      if (comboNames.has('バカデカトイレ') && rm.cells.length >= 4) {
        return rm.cells.length >= 6 || (rm.roomId || 0) % 2 === 1
          ? { text: '📺 トイレに住めそう！', mood: 'love' }
          : { text: '🚽 広すぎて落ち着かん…', mood: 'weird' };
      }
      if (isHidden || comboNames.has('秘密のトイレ')) return { text: '🥷 収納の奥に秘密トイレ！', mood: 'weird' };
      if (comboNames.has('トイレビュッフェ')) return { text: '🚽 廊下に便器がズラリ！？', mood: 'weird' };
      return { text: '🧻 清潔でいいね', mood: 'good' };
    }
    if (rm.type === T.LDK) {
      if (comboNames.has('幹線道路の騒音')) return { text: '🚗 車の走行音がリビングに響く…！', mood: 'bad' };
      if (comboNames.has('オーシャンビュー')) return { text: '🌊 オーシャンビューのリビング最高！', mood: 'love' };
      if (comboNames.has('パークビュー')) return { text: '🌳 窓から公園の緑が見えて気持ちいい！', mood: 'love' };
      if (comboNames.has('桜並木ビュー')) return { text: '🌸 リビングから桜並木を一望できる！', mood: 'love' };
      if (comboNames.has('要塞化')) return { text: '🛡️ 監視モニター完備の基地だ！', mood: 'weird' };
      if (comboNames.has('ガラス張りハウス')) return { text: '✨ 窓だらけで眩しい開放感！', mood: 'love' };
      if (comboNames.has('家事ラク動線')) return { text: '🧺 料理と洗濯がラクそう！', mood: 'love' };
      if (comboNames.has('日当たり良好')) return { text: '☀️ 南向きで明るいリビング！', mood: 'good' };
      return { text: '🍳 ここで美味しいご飯を♪', mood: 'good' };
    }
    if (rm.type === T.ROOM) {
      if (isHidden || comboNames.has('隠し部屋')) {
        return { text: targetName === '隠し部屋' ? '🥷 これぞ究極の隠し部屋でござる！' : '🕵️ 隠れ家みたいで最高！', mood: 'love' };
      }
      if (comboNames.has('幹線道路の騒音')) return { text: '🚗 道路側の窓から騒音が気になる…', mood: 'bad' };
      if (comboNames.has('防音緩衝レイアウト')) return { text: '🤫 大通り沿いなのに驚くほど静か！', mood: 'love' };
      if (comboNames.has('桜並木ビュー') && rm.label === '和室') return { text: '🌸 畳から満開の桜が見える花見座敷だ！', mood: 'love' };
      if (comboNames.has('オーシャンビュー')) return { text: '🌊 部屋から海が見えるなんて贅沢！', mood: 'love' };
      if (comboNames.has('パークビュー')) return { text: '🌳 公園の緑に癒やされる部屋だね', mood: 'love' };
      if (comboNames.has('桜並木ビュー')) return { text: '🌸 窓いっぱいの桜並木が素敵！', mood: 'love' };
      if (comboNames.has('要塞化')) return { text: '🛡️ 光ゼロ！完璧な要塞シェルター', mood: 'weird' };
      if (rm.label === '和室' && comboNames.has('古き良き日本家屋')) return { text: '🏮 伝統の田の字和室だ…！', mood: 'love' };
      if (comboNames.has('マトリョーシカ')) {
        return targetName === 'マトリョーシカ'
          ? { text: '🕵️ 部屋の中にまた部屋…最高の密室トリックだ！', mood: 'love' }
          : { text: '🪆 部屋の奥にまた部屋が…', mood: 'bad' };
      }
      if (rm.label === '和室' && (stageObj?.client?.typeBadge || '').includes('シニア')) {
        return { text: '🍵 夫婦でのんびりお茶できそうね', mood: 'love' };
      }
      if (rm.label === '和室') return { text: '🍵 畳の香りが落ち着く〜', mood: 'good' };
      return { text: '🛏️ 落ち着けるお部屋だ！', mood: 'good' };
    }
    if (rm.type === T.CLOSET) {
      if (comboNames.has('防音緩衝レイアウト')) return { text: '🧱 収納が道路側の防音壁になってる！賢い！', mood: 'good' };
      if (comboNames.has('収納が本体') && rm.cells.length >= 8) return { text: '📦 ほぼ倉庫なんですけど！？', mood: 'weird' };
      return { text: '👕 たっぷり収納できそう！', mood: 'good' };
    }
    if (rm.type === T.CORRIDOR) {
      if (comboNames.has('無限回廊')) {
        return { text: targetName === '無限回廊' ? '🧘 永遠に歩ける瞑想空間！最高！' : '🌀 ぐるぐる回れる不思議な廊下…！', mood: 'love' };
      }
      if (comboNames.has('トイレビュッフェ')) return { text: '🚽 便器が並ぶ不思議廊下…！', mood: 'weird' };
      if (comboNames.has('スケルトンバス')) return { text: '👀 玄関から浴室まで一直線！？', mood: 'shock' };
      if (comboNames.has('大ホワイエ')) return { text: '🏛️ 玄関ホールが豪邸みたい！', mood: 'love' };
      if (comboNames.has('ロングコリドー')) return { text: '🏃 長い廊下で気持ちいい！', mood: 'good' };
    }
    if (rm.type === T.WASHROOM) return { text: '🫧 朝の身支度バッチリ', mood: 'good' };
    return { text: '👀 なるほど〜！', mood: null };
  }

  /**
   * 内見ツアーのステップリストを構築
   */
  function buildTourScript(targetGrid, stageObj, combos, isVampire) {
    const { visited, entCells } = computeVisitedSet(targetGrid, stageObj);
    const planForScript = buildFurniturePlan(targetGrid, combos, visited, stageObj);
    const { rooms, gardenClusters } = analyzeRoomsAndClusters(targetGrid, visited);
    const comboNames = new Set((combos || []).map(c => typeof c === 'string' ? c : c.name));
    const start = entCells[0] || { r: 0, c: 0 };

    const steps = [];
    let cur = { r: start.r, c: start.c };

    if (comboNames.has('水門')) {
      steps.push({ type: 'pause', speech: '🌊 玄関すぐが水回りばかり…不思議な造り！', mood: 'weird', durationMs: 950 });
    } else if (comboNames.has('スケルトンバス')) {
      steps.push({ type: 'pause', speech: '👀 玄関正面にお風呂が丸見え！？', mood: 'shock', durationMs: 950 });
    }

    const visitableRooms = rooms.filter(rm => {
      if (!rm.reachable) return false;
      if (rm.type === T.ENTRANCE) return false;
      if (rm.type === T.CORRIDOR && !comboNames.has('大ホワイエ') && !comboNames.has('ロングコリドー') && !comboNames.has('無限回廊') && !comboNames.has('トイレビュッフェ')) {
        return false;
      }
      return true;
    });

    const orderScore = t => ({ [T.CORRIDOR]: 1, [T.LDK]: 2, [T.ROOM]: 3, [T.BATH]: 4, [T.WASHROOM]: 5, [T.TOILET]: 6, [T.CLOSET]: 7 }[t] || 9);
    visitableRooms.sort((a, b) => orderScore(a.type) - orderScore(b.type));

    const maxVisits = Math.min(visitableRooms.length, 6);
    for (let i = 0; i < maxVisits; i++) {
      const rm = visitableRooms[i];
      const targetCell = rm.cells[Math.floor(rm.cells.length / 2)];
      const path = buildShortestGridPath(targetGrid, cur, targetCell);
      if (path && path.length > 0) {
        const react = getRoomReactionSpeech(rm, comboNames, stageObj, planForScript.hiddenRoomKeys);
        steps.push({
          type: 'walk',
          path,
          speech: react.text,
          mood: react.mood
        });
        cur = { r: targetCell.r, c: targetCell.c };
      }
    }

    const bigGarden = gardenClusters.find(cl => cl.length >= 8);
    if (comboNames.has('公園つづきの庭')) {
      steps.push({ type: 'pause', speech: '🌳 専用庭がそのまま公園に繋がって開放的！', mood: 'love', durationMs: 1050 });
    } else if (bigGarden && comboNames.has('もはや公園')) {
      steps.push({ type: 'pause', speech: '🏞️ 庭がもはや児童公園だ！', mood: 'love', durationMs: 1100 });
    } else if (comboNames.has('広大なる庭園')) {
      steps.push({ type: 'pause', speech: '🌳 鯉の泳ぐ日本庭園が素敵！', mood: 'love', durationMs: 1000 });
    } else if (comboNames.has('箱庭のある暮らし')) {
      steps.push({ type: 'pause', speech: '🎍 石灯籠の箱庭が落ち着く〜', mood: 'good', durationMs: 900 });
    }

    if (comboNames.has('駅前好立地')) {
      steps.push({ type: 'pause', speech: '🚉 駅が近くて毎日の通勤・お出かけが最高！', mood: 'love', durationMs: 950 });
    }

    const unreachableRooms = rooms.filter(rm => !rm.reachable && rm.type !== T.ENTRANCE);
    if (unreachableRooms.length > 0) {
      const darkTarget = unreachableRooms[0];
      const darkCell = darkTarget.cells[Math.floor(darkTarget.cells.length / 2)];
      if (isVampire) {
        steps.push({
          type: 'warp',
          target: darkCell,
          speech: '🦇 完璧な闇の密室…最高だ！',
          mood: 'love',
          durationMs: 1400
        });
      } else {
        const backPath = buildShortestGridPath(targetGrid, cur, start);
        if (backPath && backPath.length > 1) {
          steps.push({ type: 'walk', path: backPath, speech: '💦 あれ…入れない部屋がある！？', mood: 'shock' });
        } else {
          steps.push({ type: 'pause', speech: '💦 入れない部屋がある…！？', mood: 'shock', durationMs: 1200 });
        }
      }
    } else if (steps.length === 0) {
      steps.push({ type: 'pause', speech: '👀 まずは玄関チェック！', mood: 'good', durationMs: 900 });
    } else if (stageObj && stageObj.renovation) {
      steps.push({ type: 'pause', speech: '🔨 見違えるほど素敵なリフォームだ！', mood: 'love', durationMs: 1050 });
    } else {
      steps.push({ type: 'pause', speech: '✨ いいお部屋ですね！', mood: 'love', durationMs: 950 });
    }

    return { steps, start };
  }

  /* ============================================================
     5. 完成演出＆内見ツアーモーダルコントローラー
     0〜1000ms: 図面 → ピクセルクロスフェード (1秒)
     1000〜2000ms: 家具ポップバウンス (1秒)
     2000ms〜: 連隊内見ツアー (1x / 2x / 4x / スキップ)
  ============================================================ */
  let activeTourRaf = null;
  let activeTourState = null;

  function stopActiveTour() {
    if (activeTourRaf) {
      cancelAnimationFrame(activeTourRaf);
      activeTourRaf = null;
    }
    activeTourState = null;
  }

  function setTourSpeed(spd) {
    tourSpeed = spd;
    try { localStorage.setItem('floorplan_pixel_speed', String(spd)); } catch (e) {}
    document.querySelectorAll('.pixel-speed-btn').forEach(btn => {
      const s = parseFloat(btn.dataset.speed);
      btn.classList.toggle('is-active', s === tourSpeed);
    });
  }

  function startCompletionTour(options) {
    stopActiveTour();
    const {
      gridData,
      stageObj = (typeof STAGE !== 'undefined' ? STAGE : null),
      combos = [],
      furniturePlan: prebuiltPlan = null,
      isVampireDemo = false,
      skipBlueprintFade = false,
      onFinish = null
    } = options;

    const modal = document.getElementById('pixel-tour-modal');
    const tourCanvas = document.getElementById('pixel-tour-canvas');
    const phaseEl = document.getElementById('pixel-tour-phase');
    const finishBtn = document.getElementById('btn-pixel-tour-finish');
    const replayBtn = document.getElementById('btn-pixel-tour-replay');
    if (!modal || !tourCanvas) {
      if (typeof onFinish === 'function') onFinish();
      return;
    }

    const gSize = gridData.length || 12;
    const maxDim = Math.min(window.innerWidth - 48, window.innerHeight - 230, 440);
    const cs = Math.max(20, Math.floor(maxDim / gSize));
    const total = cs * gSize;
    const dpr = window.devicePixelRatio || 1;
    tourCanvas.width = total * dpr;
    tourCanvas.height = total * dpr;
    tourCanvas.style.width = `${total}px`;
    tourCanvas.style.height = `${total}px`;
    const tctx = tourCanvas.getContext('2d');

    // オフスクリーンで「開始時の図面画像」を1回だけ描いておく（1秒クロスフェード用）
    const blueprintCanvas = document.createElement('canvas');
    blueprintCanvas.width = total * dpr;
    blueprintCanvas.height = total * dpr;
    const bctx = blueprintCanvas.getContext('2d');
    bctx.scale(dpr, dpr);
    drawSimpleBlueprintSnapshot(bctx, gridData, cs, stageObj);

    const { visited } = computeVisitedSet(gridData, stageObj);
    const furniturePlan = prebuiltPlan || buildFurniturePlan(gridData, combos, visited, stageObj);
    const actorInfo = selectTourActors(stageObj, combos, isVampireDemo);
    const script = buildTourScript(gridData, stageObj, combos, actorInfo.isVampire);

    // 家具ポップバウンス効果音タイミング記録
    const playedSoundFlags = new Set();

    // 各ステップを展開したタイムライン位置
    const actorTrail = []; // 連隊スネーク用過去座標 { r, c }
    for (let k = 0; k < 40; k++) actorTrail.push({ r: script.start.r, c: script.start.c });

    let stepIdx = 0;
    let stepElapsed = 0; // ms
    let currentSpeech = '';
    let currentMood = null;
    let speechTimer = 0;
    let warpEffect = null; // { r, c, progress }
    let tourCompleted = false;

    const fadeDuration = skipBlueprintFade ? 250 : 1000;
    const furnDuration = 1000;

    let elapsedTotal = 0;
    let lastTs = performance.now();

    if (finishBtn) {
      finishBtn.innerHTML = `<i class="ph-bold ph-fast-forward"></i> スキップして結果へ`;
      finishBtn.classList.remove('is-ready');
    }
    if (replayBtn) replayBtn.style.display = 'none';
    setTourSpeed(tourSpeed);
    modal.style.display = 'flex';

    const closeAndFinish = () => {
      stopActiveTour();
      modal.style.display = 'none';
      if (typeof onFinish === 'function') onFinish();
    };

    if (finishBtn) {
      finishBtn.onclick = () => {
        if (typeof playSound === 'function') playSound('tap');
        closeAndFinish();
      };
    }
    if (replayBtn) {
      replayBtn.onclick = () => {
        if (typeof playSound === 'function') playSound('tap');
        startCompletionTour(options);
      };
    }

    function frame(now) {
      const rawDt = Math.min(60, now - lastTs);
      lastTs = now;
      const dt = rawDt * tourSpeed;
      elapsedTotal += dt;

      tctx.resetTransform();
      tctx.scale(dpr, dpr);
      tctx.clearRect(0, 0, total, total);
      tctx.imageSmoothingEnabled = false;

      if (elapsedTotal < fadeDuration) {
        // Phase 1: 図面 → ピクセルクロスフェード (1秒)
        const p = elapsedTotal / fadeDuration;
        if (phaseEl) phaseEl.textContent = '📐 図面から空間を構築中...';
        drawPixelBoard(tctx, gridData, cs, {
          showFurniture: false,
          enable25DWalls: true,
          furniturePlan,
          timeMs: now,
          combos,
          stageObj
        });
        tctx.save();
        tctx.globalAlpha = 1 - p;
        tctx.drawImage(blueprintCanvas, 0, 0, total, total);
        tctx.restore();
      } else if (elapsedTotal < fadeDuration + furnDuration) {
        // Phase 2: 家具ポップバウンス (1秒)
        const furnMs = elapsedTotal - fadeDuration;
        if (phaseEl) phaseEl.textContent = '🛋️ 家具・設備を搬入中！';
        drawPixelBoard(tctx, gridData, cs, {
          showFurniture: true,
          enable25DWalls: true,
          furniturePlan,
          furnitureElapsedMs: furnMs,
          timeMs: now,
          combos,
          stageObj
        });
        // ぽんぽん軽いSE（最大6回まで間引き再生）
        const bucket = Math.floor(furnMs / 160);
        if (!playedSoundFlags.has(bucket) && furniturePlan.items.length > 0 && typeof playSound === 'function') {
          playedSoundFlags.add(bucket);
          playSound('tap');
        }
      } else {
        // Phase 3: 連隊内見ツアー
        drawPixelBoard(tctx, gridData, cs, {
          showFurniture: true,
          enable25DWalls: true,
          furniturePlan,
          furnitureElapsedMs: 99999,
          timeMs: now,
          combos,
          stageObj
        });

        let headPos = actorTrail[0];
        if (!tourCompleted && stepIdx < script.steps.length) {
          const curStep = script.steps[stepIdx];
          if (phaseEl) phaseEl.textContent = `🚶 ${actorInfo.label} が内見中... (${tourSpeed}x)`;

          if (curStep.type === 'walk') {
            const msPerTile = 290;
            const totalWalkMs = Math.max(1, (curStep.path.length - 1)) * msPerTile;
            const speechPauseMs = curStep.speech ? 950 : 0;
            stepElapsed += dt;

            if (stepElapsed <= totalWalkMs) {
              const fracTile = stepElapsed / msPerTile;
              const idx0 = Math.min(curStep.path.length - 1, Math.floor(fracTile));
              const idx1 = Math.min(curStep.path.length - 1, idx0 + 1);
              const sub = fracTile - idx0;
              const p0 = curStep.path[idx0];
              const p1 = curStep.path[idx1];
              headPos = {
                r: p0.r + (p1.r - p0.r) * sub,
                c: p0.c + (p1.c - p0.c) * sub
              };
              // トレイル更新（少し距離が動いたら記録）
              const prevHead = actorTrail[0];
              if (Math.hypot(headPos.r - prevHead.r, headPos.c - prevHead.c) >= 0.14) {
                actorTrail.unshift({ r: headPos.r, c: headPos.c });
                if (actorTrail.length > 60) actorTrail.pop();
              }
            } else if (stepElapsed <= totalWalkMs + speechPauseMs) {
              const lastPt = curStep.path[curStep.path.length - 1];
              headPos = { r: lastPt.r, c: lastPt.c };
              currentSpeech = curStep.speech || '';
              currentMood = curStep.mood || null;
            } else {
              currentSpeech = '';
              currentMood = null;
              stepIdx++;
              stepElapsed = 0;
            }
          } else if (curStep.type === 'warp') {
            stepElapsed += dt;
            const dur = curStep.durationMs || 1400;
            if (stepElapsed < 450) {
              // 紫煙・コウモリ風消滅→再出現
              warpEffect = { r: headPos.r, c: headPos.c, p: stepElapsed / 450 };
              currentSpeech = '💨 フッ…';
              currentMood = 'weird';
            } else {
              headPos = { r: curStep.target.r, c: curStep.target.c };
              actorTrail.fill(headPos);
              warpEffect = stepElapsed < 850 ? { r: headPos.r, c: headPos.c, p: 1 - (stepElapsed - 450) / 400 } : null;
              currentSpeech = curStep.speech || '';
              currentMood = curStep.mood || 'love';
            }
            if (stepElapsed >= dur) {
              warpEffect = null;
              currentSpeech = '';
              currentMood = null;
              stepIdx++;
              stepElapsed = 0;
            }
          } else if (curStep.type === 'pause') {
            stepElapsed += dt;
            currentSpeech = curStep.speech || '';
            currentMood = curStep.mood || null;
            if (stepElapsed >= (curStep.durationMs || 900)) {
              currentSpeech = '';
              currentMood = null;
              stepIdx++;
              stepElapsed = 0;
            }
          }
        } else {
          // ツアー完了
          if (!tourCompleted) {
            tourCompleted = true;
            currentSpeech = actorInfo.isVampire ? '🦇 悪くない闇だ…' : '✨ 内見完了！';
            currentMood = 'love';
            if (phaseEl) phaseEl.textContent = '✨ 内見ツアー完了！';
            if (finishBtn) {
              finishBtn.innerHTML = `<i class="ph-bold ph-check-circle"></i> 査定結果チラシを見る`;
              finishBtn.classList.add('is-ready');
            }
            if (replayBtn) replayBtn.style.display = 'inline-flex';
            if (typeof playSound === 'function') playSound('clear');
          }
        }

        // 連隊キャラクター描画（後ろの仲間から順に描く＋感情アクション）
        const walkFrame = Math.floor(elapsedTotal / 180) % 2;
        const actors = actorInfo.actors;
        const isShock = currentMood === 'shock' || currentMood === 'bad';
        const isJoy = currentMood === 'love';
        const emoMarkMap = { love: '💕', shock: '😱', bad: '🤢', weird: '❗', good: '♪' };
        const emoBadge = currentMood ? emoMarkMap[currentMood] : null;
        for (let ai = actors.length - 1; ai >= 0; ai--) {
          const trailIdx = Math.min(actorTrail.length - 1, ai * 5);
          const pos = (ai === 0) ? headPos : actorTrail[trailIdx];
          const shakeX = isShock ? Math.sin(now / 32 + ai * 1.3) * 2.2 : 0;
          const joyHop = isJoy ? -Math.abs(Math.sin(now / 150 + ai * 0.7)) * 3.5 : 0;
          const ax = pos.c * cs + shakeX;
          const ay = pos.r * cs + joyHop;
          const spriteId = `${actors[ai]}_${walkFrame}`;
          // 接地影
          tctx.fillStyle = 'rgba(15, 23, 42, 0.32)';
          tctx.beginPath();
          tctx.ellipse(pos.c * cs + cs * 0.5, pos.r * cs + cs * 0.86, cs * 0.28, cs * 0.1, 0, 0, Math.PI * 2);
          tctx.fill();
          PixelAssets.drawSprite(tctx, spriteId, ax + cs * 0.04, ay + cs * 0.02, cs * 0.92, cs * 0.92);
          if (emoBadge && (ai > 0 || !currentSpeech)) {
            tctx.save();
            tctx.font = `bold ${Math.max(10, Math.round(cs * 0.34))}px sans-serif`;
            tctx.textAlign = 'center';
            tctx.textBaseline = 'bottom';
            tctx.fillText(emoBadge, ax + cs * 0.5, ay + 2);
            tctx.restore();
          }
        }

        // 吸血鬼ワープエフェクト
        if (warpEffect) {
          tctx.save();
          tctx.fillStyle = `rgba(147, 51, 234, ${0.75 * warpEffect.p})`;
          const wx = warpEffect.c * cs + cs * 0.5;
          const wy = warpEffect.r * cs + cs * 0.5;
          tctx.beginPath();
          tctx.arc(wx, wy, cs * 0.55 * warpEffect.p, 0, Math.PI * 2);
          tctx.fill();
          tctx.restore();
        }

        // 吹き出し描画（先頭キャラの頭上）
        if (currentSpeech) {
          drawPixelSpeechBubble(tctx, headPos.c * cs + cs * 0.5, headPos.r * cs, currentSpeech, total);
        }
      }

      activeTourRaf = requestAnimationFrame(frame);
    }

    activeTourState = { closeAndFinish };
    activeTourRaf = requestAnimationFrame(frame);
  }

  function drawPixelSpeechBubble(ctx, anchorX, anchorY, text, canvasWidth) {
    ctx.save();
    ctx.font = 'bold 11px "Zen Kaku Gothic New", sans-serif';
    const padX = 8;
    const bw = Math.min(canvasWidth - 12, ctx.measureText(text).width + padX * 2);
    const bh = 24;
    let bx = anchorX - bw / 2;
    let by = anchorY - bh - 8;
    bx = Math.max(6, Math.min(canvasWidth - bw - 6, bx));
    if (by < 6) by = anchorY + 34;

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 6);
    else ctx.rect(bx, by, bw, bh);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + bw / 2, by + bh / 2 + 0.5, bw - 8);
    ctx.restore();
  }

  function drawSimpleBlueprintSnapshot(bctx, targetGrid, cs, stageObj) {
    const gSize = targetGrid.length;
    const fp = calcFootprintStats(targetGrid);
    const bbox = (fp && fp.hasPlacedPiece) ? fp.bbox : null;
    for (let r = 0; r < gSize; r++) {
      for (let c = 0; c < gSize; c++) {
        const cell = targetGrid[r][c];
        const inBox = bbox && r >= bbox.minR && r <= bbox.maxR && c >= bbox.minC && c <= bbox.maxC;
        if (!cell || cell.type === T.EMPTY || cell.type === T.GARDEN) {
          bctx.fillStyle = inBox ? '#ecfccb' : '#f8fafc';
        } else {
          const s = (typeof CELL_STYLE !== 'undefined' && CELL_STYLE[cell.type]) || { bg: '#cbd5e1' };
          bctx.fillStyle = s.bg;
        }
        bctx.fillRect(c * cs, r * cs, cs, cs);
        bctx.strokeStyle = '#e2e8f0';
        bctx.lineWidth = 0.6;
        bctx.strokeRect(c * cs, r * cs, cs, cs);
      }
    }
    bctx.strokeStyle = '#1e293b';
    bctx.lineWidth = 2;
    for (let r = 0; r < gSize; r++) {
      for (let c = 0; c < gSize; c++) {
        const x = c * cs, y = r * cs;
        const etR = safeEdgeType(targetGrid, r, c, r, c + 1, typeof edgeType === 'function' ? edgeType : null);
        if (etR !== E.NONE) {
          bctx.beginPath(); bctx.moveTo(x + cs, y); bctx.lineTo(x + cs, y + cs); bctx.stroke();
        }
        const etB = safeEdgeType(targetGrid, r, c, r + 1, c, typeof edgeType === 'function' ? edgeType : null);
        if (etB !== E.NONE) {
          bctx.beginPath(); bctx.moveTo(x, y + cs); bctx.lineTo(x + cs, y + cs); bctx.stroke();
        }
      }
    }
  }

  /* ============================================================
     6. サンドボックス検証プリセット（ワンタップでコンボ盤面を生成）
  ============================================================ */
  function loadTestPreset(presetId) {
    if (typeof grid === 'undefined') return;
    const isGameActive = Boolean(document.getElementById('screen-game')?.classList.contains('active'));
    if (!isGameActive && typeof startGame === 'function') {
      startGame();
    }
    if (typeof STAGE === 'undefined' || !STAGE) return;

    if (presetId === 'reno_ng_fix' && global.DXStage2 && typeof initGrid === 'function') {
      const renoStage = global.DXStage2.generateRenovationMission(1, 1, 1.0, 'reno_ng_fix_dinks');
      if (renoStage) {
        if (typeof GameState !== 'undefined') GameState.currentMission = renoStage;
        STAGE = renoStage;
        if (typeof attachRequestFunctions === 'function') attachRequestFunctions(STAGE);
        initGrid();
        if (typeof selectedSlot !== 'undefined') selectedSlot = null;
        if (typeof selectedDemolishTarget !== 'undefined') selectedDemolishTarget = null;
        if (typeof demolishMode !== 'undefined') demolishMode = false;
        if (typeof syncDemolishModeButton === 'function') syncDemolishModeButton();
        if (typeof renderDraftUI === 'function') renderDraftUI();
        if (typeof updateBudgetUI === 'function') updateBudgetUI();
        const hdrT = document.getElementById('hdr-target-rent');
        if (hdrT && STAGE.targetRent) hdrT.innerHTML = `${STAGE.targetRent.toFixed(1)}<span style="font-size:9px;color:var(--c-text2);">万</span>`;
        const mbt = document.getElementById('mission-banner-text');
        if (mbt) mbt.textContent = `【${STAGE.client.name}】${STAGE.renovation.summary}`;
        if (typeof resizeCanvas === 'function') resizeCanvas();
        if (typeof drawPlan === 'function') drawPlan();
        if (typeof updateRealtimeRent === 'function') updateRealtimeRent(true);
        if (typeof saveActiveBuild === 'function') saveActiveBuild('game');
        if (typeof showFloatingText === 'function') showFloatingText('🔨 リフォーム検証案件を展開しました！', '#f59e0b');
        return;
      }
    }

    STAGE.customCombo = null;
    STAGE.location = null;
    STAGE.renovation = null;
    STAGE.obstacles = [];
    STAGE.lotType = 'square_xl';
    STAGE.requests = (typeof REQUEST_REGISTRY !== 'undefined')
      ? [{ ...REQUEST_REGISTRY.btsep }, { ...REQUEST_REGISTRY.reach }].filter(Boolean)
      : (STAGE.requests || []);
    const gSize = GRID;
    for (let r = 0; r < gSize; r++) {
      for (let c = 0; c < gSize; c++) {
        grid[r][c] = makeCell(T.EMPTY, 0, '', 0);
      }
    }
    const applyLotObstacles = (lotKey) => {
      if (typeof LOT_DEFINITIONS !== 'undefined' && LOT_DEFINITIONS[lotKey]) {
        STAGE.lotType = lotKey;
        STAGE.lotName = LOT_DEFINITIONS[lotKey].name;
        STAGE.obstacles = LOT_DEFINITIONS[lotKey].obstacles || [];
        for (const obs of STAGE.obstacles) {
          for (let r = obs.r; r < obs.r + (obs.h || 1); r++) {
            for (let c = obs.c; c < obs.c + (obs.w || 1); c++) {
              if (r >= 0 && r < gSize && c >= 0 && c < gSize) {
                grid[r][c] = makeCell(T.OBSTACLE, null, '');
              }
            }
          }
        }
      }
    };
    let rid = 100;
    const fillRect = (r0, c0, h, w, type, label, libId, cost = 4) => {
      const id = rid++;
      for (let r = r0; r < r0 + h; r++) {
        for (let c = c0; c < c0 + w; c++) {
          if (r < gSize && c < gSize) {
            const cell = makeCell(type, id, label, cost);
            cell.pieceLibId = libId;
            grid[r][c] = cell;
          }
        }
      }
      return id;
    };

    const setEnt = (r, c, facing = 'bottom') => {
      STAGE.entranceRow = r;
      STAGE.entranceCol = c;
      STAGE.entranceCells = [{ r, c }];
      STAGE.entranceFacing = facing;
      grid[r][c] = makeCell(T.ENTRANCE, 'entrance', '玄関', 0);
    };

    if (presetId === 'sento_park') {
      STAGE.client = { name: '湯けむり 太郎', avatar: '♨️', quote: '「銭湯と公園とバカデカトイレを！」', typeBadge: 'ファミリー' };
      setEnt(9, 2, 'bottom');
      fillRect(8, 2, 1, 5, T.CORRIDOR, '廊下', 'corr-1', 1);
      fillRect(6, 1, 2, 4, T.BATH, '浴室', 'bath-wide', 5); // 8マスもはや銭湯！
      fillRect(6, 5, 2, 2, T.TOILET, 'WC', 'toilet', 4);    // 4マスバカデカトイレ！
      fillRect(8, 1, 1, 1, T.WASHROOM, '洗面', 'wash', 6);
      fillRect(6, 7, 3, 2, T.LDK, 'LDK', 'ldk-23', 4.3);
      fillRect(3, 7, 3, 2, T.ROOM, '洋室', 'room-23', 3.3); // LDK上へ接続し、左上に広大な公園用余白を確保！
      fillRect(3, 1, 1, 1, T.CLOSET, '収納', 'closet', 1.5); // 左上BBox隅を確定させ、余白を確実に公園(12マス以上)にする
      grid[3][1].walls = { top: false, bottom: false, left: false, right: false };
      fillRect(4, 1, 2, 1, T.CORRIDOR, '廊下', 'corr-1', 1); // 風呂(6,1)と収納(3,1)を接続
    } else if (presetId === 'japan_foyer') {
      STAGE.client = { name: '松平 家族', avatar: '🏯', quote: '「田の字和室と広い玄関ホール！」', typeBadge: '大家族ファミリー' };
      setEnt(9, 4, 'bottom');
      fillRect(7, 3, 2, 3, T.CORRIDOR, '廊下', 'corr-1', 1); // 2x3 大ホワイエ
      fillRect(3, 3, 2, 2, T.ROOM, '和室', 'room-wa', 3);
      fillRect(3, 5, 2, 2, T.ROOM, '和室', 'room-wa', 3);
      fillRect(5, 3, 2, 2, T.ROOM, '和室', 'room-wa', 3);
      fillRect(5, 5, 2, 2, T.ROOM, '和室', 'room-wa', 3);
      fillRect(7, 6, 2, 3, T.LDK, 'LDK', 'ldk-23', 4.3);
      fillRect(5, 7, 1, 1, T.WASHROOM, '洗面', 'wash', 6);
      fillRect(5, 8, 1, 2, T.BATH, '浴室', 'bath', 6);
      fillRect(6, 7, 1, 1, T.TOILET, 'WC', 'toilet', 4);
    } else if (presetId === 'vampire_dark') {
      STAGE.client = { name: 'ドラクル伯爵（自称・夜勤）', avatar: '🧛', quote: '「陽の光は苦手でしてね…完全密室があれば壁を抜けますぞ。」', typeBadge: '吸血鬼' };
      STAGE.customCombo = { name: '封印されし闇', normalBonus: 5.0, customBonus: 8.5, isNegativeInversion: false, allowUnreachable: true, hint: '入口も窓もない密室を作る (+8.5万)' };
      setEnt(8, 2, 'bottom');
      fillRect(7, 2, 1, 3, T.CORRIDOR, '廊下', 'corr-1', 1);
      fillRect(5, 2, 2, 3, T.LDK, 'LDK', 'dk-22', 5);
      fillRect(7, 5, 1, 1, T.TOILET, 'WC', 'toilet', 4);
      fillRect(6, 5, 1, 2, T.BATH, '浴室', 'bath', 6);
      // 到達不能＆窓なし「封印されし闇」を部屋で囲んで作る
      fillRect(2, 3, 3, 3, T.CLOSET, '収納', 'closet', 1.5);
      fillRect(3, 4, 1, 1, T.ROOM, '洋室', 'room-22', 3.7);
      // 孤立部屋の全周を赤壁にして完全に隔離＆窓ゼロ！
      grid[3][4].walls = { top: true, bottom: true, left: true, right: true };
    } else if (presetId === 'ng_dinks') {
      STAGE.client = { name: '急ぎの共働き夫婦', avatar: '🏃', quote: '「とにかく安く！」', typeBadge: '共働きDINKS' };
      setEnt(8, 3, 'bottom');
      fillRect(7, 3, 1, 2, T.BATH, '浴室', 'bath', 6); // 玄関直風呂！
      fillRect(5, 3, 2, 3, T.LDK, 'LDK', 'dk-22', 5);
      fillRect(5, 6, 1, 1, T.TOILET, 'WC', 'toilet', 4); // 食欲減退！
      fillRect(3, 3, 2, 2, T.ROOM, '洋室', 'room-22', 3.7);
    } else if (presetId === 'ninja_secret') {
      STAGE.client = { name: '霧隠 翔（現代の忍）', avatar: '🥷', quote: '「収納の奥に隠し部屋を頼むでござる！」', typeBadge: '現代の忍' };
      STAGE.customCombo = { name: '隠し部屋', normalBonus: 1.5, customBonus: 5.5, isNegativeInversion: false, hint: '収納経由でのみ入れる居室 (+5.5万)' };
      setEnt(8, 3, 'bottom');
      fillRect(7, 3, 1, 2, T.CORRIDOR, '廊下', 'corr-1', 1);
      fillRect(6, 3, 1, 2, T.CLOSET, '収納', 'closet', 1.5);
      fillRect(4, 3, 2, 2, T.ROOM, '和室', 'room-wa', 3); // 収納(6,3)の上のみ接続＝隠し部屋！
      fillRect(5, 5, 2, 3, T.LDK, 'LDK', 'ldk-23', 4.3);
      fillRect(7, 6, 1, 1, T.TOILET, 'WC', 'toilet', 4);
      fillRect(7, 7, 1, 1, T.BATH, '浴室', 'bath', 6);
    } else if (presetId === 'ng_inverted') {
      STAGE.client = { name: '湯川 哲郎（風呂マニア）', avatar: '🛁', quote: '「帰宅0秒で風呂に飛び込みたい！夢のお風呂が最高！」', typeBadge: '風呂マニア' };
      STAGE.customCombo = { name: '玄関直風呂', normalBonus: -2.0, customBonus: 3.5, isNegativeInversion: true, hint: '玄関と浴室を直結ドアで繋ぐ (+3.5万 / 満足度反転)' };
      setEnt(8, 3, 'bottom');
      fillRect(7, 3, 1, 2, T.BATH, '浴室', 'bath', 6); // 玄関直風呂（特注反転！）
      fillRect(5, 3, 2, 3, T.LDK, 'LDK', 'dk-22', 5);
      fillRect(7, 5, 1, 1, T.TOILET, 'WC', 'toilet', 4);
      fillRect(3, 3, 2, 2, T.ROOM, '洋室', 'room-22', 3.7);
    } else if (presetId === 'ocean_villa') {
      applyLotObstacles('square_m');
      if (global.DXStage2) STAGE.location = global.DXStage2.buildLocationPayload('ocean_view', 'south');
      STAGE.client = { name: '海原 汐音', avatar: '🌊', quote: '「南の海を一望できるオーシャンLDKと海見えビューバスを！」', typeBadge: '陽だまりDINKS' };
      setEnt(2, 5, 'top');
      fillRect(3, 5, 4, 1, T.CORRIDOR, '廊下', 'corr-1', 1);
      fillRect(3, 6, 2, 2, T.ROOM, '洋室', 'room-22', 3.7);
      fillRect(7, 4, 3, 3, T.LDK, 'LDK', 'ldk-23', 4.3); // 南端に直面＝オーシャンビュー！
      fillRect(8, 7, 2, 2, T.BATH, '浴室', 'bath-wide', 5); // 南端に直面＝海見えビューバス！
      fillRect(6, 7, 1, 1, T.WASHROOM, '洗面', 'wash', 6);
      fillRect(5, 6, 1, 1, T.TOILET, 'WC', 'toilet', 4);
    } else if (presetId === 'highway_soundproof') {
      applyLotObstacles('square_m');
      if (global.DXStage2) STAGE.location = global.DXStage2.buildLocationPayload('highway_road', 'west');
      STAGE.client = { name: '静音 健一', avatar: '🚗', quote: '「西側が大通りなので、車の音が気にならない静かな部屋に！」', typeBadge: '在宅ワーカー' };
      setEnt(9, 6, 'bottom');
      fillRect(6, 5, 3, 1, T.CORRIDOR, '廊下', 'corr-1', 1);
      fillRect(5, 2, 2, 1, T.CLOSET, '収納', 'closet-2', 1.2); // 西端バッファ
      fillRect(7, 2, 1, 1, T.WASHROOM, '洗面', 'wash', 6);
      fillRect(8, 2, 1, 2, T.BATH, '浴室', 'bath', 6);
      fillRect(4, 2, 1, 1, T.TOILET, 'WC', 'toilet', 4);
      fillRect(4, 3, 2, 2, T.ROOM, '洋室', 'room-22', 3.7);
      fillRect(6, 6, 3, 3, T.LDK, 'LDK', 'ldk-23', 4.3);
    }

    if (presetId === 'vampire_dark' && typeof REQUEST_REGISTRY !== 'undefined') {
      STAGE.requests = [{ ...REQUEST_REGISTRY.btsep }, { ...REQUEST_REGISTRY.ldk1_room1 }].filter(Boolean);
    }

    if (typeof syncDemolishModeButton === 'function') syncDemolishModeButton();

    if (typeof nextRoomId !== 'undefined') nextRoomId = rid + 10;
    if (typeof mergeSameType === 'function') mergeSameType();
    const mbt = document.getElementById('mission-banner-text');
    if (mbt && STAGE?.client) {
      mbt.textContent = `【${STAGE.client.name}】${STAGE.customCombo ? STAGE.customCombo.hint : (STAGE.requests || []).map(r => r.text).join('・')}`;
    }
    if (typeof resizeCanvas === 'function') resizeCanvas();
    if (typeof drawPlan === 'function') drawPlan();
    if (typeof updateRealtimeRent === 'function') updateRealtimeRent(true);
    if (typeof saveActiveBuild === 'function') saveActiveBuild('game');
    if (typeof showFloatingText === 'function') showFloatingText('🧪 テスト間取りを配置しました！', '#6366f1');
  }

  /* ============================================================
     6. クライアント・ピクセルプレビュー描画 (依頼選択＝静止 / 依頼詳細＝待機アニメ)
  ============================================================ */
  let missionIdleRaf = null;
  let missionIdleLastTick = -1;
  let missionIdleStage = null;
  let missionSelectIdleRaf = null;
  let missionSelectIdleLastTick = -1;
  let missionSelectIdlePool = null;

  function drawCharacterShadow(ctx, cx, cy, rx) {
    ctx.save();
    ctx.fillStyle = 'rgba(2, 6, 23, 0.42)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function resolveClientBackdropFloor(stageObj) {
    const badge = stageObj?.client?.typeBadge || '';
    if (badge.includes('和モダン') || badge.includes('二世帯') || badge.includes('シニア') || badge.includes('忍') || badge.includes('銭湯大名') || badge.includes('仙')) {
      return 'floor_washitsu';
    }
    if (badge.includes('豪邸') || badge.includes('VIP') || badge.includes('レジデンス') || badge.includes('美食サロン') || badge.includes('ミステリー')) {
      return 'floor_office_vip';
    }
    if (badge.includes('吸血鬼')) {
      return 'floor_darkness';
    }
    return 'floor_office_blue';
  }

  function renderClientPortraitCanvas(canvasEl, stageObj, opts = {}) {
    if (!canvasEl || !global.PixelAssets) return;
    global.PixelAssets.initAllAssets();

    const mode = opts.mode === 'stage' ? 'stage' : 'portrait';
    const actors = selectTourActors(stageObj).actors || ['char_casual_blue'];
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    if (mode === 'portrait') {
      const w = 68;
      const h = 52;
      if (canvasEl.width !== w || canvasEl.height !== h) {
        canvasEl.width = w;
        canvasEl.height = h;
      }
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, w, h);

      const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
      bgGrad.addColorStop(0, '#1e293b');
      bgGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = '#334155';
      ctx.fillRect(0, 39, w, 13);
      ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
      ctx.fillRect(0, 39, w, 1);

      let placements;
      if (actors.length === 1) {
        placements = [{ actor: actors[0], x: 10, y: 2 }];
      } else if (actors.length === 2) {
        placements = [
          { actor: actors[1], x: 22, y: 0 },
          { actor: actors[0], x: -2, y: 3 }
        ];
      } else if (actors.length === 3) {
        placements = [
          { actor: actors[0], x: -4, y: 1 },
          { actor: actors[1], x: 24, y: 1 },
          { actor: actors[2], x: 10, y: 4 }
        ];
      } else {
        const hasTwoKids = actors[2]?.startsWith('char_kid_') && actors[3]?.startsWith('char_kid_');
        placements = hasTwoKids
          ? [
              { actor: actors[0], x: -2, y: 1 },
              { actor: actors[1], x: 22, y: 1 },
              { actor: actors[2], x: 0, y: 4 },
              { actor: actors[3], x: 20, y: 4 }
            ]
          : [
              { actor: actors[0], x: 10, y: 0 },
              { actor: actors[1], x: -5, y: 2 },
              { actor: actors[2], x: 25, y: 2 },
              { actor: actors[3], x: 10, y: 4 }
            ];
      }

      const tick = opts.tick || 0;
      placements.forEach(p => drawCharacterShadow(ctx, p.x + 24, p.y + 44, 10));
      placements.forEach((p, idx) => {
        const frame = (tick + (idx % 2)) % 2;
        global.PixelAssets.drawSprite(ctx, `${p.actor}_${frame}`, p.x, p.y, 48, 48);
      });
      return;
    }

    // 'stage' mode (依頼詳細画面：全員横並び＋アイドリングアニメ)
    const count = Math.max(1, actors.length);
    const spacing = count >= 4 ? 26 : 28;
    const padX = count >= 4 ? 2 : 6;
    const w = Math.max(60, padX * 2 + 48 + (count - 1) * spacing);
    const h = 60;
    if (canvasEl.width !== w || canvasEl.height !== h) {
      canvasEl.width = w;
      canvasEl.height = h;
      canvasEl.style.width = `${w}px`;
      canvasEl.style.height = `${h}px`;
    }

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);

    const wallGrad = ctx.createLinearGradient(0, 0, 0, 38);
    wallGrad.addColorStop(0, '#1e293b');
    wallGrad.addColorStop(1, '#334155');
    ctx.fillStyle = wallGrad;
    ctx.fillRect(0, 0, w, 38);

    const floorSpr = resolveClientBackdropFloor(stageObj);
    for (let tx = 0; tx < w; tx += 22) {
      global.PixelAssets.drawSprite(ctx, floorSpr, tx, 38, 22, 22);
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.fillRect(0, 38, w, 1);

    const tick = opts.tick || 0;
    actors.forEach((actor, idx) => {
      const dx = padX + idx * spacing;
      const frame = (tick + (idx % 2)) % 2;
      drawCharacterShadow(ctx, dx + 24, 52, 11);
      global.PixelAssets.drawSprite(ctx, `${actor}_${frame}`, dx, 7, 48, 48);
    });
  }

  function stopMissionIdle() {
    if (missionIdleRaf) {
      cancelAnimationFrame(missionIdleRaf);
      missionIdleRaf = null;
    }
    missionIdleLastTick = -1;
  }

  function startMissionIdle(stageObj) {
    if (stageObj) missionIdleStage = stageObj;
    stopMissionIdle();

    const step = (now) => {
      const scr = document.getElementById('screen-mission');
      const canvasEl = document.getElementById('client-stage-canvas');
      if (!scr || !scr.classList.contains('active') || !canvasEl || !missionIdleStage) {
        missionIdleRaf = null;
        return;
      }
      const tick = Math.floor(now / 480);
      if (tick !== missionIdleLastTick) {
        missionIdleLastTick = tick;
        renderClientPortraitCanvas(canvasEl, missionIdleStage, { mode: 'stage', tick });
      }
      missionIdleRaf = requestAnimationFrame(step);
    };

    missionIdleRaf = requestAnimationFrame(step);
  }

  function stopMissionSelectIdle() {
    if (missionSelectIdleRaf) {
      cancelAnimationFrame(missionSelectIdleRaf);
      missionSelectIdleRaf = null;
    }
    missionSelectIdleLastTick = -1;
  }

  function startMissionSelectIdle(pool) {
    if (Array.isArray(pool)) missionSelectIdlePool = pool;
    stopMissionSelectIdle();

    const step = (now) => {
      const scr = document.getElementById('screen-mission-select');
      const container = document.getElementById('mission-pool-cards');
      if (!scr || !scr.classList.contains('active') || !container || !Array.isArray(missionSelectIdlePool)) {
        missionSelectIdleRaf = null;
        return;
      }
      const tick = Math.floor(now / 480);
      if (tick !== missionSelectIdleLastTick) {
        missionSelectIdleLastTick = tick;
        container.querySelectorAll('.mission-select-char-canvas').forEach(cv => {
          const mIdx = parseInt(cv.dataset.missionIdx, 10);
          if (!Number.isNaN(mIdx) && missionSelectIdlePool[mIdx]) {
            renderClientPortraitCanvas(cv, missionSelectIdlePool[mIdx], { mode: 'portrait', tick: tick + mIdx });
          }
        });
      }
      missionSelectIdleRaf = requestAnimationFrame(step);
    };

    missionSelectIdleRaf = requestAnimationFrame(step);
  }

  function getClientTapSpeech(stageObj, lastIdx = -1) {
    const badge = stageObj?.client?.typeBadge || '';
    let lines;
    if (badge.includes('吸血鬼') || badge.includes('闇')) {
      lines = [
        '「日光だけは勘弁してくれよ…」',
        '「壁抜けできるからドア不要さ。」',
        '「棺桶が似合う暗い密室がいいね。」',
        '「赤ワインが似合う闇の館を頼むよ。」'
      ];
    } else if (badge.includes('ミステリー')) {
      lines = [
        '「読者が驚くトリックを仕込みたい！」',
        '「部屋の奥にまた部屋…最高だね！」',
        '「今夜も書斎でプロットを練るよ。」',
        '「最高の密室トリックを一緒に作ろう！」'
      ];
    } else if (badge.includes('忍')) {
      lines = [
        '「隠し部屋は忍びの基本でござる！」',
        '「収納の奥が通路…誰も気づくまい！」',
        '「手裏剣を手入れする小部屋を頼む！」',
        '「すぐ隠れられる動線だと助かるぞ。」'
      ];
    } else if (badge.includes('銭湯大名')) {
      lines = [
        '「広い風呂ほど天下に近づくのじゃ！」',
        '「壁一面にドーンと富士山を描くのじゃ！」',
        '「ケロリン桶を並べて毎晩温泉じゃ！」',
        '「湯気の中で政務を語る…贅沢じゃ！」'
      ];
    } else if (badge.includes('風呂マニア')) {
      lines = [
        '「帰宅3秒で肩まで浸かるのが夢です！」',
        '「玄関横に湯船があるなんて最高！」',
        '「少し濡れても熱いお湯が正義です！」',
        '「常識破りの風呂動線に期待してます！」'
      ];
    } else if (badge.includes('トイレ評論')) {
      lines = [
        '「食後すぐトイレ！1秒も歩けません！」',
        '「ニオイ？ 愛があれば気になりません！」',
        '「LDKとトイレ直結の機能美をぜひ！」',
        '「時短と効率の極み、お任せしましたよ！」'
      ];
    } else if (badge.includes('仙') || badge.includes('哲学')) {
      lines = [
        '「行き止まりのない廊下は真理じゃ…」',
        '「ぐるぐる歩けば雑念も消えるのじゃ。」',
        '「茶をすすりつつ無限を歩きたいのう。」',
        '「ほっほっほ、迷うのも一興じゃな。」'
      ];
    } else if (badge.includes('美食サロン')) {
      lines = [
        '「今夜もVIPを招いてパーティーですわ♪」',
        '「腕を振るえる広いキッチンが必須ですわ。」',
        '「SPが待機しやすい見通しが理想ですわ。」'
      ];
    } else if (badge.includes('豪邸') || badge.includes('VIP') || badge.includes('レジデンス')) {
      lines = [
        '「予算は十分だ。最高級の設計頼むよ。」',
        '「護衛SPの動線も抜かりなく頼むぞ。」',
        '「見た目も機能も一流が条件だね。」',
        '「名邸ができたらぜひ紹介させてくれ。」'
      ];
    } else if (badge.includes('リフォーム')) {
      lines = [
        '「このお部屋、どんな風に生まれ変わるか楽しみ！」',
        '「古い水回りがきれいになったら嬉しいな！」',
        '「見違えるような住み心地、楽しみにしてます！」'
      ];
    } else if (badge.includes('シニア')) {
      lines = [
        '「二人で庭を眺めながらお茶したいねぇ。」',
        '「無理なく暮らせる間取りがいいわね。」',
        '「和室でほっと一息つけると嬉しいよ。」',
        '「セカンドライフが楽しみになる家を！」'
      ];
    } else if (badge.includes('二世帯')) {
      lines = [
        '「孫の声も親の安心も両立したいわ！」',
        '「朝の支度が被らない水回りが希望です。」',
        '「大リビングと各自の個室があると安心！」',
        '「4人仲良く暮らせる間取りが楽しみ♪」'
      ];
    } else if (badge.includes('大家族')) {
      lines = [
        '「毎朝トイレ大行列なんです…助けて！」',
        '「みんなが走り回れる広さが希望です！」',
        '「家事動線がスムーズだと大助かり！」'
      ];
    } else if (badge.includes('ファミリー')) {
      lines = [
        '「子どもが伸び伸び育つ明るい家に！」',
        '「家族で料理しやすい動線が嬉しいなぁ♪」',
        '「成長に備えて収納もしっかり欲しい！」',
        '「みんなで内見に行くのが楽しみです！」'
      ];
    } else if (badge.includes('和モダン')) {
      lines = [
        '「快適フローリングと畳の癒やし両方♪」',
        '「休日はお風呂と和室で温泉旅館気分♪」',
        '「今どきの和モダンな雰囲気だと嬉しいな！」',
        '「お茶が似合う落ち着く住まいを頼みます！」'
      ];
    } else if (badge.includes('DINKS')) {
      lines = [
        '「忙しい二人には暮らしやすさが大事！」',
        '「休日は二人でリビングでのんびり♪」',
        '「収納と洗面が使いやすいと最高だな！」',
        '「二人にぴったりな設計をお願いします！」'
      ];
    } else if (badge.includes('ミニマリスト')) {
      lines = [
        '「荷物はカバン2つ！ムダな広さ不要！」',
        '「ユニットバスでも大歓迎！家賃は抑えたいな！」',
        '「小さくても機能美あふれる空間をぜひ！」',
        '「ムダを削いだミニマルな暮らしが夢です！」'
      ];
    } else if (badge.includes('ワーカー')) {
      lines = [
        '「一日中いるので仕事スペースが命です！」',
        '「会議前にサッと使える洗面台が欲しくて。」',
        '「仕事と休憩を切り替えられる間取りに！」',
        '「カフェ並みに集中できる部屋をお願い！」'
      ];
    } else if (badge.includes('おしゃれ')) {
      lines = [
        '「季節ごとの服と靴が入る収納が必須〜！」',
        '「友達を呼べるセンスのいい部屋がいいな♪」',
        '「身支度が楽しくなる動線、期待してます！」',
        '「かわいくて居心地のいいお部屋にしてね♪」'
      ];
    } else if (badge.includes('陽だまり')) {
      lines = [
        '「朝、窓からポカポカ陽が入ると幸せ〜♪」',
        '「お気に入りのマグで飲む珈琲が楽しみ！」',
        '「観葉植物も元気に育つ部屋がいいな🌿」',
        '「明るい光あふれる素敵な間取りをぜひ！」'
      ];
    } else if (badge.includes('初回モデル')) {
      lines = [
        '「初めての一人暮らし、ワクワクします！」',
        '「シンプルで暮らしやすい部屋がいいな♪」',
        '「どんなお部屋になるか楽しみです！」'
      ];
    } else {
      lines = [
        '「新生活、素敵な間取りだといいなぁ！」',
        '「無理ない家賃で快適な部屋を探してます！」',
        '「水回りの使い勝手はやっぱり大事ですね！」',
        '「プロの間取りプラン、楽しみにしてます！」'
      ];
    }
    const idx = (typeof lastIdx === 'number' && lastIdx >= 0)
      ? (lastIdx + 1) % lines.length
      : Math.floor(Math.random() * lines.length);
    return { text: lines[idx], idx };
  }

  global.PixelRenderer = {
    drawPixelBoard,
    buildFurniturePlan,
    collectFurnitureCatalogIds,
    startCompletionTour,
    stopActiveTour,
    setTourSpeed,
    loadTestPreset,
    resolveClientActors: selectTourActors,
    renderClientPortraitCanvas,
    startMissionIdle,
    stopMissionIdle,
    startMissionSelectIdle,
    stopMissionSelectIdle,
    getClientTapSpeech,
    getEdgeType: (targetGrid, r1, c1, r2, c2) => safeEdgeType(targetGrid, r1, c1, r2, c2, typeof edgeType === 'function' ? edgeType : null),
    hasSolidWall: (targetGrid, r1, c1, r2, c2) => hasCellSolidWall(targetGrid, r1, c1, r2, c2),
    getSpeed: () => tourSpeed
  };
})(window);
