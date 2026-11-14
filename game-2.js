  'use strict';
  /* ============================================================
     BFS EVALUATOR
  ============================================================ */
  function runBFS() {
    if (!STAGE) return new Set();
    const entCells = STAGE.entranceCells || [{ r: STAGE.entranceRow, c: STAGE.entranceCol }];
    const visited = new Set(entCells.map(c => `${c.r},${c.c}`));
    const queue = entCells.map(c => ({ r: c.r, c: c.c }));
    const dirs = [{dr:-1,dc:0},{dr:1,dc:0},{dr:0,dc:-1},{dr:0,dc:1}];

    while (queue.length) {
      const cur = queue.shift();
      for (const {dr,dc} of dirs) {
        const nr = cur.r+dr, nc = cur.c+dc;
        const key = `${nr},${nc}`;
        if (nr<0||nr>=GRID||nc<0||nc>=GRID||visited.has(key)) continue;
        const et = edgeType(cur.r, cur.c, nr, nc);
        if (et === E.NONE || et === E.DOOR) {
          visited.add(key);
          queue.push({r:nr, c:nc});
        }
      }
    }
    return visited;
  }

  function countCells(visited) {
    const counts = {
      ldkRooms:0, bedRooms:0, bath:0, toilet:0, washroom:0, closetRooms:0,
      corridor:0, garden:0, unreachable:0, unreachableCells:0, totalOcc:0,
      ldkCells:0, bedCells:0, closetCells:0, totalBaseRent:0,
      maxToiletSize:0, maxBathSize:0, maxClosetSize:0,
      separateBathCount:0, separateToiletCount:0, unitBathCount:0,
      hasBath:false, hasToilet:false, isBtSeparated:false
    };
    const seenRooms = new Map(); // pieceId -> type（統合後も元ピース単位で数える）
    const mergedSize = new Map(); // roomId -> セル数（統合後の広さ）
    const unreachableRooms = new Set();
    let unreachableCells = 0;

    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const cell = grid[r][c];
        if (cell.type === T.EMPTY || cell.type === T.GARDEN || cell.type === T.OBSTACLE) { counts.garden++; continue; }
        if (cell.type !== T.ENTRANCE) counts.totalOcc++;

        // 玄関からの到達判定（未到達のマス・部屋を集計）
        if (cell.type !== T.ENTRANCE) {
          const key = `${r},${c}`;
          if (!visited || !visited.has(key)) {
            unreachableCells++;
            unreachableRooms.add(cell.roomId || key);
          }
        }

        const spaceLv = getStaffSkillLevel('space_designer');
        const ldkMult = (cell.type === T.LDK && spaceLv > 0) ? (1 + [0, 0.10, 0.20, 0.30][spaceLv]) : 1.0;
        counts.totalBaseRent += (cell.costPerCell || 0) * 0.05 * ldkMult;
        if (cell.roomId && !seenRooms.has(cell.roomId)) {
          seenRooms.set(cell.roomId, cell.type);
          if (cell.type === T.LDK)           counts.ldkRooms++;
          else if (cell.type === T.ROOM)      counts.bedRooms++;
          else if (cell.type === T.BATH) {
            if (cell.pieceLibId === 'unit-bath' || cell.label === 'UB') {
              counts.unitBathCount++;
            } else {
              counts.separateBathCount++;
            }
          }
          else if (cell.type === T.TOILET)    counts.separateToiletCount++;
          else if (cell.type === T.WASHROOM)  counts.washroom++;
          else if (cell.type === T.CLOSET)    counts.closetRooms++;
        }
        if (cell.roomId && (cell.type === T.TOILET || cell.type === T.BATH || cell.type === T.CLOSET)) {
          const n = (mergedSize.get(cell.roomId) || 0) + 1;
          mergedSize.set(cell.roomId, n);
          if (cell.type === T.TOILET) counts.maxToiletSize = Math.max(counts.maxToiletSize, n);
          if (cell.type === T.BATH)   counts.maxBathSize   = Math.max(counts.maxBathSize, n);
          if (cell.type === T.CLOSET) counts.maxClosetSize = Math.max(counts.maxClosetSize, n);
        }
        if (cell.type === T.LDK) counts.ldkCells++;
        if (cell.type === T.ROOM) counts.bedCells++;
        if (cell.type === T.CORRIDOR) counts.corridor++;
        if (cell.type === T.CLOSET) counts.closetCells++;
      }
    }
    counts.unreachable = unreachableRooms.size;
    counts.unreachableCells = unreachableCells;
    counts.bath = counts.separateBathCount + counts.unitBathCount;
    counts.toilet = counts.separateToiletCount + counts.unitBathCount;
    counts.hasBath = counts.bath > 0;
    counts.hasToilet = counts.toilet > 0;
    counts.isBtSeparated = (counts.separateBathCount > 0 && counts.separateToiletCount > 0);

    const fp = calcFootprintStats(grid, (typeof encroachCount !== 'undefined') ? encroachCount : 0);
    counts.floorCells = fp.floorCells;
    counts.marginGardenCells = fp.marginGardenCells;
    counts.maxGardenCluster = fp.maxGardenCluster;
    counts.occupiedArea = fp.occupiedArea;
    counts.encroachedCells = fp.encroachedCells;

    return counts;
  }

  function hasDirectConnection(grid, typeA, typeB) {
    const dirs = [{dr:-1,dc:0},{dr:1,dc:0},{dr:0,dc:-1},{dr:0,dc:1}];
    for (let r=0; r<GRID; r++) {
      for (let c=0; c<GRID; c++) {
        if (grid[r][c].type === typeA) {
          for (const {dr,dc} of dirs) {
            const nr=r+dr, nc=c+dc;
            if (nr>=0 && nr<GRID && nc>=0 && nc<GRID && grid[nr][nc].type === typeB) {
              const et = edgeType(r, c, nr, nc);
              if (et === E.DOOR || et === E.NONE) return true;
            }
          }
        }
      }
    }
    return false;
  }

  // 洗面所がLDKと廊下/玄関の2方向へ通り抜け可能な「家事回遊動線」かを判定
  function hasCirculationRoute(grid) {
    if (!grid) return false;
    const visited = new Set();
    const dirs = [{dr:-1,dc:0},{dr:1,dc:0},{dr:0,dc:-1},{dr:0,dc:1}];

    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (grid[r] && grid[r][c] && grid[r][c].type === T.WASHROOM && !visited.has(`${r},${c}`)) {
          // 洗面所の連結成分を探索
          const comp = [];
          const queue = [{ r, c }];
          visited.add(`${r},${c}`);

          while (queue.length > 0) {
            const cur = queue.shift();
            comp.push(cur);
            for (const {dr,dc} of dirs) {
              const nr = cur.r + dr, nc = cur.c + dc;
              if (nr >= 0 && nr < GRID && nc >= 0 && nc < GRID) {
                if (grid[nr] && grid[nr][nc] && grid[nr][nc].type === T.WASHROOM && !visited.has(`${nr},${nc}`)) {
                  const et = edgeType(cur.r, cur.c, nr, nc);
                  if (et === E.NONE || et === E.DOOR) {
                    visited.add(`${nr},${nc}`);
                    queue.push({ r: nr, c: nc });
                  }
                }
              }
            }
          }

          // この洗面所連結成分がLDKと廊下/玄関の両方に接続（扉または壁なし）しているか判定
          let connectsToLDK = false;
          let connectsToCorridor = false;

          for (const cell of comp) {
            for (const {dr,dc} of dirs) {
              const nr = cell.r + dr, nc = cell.c + dc;
              if (nr >= 0 && nr < GRID && nc >= 0 && nc < GRID && grid[nr] && grid[nr][nc]) {
                const targetType = grid[nr][nc].type;
                const et = edgeType(cell.r, cell.c, nr, nc);
                if (et === E.NONE || et === E.DOOR) {
                  if (targetType === T.LDK) {
                    connectsToLDK = true;
                  } else if (targetType === T.CORRIDOR || targetType === T.ENTRANCE) {
                    connectsToCorridor = true;
                  }
                }
              }
            }
          }

          if (connectsToLDK && connectsToCorridor) {
            return true;
          }
        }
      }
    }
    return false;
  }

  // 田の字プラン判定: 和室4部屋が田の字（2×2）に隣接し、襖（ドア）で直結しているかを判定
  function hasTanojiWashitsu(visited) {
    const washitsuRooms = new Map();
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const cell = grid[r][c];
        if (!cell || cell.type !== T.ROOM || cell.label !== '和室' || !cell.roomId) continue;
        const key = `${r},${c}`;
        if (visited && !visited.has(key)) continue;
        if (!washitsuRooms.has(cell.roomId)) {
          washitsuRooms.set(cell.roomId, {
            id: cell.roomId,
            cells: [],
            minR: r, maxR: r,
            minC: c, maxC: c,
            sumR: 0, sumC: 0
          });
        }
        const rm = washitsuRooms.get(cell.roomId);
        rm.cells.push({r, c});
        rm.minR = Math.min(rm.minR, r);
        rm.maxR = Math.max(rm.maxR, r);
        rm.minC = Math.min(rm.minC, c);
        rm.maxC = Math.max(rm.maxC, c);
        rm.sumR += r;
        rm.sumC += c;
      }
    }

    if (washitsuRooms.size < 4) return false;

    // ドア接続関係の集計
    const connected = new Map();
    for (const id of washitsuRooms.keys()) connected.set(id, new Set());

    const dirs = [{dr:0, dc:1}, {dr:1, dc:0}];
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const c1 = grid[r][c];
        if (!c1 || c1.type !== T.ROOM || c1.label !== '和室' || !c1.roomId) continue;
        for (const {dr, dc} of dirs) {
          const nr = r + dr, nc = c + dc;
          if (nr >= GRID || nc >= GRID) continue;
          const c2 = grid[nr][nc];
          if (!c2 || c2.type !== T.ROOM || c2.label !== '和室' || !c2.roomId) continue;
          if (c1.roomId === c2.roomId) continue;
          if (edgeType(r, c, nr, nc) === E.DOOR) {
            connected.get(c1.roomId)?.add(c2.roomId);
            connected.get(c2.roomId)?.add(c1.roomId);
          }
        }
      }
    }

    // パターン1: 2×2のセル交差点で4つの異なる和室が接合しているかチェック
    for (let r = 0; r < GRID - 1; r++) {
      for (let c = 0; c < GRID - 1; c++) {
        const cTL = grid[r][c],   cTR = grid[r][c+1];
        const cBL = grid[r+1][c], cBR = grid[r+1][c+1];
        if (cTL?.label === '和室' && cTR?.label === '和室' && cBL?.label === '和室' && cBR?.label === '和室') {
          const idTL = cTL.roomId, idTR = cTR.roomId;
          const idBL = cBL.roomId, idBR = cBR.roomId;
          const set = new Set([idTL, idTR, idBL, idBR]);
          if (set.size === 4) {
            if (connected.get(idTL)?.has(idTR) &&
                connected.get(idBL)?.has(idBR) &&
                connected.get(idTL)?.has(idBL) &&
                connected.get(idTR)?.has(idBR)) {
              return true;
            }
          }
        }
      }
    }

    // パターン2: 各和室の重心・位置関係と接続ループによる判定（サイズ混在・境界オフセット対応）
    const roomList = Array.from(washitsuRooms.values()).map(rm => ({
      id: rm.id,
      avgR: rm.sumR / rm.cells.length,
      avgC: rm.sumC / rm.cells.length
    }));

    const n = roomList.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        for (let k = 0; k < n; k++) {
          if (k === i || k === j) continue;
          for (let l = 0; l < n; l++) {
            if (l === i || l === j || l === k) continue;
            const TL = roomList[i], TR = roomList[j];
            const BL = roomList[k], BR = roomList[l];
            if (TR.avgC > TL.avgC && BR.avgC > BL.avgC && BL.avgR > TL.avgR && BR.avgR > TR.avgR) {
              if (connected.get(TL.id)?.has(TR.id) &&
                  connected.get(BL.id)?.has(BR.id) &&
                  connected.get(TL.id)?.has(BL.id) &&
                  connected.get(TR.id)?.has(BR.id)) {
                return true;
              }
            }
          }
        }
      }
    }

    return false;
  }

  // 隠し部屋判定: 玄関からの動線において、「収納」を通らないと到達できない居室（洋室・和室・LDK）が存在するか
  function hasHiddenRoom(visited) {
    if (!STAGE) return false;
    const entCells = STAGE.entranceCells || [{ r: STAGE.entranceRow, c: STAGE.entranceCol }];
    const visitedNoCloset = new Set(entCells.map(c => `${c.r},${c.c}`));
    const queue = entCells.map(c => ({ r: c.r, c: c.c }));
    const dirs = [{dr:-1,dc:0},{dr:1,dc:0},{dr:0,dc:-1},{dr:0,dc:1}];

    while (queue.length) {
      const cur = queue.shift();
      for (const {dr,dc} of dirs) {
        const nr = cur.r+dr, nc = cur.c+dc;
        const key = `${nr},${nc}`;
        if (nr<0||nr>=GRID||nc<0||nc>=GRID||visitedNoCloset.has(key)) continue;
        const nextCell = grid[nr][nc];
        if (!nextCell || nextCell.type === T.CLOSET) continue; // 収納は通り抜けない
        const et = edgeType(cur.r, cur.c, nr, nc);
        if (et === E.NONE || et === E.DOOR) {
          visitedNoCloset.add(key);
          queue.push({r:nr, c:nc});
        }
      }
    }

    // 通常のBFS(visited)で到達できる居室の中で、収納を迂回できない部屋が存在するかチェック
    for (let r=0; r<GRID; r++) {
      for (let c=0; c<GRID; c++) {
        const cell = grid[r][c];
        if (cell && (cell.type === T.ROOM || cell.type === T.LDK)) {
          const key = `${r},${c}`;
          if (visited && visited.has(key) && !visitedNoCloset.has(key)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /* ============================================================
     COMBO MASTER DATA (26 TYPES) & DETECTION
  ============================================================ */
  const COMBO_MASTER_LIST = [
    { id: 1,  name: '水回り集約',     category: '王道',     bonus: '+0.8〜2万', icon: 'ph-drop',             hint: '風呂・トイレ・洗面所をまとめて配置すると…？', desc: '風呂・トイレ・洗面が隣接（部分集約+0.8万 / 全集約+2.0万）' },
    { id: 2,  name: '家事ラク動線',   category: '王道',     bonus: '+1.0万', icon: 'ph-washing-machine',  hint: '料理と洗濯の移動をスムーズに',             desc: 'LDKと洗面所が直通で接続' },
    { id: 3,  name: '日当たり良好',   category: '王道',     bonus: '+1.5万', icon: 'ph-sun',              hint: 'リビングを一番明るい方角へ',               desc: '南側（下辺）外壁に面する窓付きLDK' },
    { id: 4,  name: '完全防音',       category: '王道',     bonus: '+1.0万', icon: 'ph-ear-slash',        hint: 'トイレの音やプライバシーを守る配置',       desc: 'トイレが廊下を挟んで居室に接続' },
    { id: 5,  name: '古き良き日本家屋', category: '王道',   bonus: '+5.0万', icon: 'ph-house-line',       hint: '伝統的な和室の並び（田の字）',             desc: '和室4部屋が2×2の田の字型に直結' },
    { id: 6,  name: '陽だまりの家',   category: '王道',     bonus: '+2.0万', icon: 'ph-sun',              hint: '外壁にたくさんの窓を配置',                 desc: '建物全体の窓が8〜14箇所' },
    { id: 7,  name: 'セレブ浴室',     category: '王道',     bonus: '+4.0万', icon: 'ph-bathtub',          hint: 'ゆったり足を伸ばせる大きなお風呂',         desc: '浴室が4〜7マス連結' },
    { id: 8,  name: '倉庫付き物件',   category: '王道',     bonus: '+3.0万', icon: 'ph-package',          hint: '荷物が多くても安心の収納スペース',         desc: '収納が4〜7マス連結' },
    { id: 9,  name: '食欲減退',       category: 'NG',       bonus: '-3.0万', icon: 'ph-warning',          hint: '食事の場と便器が近すぎる…',               desc: 'LDKとトイレが直結ドア' },
    { id: 10, name: '玄関直風呂',     category: 'NG',       bonus: '-2.0万', icon: 'ph-warning',          hint: 'ドアを開けたらすぐにお風呂場',             desc: '玄関と浴室が直結ドア' },
    { id: 11, name: 'バカデカトイレ', category: '珍間取り', bonus: '+2.5万', icon: 'ph-toilet',           hint: 'トイレに情熱を注ぎすぎた空間',             desc: 'トイレが4マス以上連結' },
    { id: 12, name: 'もはや銭湯',     category: '珍間取り', bonus: '+4.0万', icon: 'ph-shower',           hint: '家の中に広大な温泉施設…？',               desc: '浴室が8マス以上連結' },
    { id: 13, name: '収納が本体',     category: '珍間取り', bonus: '+2.5万', icon: 'ph-package',          hint: '住居というより倉庫',                       desc: '収納が8マス以上連結' },
    { id: 14, name: '究極のオープン', category: '珍間取り', bonus: '+3.5万', icon: 'ph-door',             hint: '廊下を一切作らず全ての部屋を繋ぐ',         desc: '廊下0マスで居室・LDK合計4室以上' },
    { id: 15, name: '封印されし闇',   category: '珍間取り', bonus: '+5.0万', icon: 'ph-ghost',            hint: '入口も窓も存在しない謎の密室',             desc: '到達不能かつ窓なしの部屋' },
    { id: 16, name: '水門',           category: '珍間取り', bonus: '+1.5万', icon: 'ph-waves',            hint: '玄関から水回りにしか行けない構造',         desc: '玄関隣接が水回りのみ' },
    { id: 17, name: '秘密のトイレ',   category: '珍間取り', bonus: '+1.0万', icon: 'ph-lock-key',         hint: 'クローゼットの奥に潜む便器',               desc: '収納経由でのみ入れるトイレ' },
    { id: 18, name: '隠し部屋',       category: '珍間取り', bonus: '+1.5万', icon: 'ph-door',             hint: '収納の奥に広がるプライベート空間',         desc: '収納経由でのみ入れる居室' },
    { id: 19, name: 'トイレビュッフェ', category: 'NG',       bonus: '-1.5万', icon: 'ph-toilet',         hint: '廊下にずらりと並ぶ便器',                   desc: '1つの廊下にトイレ3つ以上隣接' },
    { id: 20, name: 'スケルトンバス', category: 'NG',       bonus: '-1.0万', icon: 'ph-shower',           hint: '玄関正面に浴室の扉が見える',               desc: '玄関正面直線上に浴室ドア' },
    { id: 21, name: '無限回廊',       category: '珍間取り', bonus: '+1.5万', icon: 'ph-arrows-clockwise', hint: '廊下がぐるりと一周ループ',                 desc: '廊下が環状に連結' },
    { id: 22, name: 'マトリョーシカ', category: 'NG',       bonus: '-1.0万', icon: 'ph-tree-structure',   hint: '部屋の奥に部屋、その奥にさらに部屋',       desc: '居室を3室以上連続で通り抜け' },
    { id: 23, name: 'プライバシーゼロ', category: 'NG',     bonus: '-1.5万', icon: 'ph-eye',            hint: 'お風呂やトイレが通り道になっている',       desc: '浴室またはトイレが通り抜け動線' },
    { id: 24, name: 'ガラス張りハウス', category: '珍間取り', bonus: '+3.0万', icon: 'ph-sparkle',        hint: '壁一面が窓だらけのパノラマ住宅',           desc: '建物全体の窓が15箇所以上' },
    { id: 25, name: '大ホワイエ',       category: '王道',     bonus: '+2〜4万', icon: 'ph-columns',        hint: '玄関を入った先に、広間のようなゆったりとした廊下（2×3以上）を設けると…？', desc: '玄関から広がるエントランスホール（2×3で+2.0万 / 特大で+4.0万）' },
    { id: 26, name: 'ロングコリドー',   category: '珍間取り', bonus: '+2.5万', icon: 'ph-arrows-left-right', hint: '縦または横に、一直線に伸びる長い廊下（7マス以上）を作ると…？',             desc: '視線がすっと抜ける一本の長廊下（直線7マス以上の連続廊下）' },
    { id: 27, name: '箱庭のある暮らし', category: '王道',     bonus: '+0.3万', icon: 'ph-plant',            hint: '建物に囲まれた憩いのプライベートガーデン（4マス以上連結）を設けると…？', desc: '占有枠内に4マス以上連結した庭' },
    { id: 28, name: '広大なる庭園',     category: '王道',     bonus: '+0.6万', icon: 'ph-tree',             hint: '四季を愛でる贅沢なガーデンスペース（8マス以上連結）を確保すると…？',     desc: '占有枠内に8マス以上連結した庭' },
    { id: 29, name: 'もはや公園',       category: '珍間取り', bonus: '+1.2万', icon: 'ph-tree',             hint: '家よりも広大な敷地を庭にしてしまうと…？',                                 desc: '占有枠内の庭が12マス以上連結、または延床面積以上' },
    { id: 30, name: '要塞化',           category: '珍間取り', bonus: '+2.0万', icon: 'ph-shield-check',     hint: '外界の視線と光を完全に遮断した空間を作ると…？',                         desc: '居室・LDKがあるのに外壁窓が0箇所（完全遮光）' }
  ];

  function recordDiscoveredCombos(combos) {
    ensureGameState();
    const newlyDiscovered = [];
    if (Array.isArray(combos)) {
      for (const c of combos) {
        if (c && c.name && !GameState.discovered.combos.includes(c.name)) {
          GameState.discovered.combos.push(c.name);
          newlyDiscovered.push(c.name);
        }
      }
    }
    if (newlyDiscovered.length > 0) {
      saveGame();
    }
    return newlyDiscovered;
  }

  function getDiscoveredMasterComboCount() {
    ensureGameState();
    const set = new Set(GameState.discovered.combos || []);
    return COMBO_MASTER_LIST.filter(item => set.has(item.name)).length;
  }

  function detectCombos(counts, visited) {
    const combos = [];
    
    // NGコンボ（生活導線・衛生上の問題）
    if (hasDirectConnection(grid, T.LDK, T.TOILET)) {
      combos.push({ name:'食欲減退', bonus:-3.0, icon:'ph-warning text-red-600', type:'funny',
        text:'【NG】食欲減退 — 食事の場とトイレが直結、においと音が直撃 (-3.0万)' });
    }
    if (hasDirectConnection(grid, T.ENTRANCE, T.BATH)) {
      combos.push({ name:'玄関直風呂', bonus:-2.0, icon:'ph-warning text-red-600', type:'funny',
        text:'【NG】玄関直風呂 — 玄関あけたらすぐ風呂、宅配便が来たら大惨事 (-2.0万)' });
    }

    // 統合サイズコンボ（同種ピース統合で生まれた大きな水回り・収納）
    // トイレ: 4マス以上で珍間取り / 浴室: 4マス以上で王道、8マス以上で珍間取り / 収納: 4マス以上で王道、8マス以上で珍間取り
    if (counts.maxToiletSize >= 4) {
      combos.push({ name:'バカデカトイレ', bonus:2.5, icon:'ph-toilet text-purple-600', type:'funny',
        text:`【珍間取り】バカデカトイレ — トイレが${counts.maxToiletSize}マス連結、何を目指しているのか (+2.5万)` });
    }
    if (counts.maxBathSize >= 8) {
      combos.push({ name:'もはや銭湯', bonus:4.0, icon:'ph-shower text-cyan-600', type:'funny',
        text:`【珍間取り】もはや銭湯 — 浴室が${counts.maxBathSize}マス連結、住居より風呂が主役 (+4.0万)` });
    } else if (counts.maxBathSize >= 4) {
      combos.push({ name:'セレブ浴室', bonus:4.0, icon:'ph-bathtub text-cyan-600', type:'good',
        text:`【王道】セレブ浴室 — 浴室が${counts.maxBathSize}マス連結、足を伸ばして入れる贅沢 (+4.0万)` });
    }
    if (counts.maxClosetSize >= 8) {
      combos.push({ name:'収納が本体', bonus:2.5, icon:'ph-package text-amber-600', type:'funny',
        text:`【珍間取り】収納が本体 — 収納が${counts.maxClosetSize}マス連結、もはや倉庫に住んでいる (+2.5万)` });
    } else if (counts.maxClosetSize >= 4) {
      combos.push({ name:'倉庫付き物件', bonus:3.0, icon:'ph-package text-amber-600', type:'good',
        text:`【王道】倉庫付き物件 — 収納が${counts.maxClosetSize}マス連結、荷物が多くても安心 (+3.0万)` });
    }

    // 新コンボ1: 古き良き日本家屋（田の字プラン）
    if (hasTanojiWashitsu(visited)) {
      combos.push({ name:'古き良き日本家屋', bonus:5.0, icon:'ph-house-line text-emerald-600', type:'good',
        text:'【王道】古き良き日本家屋 — 和室4部屋が田の字に直結する伝統的構造 (+5.0万)' });
    }

    // 新コンボ2: 究極のオープン（全室オープン構造）
    const livingRooms = counts.ldkRooms + counts.bedRooms;
    if (counts.corridor === 0 && livingRooms >= 4) {
      combos.push({ name:'究極のオープン', bonus:3.5, icon:'ph-door text-teal-600', type:'funny',
        text:'【珍間取り】究極のオープン — 廊下ゼロで居室が直結 (+3.5万)' });
    }
    // 新コンボ2: 封印されし闇（到達不能かつ窓なしの部屋）
    if (counts.unreachable > 0) {
      const unreachRooms = new Map();
      for (let r=0; r<GRID; r++) {
        for (let c=0; c<GRID; c++) {
          const cell = grid[r][c];
          if (cell.type === T.EMPTY || cell.type === T.GARDEN || cell.type === T.OBSTACLE || cell.type === T.ENTRANCE) continue;
          if (!visited.has(`${r},${c}`)) {
            const rid = cell.roomId || `${r},${c}`;
            if (!unreachRooms.has(rid)) unreachRooms.set(rid, false);
            const dirs=[{dr:-1,dc:0},{dr:1,dc:0},{dr:0,dc:-1},{dr:0,dc:1}];
            for (const {dr,dc} of dirs) {
              const nr=r+dr, nc=c+dc;
              if (nr<0||nr>=GRID||nc<0||nc>=GRID) { unreachRooms.set(rid, true); break; }
              const nb = grid[nr][nc];
              if (nb.type===T.GARDEN||nb.type===T.EMPTY||nb.type===T.OBSTACLE) { unreachRooms.set(rid, true); break; }
            }
          }
        }
      }
      let sealed = false;
      for (const hasWin of unreachRooms.values()) {
        if (!hasWin) { sealed = true; break; }
      }
      if (sealed) {
        combos.push({ name:'封印されし闇', bonus:5.0, icon:'ph-ghost text-purple-600', type:'funny',
          text:'【珍間取り】封印されし闇 — 窓もない絶対到達不能部屋 (+5.0万)' });
      }
    }
    // 新コンボ3: 水門（玄関の周囲が水回りのみ）
    const entCells = STAGE.entranceCells || [{ r: STAGE.entranceRow, c: STAGE.entranceCol }];
    let waterGate = true;
    let hasNext = false;
    const dirs=[{dr:-1,dc:0},{dr:1,dc:0},{dr:0,dc:-1},{dr:0,dc:1}];
    for (const ec of entCells) {
      for (const {dr,dc} of dirs) {
        const nr=ec.r+dr, nc=ec.c+dc;
        if (nr>=0&&nr<GRID&&nc>=0&&nc<GRID) {
          if (entCells.some(c => c.r === nr && c.c === nc)) continue;
          const et = edgeType(ec.r, ec.c, nr, nc);
          if (et === E.DOOR || et === E.NONE) {
            hasNext = true;
            const type = grid[nr][nc].type;
            if (type !== T.BATH && type !== T.TOILET && type !== T.WASHROOM) waterGate = false;
          }
        }
      }
    }
    if (hasNext && waterGate) {
      combos.push({ name:'水門', bonus:1.5, icon:'ph-waves text-blue-600', type:'funny',
        text:'【珍間取り】水門 — 玄関から水回りしか行けない (+1.5万)' });
    }
    // 新コンボ4: 秘密のトイレ（収納からしか行けないトイレ）
    let hasAccessibleToilet = false;
    let connectedToNonCloset = false;
    let connectedToCloset = false;
    for (let r=0; r<GRID; r++) {
      for (let c=0; c<GRID; c++) {
        if (grid[r][c].type === T.TOILET && visited.has(`${r},${c}`)) {
          hasAccessibleToilet = true;
          const dirs = [{dr:-1,dc:0},{dr:1,dc:0},{dr:0,dc:-1},{dr:0,dc:1}];
          for (const {dr,dc} of dirs) {
            const nr = r+dr, nc = c+dc;
            if (nr>=0&&nr<GRID&&nc>=0&&nc<GRID) {
              const et = edgeType(r, c, nr, nc);
              if (et === E.NONE || et === E.DOOR) {
                const nType = grid[nr][nc].type;
                if (nType !== T.TOILET) {
                  if (nType === T.CLOSET) connectedToCloset = true;
                  else connectedToNonCloset = true;
                }
              }
            }
          }
        }
      }
    }
    if (hasAccessibleToilet && connectedToCloset && !connectedToNonCloset) {
      combos.push({ name:'秘密のトイレ', bonus:1.0, icon:'ph-lock-key text-slate-600', type:'funny',
        text:'【珍間取り】秘密のトイレ — 収納の奥に潜む便器 (+1.0万)' });
    }

    // 新コンボ5: 隠し部屋（収納を通らないと行けない居室）
    if (hasHiddenRoom(visited)) {
      combos.push({ name:'隠し部屋', bonus:1.5, icon:'ph-door text-purple-600', type:'funny',
        text:'【珍間取り】隠し部屋 — 収納の奥に広がる秘密空間 (+1.5万)' });
    }

    // 1. 水回り集約: 風呂・トイレ・洗面が相互に隣接（全集約: +2.0万 / 部分集約: +0.8万）
    const wetTier = wetAdjacencyCluster();
    if (wetTier >= 2) {
      const plumbLv = getStaffSkillLevel('plumber');
      const extraBonus = plumbLv > 0 ? ([0, 0.3, 0.6, 1.0][plumbLv] || 0.3) : 0;
      const b = 2.0 + extraBonus;
      const bDesc = plumbLv > 0 ? ` (+${b.toFixed(1)}万 配管バフLv${plumbLv})` : ' (+2.0万)';
      combos.push({ name:'水回り集約', bonus:b, icon:'ph-drop text-blue-600', type:'good',
        text:`【王道】水回り集約（全集約） — 風呂・トイレ・洗面が集中${bDesc}` });
    } else if (wetTier === 1) {
      const plumbLv = getStaffSkillLevel('plumber');
      const extraBonus = plumbLv > 0 ? ([0, 0.1, 0.2, 0.4][plumbLv] || 0.1) : 0;
      const b = 0.8 + extraBonus;
      const bDesc = plumbLv > 0 ? ` (+${b.toFixed(1)}万 配管バフLv${plumbLv})` : ' (+0.8万)';
      combos.push({ name:'水回り集約', bonus:b, icon:'ph-drop text-blue-600', type:'good',
        text:`【王道】水回り集約（部分） — 2箇所の水回りが隣接${bDesc}` });
    }
    // 2. 家事ラク動線: LDKと洗面所が直通接続
    if (hasDirectConnection(grid, T.LDK, T.WASHROOM)) {
      combos.push({ name:'家事ラク動線', bonus:1.0, icon:'ph-washing-machine text-teal-600', type:'good',
        text:'【王道】家事ラク動線 — キッチン↔洗面直通 (+1.0万)' });
    }
    // 3. 日当たり良好: LDKが敷地南側（下辺）外壁に面する
    if (ldkFacesSouth()) {
      combos.push({ name:'日当たり良好', bonus:1.5, icon:'ph-sun text-amber-500', type:'good',
        text:'【王道】日当たり良好 — 南向きLDK (+1.5万)' });
    }
    // 4. 完全防音: トイレが廊下を挟んで居室に繋がる
    if (toiletHasCorridor()) {
      combos.push({ name:'完全防音', bonus:1.0, icon:'ph-ear-slash text-slate-600', type:'good',
        text:'【王道】完全防音 — トイレ廊下隔離でプライバシー保護 (+1.0万)' });
    }
    // 5. トイレビュッフェ: 1廊下に3トイレ以上
    if (toiletBuffet()) {
      combos.push({ name:'トイレビュッフェ', bonus:-1.5, icon:'ph-toilet text-purple-600', type:'funny',
        text:'【NG】トイレビュッフェ — 廊下に便器が並ぶ異常事態 (-1.5万)' });
    }
    // 6. スケルトンバス: 玄関正面直線上に浴室ドア
    if (skeletonBath()) {
      combos.push({ name:'スケルトンバス', bonus:-1.0, icon:'ph-shower text-cyan-600', type:'funny',
        text:'【NG】スケルトンバス — 玄関開けたら風呂丸見え (-1.0万)' });
    }
    // 7. 無限回廊: 廊下ループ検出
    if (infiniteLoop(visited)) {
      combos.push({ name:'無限回廊', bonus:1.5, icon:'ph-arrows-clockwise text-indigo-600', type:'funny',
        text:'【珍間取り】無限回廊 — 謎の回遊動線を評価 (+1.5万)' });
    }
    // 8. マトリョーシカ: 3室以上通り抜け
    if (matroshka(visited)) {
      combos.push({ name:'マトリョーシカ', bonus:-1.0, icon:'ph-tree-structure text-rose-600', type:'funny',
        text:'【NG】マトリョーシカ — 部屋の中に部屋がある迷宮 (-1.0万)' });
    }
    // 9. プライバシーゼロ: トイレ・風呂の通り抜け
    if (walkthroughWater()) {
      combos.push({ name:'プライバシーゼロ', bonus:-1.5, icon:'ph-eye text-red-600', type:'funny',
        text:'【NG】プライバシーゼロ — トイレ・風呂が通り抜け動線 (-1.5万)' });
    }

    // 10. 窓関連コンボ（窓の数による王道・珍間取り判定）
    const winCount = countWindows(grid);
    const hasLiving = (counts.bedRooms + counts.ldkRooms) > 0;
    if (hasLiving && winCount === 0) {
      combos.push({ name:'要塞化', bonus:2.0, icon:'ph-shield-check text-slate-700', type:'funny',
        text:'【珍間取り】要塞化 — 外界の視線と光を拒絶した完全遮光空間 (+2.0万)' });
    } else if (winCount >= 8 && winCount <= 14) {
      combos.push({ name:'陽だまりの家', bonus:2.0, icon:'ph-sun text-amber-500', type:'good',
        text:`【王道】陽だまりの家 — 窓${winCount}箇所で光と風が通る (+2.0万)` });
    } else if (winCount >= 15) {
      combos.push({ name:'ガラス張りハウス', bonus:3.0, icon:'ph-sparkle text-cyan-600', type:'funny',
        text:`【珍間取り】ガラス張りハウス — 窓${winCount}箇所の超パノラマビュー (+3.0万)` });
    }

    // 11. 廊下空間のこだわりコンボ
    const foyerTier = hasGrandFoyer(visited);
    if (foyerTier === 2) {
      combos.push({ name:'大ホワイエ', bonus:4.0, icon:'ph-columns text-amber-500', type:'good',
        text:'【王道】大ホワイエ（特大） — 玄関から広がる壮大なエントランス空間 (+4.0万)' });
    } else if (foyerTier === 1) {
      combos.push({ name:'大ホワイエ', bonus:2.0, icon:'ph-columns text-amber-500', type:'good',
        text:'【王道】大ホワイエ — 玄関から広がる贅沢なエントランスホール (+2.0万)' });
    }
    if (hasLongCorridor(visited)) {
      combos.push({ name:'ロングコリドー', bonus:2.5, icon:'ph-arrows-left-right text-teal-600', type:'funny',
        text:'【珍間取り】ロングコリドー — 視線がすっと抜ける7マス以上の長廊下 (+2.5万)' });
    }

    // 庭園コンボ（余白庭の積極活用 & 珍間取り）
    const maxGardenBlock = counts.maxGardenCluster || 0;
    const totalGarden = counts.marginGardenCells || 0;
    const flCells = counts.floorCells || 0;

    if (maxGardenBlock >= 12 || (totalGarden >= 12 && totalGarden >= flCells)) {
      combos.push({ name:'もはや公園', bonus:1.2, icon:'ph-tree text-emerald-700', type:'funny',
        text:`【珍間取り】もはや公園 — 庭が${totalGarden}マス(最大${maxGardenBlock}マス塊)。住まいというより広場、草むしりが追いつかない (+1.2万)` });
    } else if (maxGardenBlock >= 8) {
      combos.push({ name:'広大なる庭園', bonus:0.6, icon:'ph-tree text-emerald-600', type:'good',
        text:`【王道】広大なる庭園 (${maxGardenBlock}マス連結) — 四季を愛でる贅沢なガーデンスペース (+0.6万)` });
    } else if (maxGardenBlock >= 4) {
      combos.push({ name:'箱庭のある暮らし', bonus:0.3, icon:'ph-plant text-emerald-600', type:'good',
        text:`【王道】箱庭のある暮らし (${maxGardenBlock}マス連結) — 建物に囲まれた憩いのプライベートガーデン (+0.3万)` });
    }

    return combos;
  }

  function walkthroughWater() {
    const wetRooms = new Map();
    for (let r=0; r<GRID; r++) {
      for (let c=0; c<GRID; c++) {
        const cell = grid[r][c];
        if (cell.type === T.TOILET || cell.type === T.BATH) {
          if (cell.roomId && !wetRooms.has(cell.roomId)) {
            wetRooms.set(cell.roomId, new Set());
          }
          if (cell.roomId) {
            const dirs=[{dr:-1,dc:0},{dr:1,dc:0},{dr:0,dc:-1},{dr:0,dc:1}];
            for (const {dr,dc} of dirs) {
              const nr=r+dr, nc=c+dc;
              if (nr>=0 && nr<GRID && nc>=0 && nc<GRID) {
                const nCell = grid[nr][nc];
                if (nCell.roomId && nCell.roomId !== cell.roomId) {
                  const et = edgeType(r, c, nr, nc);
                  if (et === E.DOOR) {
                    wetRooms.get(cell.roomId).add(nCell.roomId);
                  }
                }
              }
            }
          }
        }
      }
    }
    for (const connections of wetRooms.values()) {
      if (connections.size >= 2) return true;
    }
    return false;
  }

  // ---- Combo helpers ----
  function getNeighbors(r, c) {
    const dirs = [{dr:-1,dc:0},{dr:1,dc:0},{dr:0,dc:-1},{dr:0,dc:1}];
    return dirs.map(({dr,dc}) => {
      const nr=r+dr, nc=c+dc;
      return (nr>=0&&nr<GRID&&nc>=0&&nc<GRID) ? grid[nr][nc] : null;
    }).filter(Boolean);
  }

  function wetAdjacencyCluster() {
    const wetCells = [];
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const cell = grid[r][c];
        if (cell && (cell.type === T.BATH || cell.type === T.TOILET || cell.type === T.WASHROOM)) {
          wetCells.push({
            r, c,
            type: cell.type,
            isUB: (cell.pieceLibId === 'unit-bath' || cell.label === 'UB')
          });
        }
      }
    }
    if (wetCells.length === 0) return 0;

    const visited = new Set();
    let maxTier = 0;

    for (let i = 0; i < wetCells.length; i++) {
      const startKey = `${wetCells[i].r},${wetCells[i].c}`;
      if (visited.has(startKey)) continue;

      const compCells = [];
      const queue = [wetCells[i]];
      visited.add(startKey);

      while (queue.length > 0) {
        const cur = queue.shift();
        compCells.push(cur);

        const dirs = [{dr:-1,dc:0},{dr:1,dc:0},{dr:0,dc:-1},{dr:0,dc:1}];
        for (const {dr, dc} of dirs) {
          const nr = cur.r + dr, nc = cur.c + dc;
          const nKey = `${nr},${nc}`;
          if (nr >= 0 && nr < GRID && nc >= 0 && nc < GRID && !visited.has(nKey)) {
            const nCell = grid[nr][nc];
            if (nCell && (nCell.type === T.BATH || nCell.type === T.TOILET || nCell.type === T.WASHROOM)) {
              visited.add(nKey);
              queue.push({
                r: nr, c: nc,
                type: nCell.type,
                isUB: (nCell.pieceLibId === 'unit-bath' || nCell.label === 'UB')
              });
            }
          }
        }
      }

      const hasOrdinaryBath = compCells.some(c => c.type === T.BATH && !c.isUB);
      const hasOrdinaryToilet = compCells.some(c => c.type === T.TOILET);
      const hasWash = compCells.some(c => c.type === T.WASHROOM);
      const hasUB = compCells.some(c => c.isUB);

      // 全集約: 風呂・トイレ・洗面の3種すべて（またはユニットバス+洗面所）
      if ((hasOrdinaryBath && hasOrdinaryToilet && hasWash) || (hasUB && hasWash)) {
        maxTier = Math.max(maxTier, 2);
      } else {
        // 部分集約: 2種類の水回りが隣接
        const distinctPairs = (hasOrdinaryBath && hasOrdinaryToilet) ||
                              (hasOrdinaryBath && hasWash) ||
                              (hasOrdinaryToilet && hasWash) ||
                              (hasUB && (hasOrdinaryBath || hasOrdinaryToilet));
        if (distinctPairs) {
          maxTier = Math.max(maxTier, 1);
        }
      }
    }

    return maxTier;
  }

  function isDirectlyConnected(typeA, typeB) {
    for (let r=0;r<GRID;r++) for (let c=0;c<GRID;c++) {
      if (grid[r][c].type !== typeA) continue;
      for (const n of getNeighbors(r,c))
        if (n.type === typeB) return true;
    }
    return false;
  }

  function ldkFacesSouth() {
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (grid[r][c]?.type !== T.LDK) continue;
        // LDKの南辺が窓であり、かつ南方向（下側）に遮蔽する他の部屋ピースが存在しない（敷地最南端または南庭に面している）
        if (edgeType(r, c, r + 1, c) === E.WINDOW && !hasSolidWall(r, c, r + 1, c)) {
          let blockedSouth = false;
          for (let nr = r + 1; nr < GRID; nr++) {
            const t = grid[nr][c]?.type;
            if (t && t !== T.EMPTY && t !== T.GARDEN && t !== T.OBSTACLE) {
              blockedSouth = true;
              break;
            }
          }
          if (!blockedSouth) return true;
        }
      }
    }
    return false;
  }

  function toiletHasCorridor() {
    for (let r=0;r<GRID;r++) for (let c=0;c<GRID;c++) {
      if (grid[r][c].type !== T.TOILET) continue;
      for (const n of getNeighbors(r,c))
        if (n.type === T.CORRIDOR) return true;
    }
    return false;
  }

  function toiletBuffet() {
    // Find corridor cells adjacent to 3+ toilets
    for (let r=0;r<GRID;r++) for (let c=0;c<GRID;c++) {
      if (grid[r][c].type !== T.CORRIDOR) continue;
      const toiletNs = getNeighbors(r,c).filter(n=>n.type===T.TOILET);
      if (toiletNs.length >= 3) return true;
    }
    return false;
  }

  function skeletonBath() {
    if (!STAGE) return false;
    const entCells = STAGE.entranceCells || [{ r: STAGE.entranceRow, c: STAGE.entranceCol }];
    const facing = getEntranceFacing(STAGE, grid);
    for (const ec of entCells) {
      let r = ec.r, c = ec.c;
      let dr = 0, dc = 0;
      if (facing.dir === 'bottom') dr = -1;
      else if (facing.dir === 'top') dr = 1;
      else if (facing.dir === 'left') dc = 1;
      else if (facing.dir === 'right') dc = -1;

      while (true) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID) break;
        const et = edgeType(r, c, nr, nc);
        if (et !== E.NONE && et !== E.DOOR) break;
        r = nr; c = nc;
        const cell = grid[r][c];
        if (cell.type === T.BATH) return true;
        if (cell.type === T.EMPTY || cell.type === T.GARDEN || cell.type === T.OBSTACLE) break;
      }
    }
    return false;
  }

  function infiniteLoop(visited) {
    const reach = new Set();
    const q = [];

    // Push all non-corridor perimeter cells
    for (let r=0; r<GRID; r++) {
      for (let c=0; c<GRID; c++) {
        if (r===0 || r===GRID-1 || c===0 || c===GRID-1) {
          if (grid[r][c].type !== T.CORRIDOR) {
            const k = `${r},${c}`;
            reach.add(k);
            q.push({r, c});
          }
        }
      }
    }

    // Flood fill
    let head = 0;
    while(head < q.length) {
      const cur = q[head++];
      const dirs=[{dr:-1,dc:0},{dr:1,dc:0},{dr:0,dc:-1},{dr:0,dc:1}];
      for (const {dr,dc} of dirs) {
        const nr = cur.r + dr, nc = cur.c + dc;
        if (nr>=0 && nr<GRID && nc>=0 && nc<GRID) {
          const nk = `${nr},${nc}`;
          if (grid[nr][nc].type !== T.CORRIDOR && !reach.has(nk)) {
            reach.add(nk);
            q.push({r:nr, c:nc});
          }
        }
      }
    }

    // Check if there are any non-corridor cells NOT reached by flood fill
    for (let r=0; r<GRID; r++) {
      for (let c=0; c<GRID; c++) {
        if (grid[r][c].type !== T.CORRIDOR) {
          if (!reach.has(`${r},${c}`)) {
            return true; // Found a trapped cell (hole)
          }
        }
      }
    }
    return false;
  }

  function matroshka(visited) {
    const adj = new Map();
    const typeMap = new Map();
    const entCells = STAGE.entranceCells || [{ r: STAGE.entranceRow, c: STAGE.entranceCol }];
    for (const ec of entCells) {
      if (grid[ec.r] && grid[ec.r][ec.c]) grid[ec.r][ec.c].roomId = 'entrance';
    }
    
    for (let r=0; r<GRID; r++) {
      for (let c=0; c<GRID; c++) {
        const cell = grid[r][c];
        if (!cell.roomId) continue;
        typeMap.set(cell.roomId, cell.type);
        if (!adj.has(cell.roomId)) adj.set(cell.roomId, new Set());
        
        const dirs=[{dr:1,dc:0},{dr:0,dc:1}];
        for (const {dr,dc} of dirs) {
          const nr=r+dr, nc=c+dc;
          if (nr>=GRID || nc>=GRID) continue;
          const nCell = grid[nr][nc];
          if (!nCell.roomId) continue;
          if (cell.roomId !== nCell.roomId) {
            const et = edgeType(r, c, nr, nc);
            if (et === E.NONE || et === E.DOOR) {
              adj.get(cell.roomId).add(nCell.roomId);
              if (!adj.has(nCell.roomId)) adj.set(nCell.roomId, new Set());
              adj.get(nCell.roomId).add(cell.roomId);
            }
          }
        }
      }
    }
    
    const dist = new Map();
    for (const id of adj.keys()) dist.set(id, Infinity);
    dist.set('entrance', 0);
    
    let changed = true;
    while(changed) {
      changed = false;
      for (const [u, neighbors] of adj.entries()) {
        const d_u = dist.get(u);
        if (d_u === Infinity) continue;
        for (const v of neighbors) {
          const t = typeMap.get(v);
          const weight = (t === T.ROOM || t === T.LDK) ? 1 : 0;
          if (d_u + weight < dist.get(v)) {
            dist.set(v, d_u + weight);
            changed = true;
          }
        }
      }
    }
    
    let maxDist = 0;
    for (const d of dist.values()) {
      if (d !== Infinity) maxDist = Math.max(maxDist, d);
    }
    return maxDist >= 3;
  }

  // 玄関直結の広間状廊下（廊下セルのみで 2x3以上、3x2以上は通常+2.0万、2x4/4x2/3x3以上の特大は+4.0万）
  function hasGrandFoyer(visited) {
    if (!STAGE) return 0;
    const entCells = STAGE.entranceCells || [{ r: STAGE.entranceRow, c: STAGE.entranceCol }];
    const foyerCorridor = new Set();
    const queue = [];
    const dirs = [{dr:-1,dc:0},{dr:1,dc:0},{dr:0,dc:-1},{dr:0,dc:1}];

    // 玄関セル自身は含めず、玄関に直結する廊下セルのみを起点とする
    for (const ec of entCells) {
      for (const {dr,dc} of dirs) {
        const nr = ec.r + dr, nc = ec.c + dc;
        if (nr >= 0 && nr < GRID && nc >= 0 && nc < GRID) {
          const et = edgeType(ec.r, ec.c, nr, nc);
          if ((et === E.NONE || et === E.DOOR) && grid[nr][nc].type === T.CORRIDOR) {
            const key = `${nr},${nc}`;
            if (!foyerCorridor.has(key)) {
              foyerCorridor.add(key);
              queue.push({ r: nr, c: nc });
            }
          }
        }
      }
    }

    if (queue.length === 0) return 0;

    // 玄関直結の廊下連結成分を広げる（廊下セルのみ）
    while (queue.length > 0) {
      const cur = queue.shift();
      for (const {dr,dc} of dirs) {
        const nr = cur.r + dr, nc = cur.c + dc;
        if (nr >= 0 && nr < GRID && nc >= 0 && nc < GRID) {
          const key = `${nr},${nc}`;
          if (!foyerCorridor.has(key) && grid[nr][nc].type === T.CORRIDOR) {
            const et = edgeType(cur.r, cur.c, nr, nc);
            if (et === E.NONE || et === E.DOOR) {
              foyerCorridor.add(key);
              queue.push({ r: nr, c: nc });
            }
          }
        }
      }
    }

    // 廊下セルだけで最低6マス以上存在すること
    if (foyerCorridor.size < 6) return 0;

    // 矩形領域がすべてfoyerCorridorに含まれ、かつ内部に壁がないかを判定
    function checkRect(r0, c0, h, w) {
      if (r0 + h > GRID || c0 + w > GRID) return false;
      for (let dr = 0; dr < h; dr++) {
        for (let dc = 0; dc < w; dc++) {
          const cr = r0 + dr, cc = c0 + dc;
          if (!foyerCorridor.has(`${cr},${cc}`)) return false;
          if (dc < w - 1) {
            const et = edgeType(cr, cc, cr, cc + 1);
            if (et === E.WALL) return false;
          }
          if (dr < h - 1) {
            const et = edgeType(cr, cc, cr + 1, cc);
            if (et === E.WALL) return false;
          }
        }
      }
      return true;
    }

    let hasTier2 = false;
    let hasTier1 = false;

    // 廊下セルのみで判定: 特大(3x3, 2x4, 4x2) / 通常(2x3, 3x2)
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (checkRect(r, c, 3, 3) || checkRect(r, c, 2, 4) || checkRect(r, c, 4, 2)) {
          hasTier2 = true;
        }
        if (checkRect(r, c, 2, 3) || checkRect(r, c, 3, 2)) {
          hasTier1 = true;
        }
      }
    }

    if (hasTier2) return 2;
    if (hasTier1) return 1;
    return 0;
  }

  // 縦または横に一直線に7マス以上連続する長廊下
  function hasLongCorridor(visited) {
    const checkVisited = (r, c) => {
      if (visited && typeof visited.has === 'function') return visited.has(`${r},${c}`);
      return true;
    };

    // 水平方向
    for (let r = 0; r < GRID; r++) {
      let currentLen = 0;
      for (let c = 0; c < GRID; c++) {
        if (grid[r][c].type === T.CORRIDOR && checkVisited(r, c)) {
          if (currentLen > 0) {
            const et = edgeType(r, c - 1, r, c);
            if (et === E.NONE || et === E.DOOR) {
              currentLen++;
            } else {
              currentLen = 1;
            }
          } else {
            currentLen = 1;
          }
          if (currentLen >= 7) return true;
        } else {
          currentLen = 0;
        }
      }
    }

    // 垂直方向
    for (let c = 0; c < GRID; c++) {
      let currentLen = 0;
      for (let r = 0; r < GRID; r++) {
        if (grid[r][c].type === T.CORRIDOR && checkVisited(r, c)) {
          if (currentLen > 0) {
            const et = edgeType(r - 1, c, r, c);
            if (et === E.NONE || et === E.DOOR) {
              currentLen++;
            } else {
              currentLen = 1;
            }
          } else {
            currentLen = 1;
          }
          if (currentLen >= 7) return true;
        } else {
          currentLen = 0;
        }
      }
    }
    return false;
  }

  /* ============================================================
     WINDOW COUNT & HELPERS
  ============================================================ */
  function countWindows(grid) {
    let count = 0;
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (edgeType(r, c, r, c + 1) === E.WINDOW && !hasSolidWall(r, c, r, c + 1)) count++;
        if (edgeType(r, c, r + 1, c) === E.WINDOW && !hasSolidWall(r, c, r + 1, c)) count++;
        if (r === 0 && edgeType(-1, c, r, c) === E.WINDOW && !hasSolidWall(-1, c, r, c)) count++;
        if (c === 0 && edgeType(r, -1, r, c) === E.WINDOW && !hasSolidWall(r, -1, r, c)) count++;
      }
    }
    return count;
  }

  function hasAnyWindow(grid) {
    return countWindows(grid) > 0;
  }

  /* ============================================================
     SCORE CALCULATOR
  ============================================================ */
  function calcRent(counts, combos, visited) {
    const reports = [];
    let rent = 0;

    // 1. Base floor area (cost based)
    const baseRent = counts.totalBaseRent;
    rent += baseRent;
    const spaceLv = getStaffSkillLevel('space_designer');
    const spaceNote = spaceLv > 0 ? ` (空間デザインLv${spaceLv}適用)` : '';
    reports.push({ icon:'ph-check text-emerald-600', text:`資産価値ベース利回り (+${baseRent.toFixed(1)}万)${spaceNote}` });

    // 1.5 ホスピタリティバフ
    const conLv = getStaffSkillLevel('concierge');
    if (conLv > 0) {
      const conBonus = [0, 4, 8, 12][conLv] || 5;
      reports.push({ icon:'ph-bell-ringing text-indigo-500', text:`【ホスピタリティLv${conLv}】初期満足度 +${conBonus}% (${conBonus}ヶ月バリア延長)` });
    }

    // 1.6 収納・管理バフ
    const storeLv = getStaffSkillLevel('storage_master');
    if (storeLv > 0 && counts.closetCells > 0) {
      const storeRiskRed = [0, 1.0, 2.0, 3.5][storeLv] || 1.0;
      reports.push({ icon:'ph-archive-box text-sky-500', text:`【収納・管理Lv${storeLv}】退去リスク -${storeRiskRed}% (収納物件特典)` });
    }

    // 2. Public requests
    let satisfiedCount = 0;
    for (const req of STAGE.requests) {
      const ok = req.fn ? req.fn(counts, {unreachable: counts.unreachable}, STAGE) : false;
      if (ok) {
        satisfiedCount++;
        reports.push({ icon:'ph-star-fill text-amber-500', text:`【依頼達成】${req.text} (満足度UP)` });
      } else {
        reports.push({ icon:'ph-x text-rose-500', text:`【依頼未達】${req.text} (満足度低下)` });
      }
    }

    // 2.5 任意オプション (バリア延長)
    let optSatisfiedCount = 0;
    const satisfiedOptIds = [];
    if (STAGE.optionalRequests) {
      for (const opt of STAGE.optionalRequests) {
        const ok = opt.fn ? opt.fn(counts, {unreachable: counts.unreachable}, STAGE) : false;
        if (ok) {
          optSatisfiedCount++;
          satisfiedOptIds.push(opt.id);
          reports.push({ icon:'ph-sparkle-fill text-amber-500', text:`【任意達成】${getOptionalReqText(opt)}` });
        }
      }
    }

    // 2.8 基礎生活設備（トイレ・風呂）ペナルティ
    let amenityPenalty = 0;
    if (!counts.hasToilet) {
      amenityPenalty += 25;
      reports.push({ icon:'ph-warning-octagon text-rose-600', text:'【欠陥】トイレ未設置 — 生活不可 (満足度-25%)' });
    }
    if (!counts.hasBath) {
      amenityPenalty += 15;
      reports.push({ icon:'ph-warning text-amber-600', text:'【不便】浴室未設置 — 銭湯必須 (満足度-15%)' });
    }
    if (counts.unitBathCount > 0 && STAGE && STAGE.requests && STAGE.requests.some(r => r.id === 'btsep')) {
      reports.push({ icon:'ph-info text-blue-500', text:'【設備】3点ユニットバス — 風呂トイレ同室' });
    }

    // 3. Movement factor
    const moveFactor = Math.max(0.1, 1.0 - counts.unreachable * 0.3);
    if (moveFactor < 1.0) {
      reports.push({ icon:'ph-warning-octagon text-rose-500', text:`【欠陥】到達不能部屋 ×${moveFactor.toFixed(1)} (-${(rent * (1-moveFactor)).toFixed(1)}万)` });
    }
    rent *= moveFactor;

    // 4. Combos & Custom Combos
    let normalRent = rent;
    let customBonusDiff = 0;

    for (const combo of combos) {
      let b = combo.bonus;
      if (STAGE.customCombo && STAGE.customCombo.name === combo.name) {
        customBonusDiff = STAGE.customCombo.customBonus - combo.bonus;
        reports.push({ icon:'ph-crown text-amber-500', text:`【特注ボーナス】${combo.name} 初代プレミアム (+${STAGE.customCombo.customBonus.toFixed(1)}万)` });
      } else {
        reports.push({ icon:`${combo.icon}`, text: combo.text });
      }
      rent += b;
      normalRent += b;
    }

    rent += customBonusDiff;
    rent = Math.round(rent * 10) / 10;
    normalRent = Math.round(normalRent * 10) / 10;
    return { rent, normalRent, reports, optSatisfiedCount, satisfiedOptIds, amenityPenalty };
  }

  /* ============================================================
     CATCHPHRASE & COMMENT GENERATOR
  ============================================================ */
  function genCatchphrase(counts, combos, optSatisfiedCount) {
    const funnyNames = combos.filter(c=>c.type==='funny').map(c=>c.name);
    if (funnyNames.includes('もはや公園') || combos.some(c=>c.name==='もはや公園'))
      return { main:'「ここは家か、それとも緑地広場か。見渡す限りの芝生と吹き抜ける風」', sub:'【公園物件】' };
    if (combos.some(c=>c.name==='ガラス張りハウス'))
      return { main:'「空と光に溶け込むパノラマビュー。全面ガラス張りの圧倒的開放感」', sub:'【ガラス張り物件】' };
    if (combos.some(c=>c.name==='陽だまりの家'))
      return { main:'「光と風が家中を駆け巡る。窓辺にぬくもり溢れる陽だまり邸」', sub:'【採光特選物件】' };
    if (combos.some(c=>c.name==='要塞化'))
      return { main:'「光なき城。外界を完全に遮断した静寂の要塞邸宅」', sub:'【要塞物件】' };
    if (combos.some(c=>c.name==='日当たり良好'))
      return { main:'「太陽が注ぐ特選邸宅。心地よい南向きの光に包まれる暮らし」', sub:'【陽光物件】' };
    if (funnyNames.includes('トイレビュッフェ'))
      return { main:'「急な腹痛も安心！トイレ直通パラダイスハウス」', sub:'【ユニーク物件】' };
    if (funnyNames.includes('無限回廊'))
      return { main:'「帰れない…廊下が私を呼んでいる。無限回廊エンドレスハウス」', sub:'【哲学的物件】' };
    if (funnyNames.includes('マトリョーシカ'))
      return { main:'「辿り着けない最奥の部屋。謎と神秘のマトリョーシカ邸」', sub:'【謎多き物件】' };
    if (funnyNames.includes('隠し部屋'))
      return { main:'「扉の向こうに広がる別世界。男のロマンを叶える秘密基地邸」', sub:'【秘密物件】' };
    if (funnyNames.includes('スケルトンバス'))
      return { main:'「玄関を開けたら浴室が見える。オープンな暮らしを体現した家」', sub:'【開放的物件】' };
    if (counts.unreachable > 0)
      return { main:'「封印されし部屋を抱えるミステリー邸。謎解き好きにどうぞ」', sub:'【ミステリー物件】' };
    if (counts.ldkRooms >= 1 && counts.bedRooms >= 2)
      return { main:'「理想の2LDKが完成！生活動線も完璧な快適スマート邸宅」', sub:'【特選・最新物件】' };
    return { main:'「ユニークな間取りが生み出す、他にはない暮らし方」', sub:'【特選物件】' };
  }

  function genComment(counts, combos, optSatisfiedCount, satisfaction, satisfiedReqs, unmetReqs, STAGE) {
    // 0. 基礎設備欠陥（トイレ・風呂）へのリアクション
    if (!counts.hasToilet) {
      return 'あの…部屋を見渡したんですが、トイレが見当たりません…！トイレのない家にどうやって住めばいいんでしょうか…！？';
    }
    if (!counts.hasBath) {
      return 'お風呂がついていないんですね…毎日銭湯に通うのはちょっと大変ですが、仕方ありませんね…';
    }
    // 1. 到達不能（重大欠陥）への困惑
    if (counts.unreachable > 0) {
      return 'えっ…？ 玄関から入れない部屋があるんですが…どうやって生活すればいいんでしょうか？（困惑）';
    }
    // 1.5 UB妥協（BT別要望があったのにUBだった場合）
    if (STAGE && STAGE.requests && STAGE.requests.some(r => r.id === 'btsep') && !counts.isBtSeparated && counts.unitBathCount > 0) {
      if (satisfaction >= 75) {
        return 'ユニットバスなのは少し妥協ですが、その他の間取りは希望通りで悪くないお部屋ですね！';
      }
    }
    // 2. ユニークコンボ・特殊設計へのリアクション
    if (combos.some(c=>c.name==='もはや公園'))
      return '庭が広すぎて…これ、家というより近所の児童公園じゃないですか！？草むしりだけで一日が終わっちゃいそうです！';
    if (combos.some(c=>c.name==='ガラス張りハウス'))
      return '部屋中が窓だらけでまるで温室かパノラマラウンジですね…！外からの視線と日差しがちょっと気になりますがすごい迫力です！';
    if (combos.some(c=>c.name==='陽だまりの家'))
      return '窓がたくさんあって光と風が部屋中に満ちています！朝起きた時の気持ちよさが段違いですね！';
    if (combos.some(c=>c.name==='隠し部屋'))
      return 'クローゼットの扉を開けたら別の部屋に…！？まるで隠し部屋みたいでテンションが上がります！';
    if (combos.some(c=>c.name==='要塞化'))
      return '窓が一つもない…！誰の視線も届かない、まさに私の求めていた完全なプライベート空間です…！';
    if (combos.some(c=>c.name==='トイレビュッフェ'))
      return 'こんなにたくさんのトイレに囲まれるなんて…！急な腹痛の時もこれなら安心ですね！';
    if (combos.some(c=>c.name==='無限回廊'))
      return '廊下がぐるぐる繋がっていて、歩いているだけで迷子になりそうです…不思議な魅力がありますね。';
    if (combos.some(c=>c.name==='マトリョーシカ'))
      return '部屋の中にさらに部屋が…！？秘密基地みたいでワクワクが止まりません！';
    if (combos.some(c=>c.name==='スケルトンバス'))
      return '玄関を開けたらすぐにお風呂が…！？ちょっと開放的すぎて来客時にドキドキしちゃいますね。';
    if (combos.some(c=>c.name==='日当たり良好'))
      return '南向きの窓から心地よい日差しが差し込んできて、毎朝気持ちよく起きられそうです！';

    // 3. 満足度別・要望達成状況に応じた依頼人の生の声
    if (satisfaction >= 100) {
      if (optSatisfiedCount > 0) {
        return '私の希望をすべて叶えてくれた上に、追加のこだわりまで完璧です！これ以上ない理想のマイホームになりました！';
      }
      return 'うわあ、素晴らしいです！間取りも動線も希望通りで、今日からここに住めると思うと本当にワクワクします！';
    }
    if (satisfaction >= 90) {
      if (!unmetReqs || unmetReqs.length === 0) {
        return '希望通りの暮らしやすそうなお部屋を作ってくださり感謝しています！とても快適に暮らせそうです。';
      }
      return '細かい点を除けば十分すぎるほど素敵なお部屋です！大切に使わせていただきますね。';
    }
    if (satisfaction >= 75) {
      if (unmetReqs && unmetReqs.length > 0) {
        return `「${unmetReqs[0].text}」が叶わなかったのは少し惜しいですが、全体としては悪くない間取りだと思います。`;
      }
      return '家賃や配置で少し悩ましいところもありますが、概ね希望通りですし、納得して暮らせそうです。';
    }
    if (satisfaction >= 50) {
      if (unmetReqs && unmetReqs.length > 0) {
        return `希望していた「${unmetReqs[0].text}」が入っていないのは正直残念ですが…生活はできるので今回は妥協して住んでみます。`;
      }
      return '少し住みづらそうな気もしますが…まあ予算や敷地のこともありますし、工夫して暮らしてみます。';
    }
    // 50%未満 (不満)
    if (unmetReqs && unmetReqs.length > 0) {
      return `私の出した「${unmetReqs[0].text}」などの希望、ちゃんと確認していただけましたか…？この間取りで暮らすのは正直厳しいです…`;
    }
    return 'うーん…家賃と間取りのバランスが希望とかなりかけ離れていて、正直不満が残る結果です…';
  }

  /* ============================================================
     RESULT CANVAS (thumbnail)
  ============================================================ */
  function drawResultCanvas() {
    const rc = document.getElementById('result-canvas');
    const maxDim = Math.min(window.innerWidth - 60, 280);
    const cs = Math.floor(maxDim / GRID);
    const total = cs * GRID;
    rc.width  = total * devicePixelRatio;
    rc.height = total * devicePixelRatio;
    rc.style.width  = `${total}px`;
    rc.style.height = `${total}px`;
    const rctx = rc.getContext('2d');
    rctx.resetTransform();
    rctx.scale(devicePixelRatio, devicePixelRatio);

    const fp = calcFootprintStats(grid);
    const bbox = fp ? fp.bbox : null;

    for (let r=0;r<GRID;r++) for (let c=0;c<GRID;c++) {
      const cell = grid[r][c];
      const inBox = bbox && r >= bbox.minR && r <= bbox.maxR && c >= bbox.minC && c <= bbox.maxC;
      if (cell.type === T.GARDEN || cell.type === T.EMPTY) {
        // 占有長方形の内側は鮮やかな庭（黄緑）、外側は未使用の敷地（淡いグレーベージュ）
        rctx.fillStyle = inBox ? '#d9f99d' : '#eef2f6';
        rctx.fillRect(c*cs, r*cs, cs, cs);
        if (!inBox) {
          // 未使用の敷地には控えめなドット模様を入れて区別しやすくする
          rctx.fillStyle = '#cbd5e1';
          rctx.fillRect(c*cs + cs*0.46, r*cs + cs*0.46, Math.max(1.2, cs*0.08), Math.max(1.2, cs*0.08));
        }
        rctx.strokeStyle = inBox ? '#bef264' : '#e2e8f0';
      } else {
        const s = CELL_STYLE[cell.type] || CELL_STYLE[T.EMPTY];
        rctx.fillStyle = s.bg;
        rctx.fillRect(c*cs, r*cs, cs, cs);
        rctx.strokeStyle = '#e2e8f0';
      }
      rctx.lineWidth = 0.5;
      rctx.strokeRect(c*cs, r*cs, cs, cs);
    }
    // 占有長方形の破線枠とサイズラベル
    drawOccupiedBoxOverlay(rctx, grid, cs, false, false);
    // Draw walls (simplified)
    rctx.save();
    for (let r=0;r<GRID;r++) for (let c=0;c<GRID;c++) {
      const x=c*cs, y=r*cs;
      drawEdgeOn(rctx, x+cs,y,x+cs,y+cs, r,c, r,c+1, 'v',cs);
      drawEdgeOn(rctx, x,y+cs,x+cs,y+cs, r,c, r+1,c, 'h',cs);
      if (r===0) drawEdgeOn(rctx,x,y,x+cs,y, -1,c, r,c, 'h',cs);
      if (c===0) drawEdgeOn(rctx,x,y,x,y+cs, r,-1, r,c, 'v',cs);
    }
    rctx.restore();
    // Labels
    const rooms={};
    for (let r=0;r<GRID;r++) for (let c=0;c<GRID;c++) {
      const cell=grid[r][c];
      if (!cell.roomId||cell.type===T.EMPTY||cell.type===T.ENTRANCE) continue;
      if (!rooms[cell.roomId]) rooms[cell.roomId]={cells:[],label:cell.label};
      rooms[cell.roomId].cells.push({r,c});
    }
    rctx.save();
    rctx.textAlign='center'; rctx.textBaseline='middle';
    for (const id in rooms) {
      const {cells,label}=rooms[id];
      let ax=0,ay=0;
      cells.forEach(({r,c})=>{ax+=(c+.5)*cs;ay+=(r+.5)*cs;});
      ax/=cells.length; ay/=cells.length;
      rctx.fillStyle='#0f172a';
      rctx.font=`bold ${Math.max(7,cs*0.22)}px "Zen Kaku Gothic New",sans-serif`;
      rctx.fillText(label,ax,ay);
    }
    // Entrance
    const entCells = (STAGE && STAGE.entranceCells) ? STAGE.entranceCells : [{ r: STAGE.entranceRow, c: STAGE.entranceCol }];
    const facing = getEntranceFacing(STAGE, grid);
    const label = `${facing.arrow}玄関`;
    const fontSize = Math.max(7, cs * 0.2);
    rctx.font = `bold ${fontSize}px "Zen Kaku Gothic New", sans-serif`;

    const minC = Math.min(...entCells.map(c => c.c));
    const maxC = Math.max(...entCells.map(c => c.c));
    const minR = Math.min(...entCells.map(c => c.r));
    const maxR = Math.max(...entCells.map(c => c.r));
    const startX = minC * cs, endX = (maxC + 1) * cs;
    const startY = minR * cs, endY = (maxR + 1) * cs;

    let rx = (startX + endX) / 2, ry = (startY + endY) / 2;
    if (facing.dir === 'bottom') {
      rx = (startX + endX) / 2; ry = endY - 1.5;
      rctx.textAlign = 'center'; rctx.textBaseline = 'bottom';
    } else if (facing.dir === 'top') {
      rx = (startX + endX) / 2; ry = startY + 1.5;
      rctx.textAlign = 'center'; rctx.textBaseline = 'top';
    } else if (facing.dir === 'left') {
      rx = startX + 1.5; ry = (startY + endY) / 2;
      rctx.textAlign = 'left'; rctx.textBaseline = 'middle';
    } else if (facing.dir === 'right') {
      rx = endX - 1.5; ry = (startY + endY) / 2;
      rctx.textAlign = 'right'; rctx.textBaseline = 'middle';
    }

    rctx.strokeStyle = 'rgba(255,255,255,0.9)';
    rctx.lineWidth = 2;
    rctx.lineJoin = 'round';
    rctx.strokeText(label, rx, ry);

    rctx.fillStyle = '#92400e';
    rctx.fillText(label, rx, ry);
    rctx.restore();
  }

  function drawEdgeOn(rctx,x1,y1,x2,y2,r1,c1,r2,c2,ori,cs) {
    const et=edgeType(r1,c1,r2,c2);
    if (et===E.NONE) return;
    
    const isSolid = hasSolidWall(r1, c1, r2, c2);
    const c1_cell = grid[r1]?.[c1], c2_cell = grid[r2]?.[c2];
    const ext=!c1_cell||c1_cell.type===T.EMPTY||c1_cell.type===T.GARDEN||
              !c2_cell||c2_cell.type===T.EMPTY||c2_cell.type===T.GARDEN;

    if (et === E.DOOR) {
      const len = ori === 'h' ? Math.abs(x2-x1) : Math.abs(y2-y1);
      const post = len * 0.18; // 壁の出っ張り
      const isWashitsu = Boolean((c1_cell && (c1_cell.label === '和室' || c1_cell.label?.includes('和') || c1_cell.pieceLibId === 'room-wa' || c1_cell.pieceLibId === 'room-wa2')) || 
                                 (c2_cell && (c2_cell.label === '和室' || c2_cell.label?.includes('和') || c2_cell.pieceLibId === 'room-wa' || c2_cell.pieceLibId === 'room-wa2')));
      rctx.strokeStyle = '#1e293b';
      rctx.lineWidth = 1.5;
      rctx.lineCap = 'round';
      
      const dw = len - post * 2;
      if (ori === 'h') {
        rctx.beginPath(); rctx.moveTo(x1,y1); rctx.lineTo(x1+post,y1); rctx.stroke();
        rctx.beginPath(); rctx.moveTo(x2-post,y2); rctx.lineTo(x2,y2); rctx.stroke();
        if (isWashitsu) {
          rctx.strokeStyle = '#94a3b8';
          rctx.lineWidth = 1.2;
          const off = Math.max(1.5, cs * 0.06);
          rctx.beginPath(); rctx.moveTo(x1+post, y1-off); rctx.lineTo(x1+post+dw, y1-off); rctx.stroke();
          rctx.beginPath(); rctx.moveTo(x1+post, y1+off); rctx.lineTo(x1+post+dw, y1+off); rctx.stroke();
        } else {
          rctx.strokeStyle = '#94a3b8'; rctx.lineWidth = 1;
          rctx.beginPath(); rctx.arc(x1+post, y1, dw, 0, Math.PI/2, false); rctx.stroke();
          rctx.strokeStyle = '#0f172a'; rctx.lineWidth = 1.5;
          rctx.beginPath(); rctx.moveTo(x1+post,y1); rctx.lineTo(x1+post+dw*0.7, y1+dw*0.7); rctx.stroke();
        }
      } else {
        rctx.beginPath(); rctx.moveTo(x1,y1); rctx.lineTo(x1,y1+post); rctx.stroke();
        rctx.beginPath(); rctx.moveTo(x2,y2-post); rctx.lineTo(x2,y2); rctx.stroke();
        if (isWashitsu) {
          rctx.strokeStyle = '#94a3b8';
          rctx.lineWidth = 1.2;
          const off = Math.max(1.5, cs * 0.06);
          rctx.beginPath(); rctx.moveTo(x1-off, y1+post); rctx.lineTo(x1-off, y1+post+dw); rctx.stroke();
          rctx.beginPath(); rctx.moveTo(x1+off, y1+post); rctx.lineTo(x1+off, y1+post+dw); rctx.stroke();
        } else {
          rctx.strokeStyle = '#94a3b8'; rctx.lineWidth = 1;
          rctx.beginPath(); rctx.arc(x1, y1+post, dw, -Math.PI/2, 0, false); rctx.stroke();
          rctx.strokeStyle = '#0f172a'; rctx.lineWidth = 1.5;
          rctx.beginPath(); rctx.moveTo(x1,y1+post); rctx.lineTo(x1+dw*0.7, y1+post-dw*0.7); rctx.stroke();
        }
      }
      return;
    }

    rctx.strokeStyle= isSolid ? '#000000' : (et===E.WINDOW ? '#0284c7' : (ext ? '#0f172a' : '#1e293b'));
    rctx.lineWidth  = isSolid ? 2.5 : (et===E.WINDOW ? 1.5 : (ext ? 2.5 : 1.5));
    rctx.lineCap='round';
    rctx.beginPath(); rctx.moveTo(x1,y1); rctx.lineTo(x2,y2); rctx.stroke();
  }

  /* ============================================================
     EVALUATE & SHOW RESULT
  ============================================================ */
  let activeCombos = [];
  let activeMetRequestIds = new Set();

  function updateRealtimeRequests(counts, visited, skipToast = false) {
    if (!STAGE || !STAGE.requests) return;
    const container = document.getElementById('mission-req-pills');
    if (!container) return;

    let html = '';
    const newlyMet = [];

    // Main requests
    for (const req of STAGE.requests) {
      const isMet = !!(req.fn && req.fn(counts, { unreachable: counts.unreachable }, STAGE));
      const wasMet = activeMetRequestIds.has(req.id);
      if (isMet && !wasMet) {
        newlyMet.push(req);
      }
      const iconCls = isMet ? 'ph-check-circle' : 'ph-clock';
      const statusCls = isMet ? 'met' : 'unmet';
      html += `<div class="req-pill ${statusCls}">
        <i class="ph-bold ${iconCls}"></i>
        <span>${req.text}</span>
      </div>`;
    }

    // Optional requests
    if (STAGE.optionalRequests) {
      for (const opt of STAGE.optionalRequests) {
        const isMet = !!(opt.fn && opt.fn(counts, { unreachable: counts.unreachable }, STAGE));
        const wasMet = activeMetRequestIds.has(opt.id);
        if (isMet && !wasMet) {
          newlyMet.push(opt);
        }
        const iconCls = isMet ? 'ph-star' : 'ph-clock';
        const statusCls = isMet ? 'opt met' : 'opt unmet';
        html += `<div class="req-pill ${statusCls}">
          <i class="ph-bold ${iconCls}"></i>
          <span>${getOptionalReqText(opt)}</span>
        </div>`;
      }
    }

    container.innerHTML = html;

    if (!skipToast) {
      // Toast notification for newly achieved requests
      newlyMet.forEach((r, idx) => {
        setTimeout(() => {
          const reqLabel = (r.id && r.id.startsWith('opt-')) ? getOptionalReqText(r) : r.text;
          showFloatingText(`✨ ${reqLabel} 達成！`, 'var(--c-emerald)');
          playSound('combo');
        }, idx * 250);
      });
    }

    // Update the set of met request IDs
    activeMetRequestIds = new Set();
    for (const req of STAGE.requests) {
      if (req.fn && req.fn(counts, { unreachable: counts.unreachable }, STAGE)) activeMetRequestIds.add(req.id);
    }
    if (STAGE.optionalRequests) {
      for (const opt of STAGE.optionalRequests) {
        if (opt.fn && opt.fn(counts, { unreachable: counts.unreachable }, STAGE)) activeMetRequestIds.add(opt.id);
      }
    }
  }

  function updateModalMissionList(counts, visited) {
    const mrl = document.getElementById('modal-req-list');
    if (!mrl || !STAGE) return;
    mrl.innerHTML = '';
    const reqHead = document.createElement('div');
    reqHead.style.cssText = 'font-size:11px; font-weight:bold; color:#93c5fd; margin-bottom:4px; display:flex; align-items:center; gap:4px;';
    reqHead.innerHTML = '<i class="ph-bold ph-clipboard-text"></i> 基本の依頼内容';
    mrl.appendChild(reqHead);
    for (const req of STAGE.requests) {
      const isMet = !!(req.fn && req.fn(counts, { unreachable: counts.unreachable }, STAGE));
      const item = document.createElement('div');
      item.className = 'req-item';
      item.style.marginBottom = '6px';
      item.style.display = 'flex';
      item.style.alignItems = 'center';
      item.style.justifyContent = 'space-between';
      item.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px;">
          <i class="ph-bold ${req.icon}" style="color:${req.color};font-size:14px;"></i>
          <span style="font-size:12px;">${req.text}</span>
        </div>
        <span class="badge ${isMet ? 'badge-emerald' : 'badge-slate'}" style="font-size:10px; padding:2px 6px;">
          ${isMet ? '✅ 達成' : '⏳ 未達'}
        </span>
      `;
      mrl.appendChild(item);
    }
    if (STAGE.optionalRequests && STAGE.optionalRequests.length > 0) {
      const optHead = document.createElement('div');
      optHead.style.cssText = 'font-size:11px; font-weight:bold; color:var(--c-amber); margin:8px 0 4px;';
      optHead.textContent = '🌟 任意オプション (満足度UP)';
      mrl.appendChild(optHead);
      for (const opt of STAGE.optionalRequests) {
        const isMet = !!(opt.fn && opt.fn(counts, { unreachable: counts.unreachable }, STAGE));
        const item = document.createElement('div');
        item.className = 'req-item';
        item.style.marginBottom = '6px';
        item.style.background = '#fefce8';
        item.style.borderColor = '#fef08a';
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.justifyContent = 'space-between';
        item.innerHTML = `
          <div style="display:flex; align-items:center; gap:6px;">
            <i class="ph-bold ${opt.icon}" style="color:${opt.color};font-size:14px;"></i>
            <span style="font-size:12px;color:#854d0e;">${getOptionalReqText(opt)}</span>
          </div>
          <span class="badge ${isMet ? 'badge-amber' : 'badge-slate'}" style="font-size:10px; padding:2px 6px;">
            ${isMet ? '⭐ 達成' : '⏳ 未達'}
          </span>
        `;
        mrl.appendChild(item);
      }
    }
  }

  function updateRealtimeRent(skipToast = false) {
    const visited = runBFS();
    const counts  = countCells(visited);
    const combos  = detectCombos(counts, visited);
    let { rent }  = calcRent(counts, combos, visited);

    updateRealtimeRequests(counts, visited, skipToast);

    const rentEl = document.getElementById('realtime-rent-badge');
    if (rentEl) {
      const isCleared = STAGE && rent >= STAGE.targetRent;
      rentEl.innerHTML = `${rent.toFixed(1)}<span style="font-size:9px;color:var(--c-text2);">万</span>`;
      rentEl.style.transform = 'scale(1.18)';
      rentEl.style.color = '#fbbf24';
      setTimeout(() => {
        rentEl.style.transform = 'scale(1)';
        rentEl.style.color = isCleared ? 'var(--c-emerald)' : 'var(--c-amber-lt)';
      }, 200);
    }

    const newCombos = combos.filter(c => !activeCombos.some(ac => ac.name === c.name));
    const lostCombos = activeCombos.filter(ac => !combos.some(c => c.name === ac.name));

    newCombos.forEach((c, idx) => {
       setTimeout(() => {
         showFloatingText(`✨ ${c.name}`);
         playSound('combo');
       }, idx * 300);
    });

    lostCombos.forEach((ac, idx) => {
       setTimeout(() => {
         showFloatingText(`💨 失効: ${ac.name}`, '#64748b');
         playSound('error');
       }, (newCombos.length + idx) * 300);
    });

    activeCombos = combos;
  }

  function evaluate(isRestoring = false) {
    gardenize();
    drawPlan();

    const visited = runBFS();
    const counts  = countCells(visited);
    const combos  = detectCombos(counts, visited);
    const newlyDiscovered = recordDiscoveredCombos(combos);

    const { rent, normalRent, reports, optSatisfiedCount, satisfiedOptIds, amenityPenalty } = calcRent(counts, combos, visited);

    const isClear = rent >= STAGE.targetRent;
    
    // 資金の正式確定は「物件を引き渡す」で行う（トランザクション確定方式）。
    // ここでは結果画面の中断状態をオートセーブする。
    saveActiveBuild('result');

    // 依頼達成・未達成の集計
    let satisfiedCount = 0;
    const satisfiedReqs = [];
    const unmetReqs = [];
    for (const req of STAGE.requests) {
      const ok = req.fn ? req.fn(counts, {unreachable: counts.unreachable}, STAGE) : false;
      if (ok) {
        satisfiedCount++;
        satisfiedReqs.push(req);
      } else {
        unmetReqs.push(req);
      }
    }

    let badCombos = 0;
    let goodCombos = 0;
    combos.forEach(c => {
      if (STAGE.customCombo && STAGE.customCombo.name === c.name && STAGE.customCombo.isNegativeInversion) {
        goodCombos++; // 初代では特注反転により良コンボ扱い
      } else if (c.bonus < 0) {
        badCombos++;
      } else {
        goodCombos++;
      }
    });
    if (counts.unreachable > 0) badCombos++; // 到達不能ペナルティ

    const totalSpentCost = Math.round((buildPiecePaidCost + buildRerollCost + buildWallRemoveCost + buildEncroachCost) * 10) / 10;
    const discountSaved = Math.max(0, Math.round((buildBaseCost - (buildPiecePaidCost - buildMirrorExtraCost - buildCycleExtraCost)) * 10) / 10);
    const fp = calcFootprintStats(grid, encroachCount);

    window.currentPropertyData = {
      rent: rent,
      normalRent: normalRent,
      targetRent: STAGE.targetRent,
      baseRent: counts.totalBaseRent,
      baseCost: buildBaseCost,
      piecePaidCost: buildPiecePaidCost,
      mirrorCost: buildMirrorExtraCost,
      cycleExtraCost: buildCycleExtraCost,
      rerollCost: buildRerollCost,
      wallRemoveCost: buildWallRemoveCost,
      encroachCost: buildEncroachCost,
      encroachCount: fp.encroachedCells,
      floorCells: fp.floorCells,
      marginGardenCells: fp.marginGardenCells,
      maxGardenCluster: fp.maxGardenCluster,
      occupiedArea: fp.occupiedArea,
      totalCost: totalSpentCost,
      discountSaved: discountSaved,
      bbox: fp.bbox,
      isClear: isClear,
      satisfiedCount: satisfiedCount,
      totalRequests: STAGE.requests.length,
      optionalSatisfied: optSatisfiedCount || 0,
      satisfiedOptIds: satisfiedOptIds || [],
      hasStorage: (counts.closetCells > 0) || (counts.closetRooms > 0),
      closetCells: counts.closetCells || 0,
      amenityPenalty: amenityPenalty || 0,
      badCombos: badCombos,
      goodCombos: goodCombos,
      combosList: combos.map(c => ({name:c.name, icon:c.icon, bonus:c.bonus})),
      createdMonth: GameState.month,
      isOriginalTenant: true,
      clientName: STAGE.client.name,
      customCombo: STAGE.customCombo || null
    };

    const stats = calcPropertyStats(window.currentPropertyData);
    const sat = stats.satisfaction;

    const catch_ = genCatchphrase(counts, combos, optSatisfiedCount);
    const comment = genComment(counts, combos, optSatisfiedCount, sat, satisfiedReqs, unmetReqs, STAGE);

    // Populate result UI
    document.getElementById('flyer-sub-catch').textContent = catch_.sub;
    document.getElementById('flyer-main-catch').textContent = catch_.main;
    document.getElementById('flyer-rent').textContent = rent.toFixed(1);

    // Populate flyer construction cost & ROI summary
    const fTotalEl = document.getElementById('flyer-total-cost');
    const fDetailEl = document.getElementById('flyer-cost-detail');
    const fRoiEl = document.getElementById('flyer-roi-note');
    const fDrawerEl = document.getElementById('flyer-breakdown-drawer');
    window.activeFlyerBreakdownKey = null;
    if (fDrawerEl) fDrawerEl.style.display = 'none';
    const fCostRow = document.getElementById('flyer-cost-row');
    if (fCostRow) fCostRow.style.background = 'transparent';

    if (fTotalEl) fTotalEl.textContent = `${totalSpentCost.toFixed(1)}万円`;
    if (fDetailEl) {
      const extraItems = [];
      if (buildCycleExtraCost > 0) extraItems.push(`追加発注+${buildCycleExtraCost.toFixed(1)}万`);
      if (buildMirrorExtraCost > 0) extraItems.push(`反転+${buildMirrorExtraCost.toFixed(1)}万`);
      if (buildRerollCost > 0) extraItems.push(`更新+${buildRerollCost.toFixed(1)}万`);
      if (buildWallRemoveCost > 0) extraItems.push(`壁撤去+${buildWallRemoveCost.toFixed(1)}万`);
      if (buildEncroachCost > 0) extraItems.push(`造成+${buildEncroachCost.toFixed(1)}万`);
      const extraPart = extraItems.length > 0 ? extraItems.join('・') : '諸経費 0.0万';
      const discPart = discountSaved > 0 ? ` ・ 割引 -${discountSaved.toFixed(1)}万` : '';
      fDetailEl.textContent = `ピース原価 ${buildBaseCost.toFixed(1)}万 ・ ${extraPart}${discPart}`;
    }
    if (fRoiEl) {
      const netMonthly = Math.round((rent - stats.maintCost) * 10) / 10;
      const paybackText = netMonthly > 0
        ? (totalSpentCost <= 0 ? '即時回収' : `回収目安: <strong>約${Math.ceil(totalSpentCost / netMonthly)}ヶ月</strong>`)
        : '<strong>回収不可</strong>';
      fRoiEl.innerHTML = `
        <span id="flyer-pill-val" onclick="toggleFlyerBreakdown('val')" style="cursor:pointer; padding:2px 5px; border-radius:4px; transition:background 0.15s;" title="タップで査定額の内訳">査定額: <strong>${stats.resaleValue}万</strong> <i class="ph-bold ph-info" style="font-size:10px; opacity:0.75;"></i></span>
        <span id="flyer-pill-maint" onclick="toggleFlyerBreakdown('maint')" style="cursor:pointer; padding:2px 5px; border-radius:4px; transition:background 0.15s;" title="タップで維持費の内訳">維持費: <strong>-${stats.maintCost.toFixed(1)}万/月</strong> <i class="ph-bold ph-info" style="font-size:10px; opacity:0.75;"></i></span>
        <span id="flyer-pill-roi" onclick="toggleFlyerBreakdown('roi')" style="cursor:pointer; padding:2px 5px; border-radius:4px; transition:background 0.15s;" title="タップで回収目安の内訳">${paybackText} <i class="ph-bold ph-info" style="font-size:10px; opacity:0.75;"></i></span>
      `;
    }

    const badge = document.getElementById('flyer-clear-badge');
    const diff  = document.getElementById('flyer-rent-diff');
    const btnNext = document.getElementById('btn-next-stage');
    const btnRestart = document.getElementById('btn-restart');
    const btnGiveup = document.getElementById('btn-giveup');
    
    // 足切り撤廃：常に納品（引き渡し）可能
    btnNext.style.display = 'block';
    btnNext.innerHTML = '<i class="ph-bold ph-key" style="font-size:13px; margin-right:4px;"></i>物件を引き渡す';
    if (btnGiveup) btnGiveup.style.display = 'block';
    
    // 満足度バッジ (100%〜: 大満足, 90〜: 満足, 75〜: 納得, 50〜: 妥協, 50未満: 不満)
    let badgeText = '';
    let badgeColor = '#ffffff';
    if (sat >= 100) {
      badgeText = `大満足 ❤️ ${sat}%`;
      badgeColor = '#fb7185';
    } else if (sat >= 90) {
      badgeText = `満足 😊 ${sat}%`;
      badgeColor = '#34d399';
    } else if (sat >= 75) {
      badgeText = `納得 😐 ${sat}%`;
      badgeColor = '#38bdf8';
    } else if (sat >= 50) {
      badgeText = `妥協 💦 ${sat}%`;
      badgeColor = '#fbbf24';
    } else {
      badgeText = `不満 😣 ${sat}%`;
      badgeColor = '#f87171';
    }
    badge.textContent = badgeText;
    badge.className = 'flyer-badge';
    badge.style.background = '#0f172a';
    badge.style.color = badgeColor;

    if (!isRestoring) {
      if (sat >= 75) {
        playSound('clear');
      } else {
        playSound('error');
      }
    }

    const diffVal = rent - STAGE.targetRent;
    if (diffVal > 0) {
      diff.textContent = `(希望額+${diffVal.toFixed(1)}万)`;
      diff.className   = 'flyer-rent-diff clear';
    } else if (diffVal < 0) {
      diff.textContent = `(希望額-${Math.abs(diffVal).toFixed(1)}万)`;
      diff.className   = 'flyer-rent-diff fail';
    } else {
      diff.textContent = `(希望額通り)`;
      diff.className   = 'flyer-rent-diff clear';
    }
    
    btnRestart.style.display = 'block';
    if (GameState.attempts > 0) {
      btnRestart.disabled = false;
      btnRestart.style.opacity = '1';
      btnRestart.innerHTML = `<i class="ph-bold ph-arrow-counter-clockwise" style="font-size:13px;"></i> もう一度設計 (残${GameState.attempts}回)`;
    } else {
      btnRestart.disabled = true;
      btnRestart.style.opacity = '0.5';
      btnRestart.innerHTML = `<i class="ph-bold ph-arrow-counter-clockwise" style="font-size:13px;"></i> もう一度設計 (残0回)`;
    }

    // Report list
    const rl = document.getElementById('report-list');
    rl.innerHTML = '';
    if (newlyDiscovered.length > 0) {
      const newBanner = document.createElement('div');
      newBanner.className = 'report-item';
      newBanner.style.cssText = 'background:#fef3c7; border:1px solid #f59e0b; color:#92400e; font-weight:bold;';
      newBanner.innerHTML = `<i class="ph-fill ph-trophy" style="font-size:15px; color:#d97706;"></i><span>🆕 記録帳に新コンボ登録：「${newlyDiscovered.join('」「')}」</span>`;
      rl.appendChild(newBanner);
    }
    for (const rep of reports) {
      const item = document.createElement('div');
      item.className = 'report-item';
      item.innerHTML = `<i class="ph-bold ${rep.icon}" style="font-size:14px;"></i><span>${rep.text}</span>`;
      rl.appendChild(item);
    }

    // 初代借主コメント
    const commentTitleEl = document.getElementById('flyer-comment-title');
    if (commentTitleEl) {
      commentTitleEl.innerHTML = `<i class="ph-bold ph-chat-centered-dots"></i><span>${STAGE.client ? (STAGE.client.avatar || '👤') + ' ' + STAGE.client.name + ' 様の感想' : 'ご入居者の感想'}</span>`;
    }
    document.getElementById('flyer-comment').textContent = comment;

    // Draw thumbnail
    drawResultCanvas();
    const rc = document.getElementById('result-canvas');
    if (rc) {
      try {
        window.currentPropertyData.thumbnail = rc.toDataURL('image/png');
      } catch(e) {}
    }

    showScreen('result');
  }

  /* ============================================================
     MISSION SCREEN SETUP
  ============================================================ */
  function setupMissionScreen() {
    if (!STAGE) return;
    // Client info
    document.getElementById('client-name').textContent = STAGE.client.name;
    document.getElementById('client-quote').textContent = STAGE.client.quote;
    const cav = document.querySelector('.client-avatar');
    if (cav && STAGE.client.avatar) cav.textContent = STAGE.client.avatar;
    const ctb = document.getElementById('client-type-badge');
    if (ctb && STAGE.client.typeBadge) ctb.textContent = STAGE.client.typeBadge;

    // Request list
    const rl = document.getElementById('req-list');
    rl.innerHTML = '';

    const reqHeader = document.createElement('div');
    reqHeader.style.cssText = 'font-size:11px; font-weight:bold; color:#93c5fd; margin-bottom:4px; display:flex; align-items:center; gap:4px;';
    reqHeader.innerHTML = '<i class="ph-bold ph-clipboard-text"></i> 基本の依頼内容';
    rl.appendChild(reqHeader);

    for (const req of STAGE.requests) {
      const item = document.createElement('div');
      item.className = 'req-item';
      item.innerHTML = `<i class="ph-bold ${req.icon}" style="color:${req.color};font-size:16px;"></i><span>${req.text}</span>`;
      rl.appendChild(item);
    }
    if (STAGE.optionalRequests && STAGE.optionalRequests.length > 0) {
      const optHeader = document.createElement('div');
      optHeader.style.cssText = 'font-size:11px; font-weight:bold; color:var(--c-amber); margin:10px 0 4px; display:flex; align-items:center; gap:4px;';
      optHeader.innerHTML = '<i class="ph-fill ph-star" style="color:var(--c-amber);"></i> 任意オプション (満足度UP)';
      rl.appendChild(optHeader);
      for (const opt of STAGE.optionalRequests) {
        const item = document.createElement('div');
        item.className = 'req-item';
        item.style.background = '#fefce8';
        item.style.borderColor = '#fef08a';
        item.innerHTML = `<i class="ph-bold ${opt.icon}" style="color:${opt.color};font-size:16px;"></i><span style="color:#854d0e;">${getOptionalReqText(opt)}</span>`;
        rl.appendChild(item);
      }
    }

    // Modal Client Info
    const mcq = document.getElementById('modal-client-quote');
    if (mcq) mcq.textContent = STAGE.client.quote;
    
    // Update Stats
    document.getElementById('stat-rent').innerHTML = `${STAGE.targetRent.toFixed(1)}<span class="stat-unit">万/月</span>`;
    
    const facingMap = { bottom: '南向き', top: '北向き', left: '西向き', right: '東向き' };
    const facingText = facingMap[STAGE.entranceFacing] || '南向き';
    const entSizeText = (STAGE.entranceCells && STAGE.entranceCells.length > 1) ? '（2マス玄関）' : '玄関';
    const lotNameEl = document.getElementById('stat-lot-name');
    if (lotNameEl) lotNameEl.textContent = STAGE.lotName || '標準敷地';
    const entFacingEl = document.getElementById('stat-entrance-facing');
    if (entFacingEl) entFacingEl.textContent = `${facingText}${entSizeText}`;

    // Site preview canvas
    drawSitePreview();
  }

  function drawSitePreview() {
    const c = document.getElementById('site-preview-canvas');
    if (!c || !STAGE) return;
    const pcs = 20; // preview cell size
    const total = pcs * GRID;
    c.width  = total * devicePixelRatio;
    c.height = total * devicePixelRatio;
    c.style.width  = `${total}px`;
    c.style.height = `${total}px`;
    const pc = c.getContext('2d');
    pc.resetTransform();
    pc.scale(devicePixelRatio, devicePixelRatio);
    for (let r=0;r<GRID;r++) for (let col=0;col<GRID;col++) {
      let isObs = false;
      if (STAGE.obstacles) {
        for (const obs of STAGE.obstacles) {
          if (r >= obs.r && r < obs.r + (obs.h || 1) && col >= obs.c && col < obs.c + (obs.w || 1)) {
            isObs = true;
          }
        }
      }
      if (isObs) {
        pc.fillStyle = '#cbd5e1';
      } else {
        pc.fillStyle = '#f8fafc';
      }
      pc.fillRect(col*pcs, r*pcs, pcs, pcs);
      pc.strokeStyle = '#e2e8f0';
      pc.lineWidth = 0.5;
      pc.strokeRect(col*pcs, r*pcs, pcs, pcs);
      
      if (isObs) {
        pc.strokeStyle = '#94a3b8';
        pc.beginPath();
        pc.moveTo(col*pcs, r*pcs); pc.lineTo((col+1)*pcs, (r+1)*pcs);
        pc.moveTo((col+1)*pcs, r*pcs); pc.lineTo(col*pcs, (r+1)*pcs);
        pc.stroke();
      }
    }
    // Exterior walls
    pc.strokeStyle = '#0f172a'; pc.lineWidth = 2.5;
    pc.strokeRect(1, 1, total-2, total-2);
    // Entrance marker
    const entCells = STAGE.entranceCells || [{ r: STAGE.entranceRow, c: STAGE.entranceCol }];
    const facing = getEntranceFacing(STAGE);
    pc.fillStyle = '#fef08a';
    for (const ec of entCells) {
      pc.fillRect(ec.c*pcs+1, ec.r*pcs+1, pcs-2, pcs-2);
    }
    pc.fillStyle = '#92400e';
    pc.font = `bold ${pcs*0.4}px sans-serif`;
    pc.textAlign = 'center'; pc.textBaseline = 'middle';
    if (entCells.length === 1) {
      pc.fillText(facing.arrow, entCells[0].c*pcs+pcs/2, entCells[0].r*pcs+pcs/2);
    } else {
      const minC = Math.min(...entCells.map(c => c.c));
      const maxC = Math.max(...entCells.map(c => c.c));
      const minR = Math.min(...entCells.map(c => c.r));
      const maxR = Math.max(...entCells.map(c => c.r));
      const midX = (minC + (maxC - minC + 1) / 2) * pcs;
      const midY = (minR + (maxR - minR + 1) / 2) * pcs;
      pc.fillText(facing.arrow, midX, midY);
    }
  }

  /* ============================================================
     GAME START
  ============================================================ */
  function startGame() {
    loadGame();
    updateStage();
    budget = GameState.funds;
    buildBaseCost = 0;
    buildPiecePaidCost = 0;
    buildMirrorExtraCost = 0;
    buildCycleExtraCost = 0;
    buildRerollCost = 0;
    buildWallRemoveCost = 0;
    wallRemoveCount = 0;
    buildEncroachCost = 0;
    encroachCount = 0;
    selectedWallTarget = null;
    hintDismissedForBuild = false;
    currentLevelIdx = GameState.level;
    
    updateCompanyUI();

    initGrid();
    budget = GameState.funds;
    selectedSlot = 0; selectedRot = 0;
    previewMode = false; hoverCell = null;
    const co = document.getElementById('confirm-overlay');
    if (co) co.style.display = 'none';
    const maxSlots = getMaxHandSlots();
    draftSlots = Array(maxSlots).fill(null);
    keepStates = Array(maxSlots).fill(false);
    keepCounts = Array(maxSlots).fill(0);
    discardCount = 0;
    handRefreshesRemaining = getStaffSkillLevel('hand_refresh');
    initDeckPiles();
    refillDraft();
    updateHandRefreshButton();
    
    // Update Header UI
    updateCompanyUI();
    const _hdrT = document.getElementById('hdr-target-rent'); if (_hdrT) _hdrT.innerHTML = `${STAGE.targetRent.toFixed(1)}<span style="font-size:9px;color:var(--c-text2);">万</span>`;
    updateBudgetUI();
    
    const hint = document.getElementById('hint-overlay');
    if (hint) hint.style.opacity = '1';
    const mbt = document.getElementById('mission-banner-text');
    if (mbt) mbt.textContent = `「${STAGE.requests.map(r=>r.text).join('・')}でお願い！」`;
    resizeCanvas();
    showScreen('game');
    saveActiveBuild('game');
  }

  /* ============================================================
     RESTART
  ============================================================ */
  function restart() {
    showScreen('mission');
  }

  /* ============================================================
     BUTTON WIRING
  ============================================================ */
  function showCapacityAlertModal(activeCount, maxCap) {
    const modal = document.getElementById('capacity-alert-modal');
    if (!modal) return;
    const countEl = document.getElementById('cap-alert-count');
    const statusText = activeCount > maxCap ? '上限超過' : '満杯';
    if (countEl) countEl.textContent = `${activeCount} / ${maxCap}棟 (${statusText})`;
    modal.style.display = 'flex';
  }

  function closeCapacityAlertModal() {
    const modal = document.getElementById('capacity-alert-modal');
    if (modal) modal.style.display = 'none';
  }

  document.getElementById('btn-close-capacity-alert')?.addEventListener('click', () => {
    initAudio();
    closeCapacityAlertModal();
  });
  document.getElementById('capacity-alert-modal')?.addEventListener('pointerdown', (e) => {
    if (e.target && e.target.id === 'capacity-alert-modal') {
      initAudio();
      closeCapacityAlertModal();
    }
  });

  document.getElementById('btn-cap-to-upgrade')?.addEventListener('click', () => {
    initAudio();
    closeCapacityAlertModal();
    openCompanyUpgradeModal('company');
  });

  document.getElementById('btn-cap-to-sell')?.addEventListener('click', () => {
    initAudio();
    closeCapacityAlertModal();
  });

  function ensureCanStartBuild() {
    const deadEnd = checkDeadEndBankruptcy();
    if (deadEnd.isBankrupt) {
      playSound('error');
      showGameOverModal(deadEnd.reason);
      return false;
    }

    // 管理戸数上限チェック（未受注の新規着工時のみ）
    if (!GameState.currentMission) {
      const activeCount = getActivePropertyCount();
      const maxCap = getMaxPropertyCapacity();
      if (activeCount >= maxCap) {
        playSound('error');
        showCapacityAlertModal(activeCount, maxCap);
        return false;
      }
    }

    if (GameState.funds < MIN_BUILD_FUNDS) {
      playSound('error');
      showScreen('home');
      updateHomeUI();
      openCompanyUpgradeModal('bank');
      if (getRemainingLoanCapacity() > 0) {
        showUpgradeFeedback(`⚠️ 建築資金が不足しています（最低${MIN_BUILD_FUNDS}万円必要）。銀行から運転資金の融資を受けてください！`, 'var(--c-rose)');
      } else {
        showUpgradeFeedback(`⚠️ 建築資金および融資枠が不足しています（最低${MIN_BUILD_FUNDS}万円必要）。所有物件を売却するか、1ヶ月進めて家賃収入を得てください！`, 'var(--c-rose)');
      }
      return false;
    }
    return true;
  }

  document.getElementById('btn-mission-deck')?.addEventListener('click', () => {
    openCompanyUpgradeModal('deck');
  });

  document.getElementById('btn-start').addEventListener('click', () => {
    initAudio();
    if (!ensureCanStartBuild()) return;
    if (GameState.attempts === undefined || GameState.attempts < 0) GameState.attempts = getMaxAttempts();
    GameState.lastFunds = GameState.funds; // 開始時の資金を記録
    saveGame();
    startGame();
  });
  document.getElementById('btn-sound-mission').addEventListener('click', toggleSound);
  document.getElementById('btn-sound-game')?.addEventListener('click', toggleSound);

  document.getElementById('btn-rotate').addEventListener('click', () => {
    initAudio();
    cancelRerollConfirm();
    if (selectedSlot === null || !draftSlots[selectedSlot]) return;
    selectedRot = (selectedRot + 1) % 4;
    playSound('rotate');
    renderDraftUI();
    updatePieceLabel();
    drawPlan();
  });
  document.getElementById('btn-mirror').addEventListener('click', () => {
    initAudio();
    cancelRerollConfirm();
    if (selectedSlot === null || !draftSlots[selectedSlot]) return;
    isMirrored = !isMirrored;
    playSound('rotate');
    renderDraftUI();
    updatePieceLabel();
    drawPlan();
  });

  document.getElementById('btn-reroll')?.addEventListener('click', (e) => {
    e.stopPropagation();
    initAudio();
    const costs = getRerollCost();
    if (budget < costs.total) {
      playSound('error');
      showFloatingText('資金不足！', 'var(--c-rose)');
      cancelRerollConfirm();
      showEmergencyLoanPrompt(costs.total - budget);
      return;
    }

    if (!isRerollConfirming) {
      // 1回目のタップ: 確認状態（ハイライト）へ
      isRerollConfirming = true;
      playSound('tap');
      updateRerollButton();
      if (rerollConfirmTimer) clearTimeout(rerollConfirmTimer);
      rerollConfirmTimer = setTimeout(() => {
        cancelRerollConfirm();
      }, 4000);
      return;
    }

    // 2回目のタップ: 実行
    cancelRerollConfirm();
    
    let discarded = 0;
    for (let i = 0; i < draftSlots.length; i++) {
      if (draftSlots[i] !== null) {
        if (!keepStates[i]) {
          discarded++;
        }
      }
    }

    budget = Math.round((budget - costs.total) * 10) / 10;
    buildRerollCost = Math.round((buildRerollCost + costs.total) * 10) / 10;
    discardCount += discarded;
    updateBudgetUI();
    if (costs.total > 0) {
      showFloatingText(`-${costs.total.toFixed(1)}万`, 'var(--c-rose)');
    }

    // 捨てたカードが直後のシャッフルで即座に引き直されないよう、
    // 先に山札から新しいカードを引き、その後で今回捨てたカードを捨て札へ送る
    const newlyDiscardedIds = [];
    for (let i = 0; i < draftSlots.length; i++) {
      if (draftSlots[i] !== null && keepStates[i]) {
        keepCounts[i]++;
      } else {
        if (draftSlots[i] && draftSlots[i].id) {
          newlyDiscardedIds.push(draftSlots[i].id);
        }
        draftSlots[i] = drawPieceFromDeck();
        keepStates[i] = false;
        keepCounts[i] = 0;
      }
    }
    for (const did of newlyDiscardedIds) {
      discardPile.push(did);
    }
    updateDeckPeekButton();
    
    if (selectedSlot !== null && draftSlots[selectedSlot] === null) {
      let next = draftSlots.findIndex(p => p !== null);
      if (next !== -1) selectedSlot = next;
      else selectedSlot = null;
    }

    isMirrored = false;
    selectedRot = 0;
    renderDraftUI();
    updatePieceLabel();
    drawPlan();
    playSound('clear');
    saveActiveBuild('game');
  });

  function openDeckPeekModal() {
    initAudio();
    cancelRerollConfirm();
    const modal = document.getElementById('deck-peek-modal');
    const sub = document.getElementById('deck-peek-subtitle');
    const body = document.getElementById('deck-peek-body');
    if (!modal || !body) return;

    const totalDeck = getActiveDeckPieceIds().length;
    const handPieces = draftSlots.filter(p => p !== null);
    const curCycle = deckCycle || 1;
    const curPct = getCycleSurchargePct(curCycle);
    const nextCycle = curCycle + 1;
    const nextPct = getCycleSurchargePct(nextCycle);
    if (sub) {
      const cycleStr = curCycle >= 2 ? `現在 ${curCycle}周目 (+${curPct}%割増)` : `現在 1周目 (標準原価)`;
      sub.textContent = `${cycleStr} ｜ 山札残り ${drawPile.length}/${totalDeck}枚 ｜ 手札 ${handPieces.length}枚 ｜ 捨て札 ${discardPile.length}枚`;
    }

    const renderGroupedList = (idList, emptyText, targetCycle = curCycle) => {
      if (!idList || idList.length === 0) {
        return `<div style="font-size:11px; color:var(--c-text3); text-align:center; padding:10px; background:rgba(15,23,42,0.35); border-radius:6px; border:1px dashed rgba(255,255,255,0.08);">${emptyText}</div>`;
      }
      const counts = {};
      for (const pid of idList) counts[pid] = (counts[pid] || 0) + 1;
      const tPct = getCycleSurchargePct(targetCycle);
      let html = `<div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:6px;">`;
      for (const p of PIECE_LIB) {
        const cnt = counts[p.id];
        if (!cnt) continue;
        const unitCost = getPieceCost(p, false, targetCycle);
        const priceColor = tPct > 0 ? '#fbbf24' : 'var(--c-emerald)';
        const pctBadge = tPct > 0 ? `<span style="font-size:8.5px; color:#fde68a; margin-left:3px;">(+${tPct}%)</span>` : '';
        html += `
          <div style="display:flex; align-items:center; justify-content:space-between; padding:6px 8px; background:rgba(15,23,42,0.55); border:1px solid rgba(255,255,255,0.1); border-radius:6px; gap:6px;">
            <div style="display:flex; align-items:center; gap:6px; min-width:0;">
              <div style="min-width:26px; display:flex; justify-content:center;">${renderMiniPieceShape(p, 8)}</div>
              <div style="min-width:0;">
                <div style="font-size:11px; font-weight:bold; color:var(--c-text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.name}</div>
                <div style="font-size:9.5px; color:${priceColor}; font-weight:bold;">${unitCost.toFixed(1)}万${pctBadge}</div>
              </div>
            </div>
            <span style="font-size:11px; font-weight:900; padding:2px 6px; border-radius:99px; background:rgba(56,189,248,0.18); color:#38bdf8; border:1px solid rgba(56,189,248,0.35); flex-shrink:0;">×${cnt}</span>
          </div>
        `;
      }
      html += `</div>`;
      return html;
    };

    body.innerHTML = `
      <div style="margin-bottom:12px;">
        <div style="font-size:12px; font-weight:bold; color:#38bdf8; margin-bottom:6px; display:flex; align-items:center; justify-content:space-between;">
          <span><i class="ph-bold ph-stack"></i> 山札の残りピース（${curCycle}周目${curPct > 0 ? `：+${curPct}%割増` : '：標準価格'}）</span>
          <span class="font-num">${drawPile.length}枚</span>
        </div>
        ${renderGroupedList(drawPile, `山札は空です（次のドローで捨て札がシャッフルされ${nextCycle}周目[+${nextPct}%]に入ります）`, curCycle)}
      </div>
      <div style="margin-bottom:10px;">
        <div style="font-size:12px; font-weight:bold; color:var(--c-text2); margin-bottom:6px; display:flex; align-items:center; justify-content:space-between;">
          <span><i class="ph-bold ph-trash"></i> 捨て札・配置済み（次周${nextCycle}周目引直し時：+${nextPct}%）</span>
          <span class="font-num">${discardPile.length}枚</span>
        </div>
        ${renderGroupedList(discardPile, 'まだ捨て札・配置済みピースはありません', nextCycle)}
      </div>
      <div style="font-size:10px; color:var(--c-text3); line-height:1.45; background:rgba(15,23,42,0.4); padding:8px 10px; border-radius:6px; border:1px solid rgba(255,255,255,0.06);">
        💡 <strong>山札周回ルール:</strong> 山札が0枚になると捨て札がシャッフルされ、<strong>2周目は+25%、3周目以降は+50%の追加発注手数料</strong>がピース配置時に上乗せされます（※物件の原価評価額や基礎家賃は変わりません）。
      </div>
    `;
    modal.style.display = 'flex';
  }

  function closeDeckPeekModal() {
    initAudio();
    const modal = document.getElementById('deck-peek-modal');
    if (modal) modal.style.display = 'none';
  }

  document.getElementById('btn-deck-peek')?.addEventListener('click', openDeckPeekModal);
  document.getElementById('btn-hand-refresh')?.addEventListener('click', refreshHand);
  document.getElementById('btn-close-deck-peek')?.addEventListener('click', closeDeckPeekModal);
  document.getElementById('deck-peek-modal')?.addEventListener('pointerdown', (e) => {
    if (e.target.id === 'deck-peek-modal') closeDeckPeekModal();
  });

  // 更新ハイライト中に画面のどこかをタップしたらキャンセル
  document.addEventListener('pointerdown', (e) => {
    if (isRerollConfirming) {
      const btn = document.getElementById('btn-reroll');
      if (btn && !btn.contains(e.target)) {
        cancelRerollConfirm();
      }
    }
  });

  function openMissionModal() {
    initAudio();
    cancelRerollConfirm();
    
    // 現在のコンボ状況 & 要望達成状況を計算して表示
    const visited = runBFS();
    const counts  = countCells(visited);
    const combos  = detectCombos(counts, visited);
    
    updateModalMissionList(counts, visited);

    const cl = document.getElementById('modal-combo-list');
    if (cl) {
      if (combos.length === 0) {
        cl.innerHTML = '<span style="color:var(--c-text2);">発生中のコンボはありません</span>';
      } else {
        cl.innerHTML = combos.map(c => `<div style="margin-bottom:4px;"><i class="ph-bold ${c.icon}" style="margin-right:4px;"></i>${c.text}</div>`).join('');
      }
    }
    
    document.getElementById('mission-modal').style.display = 'flex';
  }

  document.getElementById('btn-show-mission')?.addEventListener('click', openMissionModal);

  // ミッションバナー（要件バー）のタップで詳細表示（横スクロール操作と誤爆しないよう移動量を判定）
  (() => {
    const banner = document.getElementById('mission-banner');
    if (!banner) return;
    let downX = 0, downY = 0, isDown = false;
    banner.addEventListener('pointerdown', (e) => {
      isDown = true;
      downX = e.clientX;
      downY = e.clientY;
    });
    banner.addEventListener('pointerup', (e) => {
      if (!isDown) return;
      isDown = false;
      const dist = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (dist < 8) {
        openMissionModal();
      }
    });
    banner.addEventListener('pointercancel', () => { isDown = false; });
    banner.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMissionModal();
      }
    });
  })();

  function closeMissionModal() {
    initAudio();
    document.getElementById('mission-modal').style.display = 'none';
  }
  document.getElementById('btn-close-mission')?.addEventListener('click', closeMissionModal);
  document.getElementById('btn-close-mission-bottom')?.addEventListener('click', closeMissionModal);
  document.getElementById('mission-modal')?.addEventListener('pointerdown', (e) => {
    if (e.target.id === 'mission-modal') closeMissionModal();
  });

  document.getElementById('btn-borrow-emerg-10')?.addEventListener('click', () => borrowEmergencyLoan(10));
  document.getElementById('btn-borrow-emerg-20')?.addEventListener('click', () => borrowEmergencyLoan(20));
  document.getElementById('btn-close-emerg-loan')?.addEventListener('click', closeEmergencyLoanModal);
  document.getElementById('emergency-loan-modal')?.addEventListener('pointerdown', (e) => {
    if (e.target.id === 'emergency-loan-modal') closeEmergencyLoanModal();
  });

  document.getElementById('btn-finish').addEventListener('click', () => {
    initAudio();
    if (confirm("設計を完了して査定に進みますか？\n（現在の状態から家賃が確定されます）")) {
      evaluate();
    }
  });



  document.getElementById('btn-restart').addEventListener('click', () => {
    initAudio();
    if (GameState.attempts > 0) {
      if (!confirm(`現在の間取りを破棄し、もう一度設計し直しますか？\n（残り再設計回数: ${GameState.attempts}回 → ${GameState.attempts - 1}回）`)) return;
      if (GameState.lastFunds !== undefined) GameState.funds = GameState.lastFunds;
      GameState.attempts -= 1;
      GameState.lastFunds = GameState.funds;
      clearActiveBuild();
      saveGame();
      startGame();
      showScreen('game');
    }
  });


  // 所有物件リストのクリック委譲（スマホ対応）
  document.getElementById('property-list')?.addEventListener('click', (e) => {
    const item = e.target.closest('.prop-list-item');
    if (item) {
      initAudio();
      const id = parseInt(item.dataset.id);
      const p = GameState.properties.find(x => x.id === id);
      if (p) showPropertyDetail(p);
    }
  });

  // 売却ボタンのリスナーは showPropertyDetail 内で毎回付け直すので委譲しなくても良い
  function renderMissionSelectUI() {
    const container = document.getElementById('mission-pool-cards');
    if (!container) return;
    const sub = document.getElementById('mission-select-subtitle');
    if (sub) sub.textContent = `第${GameState.month}ヶ月 ｜ 受注する案件を1つ選んでください（全3件）`;

    const pool = GameState.availableMissions || [];
    if (pool.length === 0) {
      container.innerHTML = '<div style="color:#94a3b8; text-align:center; padding:30px;">現在提示可能な案件がありません</div>';
      return;
    }

    let html = '';
    pool.forEach((m, idx) => {
      const facingMap = { bottom: '南向き', top: '北向き', left: '西向き', right: '東向き' };
      const facingText = facingMap[m.entranceFacing] || '南向き';
      const entSizeText = (m.entranceCells && m.entranceCells.length > 1) ? '（2マス玄関）' : '';

      let badgeBg = 'background:rgba(59,130,246,0.2); color:#60a5fa; border:1px solid #3b82f6;';
      if (m.client.typeBadge.includes('DINKS')) badgeBg = 'background:rgba(16,185,129,0.2); color:#34d399; border:1px solid #10b981;';
      if (m.client.typeBadge.includes('ファミリー')) badgeBg = 'background:rgba(245,158,11,0.2); color:#fbbf24; border:1px solid #f59e0b;';
      if (m.client.typeBadge.includes('豪邸')) badgeBg = 'background:rgba(168,85,247,0.2); color:#c084fc; border:1px solid #a855f7;';

      const reqPills = (m.requests || []).map(r => `
        <span style="font-size:10px; background:rgba(59,130,246,0.15); border:1px solid rgba(59,130,246,0.3); color:#93c5fd; padding:2px 6px; border-radius:4px; display:inline-flex; align-items:center; gap:3px;">
          <i class="ph-bold ${r.icon}"></i>${r.text}
        </span>
      `).join('');

      const optPills = (m.optionalRequests || []).map(o => `
        <span style="font-size:10px; background:rgba(245,158,11,0.15); border:1px solid rgba(245,158,11,0.3); color:#fcd34d; padding:2px 6px; border-radius:4px; display:inline-flex; align-items:center; gap:3px;">
          <i class="ph-bold ${o.icon}"></i>${getOptionalReqText(o)}
        </span>
      `).join('');

      html += `
        <div class="mission-card" style="margin:0; border:1px solid #334155; background:var(--c-surface); border-radius:8px; padding:12px; box-shadow:0 2px 8px rgba(0,0,0,0.25);">
          <!-- Header -->
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:26px; line-height:1;">${m.client.avatar}</span>
              <div>
                <div style="font-size:14px; font-weight:bold; color:var(--c-text);">${m.client.name} 様</div>
                <span style="display:inline-block; font-size:10px; font-weight:bold; padding:1px 6px; border-radius:4px; margin-top:2px; ${badgeBg}">
                  ${m.client.typeBadge}
                </span>
              </div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:10px; color:var(--c-text2);">目標家賃</div>
              <div class="font-num" style="font-size:16px; font-weight:900; color:var(--c-amber-lt);">${m.targetRent.toFixed(1)}<span style="font-size:10px; color:var(--c-text2); font-weight:normal;">万/月</span></div>
            </div>
          </div>

          <!-- Quote -->
          <div style="font-size:11px; color:var(--c-text2); margin-bottom:10px; background:rgba(15,23,42,0.45); padding:6px 8px; border-radius:4px; line-height:1.4;">
            ${m.client.quote}
          </div>

          <!-- Lot Specs Banner -->
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; font-size:11px; margin-bottom:10px; background:rgba(30,41,59,0.5); padding:8px 12px; border-radius:6px; border:1px solid rgba(255,255,255,0.05);">
            <div><span style="color:var(--c-text2);">敷地タイプ:</span> <strong style="color:var(--c-text);">${m.lotName}</strong></div>
            <div><span style="color:var(--c-text2);">玄関:</span> <strong style="color:#fde047;">${facingText}玄関${entSizeText}</strong></div>
          </div>

          <!-- Requirements -->
          <div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:12px;">
            ${reqPills}
            ${optPills}
          </div>

          <!-- Action Button -->
          <button class="btn btn-amber btn-select-mission" data-idx="${idx}" style="width:100%; padding:10px; font-size:13px; font-weight:bold; gap:6px; justify-content:center;">
            <i class="ph-bold ph-pencil-simple-line"></i> この案件を受注する
          </button>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  function openMissionSelect() {
    initAudio();
    if (!GameState.availableMissions || GameState.availableMissions.length === 0) {
      GameState.availableMissions = generateMissionPool(GameState.level);
      saveGame();
    }
    GameState.availableMissions.forEach(m => attachRequestFunctions(m));
    renderMissionSelectUI();
    showScreen('missionSelect');
  }

  function selectMission(idx) {
    initAudio();
    if (!ensureCanStartBuild()) return;
    if (!GameState.availableMissions || !GameState.availableMissions[idx]) return;
    GameState.currentMission = GameState.availableMissions[idx];
    STAGE = GameState.currentMission;
    attachRequestFunctions(STAGE);
    GameState.attempts = getMaxAttempts();
    saveGame();
    setupMissionScreen();
    showScreen('mission');
  }

  document.getElementById('mission-pool-cards')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-select-mission');
    if (btn) {
      const idx = parseInt(btn.dataset.idx, 10);
      selectMission(idx);
    }
  });

  document.getElementById('btn-back-to-home')?.addEventListener('click', () => {
    initAudio();
    updateHomeUI();
    showScreen('home');
  });

  document.getElementById('btn-back-to-select')?.addEventListener('click', () => {
    initAudio();
    renderMissionSelectUI();
    showScreen('missionSelect');
  });

  document.getElementById('btn-go-mission')?.addEventListener('click', () => {
    initAudio();
    if (!ensureCanStartBuild()) return;
    if (GameState.activeBuild && GameState.activeBuild.stage) {
      if (restoreActiveBuild()) return;
    }
    if (GameState.currentMission) {
      STAGE = GameState.currentMission;
      attachRequestFunctions(STAGE);
      setupMissionScreen();
      showScreen('mission');
    } else {
      openMissionSelect();
    }
  });

  let monthEndCallback = null;

  function showMonthEndModal({
    type = 'deliver',
    month = 1,
    startMonth = null,
    endMonth = null,
    monthsElapsed = 1,
    customSubtitle = null,
    income = 0,
    maintCost = 0,
    salaries = 0,
    loanPayment = 0,
    remainingDebt = 0,
    overdraftAmount = 0,
    isBankrupt = false,
    bankruptReason = '',
    netIncome = 0,
    reward = 0,
    evicted = [],
    reEntered = [],
    onConfirm = null
  }) {
    const modal = document.getElementById('month-end-modal');
    if (!modal) return;
    
    monthEndCallback = () => {
      if (typeof onConfirm === 'function') onConfirm();
      if (isBankrupt) {
        showGameOverModal(bankruptReason);
      }
    };
    
    const titleEl = document.getElementById('mem-title');
    const badgeEl = document.getElementById('mem-badge');
    const subtitleEl = document.getElementById('mem-subtitle');
    const incomeEl = document.getElementById('mem-income');
    const propCountEl = document.getElementById('mem-prop-count');
    const troubleBox = document.getElementById('mem-trouble-box');
    const troubleText = document.getElementById('mem-trouble-text');
    const rewardBox = document.getElementById('mem-reward-breakdown');
    const rewardEl = document.getElementById('mem-reward');
    const salaryBox = document.getElementById('mem-salary-breakdown');
    const rawIncomeEl = document.getElementById('mem-raw-income');
    const salariesEl = document.getElementById('mem-salaries');
    const loanBox = document.getElementById('mem-loan-breakdown');
    const loanPayEl = document.getElementById('mem-loan-pay');
    const debtRemEl = document.getElementById('mem-debt-rem');
    const overdraftBox = document.getElementById('mem-overdraft-box');
    const overdraftText = document.getElementById('mem-overdraft-text');
    const btnConfirm = document.getElementById('btn-mem-confirm');

    if (titleEl) {
      if (monthsElapsed > 1 && startMonth && endMonth) {
        titleEl.textContent = `${formatYearMonth(startMonth)}〜${formatYearMonth(endMonth)}（計${monthsElapsed}ヶ月分）決算報告`;
      } else {
        titleEl.textContent = `${formatYearMonth(month)} 決算報告`;
      }
    }
    
    if (type === 'deliver') {
      badgeEl.textContent = '物件引き渡し';
      badgeEl.className = 'badge badge-emerald';
      subtitleEl.textContent = '物件を引き渡しました。';
    } else if (type === 'skip') {
      if (monthsElapsed > 1) {
        badgeEl.textContent = '一括月送り';
        badgeEl.className = 'badge badge-slate';
        subtitleEl.textContent = customSubtitle || `${monthsElapsed}ヶ月経過`;
      } else {
        badgeEl.textContent = '月送り';
        badgeEl.className = 'badge badge-slate';
        subtitleEl.textContent = customSubtitle || '1ヶ月経過';
      }
    } else if (type === 'giveup') {
      badgeEl.textContent = '案件破棄';
      badgeEl.className = 'badge badge-rose';
      subtitleEl.textContent = '依頼を破棄しました。';
    }

    if (reward > 0) {
      if (rewardBox) rewardBox.style.display = 'flex';
      if (rewardEl) rewardEl.textContent = `+${reward.toFixed(1)}万`;
    } else {
      if (rewardBox) rewardBox.style.display = 'none';
    }

    const grandTotal = netIncome + reward;
    if (salaries > 0 || maintCost > 0 || income > 0 || loanPayment > 0) {
      if (salaryBox) {
        salaryBox.style.display = 'flex';
        salaryBox.style.flexWrap = 'wrap';
        salaryBox.style.gap = '4px 10px';
        const expParts = [];
        if (maintCost > 0) expParts.push(`維持費: <strong style="color:var(--c-rose);">-${maintCost.toFixed(1)}万</strong>`);
        if (salaries > 0) expParts.push(`人件・求人: <strong id="mem-salaries" style="color:var(--c-rose);">-${salaries.toFixed(1)}万</strong>`);
        else expParts.push(`経費: <strong id="mem-salaries" style="color:var(--c-rose);">-0.0万</strong>`);
        salaryBox.innerHTML = `
          <span>家賃: <strong id="mem-raw-income" style="color:var(--c-emerald);">+${income.toFixed(1)}万</strong></span>
          <span>${expParts.join(' / ')}</span>
        `;
      }
    } else {
      if (salaryBox) salaryBox.style.display = 'none';
    }

    if (loanBox) {
      if (loanPayment > 0 || remainingDebt > 0) {
        loanBox.style.display = 'flex';
        if (loanPayEl) loanPayEl.textContent = `-${loanPayment.toFixed(1)}万`;
        if (debtRemEl) debtRemEl.textContent = `${remainingDebt.toFixed(1)}万`;
      } else {
        loanBox.style.display = 'none';
      }
    }

    if (incomeEl) {
      incomeEl.textContent = `${grandTotal >= 0 ? '+' : ''}${grandTotal.toFixed(1)}`;
      incomeEl.style.color = grandTotal >= 0 ? 'var(--c-emerald)' : 'var(--c-rose)';
    }

    if (propCountEl) {
      const activeCount = (GameState.properties || []).filter(p => !p.isSold && (p.vacantMonths || 0) <= 0 && (p.vacancyTurns || 0) <= 0).length;
      propCountEl.textContent = `稼働: ${activeCount}棟`;
    }

    if (overdraftBox && overdraftText) {
      if (isBankrupt) {
        overdraftBox.style.display = 'block';
        overdraftBox.style.background = 'rgba(244,63,94,0.18)';
        overdraftBox.style.borderColor = '#f43f5e';
        overdraftText.innerHTML = `<strong style="color:#fda4af;">🚨 経営破綻（不渡り）発生</strong><br>${bankruptReason}`;
      } else if (overdraftAmount > 0) {
        overdraftBox.style.display = 'block';
        overdraftBox.style.background = 'rgba(245,158,11,0.15)';
        overdraftBox.style.borderColor = 'rgba(245,158,11,0.4)';
        overdraftText.textContent = `運転資金が不足したため、銀行の融資枠から ${overdraftAmount.toFixed(1)}万円 の自動つなぎ融資が実行されました（現在残債: ${remainingDebt.toFixed(1)}万円）。`;
      } else {
        overdraftBox.style.display = 'none';
      }
    }

    if (btnConfirm) {
      if (isBankrupt) {
        btnConfirm.innerHTML = `<i class="ph-bold ph-warning-octagon" style="margin-right:6px;"></i>倒産報告を確認する`;
        btnConfirm.style.background = '#e11d48';
      } else if (monthsElapsed > 1) {
        btnConfirm.innerHTML = `<i class="ph-bold ph-check" style="margin-right:6px;"></i>確認して戻る`;
        btnConfirm.style.background = '';
      } else {
        btnConfirm.innerHTML = `<i class="ph-bold ph-arrow-right" style="margin-right:6px;"></i>次月へ進む`;
        btnConfirm.style.background = '';
      }
    }

    if (troubleBox && troubleText) {
      const troubleTitle = document.getElementById('mem-trouble-title');
      const hasEvicted = evicted && evicted.length > 0;
      const hasReEntered = reEntered && reEntered.length > 0;

      if (hasEvicted || hasReEntered) {
        troubleBox.style.display = 'block';

        let messages = [];
        if (hasReEntered) {
          const reTxt = reEntered.map(r => `物件No.${r.num}（家賃${r.rent.toFixed(1)}万）`).join('、');
          messages.push(`🎉 <strong style="color:var(--c-emerald);">新入居決定！</strong> ${reTxt} に新しい入居者が決まりました！`);
        }
        if (hasEvicted) {
          messages.push(`⚠️ <strong style="color:var(--c-rose);">退去発生</strong> 物件No.${evicted.join(', ')} の入居者が退去しました。再入居が決まるまで家賃収入が停止します。`);
        }
        troubleText.innerHTML = messages.join('<br>');

        if (hasEvicted && hasReEntered) {
          // 両方発生
          troubleBox.style.background = 'rgba(120, 53, 15, 0.45)';
          troubleBox.style.borderColor = '#f59e0b';
          if (troubleTitle) {
            troubleTitle.style.color = '#fcd34d';
            troubleTitle.innerHTML = `<i class="ph-bold ph-arrows-left-right"></i> 入居・退去の変動報告`;
          }
          troubleText.style.color = '#fef3c7';
          playSound('combo');
        } else if (hasReEntered) {
          // 新入居決定（嬉しいニュース！）
          troubleBox.style.background = 'rgba(6, 78, 59, 0.6)';
          troubleBox.style.borderColor = '#10b981';
          if (troubleTitle) {
            troubleTitle.style.color = '#6ee7b7';
            troubleTitle.innerHTML = `<i class="ph-bold ph-sparkle"></i> 嬉しいお知らせ（新入居決定！）`;
          }
          troubleText.style.color = '#d1fae5';
          playSound('combo');
        } else {
          // 退去発生（トラブル・警告）
          troubleBox.style.background = '#450a0a';
          troubleBox.style.borderColor = '#f87171';
          if (troubleTitle) {
            troubleTitle.style.color = '#fca5a5';
            troubleTitle.innerHTML = `<i class="ph-bold ph-warning"></i> 空室トラブル発生！`;
          }
          troubleText.style.color = '#fecaca';
          playSound('error');
        }
      } else {
        troubleBox.style.display = 'none';
        if (isBankrupt || overdraftAmount > 0) playSound('error');
        else playSound('clear');
      }
    }

    // 年末（第12, 24, 36...ヶ月目の終了時）に雇用スタッフがおり破産していない場合、契約更改（昇給交渉）を実施
    const finishedMonth = endMonth || month || (GameState.month - 1);
    const isYearEnd = !isBankrupt && (finishedMonth > 0) && (finishedMonth % 12 === 0);
    const hasHiredStaff = (GameState?.company?.hiredStaff?.length || 0) > 0;
    window.pendingSalaryNegMonth = (isYearEnd && hasHiredStaff) ? finishedMonth : null;

    modal.style.display = 'flex';
  }

  let salaryNegSession = null;

  function openSalaryNegotiationModal(finishedMonth, onDone) {
    const modal = document.getElementById('salary-negotiation-modal');
    const listEl = document.getElementById('sal-neg-list');
    const subEl = document.getElementById('sal-neg-subtitle');
    const doneBtn = document.getElementById('btn-sal-neg-done');
    const staffList = GameState?.company?.hiredStaff || [];
    if (!modal || !listEl || staffList.length === 0) {
      if (typeof onDone === 'function') onDone();
      return;
    }

    const yearNum = Math.max(1, Math.round(finishedMonth / 12));
    if (subEl) {
      subEl.textContent = `第${yearNum}年目 終了 — 在籍スタッフ${staffList.length}名が来期の契約更改を希望しています。`;
    }

    salaryNegSession = {
      onDone: onDone,
      items: staffList.map(s => {
        const curSal = Number(s.salary) || 1.0;
        const inc = Math.max(0.3, Math.round((curSal * 0.15) * 10) / 10);
        const reqSal = Math.round((curSal + inc) * 10) / 10;
        const quitProb = (s.rejectedCount || 0) >= 1 ? 80 : 40;
        return {
          staffId: s.id,
          name: s.name,
          avatar: s.avatar || '🧑‍💼',
          role: s.role || '',
          curSalary: curSal,
          reqSalary: reqSal,
          incAmount: inc,
          quitProb: quitProb,
          decided: false,
          resultHtml: ''
        };
      })
    };

    renderSalaryNegotiationList();
    modal.style.display = 'flex';
  }

  function renderSalaryNegotiationList() {
    const listEl = document.getElementById('sal-neg-list');
    const doneBtn = document.getElementById('btn-sal-neg-done');
    if (!listEl || !salaryNegSession) return;

    let html = '';
    let allDecided = true;

    for (const item of salaryNegSession.items) {
      if (!item.decided) allDecided = false;
      const staffObj = (GameState?.company?.hiredStaff || []).find(s => s.id === item.staffId);
      const skillsSummary = (staffObj && Array.isArray(staffObj.skills))
        ? staffObj.skills.map(sk => {
            const def = STAFF_SKILL_DEFS[sk.id];
            return `<span style="display:inline-block; font-size:9.5px; background:rgba(255,255,255,0.08); color:#fde68a; padding:1px 5px; border-radius:4px; margin-right:4px;">${def ? def.name : sk.id} Lv${sk.level}</span>`;
          }).join('')
        : '';

      html += `
        <div style="padding:10px; background:rgba(15,23,42,0.65); border:1px solid rgba(255,255,255,0.12); border-radius:8px; margin-bottom:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:22px;">${item.avatar}</span>
              <div>
                <div style="font-size:13px; font-weight:bold; color:var(--c-text);">${item.name}</div>
                <div style="font-size:10px; color:var(--c-text2);">${item.role}</div>
              </div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:10px; color:var(--c-text2);">希望月額給与</div>
              <div style="font-size:12.5px; font-weight:bold; color:var(--c-amber-lt);">
                ${item.curSalary.toFixed(1)}万 ➔ <span style="color:#fde047;">${item.reqSalary.toFixed(1)}万</span> <span style="font-size:10px; color:#fca5a5;">(+${item.incAmount.toFixed(1)})</span>
              </div>
            </div>
          </div>
          ${skillsSummary ? `<div style="margin-top:5px;">${skillsSummary}</div>` : ''}
          ${item.decided ? `
            <div style="margin-top:8px; padding:6px 8px; border-radius:6px; background:rgba(15,23,42,0.85); border:1px solid rgba(255,255,255,0.1); font-size:11px; line-height:1.4;">
              ${item.resultHtml}
            </div>
          ` : `
            <div style="display:flex; gap:8px; margin-top:8px;">
              <button class="btn btn-primary" onclick="handleSalaryDecision('${item.staffId}', true)" style="flex:1; padding:7px 8px; font-size:11.5px; font-weight:bold; justify-content:center; gap:4px;">
                <i class="ph-bold ph-sparkle"></i> 昇給承認 (+${item.incAmount.toFixed(1)}万)
              </button>
              <button class="btn btn-slate" onclick="handleSalaryDecision('${item.staffId}', false)" style="flex:1; padding:7px 8px; font-size:11px; justify-content:center; border:1px solid rgba(244,63,94,0.35); color:#fda4af;">
                据え置き (退職率${item.quitProb}%)
              </button>
            </div>
          `}
        </div>
      `;
    }

    listEl.innerHTML = html;
    if (doneBtn) {
      doneBtn.disabled = !allDecided;
      doneBtn.style.opacity = allDecided ? '1' : '0.45';
      doneBtn.style.cursor = allDecided ? 'pointer' : 'not-allowed';
    }
  }

  function handleSalaryDecision(staffId, approved) {
    initAudio();
    if (!salaryNegSession) return;
    const item = salaryNegSession.items.find(x => x.staffId === staffId);
    if (!item || item.decided) return;

    const staffList = GameState?.company?.hiredStaff || [];
    const staff = staffList.find(s => s.id === staffId);
    if (!staff) {
      item.decided = true;
      item.resultHtml = `<span style="color:var(--c-text2);">契約終了</span>`;
      renderSalaryNegotiationList();
      return;
    }

    item.decided = true;

    if (approved) {
      staff.salary = item.reqSalary;
      staff.rejectedCount = 0;
      let msg = `<div style="color:var(--c-emerald); font-weight:bold;">✅ 昇給を承認しました！（新給与: ${staff.salary.toFixed(1)}万/月）</div>`;

      // スキル成長イベント抽選（既存スキル強化: 10% / 新スキル獲得: 5%）
      if (!Array.isArray(staff.skills)) staff.skills = [];
      const upgradableSkills = staff.skills.filter(sk => (sk.level || 1) < 3);
      const ownedIds = new Set(staff.skills.map(sk => sk.id));
      const unownedIds = Object.keys(STAFF_SKILL_DEFS).filter(k => !ownedIds.has(k));

      const roll = Math.random();
      let bonusTriggered = false;

      if (roll < 0.05 && staff.skills.length < 3 && unownedIds.length > 0) {
        // 5%: 新スキル獲得！
        const newSkillId = unownedIds[Math.floor(Math.random() * unownedIds.length)];
        staff.skills.push({ id: newSkillId, level: 1 });
        const def = STAFF_SKILL_DEFS[newSkillId];
        msg += `<div style="margin-top:4px; padding:4px 6px; background:rgba(245,158,11,0.22); border:1px solid #f59e0b; border-radius:4px; color:#fef08a; font-weight:bold;">🌟 【新能力開眼！】「${def ? def.name : newSkillId} Lv1」を新たに習得しました！</div>`;
        bonusTriggered = true;
      } else if (roll < 0.15 && upgradableSkills.length > 0) {
        // 10%: 既存スキル成長！
        const targetSk = upgradableSkills[Math.floor(Math.random() * upgradableSkills.length)];
        const oldLv = targetSk.level || 1;
        targetSk.level = oldLv + 1;
        const def = STAFF_SKILL_DEFS[targetSk.id];
        msg += `<div style="margin-top:4px; padding:4px 6px; background:rgba(16,185,129,0.22); border:1px solid #10b981; border-radius:4px; color:#a7f3d0; font-weight:bold;">🎉 【スキル成長！】「${def ? def.name : targetSk.id}」が Lv${oldLv} ➔ Lv${targetSk.level} にパワーアップ！</div>`;
        bonusTriggered = true;
      }

      playSound(bonusTriggered ? 'combo' : 'clear');
      item.resultHtml = msg;
    } else {
      // 据え置き（拒否）: 40%（連続拒否で80%）の確率で退職
      const quitRoll = Math.random() * 100;
      if (quitRoll < item.quitProb) {
        GameState.company.hiredStaff = GameState.company.hiredStaff.filter(s => s.id !== staffId);
        playSound('error');
        item.resultHtml = `<div style="color:var(--c-rose); font-weight:bold;">💔 「他社から良い条件を頂いたので…」<br>${item.name}は退職しました。</div>`;
      } else {
        staff.rejectedCount = (staff.rejectedCount || 0) + 1;
        playSound('tap');
        item.resultHtml = `<div style="color:#fcd34d; font-weight:bold;">😅 不満そうですが、現在の給与（${staff.salary.toFixed(1)}万/月）で残留してくれました。（次回拒否時の退職率80%）</div>`;
      }
    }

    saveGame();
    updateHomeUI();
    renderSalaryNegotiationList();
  }

  window.handleSalaryDecision = handleSalaryDecision;

  document.getElementById('btn-sal-neg-done')?.addEventListener('click', () => {
    initAudio();
    const modal = document.getElementById('salary-negotiation-modal');
    if (modal) modal.style.display = 'none';
    const cb = salaryNegSession ? salaryNegSession.onDone : null;
    salaryNegSession = null;
    saveGame();
    updateHomeUI();
    if (typeof cb === 'function') cb();
  });

  document.getElementById('btn-mem-confirm')?.addEventListener('click', () => {
    initAudio();
    const modal = document.getElementById('month-end-modal');
    if (modal) modal.style.display = 'none';
    const pendingMonth = window.pendingSalaryNegMonth;
    window.pendingSalaryNegMonth = null;
    const cb = monthEndCallback;
    monthEndCallback = null;
    if (pendingMonth && (GameState?.company?.hiredStaff?.length || 0) > 0) {
      openSalaryNegotiationModal(pendingMonth, () => {
        if (typeof cb === 'function') cb();
      });
    } else if (typeof cb === 'function') {
      cb();
    }
  });

  function openSkipModal() {
    const modal = document.getElementById('confirm-skip-modal');
    if (!modal) return;

    const currentMonth = GameState.month || 1;
    const monthInYear = ((currentMonth - 1) % 12) + 1;
    const year = Math.floor((currentMonth - 1) / 12) + 1;
    const remainingToDec = 12 - monthInYear;

    const dateEl = document.getElementById('skip-modal-current-date');
    if (dateEl) {
      dateEl.textContent = `現在：${year}年目 ${monthInYear}月`;
    }

    const net = getEstimatedMonthlyNetIncome();
    const netEl = document.getElementById('skip-modal-net-income');
    if (netEl) {
      const sign = net >= 0 ? '+' : '';
      netEl.textContent = `${sign}${net.toFixed(1)}万/月`;
      netEl.style.color = net >= 0 ? 'var(--c-emerald)' : 'var(--c-rose)';
    }

    const container = document.getElementById('skip-options-container');
    if (container) {
      container.innerHTML = '';

      const options = [];

      if (monthInYear === 12) {
        options.push({
          months: 1,
          title: '年越し（翌年1月へ進める）',
          sub: `1年の締めくくりを終え、新年の第${year + 1}年目を迎えます。`,
          badge: '年越し',
          btnClass: 'btn-primary',
          btnStyle: 'background:linear-gradient(135deg, #f59e0b, #d97706); color:#0f172a;'
        });
      } else if (monthInYear === 11) {
        options.push({
          months: 1,
          title: '今年の年末（12月）へ進める',
          sub: '年の締めくくりとなる12月へ進みます。',
          badge: '1ヶ月',
          btnClass: 'btn-primary',
          btnStyle: 'background:var(--c-amber); color:#0f172a;'
        });
      } else {
        // 1〜10月
        // 1. 1ヶ月進める
        options.push({
          months: 1,
          title: '1ヶ月進める',
          sub: `次月（${year}年目 ${monthInYear + 1}月）へ進みます。`,
          badge: '1ヶ月',
          btnClass: 'btn-slate',
          btnStyle: 'background:#334155; color:#f8fafc;'
        });

        // 2. 3ヶ月進める (3ヶ月進めて12月未満の場合のみ)
        if (monthInYear + 3 < 12) {
          options.push({
            months: 3,
            title: '3ヶ月進める',
            sub: `${year}年目 ${monthInYear + 3}月 へ進みます。`,
            badge: '3ヶ月',
            btnClass: 'btn-secondary',
            btnStyle: 'background:#1e293b; color:#e2e8f0; border:1px solid #475569;'
          });
        }

        // 3. 6ヶ月進める (6ヶ月進めて12月未満の場合のみ)
        if (monthInYear + 6 < 12) {
          options.push({
            months: 6,
            title: '6ヶ月進める',
            sub: `${year}年目 ${monthInYear + 6}月 へ進みます。`,
            badge: '6ヶ月',
            btnClass: 'btn-secondary',
            btnStyle: 'background:#1e293b; color:#e2e8f0; border:1px solid #475569;'
          });
        }

        // 4. 今年の年末（12月）まで進める (残り2ヶ月以上の場合)
        if (remainingToDec >= 2) {
          options.push({
            months: remainingToDec,
            title: `今年の年末（12月）まで進める`,
            sub: `年の節目となる12月まで一括で進めます（${remainingToDec}ヶ月分）。`,
            badge: `${remainingToDec}ヶ月`,
            btnClass: 'btn-primary',
            btnStyle: 'background:var(--c-amber); color:#0f172a;'
          });
        }
      }

      options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = `btn ${opt.btnClass}`;
        btn.style.cssText = `width:100%; padding:10px 12px; text-align:left; display:flex; justify-content:space-between; align-items:center; cursor:pointer; ${opt.btnStyle || ''}`;
        btn.innerHTML = `
          <div>
            <div style="font-weight:bold; font-size:13px; display:flex; align-items:center; gap:6px;">
              <i class="ph-bold ph-fast-forward"></i> ${opt.title}
            </div>
            <div style="font-size:10px; opacity:0.85; margin-top:2px;">${opt.sub}</div>
          </div>
          <span style="font-size:11px; font-weight:bold; padding:2px 8px; border-radius:10px; background:rgba(0,0,0,0.25); white-space:nowrap; margin-left:8px;">
            ${opt.badge}
          </span>
        `;
        btn.addEventListener('click', () => {
          initAudio();
          modal.style.display = 'none';
          executeMultiMonthSkip(opt.months);
        });
        container.appendChild(btn);
      });
    }

    modal.style.display = 'flex';
  }

  function executeMultiMonthSkip(targetMonths) {
    if (!targetMonths || targetMonths < 1) targetMonths = 1;

    const startMonth = GameState.month;
    let monthsRun = 0;
    let totalIncome = 0;
    let totalMaintCost = 0;
    let totalSalaries = 0;
    let totalLoanPayment = 0;
    let totalLoanPrincipal = 0;
    let totalLoanInterest = 0;
    let totalNetIncome = 0;
    let totalOverdraft = 0;
    let lastRemainingDebt = (GameState.company && GameState.company.debt) || 0;
    let lastEvicted = [];
    let lastReEntered = [];
    let isBankrupt = false;
    let bankruptReason = '';
    let stopReason = 'completed'; // 'completed' | 'eviction' | 'reentry' | 'overdraft' | 'bankrupt'

    for (let i = 0; i < targetMonths; i++) {
      const res = processMonthEnd();
      monthsRun++;
      totalIncome += res.income;
      totalMaintCost += (res.maintCost || 0);
      totalSalaries += res.salaries;
      totalLoanPayment += res.loanPayment;
      totalLoanPrincipal += res.loanPrincipal;
      totalLoanInterest += res.loanInterest;
      totalNetIncome += res.netIncome;
      lastRemainingDebt = res.remainingDebt;
      if (res.overdraftAmount > 0) totalOverdraft += res.overdraftAmount;

      if (res.isBankrupt) {
        isBankrupt = true;
        bankruptReason = res.bankruptReason;
        stopReason = 'bankrupt';
        break;
      }
      if (res.evicted && res.evicted.length > 0) {
        lastEvicted = res.evicted;
        stopReason = 'eviction';
        break;
      }
      if (res.reEntered && res.reEntered.length > 0) {
        lastReEntered = res.reEntered;
        stopReason = 'reentry';
        break;
      }
      if (res.overdraftAmount > 0) {
        stopReason = 'overdraft';
        break;
      }
    }

    totalIncome = Math.round(totalIncome * 10) / 10;
    totalMaintCost = Math.round(totalMaintCost * 10) / 10;
    totalSalaries = Math.round(totalSalaries * 10) / 10;
    totalLoanPayment = Math.round(totalLoanPayment * 10) / 10;
    totalNetIncome = Math.round(totalNetIncome * 10) / 10;
    totalOverdraft = Math.round(totalOverdraft * 10) / 10;

    const endMonth = GameState.month - 1;

    let customSubtitle = null;
    if (monthsRun > 1) {
      if (stopReason === 'eviction') {
        customSubtitle = `⚠️ 入居者の退去が発生したため、${formatYearMonth(endMonth)}で一時停止しました。`;
      } else if (stopReason === 'reentry') {
        customSubtitle = `🎉 空室に新しい入居者が決まったため、${formatYearMonth(endMonth)}で一時停止しました。`;
      } else if (stopReason === 'overdraft') {
        customSubtitle = `🚨 運転資金不足が発生したため、${formatYearMonth(endMonth)}で一時停止しました。`;
      } else {
        customSubtitle = `予定していた期間（${monthsRun}ヶ月分）時間を進めました。`;
      }
    }

    showMonthEndModal({
      type: 'skip',
      month: endMonth,
      startMonth: startMonth,
      endMonth: endMonth,
      monthsElapsed: monthsRun,
      customSubtitle: customSubtitle,
      income: totalIncome,
      maintCost: totalMaintCost,
      salaries: totalSalaries,
      loanPayment: totalLoanPayment,
      loanPrincipal: totalLoanPrincipal,
      loanInterest: totalLoanInterest,
      remainingDebt: lastRemainingDebt,
      overdraftAmount: totalOverdraft,
      isBankrupt: isBankrupt,
      bankruptReason: bankruptReason,
      netIncome: totalNetIncome,
      reward: 0,
      evicted: lastEvicted,
      reEntered: lastReEntered,
      onConfirm: () => {
        GameState.currentMission = null;
        GameState.availableMissions = generateMissionPool(GameState.level);
        saveGame();
        updateHomeUI();
      }
    });
  }

  function closeSkipModal() {
    initAudio();
    const skipModal = document.getElementById('confirm-skip-modal');
    if (skipModal) skipModal.style.display = 'none';
  }

  document.getElementById('btn-skip-month')?.addEventListener('click', () => {
    initAudio();
    openSkipModal();
  });

  document.getElementById('btn-skip-cancel')?.addEventListener('click', closeSkipModal);
  document.getElementById('btn-skip-close')?.addEventListener('click', closeSkipModal);
  document.getElementById('confirm-skip-modal')?.addEventListener('pointerdown', (e) => {
    if (e.target && e.target.id === 'confirm-skip-modal') closeSkipModal();
  });

  document.getElementById('btn-giveup')?.addEventListener('click', () => {
    initAudio();
    if (GameState.lastFunds !== undefined) GameState.funds = GameState.lastFunds;
    clearActiveBuild();
    const result = processMonthEnd();
    showMonthEndModal({
      type: 'giveup',
      month: GameState.month - 1,
      ...result,
      onConfirm: () => {
        GameState.attempts = getMaxAttempts();
        GameState.currentMission = null;
        clearActiveBuild();
        GameState.availableMissions = generateMissionPool(GameState.level);
        saveGame();
        updateHomeUI();
        showScreen('home');
      }
    });
  });

  document.getElementById('btn-next-stage')?.addEventListener('click', () => {
    initAudio();
    // トランザクション確定: ここで初めて正式に資金を更新！
    GameState.funds = budget;
    clearActiveBuild();
    if (!GameState.properties) GameState.properties = [];
    const p = window.currentPropertyData || {};
    // currentPropertyData がない場合のフォールバック（念のため）
    const rentToSave = p.rent !== undefined ? p.rent : parseFloat(document.getElementById('flyer-rent').textContent);
    // gridの簡易コピーを保存 (type, label, roomId, pieceLibId, encroached)
    const savedGrid = grid.map(row => row.map(cell => {
      if (!cell || cell.type === T.EMPTY || cell.type === T.GARDEN) return null;
      return { type: cell.type, label: cell.label, roomId: cell.roomId, pieceLibId: cell.pieceLibId, encroached: !!cell.encroached };
    }));
    
    const propNo = (GameState.properties.length > 0) ? Math.max(...GameState.properties.map(x => x.propertyNo || 0)) + 1 : 1;
    GameState.properties.push({
      propertyNo: propNo,
      id: Date.now(),
      level: GameState.level,
      rent: rentToSave,
      normalRent: p.normalRent !== undefined ? p.normalRent : rentToSave,
      targetRent: p.targetRent || (STAGE ? STAGE.targetRent : 5.0),
      baseRent: p.baseRent || 0,
      baseCost: p.baseCost !== undefined ? p.baseCost : 0,
      piecePaidCost: p.piecePaidCost !== undefined ? p.piecePaidCost : 0,
      mirrorCost: p.mirrorCost || 0,
      cycleExtraCost: p.cycleExtraCost || 0,
      rerollCost: p.rerollCost || 0,
      wallRemoveCost: p.wallRemoveCost || 0,
      encroachCost: p.encroachCost || 0,
      encroachCount: p.encroachCount || 0,
      floorCells: p.floorCells,
      marginGardenCells: p.marginGardenCells,
      maxGardenCluster: p.maxGardenCluster || 0,
      occupiedArea: p.occupiedArea,
      totalCost: p.totalCost !== undefined ? p.totalCost : 0,
      earnedRent: 0,
      paidMaint: 0,
      isClear: p.isClear || false,
      satisfiedCount: p.satisfiedCount !== undefined ? p.satisfiedCount : 1,
      totalRequests: p.totalRequests || 1,
      optionalSatisfied: p.optionalSatisfied || 0,
      amenityPenalty: p.amenityPenalty || 0,
      badCombos: p.badCombos || 0,
      goodCombos: p.goodCombos || 0,
      combosList: p.combosList || [],
      createdMonth: p.createdMonth || GameState.month,
      moveInMonth: p.moveInMonth || GameState.month,
      vacantMonths: 0,
      vacancyTurns: 0,
      propertyGrid: savedGrid,
      thumbnail: p.thumbnail || null,
      isOriginalTenant: true,
      hasStorage: !!(p.hasStorage || (p.closetCells && p.closetCells > 0) || (p.combosList && p.combosList.some(c => c.name && c.name.includes('収納')))),
      clientName: p.clientName || (STAGE && STAGE.client ? STAGE.client.name : '入居者'),
      customCombo: p.customCombo || null
    });
    
    const result = processMonthEnd();
    showMonthEndModal({
      type: 'deliver',
      month: GameState.month - 1,
      ...result,
      onConfirm: () => {
        GameState.level++;
        if (!GameState.stats) getLifetimeStats();
        GameState.stats.lifetimeClearedMissions = (GameState.stats.lifetimeClearedMissions || 0) + 1;
        GameState.stats.lifetimeGoodCombos = (GameState.stats.lifetimeGoodCombos || 0) + (p.goodCombos || 0);
        GameState.stats.lifetimeBadCombos = (GameState.stats.lifetimeBadCombos || 0) + (p.badCombos || 0);
        GameState.attempts = getMaxAttempts();
        GameState.currentMission = null;
        clearActiveBuild();
        GameState.availableMissions = generateMissionPool(GameState.level);
        saveGame();
        updateHomeUI();
        showScreen('home');
      }
    });
  });



  window.addEventListener('resize', () => {
    if (typeof syncPlicyHeaderActions === 'function') syncPlicyHeaderActions();
    if (screens.game.classList.contains('active')) resizeCanvas();
  });

  /* ============================================================
     INIT
  ============================================================ */
  
  function getDefaultRoomLabel(type) {
    if (type === T.LDK) return 'LDK';
    if (type === T.ROOM) return '洋室';
    if (type === T.BATH) return '浴室';
    if (type === T.TOILET) return 'トイレ';
    if (type === T.WASHROOM) return '洗面所';
    if (type === T.CLOSET) return '収納';
    if (type === T.ENTRANCE) return '玄関';
    return '';
  }

  function getShortRoomLabel(type, label, cellCount) {
    if (type === T.LDK) return cellCount >= 4 ? 'LDK' : 'DK';
    if (type === T.ROOM) {
      if (label && label.includes('和')) return cellCount >= 2 ? '和室' : '和';
      return cellCount >= 2 ? '洋室' : '洋';
    }
    if (type === T.BATH) return cellCount >= 2 ? '浴室' : '浴';
    if (type === T.TOILET) return 'WC';
    if (type === T.WASHROOM) return cellCount >= 2 ? '洗面' : '洗';
    if (type === T.CLOSET) return cellCount >= 2 ? '収納' : '収';
    if (type === T.ENTRANCE) return '玄';
    return label || '';
  }

  function extractRoomsFromProperty(pGrid) {
    const gSize = pGrid.length || 12;
    const visited = Array.from({length: gSize}, () => Array(gSize).fill(false));
    const rooms = [];

    for (let r = 0; r < gSize; r++) {
      for (let c = 0; c < gSize; c++) {
        const cell = pGrid[r][c];
        if (!cell || visited[r][c]) continue;
        if (cell.type === T.EMPTY || cell.type === T.GARDEN || cell.type === T.OBSTACLE || cell.type === T.ENTRANCE) continue;

        const roomType = cell.type;
        const roomLabel = cell.label || getDefaultRoomLabel(roomType);
        const targetRoomId = cell.roomId;
        
        const q = [{r, c}];
        visited[r][c] = true;
        const cells = [];

        while (q.length > 0) {
          const curr = q.shift();
          cells.push(curr);

          const dirs = [{dr:-1,dc:0},{dr:1,dc:0},{dr:0,dc:-1},{dr:0,dc:1}];
          for (const {dr, dc} of dirs) {
            const nr = curr.r + dr, nc = curr.c + dc;
            if (nr >= 0 && nr < gSize && nc >= 0 && nc < gSize && !visited[nr][nc]) {
              const nb = pGrid[nr][nc];
              if (nb && nb.type === roomType) {
                if (targetRoomId !== undefined && nb.roomId !== undefined) {
                  if (nb.roomId === targetRoomId) {
                    visited[nr][nc] = true;
                    q.push({r: nr, c: nc});
                  }
                } else {
                  visited[nr][nc] = true;
                  q.push({r: nr, c: nc});
                }
              }
            }
          }
        }

        rooms.push({
          type: roomType,
          label: roomLabel,
          cells: cells
        });
      }
    }
    return rooms;
  }

  function renderPropertyPlanToCanvas(canvas, p, baseSize, isCompact) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = baseSize * dpr;
    canvas.height = baseSize * dpr;
    canvas.style.width = `${baseSize}px`;
    canvas.style.height = `${baseSize}px`;
    ctx.resetTransform();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, baseSize, baseSize);

    function drawGridLayers() {
      ctx.clearRect(0, 0, baseSize, baseSize);
      if (!p.propertyGrid) {
        ctx.fillStyle = '#64748b';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('図面データなし', baseSize/2, baseSize/2);
        return;
      }
      const gSize = p.propertyGrid.length || 12;
      const cSize = baseSize / gSize;
      const fp = calcFootprintStats(p.propertyGrid, p.encroachCount || 0);
      const bbox = fp ? fp.bbox : null;
      
      // 1. セル背景
      for (let r=0; r<gSize; r++) {
        for (let c=0; c<gSize; c++) {
          const cell = p.propertyGrid[r][c];
          const inBox = bbox && r >= bbox.minR && r <= bbox.maxR && c >= bbox.minC && c <= bbox.maxC;
          if (cell && cell.type !== T.EMPTY && cell.type !== T.GARDEN && cell.type !== T.OBSTACLE) {
            const s = CELL_STYLE[cell.type] || { bg: '#94a3b8', border: '#64748b' };
            ctx.fillStyle = cell.color || s.bg;
            ctx.fillRect(c * cSize, r * cSize, cSize, cSize);
            ctx.strokeStyle = s.border || 'rgba(0,0,0,0.15)';
            ctx.lineWidth = 0.8;
            ctx.strokeRect(c * cSize, r * cSize, cSize, cSize);
          } else if (cell && cell.type === T.OBSTACLE) {
            ctx.fillStyle = '#334155';
            ctx.fillRect(c * cSize, r * cSize, cSize, cSize);
            ctx.strokeStyle = '#475569';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(c * cSize, r * cSize, cSize, cSize);
            ctx.strokeStyle = '#64748b';
            ctx.beginPath();
            ctx.moveTo(c * cSize, r * cSize); ctx.lineTo((c + 1) * cSize, (r + 1) * cSize);
            ctx.moveTo((c + 1) * cSize, r * cSize); ctx.lineTo(c * cSize, (r + 1) * cSize);
            ctx.stroke();
          } else {
            // Garden (inBox) vs Unused lot (outside bbox)
            ctx.fillStyle = inBox ? '#d9f99d' : '#1e293b';
            ctx.fillRect(c * cSize, r * cSize, cSize, cSize);
            ctx.strokeStyle = inBox ? '#a3e635' : '#334155';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(c * cSize, r * cSize, cSize, cSize);
          }
        }
      }
      drawOccupiedBoxOverlay(ctx, p.propertyGrid, cSize, false, isCompact);

      // 2. 部屋ラベル（重心に白フチ付きテキストを描画）
      const rooms = extractRoomsFromProperty(p.propertyGrid);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const room of rooms) {
        let sumR = 0, sumC = 0;
        for (const pt of room.cells) {
          sumR += pt.r;
          sumC += pt.c;
        }
        const ax = (sumC / room.cells.length + 0.5) * cSize;
        const ay = (sumR / room.cells.length + 0.5) * cSize;
        
        let labelText = '';
        if (isCompact) {
          labelText = getShortRoomLabel(room.type, room.label, room.cells.length);
        } else {
          labelText = room.label || getDefaultRoomLabel(room.type);
        }

        const fontSize = isCompact 
          ? (room.cells.length >= 4 ? 9.5 : (room.cells.length >= 2 ? 8.5 : 7.5))
          : (room.cells.length >= 4 ? 13 : (room.cells.length >= 2 ? 11.5 : 10));

        ctx.font = `bold ${fontSize}px "Zen Kaku Gothic New", sans-serif`;

        // 白フチで視認性確保
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = isCompact ? 2.2 : 3.5;
        ctx.lineJoin = 'round';
        ctx.strokeText(labelText, ax, ay);

        // 文字本体
        ctx.fillStyle = '#0f172a';
        ctx.fillText(labelText, ax, ay);
      }

      // 3. 玄関マーカー
      for (let r=0; r<gSize; r++) {
        for (let c=0; c<gSize; c++) {
          const cell = p.propertyGrid[r][c];
          if (cell && cell.type === T.ENTRANCE) {
            const facing = getEntranceFacing(null, p.propertyGrid);
            const label = isCompact ? `${facing.arrow}玄` : `${facing.arrow}玄関`;
            const markerSize = isCompact ? Math.max(6.5, cSize * 0.28) : Math.max(9, cSize * 0.22);
            ctx.font = `bold ${markerSize}px "Zen Kaku Gothic New", sans-serif`;

            let cx = (c + 0.5) * cSize;
            let cy = (r + 0.5) * cSize;
            if (facing.dir === 'bottom') {
              cx = (c + 0.5) * cSize;
              cy = (r + 1) * cSize - 1.5;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'bottom';
            } else if (facing.dir === 'top') {
              cx = (c + 0.5) * cSize;
              cy = r * cSize + 1.5;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'top';
            } else if (facing.dir === 'left') {
              cx = c * cSize + 1.5;
              cy = (r + 0.5) * cSize;
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
            } else if (facing.dir === 'right') {
              cx = (c + 1) * cSize - 1.5;
              cy = (r + 0.5) * cSize;
              ctx.textAlign = 'right';
              ctx.textBaseline = 'middle';
            }

            // 白フチで視認性確保
            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.lineWidth = isCompact ? 2 : 3;
            ctx.lineJoin = 'round';
            ctx.strokeText(label, cx, cy);

            ctx.fillStyle = '#92400e';
            ctx.fillText(label, cx, cy);
          }
        }
      }

      // 4. 外周枠線
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = isCompact ? 2 : 3;
      ctx.strokeRect(1, 1, baseSize - 2, baseSize - 2);
    }

    if (p.thumbnail) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, baseSize, baseSize);
        ctx.drawImage(img, 0, 0, baseSize, baseSize);
      };
      img.onerror = () => {
        drawGridLayers();
      };
      img.src = p.thumbnail;
      drawGridLayers();
    } else {
      drawGridLayers();
    }
  }

  function openPlanViewer(p) {
    if (!p) return;
    initAudio();
    window.currentViewerProp = p;
    const pvModal = document.getElementById('plan-viewer-modal');
    const pvCanvas = document.getElementById('pv-canvas');
    const pvTitle = document.getElementById('pv-title');
    const pvSubinfo = document.getElementById('pv-subinfo');

    const pNum = p.propertyNo || (p.level !== undefined ? p.level + 1 : 1);
    pvTitle.innerHTML = `<i class="ph-fill ph-blueprint"></i> 物件 No.${pNum} 間取り図面`;
    
    const stats = calcPropertyStats(p);
    pvSubinfo.textContent = `築${stats.age}ヶ月 ｜ 家賃 ${stats.currentRent.toFixed(1)}万/月 ｜ Rank ${getPropertyRank(stats.degRate)}`;

    renderPropertyPlanToCanvas(pvCanvas, p, 280, false);
    pvModal.style.display = 'flex';
  }

  function closePlanViewer() {
    initAudio();
    const pvModal = document.getElementById('plan-viewer-modal');
    if (pvModal) pvModal.style.display = 'none';
  }

  let currentSaveImageDataUrl = null;
  let currentSaveImageFilename = 'madori.png';
  let currentSaveImageBlob = null;

  function dataUrlToBlob(dataUrl) {
    const parts = dataUrl.split(',');
    const mime = parts[0].match(/:(.*?);/)[1] || 'image/png';
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  }

  function closeImageSaveModal() {
    initAudio();
    playSound('tap');
    const modal = document.getElementById('image-save-modal');
    if (modal) modal.style.display = 'none';
  }

  function downloadCanvasAsPng(canvasEl, filename = 'madori.png', btnEl = null) {
    if (!canvasEl) return;
    initAudio();
    playSound('tap');
    try {
      const dataUrl = canvasEl.toDataURL('image/png');
      currentSaveImageDataUrl = dataUrl;
      currentSaveImageFilename = filename;
      currentSaveImageBlob = dataUrlToBlob(dataUrl);

      const previewImg = document.getElementById('image-save-preview');
      if (previewImg) {
        previewImg.src = dataUrl;
      }

      const shareBtn = document.getElementById('btn-image-native-share');
      if (shareBtn) {
        let canShareFile = false;
        try {
          if (navigator.share && navigator.canShare && typeof File !== 'undefined') {
            const testFile = new File([currentSaveImageBlob], filename, { type: 'image/png' });
            canShareFile = navigator.canShare({ files: [testFile] });
          }
        } catch (_) {
          canShareFile = false;
        }
        shareBtn.style.display = canShareFile ? 'inline-flex' : 'none';
      }

      const modal = document.getElementById('image-save-modal');
      if (modal) {
        modal.style.display = 'flex';
      }
    } catch (e) {
      console.error('Failed to save PNG:', e);
    }
  }

  document.getElementById('btn-close-image-save')?.addEventListener('click', closeImageSaveModal);
  document.getElementById('btn-close-image-save-bottom')?.addEventListener('click', closeImageSaveModal);
  document.getElementById('image-save-modal')?.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'image-save-modal') closeImageSaveModal();
  });

  document.getElementById('btn-image-native-share')?.addEventListener('click', async () => {
    initAudio();
    playSound('tap');
    if (!currentSaveImageBlob) return;
    try {
      const file = new File([currentSaveImageBlob], currentSaveImageFilename, { type: 'image/png' });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({
          files: [file],
          title: '間取り図',
          text: `${GameState.companyName || '焼飯不動産'}の間取り図`
        });
      }
    } catch (err) {
      // ユーザーが共有シートをキャンセルした場合は何もしない
      console.log('Share canceled or failed:', err);
    }
  });

  document.getElementById('btn-image-direct-dl')?.addEventListener('click', () => {
    initAudio();
    playSound('tap');
    if (!currentSaveImageBlob && !currentSaveImageDataUrl) return;
    try {
      const url = currentSaveImageBlob
        ? URL.createObjectURL(currentSaveImageBlob)
        : currentSaveImageDataUrl;
      const link = document.createElement('a');
      link.download = currentSaveImageFilename;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      if (currentSaveImageBlob) {
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
      const dlBtn = document.getElementById('btn-image-direct-dl');
      if (dlBtn) {
        const orig = dlBtn.innerHTML;
        dlBtn.innerHTML = `<i class="ph-bold ph-check"></i> ダウンロードを開始しました`;
        setTimeout(() => { dlBtn.innerHTML = orig; }, 2000);
      }
    } catch (e) {
      console.error('Direct download failed:', e);
    }
  });

  function getPropertyBreakdownHtml(p, stats, key) {
    if (!p || !stats) return '';
    const estBaseCost = Math.round(((p.baseRent || 0) * 20) * 10) / 10;
    const isLegacyCost = (p.totalCost === undefined);
    const totalCost = !isLegacyCost ? p.totalCost : estBaseCost;
    const baseCost = (p.baseCost !== undefined) ? p.baseCost : estBaseCost;
    const mirrorCost = p.mirrorCost || 0;
    const cycleExtraCost = p.cycleExtraCost || 0;
    const rerollCost = p.rerollCost || 0;
    const wallRemoveCost = p.wallRemoveCost || 0;
    const encroachCost = p.encroachCost || 0;
    const piecePaidCost = (p.piecePaidCost !== undefined) ? p.piecePaidCost : baseCost;
    const discountSaved = (p.discountSaved !== undefined)
      ? p.discountSaved
      : Math.max(0, Math.round((baseCost - (piecePaidCost - mirrorCost - cycleExtraCost)) * 10) / 10);

    if (key === 'cost') {
      const rows = [];
      rows.push(`<div style="display:flex; justify-content:space-between;"><span>ピース定価合計 (${stats.floorCells}ﾏｽ):</span><strong>${baseCost.toFixed(1)}万</strong></div>`);
      if (discountSaved > 0) rows.push(`<div style="display:flex; justify-content:space-between; color:#059669;"><span>スタッフ割引:</span><strong>-${discountSaved.toFixed(1)}万</strong></div>`);
      if (cycleExtraCost > 0) rows.push(`<div style="display:flex; justify-content:space-between;"><span>山札2周目以降の割増:</span><strong>+${cycleExtraCost.toFixed(1)}万</strong></div>`);
      if (mirrorCost > 0) rows.push(`<div style="display:flex; justify-content:space-between;"><span>反転加工費:</span><strong>+${mirrorCost.toFixed(1)}万</strong></div>`);
      if (rerollCost > 0) rows.push(`<div style="display:flex; justify-content:space-between;"><span>手札更新・KEEP維持費:</span><strong>+${rerollCost.toFixed(1)}万</strong></div>`);
      if (wallRemoveCost > 0) rows.push(`<div style="display:flex; justify-content:space-between;"><span>赤壁(耐力壁)撤去費:</span><strong>+${wallRemoveCost.toFixed(1)}万</strong></div>`);
      if (encroachCost > 0) rows.push(`<div style="display:flex; justify-content:space-between; color:#d97706;"><span>障害物(✕)造成費 (${stats.encroachedCells}ﾏｽ):</span><strong>+${encroachCost.toFixed(1)}万</strong></div>`);
      if (rows.length === 1) rows.push(`<div style="display:flex; justify-content:space-between; opacity:0.75;"><span>追加経費・造成費:</span><span>0.0万</span></div>`);
      return `<div style="font-weight:bold; margin-bottom:3px; border-bottom:1px dashed rgba(148,163,184,0.35); padding-bottom:2px;">💰 建築費の内訳（計 ${totalCost.toFixed(1)}万）</div>` + rows.join('');
    }

    if (key === 'val') {
      const rows = [];
      const isBaseDiscounted = (stats.satBaseFactor || 1) < 0.999;
      const baseDiscountPct = Math.round((1 - (stats.satBaseFactor || 1)) * 100);
      const effectiveBaseVal = Math.round(stats.baseCostVal * (stats.satBaseFactor || 1) * 10) / 10;

      if (isBaseDiscounted) {
        rows.push(`<div style="display:flex; justify-content:space-between; color:#e11d48;"><span>建物原価 (定価${stats.baseCostVal.toFixed(1)}万・満足度不足で -${baseDiscountPct}%):</span><strong>${effectiveBaseVal.toFixed(1)}万</strong></div>`);
      } else {
        rows.push(`<div style="display:flex; justify-content:space-between;"><span>建物原価 (ピース定価):</span><strong>${stats.baseCostVal.toFixed(1)}万</strong></div>`);
      }

      const diff = (stats.comboRentDiff !== undefined) ? stats.comboRentDiff : (Math.round(((stats.comboPremiumVal || 0) / 6) * 10) / 10);
      const cPrem = stats.comboPremiumVal || 0;
      if (diff > 0.01) {
        if (stats.satisfaction >= 100) {
          rows.push(`<div style="display:flex; justify-content:space-between; color:#16a34a;"><span>コンボ設計価値 (家賃増 ${diff.toFixed(1)}万/月 × 6ヶ月):</span><strong>+${cPrem.toFixed(1)}万</strong></div>`);
        } else if (stats.satisfaction >= 80) {
          rows.push(`<div style="display:flex; justify-content:space-between; color:#16a34a;"><span>コンボ設計価値 (家賃増 ${diff.toFixed(1)}万/月 × 6ヶ月 × 反映${stats.satPremiumRate}%):</span><strong>+${cPrem.toFixed(1)}万</strong></div>`);
        } else {
          rows.push(`<div style="display:flex; justify-content:space-between; opacity:0.75;"><span>コンボ設計価値 (満足度80%未満のため査定除外):</span><span>0.0万</span></div>`);
        }
      } else if (diff < -0.01) {
        rows.push(`<div style="display:flex; justify-content:space-between; color:#e11d48;"><span>間取り欠陥ペナルティ (家賃減 ${Math.abs(diff).toFixed(1)}万/月 × 6ヶ月):</span><strong>-${Math.abs(cPrem).toFixed(1)}万</strong></div>`);
      } else {
        rows.push(`<div style="display:flex; justify-content:space-between; opacity:0.75;"><span>コンボ付加価値:</span><span>なし (0.0万)</span></div>`);
      }

      if (stats.buildingAge > 0) {
        const agePenaltyPct = Math.round((1 - (stats.ageValFactor || 1)) * 100);
        const agePenaltyVal = Math.round((stats.initialValuation - parseFloat(stats.standardResaleValue)) * 10) / 10;
        rows.push(`<div style="display:flex; justify-content:space-between; color:#64748b;"><span>経年減価 (築${stats.buildingAge}ヶ月で -${agePenaltyPct}%):</span><strong style="color:#e11d48;">-${agePenaltyVal.toFixed(1)}万</strong></div>`);
      }

      if (stats.isVacant) {
        const vacantPenaltyVal = Math.round((parseFloat(stats.standardResaleValue) - parseFloat(stats.resaleValue)) * 10) / 10;
        rows.push(`<div style="display:flex; justify-content:space-between; color:#e11d48;"><span>空室売却ペナルティ (-20%):</span><strong>-${vacantPenaltyVal.toFixed(1)}万</strong></div>`);
      }

      if (p.earnedRent !== undefined) {
        const earned = Math.round((p.earnedRent || 0) * 10) / 10;
        const paidMaint = Math.round((p.paidMaint || 0) * 10) / 10;
        const net = Math.round((earned - paidMaint + parseFloat(stats.resaleValue) - totalCost) * 10) / 10;
        const maintStr = paidMaint > 0 ? ` − 維持費 ${paidMaint.toFixed(1)}万` : '';
        rows.push(`<div style="display:flex; justify-content:space-between; border-top:1px dashed rgba(148,163,184,0.35); margin-top:3px; padding-top:2px;"><span>売却時通算 (家賃 ${earned.toFixed(1)}万${maintStr} ＋ 査定 ${stats.resaleValue}万 − 建築費 ${totalCost.toFixed(1)}万):</span><strong style="color:${net >= 0 ? '#16a34a' : '#e11d48'};">${net >= 0 ? '+' : ''}${net.toFixed(1)}万</strong></div>`);
      }

      return `<div style="font-weight:bold; margin-bottom:3px; border-bottom:1px dashed rgba(148,163,184,0.35); padding-bottom:2px;">🏷️ 査定額の内訳（${stats.resaleValue}万）</div>` + rows.join('');
    }

    if (key === 'maint') {
      const boxInfo = stats.bbox ? `（占有${stats.occupiedArea}マス・${stats.bbox.w}×${stats.bbox.h}枠）` : `（占有${stats.occupiedArea}マス）`;
      const rows = [];
      rows.push(`<div style="display:flex; justify-content:space-between;"><span>延床面積 (${stats.floorCells}マス × 0.04万):</span><strong>-${stats.floorMaint.toFixed(2)}万</strong></div>`);
      if (stats.marginGardenCells > 0) {
        rows.push(`<div style="display:flex; justify-content:space-between;"><span>占有内の余白庭 (${stats.marginGardenCells}マス × 0.06万):</span><strong>-${stats.gardenMaint.toFixed(2)}万</strong></div>`);
      }
      if (stats.encroachedCells > 0) {
        rows.push(`<div style="display:flex; justify-content:space-between; color:#d97706;"><span>造成区画ペナルティ (${stats.encroachedCells}マス × 0.20万):</span><strong>-${stats.encroachMaint.toFixed(2)}万</strong></div>`);
      }
      if (stats.buildingAge > 0) {
        const ageExtra = Math.round((stats.maintCost - stats.baseMaintCost) * 10) / 10;
        const agePct = Math.round((stats.ageMaintMult - 1) * 100);
        if (ageExtra > 0) {
          rows.push(`<div style="display:flex; justify-content:space-between; color:#e11d48;"><span>経年劣化割増 (築${stats.buildingAge}ヶ月で +${agePct}%):</span><strong>-${ageExtra.toFixed(1)}万</strong></div>`);
        } else {
          rows.push(`<div style="display:flex; justify-content:space-between; opacity:0.75;"><span>経年劣化割増 (築${stats.buildingAge}ヶ月で +${agePct}%):</span><span>0.0万</span></div>`);
        }
      }
      return `<div style="font-weight:bold; margin-bottom:3px; border-bottom:1px dashed rgba(148,163,184,0.35); padding-bottom:2px;">🧹 維持費の内訳（計 -${stats.maintCost.toFixed(1)}万/月 ${boxInfo}）</div>` + rows.join('');
    }

    if (key === 'roi') {
      const rentVal = stats.isVacant ? 0 : stats.currentRent;
      const netMonthly = Math.round((rentVal - stats.maintCost) * 10) / 10;
      const monthsStr = netMonthly > 0 ? `約${(totalCost / netMonthly).toFixed(1)}ヶ月` : '回収不可（赤字）';
      return `
        <div style="font-weight:bold; margin-bottom:3px; border-bottom:1px dashed rgba(148,163,184,0.35); padding-bottom:2px;">⏱️ 回収目安の算出根拠</div>
        <div style="display:flex; justify-content:space-between;"><span>実質月収 (家賃 ${rentVal.toFixed(1)}万 − 維持費 ${stats.maintCost.toFixed(1)}万):</span><strong>${netMonthly >= 0 ? '+' : ''}${netMonthly.toFixed(1)}万/月</strong></div>
        <div style="display:flex; justify-content:space-between;"><span>建築費 ${totalCost.toFixed(1)}万 ÷ 実質月収:</span><strong>${monthsStr}</strong></div>
      `;
    }
    return '';
  }

  function toggleFlyerBreakdown(key) {
    initAudio();
    playSound('tap');
    const drawer = document.getElementById('flyer-breakdown-drawer');
    if (!drawer || !window.currentPropertyData) return;

    if (window.activeFlyerBreakdownKey === key && drawer.style.display !== 'none') {
      window.activeFlyerBreakdownKey = null;
      drawer.style.display = 'none';
    } else {
      window.activeFlyerBreakdownKey = key;
      const stats = calcPropertyStats(window.currentPropertyData);
      drawer.innerHTML = getPropertyBreakdownHtml(window.currentPropertyData, stats, key);
      drawer.style.display = 'block';
    }

    const activeKey = window.activeFlyerBreakdownKey;
    const costRow = document.getElementById('flyer-cost-row');
    if (costRow) costRow.style.background = (activeKey === 'cost') ? '#e2e8f0' : 'transparent';
    ['val', 'maint', 'roi'].forEach(k => {
      const el = document.getElementById(`flyer-pill-${k}`);
      if (el) el.style.background = (activeKey === k) ? '#bae6fd' : 'transparent';
    });
  }
  window.toggleFlyerBreakdown = toggleFlyerBreakdown;

  function togglePdBreakdown(key) {
    initAudio();
    playSound('tap');
    const p = window.currentDetailProp;
    if (!p) return;
    if (key === 'sat') {
      const satEl = document.getElementById('pd-sat-breakdown');
      if (satEl) satEl.style.display = (satEl.style.display === 'none') ? 'block' : 'none';
      return;
    }
    if (key === 'maint') {
      const maintEl = document.getElementById('pd-maint-breakdown');
      if (!maintEl) return;
      if (maintEl.style.display !== 'none') {
        maintEl.style.display = 'none';
      } else {
        const stats = calcPropertyStats(p);
        maintEl.innerHTML = getPropertyBreakdownHtml(p, stats, 'maint');
        maintEl.style.display = 'block';
      }
      return;
    }
    const drawer = document.getElementById('pd-breakdown-drawer');
    if (!drawer) return;
    if (window.activePdBreakdownKey === key && drawer.style.display !== 'none') {
      window.activePdBreakdownKey = null;
      drawer.style.display = 'none';
    } else {
      window.activePdBreakdownKey = key;
      const stats = calcPropertyStats(p);
      drawer.innerHTML = getPropertyBreakdownHtml(p, stats, key);
      drawer.style.display = 'block';
    }
  }
  window.togglePdBreakdown = togglePdBreakdown;

  function showPropertyDetail(p) {
    window.currentDetailProp = p;
    window.activePdBreakdownKey = null;
    const pdDrawer = document.getElementById('pd-breakdown-drawer');
    if (pdDrawer) pdDrawer.style.display = 'none';
    const pdSatBreak = document.getElementById('pd-sat-breakdown');
    if (pdSatBreak) pdSatBreak.style.display = 'none';
    const pdMaintBreak = document.getElementById('pd-maint-breakdown');
    if (pdMaintBreak) pdMaintBreak.style.display = 'none';

    const stats = calcPropertyStats(p);
    const rank = getPropertyRank(stats.degRate);
    const rankStyle = getRankBadgeStyle(rank);
    const propNo = p.propertyNo || (p.level !== undefined ? p.level + 1 : 1);

    // 1. ヘッダー + 状態バッジ
    document.getElementById('pd-name').textContent = `物件 No.${propNo}`;
    const rankBadgeEl = document.getElementById('pd-rank-badge');
    if (rankBadgeEl) {
      rankBadgeEl.textContent = `Rank ${rank}`;
      rankBadgeEl.setAttribute('style', `font-size:10px; font-weight:bold; padding:1px 6px; border-radius:4px; ${rankStyle}`);
    }
    document.getElementById('pd-age').textContent = stats.isVacant
      ? `築${stats.buildingAge}ヶ月 (空室中)`
      : `築${stats.buildingAge}ヶ月 (現入居${stats.tenantTenure}ヶ月目)`;

    let tenantBadge = '';
    if (stats.isVacant) {
      tenantBadge = `<span style="display:inline-block; padding:2px 7px; background:rgba(244,63,94,0.2); color:#fda4af; border:1px solid rgba(244,63,94,0.35); border-radius:4px; font-weight:bold;">⚠️ 空室 ${stats.vacantMonths || 1}ヶ月目</span>`;
    } else if (stats.isOriginal) {
      tenantBadge = `<span style="display:inline-block; padding:2px 7px; background:rgba(245,158,11,0.18); color:#fcd34d; border:1px solid rgba(245,158,11,0.35); border-radius:4px;">👤 初代 (${p.clientName || '特注主'})</span>`;
    } else {
      tenantBadge = `<span style="display:inline-block; padding:2px 7px; background:rgba(56,189,248,0.18); color:#93c5fd; border:1px solid rgba(56,189,248,0.35); border-radius:4px;">🌐 2代目以降 (一般入居)</span>`;
    }
    const tenantBadgeEl = document.getElementById('pd-tenant-badge');
    if (tenantBadgeEl) tenantBadgeEl.innerHTML = tenantBadge;
    
    // 図面の描画 (104px サムネイル・略称ラベル付き)
    const canvas = document.getElementById('pd-canvas');
    renderPropertyPlanToCanvas(canvas, p, 104, true);

    // 月次キャッシュフロー
    const rentEl = document.getElementById('pd-rent');
    const maintEl = document.getElementById('pd-maint');
    const netMonthlyEl = document.getElementById('pd-monthly-net');
    const nextRentRow = document.getElementById('pd-next-rent-row');

    if (rentEl) {
      rentEl.textContent = stats.isVacant ? '0.0万' : `+${stats.currentRent.toFixed(1)}万`;
      rentEl.style.color = stats.isVacant ? '#94a3b8' : 'var(--c-emerald)';
    }
    if (maintEl) {
      maintEl.textContent = `-${stats.maintCost.toFixed(1)}万`;
    }
    if (netMonthlyEl) {
      const mNet = stats.netMonthlyProfit;
      netMonthlyEl.textContent = `${mNet >= 0 ? '+' : ''}${mNet.toFixed(1)}万`;
      netMonthlyEl.style.color = mNet >= 0 ? 'var(--c-emerald)' : 'var(--c-rose)';
    }
    if (nextRentRow) {
      if (stats.isVacant) {
        const discountPct = Math.min(40, Math.round((stats.buildingAge / 12) * 8));
        nextRentRow.textContent = `次回募集想定: ${stats.nextRecruitRent.toFixed(1)}万/月 (築年相場 -${discountPct}%)`;
        nextRentRow.style.display = 'block';
      } else {
        nextRentRow.style.display = 'none';
      }
    }
    
    // 満足度
    document.getElementById('pd-sat-val').textContent = `${stats.satisfaction}%`;
    const bar = document.getElementById('pd-sat-bar');
    bar.style.width = `${Math.min(100, Math.max(0, stats.satisfaction))}%`;
    if (stats.satisfaction >= 100) bar.style.background = 'var(--c-emerald)';
    else if (stats.satisfaction >= 60) bar.style.background = 'var(--c-amber)';
    else bar.style.background = 'var(--c-rose)';

    const satSubEl = document.getElementById('pd-sat-sub');
    const remBarrier = Math.max(0, (stats.barrierMonths || 0) - stats.tenantTenure);
    if (satSubEl) {
      if (stats.isVacant) {
        satSubEl.textContent = '空室中（募集待ち）';
        satSubEl.style.color = '#fda4af';
      } else if (stats.isOriginal && remBarrier > 0) {
        satSubEl.textContent = `🛡️ 退去保証 残${remBarrier}ヶ月`;
        satSubEl.style.color = '#34d399';
      } else if (!stats.isOriginal && stats.tenantTenure <= 3) {
        satSubEl.textContent = `🛡️ 初期定着 残${Math.max(1, 4 - stats.tenantTenure)}ヶ月`;
        satSubEl.style.color = '#38bdf8';
      } else {
        satSubEl.textContent = stats.isOriginal ? '保証終了・通常判定' : '一般市場基準';
        satSubEl.style.color = '#94a3b8';
      }
    }
    
    const optStr = stats.optBonus > 0 ? ` ＋ 任意 ${stats.optBonus}%` : '';
    const conciergeStr = stats.conciergeBonus > 0 ? ` ＋ 接客 ${stats.conciergeBonus}%` : '';
    const amenityStr = stats.amenityPenalty > 0 ? ` − 設備欠陥 ${stats.amenityPenalty}%` : '';
    const comboOp = (stats.comboBonus >= 0) ? `＋ コンボ ${stats.comboBonus}%` : `− コンボ ${Math.abs(stats.comboBonus)}%`;
    if (stats.isOriginal) {
      document.getElementById('pd-sat-breakdown').textContent = `満足度内訳: 家賃 ${stats.rentBonus}% ＋ 依頼 ${stats.reqBonus}% ${comboOp}${optStr}${conciergeStr}${amenityStr} ＝ ${stats.satisfaction}%`;
    } else {
      document.getElementById('pd-sat-breakdown').textContent = `満足度内訳: 適正家賃 ${stats.rentBonus}% ＋ 標準仕様 ${stats.reqBonus}% ${comboOp}${conciergeStr}${amenityStr} ＝ ${stats.satisfaction}%`;
    }

    // 2. 通算収支・投資回収パネルの更新 (維持費累計 paidMaint を反映)
    const estBaseCost = Math.round(((p.baseRent || 0) * 20) * 10) / 10;
    const isLegacyCost = (p.totalCost === undefined);
    const totalCost = !isLegacyCost ? p.totalCost : estBaseCost;
    const earnedRent = Math.round((p.earnedRent || 0) * 10) / 10;
    const paidMaint = Math.round((p.paidMaint || 0) * 10) / 10;
    const cumCashProfit = Math.round((earnedRent - paidMaint) * 10) / 10;
    const resaleNum = parseFloat(stats.resaleValue) || 0;
    const netIfSold = Math.round((cumCashProfit + resaleNum - totalCost) * 10) / 10;
    const cashRecPct = totalCost > 0 ? Math.floor((cumCashProfit / totalCost) * 100) : 100;

    const elTotalCost = document.getElementById('pd-total-cost');
    if (elTotalCost) elTotalCost.textContent = `-${totalCost.toFixed(1)}万${isLegacyCost ? ' (推定)' : ''}`;

    const elEarned = document.getElementById('pd-earned-rent');
    if (elEarned) elEarned.textContent = `+${earnedRent.toFixed(1)}万`;

    const elPaidMaint = document.getElementById('pd-paid-maint');
    if (elPaidMaint) elPaidMaint.textContent = `-${paidMaint.toFixed(1)}万`;

    const elValTag = document.getElementById('pd-val-tag');
    if (elValTag) {
      if (!stats.canSell) {
        elValTag.textContent = `(🔒残${stats.sellLockRemain}ヶ月)`;
        elValTag.style.color = '#94a3b8';
      } else if (stats.isVacant) {
        elValTag.textContent = `(空室20%引)`;
        elValTag.style.color = '#fda4af';
      } else {
        elValTag.textContent = `(満額)`;
        elValTag.style.color = '#34d399';
      }
    }

    const elCurResale = document.getElementById('pd-cur-resale');
    if (elCurResale) elCurResale.textContent = `${stats.resaleValue}万`;

    const elRoiBadge = document.getElementById('pd-roi-badge');
    if (elRoiBadge) {
      if (cumCashProfit >= totalCost) {
        elRoiBadge.textContent = `🎉 実質回収済 (${cashRecPct}%)`;
        elRoiBadge.style.background = 'rgba(16,185,129,0.2)';
        elRoiBadge.style.color = '#34d399';
      } else {
        elRoiBadge.textContent = `実質回収 ${cashRecPct}%`;
        elRoiBadge.style.background = cumCashProfit < 0 ? 'rgba(244,63,94,0.18)' : 'rgba(56,189,248,0.15)';
        elRoiBadge.style.color = cumCashProfit < 0 ? '#fda4af' : '#38bdf8';
      }
    }

    const elNetProfit = document.getElementById('pd-net-profit');
    if (elNetProfit) {
      elNetProfit.textContent = `${netIfSold >= 0 ? '+' : ''}${netIfSold.toFixed(1)}万`;
      elNetProfit.style.color = netIfSold >= 0 ? 'var(--c-emerald)' : 'var(--c-rose)';
    }
    
    // 3. リスク・劣化速度・担保評価カード
    const riskLabelEl = document.getElementById('pd-risk-label');
    const evictEl = document.getElementById('pd-current-evict');
    const riskSubEl = document.getElementById('pd-risk-sub');
    if (stats.isVacant) {
      if (riskLabelEl) riskLabelEl.textContent = '来月入居率';
      if (evictEl) {
        evictEl.textContent = `${stats.fillChance}%`;
        evictEl.style.color = 'var(--c-emerald)';
      }
      if (riskSubEl) riskSubEl.textContent = `空室${stats.vacantMonths || 1}ヶ月目`;
    } else {
      if (riskLabelEl) riskLabelEl.textContent = '退去率';
      if (evictEl) {
        evictEl.textContent = `${stats.evictRate}%`;
        evictEl.style.color = parseFloat(stats.evictRate) >= 15 ? 'var(--c-rose)' : (parseFloat(stats.evictRate) === 0 ? 'var(--c-emerald)' : 'var(--c-amber)');
      }
      if (riskSubEl) {
        riskSubEl.textContent = (stats.isOriginal && remBarrier > 0) ? `保証残${remBarrier}ヶ月` : `入居${stats.tenantTenure}ヶ月目`;
      }
    }

    const degRateEl = document.getElementById('pd-deg-rate');
    const degSubEl = document.getElementById('pd-deg-sub');
    if (degRateEl) degRateEl.textContent = `+${stats.degRate}%/月`;
    if (degSubEl) degSubEl.textContent = `品質 Rank ${rank}`;

    const colMult = stats.isVacant ? 0.5 : 2.0;
    const colVal = Math.round(resaleNum * colMult * 10) / 10;
    const colEl = document.getElementById('pd-collateral');
    const colSubEl = document.getElementById('pd-collateral-sub');
    if (colEl) colEl.textContent = `+${colVal.toFixed(1)}万`;
    if (colSubEl) colSubEl.textContent = `売価×${colMult.toFixed(1)}倍`;
    
    // 4. コンボ一覧（珍間取り・悪コンボのペナルティ付記）
    const combosEl = document.getElementById('pd-combos');
    if (combosEl) {
      if (p.combosList && p.combosList.length > 0) {
        const comboHtml = p.combosList.map(c => {
          let isNegative = c.bonus < 0;
          let bonusText = (c.bonus > 0 ? '+' : '') + c.bonus + '万';
          if (p.customCombo && p.customCombo.name === c.name) {
            if (stats.isOriginal) {
              bonusText = `+${p.customCombo.customBonus.toFixed(1)}万 (特注)`;
              isNegative = false;
            } else {
              bonusText = `${p.customCombo.normalBonus > 0 ? '+' : ''}${p.customCombo.normalBonus.toFixed(1)}万 (一般化)`;
              if (p.customCombo.isNegativeInversion) isNegative = true;
            }
          }
          const funnyProp = (typeof FUNNY_LAYOUT_PROPS !== 'undefined' && FUNNY_LAYOUT_PROPS[c.name]) ? FUNNY_LAYOUT_PROPS[c.name] : null;
          let effectNote = '';
          if (funnyProp) {
            effectNote = ` <span style="font-size:9.5px; color:#fca5a5;">(劣化+${funnyProp.deg}% / 入居${funnyProp.fill}%)</span>`;
          } else if (isNegative) {
            effectNote = ` <span style="font-size:9.5px; color:#fca5a5;">(満足-20% / 劣化+0.5%)</span>`;
          }
          const badgeColor = isNegative ? 'var(--c-rose)' : (funnyProp ? '#a855f7' : 'var(--c-emerald)');
          const icon = isNegative ? '🚨' : (funnyProp ? '🤪' : '👍');
          return `<div style="margin-bottom:3px; line-height:1.4;"><span style="font-size:9.5px; padding:1px 4px; border-radius:4px; margin-right:4px; color:#fff; background:${badgeColor};">${icon}</span><strong>${c.name}</strong> (${bonusText})${effectNote}</div>`;
        }).join('');
        combosEl.innerHTML = comboHtml;
        combosEl.style.display = 'block';
      } else {
        combosEl.innerHTML = '';
        combosEl.style.display = 'none';
      }
    }
    
    const btnSell = document.getElementById('btn-pd-sell');
    const newBtnSell = btnSell.cloneNode(true);
    const saleTypeLabel = stats.isVacant ? '空室売却 (20%引)' : 'オーナーチェンジ売却 (満額)';
    const saleIcon = stats.isVacant ? 'ph-house-line' : 'ph-handshake';
    if (!stats.canSell) {
      newBtnSell.disabled = true;
      newBtnSell.innerHTML = `<i class="ph-bold ph-lock-key"></i> 売却解禁まであと${stats.sellLockRemain}ヶ月 (査定 <span id="pd-sell-val">${stats.resaleValue}</span>万)`;
      newBtnSell.style.background = '#1e293b';
      newBtnSell.style.color = '#94a3b8';
      newBtnSell.style.borderColor = 'var(--c-border)';
      newBtnSell.style.opacity = '0.7';
      newBtnSell.style.cursor = 'not-allowed';
      btnSell.parentNode.replaceChild(newBtnSell, btnSell);
    } else {
      newBtnSell.disabled = false;
      newBtnSell.style.opacity = '1';
      newBtnSell.style.cursor = 'pointer';
      newBtnSell.innerHTML = `<i class="ph-bold ${saleIcon}"></i> ${saleTypeLabel} (<span id="pd-sell-val">${stats.resaleValue}</span>万)`;
      newBtnSell.style.background = '';
      newBtnSell.style.color = stats.isVacant ? '#fda4af' : 'var(--c-amber-lt)';
      newBtnSell.style.borderColor = 'var(--c-border)';
      btnSell.parentNode.replaceChild(newBtnSell, btnSell);
      let isSellConfirming = false;
      let sellConfirmTimer = null;

      newBtnSell.addEventListener('click', () => {
        initAudio();
        if (!isSellConfirming) {
          isSellConfirming = true;
          playSound('tap');
          const confirmText = stats.isVacant 
            ? `<i class="ph-bold ph-warning"></i> 空室割引で売却する？ (+${stats.resaleValue}万)`
            : `<i class="ph-bold ph-warning"></i> 満額で売却する？ (+${stats.resaleValue}万)`;
          newBtnSell.innerHTML = confirmText;
          newBtnSell.style.background = '#e11d48';
          newBtnSell.style.color = '#ffffff';
          newBtnSell.style.borderColor = '#f43f5e';
          if (sellConfirmTimer) clearTimeout(sellConfirmTimer);
          sellConfirmTimer = setTimeout(() => {
            isSellConfirming = false;
            newBtnSell.innerHTML = `<i class="ph-bold ${saleIcon}"></i> ${saleTypeLabel} (<span id="pd-sell-val">${stats.resaleValue}</span>万)`;
            newBtnSell.style.background = '';
            newBtnSell.style.color = stats.isVacant ? '#fda4af' : 'var(--c-amber-lt)';
            newBtnSell.style.borderColor = 'var(--c-border)';
          }, 3500);
          return;
        }
        if (sellConfirmTimer) clearTimeout(sellConfirmTimer);
        playSound('clear');
        GameState.funds = Math.round((GameState.funds + parseFloat(stats.resaleValue)) * 10) / 10;
        GameState.properties = GameState.properties.filter(x => x.id !== p.id);
        saveGame();
        document.getElementById('prop-detail-modal').style.display = 'none';
        updateHomeUI();
      });
    }
    
    document.getElementById('prop-detail-modal').style.display = 'flex';
  }
  
  // モーダル閉じる
  function closePropDetailModal() {
    initAudio();
    const modal = document.getElementById('prop-detail-modal');
    if (modal) modal.style.display = 'none';
  }
  document.getElementById('btn-close-prop-detail')?.addEventListener('click', closePropDetailModal);
  document.getElementById('prop-detail-modal')?.addEventListener('pointerdown', (e) => {
    if (e.target && e.target.id === 'prop-detail-modal') closePropDetailModal();
  });

  // 間取り図タップで拡大モーダルを開く
  document.getElementById('pd-canvas-wrapper')?.addEventListener('click', () => {
    if (window.currentDetailProp) {
      openPlanViewer(window.currentDetailProp);
    }
  });

  // 間取り拡大モーダル閉じる・画像保存
  document.getElementById('btn-close-plan-viewer')?.addEventListener('click', closePlanViewer);
  document.getElementById('btn-close-plan-viewer-bottom')?.addEventListener('click', closePlanViewer);
  document.getElementById('plan-viewer-modal')?.addEventListener('pointerdown', (e) => {
    if (e.target.id === 'plan-viewer-modal') closePlanViewer();
  });
  document.getElementById('btn-save-pv-png')?.addEventListener('click', function() {
    const p = window.currentViewerProp || window.currentDetailProp;
    const pNum = p ? (p.propertyNo || (p.level !== undefined ? p.level + 1 : 1)) : 1;
    const pvCanvas = document.getElementById('pv-canvas');
    downloadCanvasAsPng(pvCanvas, `madori_No${pNum}.png`, this);
  });
  document.getElementById('btn-save-result-png')?.addEventListener('click', function() {
    const nextNo = (GameState.properties && GameState.properties.length > 0)
      ? Math.max(...GameState.properties.map(x => x.propertyNo || 0)) + 1
      : 1;
    const rc = document.getElementById('result-canvas');
    downloadCanvasAsPng(rc, `madori_No${nextNo}.png`, this);
  });

  /* ============================================================
     COMPANY UPGRADES, BANK LOAN & STAFF MODAL UI
  ============================================================ */
  let dismissConfirmTimer = null;
  window.dismissConfirmingStaffId = null;
  let upgradeFeedbackTimer = null;

  function showUpgradeFeedback(msg, color = 'var(--c-emerald)') {
    const fb = document.getElementById('upg-feedback-banner');
    if (!fb) return;
    fb.textContent = msg;
    fb.style.color = color;
    fb.style.background = color === 'var(--c-rose)' ? 'rgba(244,63,94,0.15)' : 'rgba(16,185,129,0.15)';
    fb.style.border = `1px solid ${color === 'var(--c-rose)' ? 'rgba(244,63,94,0.3)' : 'rgba(16,185,129,0.3)'}`;
    fb.style.display = 'block';
    if (upgradeFeedbackTimer) clearTimeout(upgradeFeedbackTimer);
    upgradeFeedbackTimer = setTimeout(() => {
      fb.style.display = 'none';
    }, 3500);
  }

  function switchUpgradeTab(tab) {
    const tabCo = document.getElementById('tab-upg-company');
    const tabDk = document.getElementById('tab-upg-deck');
    const tabSt = document.getElementById('tab-upg-staff');
    const tabBk = document.getElementById('tab-upg-bank');
    const viewCo = document.getElementById('upg-view-company');
    const viewDk = document.getElementById('upg-view-deck');
    const viewSt = document.getElementById('upg-view-staff');
    const viewBk = document.getElementById('upg-view-bank');
    if (!tabCo || !tabSt || !viewCo || !viewSt) return;

    tabCo.className = tab === 'company' ? 'btn btn-primary' : 'btn btn-slate';
    if (tabDk) tabDk.className = tab === 'deck' ? 'btn btn-primary' : 'btn btn-slate';
    tabSt.className = tab === 'staff'   ? 'btn btn-primary' : 'btn btn-slate';
    if (tabBk) tabBk.className = tab === 'bank' ? 'btn btn-primary' : 'btn btn-slate';

    viewCo.style.display = tab === 'company' ? 'block' : 'none';
    if (viewDk) viewDk.style.display = tab === 'deck' ? 'block' : 'none';
    viewSt.style.display = tab === 'staff'   ? 'block' : 'none';
    if (viewBk) viewBk.style.display = tab === 'bank' ? 'block' : 'none';
  }

  function openCompanyUpgradeModal(initialTab = 'company') {
    initAudio();
    switchUpgradeTab(initialTab);
    renderCompanyUpgradeUI();
    const modal = document.getElementById('company-upgrade-modal');
    if (modal) modal.style.display = 'flex';
  }

  function closeCompanyUpgradeModal() {
    initAudio();
    const modal = document.getElementById('company-upgrade-modal');
    if (modal) modal.style.display = 'none';
    window.dismissConfirmingStaffId = null;
    if (dismissConfirmTimer) clearTimeout(dismissConfirmTimer);
    updateHomeUI();
  }
  window.openCompanyUpgradeModal = openCompanyUpgradeModal;
  window.closeCompanyUpgradeModal = closeCompanyUpgradeModal;

  function renderCompanyUpgradeUI() {
    ensureDeckState();
    const co = GameState.company;
    if (co.debt === undefined) co.debt = 0;
    if (!co.features) co.features = { freeFlip: false, extraRerolls: 0, extraAttempts: 0 };
    if (!co.hiredStaff) co.hiredStaff = [];

    // Header values
    const fundsEl = document.getElementById('upg-current-funds');
    if (fundsEl) fundsEl.textContent = `${GameState.funds.toFixed(1)}万`;
    const debtEl = document.getElementById('upg-current-debt');
    if (debtEl) debtEl.textContent = `${(co.debt || 0).toFixed(1)}万`;

    const maxSlots = getMaxStaffSlots();
    const hiredCount = co.hiredStaff ? co.hiredStaff.length : 0;
    const tabBadge = document.getElementById('upg-staff-count-tab');
    if (tabBadge) tabBadge.textContent = `${hiredCount}/${maxSlots}`;
    const deckTabBadge = document.getElementById('upg-deck-count-tab');
    if (deckTabBadge) deckTabBadge.textContent = `${getActiveDeckPieceIds().length}`;

    const curOfficeLv = co.officeLevel || 0;
    const curOfficeDef = UPGRADE_CONFIG.office[curOfficeLv] || UPGRADE_CONFIG.office[0];

    /* --- 1. 本社オフィス・会社規模カード (タウンホール) --- */
    const cardOffice = document.getElementById('upg-card-office');
    if (cardOffice) {
      const curLv = curOfficeLv;
      const curDef = curOfficeDef;
      const isMax = curLv >= UPGRADE_CONFIG.office.length - 1;
      const nextDef = !isMax ? UPGRADE_CONFIG.office[curLv + 1] : null;
      const stats = getLifetimeStats();

      let nextHtml = '';
      if (isMax) {
        nextHtml = `
          <div style="font-size:11px; color:var(--c-emerald); font-weight:bold; text-align:center; padding:10px; background:rgba(16,185,129,0.1); border-radius:6px; border:1px solid rgba(16,185,129,0.25);">
            ★ 本社自社ビル完成（最高ランク到達済み）
          </div>
        `;
      } else {
        const effCost = getOfficeUpgradeCost(curLv + 1);
        const discountTotal = nextDef.basePrice - effCost;
        const canAfford = GameState.funds >= effCost;

        let missionsHtml = '';
        nextDef.missions.forEach(m => {
          let currentVal = 0;
          if (m.type === 'cleared') currentVal = stats.cleared;
          else if (m.type === 'netCombos') currentVal = stats.netCombos;
          else if (m.type === 'earnedRent') currentVal = stats.earnedRent;

          const isDone = currentVal >= m.target;
          const pct = Math.min(100, Math.max(0, Math.round((Math.max(0, currentVal) / m.target) * 100)));
          const displayVal = (m.type === 'earnedRent') ? currentVal.toFixed(1) : currentVal;

          missionsHtml += `
            <div style="margin-top:6px; padding:6px 8px; border-radius:6px; background:${isDone ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.03)'}; border:1px solid ${isDone ? 'rgba(16,185,129,0.35)' : 'rgba(255,255,255,0.08)'};">
              <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px;">
                <div style="display:flex; align-items:center; gap:5px;">
                  <span style="font-size:12px;">${isDone ? '✅' : '⬜'}</span>
                  <strong style="color:${isDone ? '#86efac' : 'var(--c-text)'};">${m.label}</strong>
                  <span style="color:var(--c-text3); font-size:10px;">(${displayVal} / ${m.target}${m.unit})</span>
                </div>
                <span style="font-size:10px; font-weight:bold; color:${isDone ? '#34d399' : '#f59e0b'};">
                  ${isDone ? `達成済 -${m.discount}万` : `達成で -${m.discount}万`}
                </span>
              </div>
              ${!isDone ? `
                <div style="margin-top:4px; height:4px; border-radius:2px; background:rgba(255,255,255,0.1); overflow:hidden;">
                  <div style="height:100%; width:${pct}%; background:#f59e0b; border-radius:2px;"></div>
                </div>
              ` : ''}
            </div>
          `;
        });

        const nextCapNum = UPGRADE_CONFIG.capacity[nextDef.maxCapacityLevel]?.capacity || 4;
        nextHtml = `
          <div style="background:rgba(15,23,42,0.45); padding:10px; border-radius:6px; border:1px dashed rgba(255,255,255,0.15); margin-bottom:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <span style="font-size:12px; color:#fde047; font-weight:bold;">
                次: Rank ${nextDef.level + 1} ${nextDef.name}
              </span>
              <span style="font-size:11px; color:var(--c-text2);">
                定価: <s>${nextDef.basePrice}万</s>
              </span>
            </div>
            <div style="font-size:10px; color:var(--c-text2); line-height:1.4; margin-bottom:6px;">
              ${nextDef.desc}（デスク${nextDef.maxDesks}席 / 管理${nextCapNum}棟）
            </div>

            <div style="font-size:10.5px; font-weight:bold; color:#cbd5e1; margin-top:6px;">
              🎯 実績値引:
            </div>
            ${missionsHtml}

            <div style="display:flex; justify-content:space-between; align-items:baseline; margin-top:8px; padding-top:6px; border-top:1px dashed rgba(255,255,255,0.12);">
              <span style="font-size:11px; color:var(--c-text2);">移転費用（${discountTotal > 0 ? `値引 -${discountTotal}万` : '定価'}）:</span>
              <span style="font-size:15px; font-weight:900; color:${canAfford ? 'var(--c-emerald)' : 'var(--c-rose)'};">
                ${effCost} <span style="font-size:11px; font-weight:normal;">万円</span>
                ${effCost === nextDef.minPrice ? '<span style="font-size:10px; color:#34d399; font-weight:bold;"> (底値!)</span>' : ''}
              </span>
            </div>
          </div>

          <button class="btn ${canAfford ? 'btn-primary' : 'btn-slate'}" ${canAfford ? '' : 'disabled'} onclick="buyCompanyUpgrade('office')" style="width:100%; padding:10px; font-size:12px; font-weight:bold; cursor:${canAfford ? 'pointer' : 'not-allowed'}; opacity:${canAfford ? '1' : '0.55'}; justify-content:center; gap:6px;">
            <i class="ph-bold ph-buildings"></i> Rank ${nextDef.level + 1} ${nextDef.name} へ移転（${effCost}万）
          </button>
        `;
      }

      const curCapNum = UPGRADE_CONFIG.capacity[curDef.maxCapacityLevel]?.capacity || 4;
      cardOffice.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:20px;">🏢</span>
            <div>
              <div style="font-size:14px; font-weight:bold; color:var(--c-text);">本社オフィス</div>
            </div>
          </div>
          <span style="font-size:10px; font-weight:bold; padding:2px 8px; border-radius:4px; background:rgba(245,158,11,0.18); border:1px solid rgba(245,158,11,0.35); color:#fcd34d;">
            Rank ${curDef.level + 1} ${curDef.name}
          </span>
        </div>
        <div style="font-size:11px; color:#cbd5e1; margin-bottom:8px; line-height:1.4;">
          上限: デスク <strong>${curDef.maxDesks}席</strong> / 管理 <strong>${curCapNum}棟</strong> / 営業・知名度 <strong>Lv.${curDef.maxSalesLevel}</strong>
        </div>
        ${nextHtml}
      `;
    }

    /* --- 2. 執務デスク増設カード (スタッフ枠) --- */
    const cardDesks = document.getElementById('upg-card-desks');
    if (cardDesks) {
      const curDesks = co.deskCount || 0;
      const maxDesksForOffice = curOfficeDef.maxDesks;
      const isMaxOverall = curDesks >= UPGRADE_CONFIG.desks.length;
      const isLockedByOffice = !isMaxOverall && (curDesks >= maxDesksForOffice);
      const nextDeskDef = !isMaxOverall ? UPGRADE_CONFIG.desks[curDesks] : null;
      const canAfford = nextDeskDef && !isLockedByOffice && GameState.funds >= nextDeskDef.cost;

      let actionHtml = '';
      if (isMaxOverall) {
        actionHtml = `<div style="font-size:11px; color:var(--c-emerald); font-weight:bold; text-align:center; padding:8px; background:rgba(16,185,129,0.1); border-radius:6px; border:1px solid rgba(16,185,129,0.25);">★ デスク最大（4席）増設済み</div>`;
      } else if (isLockedByOffice) {
        actionHtml = `
          <div style="font-size:11px; color:#f59e0b; padding:8px; background:rgba(245,158,11,0.1); border-radius:6px; border:1px solid rgba(245,158,11,0.25); margin-bottom:8px; line-height:1.4;">
            <i class="ph-bold ph-lock"></i> オフィス移転で解放（上限 ${maxDesksForOffice}席）
          </div>
          <button class="btn btn-slate" disabled style="width:100%; padding:9px; font-size:12px; font-weight:bold; opacity:0.5; justify-content:center; gap:6px; cursor:not-allowed;">
            <i class="ph-bold ph-lock-key"></i> 事務所移転で解放
          </button>
        `;
      } else {
        actionHtml = `
          <div style="background:rgba(15,23,42,0.45); padding:8px 10px; border-radius:6px; border:1px dashed rgba(255,255,255,0.12); margin-bottom:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:11px; color:#fde047; font-weight:bold;">次: ${nextDeskDef.name} (雇用枠 ${curDesks + 1}席)</span>
              <span style="font-size:11px; color:var(--c-emerald); font-weight:bold;">費用: ${nextDeskDef.cost}万</span>
            </div>
          </div>
          <button class="btn ${canAfford ? 'btn-primary' : 'btn-slate'}" ${canAfford ? '' : 'disabled'} onclick="buyCompanyUpgrade('desk')" style="width:100%; padding:9px; font-size:12px; font-weight:bold; cursor:${canAfford ? 'pointer' : 'not-allowed'}; opacity:${canAfford ? '1' : '0.55'}; justify-content:center; gap:6px;">
            <i class="ph-bold ph-armchair"></i> デスク増設（${nextDeskDef.cost}万）
          </button>
        `;
      }

      cardDesks.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:18px;">🪑</span>
            <div>
              <div style="font-size:14px; font-weight:bold; color:var(--c-text);">執務デスク</div>
            </div>
          </div>
          <span style="font-size:10px; font-weight:bold; padding:2px 8px; border-radius:4px; background:rgba(59,130,246,0.18); border:1px solid rgba(59,130,246,0.35); color:#93c5fd;">
            現在: ${curDesks}席 / 上限 ${maxDesksForOffice}席
          </span>
        </div>
        <div style="font-size:11px; color:#cbd5e1; margin-bottom:8px;">
          着席 <strong>${co.hiredStaff?.length || 0}名</strong> / 空き ${Math.max(0, curDesks - (co.hiredStaff?.length || 0))}席
        </div>
        ${actionHtml}
      `;
    }

    /* --- 3. 管理システム導入カード (管理戸数キャパシティ) --- */
    const cardCapacity = document.getElementById('upg-card-capacity');
    if (cardCapacity) {
      const curCapLv = co.capacityLevel || 0;
      const curCapDef = UPGRADE_CONFIG.capacity[curCapLv] || UPGRADE_CONFIG.capacity[0];
      const maxCapLvForOffice = curOfficeDef.maxCapacityLevel;
      const isMaxOverall = curCapLv >= UPGRADE_CONFIG.capacity.length - 1;
      const isLockedByOffice = !isMaxOverall && (curCapLv >= maxCapLvForOffice);
      const nextCapDef = !isMaxOverall ? UPGRADE_CONFIG.capacity[curCapLv + 1] : null;
      const canAfford = nextCapDef && !isLockedByOffice && GameState.funds >= nextCapDef.cost;

      let actionHtml = '';
      if (isMaxOverall) {
        actionHtml = `<div style="font-size:11px; color:var(--c-emerald); font-weight:bold; text-align:center; padding:8px; background:rgba(16,185,129,0.1); border-radius:6px; border:1px solid rgba(16,185,129,0.25);">★ 最高管理システム（自社管理センター 22棟）導入済み</div>`;
      } else if (isLockedByOffice) {
        actionHtml = `
          <div style="font-size:11px; color:#f59e0b; padding:8px; background:rgba(245,158,11,0.1); border-radius:6px; border:1px solid rgba(245,158,11,0.25); margin-bottom:8px; line-height:1.4;">
            <i class="ph-bold ph-lock"></i> オフィス移転で解放（上限 Lv.${maxCapLvForOffice}）
          </div>
          <button class="btn btn-slate" disabled style="width:100%; padding:9px; font-size:12px; font-weight:bold; opacity:0.5; justify-content:center; gap:6px; cursor:not-allowed;">
            <i class="ph-bold ph-lock-key"></i> 事務所移転で解放
          </button>
        `;
      } else {
        actionHtml = `
          <div style="background:rgba(15,23,42,0.45); padding:8px 10px; border-radius:6px; border:1px dashed rgba(255,255,255,0.12); margin-bottom:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:11px; color:#fde047; font-weight:bold;">次: ${nextCapDef.name} (管理 ${nextCapDef.capacity}棟)</span>
              <span style="font-size:11px; color:var(--c-emerald); font-weight:bold;">費用: ${nextCapDef.cost}万</span>
            </div>
            <div style="font-size:10px; color:var(--c-text2); margin-top:2px;">${nextCapDef.desc}</div>
          </div>
          <button class="btn ${canAfford ? 'btn-primary' : 'btn-slate'}" ${canAfford ? '' : 'disabled'} onclick="buyCompanyUpgrade('capacity')" style="width:100%; padding:9px; font-size:12px; font-weight:bold; cursor:${canAfford ? 'pointer' : 'not-allowed'}; opacity:${canAfford ? '1' : '0.55'}; justify-content:center; gap:6px;">
            <i class="ph-bold ph-hard-drives"></i> ${nextCapDef.name}導入（${nextCapDef.cost}万）
          </button>
        `;
      }

      const maxPropCap = getMaxPropertyCapacity();
      const activeProps = getActivePropertyCount();
      cardCapacity.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:18px;">📂</span>
            <div>
              <div style="font-size:14px; font-weight:bold; color:var(--c-text);">管理枠</div>
            </div>
          </div>
          <span style="font-size:10px; font-weight:bold; padding:2px 8px; border-radius:4px; background:rgba(16,185,129,0.18); border:1px solid rgba(16,185,129,0.35); color:#86efac;">
            ${curCapDef.name}
          </span>
        </div>
        <div style="font-size:11px; color:#cbd5e1; margin-bottom:8px;">
          現在: <strong>${activeProps} / ${maxPropCap}棟</strong> (基本${curCapDef.capacity}棟)
        </div>
        ${actionHtml}
      `;
    }

    /* --- 4. 営業力強化カード --- */
    const cardSales = document.getElementById('upg-card-sales');
    if (cardSales) {
      const curLv = co.salesLevel || 1;
      const curDef = UPGRADE_CONFIG.sales[curLv - 1] || UPGRADE_CONFIG.sales[0];
      const isMax = curLv >= UPGRADE_CONFIG.sales.length;
      const nextDef = !isMax ? UPGRADE_CONFIG.sales[curLv] : null;
      const maxSalesForOffice = curOfficeDef.maxSalesLevel;
      const isLockedByOffice = !isMax && (curLv >= maxSalesForOffice);
      const canAfford = nextDef && !isLockedByOffice && GameState.funds >= nextDef.cost;

      let actionHtml = '';
      if (isMax) {
        actionHtml = `<div style="font-size:11px; color:var(--c-emerald); font-weight:bold; text-align:center; padding:8px; background:rgba(16,185,129,0.1); border-radius:6px; border:1px solid rgba(16,185,129,0.25);">★ 最大レベル（+60%）到達済み</div>`;
      } else if (isLockedByOffice) {
        actionHtml = `
          <div style="font-size:11px; color:#f59e0b; padding:8px; background:rgba(245,158,11,0.1); border-radius:6px; border:1px solid rgba(245,158,11,0.25); margin-bottom:8px; line-height:1.4;">
            <i class="ph-bold ph-lock"></i> オフィス移転で解放（上限 Lv.${maxSalesForOffice}）
          </div>
          <button class="btn btn-slate" disabled style="width:100%; padding:9px; font-size:12px; font-weight:bold; opacity:0.5; justify-content:center; gap:6px; cursor:not-allowed;">
            <i class="ph-bold ph-lock-key"></i> 事務所移転で解放
          </button>
        `;
      } else {
        actionHtml = `
          <div style="background:rgba(15,23,42,0.45); padding:8px 10px; border-radius:6px; border:1px dashed rgba(255,255,255,0.12); margin-bottom:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:11px; color:#fde047; font-weight:bold;">次: Lv.${nextDef.level} ${nextDef.name}</span>
              <span style="font-size:11px; color:var(--c-emerald); font-weight:bold;">費用: ${nextDef.cost}万</span>
            </div>
            <div style="font-size:10px; color:var(--c-text2); margin-top:2px;">${nextDef.desc}</div>
          </div>
          <button class="btn ${canAfford ? 'btn-primary' : 'btn-slate'}" ${canAfford ? '' : 'disabled'} onclick="buyCompanyUpgrade('sales')" style="width:100%; padding:9px; font-size:12px; font-weight:bold; cursor:${canAfford ? 'pointer' : 'not-allowed'}; opacity:${canAfford ? '1' : '0.55'}; justify-content:center; gap:6px;">
            <i class="ph-bold ph-arrow-circle-up"></i> Lv.${nextDef.level} へ強化（${nextDef.cost}万）
          </button>
        `;
      }

      cardSales.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:18px;">💼</span>
            <div>
              <div style="font-size:14px; font-weight:bold; color:var(--c-text);">営業力</div>
            </div>
          </div>
          <span style="font-size:10px; font-weight:bold; padding:2px 8px; border-radius:4px; background:rgba(59,130,246,0.18); border:1px solid rgba(59,130,246,0.35); color:#93c5fd;">
            Lv.${curDef.level} ${curDef.name}
          </span>
        </div>
        <div style="font-size:11px; color:#cbd5e1; margin-bottom:8px;">
          現在: <strong>希望家賃 +${Math.round((curDef.mult - 1) * 100)}%</strong>
        </div>
        ${actionHtml}
      `;
    }

    /* --- 5. ブランド力・知名度カード --- */
    const cardBrand = document.getElementById('upg-card-brand');
    if (cardBrand) {
      const curLv = co.brandLevel || 1;
      const curDef = UPGRADE_CONFIG.brand[curLv - 1] || UPGRADE_CONFIG.brand[0];
      const isMax = curLv >= UPGRADE_CONFIG.brand.length;
      const nextDef = !isMax ? UPGRADE_CONFIG.brand[curLv] : null;
      const maxBrandForOffice = curOfficeDef.maxBrandLevel;
      const isLockedByOffice = !isMax && (curLv >= maxBrandForOffice);
      const canAfford = nextDef && !isLockedByOffice && GameState.funds >= nextDef.cost;

      let actionHtml = '';
      if (isMax) {
        actionHtml = `<div style="font-size:11px; color:var(--c-emerald); font-weight:bold; text-align:center; padding:8px; background:rgba(16,185,129,0.1); border-radius:6px; border:1px solid rgba(16,185,129,0.25);">★ 最高プレステージ到達済み</div>`;
      } else if (isLockedByOffice) {
        actionHtml = `
          <div style="font-size:11px; color:#f59e0b; padding:8px; background:rgba(245,158,11,0.1); border-radius:6px; border:1px solid rgba(245,158,11,0.25); margin-bottom:8px; line-height:1.4;">
            <i class="ph-bold ph-lock"></i> オフィス移転で解放（上限 Lv.${maxBrandForOffice}）
          </div>
          <button class="btn btn-slate" disabled style="width:100%; padding:9px; font-size:12px; font-weight:bold; opacity:0.5; justify-content:center; gap:6px; cursor:not-allowed;">
            <i class="ph-bold ph-lock-key"></i> 事務所移転で解放
          </button>
        `;
      } else {
        actionHtml = `
          <div style="background:rgba(15,23,42,0.45); padding:8px 10px; border-radius:6px; border:1px dashed rgba(255,255,255,0.12); margin-bottom:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:11px; color:#fde047; font-weight:bold;">次: Lv.${nextDef.level} ${nextDef.name}</span>
              <span style="font-size:11px; color:var(--c-emerald); font-weight:bold;">費用: ${nextDef.cost}万</span>
            </div>
            <div style="font-size:10px; color:var(--c-text2); margin-top:2px;">${nextDef.desc}</div>
          </div>
          <button class="btn ${canAfford ? 'btn-primary' : 'btn-slate'}" ${canAfford ? '' : 'disabled'} onclick="buyCompanyUpgrade('brand')" style="width:100%; padding:9px; font-size:12px; font-weight:bold; cursor:${canAfford ? 'pointer' : 'not-allowed'}; opacity:${canAfford ? '1' : '0.55'}; justify-content:center; gap:6px;">
            <i class="ph-bold ph-arrow-circle-up"></i> Lv.${nextDef.level} へ強化（${nextDef.cost}万）
          </button>
        `;
      }

      cardBrand.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:18px;">📢</span>
            <div>
              <div style="font-size:14px; font-weight:bold; color:var(--c-text);">知名度</div>
            </div>
          </div>
          <span style="font-size:10px; font-weight:bold; padding:2px 8px; border-radius:4px; background:rgba(168,85,247,0.18); border:1px solid rgba(168,85,247,0.35); color:#d8b4fe;">
            Lv.${curDef.level} ${curDef.name}
          </span>
        </div>
        <div style="font-size:11px; color:#cbd5e1; margin-bottom:8px;">
          客層: <strong>${curDef.desc}</strong>
        </div>
        ${actionHtml}
      `;
    }

    /* --- 6. 設備投資カード（段階強化・オフィス連動） --- */
    const cardFeat = document.getElementById('upg-card-features');
    if (cardFeat) {
      let featListHtml = '';
      const featKeys = ['handSize', 'freeFlip', 'extraRerolls', 'extraAttempts'];

      featKeys.forEach(key => {
        const featGroup = UPGRADE_CONFIG.features[key];
        if (!featGroup || !featGroup.levels) return;
        const curLv = getFeatureLevel(key);
        const maxLv = featGroup.levels.length - 1;
        const isMax = curLv >= maxLv;
        const curLvDef = featGroup.levels[curLv] || featGroup.levels[0];
        const nextLvDef = !isMax ? featGroup.levels[curLv + 1] : null;
        const reqOfficeLv = nextLvDef ? (nextLvDef.reqOfficeLevel || 0) : 0;
        const reqOfficeDef = UPGRADE_CONFIG.office[reqOfficeLv] || UPGRADE_CONFIG.office[0];
        const isLockedByOffice = !isMax && (curOfficeLv < reqOfficeLv);
        const canAfford = nextLvDef && !isLockedByOffice && GameState.funds >= nextLvDef.cost;

        let statusBadge = '';
        if (isMax) {
          statusBadge = `<span style="font-size:9.5px; font-weight:bold; padding:2px 7px; border-radius:4px; background:rgba(16,185,129,0.2); border:1px solid rgba(16,185,129,0.4); color:#34d399;">Lv.${curLv} MAX</span>`;
        } else if (curLv > 0) {
          statusBadge = `<span style="font-size:9.5px; font-weight:bold; padding:2px 7px; border-radius:4px; background:rgba(245,158,11,0.18); border:1px solid rgba(245,158,11,0.35); color:#fcd34d;">Lv.${curLv}/${maxLv} (${curLvDef.name})</span>`;
        } else {
          statusBadge = `<span style="font-size:9.5px; font-weight:bold; padding:2px 7px; border-radius:4px; background:rgba(148,163,184,0.15); border:1px solid rgba(148,163,184,0.3); color:#94a3b8;">未導入 (Lv.0/${maxLv})</span>`;
        }

        let bottomAction = '';
        if (isMax) {
          bottomAction = `<div style="font-size:10.5px; color:var(--c-emerald); font-weight:bold; text-align:center; padding:6px; background:rgba(16,185,129,0.1); border-radius:5px; border:1px solid rgba(16,185,129,0.25); margin-top:6px;">★ 最大レベル（${curLvDef.name}）導入済み</div>`;
        } else if (isLockedByOffice) {
          bottomAction = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px; padding:6px 8px; background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.25); border-radius:5px; gap:8px;">
              <div style="font-size:10px; color:#fcd34d; line-height:1.35;">
                <div><strong>次: Lv.${nextLvDef.level} ${nextLvDef.name}</strong>（${nextLvDef.cost}万）</div>
                <div style="color:var(--c-text2); font-size:9.5px;">${nextLvDef.desc}</div>
                <div style="color:#f59e0b; margin-top:2px;"><i class="ph-bold ph-lock"></i> 要: Rank ${reqOfficeLv + 1} ${reqOfficeDef.name}</div>
              </div>
              <button class="btn btn-slate" disabled style="padding:6px 10px; font-size:10.5px; font-weight:bold; opacity:0.5; cursor:not-allowed; white-space:nowrap;">
                <i class="ph-bold ph-lock-key"></i> 移転で解放
              </button>
            </div>
          `;
        } else {
          bottomAction = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px; padding:6px 8px; background:rgba(15,23,42,0.55); border:1px dashed rgba(255,255,255,0.14); border-radius:5px; gap:8px;">
              <div style="font-size:10px; line-height:1.35;">
                <div style="color:#fde047; font-weight:bold;">次: Lv.${nextLvDef.level} ${nextLvDef.name}</div>
                <div style="color:var(--c-text2); font-size:9.5px;">${nextLvDef.desc}</div>
              </div>
              <button class="btn ${canAfford ? 'btn-primary' : 'btn-slate'}" ${canAfford ? '' : 'disabled'} onclick="buyCompanyUpgrade('feature', '${key}')" style="padding:7px 11px; font-size:11px; font-weight:bold; cursor:${canAfford ? 'pointer' : 'not-allowed'}; opacity:${canAfford ? '1' : '0.55'}; white-space:nowrap;">
                Lv.${nextLvDef.level} 導入 (${nextLvDef.cost}万)
              </button>
            </div>
          `;
        }

        featListHtml += `
          <div style="padding:9px 10px; background:rgba(15,23,42,0.45); border-radius:6px; border:1px solid rgba(255,255,255,0.08); margin-bottom:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div style="display:flex; align-items:center; gap:6px;">
                <i class="ph-bold ${featGroup.icon}" style="color:var(--c-amber); font-size:15px;"></i>
                <span style="font-size:12.5px; font-weight:bold; color:var(--c-text);">${featGroup.name}</span>
              </div>
              ${statusBadge}
            </div>
            <div style="font-size:10.5px; color:#cbd5e1; margin-top:4px;">
              現在: <strong>${curLvDef.desc}</strong>
            </div>
            ${bottomAction}
          </div>
        `;
      });

      cardFeat.innerHTML = `
        <div style="font-size:13px; font-weight:bold; color:var(--c-text); margin-bottom:8px; display:flex; align-items:center; gap:6px;">
          <i class="ph-bold ph-wrench" style="color:var(--c-amber);"></i> 設備投資（段階強化・永続設計バフ）
        </div>
        ${featListHtml}
      `;
    }

    /* --- 5. スタッフ雇用タブ --- */
    const statusBox = document.getElementById('upg-staff-status-box');
    if (statusBox) {
      const totalSalary = co.hiredStaff.reduce((sum, s) => sum + (s.salary || 0), 0);
      const recActive = co.recruitment?.status === 'active';
      const maintLine = recActive ? `<div style="font-size:10px; color:#fbbf24; margin-top:2px;">(＋求人掲載維持費 -${RECRUIT_MAINT_COST.toFixed(1)}万/月)</div>` : '';
      let noteHtml = '';
      if (maxSlots === 0) {
        noteHtml = `<div style="margin-top:6px; font-size:11px; color:#f59e0b; background:rgba(245,158,11,0.12); padding:6px 8px; border-radius:4px; border:1px solid rgba(245,158,11,0.25);"><i class="ph-bold ph-info"></i> デスクがありません。「事務所強化」でデスクを増設するとスタッフを雇用できます。</div>`;
      } else if (hiredCount >= maxSlots) {
        noteHtml = `<div style="margin-top:6px; font-size:10.5px; color:#38bdf8; background:rgba(56,189,248,0.1); padding:6px 8px; border-radius:4px; border:1px solid rgba(56,189,248,0.25);"><i class="ph-bold ph-arrows-left-right"></i> デスク満席（現在も求人を出して<strong>既存スタッフとの入れ替え採用</strong>が可能です）</div>`;
      }

      statusBox.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-size:11px; color:var(--c-text2);">雇用スロット</div>
            <div style="font-size:16px; font-weight:bold; color:var(--c-text);">${hiredCount} / ${maxSlots}人</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px; color:var(--c-text2);">月間総人件費</div>
            <div style="font-size:16px; font-weight:bold; color:var(--c-rose);">-${totalSalary.toFixed(1)}<span style="font-size:10px; font-weight:normal;">万/月</span></div>
            ${maintLine}
          </div>
        </div>
        <div style="font-size:10px; color:var(--c-text3); margin-top:5px; line-height:1.3;">
          ※ 人件費は毎月末の家賃精算時に差し引かれます。毎年12月末に昇給交渉があります。
        </div>
        ${noteHtml}
      `;
    }

    // 雇用中リスト
    const hiredListEl = document.getElementById('upg-hired-staff-list');
    if (hiredListEl) {
      if (co.hiredStaff.length === 0) {
        hiredListEl.innerHTML = `<div style="font-size:11px; color:var(--c-text3); text-align:center; padding:12px; background:rgba(15,23,42,0.3); border-radius:6px; border:1px dashed rgba(255,255,255,0.1);">現在雇用中のスタッフはいません</div>`;
      } else {
        let hiredHtml = '';
        co.hiredStaff.forEach(s => {
          const isConfirming = window.dismissConfirmingStaffId === s.id;
          const dismissBtn = isConfirming
            ? `<button class="btn btn-rose" onclick="confirmDismissStaff('${s.id}')" style="padding:4px 8px; font-size:11px; font-weight:bold; background:#e11d48; color:white;">本当に解雇？</button>`
            : `<button class="btn btn-slate" onclick="startDismissStaff('${s.id}')" style="padding:4px 8px; font-size:11px;">解雇</button>`;

          let skillsHtml = '';
          if (Array.isArray(s.skills)) {
            skillsHtml = s.skills.map(sk => {
              const def = STAFF_SKILL_DEFS[sk.id];
              const desc = def ? def.desc[sk.level - 1] : '';
              return `
                <div style="font-size:10px; color:var(--c-text); background:rgba(255,255,255,0.06); padding:3px 6px; border-radius:4px; margin-top:3px; border-left:2px solid var(--c-amber);">
                  <strong style="color:var(--c-amber-lt);">${def ? def.name : sk.id} Lv${sk.level}</strong>: ${desc}
                </div>
              `;
            }).join('');
          } else if (s.desc) {
            skillsHtml = `<div style="font-size:10px; color:var(--c-text2); margin-top:2px;">${s.desc}</div>`;
          }

          let rankBadge = '';
          if (s.rank === 'expert') {
            rankBadge = `<span style="font-size:9px; background:rgba(244,63,94,0.2); color:#fda4af; border:1px solid rgba(244,63,94,0.4); padding:1px 5px; border-radius:4px;">★★★ エキスパート</span>`;
          } else if (s.rank === 'specialist') {
            rankBadge = `<span style="font-size:9px; background:rgba(245,158,11,0.2); color:#fcd34d; border:1px solid rgba(245,158,11,0.4); padding:1px 5px; border-radius:4px;">★★ スペシャリスト</span>`;
          } else {
            rankBadge = `<span style="font-size:9px; background:rgba(59,130,246,0.15); color:#93c5fd; border:1px solid rgba(59,130,246,0.3); padding:1px 5px; border-radius:4px;">★ アシスタント</span>`;
          }

          hiredHtml += `
            <div style="padding:10px; background:rgba(15,23,42,0.5); border:1px solid rgba(245,158,11,0.25); border-radius:8px; margin-bottom:8px;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div style="display:flex; gap:8px; align-items:center;">
                  <span style="font-size:24px; line-height:1;">${s.avatar}</span>
                  <div>
                    <div style="font-size:13px; font-weight:bold; color:var(--c-text); display:flex; align-items:center; gap:6px;">
                      ${s.name}
                      ${rankBadge}
                    </div>
                    <div style="font-size:10px; color:var(--c-text2); margin-top:1px;">${s.role || ''}</div>
                  </div>
                </div>
                <div style="text-align:right;">
                  <div style="font-size:11px; color:var(--c-rose); font-weight:bold;">-${s.salary.toFixed(1)}万/月</div>
                  <div style="margin-top:4px;">${dismissBtn}</div>
                </div>
              </div>
              <div style="margin-top:6px;">${skillsHtml}</div>
            </div>
          `;
        });
        hiredListEl.innerHTML = hiredHtml;
      }
    }

    // 候補リスト（満席でも入替採用のために求人可能・雇用人数に応じて費用上昇・掲載中は月次維持費発生）
    const candListEl = document.getElementById('upg-candidate-staff-list');
    if (candListEl) {
      if (!co.recruitment) co.recruitment = { status: 'none', candidates: [] };
      const rec = co.recruitment;
      const isSlotFull = hiredCount >= maxSlots;
      const adCost = getRecruitAdCost(hiredCount);
      const scoutCost = getRecruitScoutCost(hiredCount);

      if (maxSlots === 0) {
        candListEl.innerHTML = `<div style="font-size:11px; color:#f59e0b; text-align:center; padding:14px; background:rgba(245,158,11,0.1); border-radius:6px; border:1px solid rgba(245,158,11,0.25);"><i class="ph-bold ph-info"></i> デスクがありません。「事務所強化」でデスクを増設すると求人募集が可能になります。</div>`;
      } else if (rec.status === 'none') {
        candListEl.innerHTML = `
          <div style="text-align:center; padding:16px 12px; background:rgba(15,23,42,0.45); border:1px dashed rgba(255,255,255,0.15); border-radius:8px;">
            <div style="font-size:24px; margin-bottom:4px;">📢</div>
            <div style="font-size:13px; font-weight:bold; color:var(--c-text); margin-bottom:4px;">現在、求人広告は出していません</div>
            <div style="font-size:10.5px; color:var(--c-text2); margin-bottom:10px; line-height:1.45;">
              求人広告を掲載すると、翌月に応募者（3名）が到着します。<br>
              <span style="color:#fbbf24;">※応募到着後、求人掲載を継続すると毎月 <strong>${RECRUIT_MAINT_COST}万円の掲載維持費</strong> がかかります（いつでも停止可）。</span>
              ${isSlotFull ? `<br><span style="color:#38bdf8;">💡 デスク満席のため、採用時は<strong>現在のスタッフとの入れ替え</strong>になります。</span>` : ''}
            </div>
            <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
              <button class="btn btn-primary" onclick="postJobAd()" style="padding:8px 12px; font-size:11.5px; font-weight:bold; gap:5px;">
                <i class="ph-bold ph-megaphone"></i> 求人広告を掲載 (${adCost}万 / 翌月到着)
              </button>
              <button class="btn btn-slate" onclick="scoutImmediately()" style="padding:8px 12px; font-size:11.5px; font-weight:bold; gap:5px; border:1px solid rgba(56,189,248,0.4); color:#bae6fd;">
                <i class="ph-bold ph-lightning" style="color:#38bdf8;"></i> 即時スカウト (${scoutCost}万 / 即時到着)
              </button>
            </div>
          </div>
        `;
      } else if (rec.status === 'posted') {
        candListEl.innerHTML = `
          <div style="text-align:center; padding:16px 12px; background:rgba(59,130,246,0.12); border:1px solid rgba(59,130,246,0.3); border-radius:8px;">
            <div style="font-size:22px; margin-bottom:4px;">📢</div>
            <div style="font-size:13px; font-weight:bold; color:#93c5fd; margin-bottom:4px;">求人広告を掲載中！（翌月到着）</div>
            <div style="font-size:10.5px; color:var(--c-text2); margin-bottom:10px; line-height:1.45;">
              翌月になると応募者3名が到着します。<br>
              （到着した翌々月以降も掲載を続けると、月${RECRUIT_MAINT_COST}万の維持費で毎月新しい候補が届きます）
            </div>
            <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
              <button class="btn btn-slate" onclick="scoutImmediately()" style="padding:7px 12px; font-size:11px; font-weight:bold; gap:4px; border:1px solid rgba(56,189,248,0.4); color:#bae6fd;">
                <i class="ph-bold ph-lightning" style="color:#38bdf8;"></i> 今すぐ即時スカウト (${scoutCost}万)
              </button>
              <button class="btn btn-slate" onclick="stopJobAd()" style="padding:7px 10px; font-size:10.5px; border:1px solid rgba(244,63,94,0.35); color:#fda4af;">
                求人を停止する
              </button>
            </div>
          </div>
        `;
      } else { // active
        let candHtml = `
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:8px; background:rgba(30,41,59,0.55); padding:7px 10px; border-radius:6px; border:1px solid rgba(245,158,11,0.3);">
            <div>
              <div style="font-size:11px; font-weight:bold; color:var(--c-text);">
                応募者（全${rec.candidates ? rec.candidates.length : 0}名）
              </div>
              <div style="font-size:9.5px; color:#fbbf24; margin-top:1px;">
                📢 求人掲載継続中（翌月更新・維持費 -${RECRUIT_MAINT_COST}万/月）
              </div>
            </div>
            <div style="display:flex; gap:6px; align-items:center;">
              <button class="btn btn-slate" onclick="scoutImmediately()" style="padding:4px 8px; font-size:10px; font-weight:bold; gap:3px; border:1px solid rgba(56,189,248,0.3); color:#bae6fd;" title="新しい候補者3名を即時再募集">
                <i class="ph-bold ph-arrows-clockwise" style="color:#38bdf8;"></i> 即時再募集 (${scoutCost}万)
              </button>
              <button class="btn btn-slate" onclick="stopJobAd()" style="padding:4px 8px; font-size:10px; font-weight:bold; border:1px solid rgba(244,63,94,0.4); color:#fda4af;" title="求人掲載を終了し月次維持費を止めます">
                掲載停止
              </button>
            </div>
          </div>
        `;

        if (!rec.candidates || rec.candidates.length === 0) {
          candHtml += `<div style="font-size:11px; color:var(--c-text3); text-align:center; padding:12px; background:rgba(15,23,42,0.3); border-radius:6px;">現在応募者はいません（翌月新しい応募者が届きます。不要な場合は「掲載停止」を押してください）</div>`;
        } else {
          rec.candidates.forEach(c => {
            let skillsHtml = '';
            if (Array.isArray(c.skills)) {
              skillsHtml = c.skills.map(sk => {
                const def = STAFF_SKILL_DEFS[sk.id];
                const desc = def ? def.desc[sk.level - 1] : '';
                return `
                  <div style="font-size:10px; color:var(--c-text); background:rgba(255,255,255,0.06); padding:3px 6px; border-radius:4px; margin-top:3px; border-left:2px solid var(--c-blue);">
                    <strong style="color:#93c5fd;">${def ? def.name : sk.id} Lv${sk.level}</strong>: ${desc}
                  </div>
                `;
              }).join('');
            }

            let rankBadge = '';
            if (c.rank === 'expert') {
              rankBadge = `<span style="font-size:9px; background:rgba(244,63,94,0.2); color:#fda4af; border:1px solid rgba(244,63,94,0.4); padding:1px 5px; border-radius:4px;">★★★ エキスパート</span>`;
            } else if (c.rank === 'specialist') {
              rankBadge = `<span style="font-size:9px; background:rgba(245,158,11,0.2); color:#fcd34d; border:1px solid rgba(245,158,11,0.4); padding:1px 5px; border-radius:4px;">★★ スペシャリスト</span>`;
            } else {
              rankBadge = `<span style="font-size:9px; background:rgba(59,130,246,0.15); color:#93c5fd; border:1px solid rgba(59,130,246,0.3); padding:1px 5px; border-radius:4px;">★ アシスタント</span>`;
            }

            const isReplacingThis = (window.replacingCandidateId === c.id);
            let replaceSelectorHtml = '';
            if (isSlotFull && isReplacingThis) {
              const targetBtns = co.hiredStaff.map(hs => `
                <button class="btn btn-slate" onclick="replaceHireCandidate('${c.id}', '${hs.id}')" style="padding:5px 8px; font-size:10.5px; border:1px solid rgba(245,158,11,0.45); color:#fde68a; justify-content:space-between; width:100%; margin-top:4px;">
                  <span>🔄 ${hs.avatar} <strong>${hs.name}</strong> (${hs.role || ''}) と入れ替える</span>
                  <span style="font-size:9.5px; color:#fca5a5;">現給-${hs.salary.toFixed(1)}万</span>
                </button>
              `).join('');
              replaceSelectorHtml = `
                <div style="margin-top:8px; padding:8px; background:rgba(15,23,42,0.85); border:1px solid rgba(245,158,11,0.4); border-radius:6px;">
                  <div style="display:flex; justify-content:space-between; align-items:center; font-size:10.5px; color:#fcd34d; font-weight:bold; margin-bottom:2px;">
                    <span>誰と入れ替えますか？（解雇して採用）</span>
                    <button onclick="cancelReplaceCandidate()" style="background:none; border:none; color:var(--c-text2); font-size:10px; cursor:pointer; text-decoration:underline;">キャンセル</button>
                  </div>
                  ${targetBtns}
                </div>
              `;
            }

            const actionBtnHtml = isSlotFull
              ? `<button class="btn btn-amber" onclick="startReplaceCandidate('${c.id}')" style="padding:6px 10px; font-size:11px; font-weight:bold; gap:4px; white-space:nowrap;">
                   <i class="ph-bold ph-arrows-left-right"></i> 入替採用
                 </button>`
              : `<button class="btn btn-primary" onclick="hireCandidate('${c.id}')" style="padding:6px 12px; font-size:11px; font-weight:bold; gap:4px; white-space:nowrap;">
                   <i class="ph-bold ph-user-plus"></i> 採用する
                 </button>`;

            candHtml += `
              <div style="padding:10px; background:rgba(15,23,42,0.35); border:1px solid rgba(255,255,255,0.08); border-radius:8px; margin-bottom:8px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                  <div style="display:flex; gap:8px; align-items:center;">
                    <span style="font-size:24px; line-height:1;">${c.avatar}</span>
                    <div>
                      <div style="font-size:13px; font-weight:bold; color:var(--c-text); display:flex; align-items:center; gap:6px;">
                        ${c.name}
                        ${rankBadge}
                      </div>
                      <div style="font-size:10px; color:var(--c-text2); margin-top:1px;">${c.role || ''}</div>
                    </div>
                  </div>
                  <div style="text-align:right;">
                    <div style="font-size:11px; color:var(--c-amber-lt); font-weight:bold; margin-bottom:4px;">給与: ${c.salary.toFixed(1)}万/月</div>
                    ${actionBtnHtml}
                  </div>
                </div>
                <div style="margin-top:6px;">${skillsHtml}</div>
                ${replaceSelectorHtml}
              </div>
            `;
          });
        }
        candListEl.innerHTML = candHtml;
      }
    }

    /* --- 6. 銀行融資タブ --- */
    const bankContent = document.getElementById('upg-bank-content');
    if (bankContent) {
      const debt = co.debt || 0;
      const emergDebt = co.emergencyDebt || 0;
      const maxLoan = getMaxLoan();
      const remCap = getRemainingLoanCapacity();
      const loanPay = calcMonthlyLoanPayment(debt);
      const loanLv = getStaffSkillLevel('loan_negotiator');
      const interestDesc = loanLv > 0
        ? `月利1.5%➔Lv${loanLv}金利交渉で${[0, 15, 30, 50][loanLv]}%引`
        : '月利1.5%';
      const brandLv = co.brandLevel || 1;
      const colStats = calcCollateralStats();
      const isOverLimit = debt > maxLoan;
      const overAmount = Math.max(0, Math.round((debt - maxLoan) * 10) / 10);
      const canBorrow50 = remCap >= 50;
      const canBorrow100 = remCap >= 100;
      const canBorrowRem = remCap > 0 && remCap < 50;
      const canRepay50 = debt > 0 && GameState.funds >= Math.min(50, debt);
      const maxRepayable = Math.min(GameState.funds, debt);
      const canRepayAll = debt > 0 && maxRepayable >= 1.0;
      const canRepayEmerg = emergDebt > 0 && GameState.funds >= 0.1;
      const maxEmergRepayable = Math.min(GameState.funds, emergDebt);

      bankContent.innerHTML = `
        ${emergDebt > 0 ? `
          <div style="background:rgba(244,63,94,0.15); border:1.5px solid #f43f5e; border-radius:8px; padding:12px; margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <div style="color:#fb7185; font-size:12px; font-weight:bold; display:flex; align-items:center; gap:5px;">
                <i class="ph-bold ph-lightning"></i> 街金・緊急融資残高
              </div>
              <div style="font-size:16px; font-weight:900; color:#fb7185;">${emergDebt.toFixed(1)}<span style="font-size:10px; font-weight:normal;"> 万円</span></div>
            </div>
            <div style="font-size:10.5px; color:#fecdd3; line-height:1.4; margin-bottom:10px;">
              ⚠️ <strong>超高金利（月利 10.0%）</strong> が毎月発生しています！破産を防ぐため、手元資金ができ次第の最優先返済を強く推奨します。
            </div>
            <button class="btn" onclick="repayEmergencyLoan('all')" ${canRepayEmerg ? '' : 'disabled'} style="background:#e11d48; color:#ffffff; width:100%; padding:9px; font-size:12px; font-weight:bold; justify-content:center; border:none; cursor:${canRepayEmerg ? 'pointer' : 'not-allowed'}; opacity:${canRepayEmerg ? '1' : '0.45'};">
              ${GameState.funds >= emergDebt ? `街金を一括完済 (-${emergDebt.toFixed(1)}万円)` : `街金を優先返済 (-${maxEmergRepayable.toFixed(1)}万円)`}
            </button>
          </div>
        ` : ''}

        <div style="background:#1e293b; border:1px solid rgba(255,255,255,0.12); border-radius:8px; padding:12px; margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div>
              <div style="font-size:11px; color:var(--c-text2);">現在の銀行借入残高</div>
              <div style="font-size:20px; font-weight:900; color:${debt > 0 ? 'var(--c-rose)' : 'var(--c-emerald)'};">${debt.toFixed(1)}<span style="font-size:11px; font-weight:normal;"> 万円</span></div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:11px; color:var(--c-text2);">残り融資可能枠 / 限度額</div>
              <div style="font-size:16px; font-weight:bold; color:#38bdf8;">${remCap.toFixed(1)} <span style="font-size:11px; color:var(--c-text2); font-weight:normal;">/ ${maxLoan.toFixed(1)}万</span></div>
            </div>
          </div>

          ${isOverLimit ? `
            <div style="background:rgba(245,158,11,0.15); border:1px solid rgba(245,158,11,0.4); color:#fcd34d; border-radius:6px; padding:6px 8px; font-size:10px; line-height:1.4; margin-bottom:8px;">
              ⚠️ 物件の空室・売却・経年劣化により、借入残高が現在の限度額を <strong>${overAmount.toFixed(1)}万円</strong> 超過しています（一括返済は不要ですが、残高が限度額を下回るまで新規の追加借入はできません）。
            </div>
          ` : ''}

          <div style="background:rgba(15,23,42,0.5); border-radius:6px; padding:8px 10px; font-size:11px; color:#cbd5e1; border:1px dashed rgba(255,255,255,0.1);">
            <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
              <span>月末自動引き落とし予定 (元利合計):</span>
              <strong style="color:${loanPay.total > 0 ? 'var(--c-rose)' : 'var(--c-text2)'};">-${loanPay.total.toFixed(1)}万/月</strong>
            </div>
            <div style="font-size:10px; color:var(--c-text3);">
              内訳: 元本返済 ${loanPay.principal.toFixed(1)}万 (残債5%・最低10万) ＋ 金利 ${loanPay.interest.toFixed(1)}万 (${interestDesc})
            </div>
          </div>
        </div>

        <div style="background:var(--c-surface2); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:12px; margin-bottom:12px;">
          <div style="font-size:12px; font-weight:bold; color:var(--c-amber-lt); margin-bottom:8px; display:flex; align-items:center; gap:6px;">
            <i class="ph-bold ph-hand-coins"></i> 銀行運転資金の借入（即日融資）
          </div>
          <div style="font-size:11px; color:var(--c-text2); margin-bottom:10px; line-height:1.4;">
            物件の建築資金が足りない場合、銀行の信用枠の範囲内でいつでも融資を受けられます。
          </div>
          ${emergDebt > 0 ? `
            <div style="background:rgba(244,63,94,0.12); border:1px solid rgba(244,63,94,0.35); border-radius:6px; padding:10px 12px; color:#fecdd3; font-size:11px; line-height:1.5;">
              <div style="color:#fb7185; font-weight:bold; margin-bottom:4px; display:flex; align-items:center; gap:5px;">
                <i class="ph-bold ph-prohibit"></i> 銀行融資 審査落ち（利用停止中）
              </div>
              街金（ノンバンク）からの借入残高（${emergDebt.toFixed(1)}万円）が存在するため、信用審査により銀行融資が全面停止されています。<br>
              上の「街金を優先返済する」ボタンから全額完済すると、銀行との正常な融資取引が再開されます。
            </div>
          ` : `
            <div style="display:flex; gap:8px;">
              <button class="btn ${canBorrow50 ? 'btn-primary' : 'btn-slate'}" ${canBorrow50 ? '' : 'disabled'} onclick="borrowLoan(50)" style="flex:1; padding:10px 6px; font-size:12px; font-weight:bold; justify-content:center; cursor:${canBorrow50 ? 'pointer' : 'not-allowed'}; opacity:${canBorrow50 ? '1' : '0.45'};">
                +50万円 借入
              </button>
              <button class="btn ${canBorrow100 ? 'btn-primary' : 'btn-slate'}" ${canBorrow100 ? '' : 'disabled'} onclick="borrowLoan(100)" style="flex:1; padding:10px 6px; font-size:12px; font-weight:bold; justify-content:center; cursor:${canBorrow100 ? 'pointer' : 'not-allowed'}; opacity:${canBorrow100 ? '1' : '0.45'};">
                +100万円 借入
              </button>
            </div>
            ${canBorrowRem ? `
              <button class="btn btn-primary" onclick="borrowLoan(${remCap})" style="width:100%; margin-top:8px; padding:8px; font-size:11px; font-weight:bold; justify-content:center; cursor:pointer;">
                残り枠すべて（+${remCap.toFixed(1)}万円）を借入
              </button>
            ` : ''}
          `}
        </div>

        <div style="background:var(--c-surface2); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:12px; margin-bottom:12px;">
          <div style="font-size:12px; font-weight:bold; color:var(--c-emerald); margin-bottom:8px; display:flex; align-items:center; gap:6px;">
            <i class="ph-bold ph-check-circle"></i> 繰上返済（手数料・利息なし）
          </div>
          <div style="font-size:11px; color:var(--c-text2); margin-bottom:10px; line-height:1.4;">
            手元資金に余裕があるときに元本を直接返済し、毎月の金利負担を減らせます。
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn ${canRepay50 ? 'btn-amber' : 'btn-slate'}" ${canRepay50 ? '' : 'disabled'} onclick="repayLoan(50)" style="flex:1; padding:10px 6px; font-size:12px; font-weight:bold; justify-content:center; cursor:${canRepay50 ? 'pointer' : 'not-allowed'}; opacity:${canRepay50 ? '1' : '0.45'};">
              -${Math.min(50, debt > 0 ? debt : 50).toFixed(0)}万円 返済
            </button>
            <button class="btn ${canRepayAll ? 'btn-amber' : 'btn-slate'}" ${canRepayAll ? '' : 'disabled'} onclick="repayLoan('all')" style="flex:1; padding:10px 6px; font-size:12px; font-weight:bold; justify-content:center; cursor:${canRepayAll ? 'pointer' : 'not-allowed'}; opacity:${canRepayAll ? '1' : '0.45'};">
              ${GameState.funds >= debt && debt > 0 ? `一括完済 (-${debt.toFixed(1)}万)` : `最大返済 (-${maxRepayable.toFixed(1)}万)`}
            </button>
          </div>
        </div>

        <div style="background:rgba(15,23,42,0.4); border:1px solid rgba(255,255,255,0.06); border-radius:6px; padding:10px; font-size:10px; color:var(--c-text2); line-height:1.5;">
          <div style="font-weight:bold; color:var(--c-text); margin-bottom:4px;">📈 現在の銀行信用枠（限度額 ${maxLoan.toFixed(1)}万円）の内訳</div>
          <div>・基本信用枠: <strong>100万円</strong></div>
          <div>・知名度ボーナス (Lv.${brandLv}): <strong>+${(brandLv - 1) * 200}万円</strong> (1Lvにつき+200万)</div>
          <div>・所有物件担保ボーナス (稼働${colStats.activeProps}棟 / 空室${colStats.vacantProps}棟): <strong>+${colStats.totalCollateral.toFixed(1)}万円</strong><br>
            <span style="color:var(--c-text3); padding-left:10px;">※ 入居中物件は「現在売価×2.0倍」、空室中物件は「現在売価×0.5倍」で評価</span>
          </div>
        </div>
      `;
    }

    /* --- 7. デッキ編成・新規ピース技術開発タブ（ビジュアルカードバインダーUI） --- */
    const deckContent = document.getElementById('upg-deck-content');
    if (deckContent) {
      const activeIds = getActiveDeckPieceIds();
      const totalCards = activeIds.length;
      const customAddedCount = co.deck.customSlots.filter(x => x && PIECE_MAP[x] && isPieceUnlocked(x)).length;

      // カテゴリ別枚数集計
      const catCounts = { [T.ROOM]:0, [T.CORRIDOR]:0, [T.LDK]:0, wet:0, [T.CLOSET]:0 };
      for (const pid of activeIds) {
        const p = PIECE_MAP[pid];
        if (!p) continue;
        if (p.cat === T.ROOM) catCounts[T.ROOM]++;
        else if (p.cat === T.CORRIDOR) catCounts[T.CORRIDOR]++;
        else if (p.cat === T.LDK) catCounts[T.LDK]++;
        else if (p.cat === T.CLOSET) catCounts[T.CLOSET]++;
        else catCounts.wet++;
      }

      const catNameMap = {
        [T.CORRIDOR]: '廊下',
        [T.LDK]:      'LDK',
        [T.ROOM]:     '居室',
        [T.BATH]:     '浴室',
        [T.TOILET]:   'トイレ',
        [T.WASHROOM]: '洗面',
        [T.CLOSET]:   '収納'
      };

      const countCellsInShape = (shape) => {
        let n = 0;
        for (const row of shape) for (const v of row) if (v === 1) n++;
        return n;
      };

      const unlockedList = PIECE_LIB.filter(p => isPieceUnlocked(p.id));
      const editingSlot = window.activeDeckEditingSlot || null; // { type: 'upgrade'|'custom', id: string|number }

      // 個別カード描画ヘルパー（固定カード or 入替可能カード）
      const renderBinderCard = (pieceId, opts = {}) => {
        const p = PIECE_MAP[pieceId];
        if (!p) return '';
        const cells = countCellsInShape(p.shape);
        const effCost = getPieceCost(p, false);
        const perCell = (effCost / cells).toFixed(1);
        const isDiscounted = effCost < (p.cost || 0);
        const isLocked = !!opts.locked;
        const isEditing = !!opts.isEditing;
        const isModified = !!opts.isModified;
        const clickAttr = opts.onClick ? `onclick="${opts.onClick}"` : '';

        if (isLocked) {
          return `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:space-between; padding:6px 4px; border-radius:8px; background:rgba(15,23,42,0.45); border:1px solid rgba(148,163,184,0.18); opacity:0.78; min-height:84px; box-sizing:border-box; position:relative;">
              <div style="width:100%; display:flex; justify-content:space-between; align-items:center; font-size:8.5px; color:#94a3b8; padding:0 2px;">
                <span>🔒固定</span>
                <span>${cells}ﾏｽ</span>
              </div>
              <div style="margin:4px 0; min-height:26px; display:flex; align-items:center; justify-content:center;">
                ${renderMiniPieceShape(p, 7)}
              </div>
              <div style="text-align:center; width:100%;">
                <div style="font-size:10px; font-weight:bold; color:#cbd5e1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.name}</div>
                <div style="font-size:8.5px; color:#94a3b8;">${effCost.toFixed(1)}万${isDiscounted ? ` <s style="font-size:7.5px;">${p.cost.toFixed(1)}</s>` : ''}</div>
              </div>
            </div>
          `;
        }

        const borderColor = isEditing
          ? '#f59e0b'
          : (isModified ? 'rgba(56,189,248,0.75)' : 'rgba(56,189,248,0.4)');
        const bgStyle = isEditing
          ? 'linear-gradient(180deg, rgba(245,158,11,0.22), rgba(15,23,42,0.9))'
          : (isModified ? 'linear-gradient(180deg, rgba(56,189,248,0.16), rgba(15,23,42,0.85))' : 'rgba(30,41,59,0.9)');
        const badgeText = isEditing ? '🎯選択' : (isModified ? '✨変更' : '🔄入替');
        const badgeColor = isEditing ? '#fde047' : '#38bdf8';

        return `
          <div ${clickAttr} style="display:flex; flex-direction:column; align-items:center; justify-content:space-between; padding:6px 4px; border-radius:8px; background:${bgStyle}; border:1.5px solid ${borderColor}; min-height:84px; box-sizing:border-box; cursor:pointer; box-shadow:${isEditing ? '0 0 0 2px rgba(245,158,11,0.35)' : '0 2px 5px rgba(0,0,0,0.25)'}; transition:transform 0.12s;">
            <div style="width:100%; display:flex; justify-content:space-between; align-items:center; font-size:8.5px; font-weight:bold; color:${badgeColor}; padding:0 2px;">
              <span>${badgeText}</span>
              <span style="color:#cbd5e1;">${cells}ﾏｽ</span>
            </div>
            <div style="margin:4px 0; min-height:26px; display:flex; align-items:center; justify-content:center;">
              ${renderMiniPieceShape(p, 7)}
            </div>
            <div style="text-align:center; width:100%;">
              <div style="font-size:10px; font-weight:bold; color:#ffffff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.name}</div>
              <div style="font-size:8.5px; color:var(--c-emerald); font-weight:bold;">${effCost.toFixed(1)}万${isDiscounted ? ` <s style="color:#94a3b8; font-size:7.5px;">${p.cost.toFixed(1)}</s>` : ''}</div>
            </div>
          </div>
        `;
      };

      // インライン・カード選択ピッカー（カードをタップした時にその場に展開）
      const renderPickerTray = (slotType, slotKey, curPieceId, catFilter = null, defaultPieceId = null) => {
        const candidates = catFilter ? unlockedList.filter(p => p.cat === catFilter) : unlockedList;
        const lockedCandidates = catFilter
          ? PIECE_LIB.filter(p => p.cat === catFilter && !isPieceUnlocked(p.id))
          : PIECE_LIB.filter(p => !isPieceUnlocked(p.id));
        const defPiece = defaultPieceId ? PIECE_MAP[defaultPieceId] : null;

        let cardsHtml = `<div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:6px; margin-top:6px;">`;
        if (slotType === 'custom') {
          const isEmptySel = !curPieceId;
          cardsHtml += `
            <div onclick="setDeckCustomSlot(${slotKey}, '')" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:8px 4px; border-radius:7px; background:${isEmptySel ? 'rgba(244,63,94,0.18)' : 'rgba(15,23,42,0.6)'}; border:1.5px dashed ${isEmptySel ? '#f43f5e' : '#475569'}; cursor:pointer; min-height:78px;">
              <i class="ph-bold ph-prohibit" style="font-size:18px; color:#94a3b8; margin-bottom:4px;"></i>
              <div style="font-size:10px; font-weight:bold; color:#cbd5e1;">外す</div>
            </div>
          `;
        }
        for (const p of candidates) {
          const isSel = p.id === curPieceId;
          const cells = countCellsInShape(p.shape);
          const effCost = getPieceCost(p, false);
          const isDiscounted = effCost < (p.cost || 0);
          const actionCall = slotType === 'upgrade'
            ? `setDeckSlotOverride('${slotKey}', '${p.id}')`
            : `setDeckCustomSlot(${slotKey}, '${p.id}')`;
          cardsHtml += `
            <div onclick="${actionCall}" style="display:flex; flex-direction:column; align-items:center; justify-content:space-between; padding:6px 4px; border-radius:7px; background:${isSel ? 'rgba(16,185,129,0.22)' : 'rgba(15,23,42,0.75)'}; border:1.5px solid ${isSel ? '#10b981' : 'rgba(255,255,255,0.15)'}; cursor:pointer; min-height:78px;">
              <div style="width:100%; display:flex; justify-content:space-between; font-size:8px; color:${isSel ? '#6ee7b7' : '#94a3b8'}; padding:0 2px;">
                <span>${isSel ? '✓編成中' : (catNameMap[p.cat] || '')}</span>
                <span>${cells}ﾏｽ</span>
              </div>
              <div style="margin:3px 0; min-height:24px; display:flex; align-items:center; justify-content:center;">
                ${renderMiniPieceShape(p, 7)}
              </div>
              <div style="text-align:center; width:100%;">
                <div style="font-size:10px; font-weight:bold; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.name}</div>
                <div style="font-size:8.5px; color:var(--c-emerald); font-weight:bold;">${effCost.toFixed(1)}万${isDiscounted ? ` <s style="color:#94a3b8; font-size:7.5px;">${p.cost.toFixed(1)}</s>` : ''}</div>
              </div>
            </div>
          `;
        }
        for (const lp of lockedCandidates) {
          const cells = countCellsInShape(lp.shape);
          cardsHtml += `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:space-between; padding:6px 4px; border-radius:7px; background:rgba(15,23,42,0.35); border:1px dashed rgba(148,163,184,0.2); opacity:0.55; min-height:78px;">
              <div style="width:100%; display:flex; justify-content:space-between; font-size:8px; color:#f59e0b; padding:0 2px;">
                <span>🔒${lp.unlockCost}万</span>
                <span style="color:#94a3b8;">${cells}ﾏｽ</span>
              </div>
              <div style="margin:3px 0; min-height:24px; display:flex; align-items:center; justify-content:center;">
                ${renderMiniPieceShape(lp, 6)}
              </div>
              <div style="text-align:center; width:100%;">
                <div style="font-size:9.5px; color:#94a3b8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${lp.name}</div>
              </div>
            </div>
          `;
        }
        cardsHtml += `</div>`;

        return `
          <div style="margin-top:8px; padding:9px 10px; border-radius:8px; background:#0f172a; border:1.5px solid #f59e0b; box-shadow:0 6px 16px rgba(0,0,0,0.4);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div style="font-size:11px; font-weight:bold; color:#fde047;">
                <i class="ph-bold ph-hand-pointing"></i> ${slotType === 'upgrade' ? `カード選択（初期: ${defPiece ? defPiece.name : ''}）` : `追加枠${slotKey + 1} のカード選択`}
              </div>
              <button class="btn btn-slate" onclick="toggleDeckSlotEditor(null, null)" style="padding:2px 7px; font-size:10px; cursor:pointer;">閉じる</button>
            </div>
            ${cardsHtml}
          </div>
        `;
      };

      // カテゴリグループ定義（固定カード＋入替枠カードを同じグループ内に並べて表示！）
      const binderGroups = [
        {
          key: 'room',
          title: '🛏️ 居室 (5)',
          fixedIds: ['room-22', 'room-22'],
          slotIds: ['room_slot_1', 'room_slot_2', 'room_slot_3'],
          cat: T.ROOM
        },
        {
          key: 'corr',
          title: '🏃 廊下 (4)',
          fixedIds: ['corr-1', 'corr-i2'],
          slotIds: ['corr_slot_1', 'corr_slot_2'],
          cat: T.CORRIDOR
        },
        {
          key: 'ldk',
          title: '🛋️ LDK (3)',
          fixedIds: ['k-1'],
          slotIds: ['ldk_slot_1', 'ldk_slot_2'],
          cat: T.LDK
        },
        {
          key: 'wet_closet',
          title: '🚿 水回り・収納 (8)',
          fixedIds: ['toilet', 'toilet', 'wash', 'wash', 'bath', 'closet'],
          slotIds: ['bath_slot_1', 'closet_slot_1'],
          cat: null
        }
      ];

      let binderGroupsHtml = '';
      for (const grp of binderGroups) {
        let rowCardsHtml = `<div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:6px;">`;
        // 1) 固定カードを先に並べる
        for (const fid of grp.fixedIds) {
          rowCardsHtml += renderBinderCard(fid, { locked: true });
        }
        // 2) 入替可能カードを続けて並べる
        let activeSlotInGroup = null;
        for (const sid of grp.slotIds) {
          const slotDef = UPGRADE_DECK_SLOTS.find(s => s.id === sid);
          if (!slotDef) continue;
          const ovId = co.deck.slotOverrides[sid];
          const curId = (ovId && PIECE_MAP[ovId] && PIECE_MAP[ovId].cat === slotDef.cat && isPieceUnlocked(ovId)) ? ovId : slotDef.defaultPieceId;
          const isEd = editingSlot && editingSlot.type === 'upgrade' && editingSlot.id === sid;
          if (isEd) activeSlotInGroup = { slotDef, curId };
          rowCardsHtml += renderBinderCard(curId, {
            locked: false,
            isEditing: isEd,
            isModified: curId !== slotDef.defaultPieceId,
            onClick: `toggleDeckSlotEditor('upgrade', '${sid}')`
          });
        }
        rowCardsHtml += `</div>`;

        const pickerHtml = activeSlotInGroup
          ? renderPickerTray('upgrade', activeSlotInGroup.slotDef.id, activeSlotInGroup.curId, activeSlotInGroup.slotDef.cat, activeSlotInGroup.slotDef.defaultPieceId)
          : '';

        binderGroupsHtml += `
          <div style="margin-bottom:8px; padding:8px; background:rgba(15,23,42,0.35); border-radius:8px; border:1px solid rgba(255,255,255,0.06);">
            <div style="font-size:10.5px; font-weight:bold; color:#e2e8f0; margin-bottom:6px;">${grp.title}</div>
            ${rowCardsHtml}
            ${pickerHtml}
          </div>
        `;
      }

      // 自由追加枠（最大 +4枚）も4枚のカードスロットとして横並び表示
      let customCardsGridHtml = `<div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:6px;">`;
      let activeCustomIndex = null;
      for (let i = 0; i < CUSTOM_DECK_SLOTS_COUNT; i++) {
        const curId = co.deck.customSlots[i] || '';
        const isEd = editingSlot && editingSlot.type === 'custom' && editingSlot.id === i;
        if (isEd) activeCustomIndex = i;
        if (curId && PIECE_MAP[curId]) {
          customCardsGridHtml += renderBinderCard(curId, {
            locked: false,
            isEditing: isEd,
            isModified: true,
            onClick: `toggleDeckSlotEditor('custom', ${i})`
          });
        } else {
          customCardsGridHtml += `
            <div onclick="toggleDeckSlotEditor('custom', ${i})" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:6px 4px; border-radius:8px; background:${isEd ? 'rgba(245,158,11,0.18)' : 'rgba(15,23,42,0.4)'}; border:1.5px dashed ${isEd ? '#f59e0b' : 'rgba(56,189,248,0.45)'}; min-height:84px; cursor:pointer;">
              <i class="ph-bold ph-plus-circle" style="font-size:18px; color:${isEd ? '#fde047' : '#38bdf8'}; margin-bottom:3px;"></i>
              <div style="font-size:9.5px; font-weight:bold; color:${isEd ? '#fde047' : '#bae6fd'};">＋ 追加</div>
            </div>
          `;
        }
      }
      customCardsGridHtml += `</div>`;
      const customPickerHtml = (activeCustomIndex !== null)
        ? renderPickerTray('custom', activeCustomIndex, co.deck.customSlots[activeCustomIndex] || '', null, null)
        : '';

      // 3. 新規ピース技術開発リスト (10種)
      const rdPieces = PIECE_LIB.filter(p => p.unlockCost > 0);
      const unlockedRdCount = rdPieces.filter(p => isPieceUnlocked(p.id)).length;
      let rdListHtml = '';
      for (const p of rdPieces) {
        const owned = isPieceUnlocked(p.id);
        const canAfford = GameState.funds >= p.unlockCost;
        const cells = countCellsInShape(p.shape);
        const perCell = (p.cost / cells).toFixed(1);
        const actionBtn = owned
          ? `<span style="font-size:10px; font-weight:bold; padding:5px 8px; border-radius:5px; background:rgba(16,185,129,0.2); border:1px solid rgba(16,185,129,0.4); color:#34d399; white-space:nowrap;"><i class="ph-bold ph-check"></i> 開発済</span>`
          : `<button class="btn ${canAfford ? 'btn-primary' : 'btn-slate'}" ${canAfford ? '' : 'disabled'} onclick="unlockPiece('${p.id}')" style="padding:6px 10px; font-size:11px; font-weight:bold; cursor:${canAfford ? 'pointer' : 'not-allowed'}; opacity:${canAfford ? '1' : '0.5'}; white-space:nowrap;"><i class="ph-bold ph-flask"></i> 開発 (${p.unlockCost}万)</button>`;

        rdListHtml += `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 10px; background:rgba(15,23,42,0.45); border:1px solid ${owned ? 'rgba(16,185,129,0.28)' : 'rgba(255,255,255,0.08)'}; border-radius:7px; margin-bottom:6px; gap:8px;">
            <div style="display:flex; align-items:center; gap:9px; flex:1; min-width:0;">
              <div style="min-width:38px; display:flex; justify-content:center; align-items:center; background:rgba(15,23,42,0.6); padding:5px; border-radius:6px; border:1px solid rgba(255,255,255,0.06);">
                ${renderMiniPieceShape(p, 9)}
              </div>
              <div style="min-width:0; flex:1;">
                <div style="display:flex; align-items:center; gap:5px; flex-wrap:wrap;">
                  <span style="font-size:12px; font-weight:bold; color:var(--c-text);">${p.name}</span>
                  <span style="font-size:9px; padding:1px 5px; border-radius:4px; background:rgba(59,130,246,0.18); color:#93c5fd; border:1px solid rgba(59,130,246,0.3);">${catNameMap[p.cat] || ''}・${cells}マス</span>
                </div>
                <div style="font-size:10px; color:var(--c-emerald); font-weight:bold; margin-top:2px;">
                  原価 ${p.cost.toFixed(1)}万 <span style="color:#38bdf8; font-weight:normal;">(${perCell}万/マス)</span>
                </div>
              </div>
            </div>
            <div style="flex-shrink:0;">${actionBtn}</div>
          </div>
        `;
      }

      deckContent.innerHTML = `
        <!-- 現在の山札デッキヘッダー -->
        <div style="background:#1e293b; border:1px solid rgba(255,255,255,0.12); border-radius:8px; padding:9px 12px; margin-bottom:10px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <div style="display:flex; align-items:baseline; gap:8px;">
              <span style="font-size:11px; color:var(--c-text2); font-weight:bold;">山札構成</span>
              <span style="font-size:15px; font-weight:900; color:var(--c-amber-lt);">計 ${totalCards} 枚</span>
            </div>
            <button class="btn btn-slate" onclick="resetDeckToDefault()" style="padding:4px 8px; font-size:10px; cursor:pointer;">
              <i class="ph-bold ph-arrow-counter-clockwise"></i> リセット
            </button>
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:5px; font-size:10px;">
            <span style="padding:2px 6px; border-radius:4px; background:rgba(59,130,246,0.18); color:#93c5fd;">居室 ${catCounts[T.ROOM]}</span>
            <span style="padding:2px 6px; border-radius:4px; background:rgba(148,163,184,0.2); color:#cbd5e1;">廊下 ${catCounts[T.CORRIDOR]}</span>
            <span style="padding:2px 6px; border-radius:4px; background:rgba(245,158,11,0.18); color:#fcd34d;">LDK ${catCounts[T.LDK]}</span>
            <span style="padding:2px 6px; border-radius:4px; background:rgba(16,185,129,0.18); color:#6ee7b7;">水回り ${catCounts.wet}</span>
            <span style="padding:2px 6px; border-radius:4px; background:rgba(168,85,247,0.18); color:#d8b4fe;">収納 ${catCounts[T.CLOSET]}</span>
          </div>
        </div>

        <!-- ビジュアル・カードバインダー（基本20枚） -->
        <div style="background:var(--c-surface2); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:10px 10px 2px; margin-bottom:10px;">
          <div style="font-size:12px; font-weight:bold; color:var(--c-amber-lt); margin-bottom:8px; display:flex; align-items:center; gap:5px;">
            <i class="ph-bold ph-cards"></i> 基本デッキ (20枚)
          </div>
          ${binderGroupsHtml}
        </div>

        <!-- 自由追加カード枠（最大 +4枚） -->
        <div style="background:var(--c-surface2); border:1px solid rgba(56,189,248,0.25); border-radius:8px; padding:10px; margin-bottom:12px;">
          <div style="font-size:12px; font-weight:bold; color:#38bdf8; margin-bottom:8px; display:flex; align-items:center; gap:5px;">
            <i class="ph-bold ph-plus-square"></i> 追加枠（最大 +4枚）
          </div>
          ${customCardsGridHtml}
          ${customPickerHtml}
        </div>

        <!-- 新規ピース技術開発 (R&D 10種) -->
        <div style="background:var(--c-surface2); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:11px 12px; margin-bottom:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div style="font-size:12.5px; font-weight:bold; color:var(--c-emerald); display:flex; align-items:center; gap:5px;">
              <i class="ph-bold ph-flask"></i> ピース開発
            </div>
            <span style="font-size:10px; font-weight:bold; color:#6ee7b7;">${unlockedRdCount} / ${rdPieces.length}</span>
          </div>
          ${rdListHtml}
        </div>
      `;
    }
  }

  function toggleDeckSlotEditor(type, id) {
    initAudio();
    playSound('rotate');
    if (!type || (window.activeDeckEditingSlot && window.activeDeckEditingSlot.type === type && window.activeDeckEditingSlot.id === id)) {
      window.activeDeckEditingSlot = null;
    } else {
      window.activeDeckEditingSlot = { type, id };
    }
    renderCompanyUpgradeUI();
  }
  window.toggleDeckSlotEditor = toggleDeckSlotEditor;

  function unlockPiece(pieceId) {
    initAudio();
    ensureDeckState();
    const p = PIECE_MAP[pieceId];
    if (!p || !p.unlockCost) return;
    if (isPieceUnlocked(pieceId)) return;
    if (GameState.funds < p.unlockCost) {
      playSound('error');
      showUpgradeFeedback('技術開発のための所持資金が足りません！', 'var(--c-rose)');
      return;
    }
    GameState.funds = Math.round((GameState.funds - p.unlockCost) * 10) / 10;
    GameState.company.unlockedPieces.push(pieceId);
    playSound('clear');
    showUpgradeFeedback(`🔬 新ピース「${p.name}」を開発しました！上のカードをタップしてデッキに編成できます！`, 'var(--c-emerald)');
    saveGame();
    renderCompanyUpgradeUI();
    updateHomeUI();

    const deadEnd = checkDeadEndBankruptcy();
    if (deadEnd.isBankrupt) {
      closeCompanyUpgradeModal();
      showGameOverModal(deadEnd.reason);
    } else if (GameState.funds < MIN_BUILD_FUNDS) {
      showUpgradeFeedback(`💡 建築資金が${MIN_BUILD_FUNDS}万円未満になりました。「🏦 銀行」タブから運転資金を借り入れできます！`, 'var(--c-rose)');
    }
  }

  function setDeckSlotOverride(slotId, pieceId) {
    initAudio();
    ensureDeckState();
    const slot = UPGRADE_DECK_SLOTS.find(s => s.id === slotId);
    if (!slot) return;
    const p = PIECE_MAP[pieceId];
    if (!p || p.cat !== slot.cat || !isPieceUnlocked(pieceId)) return;
    if (pieceId === slot.defaultPieceId) {
      delete GameState.company.deck.slotOverrides[slotId];
    } else {
      GameState.company.deck.slotOverrides[slotId] = pieceId;
    }
    window.activeDeckEditingSlot = null;
    playSound('place');
    showUpgradeFeedback(`🃏 デッキのカードを「${p.name}」に入れ替えました！`, 'var(--c-emerald)');
    saveGame();
    renderCompanyUpgradeUI();
    updateHomeUI();
  }

  function setDeckCustomSlot(index, pieceId) {
    initAudio();
    ensureDeckState();
    if (index < 0 || index >= CUSTOM_DECK_SLOTS_COUNT) return;
    if (!pieceId) {
      GameState.company.deck.customSlots[index] = null;
      window.activeDeckEditingSlot = null;
      playSound('rotate');
      showUpgradeFeedback(`🃏 追加枠${index + 1} を空枠にしました（現在デッキ ${getActiveDeckPieceIds().length}枚）`, 'var(--c-text2)');
    } else {
      const p = PIECE_MAP[pieceId];
      if (!p || !isPieceUnlocked(pieceId)) return;
      GameState.company.deck.customSlots[index] = pieceId;
      window.activeDeckEditingSlot = null;
      playSound('place');
      showUpgradeFeedback(`🃏 追加枠${index + 1} に「${p.name}」を編成しました（現在デッキ ${getActiveDeckPieceIds().length}枚）`, 'var(--c-emerald)');
    }
    saveGame();
    renderCompanyUpgradeUI();
    updateHomeUI();
  }

  function resetDeckToDefault() {
    initAudio();
    ensureDeckState();
    GameState.company.deck = {
      slotOverrides: {},
      customSlots: [null, null, null, null]
    };
    window.activeDeckEditingSlot = null;
    playSound('rotate');
    showUpgradeFeedback('🃏 デッキ編成を初期の20枚構成にリセットしました', 'var(--c-emerald)');
    saveGame();
    renderCompanyUpgradeUI();
    updateHomeUI();
  }

  function borrowLoan(amount) {
    initAudio();
    if (!GameState.company) return;
    if ((GameState.company.emergencyDebt || 0) > 0) {
      playSound('error');
      showUpgradeFeedback('🚫 街金からの借入が残っているため、信用審査で銀行から融資を受けられません！', 'var(--c-rose)');
      return;
    }
    const remCap = getRemainingLoanCapacity();
    const borrowAmt = Math.min(Number(amount) || 0, remCap);
    if (borrowAmt <= 0) {
      playSound('error');
      showUpgradeFeedback('融資限度額に達しているため、これ以上借り入れできません！', 'var(--c-rose)');
      return;
    }
    GameState.company.debt = Math.round(((GameState.company.debt || 0) + borrowAmt) * 10) / 10;
    GameState.funds = Math.round((GameState.funds + borrowAmt) * 10) / 10;
    playSound('clear');
    showUpgradeFeedback(`🏦 銀行から ${borrowAmt.toFixed(1)}万円 の融資を受けました！`, 'var(--c-emerald)');
    saveGame();
    renderCompanyUpgradeUI();
    updateHomeUI();
  }

  function repayLoan(amount) {
    initAudio();
    if (!GameState.company) return;
    const debt = GameState.company.debt || 0;
    if (debt <= 0) return;
    let repayAmt = amount === 'all' ? Math.min(GameState.funds, debt) : Math.min(Number(amount) || 0, debt);
    repayAmt = Math.round(repayAmt * 10) / 10;
    if (repayAmt <= 0 || GameState.funds < repayAmt) {
      playSound('error');
      showUpgradeFeedback('返済するための所持資金が足りません！', 'var(--c-rose)');
      return;
    }
    GameState.funds = Math.max(0, Math.round((GameState.funds - repayAmt) * 10) / 10);
    GameState.company.debt = Math.max(0, Math.round((debt - repayAmt) * 10) / 10);
    playSound('clear');
    if (GameState.company.debt === 0) {
      showUpgradeFeedback(`🎉 銀行からの借入金を全額完済しました！`, 'var(--c-emerald)');
    } else {
      showUpgradeFeedback(`💸 借入金を ${repayAmt.toFixed(1)}万円 繰上返済しました（残債 ${GameState.company.debt.toFixed(1)}万）`, 'var(--c-emerald)');
    }
    saveGame();
    renderCompanyUpgradeUI();
    updateHomeUI();

    const deadEnd = checkDeadEndBankruptcy();
    if (deadEnd.isBankrupt) {
      closeCompanyUpgradeModal();
      showGameOverModal(deadEnd.reason);
    }
  }

  function borrowEmergencyLoan(amount) {
    initAudio();
    if (!GameState.company) return;
    const curDebt = GameState.company.emergencyDebt || 0;
    const maxEmerg = 50.0;
    const borrowCash = Math.min(Number(amount) || 0, Math.max(0, maxEmerg - curDebt));
    if (borrowCash <= 0) {
      playSound('error');
      showUpgradeFeedback('街金の借入限度額（50万円）に達しています！', 'var(--c-rose)');
      return;
    }
    // 街金即時手数料 10%: 手元に入る資金は borrowCash だが、借入残債には1.1倍が加算される
    const addedDebt = Math.round(borrowCash * 1.10 * 10) / 10;
    GameState.company.emergencyDebt = Math.round((curDebt + addedDebt) * 10) / 10;
    GameState.funds = Math.round((GameState.funds + borrowCash) * 10) / 10;
    budget = Math.round((budget + borrowCash) * 10) / 10;
    updateBudgetUI();
    playSound('coin');
    closeEmergencyLoanModal();
    showFloatingText(`+${borrowCash.toFixed(1)}万（街金・手数料込残債+${addedDebt.toFixed(1)}万）`, 'var(--c-amber)');
    saveGame();
    updateHomeUI();
  }

  function repayEmergencyLoan(amount) {
    initAudio();
    if (!GameState.company) return;
    const debt = GameState.company.emergencyDebt || 0;
    if (debt <= 0) return;
    let repayAmt = amount === 'all' ? Math.min(GameState.funds, debt) : Math.min(Number(amount) || 0, debt);
    repayAmt = Math.round(repayAmt * 10) / 10;
    if (repayAmt <= 0 || GameState.funds < repayAmt) {
      playSound('error');
      showUpgradeFeedback('返済するための所持資金が足りません！', 'var(--c-rose)');
      return;
    }
    GameState.funds = Math.max(0, Math.round((GameState.funds - repayAmt) * 10) / 10);
    GameState.company.emergencyDebt = Math.max(0, Math.round((debt - repayAmt) * 10) / 10);
    playSound('clear');
    if (GameState.company.emergencyDebt === 0) {
      showUpgradeFeedback(`🎉 街金・緊急融資を全額完済しました！重い利息から解放されました！`, 'var(--c-emerald)');
    } else {
      showUpgradeFeedback(`💸 街金に ${repayAmt.toFixed(1)}万円 返済しました（残債 ${GameState.company.emergencyDebt.toFixed(1)}万）`, 'var(--c-emerald)');
    }
    saveGame();
    renderCompanyUpgradeUI();
    updateHomeUI();
  }

  function showEmergencyLoanPrompt(deficit = 0) {
    const modal = document.getElementById('emergency-loan-modal');
    if (!modal) return;
    const curDebt = (GameState.company && GameState.company.emergencyDebt) || 0;
    const maxEmerg = 50.0;
    const remCapacity = Math.max(0, maxEmerg - curDebt);

    const deficitEl = document.getElementById('emerg-deficit-val');
    if (deficitEl) deficitEl.textContent = Math.max(0.1, deficit).toFixed(1);

    const debtEl = document.getElementById('emerg-current-debt');
    if (debtEl) debtEl.textContent = `${curDebt.toFixed(1)}万円`;

    const btn10 = document.getElementById('btn-borrow-emerg-10');
    if (btn10) {
      const can10 = remCapacity >= 10;
      btn10.disabled = !can10;
      btn10.style.opacity = can10 ? '1' : '0.4';
      btn10.style.cursor = can10 ? 'pointer' : 'not-allowed';
    }

    const btn20 = document.getElementById('btn-borrow-emerg-20');
    if (btn20) {
      const can20 = remCapacity >= 20;
      btn20.disabled = !can20;
      btn20.style.opacity = can20 ? '1' : '0.4';
      btn20.style.cursor = can20 ? 'pointer' : 'not-allowed';
    }

    modal.style.display = 'flex';
  }

  function closeEmergencyLoanModal() {
    const modal = document.getElementById('emergency-loan-modal');
    if (modal) modal.style.display = 'none';
  }

  function showGameOverModal(reason) {
    const modal = document.getElementById('gameover-modal');
    if (!modal) return;
    playSound('error');
    const nameEl = document.getElementById('go-company-name');
    const reasonEl = document.getElementById('go-reason-box');
    const monthsEl = document.getElementById('go-months');
    const propsEl = document.getElementById('go-props');
    const fundsEl = document.getElementById('go-funds');
    const debtEl = document.getElementById('go-debt');

    if (nameEl) nameEl.textContent = GameState.companyName || '焼飯不動産';
    if (reasonEl && reason) reasonEl.textContent = reason;
    if (monthsEl) monthsEl.textContent = `全 ${GameState.month || 1} ヶ月（クリア案件 ${GameState.level || 0} 件）`;
    if (propsEl) propsEl.textContent = `${(GameState.properties || []).length} 棟`;
    if (fundsEl) fundsEl.textContent = `${(GameState.funds || 0).toFixed(1)} 万`;
    if (debtEl) debtEl.textContent = `${(GameState.company?.debt || 0).toFixed(1)} 万`;

    modal.style.display = 'flex';
  }

  function openResetConfirmModal() {
    initAudio();
    playSound('tap');
    const modal = document.getElementById('reset-confirm-modal');
    if (modal) modal.style.display = 'flex';
  }

  function closeResetConfirmModal() {
    initAudio();
    playSound('tap');
    const modal = document.getElementById('reset-confirm-modal');
    if (modal) modal.style.display = 'none';
  }

  function resetGameFull() {
    initAudio();
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch(e) {}
    GameState.companyName = '焼飯不動産';
    GameState.hasNamedCompany = false;
    GameState.hasCleared = false;
    GameState.clearedMonth = null;
    GameState.funds = 100.0;
    GameState.lastFunds = 100.0;
    GameState.month = 1;
    GameState.level = 0;
    GameState.attempts = 2;
    GameState.currentMission = null;
    GameState.activeBuild = null;
    GameState.properties = [];
    GameState.discovered = { combos: [] };
    GameState.company = {
      salesLevel: 1,
      brandLevel: 1,
      officeLevel: 0,
      deskCount: 0,
      capacityLevel: 0,
      debt: 0,
      emergencyDebt: 0,
      features: { freeFlip: 0, extraRerolls: 0, extraAttempts: 0, handSize: 0 },
      hiredStaff: [],
      recruitment: { status: 'none', candidates: [] },
      unlockedPieces: [...STARTER_UNLOCKED_IDS],
      deck: { slotOverrides: {}, customSlots: [null, null, null, null] }
    };
    GameState.stats = {
      lifetimeClearedMissions: 0,
      lifetimeEarnedRent: 0,
      lifetimeGoodCombos: 0,
      lifetimeBadCombos: 0
    };
    STAGE = null;
    currentLevelIdx = 0;
    window.pendingSalaryNegMonth = null;
    window.dismissConfirmingStaffId = null;
    window.replacingCandidateId = null;
    window.activeDeckEditingSlot = null;
    window.activeFlyerBreakdownKey = null;
    window.activePdBreakdownKey = null;
    window.currentDetailProp = null;
    window.currentViewerProp = null;

    ensureDeckState();
    ensureGameState();
    GameState.availableMissions = generateMissionPool(0);
    saveGame();

    [
      'gameover-modal',
      'reset-confirm-modal',
      'modal-help',
      'company-upgrade-modal',
      'modal-records',
      'modal-ending',
      'prop-detail-modal',
      'plan-viewer-modal',
      'capacity-alert-modal',
      'month-end-modal',
      'emergency-loan-modal'
    ].forEach(id => {
      const m = document.getElementById(id);
      if (m) m.style.display = 'none';
    });

    playSound('clear');
    updateCompanyUI();
    updateHomeUI();
    showScreen('home');
    openCompanyNameModal(true);
  }

  function buyCompanyUpgrade(type, key) {
    initAudio();
    ensureDeckState();
    const co = GameState.company;
    const curOfficeDef = UPGRADE_CONFIG.office[co.officeLevel || 0] || UPGRADE_CONFIG.office[0];
    let triggeredEnding = false;

    if (type === 'office') {
      const curLevel = co.officeLevel || 0;
      if (curLevel >= UPGRADE_CONFIG.office.length - 1) return;
      const nextDef = UPGRADE_CONFIG.office[curLevel + 1];
      const effCost = getOfficeUpgradeCost(curLevel + 1);
      if (GameState.funds < effCost) {
        playSound('error');
        showUpgradeFeedback('所持資金が足りません！', 'var(--c-rose)');
        return;
      }
      GameState.funds = Math.round((GameState.funds - effCost) * 10) / 10;
      co.officeLevel++;
      playSound('clear');
      showUpgradeFeedback(`🏢 本社オフィスを「Rank ${co.officeLevel + 1} ${nextDef.name}」へ移転しました！各機能の上限が拡張されました！`, 'var(--c-emerald)');
      if (co.officeLevel >= UPGRADE_CONFIG.office.length - 1 && !GameState.hasCleared) {
        GameState.hasCleared = true;
        GameState.clearedMonth = GameState.month || 1;
        triggeredEnding = true;
      }
    } else if (type === 'desk') {
      const curDesks = co.deskCount || 0;
      if (curDesks >= UPGRADE_CONFIG.desks.length) return;
      if (curDesks >= curOfficeDef.maxDesks) {
        playSound('error');
        showUpgradeFeedback('現在のオフィスではこれ以上デスクを増やせません！本社オフィスを移転してください。', 'var(--c-rose)');
        return;
      }
      const deskDef = UPGRADE_CONFIG.desks[curDesks];
      if (GameState.funds < deskDef.cost) {
        playSound('error');
        showUpgradeFeedback('所持資金が足りません！', 'var(--c-rose)');
        return;
      }
      GameState.funds = Math.round((GameState.funds - deskDef.cost) * 10) / 10;
      co.deskCount = curDesks + 1;
      playSound('clear');
      showUpgradeFeedback(`🪑 「${deskDef.name}」を設置しました！（雇用枠 ${co.deskCount}席）`, 'var(--c-emerald)');
    } else if (type === 'capacity') {
      const curCapLv = co.capacityLevel || 0;
      if (curCapLv >= UPGRADE_CONFIG.capacity.length - 1) return;
      if (curCapLv >= curOfficeDef.maxCapacityLevel) {
        playSound('error');
        showUpgradeFeedback('現在のオフィスではこれ以上の上位管理システムを運用できません！本社オフィスを移転してください。', 'var(--c-rose)');
        return;
      }
      const nextCapDef = UPGRADE_CONFIG.capacity[curCapLv + 1];
      if (GameState.funds < nextCapDef.cost) {
        playSound('error');
        showUpgradeFeedback('所持資金が足りません！', 'var(--c-rose)');
        return;
      }
      GameState.funds = Math.round((GameState.funds - nextCapDef.cost) * 10) / 10;
      co.capacityLevel = curCapLv + 1;
      playSound('clear');
      showUpgradeFeedback(`📂 「${nextCapDef.name}」を導入しました！（基本管理枠 ${nextCapDef.capacity}棟）`, 'var(--c-emerald)');
    } else if (type === 'sales') {
      const curLevel = co.salesLevel || 1;
      if (curLevel >= UPGRADE_CONFIG.sales.length) return;
      if (curLevel >= curOfficeDef.maxSalesLevel) {
        playSound('error');
        showUpgradeFeedback('オフィスランクの上限に達しています！本社オフィスを移転してください。', 'var(--c-rose)');
        return;
      }
      const nextDef = UPGRADE_CONFIG.sales[curLevel];
      if (GameState.funds < nextDef.cost) {
        playSound('error');
        showUpgradeFeedback('所持資金が足りません！', 'var(--c-rose)');
        return;
      }
      GameState.funds = Math.round((GameState.funds - nextDef.cost) * 10) / 10;
      co.salesLevel++;
      playSound('clear');
      showUpgradeFeedback(`✨ 営業力 Lv.${co.salesLevel}（${nextDef.name}）へ強化しました！`, 'var(--c-emerald)');
    } else if (type === 'brand') {
      const curLevel = co.brandLevel || 1;
      if (curLevel >= UPGRADE_CONFIG.brand.length) return;
      if (curLevel >= curOfficeDef.maxBrandLevel) {
        playSound('error');
        showUpgradeFeedback('オフィスランクの上限に達しています！本社オフィスを移転してください。', 'var(--c-rose)');
        return;
      }
      const nextDef = UPGRADE_CONFIG.brand[curLevel];
      if (GameState.funds < nextDef.cost) {
        playSound('error');
        showUpgradeFeedback('所持資金が足りません！', 'var(--c-rose)');
        return;
      }
      GameState.funds = Math.round((GameState.funds - nextDef.cost) * 10) / 10;
      co.brandLevel++;
      playSound('clear');
      showUpgradeFeedback(`✨ ブランド知名度 Lv.${co.brandLevel}（${nextDef.name}）へ強化しました！`, 'var(--c-emerald)');
    } else if (type === 'feature') {
      const featGroup = UPGRADE_CONFIG.features[key];
      if (!featGroup || !featGroup.levels) return;
      const curLv = getFeatureLevel(key);
      const maxLv = featGroup.levels.length - 1;
      if (curLv >= maxLv) return;
      const nextLvDef = featGroup.levels[curLv + 1];
      const curOfficeLv = co.officeLevel || 0;
      if (curOfficeLv < (nextLvDef.reqOfficeLevel || 0)) {
        playSound('error');
        showUpgradeFeedback('オフィスランクが不足しています！本社オフィスを移転してください。', 'var(--c-rose)');
        return;
      }
      if (GameState.funds < nextLvDef.cost) {
        playSound('error');
        showUpgradeFeedback('所持資金が足りません！', 'var(--c-rose)');
        return;
      }
      GameState.funds = Math.round((GameState.funds - nextLvDef.cost) * 10) / 10;
      co.features[key] = curLv + 1;
      if (key === 'extraAttempts') {
        GameState.attempts = getMaxAttempts();
      }
      if (key === 'handSize') {
        const targetSlots = getMaxHandSlots();
        while (draftSlots.length < targetSlots) {
          draftSlots.push(drawPieceFromDeck());
          keepStates.push(false);
          keepCounts.push(0);
        }
        if (GameState.activeBuild && Array.isArray(GameState.activeBuild.draftSlots)) {
          while (GameState.activeBuild.draftSlots.length < targetSlots) {
            GameState.activeBuild.draftSlots.push(drawPieceFromDeck());
            if (Array.isArray(GameState.activeBuild.keepStates)) GameState.activeBuild.keepStates.push(false);
            if (Array.isArray(GameState.activeBuild.keepCounts)) GameState.activeBuild.keepCounts.push(0);
          }
          GameState.activeBuild.drawPile = drawPile;
          GameState.activeBuild.discardPile = discardPile;
        }
        if (screens.game?.classList.contains('active')) {
          renderDraftUI();
        }
      }
      if (key === 'freeFlip') {
        updateMirrorButton();
      }
      playSound('clear');
      showUpgradeFeedback(`✨ 設備投資「${featGroup.name} Lv.${co.features[key]}（${nextLvDef.name}）」を導入しました！`, 'var(--c-emerald)');
    }

    saveGame();
    renderCompanyUpgradeUI();
    updateHomeUI();

    if (triggeredEnding) {
      closeCompanyUpgradeModal();
      setTimeout(() => {
        openEndingModal();
      }, 350);
      return;
    }

    const deadEnd = checkDeadEndBankruptcy();
    if (deadEnd.isBankrupt) {
      closeCompanyUpgradeModal();
      showGameOverModal(deadEnd.reason);
    } else if (GameState.funds < MIN_BUILD_FUNDS) {
      showUpgradeFeedback(`💡 建築資金が${MIN_BUILD_FUNDS}万円未満になりました。「🏦 銀行融資」タブから運転資金を借り入れできます！`, 'var(--c-rose)');
    }
  }

  function postJobAd() {
    initAudio();
    if (!GameState?.company) return;
    const co = GameState.company;
    const maxSlots = getMaxStaffSlots();
    if (maxSlots === 0) {
      playSound('error');
      showUpgradeFeedback('デスクがありません。「執務デスク増設」でスロットを増設してください！', 'var(--c-rose)');
      return;
    }
    const adCost = getRecruitAdCost(co.hiredStaff?.length || 0);
    if (GameState.funds < adCost) {
      playSound('error');
      showUpgradeFeedback(`資金不足です！（掲載費: ${adCost}万円）`, 'var(--c-rose)');
      return;
    }
    GameState.funds = Math.round((GameState.funds - adCost) * 10) / 10;
    if (!co.recruitment) co.recruitment = { status: 'none', candidates: [] };
    co.recruitment.status = 'posted';
    window.replacingCandidateId = null;
    playSound('clear');
    showUpgradeFeedback(`📢 求人広告を掲載しました（-${adCost}万）。来月応募者が届きます！`, 'var(--c-emerald)');
    saveGame();
    renderCompanyUpgradeUI();
    updateHomeUI();
  }

  function scoutImmediately() {
    initAudio();
    if (!GameState?.company) return;
    const co = GameState.company;
    const maxSlots = getMaxStaffSlots();
    if (maxSlots === 0) {
      playSound('error');
      showUpgradeFeedback('デスクがありません。「執務デスク増設」でスロットを増設してください！', 'var(--c-rose)');
      return;
    }
    const scoutCost = getRecruitScoutCost(co.hiredStaff?.length || 0);
    if (GameState.funds < scoutCost) {
      playSound('error');
      showUpgradeFeedback(`資金不足です！（即時スカウト費: ${scoutCost}万円）`, 'var(--c-rose)');
      return;
    }
    GameState.funds = Math.round((GameState.funds - scoutCost) * 10) / 10;
    if (!co.recruitment) co.recruitment = { status: 'none', candidates: [] };
    co.recruitment.status = 'active';
    co.recruitment.candidates = generateCandidateBatch(3, co.officeLevel || 1);
    window.replacingCandidateId = null;
    playSound('clear');
    showUpgradeFeedback(`⚡ 人材紹介エージェントから応募者3名が到着しました！（-${scoutCost}万）`, 'var(--c-emerald)');
    saveGame();
    renderCompanyUpgradeUI();
    updateHomeUI();
  }

  function stopJobAd() {
    initAudio();
    if (!GameState?.company?.recruitment) return;
    GameState.company.recruitment.status = 'none';
    GameState.company.recruitment.candidates = [];
    window.replacingCandidateId = null;
    playSound('tap');
    showUpgradeFeedback('📢 求人掲載を停止しました（来月以降の維持費はかかりません）', 'var(--c-text2)');
    saveGame();
    renderCompanyUpgradeUI();
    updateHomeUI();
  }

  function startReplaceCandidate(candId) {
    initAudio();
    window.replacingCandidateId = (window.replacingCandidateId === candId) ? null : candId;
    playSound('tap');
    renderCompanyUpgradeUI();
  }

  function cancelReplaceCandidate() {
    initAudio();
    window.replacingCandidateId = null;
    playSound('tap');
    renderCompanyUpgradeUI();
  }

  function replaceHireCandidate(candId, targetStaffId) {
    initAudio();
    if (!GameState?.company) return;
    const co = GameState.company;
    if (!co.hiredStaff) co.hiredStaff = [];
    const candIdx = co.recruitment?.candidates?.findIndex(c => c.id === candId);
    const staffIdx = co.hiredStaff.findIndex(s => s.id === targetStaffId);
    if (candIdx === -1 || candIdx === undefined || staffIdx === -1) return;

    const cand = co.recruitment.candidates[candIdx];
    const oldStaff = co.hiredStaff[staffIdx];

    co.hiredStaff[staffIdx] = {
      id: cand.id,
      name: cand.name,
      avatar: cand.avatar,
      rank: cand.rank,
      rankLabel: cand.rankLabel,
      stars: cand.stars,
      role: cand.role,
      salary: cand.salary,
      skills: cand.skills
    };

    co.recruitment.candidates.splice(candIdx, 1);
    window.replacingCandidateId = null;

    // 満席での入替採用完了後は、意図しない維持費発生を防ぐため求人掲載を自動終了する
    const maxSlots = getMaxStaffSlots();
    if (co.hiredStaff.length >= maxSlots || co.recruitment.candidates.length === 0) {
      co.recruitment.status = 'none';
      co.recruitment.candidates = [];
    }

    playSound('clear');
    showUpgradeFeedback(`🔄 ${oldStaff.name}を解雇し、新たに${cand.name}を迎え入れました！`, 'var(--c-emerald)');
    saveGame();
    renderCompanyUpgradeUI();
    updateHomeUI();
  }

  function hireCandidate(candId) {
    initAudio();
    if (!GameState?.company) return;
    const co = GameState.company;
    const maxSlots = getMaxStaffSlots();
    if (!co.hiredStaff) co.hiredStaff = [];
    if (co.hiredStaff.length >= maxSlots) {
      startReplaceCandidate(candId);
      return;
    }
    const candIdx = co.recruitment?.candidates?.findIndex(c => c.id === candId);
    if (candIdx === -1 || candIdx === undefined) return;
    const cand = co.recruitment.candidates[candIdx];

    co.hiredStaff.push({
      id: cand.id,
      name: cand.name,
      avatar: cand.avatar,
      rank: cand.rank,
      rankLabel: cand.rankLabel,
      stars: cand.stars,
      role: cand.role,
      salary: cand.salary,
      skills: cand.skills
    });

    co.recruitment.candidates.splice(candIdx, 1);
    window.replacingCandidateId = null;

    if (co.hiredStaff.length >= maxSlots || co.recruitment.candidates.length === 0) {
      co.recruitment.status = 'none';
      co.recruitment.candidates = [];
    }

    playSound('clear');
    showUpgradeFeedback(`🤝 ${cand.name}を採用しました！`, 'var(--c-emerald)');
    saveGame();
    renderCompanyUpgradeUI();
    updateHomeUI();
  }

  function startDismissStaff(staffId) {
    initAudio();
    window.dismissConfirmingStaffId = staffId;
    if (dismissConfirmTimer) clearTimeout(dismissConfirmTimer);
    dismissConfirmTimer = setTimeout(() => {
      window.dismissConfirmingStaffId = null;
      renderCompanyUpgradeUI();
    }, 3500);
    renderCompanyUpgradeUI();
  }

  function confirmDismissStaff(staffId) {
    if (dismissConfirmTimer) clearTimeout(dismissConfirmTimer);
    dismissStaff(staffId);
  }

  function dismissStaff(staffId) {
    initAudio();
    if (!GameState.company || !GameState.company.hiredStaff) return;
    const staff = GameState.company.hiredStaff.find(s => s.id === staffId);
    const staffName = staff ? staff.name : 'スタッフ';
    GameState.company.hiredStaff = GameState.company.hiredStaff.filter(s => s.id !== staffId);
    window.dismissConfirmingStaffId = null;
    playSound('tap');
    showUpgradeFeedback(`👋 ${staffName}を解雇しました`, 'var(--c-text2)');
    saveGame();
    renderCompanyUpgradeUI();
    updateHomeUI();
  }

  window.buyCompanyUpgrade = buyCompanyUpgrade;
  window.postJobAd = postJobAd;
  window.scoutImmediately = scoutImmediately;
  window.stopJobAd = stopJobAd;
  window.startReplaceCandidate = startReplaceCandidate;
  window.cancelReplaceCandidate = cancelReplaceCandidate;
  window.replaceHireCandidate = replaceHireCandidate;
  window.hireCandidate = hireCandidate;
  window.startDismissStaff = startDismissStaff;
  window.confirmDismissStaff = confirmDismissStaff;
  window.dismissStaff = dismissStaff;
  window.borrowLoan = borrowLoan;
  window.repayLoan = repayLoan;
  window.borrowEmergencyLoan = borrowEmergencyLoan;
  window.repayEmergencyLoan = repayEmergencyLoan;
  window.unlockPiece = unlockPiece;
  window.setDeckSlotOverride = setDeckSlotOverride;
  window.setDeckCustomSlot = setDeckCustomSlot;
  window.resetDeckToDefault = resetDeckToDefault;

  // Company Upgrade Modal Events
  document.getElementById('btn-open-upgrade')?.addEventListener('click', () => openCompanyUpgradeModal('company'));
  document.getElementById('btn-close-upgrade')?.addEventListener('click', closeCompanyUpgradeModal);
  document.getElementById('company-upgrade-modal')?.addEventListener('pointerdown', (e) => {
    if (e.target.id === 'company-upgrade-modal') closeCompanyUpgradeModal();
  });
  document.getElementById('tab-upg-company')?.addEventListener('click', () => {
    initAudio();
    switchUpgradeTab('company');
  });
  document.getElementById('tab-upg-deck')?.addEventListener('click', () => {
    initAudio();
    switchUpgradeTab('deck');
  });
  document.getElementById('tab-upg-staff')?.addEventListener('click', () => {
    initAudio();
    switchUpgradeTab('staff');
  });
  document.getElementById('tab-upg-bank')?.addEventListener('click', () => {
    initAudio();
    switchUpgradeTab('bank');
  });
  document.getElementById('btn-gameover-reset')?.addEventListener('click', resetGameFull);
  document.getElementById('btn-open-reset-confirm')?.addEventListener('click', openResetConfirmModal);
  document.getElementById('btn-close-reset-confirm')?.addEventListener('click', closeResetConfirmModal);
  document.getElementById('btn-reset-cancel')?.addEventListener('click', closeResetConfirmModal);
  document.getElementById('btn-reset-execute')?.addEventListener('click', resetGameFull);
  document.getElementById('reset-confirm-modal')?.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'reset-confirm-modal') closeResetConfirmModal();
  });

function updateHomeUI() {
    ensureDeckState();
    const debt = GameState.company.debt || 0;
    const emergDebt = GameState.company.emergencyDebt || 0;
    const nameEl = document.getElementById('home-co-name');
    if (nameEl) nameEl.textContent = GameState.companyName || '焼飯不動産';
    const curM = GameState.month || 1;
    const monthInYear = ((curM - 1) % 12) + 1;
    const curYear = Math.floor((curM - 1) / 12) + 1;
    const calEl = document.getElementById('home-co-calendar');
    if (calEl) calEl.textContent = `${curYear}年目 ${monthInYear}月`;
    let debtHtml = '';
    if (debt > 0) debtHtml += `<div style="font-size:10px; color:var(--c-rose); font-weight:bold; margin-top:2px;">(銀行借入: -${debt.toFixed(1)}万)</div>`;
    if (emergDebt > 0) debtHtml += `<div style="font-size:10px; color:#fb7185; font-weight:bold; margin-top:1px;">(街金: -${emergDebt.toFixed(1)}万 / 月利10%)</div>`;
    document.getElementById('home-co-funds').innerHTML = `${GameState.funds.toFixed(1)}<span class="stat-unit">万</span>` + debtHtml;
    
    // Company Badges (Rankのみシンプルに表示)
    const activeCount = getActivePropertyCount();
    const maxCap = getMaxPropertyCapacity();
    const isAtCap = activeCount >= maxCap;

    const badgesEl = document.getElementById('home-co-badges');
    if (badgesEl) {
      const curOfficeLv = GameState.company.officeLevel || 0;
      const curOfficeDef = UPGRADE_CONFIG.office[curOfficeLv] || UPGRADE_CONFIG.office[0];
      let badgeHtml = `
        <button id="btn-home-office-badge" type="button" class="btn" title="タップで会社強化を開く" style="font-size:11.5px; background:#fef3c7; color:#b45309; border:1px solid #fde68a; padding:4px 10px; border-radius:12px; font-weight:bold; display:inline-flex; align-items:center; gap:4px; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,0.06); line-height:1.2;">
          <i class="ph-bold ph-buildings"></i>Rank ${curOfficeLv + 1} ${curOfficeDef.name}
        </button>
      `;
      if (GameState.hasCleared) {
        badgeHtml += `
          <button id="btn-home-ending-badge" type="button" class="btn" title="タップで表彰状を見る" style="font-size:11.5px; background:linear-gradient(135deg,#f59e0b,#d97706); color:#fff; border:1px solid #fbbf24; padding:4px 10px; border-radius:12px; font-weight:bold; display:inline-flex; align-items:center; gap:4px; cursor:pointer; box-shadow:0 1px 3px rgba(245,158,11,0.35); line-height:1.2; animation: badgePulse 2s infinite;">
            🏆 表彰状
          </button>
        `;
      }
      badgesEl.innerHTML = badgeHtml;

      const officeBtn = document.getElementById('btn-home-office-badge');
      if (officeBtn) {
        officeBtn.onclick = (e) => {
          e.stopPropagation();
          initAudio();
          openCompanyUpgradeModal('company');
        };
      }
      const endingBtn = document.getElementById('btn-home-ending-badge');
      if (endingBtn) {
        endingBtn.onclick = (e) => {
          e.stopPropagation();
          initAudio();
          openEndingModal();
        };
      }
    }

    const recordsBadgeEl = document.getElementById('home-records-badge');
    if (recordsBadgeEl) {
      recordsBadgeEl.textContent = `${getDiscoveredMasterComboCount()}/${COMBO_MASTER_LIST.length}`;
    }

    const capEl = document.getElementById('home-property-capacity');
    if (capEl) {
      if (activeCount > maxCap) {
        capEl.textContent = `${activeCount} / ${maxCap}棟 (超過)`;
        capEl.style.background = '#ffe4e6';
        capEl.style.color = '#be123c';
        capEl.style.border = '1px solid #fecdd3';
      } else if (activeCount === maxCap) {
        capEl.textContent = `${activeCount} / ${maxCap}棟 (満杯)`;
        capEl.style.background = '#fff1f2';
        capEl.style.color = '#e11d48';
        capEl.style.border = '1px solid #fecdd3';
      } else {
        const rem = maxCap - activeCount;
        capEl.textContent = `${activeCount} / ${maxCap}棟 (空き${rem})`;
        capEl.style.background = '#e2e8f0';
        capEl.style.color = '#475569';
        capEl.style.border = 'none';
      }
    }

    const listEl = document.getElementById('property-list');
    listEl.innerHTML = '';
    let totalRent = 0;
    let totalMaint = 0;
    if (!GameState.properties || GameState.properties.length === 0) {
      listEl.innerHTML = '<div style="padding:20px; text-align:center; color:#94a3b8;">所有物件はありません</div>';
    } else {
      GameState.properties.forEach((p, idx) => {
        // フォールバック
        if (!p.id) p.id = Date.now() + idx;
        if (!p.propertyNo) p.propertyNo = (p.level !== undefined ? p.level + 1 : idx + 1);
        if (p.createdMonth === undefined) p.createdMonth = GameState.month - 1;
        if (p.baseRent === undefined) p.baseRent = (p.rent * 0.8) || 0;
        if (p.vacantMonths === undefined) {
          p.vacantMonths = (p.vacancyTurns && p.vacancyTurns > 0) ? p.vacancyTurns : 0;
        }

        const stats = calcPropertyStats(p);
        totalMaint += stats.maintCost;

        let rentDisplay = p.rent;
        if (stats.isVacant) {
          rentDisplay = 0;
        } else {
          totalRent += p.rent;
        }

        const rank = getPropertyRank(stats.degRate);
        const rankStyle = getRankBadgeStyle(rank);
        const color = p.isClear ? 'var(--c-emerald)' : 'var(--c-amber)';
        const propNo = p.propertyNo || (p.level !== undefined ? p.level + 1 : idx + 1);
        const statusBadge = stats.isVacant
          ? `<span style="font-size:10px; background:#ffe4e6; color:#e11d48; padding:2px 6px; border-radius:4px; font-weight:700;">⚠️ 空室${stats.vacantMonths || 1}ヶ月目</span>`
          : (!stats.canSell
            ? `<span style="font-size:10px; background:#f1f5f9; color:#64748b; padding:2px 6px; border-radius:4px; font-weight:700;">🔒売ロック${stats.sellLockRemain}ヶ月</span>`
            : '');
        const thirdMetricHtml = stats.isVacant
          ? `<span style="color:#2563eb; font-weight:700;">入居率 ${stats.fillChance}%</span>`
          : (stats.isOriginal && (stats.barrierMonths || 0) > stats.tenantTenure
            ? `<span style="color:#059669; font-weight:600;">🛡️ 保証残${stats.barrierMonths - stats.tenantTenure}ヶ月</span>`
            : `<span style="color:${parseFloat(stats.evictRate) >= 15 ? '#e11d48' : '#64748b'}; font-weight:${parseFloat(stats.evictRate) >= 15 ? '700' : 'normal'};">退去 ${stats.evictRate}%</span>`);
        const netMonthlyColor = stats.netMonthlyProfit >= 0 ? '#059669' : '#e11d48';

        listEl.innerHTML += `
          <div class="prop-list-item" data-id="${p.id}" style="padding:12px; border-bottom:1px dashed #cbd5e1; cursor:pointer; display:flex; justify-content:space-between; align-items:center; gap:12px; transition: background 0.2s;">
            <div style="flex:1; min-width:0;">
              <div style="font-weight:bold; color:#1e293b; font-size:14px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                <span style="display:inline-block; padding:2px 6px; ${rankStyle} border-radius:4px; font-size:11px; font-weight:bold; box-shadow:0 1px 2px rgba(0,0,0,0.1);">Rank ${rank}</span>
                <span>物件 No.${propNo}</span>
                ${statusBadge}
              </div>
              <div style="font-size:11px; color:#64748b; margin-top:5px; display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
                <span>築${stats.buildingAge}ヶ月</span>
                <span style="color:#e11d48;">維持費 -${stats.maintCost.toFixed(1)}万</span>
                ${thirdMetricHtml}
              </div>
            </div>
            <div style="flex-shrink:0; text-align:right; white-space:nowrap;">
              <div style="font-weight:900; color:${stats.isVacant ? '#94a3b8' : color}; font-size:16px;">
                ${stats.isVacant ? '0.0' : rentDisplay.toFixed(1)}<span style="font-size:10px; font-weight:normal;">万/月</span>
              </div>
              <div style="font-size:10.5px; font-weight:700; color:${netMonthlyColor}; margin-top:2px;">実質 ${stats.netMonthlyProfit >= 0 ? '+' : ''}${stats.netMonthlyProfit.toFixed(1)}万</div>
            </div>
          </div>
        `;
      });
    }

    totalMaint = Math.round(totalMaint * 10) / 10;
    const totalSalaries = (GameState.company?.hiredStaff || []).reduce((acc, s) => acc + (s.salary || 0), 0);
    const recMaint = (GameState.company?.recruitment?.status === 'active') ? RECRUIT_MAINT_COST : 0;
    const loanPay = calcMonthlyLoanPayment(debt);
    const netIncome = Math.round((totalRent - totalMaint - totalSalaries - recMaint - loanPay.total) * 10) / 10;
    const incomeEl = document.getElementById('home-co-income');
    if (incomeEl) {
      const sign = netIncome >= 0 ? '+' : '';
      incomeEl.style.color = netIncome >= 0 ? 'var(--c-emerald)' : 'var(--c-rose)';
      if (totalMaint > 0 || totalSalaries > 0 || recMaint > 0 || loanPay.total > 0) {
        const parts = [`家賃 ${totalRent.toFixed(1)}`];
        if (totalMaint > 0) parts.push(`維持費 -${totalMaint.toFixed(1)}`);
        if (totalSalaries > 0) parts.push(`人件費 -${totalSalaries.toFixed(1)}`);
        if (recMaint > 0) parts.push(`求人 -${recMaint.toFixed(1)}`);
        if (loanPay.total > 0) parts.push(`返済 -${loanPay.total.toFixed(1)}`);
        incomeEl.innerHTML = `${sign}${netIncome.toFixed(1)}<span class="stat-unit">万/月</span>
          <div style="font-size:10px; color:var(--c-text2); font-weight:normal; margin-top:2px;">
            (${parts.join(' / ')})
          </div>`;
      } else {
        incomeEl.innerHTML = `+${totalRent.toFixed(1)}<span class="stat-unit">万/月</span>`;
      }
    }
    
    const btnGo = document.getElementById('btn-go-mission');
    if (btnGo) {
      if (GameState.activeBuild && GameState.activeBuild.stage) {
        const isResult = GameState.activeBuild.screen === 'result';
        btnGo.innerHTML = isResult
          ? `<i class="ph-bold ph-key" style="margin-right:8px;"></i>設計完了した物件を確認・引き渡す`
          : `<i class="ph-bold ph-pencil-simple" style="margin-right:8px;"></i>設計中の間取りを再開（残${GameState.attempts}回）`;
        btnGo.className = 'btn btn-amber';
      } else if (GameState.currentMission) {
        btnGo.innerHTML = `<i class="ph-bold ph-pencil-simple" style="margin-right:8px;"></i>受注中の設計を開始（残${GameState.attempts}回）`;
        btnGo.className = 'btn btn-amber';
      } else if (isAtCap) {
        btnGo.innerHTML = `<i class="ph-bold ph-warning-octagon" style="margin-right:8px;"></i>管理上限（${activeCount}/${maxCap}棟・要整理）`;
        btnGo.className = 'btn btn-slate';
      } else {
        btnGo.innerHTML = `<i class="ph-bold ph-newspaper" style="margin-right:8px;"></i>今月の案件を探す（3件）`;
        btnGo.className = 'btn btn-primary';
      }
    }
  }

  function openCompanyNameModal(isInitial = false) {
    const modal = document.getElementById('company-name-modal');
    if (!modal) return;
    const input = document.getElementById('input-co-name');
    const cancelBtn = document.getElementById('btn-co-name-cancel');
    const titleEl = document.getElementById('co-name-modal-title');
    const descEl = document.getElementById('co-name-modal-desc');

    if (input) {
      input.value = GameState.companyName || '焼飯不動産';
    }
    if (titleEl) {
      titleEl.innerHTML = isInitial
        ? `<i class="ph-bold ph-buildings"></i> 会社設立・社名の決定`
        : `<i class="ph-bold ph-pencil-simple"></i> 会社名の変更`;
    }
    if (descEl) {
      descEl.textContent = isInitial
        ? '新たに設立するあなたの不動産・建築会社の名前を決めてください（後からホーム画面左上の社名タップでいつでも変更できます）。'
        : '新しい会社名を入力してください。';
    }
    if (cancelBtn) {
      cancelBtn.style.display = isInitial ? 'none' : 'inline-flex';
    }
    modal.style.display = 'flex';
    setTimeout(() => {
      if (input) {
        input.focus();
        input.select();
      }
    }, 50);
  }

  function saveCompanyName() {
    initAudio();
    const input = document.getElementById('input-co-name');
    const raw = input ? input.value.trim() : '';
    GameState.companyName = raw ? raw.slice(0, 16) : '焼飯不動産';
    GameState.hasNamedCompany = true;
    saveGame();
    updateHomeUI();
    updateCompanyUI();
    const modal = document.getElementById('company-name-modal');
    if (modal) modal.style.display = 'none';
    playSound('tap');
  }

  document.getElementById('btn-edit-co-name')?.addEventListener('click', () => {
    initAudio();
    playSound('tap');
    openCompanyNameModal(false);
  });

  document.getElementById('btn-co-name-save')?.addEventListener('click', saveCompanyName);

  document.getElementById('btn-co-name-cancel')?.addEventListener('click', () => {
    initAudio();
    playSound('tap');
    const modal = document.getElementById('company-name-modal');
    if (modal) modal.style.display = 'none';
  });

  document.getElementById('input-co-name')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveCompanyName();
    }
  });

  // --- エンディング（表彰状）モーダル＆実績・記録帳モーダル ---
  function formatYearMonthStr(monthNum) {
    const m = Math.max(1, monthNum || 1);
    const y = Math.floor((m - 1) / 12) + 1;
    const mi = ((m - 1) % 12) + 1;
    return `${y}年目 ${mi}月`;
  }

  function triggerEndingConfetti() {
    const canvas = document.getElementById('ending-confetti-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#f59e0b', '#fbbf24', '#10b981', '#38bdf8', '#ec4899', '#8b5cf6', '#ffffff'];
    const particles = [];
    const count = 75;

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height * 0.4 - canvas.height * 0.4,
        w: Math.random() * 8 + 5,
        h: Math.random() * 5 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: (Math.random() - 0.5) * 3,
        vy: Math.random() * 3 + 2.5,
        rot: Math.random() * 360,
        vrot: (Math.random() - 0.5) * 8,
        opacity: 1
      });
    }

    let animId = null;
    const startTime = Date.now();
    const duration = 3800;

    function render() {
      const elapsed = Date.now() - startTime;
      if (elapsed > duration) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (animId) cancelAnimationFrame(animId);
        return;
      }
      const fadeProgress = elapsed > 2800 ? Math.max(0, (duration - elapsed) / 1000) : 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vrot;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.globalAlpha = Math.max(0, p.opacity * fadeProgress);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });

      animId = requestAnimationFrame(render);
    }
    render();
  }

  function openEndingModal() {
    initAudio();
    const modal = document.getElementById('modal-ending');
    if (!modal) return;
    const coName = GameState.companyName || '焼飯不動産';
    const reachedMonth = GameState.clearedMonth || GameState.month || 1;
    const lifetime = getLifetimeStats();
    const comboCount = getDiscoveredMasterComboCount();
    const activeProps = getActivePropertyCount();

    const nameEl = document.getElementById('ending-company-name');
    if (nameEl) nameEl.textContent = `${coName} 殿`;
    const dateEl = document.getElementById('ending-date');
    if (dateEl) dateEl.textContent = formatYearMonthStr(reachedMonth);
    const fundsEl = document.getElementById('ending-funds');
    if (fundsEl) fundsEl.textContent = `${(GameState.funds || 0).toFixed(1)} 万円`;
    const propsEl = document.getElementById('ending-props');
    if (propsEl) propsEl.textContent = `${activeProps} 棟`;
    const lifeEl = document.getElementById('ending-lifetime');
    const clearedCount = lifetime.cleared !== undefined ? lifetime.cleared : (lifetime.lifetimeClearedMissions || 0);
    const earnedRentVal = lifetime.earnedRent !== undefined ? lifetime.earnedRent : (lifetime.lifetimeEarnedRent || 0);
    if (lifeEl) lifeEl.textContent = `${clearedCount}件 / ${Number(earnedRentVal || 0).toFixed(1)}万`;
    const combosEl = document.getElementById('ending-combos');
    if (combosEl) combosEl.textContent = `${comboCount} / ${COMBO_MASTER_LIST.length} 種`;

    modal.style.display = 'flex';
    playSound('fanfare');
    triggerEndingConfetti();
  }
  window.openEndingModal = openEndingModal;

  function closeEndingModal() {
    const modal = document.getElementById('modal-ending');
    if (modal) modal.style.display = 'none';
  }
  window.closeEndingModal = closeEndingModal;

  function copyEndingStats() {
    initAudio();
    const coName = GameState.companyName || '焼飯不動産';
    const reachedMonth = GameState.clearedMonth || GameState.month || 1;
    const lifetime = getLifetimeStats();
    const comboCount = getDiscoveredMasterComboCount();
    const activeProps = getActivePropertyCount();
    const clearedCount = lifetime.cleared !== undefined ? lifetime.cleared : (lifetime.lifetimeClearedMissions || 0);
    const earnedRentVal = lifetime.earnedRent !== undefined ? lifetime.earnedRent : (lifetime.lifetimeEarnedRent || 0);

    const text = [
      `🏆【間取り図パズル＆不動産経営】一流不動産会社認定！`,
      `🏢 社名: ${coName}`,
      `📅 本社ビル到達: ${formatYearMonthStr(reachedMonth)}`,
      `💰 総資産: ${(GameState.funds || 0).toFixed(1)}万円 / 所有物件: ${activeProps}棟`,
      `🔨 累計施工: ${clearedCount}件 / 累計家賃: ${Number(earnedRentVal || 0).toFixed(1)}万円`,
      `📖 コンボ図鑑: ${comboCount}/${COMBO_MASTER_LIST.length}種`
    ].join('\n');

    const btn = document.getElementById('btn-ending-copy');
    const showCopiedFeedback = () => {
      playSound('clear');
      if (btn) {
        const orig = btn.innerHTML;
        btn.innerHTML = `<i class="ph-bold ph-check"></i> コピーしました！`;
        setTimeout(() => { btn.innerHTML = orig; }, 2000);
      }
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(showCopiedFeedback).catch(() => {
        window.prompt('以下のテキストをコピーしてください:', text);
      });
    } else {
      window.prompt('以下のテキストをコピーしてください:', text);
    }
  }

  function renderRecordsModal() {
    const listContainer = document.getElementById('records-list-container');
    const progText = document.getElementById('records-progress-text');
    const progBar = document.getElementById('records-progress-bar');
    if (!listContainer) return;

    const discovered = (GameState.discovered && Array.isArray(GameState.discovered.combos))
      ? GameState.discovered.combos
      : [];
    const total = COMBO_MASTER_LIST.length;
    const count = getDiscoveredMasterComboCount();
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;

    if (progText) {
      progText.textContent = `図鑑収集率: ${count} / ${total} (${pct}%)`;
    }
    if (progBar) {
      progBar.style.width = `${pct}%`;
    }

    let html = '';
    COMBO_MASTER_LIST.forEach((item, index) => {
      const isFound = discovered.includes(item.name) || discovered.includes(item.id);
      const isGood = item.category === '王道';
      const isNG = item.category === 'NG';
      const badgeColor = isGood
        ? 'background:rgba(16,185,129,0.2); color:#34d399; border:1px solid rgba(16,185,129,0.4);'
        : (isNG
          ? 'background:rgba(239,68,68,0.2); color:#f87171; border:1px solid rgba(239,68,68,0.4);'
          : 'background:rgba(168,85,247,0.2); color:#c084fc; border:1px solid rgba(168,85,247,0.4);');
      const bonusLabel = `${item.category} (${item.bonus})`;

      if (isFound) {
        html += `
          <div style="background:var(--c-surface2); border:1px solid ${isGood ? 'rgba(16,185,129,0.35)' : (isNG ? 'rgba(239,68,68,0.35)' : 'rgba(168,85,247,0.35)')}; border-radius:8px; padding:10px 12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; margin-bottom:4px;">
              <div style="font-size:13px; font-weight:bold; color:var(--c-text); display:flex; align-items:center; gap:6px;">
                <span style="font-size:11px; color:var(--c-text2); font-family:monospace;">No.${String(index + 1).padStart(2, '0')}</span>
                <span><i class="ph-bold ${item.icon}" style="color:${isGood ? '#34d399' : (isNG ? '#f87171' : '#c084fc')};"></i> ${item.name}</span>
              </div>
              <span style="font-size:10px; font-weight:bold; padding:2px 7px; border-radius:999px; white-space:nowrap; ${badgeColor}">${bonusLabel}</span>
            </div>
            <div style="font-size:11.5px; color:var(--c-text2); line-height:1.45;">
              ${item.desc}
            </div>
          </div>
        `;
      } else {
        html += `
          <div style="background:rgba(15,23,42,0.55); border:1px dashed rgba(148,163,184,0.25); border-radius:8px; padding:10px 12px; opacity:0.85;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; margin-bottom:4px;">
              <div style="font-size:13px; font-weight:bold; color:#94a3b8; display:flex; align-items:center; gap:6px;">
                <span style="font-size:11px; color:#64748b; font-family:monospace;">No.${String(index + 1).padStart(2, '0')}</span>
                <span>🔒 ？？？</span>
              </div>
              <span style="font-size:10px; font-weight:bold; padding:2px 7px; border-radius:999px; white-space:nowrap; background:rgba(100,116,139,0.2); color:#94a3b8; border:1px solid rgba(100,116,139,0.35);">
                ${item.category}
              </span>
            </div>
            <div style="font-size:11px; color:#64748b; line-height:1.45;">
              💡 ヒント: ${item.hint}
            </div>
          </div>
        `;
      }
    });

    listContainer.innerHTML = html;
  }

  function openRecordsModal() {
    initAudio();
    playSound('tap');
    renderRecordsModal();
    const modal = document.getElementById('modal-records');
    if (modal) modal.style.display = 'flex';
  }

  function closeRecordsModal() {
    initAudio();
    playSound('tap');
    const modal = document.getElementById('modal-records');
    if (modal) modal.style.display = 'none';
  }

  document.getElementById('btn-open-records')?.addEventListener('click', openRecordsModal);
  document.getElementById('btn-close-records')?.addEventListener('click', closeRecordsModal);
  document.getElementById('btn-close-records-bottom')?.addEventListener('click', closeRecordsModal);
  document.getElementById('modal-records')?.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'modal-records') closeRecordsModal();
  });

  function openHelpModal() {
    initAudio();
    playSound('tap');
    const modal = document.getElementById('modal-help');
    if (modal) modal.style.display = 'flex';
  }

  function closeHelpModal() {
    initAudio();
    playSound('tap');
    const modal = document.getElementById('modal-help');
    if (modal) modal.style.display = 'none';
  }

  document.getElementById('btn-help-home')?.addEventListener('click', openHelpModal);
  document.getElementById('btn-help-game')?.addEventListener('click', openHelpModal);
  document.getElementById('btn-close-help')?.addEventListener('click', closeHelpModal);
  document.getElementById('btn-close-help-bottom')?.addEventListener('click', closeHelpModal);
  document.getElementById('modal-help')?.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'modal-help') closeHelpModal();
  });

  document.getElementById('btn-ending-continue')?.addEventListener('click', () => {
    initAudio();
    playSound('tap');
    closeEndingModal();
  });
  document.getElementById('btn-ending-copy')?.addEventListener('click', copyEndingStats);
  document.getElementById('modal-ending')?.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'modal-ending') closeEndingModal();
  });
  document.getElementById('btn-close-ending-top')?.addEventListener('click', () => {
    initAudio();
    playSound('tap');
    closeEndingModal();
  });

  loadGame();
  if(!GameState.properties) GameState.properties = [];
  updateHomeUI();

  let resumed = false;
  if (GameState.activeBuild && GameState.activeBuild.stage) {
    try {
      resumed = restoreActiveBuild();
    } catch(e) {
      console.error('Failed to restore active build:', e);
      clearActiveBuild();
      resumed = false;
    }
  }

  if (!resumed) {
    showScreen('home');
    const initialDeadEnd = checkDeadEndBankruptcy();
    if (initialDeadEnd.isBankrupt) {
      showGameOverModal(initialDeadEnd.reason);
    } else if (!GameState.hasNamedCompany) {
      openCompanyNameModal(true);
    }
  }
