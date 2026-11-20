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

  /* ============================================================
     2. 家具レイアウトプランナー (STEP2_PIXEL_SPEC 第6章準拠)
  ============================================================ */
  function buildFurniturePlan(targetGrid, combos, visited, stageObj) {
    const comboNames = new Set((combos || []).map(c => typeof c === 'string' ? c : c.name));
    const { rooms, gardenClusters } = analyzeRoomsAndClusters(targetGrid, visited);
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

    const pickSnapDir = (eInfo, preferSide = false, preferNorth = true) => {
      if (preferSide) {
        if (eInfo.hasSolidLeft) return 'west';
        if (eInfo.hasSolidRight) return 'east';
        if (eInfo.wLeft) return 'west';
        if (eInfo.wRight) return 'east';
      }
      if (!preferNorth && eInfo.wBottom) return 'south';
      // 窓なし壁を優先（窓の前に本棚等を置かない工夫）
      if (eInfo.hasSolidTop) return 'north';
      if (eInfo.hasSolidLeft) return 'west';
      if (eInfo.hasSolidRight) return 'east';
      if (eInfo.wTop) return 'north';
      if (eInfo.wLeft) return 'west';
      if (eInfo.wRight) return 'east';
      if (eInfo.wBottom) return 'south';
      return 'center';
    };

    // 壁寄せ配置（壁が1辺もないセルには置かない：requireWall）
    const findWallSingle = (cells, cellSet, preferNorth = true, opts = {}) => {
      const { preferSide = false, requireWall = true } = opts;
      const freeCells = cells.filter(pt => isFree(pt.r, pt.c, 1, 1, cellSet));
      const candidates = freeCells.map(pt => {
        const e = getCellEdges(pt.r, pt.c);
        const hasAnyWall = e.wTop || e.wLeft || e.wRight || e.wBottom;
        let score = 0;
        if (preferSide) {
          if (e.wLeft || e.wRight) score += 150;
          if (e.hasSolidLeft || e.hasSolidRight) score += 30;
          if (e.wTop) score += 40;
          if (e.wBottom) score += 20;
        } else {
          if (e.hasSolidTop) score += preferNorth ? 140 : 70;
          else if (e.wTop) score += preferNorth ? 95 : 55;
          if (e.hasSolidLeft || e.hasSolidRight) score += 90;
          else if (e.wLeft || e.wRight) score += 70;
          if (e.wBottom) score += preferNorth ? 35 : 110;
        }
        if (e.hasDoor) score -= 45;
        return { pt, score, hasAnyWall, snap: pickSnapDir(e, preferSide, preferNorth) };
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
          if (e1.hasDoor || e2.hasDoor) score -= 50;
          const snap = (e1.wTop && e2.wTop) ? 'north' : ((e1.wBottom && e2.wBottom) ? 'south' : (e1.wTop || e2.wTop ? 'north' : 'center'));
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
          if (e1.hasDoor || e2.hasDoor) score -= 45;
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
          return { pt, score: -dist * 10 - (e.hasDoor ? 25 : 0) };
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
    const isFortress = comboNames.has('要塞化');
    const isGlassHouse = comboNames.has('ガラス張りハウス');
    const hasTanoji = comboNames.has('古き良き日本家屋');
    const hasWaterGate = comboNames.has('水門');
    const hasInfinityLoop = comboNames.has('無限回廊');
    const wallDecoRooms = []; // 立ち上がり北壁に掛ける装飾情報
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

      // 4) 浴室（通常 / セレブ浴室 / もはや銭湯：富士山は立ち上がり北壁に貼る！）
      if (rm.type === T.BATH) {
        if (count >= 8) {
          const fujiWallCell = rm.cells.find(pt => {
            const e1 = getCellEdges(pt.r, pt.c);
            const e2 = getCellEdges(pt.r, pt.c + 1);
            return cellSet.has(`${pt.r},${pt.c + 1}`) && e1.wTop && e2.wTop;
          });
          if (fujiWallCell) {
            wallDecoRooms.push({ type: 'fuji', r: fujiWallCell.r, c: fujiWallCell.c, wCells: 2 });
          } else {
            const fujiPt = findWallPair(rm.cells, cellSet, true);
            if (fujiPt) addItem('furn_fuji', fujiPt.r, fujiPt.c, 2, 1, rm.key, { snap: 'north' });
          }
          const tubPt = findCenterSingle(rm.cells, cellSet);
          if (tubPt && isFree(tubPt.r, tubPt.c, 2, 1, cellSet)) {
            addItem('furn_sento_tub', tubPt.r, tubPt.c, 2, 1, rm.key, { steam: true, snap: 'center' });
          } else {
            const tp = findWallPair(rm.cells, cellSet, true);
            if (tp) addItem('furn_sento_tub', tp.r, tp.c, 2, 1, rm.key, { steam: true, snap: tp.snap });
          }
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
          const pPlant = findWallSingle(rm.cells, cellSet, false);
          if (pPlant) addItem('furn_plant', pPlant.r, pPlant.c, 1, 1, rm.key, { snap: pPlant.snap });
        } else {
          const p1 = findWallSingle(rm.cells, cellSet, true);
          if (p1) addItem('furn_bath_tub', p1.r, p1.c, 1, 1, rm.key, { steam: true, snap: p1.snap });
        }
        continue;
      }

      // 5) トイレ（通常 / 秘密のトイレ / バカデカトイレ両採用）
      if (rm.type === T.TOILET) {
        if (isHiddenAccess) {
          const scrollPt = rm.cells.find(pt => getCellEdges(pt.r, pt.c).hasSolidTop);
          if (scrollPt) wallDecoRooms.push({ type: 'scroll_ninja', r: scrollPt.r, c: scrollPt.c });
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

      // 6) 洗面所（壁寄せ）
      if (rm.type === T.WASHROOM) {
        const p1 = findWallSingle(rm.cells, cellSet, true);
        if (p1) addItem('furn_washbasin', p1.r, p1.c, 1, 1, rm.key, { snap: p1.snap });
        if (count >= 2) {
          const p2 = findWallSingle(rm.cells, cellSet, false);
          if (p2) addItem('furn_washer', p2.r, p2.c, 1, 1, rm.key, { snap: p2.snap });
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

      // 8) LDK (要塞化時は監視モニター＋備蓄も併設)
      if (rm.type === T.LDK) {
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
        if (isFortress) {
          const supPt = findWallSingle(rm.cells, cellSet, false);
          if (supPt) addItem('furn_supplies', supPt.r, supPt.c, 1, 1, rm.key, { snap: supPt.snap });
        }
        if (count >= 3 && count < 6) {
          const dPt = findCenterSingle(rm.cells, cellSet);
          if (dPt) addItem('furn_dining', dPt.r, dPt.c, 1, 1, rm.key, { snap: 'center' });
        }
        if (count >= 6) {
          const fPt = findWallSingle(rm.cells, cellSet, true);
          if (fPt) addItem('furn_fridge', fPt.r, fPt.c, 1, 1, rm.key, { snap: fPt.snap });
          const sH = findWallPair(rm.cells, cellSet, false);
          if (sH) {
            addItem('furn_sofa', sH.r, sH.c, 2, 1, rm.key, { snap: sH.snap });
          } else {
            const sV = findWallVerticalPair(rm.cells, cellSet);
            if (sV) addItem(`furn_sofa_v_${sV.snap}`, sV.r, sV.c, 1, 2, rm.key, { snap: sV.snap });
            else {
              const dPt = findCenterSingle(rm.cells, cellSet);
              if (dPt) addItem('furn_dining', dPt.r, dPt.c, 1, 1, rm.key, { snap: 'center' });
            }
          }
          if (count >= 8) {
            const tPt = findWallSingle(rm.cells, cellSet, true);
            if (tPt) addItem(isFortress ? 'furn_fortress_console' : 'furn_tv', tPt.r, tPt.c, 1, 1, rm.key, { snap: tPt.snap });
          }
        }
        continue;
      }

      // 9) 和室
      if (rm.type === T.ROOM && (rm.label === '和室' || rm.pieceLibId === 'room-wa' || rm.pieceLibId === 'room-wa2')) {
        const mode = hasTanoji ? (washitsuIdx % 4) : 0;
        washitsuIdx++;
        const kakePt = rm.cells.find(pt => {
          const e = getCellEdges(pt.r, pt.c);
          return e.wTop && e.top !== E.WINDOW;
        });
        if (kakePt) {
          wallDecoRooms.push({ type: isHiddenAccess ? 'scroll_ninja' : 'kakejiku', r: kakePt.r, c: kakePt.c });
        }
        if (isHiddenAccess) {
          const ng = findCenterSingle(rm.cells, cellSet);
          if (ng) addItem('furn_ninja_gear', ng.r, ng.c, 1, 1, rm.key, { snap: 'center' });
          const sb = findWallSingle(rm.cells, cellSet, false);
          if (sb) addItem('furn_safe_box', sb.r, sb.c, 1, 1, rm.key, { snap: sb.snap });
          continue;
        }
        if (mode === 1) {
          const f1 = findWallSingle(rm.cells, cellSet, true, { requireWall: false });
          if (f1) addItem('furn_futon', f1.r, f1.c, 1, 1, rm.key, { snap: f1.snap });
          const f2 = findWallSingle(rm.cells, cellSet, true, { requireWall: false });
          if (f2) addItem('furn_futon', f2.r, f2.c, 1, 1, rm.key, { snap: f2.snap });
        } else if (mode === 2) {
          const kt = findCenterSingle(rm.cells, cellSet);
          if (kt) addItem('furn_kotatsu', kt.r, kt.c, 1, 1, rm.key, { snap: 'center' });
        } else if (mode === 3) {
          const ch = findCenterSingle(rm.cells, cellSet);
          if (ch) addItem('furn_chabudai', ch.r, ch.c, 1, 1, rm.key, { snap: 'center' });
          const tk = findWallSingle(rm.cells, cellSet, true);
          if (tk) addItem('furn_tokonoma', tk.r, tk.c, 1, 1, rm.key, { snap: tk.snap });
        } else {
          const ch = findCenterSingle(rm.cells, cellSet);
          if (ch) addItem('furn_chabudai', ch.r, ch.c, 1, 1, rm.key, { snap: 'center' });
          if (count >= 4 && !kakePt) {
            const tk = findWallSingle(rm.cells, cellSet, true);
            if (tk) addItem('furn_tokonoma', tk.r, tk.c, 1, 1, rm.key, { snap: tk.snap });
          }
          if (count >= 6) {
            const kt = findCenterSingle(rm.cells, cellSet);
            if (kt) addItem('furn_kotatsu', kt.r, kt.c, 1, 1, rm.key, { snap: 'center' });
          }
        }
        continue;
      }

      // 10) 洋室 (隠し部屋なら忍具＋金庫、要塞化なら監視コンソール＋備蓄、通常ならベッド＆デスク)
      if (rm.type === T.ROOM) {
        if (isHiddenAccess) {
          const wallPt = rm.cells.find(pt => getCellEdges(pt.r, pt.c).hasSolidTop);
          if (wallPt) wallDecoRooms.push({ type: 'scroll_ninja', r: wallPt.r, c: wallPt.c });
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
        if (count >= 6) {
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
          const dk = findWallSingle(rm.cells, cellSet, true);
          if (dk) addItem('furn_desk', dk.r, dk.c, 1, 1, rm.key, { snap: dk.snap });
          const bk = findWallSingle(rm.cells, cellSet, false);
          if (bk) addItem('furn_bookshelf', bk.r, bk.c, 1, 1, rm.key, { snap: bk.snap });
        } else if (count >= 3) {
          const bs = findWallSingle(rm.cells, cellSet, true);
          if (bs) addItem('furn_bed_s', bs.r, bs.c, 1, 1, rm.key, { snap: bs.snap });
          const dk = findWallSingle(rm.cells, cellSet, true);
          if (dk) addItem('furn_desk', dk.r, dk.c, 1, 1, rm.key, { snap: dk.snap });
        } else {
          const bs = findWallSingle(rm.cells, cellSet, true, { requireWall: false });
          if (bs) addItem('furn_bed_s', bs.r, bs.c, 1, 1, rm.key, { snap: bs.snap });
        }
      }
    }

    // 11) 庭クラスター配置（もはや公園 / 広大なる庭園 / 箱庭 / 小庭）
    const isParkCombo = comboNames.has('もはや公園');
    for (const cluster of gardenClusters) {
      const cSet = new Set(cluster.map(x => `${x.r},${x.c}`));
      const len = cluster.length;
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
        const pd = findHorizontalPair(cluster, cSet, true);
        if (pd) addItem('furn_pond', pd.r, pd.c, 2, 1, null);
        const gt = findSingleCell(cluster, cSet, false);
        if (gt) addItem('furn_garden_table', gt.r, gt.c, 1, 1, null);
        const ln = findSingleCell(cluster, cSet, true);
        if (ln) addItem('furn_lantern', ln.r, ln.c, 1, 1, null);
        const tr1 = findSingleCell(cluster, cSet, true);
        if (tr1) addItem('furn_tree', tr1.r, tr1.c, 1, 1, null);
        const fl1 = findSingleCell(cluster, cSet, false);
        if (fl1) addItem('furn_flower', fl1.r, fl1.c, 1, 1, null);
      } else if (len >= 4) {
        const ln = findSingleCell(cluster, cSet, true);
        if (ln) addItem('furn_lantern', ln.r, ln.c, 1, 1, null);
        const tr = findSingleCell(cluster, cSet, true);
        if (tr) addItem('furn_tree', tr.r, tr.c, 1, 1, null);
        const fl = findSingleCell(cluster, cSet, false);
        if (fl) addItem('furn_flower', fl.r, fl.c, 1, 1, null);
      } else if (len >= 2) {
        const fl = findSingleCell(cluster, cSet, false);
        if (fl) addItem('furn_flower', fl.r, fl.c, 1, 1, null);
      }
    }

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

    return { items, darkRooms, isGlassHouse, isFortress, comboNames, rooms, wallDecoRooms, sunnyRoomKeys, hiddenRoomKeys, badSpots };
  }

  /* ============================================================
     3. 2Dゼルダ風トップダウン盤面描画
  ============================================================ */
  function getFloorAssetId(cell, inBox, darkRooms) {
    if (!cell || cell.type === T.EMPTY || cell.type === T.GARDEN) {
      return inBox ? 'floor_garden' : 'floor_outside';
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

  function drawPixelWallEdge(ctx, x1, y1, x2, y2, r1, c1, r2, c2, ori, cs, targetGrid, showSolidRedOverlay, enable25DWalls = false) {
    const et = safeEdgeType(targetGrid, r1, c1, r2, c2, typeof edgeType === 'function' ? edgeType : null);
    if (et === E.NONE) return;

    const gSize = targetGrid.length;
    const c1_cell = (r1 >= 0 && r1 < gSize && c1 >= 0 && c1 < gSize) ? targetGrid[r1][c1] : null;
    const c2_cell = (r2 >= 0 && r2 < gSize && c2 >= 0 && c2 < gSize) ? targetGrid[r2][c2] : null;
    const isExt = !c1_cell || c1_cell.type === T.EMPTY || c1_cell.type === T.GARDEN || c1_cell.type === T.OBSTACLE ||
                  !c2_cell || c2_cell.type === T.EMPTY || c2_cell.type === T.GARDEN || c2_cell.type === T.OBSTACLE;
    const isSolid = hasCellSolidWall(targetGrid, r1, c1, r2, c2);

    ctx.save();
    const wallThick = Math.max(2, Math.round(cs * (isExt ? 0.13 : 0.09)));

    if (et === E.DOOR) {
      // 2Dゼルダ風ドア・襖
      const len = ori === 'h' ? Math.abs(x2 - x1) : Math.abs(y2 - y1);
      const post = Math.round(len * 0.18);
      const isWashitsu = Boolean(
        (c1_cell && c1_cell.label === '和室') || (c2_cell && c2_cell.label === '和室')
      );
      const isHidden = Boolean(
        ((c1_cell?.type === T.CLOSET && (c2_cell?.type === T.ROOM || c2_cell?.type === T.TOILET)) ||
         (c2_cell?.type === T.CLOSET && (c1_cell?.type === T.ROOM || c1_cell?.type === T.TOILET)))
      );

      ctx.fillStyle = '#334155';
      if (ori === 'h') {
        ctx.fillRect(x1, y1 - wallThick / 2, post, wallThick);
        ctx.fillRect(x2 - post, y1 - wallThick / 2, post, wallThick);
        if (!enable25DWalls) {
          // フラット時のみ境界線上に敷居＋扉板を描画（2.5D時は立ち上がり壁面に描画済み）
          ctx.fillStyle = isHidden ? '#78350f' : (isWashitsu ? '#d97706' : '#92400e');
          ctx.fillRect(x1 + post, y1 - 1.5, len - post * 2, 3);
          ctx.fillStyle = isHidden ? '#92400e' : (isWashitsu ? '#fef3c7' : '#b45309');
          const dw = Math.round((len - post * 2) * 0.55);
          if (isWashitsu) {
            ctx.fillRect(x1 + post, y1 - 2, dw, 4);
            ctx.strokeStyle = '#78350f';
            ctx.lineWidth = 1;
            ctx.strokeRect(x1 + post, y1 - 2, dw, 4);
          } else {
            ctx.fillRect(x1 + post, y1, 4, dw);
            ctx.fillStyle = '#facc15';
            ctx.fillRect(x1 + post + 1, y1 + dw - 3, 2, 2);
          }
        } else {
          ctx.fillStyle = isWashitsu ? '#d97706' : '#78350f';
          ctx.fillRect(x1 + post, y1 - 1, len - post * 2, 2);
        }
      } else {
        ctx.fillRect(x1 - wallThick / 2, y1, wallThick, post);
        ctx.fillRect(x1 - wallThick / 2, y2 - post, wallThick, post);
        ctx.fillStyle = isHidden ? '#78350f' : (isWashitsu ? '#d97706' : '#92400e');
        ctx.fillRect(x1 - 1.5, y1 + post, 3, len - post * 2);
        ctx.fillStyle = isHidden ? '#92400e' : (isWashitsu ? '#fef3c7' : '#b45309');
        const dw = Math.round((len - post * 2) * 0.55);
        if (isWashitsu) {
          ctx.fillRect(x1 - 2, y1 + post, 4, dw);
          ctx.strokeStyle = '#78350f';
          ctx.lineWidth = 1;
          ctx.strokeRect(x1 - 2, y1 + post, 4, dw);
        } else {
          ctx.fillRect(x1, y1 + post, dw, 4);
          ctx.fillStyle = '#facc15';
          ctx.fillRect(x1 + dw - 3, y1 + post + 1, 2, 2);
        }
      }
      ctx.restore();
      return;
    }

    // 壁（外壁は濃い外枠＋白い天面、内壁は木目・暗め枠）
    const borderCol = isExt ? '#0f172a' : '#334155';
    const topCol = isExt ? '#e2e8f0' : '#cbd5e1';
    if (ori === 'h') {
      const w = x2 - x1;
      ctx.fillStyle = borderCol;
      ctx.fillRect(x1 - wallThick / 2, y1 - wallThick / 2, w + wallThick, wallThick);
      ctx.fillStyle = topCol;
      ctx.fillRect(x1, y1 - wallThick / 2 + 1, w, Math.max(1, wallThick - 2));
      if (et === E.WINDOW && !isSolid) {
        const winStart = x1 + Math.round(w * 0.22);
        const winLen = Math.round(w * 0.56);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(winStart, y1 - wallThick / 2 + 1, winLen, Math.max(2, wallThick - 2));
        ctx.fillStyle = '#e0f2fe';
        ctx.fillRect(winStart + 2, y1 - wallThick / 2 + 1, Math.max(2, Math.round(winLen * 0.4)), 1);
      }
    } else {
      const h = y2 - y1;
      ctx.fillStyle = borderCol;
      ctx.fillRect(x1 - wallThick / 2, y1 - wallThick / 2, wallThick, h + wallThick);
      ctx.fillStyle = topCol;
      ctx.fillRect(x1 - wallThick / 2 + 1, y1, Math.max(1, wallThick - 2), h);
      if (et === E.WINDOW && !isSolid) {
        const winStart = y1 + Math.round(h * 0.22);
        const winLen = Math.round(h * 0.56);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(x1 - wallThick / 2 + 1, winStart, Math.max(2, wallThick - 2), winLen);
        ctx.fillStyle = '#e0f2fe';
        ctx.fillRect(x1 - wallThick / 2 + 1, winStart + 2, 1, Math.max(2, Math.round(winLen * 0.4)));
      }
    }

    // パズル中のみ：赤壁（耐力壁）を明示的に赤線オーバーレイ表示
    if (isSolid && showSolidRedOverlay) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    ctx.restore();
  }

  function isOccupiedCell(cell) {
    return Boolean(cell && cell.type !== T.EMPTY && cell.type !== T.GARDEN && cell.type !== T.OBSTACLE);
  }

  // 玄関セル専用：外向き(facing.dir)に応じて土間・上がり框・靴・廊下床を描き分ける
  function drawEntranceFloorAndShoes(ctx, targetGrid, r, c, cs, facing, enable25DWalls, entranceBoxSnap = null) {
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
    ctx.restore();
  }

  // 完成時専用：2.5D 北側立ち上がり壁面（高さ約42%：1.55倍拡大！）＋ 南側外壁外観 ＋ 窓・壁装飾・外扉
  function draw25DWallsAndDeco(ctx, targetGrid, cs, plan, stageObj, facing) {
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
            // 立ち上がり壁＋ドア開口
            const post = Math.round(cs * 0.18);
            const dw = cs - post * 2;
            ctx.fillStyle = wallBg;
            ctx.fillRect(x, y, post, wallH);
            ctx.fillRect(x + cs - post, y, post, wallH);
            ctx.fillStyle = trimCol;
            ctx.fillRect(x, y + wallH - 3, post, 3);
            ctx.fillRect(x + cs - post, y + wallH - 3, post, 3);
            // ドア枠と扉板
            const doorIsWa = isWashitsu || (cTop && cTop.label === '和室');
            ctx.fillStyle = '#78350f';
            ctx.fillRect(x + post, y, dw, 2);
            ctx.fillStyle = doorIsWa ? '#fef3c7' : '#b45309';
            ctx.fillRect(x + post + 1, y + 2, Math.round(dw * 0.45), wallH - 2);
            ctx.strokeStyle = '#78350f';
            ctx.lineWidth = 1;
            ctx.strokeRect(x + post + 1, y + 2, Math.round(dw * 0.45), wallH - 2);
            if (!doorIsWa) {
              ctx.fillStyle = '#facc15';
              ctx.fillRect(x + post + Math.round(dw * 0.34), y + Math.round(wallH * 0.52), 2, 2);
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
              // 左右の小さなカーテン
              ctx.fillStyle = '#f59e0b';
              ctx.fillRect(winX - 2, winY, 3, winH);
              ctx.fillRect(winX + winW - 1, winY, 3, winH);
            } else {
              // 壁面装飾（富士山壁画、掛け軸、廊下の絵、時計）
              const key = `${r},${c}`;
              const wd = wallDecoMap.get(key);
              if (wd && wd.type === 'fuji') {
                PixelAssets.drawSprite(ctx, 'wall_fuji', x + 1, y + 2, cs * 2 - 2, wallH - 5);
                skipCells.add(`${r},${c + 1}`);
              } else if (wd && wd.type === 'kakejiku') {
                PixelAssets.drawSprite(ctx, 'wall_kakejiku', x, y + 2, cs, wallH - 4);
              } else if (wd && wd.type === 'scroll_ninja') {
                PixelAssets.drawSprite(ctx, 'wall_scroll_ninja', x, y + 2, cs, wallH - 4);
              } else if (!skipCells.has(key)) {
                if (cCur.type === T.CORRIDOR && ((r * 7 + c * 11) % 3 === 0)) {
                  const artId = ((r + c) % 2 === 0) ? 'wall_art_1' : 'wall_art_2';
                  PixelAssets.drawSprite(ctx, artId, x, y + 2, cs, wallH - 4);
                } else if (cCur.type === T.LDK && ((r * 3 + c * 5) % 4 === 1)) {
                  PixelAssets.drawSprite(ctx, 'wall_clock', x, y + 2, cs, wallH - 5);
                } else if (cCur.type === T.ROOM && !isWashitsu && ((r * 5 + c * 9) % 4 === 0)) {
                  PixelAssets.drawSprite(ctx, 'wall_art_1', x, y + 2, cs, wallH - 4);
                }
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
            const winW = Math.round(cs * 0.54);
            const winX = x + Math.round((cs - winW) / 2);
            ctx.fillStyle = '#475569';
            ctx.fillRect(winX - 1, y + 2, winW + 2, Math.max(4, extH - 5));
            ctx.fillStyle = '#38bdf8';
            ctx.fillRect(winX, y + 3, winW, Math.max(3, extH - 7));
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

  function drawPixelBoard(ctx, targetGrid, cs, opts = {}) {
    const gSize = targetGrid.length;
    const {
      showFurniture = true,
      enable25DWalls = false,
      showBlueprintOverlay = false,
      showSolidRedOverlay = false,
      furniturePlan = null,
      furnitureElapsedMs = 99999,
      timeMs = 0,
      combos = [],
      stageObj = (typeof STAGE !== 'undefined' ? STAGE : null)
    } = opts;

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
          drawEntranceFloorAndShoes(ctx, targetGrid, r, c, cs, facing, enable25DWalls, entBoxSnapMap.get(`${r},${c}`) || null);
        } else {
          let floorId = getFloorAssetId(cell, inBox, plan.darkRooms);
          if (isDarkSealed && cell && cell.type !== T.CORRIDOR) {
            floorId = 'floor_darkness';
          }
          PixelAssets.drawSprite(ctx, floorId, x, y, cs, cs);
        }

        // 廊下コンボの床装飾（大ホワイエ／ロングコリドー）
        if (cell && cell.type === T.CORRIDOR) {
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

    // 玄関直風呂のつるっと水たまり（床層）
    if (showFurniture && Array.isArray(plan.badSpots)) {
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
      draw25DWallsAndDeco(ctx, targetGrid, cs, plan, stageObj, facing);
    }

    // 3. 家具描画（ポップバウンス & 壁寄せオフセット対応！）
    if (showFurniture && plan.items) {
      const fn = typeof edgeType === 'function' ? edgeType : null;
      for (const item of plan.items) {
        const localMs = furnitureElapsedMs - (item.delayMs || 0);
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

        // 壁寄せ・2.5D北壁への食い込み防止オフセット
        let offX = 0, offY = 0;
        const topEt = safeEdgeType(targetGrid, item.r - 1, item.c, item.r, item.c, fn);
        const hasNorthWall = (topEt === E.WALL || topEt === E.WINDOW || topEt === E.DOOR);

        if (item.assetId === 'furn_shoesbox_slim') {
          if (enable25DWalls && hasNorthWall && item.snap !== 'south') {
            offY = Math.round(cs * 0.20);
          }
        } else if (enable25DWalls) {
          if (item.snap === 'north') {
            offY = hasNorthWall ? Math.round(cs * 0.24) : 0;
          } else if (item.snap === 'west' || item.snap === 'east') {
            // 左右壁ぴったりスプライトは x=0/x=23 側に描画済みのため offX=0 で完全密着
            offY = hasNorthWall ? Math.round(cs * 0.16) : 0;
          } else if (item.snap === 'south') {
            offY = 0;
          } else if (hasNorthWall) {
            offY = Math.round(cs * 0.22);
          }
        }

        const bx = item.c * cs + offX;
        const by = item.r * cs + offY;
        const bw = (item.wCells || 1) * cs;
        const bh = (item.hCells || 1) * cs;
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

        if (t >= 1 && item.steam) {
          const phase = ((timeMs / 450) + item.c * 0.4) % 1;
          ctx.fillStyle = `rgba(255, 255, 255, ${0.55 * (1 - phase)})`;
          const sx = cx - 4 + Math.sin(timeMs / 300 + item.r) * 3;
          const sy = by + bh * 0.35 - phase * (cs * 0.35);
          ctx.fillRect(Math.round(sx), Math.round(sy), Math.max(2, cs * 0.08), Math.max(2, cs * 0.08));
          ctx.fillRect(Math.round(sx + 6), Math.round(sy + 4), Math.max(2, cs * 0.06), Math.max(2, cs * 0.06));
        }
        if (t >= 1 && item.candle) {
          const flicker = 0.2 + 0.1 * Math.sin(timeMs / 110);
          ctx.fillStyle = `rgba(251, 146, 60, ${flicker})`;
          ctx.beginPath();
          ctx.arc(cx, cy - cs * 0.1, cs * 0.55, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 4. 境界壁（天面・縦壁・室内ドア）描画
    for (let r = 0; r < gSize; r++) {
      for (let c = 0; c < gSize; c++) {
        const x = c * cs, y = r * cs;
        drawPixelWallEdge(ctx, x + cs, y, x + cs, y + cs, r, c, r, c + 1, 'v', cs, targetGrid, showSolidRedOverlay, enable25DWalls);
        drawPixelWallEdge(ctx, x, y + cs, x + cs, y + cs, r, c, r + 1, c, 'h', cs, targetGrid, showSolidRedOverlay, enable25DWalls);
        if (r === 0) drawPixelWallEdge(ctx, x, y, x + cs, y, -1, c, r, c, 'h', cs, targetGrid, showSolidRedOverlay, enable25DWalls);
        if (c === 0) drawPixelWallEdge(ctx, x, y, x, y + cs, r, -1, r, c, 'v', cs, targetGrid, showSolidRedOverlay, enable25DWalls);
      }
    }

    // 4.5 バッドコンボ視覚エフェクト（食欲減退の悪臭モヤ / スケルトンバス視線）
    if (showFurniture && enable25DWalls && Array.isArray(plan.badSpots)) {
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

    // 6. パズル中プレビュー時の部屋名ミニラベル（操作補助）
    if (showBlueprintOverlay) {
      ctx.font = `bold ${Math.max(8, Math.round(cs * 0.22))}px "Zen Kaku Gothic New", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const rm of plan.rooms) {
        if (rm.type === T.CORRIDOR && rm.cells.length <= 1) continue;
        const ax = (rm.cells.reduce((s, p) => s + p.c, 0) / rm.cells.length + 0.5) * cs;
        const ay = (rm.cells.reduce((s, p) => s + p.r, 0) / rm.cells.length + 0.5) * cs;
        const txt = rm.type === T.ENTRANCE ? '玄関' : (rm.label || '');
        if (!txt) continue;
        ctx.strokeStyle = 'rgba(255,255,255,0.92)';
        ctx.lineWidth = 3;
        ctx.strokeText(txt, ax, ay);
        ctx.fillStyle = '#0f172a';
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
      return { actors: ['char_senior_m', 'char_suit', 'char_casual_pink', 'char_kid_1'], isVampire: false, label: '二世帯ファミリー(4人)' };
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
      if (comboNames.has('要塞化')) return { text: '🛡️ 光ゼロ！完璧な要塞シェルター', mood: 'weird' };
      if (rm.label === '和室' && comboNames.has('古き良き日本家屋')) return { text: '🏮 伝統の田の字和室だ…！', mood: 'love' };
      if (comboNames.has('マトリョーシカ')) return { text: '🪆 部屋の奥にまた部屋が…', mood: 'bad' };
      if (rm.label === '和室') return { text: '🍵 畳の香りが落ち着く〜', mood: 'good' };
      return { text: '🛏️ 落ち着けるお部屋だ！', mood: 'good' };
    }
    if (rm.type === T.CLOSET) {
      if (comboNames.has('収納が本体') && rm.cells.length >= 8) return { text: '📦 ほぼ倉庫なんですけど！？', mood: 'weird' };
      return { text: '👕 たっぷり収納できそう！', mood: 'good' };
    }
    if (rm.type === T.CORRIDOR) {
      if (comboNames.has('無限回廊')) {
        return { text: targetName === '無限回廊' ? '🧘 永遠に歩ける瞑想空間！最高！' : '🌀 ぐるぐる回れる無限回廊…！', mood: 'love' };
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
      steps.push({ type: 'pause', speech: '🌊 玄関から水回り直結「水門」だ！', mood: 'weird', durationMs: 950 });
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
    if (bigGarden && comboNames.has('もはや公園')) {
      steps.push({ type: 'pause', speech: '🏞️ 庭がもはや児童公園だ！', mood: 'love', durationMs: 1100 });
    } else if (comboNames.has('広大なる庭園')) {
      steps.push({ type: 'pause', speech: '🌳 鯉の泳ぐ日本庭園が素敵！', mood: 'love', durationMs: 1000 });
    } else if (comboNames.has('箱庭のある暮らし')) {
      steps.push({ type: 'pause', speech: '🎍 石灯籠の箱庭が落ち着く〜', mood: 'good', durationMs: 900 });
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
    const furniturePlan = buildFurniturePlan(gridData, combos, visited, stageObj);
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
    STAGE.customCombo = null;
    STAGE.requests = (typeof REQUEST_REGISTRY !== 'undefined')
      ? [{ ...REQUEST_REGISTRY.btsep }, { ...REQUEST_REGISTRY.reach }].filter(Boolean)
      : (STAGE.requests || []);
    const gSize = GRID;
    for (let r = 0; r < gSize; r++) {
      for (let c = 0; c < gSize; c++) {
        grid[r][c] = makeCell(T.EMPTY, 0, '', 0);
      }
    }
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
      STAGE.client = { name: 'ドラクル伯爵（自称・夜勤）', avatar: '🧛', quote: '「陽の光は苦手でしてね…完全密室があれば壁を抜けますぞ。」', typeBadge: '吸血鬼（案B）' };
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
      STAGE.client = { name: '霧隠 翔（現代の忍）', avatar: '🥷', quote: '「収納の奥に隠し部屋（＆要塞空間）を頼むでござる！」', typeBadge: '現代の忍（案B）' };
      STAGE.customCombo = { name: '隠し部屋', normalBonus: 1.5, customBonus: 5.5, isNegativeInversion: false, hint: '収納経由でのみ入れる居室 (+5.5万)' };
      setEnt(8, 3, 'bottom');
      fillRect(7, 3, 1, 2, T.CORRIDOR, '廊下', 'corr-1', 1);
      fillRect(6, 3, 1, 2, T.CLOSET, '収納', 'closet', 1.5);
      fillRect(4, 3, 2, 2, T.ROOM, '和室', 'room-wa', 3); // 収納(6,3)の上のみ接続＝隠し部屋！
      fillRect(5, 5, 2, 3, T.LDK, 'LDK', 'ldk-23', 4.3);
      fillRect(7, 6, 1, 1, T.TOILET, 'WC', 'toilet', 4);
      fillRect(7, 7, 1, 1, T.BATH, '浴室', 'bath', 6);
    } else if (presetId === 'ng_inverted') {
      STAGE.client = { name: '湯川 哲郎（風呂マニア）', avatar: '🛁', quote: '「帰宅0秒で風呂に飛び込みたい！玄関直結浴室が最高！」', typeBadge: '風呂マニア（案B）' };
      STAGE.customCombo = { name: '玄関直風呂', normalBonus: -2.0, customBonus: 3.5, isNegativeInversion: true, hint: '玄関と浴室を直結ドアで繋ぐ (+3.5万 / 満足度反転)' };
      setEnt(8, 3, 'bottom');
      fillRect(7, 3, 1, 2, T.BATH, '浴室', 'bath', 6); // 玄関直風呂（特注反転！）
      fillRect(5, 3, 2, 3, T.LDK, 'LDK', 'dk-22', 5);
      fillRect(7, 5, 1, 1, T.TOILET, 'WC', 'toilet', 4);
      fillRect(3, 3, 2, 2, T.ROOM, '洋室', 'room-22', 3.7);
    }

    if (presetId === 'vampire_dark' && typeof REQUEST_REGISTRY !== 'undefined') {
      STAGE.requests = [{ ...REQUEST_REGISTRY.btsep }, { ...REQUEST_REGISTRY.ldk1_room1 }].filter(Boolean);
    }

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
    if (badge.includes('和モダン') || badge.includes('二世帯') || badge.includes('忍') || badge.includes('銭湯大名') || badge.includes('仙')) {
      return 'floor_washitsu';
    }
    if (badge.includes('豪邸') || badge.includes('VIP') || badge.includes('レジデンス') || badge.includes('美食サロン')) {
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

      placements.forEach(p => drawCharacterShadow(ctx, p.x + 24, p.y + 44, 10));
      placements.forEach(p => {
        global.PixelAssets.drawSprite(ctx, `${p.actor}_0`, p.x, p.y, 48, 48);
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

  global.PixelRenderer = {
    drawPixelBoard,
    buildFurniturePlan,
    startCompletionTour,
    stopActiveTour,
    setTourSpeed,
    loadTestPreset,
    resolveClientActors: selectTourActors,
    renderClientPortraitCanvas,
    startMissionIdle,
    stopMissionIdle,
    getSpeed: () => tourSpeed
  };
})(window);
