'use strict';
/**
 * dx_stage2.js
 * Floor Plan DX版 第2段階モジュール
 * - A-2: 立地・周辺環境ギミック（公園ビュー / オーシャンビュー / 幹線道路 / 桜並木 / 駅前好立地）
 * - A-1: リノベーション（リフォーム）案件（既存躯体・解体可能部屋・解体操作）
 * - 図面／敷地プレビュー補助描画＆評価ヘルパー
 */
(function (global) {
  const DEFAULT_GRID = 12;

  /* ============================================================
     1. 立地・周辺環境ギミック定義
  ============================================================ */
  const LOCATION_DEFS = {
    park_south: {
      id: 'park_south',
      name: '南側公園ビュー',
      shortTag: '🌳 南公園',
      icon: 'ph-tree',
      color: '#16a34a',
      badgeBg: 'rgba(22, 163, 74, 0.22)',
      badgeBorder: 'rgba(74, 222, 128, 0.55)',
      badgeFg: '#86efac',
      allowedSides: ['south'],
      maintMult: 1.0,
      noEncroach: false,
      desc: '南側に緑豊かな公園。南へ抜けるLDK/居室窓や南向き専用庭にボーナス！'
    },
    ocean_view: {
      id: 'ocean_view',
      name: 'オーシャンビュー',
      shortTag: '🌊 海沿い',
      icon: 'ph-waves',
      color: '#0284c7',
      badgeBg: 'rgba(2, 132, 199, 0.24)',
      badgeBorder: 'rgba(56, 189, 248, 0.6)',
      badgeFg: '#7dd3fc',
      allowedSides: ['south', 'east', 'west'],
      maintMult: 1.0,
      noEncroach: true,
      desc: '海岸沿いのリゾート立地。海側への窓や独立ビューバスに高評価（※海へ造成不可）。'
    },
    highway_road: {
      id: 'highway_road',
      name: '幹線道路沿い',
      shortTag: '🚗 大通り沿',
      icon: 'ph-car',
      color: '#f97316',
      badgeBg: 'rgba(234, 88, 12, 0.22)',
      badgeBorder: 'rgba(251, 146, 60, 0.6)',
      badgeFg: '#fdba74',
      allowedSides: ['west', 'east', 'north'],
      maintMult: 1.0,
      noEncroach: true,
      desc: '交通量の多い道路沿い。道路側に居室/LDK窓があると騒音NG！収納や赤壁で防音すると+1.2万（※道路へ造成不可）。'
    },
    sakura_alley: {
      id: 'sakura_alley',
      name: '桜並木通り',
      shortTag: '🌸 桜並木',
      icon: 'ph-flower-lotus',
      color: '#ec4899',
      badgeBg: 'rgba(219, 39, 119, 0.22)',
      badgeBorder: 'rgba(244, 114, 182, 0.6)',
      badgeFg: '#f9a8d4',
      allowedSides: ['east', 'north', 'west'],
      maintMult: 1.0,
      noEncroach: false,
      desc: '四季を感じる桜並木に隣接。桜側へ抜ける居室/LDK窓（特に和室）にボーナス！'
    },
    station_front: {
      id: 'station_front',
      name: '駅前・好立地',
      shortTag: '🚉 駅前立地',
      icon: 'ph-train',
      color: '#6366f1',
      badgeBg: 'rgba(99, 102, 241, 0.24)',
      badgeBorder: 'rgba(165, 180, 252, 0.6)',
      badgeFg: '#c7d2fe',
      allowedSides: ['all'],
      maintMult: 0.8,
      noEncroach: false,
      desc: '駅近の好立地。月次維持費 -20%！延床16マス以下のコンパクト設計でさらに家賃UP。'
    }
  };

  const SIDE_LABELS = {
    south: '南側',
    north: '北側',
    west: '西側',
    east: '東側',
    all: '周辺'
  };

  function getSideLabel(side) {
    return SIDE_LABELS[side] || '周辺';
  }

  function getLotBounds(stageObj, targetGrid) {
    const gSize = (targetGrid && targetGrid.length) || (typeof GRID !== 'undefined' ? GRID : DEFAULT_GRID);
    const lotDef = (stageObj && stageObj.lotType && typeof LOT_DEFINITIONS !== 'undefined')
      ? LOT_DEFINITIONS[stageObj.lotType]
      : null;
    if (lotDef) {
      return {
        minR: lotDef.minR,
        maxR: lotDef.maxR,
        minC: lotDef.minC,
        maxC: lotDef.maxC
      };
    }
    if (targetGrid) {
      let minR = gSize, maxR = -1, minC = gSize, maxC = -1;
      for (let r = 0; r < gSize; r++) {
        for (let c = 0; c < gSize; c++) {
          const cell = targetGrid[r]?.[c];
          if (cell && cell.type !== (typeof T !== 'undefined' ? T.OBSTACLE : 'obstacle')) {
            if (r < minR) minR = r;
            if (r > maxR) maxR = r;
            if (c < minC) minC = c;
            if (c > maxC) maxC = c;
          }
        }
      }
      if (maxR >= minR && maxC >= minC) {
        return { minR, maxR, minC, maxC };
      }
    }
    return { minR: 1, maxR: gSize - 2, minC: 1, maxC: gSize - 2 };
  }

  function isCellInLocationBand(r, c, loc, bounds) {
    if (!loc || !bounds) return false;
    if (loc.side === 'south') return r > bounds.maxR;
    if (loc.side === 'north') return r < bounds.minR;
    if (loc.side === 'west') return c < bounds.minC;
    if (loc.side === 'east') return c > bounds.maxC;
    if (loc.side === 'all') {
      return r < bounds.minR || r > bounds.maxR || c < bounds.minC || c > bounds.maxC;
    }
    return false;
  }

  function isNonEncroachableObstacle(stageObj, r, c, targetGrid) {
    const loc = stageObj && stageObj.location;
    if (!loc || !loc.noEncroach) return { blocked: false };
    const bounds = getLotBounds(stageObj, targetGrid);
    if (!isCellInLocationBand(r, c, loc, bounds)) return { blocked: false };
    if (loc.id === 'ocean_view') {
      return {
        blocked: true,
        shortLabel: '海には建築不可',
        detailText: `${getSideLabel(loc.side)}の海エリアには造成・建築できません`
      };
    }
    if (loc.id === 'highway_road') {
      return {
        blocked: true,
        shortLabel: '道路には建築不可',
        detailText: `${getSideLabel(loc.side)}の幹線道路にはみ出して建築できません`
      };
    }
    return {
      blocked: true,
      shortLabel: '環境保護エリア',
      detailText: `${loc.name}エリアには建築できません`
    };
  }

  function buildLocationPayload(locId, side) {
    const def = LOCATION_DEFS[locId];
    if (!def) return null;
    const chosenSide = side || def.allowedSides[0] || 'south';
    const sideLabel = getSideLabel(chosenSide);
    let name = def.name;
    let shortTag = def.shortTag;
    if (locId === 'ocean_view') {
      name = `${sideLabel}オーシャンビュー`;
      shortTag = `🌊 ${sideLabel}に海`;
    } else if (locId === 'highway_road') {
      name = `${sideLabel}幹線道路沿い`;
      shortTag = `🚗 ${sideLabel}に道路`;
    } else if (locId === 'sakura_alley') {
      name = `${sideLabel}桜並木通り`;
      shortTag = `🌸 ${sideLabel}に桜`;
    } else if (locId === 'park_south') {
      name = '南側公園ビュー';
      shortTag = '🌳 南に公園';
    } else if (locId === 'station_front') {
      name = '駅前・好立地';
      shortTag = '🚉 駅前(維持-20%)';
    }
    return {
      id: def.id,
      name,
      shortTag,
      side: chosenSide,
      sideLabel,
      icon: def.icon,
      color: def.color,
      badgeBg: def.badgeBg,
      badgeBorder: def.badgeBorder,
      badgeFg: def.badgeFg,
      maintMult: def.maintMult,
      noEncroach: !!def.noEncroach,
      desc: def.desc
    };
  }

  function getAvailableSidesForLot(lotKey) {
    const gSize = typeof GRID !== 'undefined' ? GRID : DEFAULT_GRID;
    const lot = (typeof LOT_DEFINITIONS !== 'undefined' && LOT_DEFINITIONS[lotKey]) ? LOT_DEFINITIONS[lotKey] : null;
    if (!lot) return ['south', 'north', 'west', 'east'];
    const sides = [];
    if (lot.maxR < gSize - 1) sides.push('south');
    if (lot.minR > 0) sides.push('north');
    if (lot.minC > 0) sides.push('west');
    if (lot.maxC < gSize - 1) sides.push('east');
    return sides;
  }

  function pickLocationForLot(lotKey, entranceFacing, clientType, opts = {}) {
    const availSides = getAvailableSidesForLot(lotKey);
    if (availSides.length === 0) return null;
    const avoidIds = new Set(opts.avoidIds || []);
    const forcedId = opts.forceId || null;
    const forcedSide = opts.forceSide || null;

    if (forcedId && LOCATION_DEFS[forcedId]) {
      const def = LOCATION_DEFS[forcedId];
      if (def.allowedSides.includes('all')) {
        return buildLocationPayload(forcedId, 'all');
      }
      const validSides = def.allowedSides.filter(s => availSides.includes(s));
      if (forcedSide && validSides.includes(forcedSide)) {
        return buildLocationPayload(forcedId, forcedSide);
      }
      if (validSides.length > 0) {
        const nonEnt = validSides.filter(s => !(s === 'south' && entranceFacing === 'bottom') && !(s === 'north' && entranceFacing === 'top') && !(s === 'west' && entranceFacing === 'left') && !(s === 'east' && entranceFacing === 'right'));
        const pool = nonEnt.length > 0 ? nonEnt : validSides;
        return buildLocationPayload(forcedId, pool[Math.floor(Math.random() * pool.length)]);
      }
      return null;
    }

    const facingSideMap = { bottom: 'south', top: 'north', left: 'west', right: 'east' };
    const entSide = facingSideMap[entranceFacing] || 'bottom';

    const candidates = [];
    Object.values(LOCATION_DEFS).forEach(def => {
      if (avoidIds.has(def.id)) return;
      if (def.id === 'station_front') {
        const isCompactLot = ['square_xs', 'square_s', 'micro_pencil', 'wide_rect', 'narrow_strip', 'mini_l', 'square_m'].includes(lotKey);
        if (!isCompactLot && clientType === 'mansion') return;
        candidates.push({ id: def.id, side: 'all', weight: isCompactLot ? 1.4 : 0.8 });
        return;
      }
      const validSides = def.allowedSides.filter(s => availSides.includes(s));
      if (validSides.length === 0) return;
      // 海や公園は玄関と反対側・横側を優先するが南公園は南マージンさえあればOK
      const preferred = validSides.filter(s => s !== entSide);
      const sidePool = (def.id === 'highway_road' && preferred.length > 0) ? preferred : (preferred.length > 0 ? preferred : validSides);
      const side = sidePool[Math.floor(Math.random() * sidePool.length)];
      candidates.push({ id: def.id, side, weight: 1.0 });
    });

    if (candidates.length === 0) return null;
    const totalW = candidates.reduce((s, x) => s + x.weight, 0);
    let r = Math.random() * totalW;
    for (const c of candidates) {
      r -= c.weight;
      if (r <= 0) return buildLocationPayload(c.id, c.side);
    }
    const last = candidates[candidates.length - 1];
    return buildLocationPayload(last.id, last.side);
  }

  /* ============================================================
     2. 立地レイキャスト見通し＆コンボ検出
  ============================================================ */
  function getSideStep(side) {
    if (side === 'south') return { dr: 1, dc: 0 };
    if (side === 'north') return { dr: -1, dc: 0 };
    if (side === 'west') return { dr: 0, dc: -1 };
    if (side === 'east') return { dr: 0, dc: 1 };
    return null;
  }

  function isBlockingRoomCell(cell) {
    if (!cell) return false;
    const emptyT = typeof T !== 'undefined' ? T.EMPTY : 'empty';
    const gardenT = typeof T !== 'undefined' ? T.GARDEN : 'garden';
    const obsT = typeof T !== 'undefined' ? T.OBSTACLE : 'obstacle';
    return cell.type !== emptyT && cell.type !== gardenT && cell.type !== obsT;
  }

  function cellHasSightlineToSide(targetGrid, r, c, side, edgeTypeFn, hasSolidWallFn, requireWindow = true) {
    const step = getSideStep(side);
    if (!step || !targetGrid) return false;
    const gSize = targetGrid.length;
    const nr = r + step.dr;
    const nc = c + step.dc;

    if (hasSolidWallFn && hasSolidWallFn(r, c, nr, nc)) return false;
    if (requireWindow && edgeTypeFn) {
      const et = edgeTypeFn(r, c, nr, nc);
      const winE = typeof E !== 'undefined' ? E.WINDOW : 'window';
      if (et !== winE) return false;
    }

    let cr = nr, cc = nc;
    while (cr >= 0 && cr < gSize && cc >= 0 && cc < gSize) {
      if (isBlockingRoomCell(targetGrid[cr]?.[cc])) return false;
      cr += step.dr;
      cc += step.dc;
    }
    return true;
  }

  function cellHasSightlineWithoutBuilding(targetGrid, r, c, side) {
    const step = getSideStep(side);
    if (!step || !targetGrid) return false;
    const gSize = targetGrid.length;
    let cr = r + step.dr, cc = c + step.dc;
    while (cr >= 0 && cr < gSize && cc >= 0 && cc < gSize) {
      if (isBlockingRoomCell(targetGrid[cr]?.[cc])) return false;
      cr += step.dr;
      cc += step.dc;
    }
    return true;
  }

  function detectLocationCombos(targetGrid, stageObj, counts, visited, edgeTypeFn, hasSolidWallFn) {
    const combos = [];
    const loc = stageObj && stageObj.location;
    if (!loc || !targetGrid) return combos;

    const gSize = targetGrid.length;
    const ldkT = typeof T !== 'undefined' ? T.LDK : 'ldk';
    const roomT = typeof T !== 'undefined' ? T.ROOM : 'room';
    const bathT = typeof T !== 'undefined' ? T.BATH : 'bath';
    const emptyT = typeof T !== 'undefined' ? T.EMPTY : 'empty';
    const gardenT = typeof T !== 'undefined' ? T.GARDEN : 'garden';
    const closetT = typeof T !== 'undefined' ? T.CLOSET : 'closet';
    const corrT = typeof T !== 'undefined' ? T.CORRIDOR : 'corridor';
    const washT = typeof T !== 'undefined' ? T.WASHROOM : 'washroom';
    const toiletT = typeof T !== 'undefined' ? T.TOILET : 'toilet';
    const entT = typeof T !== 'undefined' ? T.ENTRANCE : 'entrance';

    let ldkView = false;
    let roomView = false;
    let washitsuView = false;
    let bathView = false;
    let hasLiving = false;

    for (let r = 0; r < gSize; r++) {
      for (let c = 0; c < gSize; c++) {
        const cell = targetGrid[r]?.[c];
        if (!cell) continue;
        if (cell.type === ldkT || cell.type === roomT) hasLiving = true;
        if (loc.side === 'all') continue;

        if (cell.type === ldkT && cellHasSightlineToSide(targetGrid, r, c, loc.side, edgeTypeFn, hasSolidWallFn, true)) {
          ldkView = true;
        } else if (cell.type === roomT && cellHasSightlineToSide(targetGrid, r, c, loc.side, edgeTypeFn, hasSolidWallFn, true)) {
          roomView = true;
          if (cell.label === '和室' || cell.pieceLibId === 'room-wa' || cell.pieceLibId === 'room-wa2') {
            washitsuView = true;
          }
        } else if (cell.type === bathT && cell.pieceLibId !== 'unit-bath' && cell.label !== 'UB') {
          if (cellHasSightlineToSide(targetGrid, r, c, loc.side, edgeTypeFn, hasSolidWallFn, false)) {
            bathView = true;
          }
        }
      }
    }

    if (loc.id === 'park_south') {
      if (ldkView || roomView) {
        const b = ldkView ? 1.5 : 1.0;
        combos.push({
          name: 'パークビュー',
          bonus: b,
          icon: 'ph-tree text-emerald-600',
          type: 'location',
          text: `【立地】パークビュー — ${ldkView ? 'LDK' : '居室'}から南側の公園を一望 (+${b.toFixed(1)}万)`
        });
      }
      // 専用庭（bbox内のEMPTY/GARDENで最大連結3マス以上）が南へ開けているか
      if (counts && (counts.maxGardenCluster || 0) >= 3 && typeof calcFootprintStats === 'function') {
        const fp = calcFootprintStats(targetGrid);
        const bbox = fp && fp.bbox;
        if (bbox && fp.hasPlacedPiece) {
          let gardenOpenSouth = false;
          for (let r = bbox.minR; r <= bbox.maxR; r++) {
            for (let c = bbox.minC; c <= bbox.maxC; c++) {
              const cell = targetGrid[r]?.[c];
              if (cell && (cell.type === emptyT || cell.type === gardenT) && cellHasSightlineWithoutBuilding(targetGrid, r, c, 'south')) {
                gardenOpenSouth = true;
                break;
              }
            }
            if (gardenOpenSouth) break;
          }
          if (gardenOpenSouth) {
            combos.push({
              name: '公園つづきの庭',
              bonus: 0.8,
              icon: 'ph-plant text-emerald-600',
              type: 'location',
              text: '【立地】公園つづきの庭 — 公園の緑と一体化する南向き専用庭 (+0.8万)'
            });
          }
        }
      }
    } else if (loc.id === 'ocean_view') {
      if (ldkView || roomView) {
        const b = ldkView ? 2.0 : 1.2;
        combos.push({
          name: 'オーシャンビュー',
          bonus: b,
          icon: 'ph-waves text-sky-500',
          type: 'location',
          text: `【立地】オーシャンビュー — ${loc.sideLabel}の海を望む${ldkView ? 'オーシャンLDK' : '海側居室'} (+${b.toFixed(1)}万)`
        });
      }
      if (bathView) {
        combos.push({
          name: '海見えビューバス',
          bonus: 1.5,
          icon: 'ph-bathtub text-cyan-500',
          type: 'location',
          text: `【立地】海見えビューバス — ${loc.sideLabel}の海に面した贅沢な独立浴室 (+1.5万)`
        });
      }
    } else if (loc.id === 'highway_road') {
      if (ldkView || roomView) {
        combos.push({
          name: '幹線道路の騒音',
          bonus: -1.5,
          icon: 'ph-warning text-rose-600',
          type: 'funny',
          text: `【NG・立地】幹線道路の騒音 — ${loc.sideLabel}の道路側に居室/LDKの窓が直面 (-1.5万)`
        });
      } else if (hasLiving) {
        // 道路側に窓がなく、道路側面にバッファ空間（水回り・収納・廊下・玄関）または赤壁防音がある
        const step = getSideStep(loc.side);
        let hasBufferOrWall = false;
        for (let r = 0; r < gSize; r++) {
          for (let c = 0; c < gSize; c++) {
            const cell = targetGrid[r]?.[c];
            if (!isBlockingRoomCell(cell)) continue;
            const nr = r + step.dr, nc = c + step.dc;
            if (!cellHasSightlineWithoutBuilding(targetGrid, r, c, loc.side)) continue;
            const isBufferType = (cell.type === closetT || cell.type === corrT || cell.type === washT || cell.type === bathT || cell.type === toiletT || cell.type === entT);
            const hasSolidBlock = (cell.type === ldkT || cell.type === roomT) && hasSolidWallFn && hasSolidWallFn(r, c, nr, nc);
            if (isBufferType || hasSolidBlock) {
              hasBufferOrWall = true;
              break;
            }
          }
          if (hasBufferOrWall) break;
        }
        if (hasBufferOrWall) {
          combos.push({
            name: '防音緩衝レイアウト',
            bonus: 1.2,
            icon: 'ph-shield-check text-sky-500',
            type: 'location',
            text: `【立地】防音緩衝レイアウト — ${loc.sideLabel}の道路側に水回り・収納・遮音壁を配置し静寂を確保 (+1.2万)`
          });
        }
      }
    } else if (loc.id === 'sakura_alley') {
      if (ldkView || roomView) {
        const b = washitsuView ? 2.0 : 1.5;
        const note = washitsuView ? '花見座敷の和室が桜並木を一望' : `${ldkView ? 'LDK' : '居室'}から桜並木を一望`;
        combos.push({
          name: '桜並木ビュー',
          bonus: b,
          icon: 'ph-flower-lotus text-pink-500',
          type: 'location',
          text: `【立地】桜並木ビュー — ${loc.sideLabel}の${note} (+${b.toFixed(1)}万)`
        });
      }
    } else if (loc.id === 'station_front') {
      if (hasLiving && counts && (counts.unreachable || 0) === 0 && (counts.floorCells || 0) > 0) {
        const isCompact = (counts.floorCells || 0) <= 16;
        const b = isCompact ? 2.0 : 1.5;
        combos.push({
          name: '駅前好立地',
          bonus: b,
          icon: 'ph-train text-indigo-500',
          type: 'location',
          text: `【立地】駅前好立地 — ${isCompact ? '駅近コンパクト設計(16ﾏｽ以下)で人気集中！' : '駅至近の通勤通学プレミアム'} (+${b.toFixed(1)}万 / 維持費-20%)`
        });
      }
    }

    return combos;
  }

  /* ============================================================
     3. リノベーション（リフォーム）案件定義
  ============================================================ */
  const RENOVATION_TEMPLATES = [
    {
      id: 'reno_ub_single',
      title: '築古ワンルームのBT分離改修',
      summary: '古いUBを解体し、風呂・トイレ別＆独立洗面所へ再生！',
      minLevel: 1,
      clientType: 'single',
      lotType: 'square_s',
      entranceCells: [{ r: 8, c: 5 }],
      entranceFacing: 'bottom',
      client: {
        name: '桜井 俊介',
        avatar: '🔨',
        quote: '「築25年のワンルームを買ったのですが、古い3点ユニットバスが不人気で…解体してBT別＆洗面所付きに再生してください！」',
        typeBadge: 'リフォーム依頼・単身'
      },
      reqKeys: ['reno_no_ub', 'wash', 'reach'],
      optKeys: ['opt-closet', 'opt-kitchen'],
      initialBudget: 1450,
      targetRent: 5.5,
      maxTurns: 12,
      pieces: [
        { r: 3, c: 6, h: 2, w: 2, type: 'room', label: '洋室', libId: 'room-22', locked: true, lockedWalls: [{ r: 1, c: 1, dir: 'bottom' }] },
        { r: 6, c: 5, h: 2, w: 1, type: 'corridor', label: '廊下', libId: 'corr-i2', locked: false },
        { r: 6, c: 6, h: 2, w: 1, type: 'bath', label: 'UB', libId: 'unit-bath', locked: false },
        { r: 5, c: 6, h: 1, w: 1, type: 'ldk', label: 'K', libId: 'k-1', locked: false, walls: [{ r: 0, c: 0, dir: 'left' }] }
      ]
    },
    {
      id: 'reno_ng_fix_dinks',
      title: '珍間取り欠陥マンション改修',
      summary: '「玄関直風呂」と「LDK直結トイレ」を解体して快適2LDKに！',
      minLevel: 1,
      clientType: 'dinks',
      lotType: 'square_m',
      entranceCells: [{ r: 9, c: 5 }],
      entranceFacing: 'bottom',
      client: {
        name: '高木 麻衣',
        avatar: '🛠️',
        quote: '「前の持ち主が『玄関開けたら即お風呂』『LDK直結トイレ』に魔改造していて…既存LDKは活かして欠陥だけ直せますか？」',
        typeBadge: 'リフォーム依頼・DINKS'
      },
      reqKeys: ['reno_no_ng', 'ldk1_room1', 'btsep', 'wash', 'reach'],
      optKeys: ['opt-housework', 'opt-soundproof'],
      initialBudget: 2600,
      targetRent: 9.2,
      maxTurns: 14,
      pieces: [
        { r: 5, c: 4, h: 2, w: 3, type: 'ldk', label: 'LDK', libId: 'ldk-23', locked: true, lockedWalls: [{ r: 1, c: 0, dir: 'bottom' }, { r: 0, c: 2, dir: 'right' }] },
        { r: 8, c: 5, h: 1, w: 2, type: 'bath', label: '浴室', libId: 'bath', locked: false },
        { r: 6, c: 7, h: 1, w: 1, type: 'toilet', label: 'WC', libId: 'toilet', locked: false },
        { r: 3, c: 4, h: 2, w: 2, type: 'room', label: '洋室', libId: 'room-22', locked: false }
      ]
    },
    {
      id: 'reno_sealed_wall_single',
      title: '壁に囲まれた孤立和室リノベ',
      summary: '赤い壁で塞がれた和室を解放し、古いUBから1LDKへ刷新！',
      minLevel: 1,
      clientType: 'single',
      lotType: 'wide_rect',
      entranceCells: [{ r: 7, c: 5 }],
      entranceFacing: 'bottom',
      client: {
        name: '藤本 悠',
        avatar: '🧱',
        quote: '「古い木造物件の和室が赤い壁で塞がれて入れないんです！大切な和室は残しつつ、古い水回りを入れ替えてください！」',
        typeBadge: 'リフォーム依頼・単身'
      },
      reqKeys: ['reno_no_ub', 'ldk1_room1', 'reach'],
      optKeys: ['opt-washitsu', 'opt-wash'],
      initialBudget: 1650,
      targetRent: 6.2,
      maxTurns: 12,
      pieces: [
        {
          r: 3, c: 3, h: 2, w: 2, type: 'room', label: '和室', libId: 'room-wa', locked: true,
          lockedWalls: [{ r: 0, c: 1, dir: 'right' }, { r: 1, c: 1, dir: 'right' }],
          walls: [{ r: 1, c: 0, dir: 'bottom' }, { r: 1, c: 1, dir: 'bottom' }]
        },
        { r: 5, c: 5, h: 2, w: 2, type: 'ldk', label: 'DK', libId: 'dk-22', locked: false, walls: [{ r: 1, c: 0, dir: 'bottom' }] },
        { r: 5, c: 7, h: 2, w: 1, type: 'bath', label: 'UB', libId: 'unit-bath', locked: false }
      ]
    },
    {
      id: 'reno_skeleton_family',
      title: 'スケルトンバス邸宅の大改修',
      summary: '玄関丸見え風呂＆危険動線のファミリー住宅を正常化！',
      minLevel: 2,
      clientType: 'family',
      lotType: 'square_l',
      entranceCells: [{ r: 10, c: 5 }],
      entranceFacing: 'bottom',
      client: {
        name: '黒沢 家族',
        avatar: '🏡',
        quote: '「玄関から浴室が丸見えで、トイレもLDK直結＆浴室と繋がっていて落ち着かないんです…！LDKと主寝室を残して直したい！」',
        typeBadge: 'リフォーム依頼・ファミリー'
      },
      reqKeys: ['reno_no_ng', 'ldk1_room2', 'btsep', 'wash', 'reach'],
      optKeys: ['opt-circulation', 'opt-plumbing'],
      initialBudget: 4100,
      targetRent: 13.0,
      maxTurns: 16,
      pieces: [
        { r: 4, c: 2, h: 2, w: 3, type: 'ldk', label: 'LDK', libId: 'ldk-23', locked: true, lockedWalls: [{ r: 0, c: 2, dir: 'right' }] },
        { r: 2, c: 6, h: 2, w: 2, type: 'room', label: '洋室', libId: 'room-22', locked: true },
        { r: 7, c: 5, h: 3, w: 1, type: 'corridor', label: '廊下', libId: 'corr-i3', locked: false },
        { r: 6, c: 5, h: 1, w: 2, type: 'bath', label: '浴室', libId: 'bath', locked: false },
        { r: 5, c: 5, h: 1, w: 1, type: 'toilet', label: 'WC', libId: 'toilet', locked: false }
      ]
    },
    {
      id: 'reno_narrow_machiya',
      title: '細長町家・再生リフォーム',
      summary: 'うなぎの寝床の玄関直風呂を撤去し、趣ある和モダン住宅へ！',
      minLevel: 2,
      clientType: 'dinks',
      lotType: 'narrow_strip',
      entranceCells: [{ r: 10, c: 5 }],
      entranceFacing: 'bottom',
      client: {
        name: '京極 夫妻',
        avatar: '🏮',
        quote: '「細い町家を再生したいのですが、なぜか玄関すぐが浴室で…奥の和室と中廊下の柱は壊せないので工夫して組み直してください！」',
        typeBadge: 'リフォーム依頼・和モダン'
      },
      reqKeys: ['reno_no_ng', 'ldk1_room1', 'btsep', 'reach'],
      optKeys: ['opt-washitsu', 'opt-closet'],
      initialBudget: 2750,
      targetRent: 9.6,
      maxTurns: 14,
      pieces: [
        { r: 2, c: 4, h: 2, w: 2, type: 'room', label: '和室', libId: 'room-wa', locked: true },
        { r: 6, c: 4, h: 1, w: 2, type: 'corridor', label: '廊下', libId: 'corr-i2', locked: true, lockedWalls: [{ r: 0, c: 0, dir: 'bottom' }] },
        { r: 9, c: 5, h: 1, w: 2, type: 'bath', label: '浴室', libId: 'bath', locked: false },
        { r: 4, c: 6, h: 2, w: 2, type: 'ldk', label: 'DK', libId: 'dk-22', locked: false }
      ]
    },
    {
      id: 'reno_park_villa',
      title: '公園沿い古民家・南窓再生',
      summary: '南の公園ビューを塞ぐ古いUBを解体し、明るい公園ビューLDKへ！',
      minLevel: 2,
      clientType: 'family',
      lotType: 'l_shape',
      locationId: 'park_south',
      locationSide: 'south',
      entranceCells: [{ r: 10, c: 2 }],
      entranceFacing: 'bottom',
      client: {
        name: '椎名 ファミリー',
        avatar: '🌳',
        quote: '「南側が素敵な公園なのに、古い水回りが南の日差しを塞いでいて勿体ないんです！水回りを撤去して明るい公園ビューリビングに！」',
        typeBadge: 'リフォーム依頼・ファミリー'
      },
      reqKeys: ['reno_no_ub', 'ldk1_room2', 'wash', 'reach'],
      optKeys: ['opt-south', 'opt-garden'],
      initialBudget: 4300,
      targetRent: 13.8,
      maxTurns: 16,
      pieces: [
        { r: 5, c: 2, h: 2, w: 2, type: 'room', label: '洋室', libId: 'room-22', locked: true },
        { r: 5, c: 7, h: 2, w: 2, type: 'room', label: '和室', libId: 'room-wa', locked: true },
        { r: 9, c: 5, h: 1, w: 1, type: 'corridor', label: '廊下', libId: 'corr-1', locked: false },
        { r: 10, c: 5, h: 1, w: 1, type: 'toilet', label: 'WC', libId: 'toilet', locked: false },
        { r: 9, c: 6, h: 2, w: 1, type: 'bath', label: 'UB', libId: 'unit-bath', locked: false }
      ]
    }
  ];

  function buildRenovationStage(tpl, level = 1, salesMultiplier = 1.0) {
    if (!tpl) return null;
    const lotDef = (typeof LOT_DEFINITIONS !== 'undefined' && LOT_DEFINITIONS[tpl.lotType]) ? LOT_DEFINITIONS[tpl.lotType] : { name: tpl.lotType, obstacles: [] };
    const reqList = (typeof REQUEST_REGISTRY !== 'undefined')
      ? tpl.reqKeys.map(k => REQUEST_REGISTRY[k] ? { ...REQUEST_REGISTRY[k] } : null).filter(Boolean)
      : [];
    const optList = (typeof REQUEST_REGISTRY !== 'undefined')
      ? (tpl.optKeys || []).map(k => REQUEST_REGISTRY[k] ? { ...REQUEST_REGISTRY[k] } : null).filter(Boolean)
      : [];

    const initialBudget = Math.round(tpl.initialBudget * salesMultiplier);
    const targetRent = Math.round(tpl.targetRent * salesMultiplier * 10) / 10;
    const loc = tpl.locationId ? buildLocationPayload(tpl.locationId, tpl.locationSide) : null;
    const lockedCount = tpl.pieces.filter(p => p.locked).length;
    const removableCount = tpl.pieces.filter(p => !p.locked).length;

    return {
      id: level + 1,
      name: `${tpl.client.name} 様のリフォーム`,
      lotName: lotDef.name,
      lotType: tpl.lotType,
      client: { ...tpl.client },
      initialBudget,
      targetRent,
      maxTurns: tpl.maxTurns,
      entranceRow: tpl.entranceCells[0].r,
      entranceCol: tpl.entranceCells[0].c,
      entranceCells: tpl.entranceCells.map(pt => ({ ...pt })),
      entranceFacing: tpl.entranceFacing,
      obstacles: lotDef.obstacles || [],
      requests: reqList,
      optionalRequests: optList,
      customCombo: null,
      location: loc,
      renovation: {
        id: tpl.id,
        title: tpl.title,
        summary: tpl.summary,
        lockedCount,
        removableCount,
        pieces: JSON.parse(JSON.stringify(tpl.pieces))
      }
    };
  }

  function generateRenovationMission(level = 1, brandLevel = 1, salesMultiplier = 1.0, forcedId = null) {
    let pool = RENOVATION_TEMPLATES;
    if (forcedId) {
      const exact = pool.find(t => t.id === forcedId);
      if (exact) return buildRenovationStage(exact, level, salesMultiplier);
    }
    const maxMinLevel = brandLevel >= 3 ? 2 : (level >= 2 ? 2 : 1);
    const eligible = pool.filter(t => (t.minLevel || 1) <= maxMinLevel);
    const list = eligible.length > 0 ? eligible : pool;
    const picked = list[Math.floor(Math.random() * list.length)];
    return buildRenovationStage(picked, level, salesMultiplier);
  }

  function injectRenovationGrid(targetGrid, stageObj, makeCellFn) {
    if (!targetGrid || !stageObj || !stageObj.renovation || !Array.isArray(stageObj.renovation.pieces)) {
      return 1;
    }
    const gSize = targetGrid.length;
    let rid = 1;
    const pieces = stageObj.renovation.pieces;

    pieces.forEach((p, idx) => {
      const myRid = rid++;
      const groupId = `reno_${idx}`;
      const lib = (typeof PIECE_MAP !== 'undefined' && p.libId && PIECE_MAP[p.libId]) ? PIECE_MAP[p.libId] : null;
      const cellCount = Math.max(1, (p.w || 1) * (p.h || 1));
      const costPerCell = lib ? (lib.cost / cellCount) : 3.5;

      for (let dr = 0; dr < (p.h || 1); dr++) {
        for (let dc = 0; dc < (p.w || 1); dc++) {
          const rr = p.r + dr;
          const cc = p.c + dc;
          if (rr < 0 || rr >= gSize || cc < 0 || cc >= gSize) continue;
          const cell = makeCellFn(p.type, myRid, p.label, costPerCell);
          cell.pieceLibId = p.libId || '';
          cell.isExisting = true;
          cell.locked = !!p.locked;
          cell.renoGroupId = groupId;
          cell.lockedWalls = { top: false, right: false, bottom: false, left: false };

          if (Array.isArray(p.walls)) {
            for (const w of p.walls) {
              if (w.r === dr && w.c === dc && w.dir) {
                cell.walls[w.dir] = true;
              }
            }
          }
          if (Array.isArray(p.lockedWalls)) {
            for (const lw of p.lockedWalls) {
              if (lw.r === dr && lw.c === dc && lw.dir) {
                cell.walls[lw.dir] = true;
                cell.lockedWalls[lw.dir] = true;
              }
            }
          }
          targetGrid[rr][cc] = cell;
        }
      }
    });

    return rid;
  }

  /* ============================================================
     4. リノベ壁ロック・解体ターゲット・査定補助
  ============================================================ */
  function hasLockedWall(targetGrid, r1, c1, r2, c2) {
    if (!targetGrid) return false;
    const c1Cell = targetGrid[r1]?.[c1];
    if (c1Cell && c1Cell.lockedWalls) {
      if (r2 === r1 - 1 && c1Cell.lockedWalls.top) return true;
      if (r2 === r1 + 1 && c1Cell.lockedWalls.bottom) return true;
      if (c2 === c1 - 1 && c1Cell.lockedWalls.left) return true;
      if (c2 === c1 + 1 && c1Cell.lockedWalls.right) return true;
    }
    const c2Cell = targetGrid[r2]?.[c2];
    if (c2Cell && c2Cell.lockedWalls) {
      if (r1 === r2 - 1 && c2Cell.lockedWalls.top) return true;
      if (r1 === r2 + 1 && c2Cell.lockedWalls.bottom) return true;
      if (c1 === c2 - 1 && c2Cell.lockedWalls.left) return true;
      if (c1 === c2 + 1 && c2Cell.lockedWalls.right) return true;
    }
    return false;
  }

  function getDemolishCost(cellCount) {
    const n = Math.max(1, cellCount || 1);
    return Math.max(2.0, Math.round(n * 1.5 * 10) / 10);
  }

  function findDemolishTargetAt(targetGrid, r, c) {
    if (!targetGrid || r < 0 || c < 0 || r >= targetGrid.length || c >= targetGrid.length) return null;
    const cell = targetGrid[r][c];
    const emptyT = typeof T !== 'undefined' ? T.EMPTY : 'empty';
    const gardenT = typeof T !== 'undefined' ? T.GARDEN : 'garden';
    const obsT = typeof T !== 'undefined' ? T.OBSTACLE : 'obstacle';
    const entT = typeof T !== 'undefined' ? T.ENTRANCE : 'entrance';

    if (!cell || cell.type === emptyT || cell.type === gardenT || cell.type === obsT) {
      return null;
    }
    if (cell.type === entT) {
      return { entrance: true, label: '玄関' };
    }
    if (!cell.isExisting) {
      return { newlyPlaced: true, label: cell.label || '新築部屋' };
    }
    if (cell.locked) {
      return { locked: true, label: cell.label || '固定躯体' };
    }

    const groupId = cell.renoGroupId || `pid_${cell.pieceId || cell.roomId || `${r}_${c}`}`;
    const cells = [];
    let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
    for (let rr = 0; rr < targetGrid.length; rr++) {
      for (let cc = 0; cc < targetGrid[rr].length; cc++) {
        const cur = targetGrid[rr][cc];
        if (!cur || !cur.isExisting || cur.locked) continue;
        const curGroup = cur.renoGroupId || `pid_${cur.pieceId || cur.roomId}`;
        if (curGroup === groupId) {
          cells.push({ r: rr, c: cc });
          if (rr < minR) minR = rr;
          if (rr > maxR) maxR = rr;
          if (cc < minC) minC = cc;
          if (cc > maxC) maxC = cc;
        }
      }
    }
    if (cells.length === 0) return null;
    return {
      groupId,
      label: cell.label || '既存部屋',
      type: cell.type,
      cells,
      cost: getDemolishCost(cells.length),
      minR, maxR, minC, maxC
    };
  }

  function hasDemolishableCells(targetGrid) {
    if (!targetGrid) return false;
    for (let r = 0; r < targetGrid.length; r++) {
      for (let c = 0; c < targetGrid[r].length; c++) {
        const cell = targetGrid[r][c];
        if (cell && cell.isExisting && !cell.locked) return true;
      }
    }
    return false;
  }

  function calcPreservedBaseCost(targetGrid) {
    if (!targetGrid) return 0;
    let sum = 0;
    for (let r = 0; r < targetGrid.length; r++) {
      for (let c = 0; c < targetGrid[r].length; c++) {
        const cell = targetGrid[r][c];
        if (cell && cell.isExisting) {
          sum += (cell.costPerCell || 0);
        }
      }
    }
    return Math.round(sum * 10) / 10;
  }

  function hasNoNegativeCombos(counts) {
    if (!counts || (counts.totalOcc || 0) <= 0) return false;
    if (typeof runBFS === 'function' && typeof detectCombos === 'function') {
      const visited = runBFS();
      const combos = detectCombos(counts, visited);
      return !combos.some(c => c && c.bonus < 0);
    }
    return true;
  }

  /* ============================================================
     5. 図面・敷地プレビュー補助描画
  ============================================================ */
  function drawBlueprintLocationOverlay(ctx, targetGrid, stageObj, cs, isCompact = false) {
    const loc = stageObj && stageObj.location;
    if (!loc || !ctx || !targetGrid) return;
    const gSize = targetGrid.length;
    const bounds = getLotBounds(stageObj, targetGrid);
    const obsT = typeof T !== 'undefined' ? T.OBSTACLE : 'obstacle';

    ctx.save();
    for (let r = 0; r < gSize; r++) {
      for (let c = 0; c < gSize; c++) {
        const cell = targetGrid[r]?.[c];
        if (!cell || cell.type !== obsT) continue;
        if (!isCellInLocationBand(r, c, loc, bounds)) continue;

        const x = c * cs, y = r * cs;
        if (loc.id === 'park_south') {
          ctx.fillStyle = 'rgba(34, 197, 94, 0.24)';
          ctx.fillRect(x, y, cs, cs);
          if (!isCompact && ((r + c) % 2 === 0)) {
            ctx.fillStyle = 'rgba(21, 128, 61, 0.42)';
            ctx.beginPath();
            ctx.arc(x + cs * 0.5, y + cs * 0.5, Math.max(2, cs * 0.16), 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (loc.id === 'ocean_view') {
          ctx.fillStyle = 'rgba(14, 165, 233, 0.28)';
          ctx.fillRect(x, y, cs, cs);
          if (!isCompact) {
            ctx.strokeStyle = 'rgba(2, 132, 199, 0.52)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(x + cs * 0.15, y + cs * 0.45);
            ctx.quadraticCurveTo(x + cs * 0.5, y + cs * 0.3, x + cs * 0.85, y + cs * 0.45);
            ctx.stroke();
          }
        } else if (loc.id === 'highway_road') {
          ctx.fillStyle = 'rgba(51, 65, 85, 0.36)';
          ctx.fillRect(x, y, cs, cs);
          if (!isCompact) {
            ctx.strokeStyle = 'rgba(248, 250, 252, 0.65)';
            ctx.lineWidth = 1.3;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            if (loc.side === 'north' || loc.side === 'south') {
              ctx.moveTo(x, y + cs * 0.5); ctx.lineTo(x + cs, y + cs * 0.5);
            } else {
              ctx.moveTo(x + cs * 0.5, y); ctx.lineTo(x + cs * 0.5, y + cs);
            }
            ctx.stroke();
            ctx.setLineDash([]);
          }
        } else if (loc.id === 'sakura_alley') {
          ctx.fillStyle = 'rgba(244, 114, 182, 0.24)';
          ctx.fillRect(x, y, cs, cs);
          if (!isCompact && ((r + c) % 2 === 0)) {
            ctx.fillStyle = 'rgba(219, 39, 119, 0.45)';
            ctx.beginPath();
            ctx.arc(x + cs * 0.5, y + cs * 0.5, Math.max(2, cs * 0.16), 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (loc.id === 'station_front') {
          ctx.fillStyle = 'rgba(99, 102, 241, 0.18)';
          ctx.fillRect(x, y, cs, cs);
        }
      }
    }

    if (!isCompact) {
      const label = loc.shortTag || loc.name;
      const fontSize = Math.max(9, Math.min(11, Math.round(cs * 0.34)));
      ctx.font = `bold ${fontSize}px "Zen Kaku Gothic New", sans-serif`;
      const tw = ctx.measureText(label).width + 12;
      const ph = fontSize + 7;
      let px = (gSize * cs - tw) / 2;
      let py = 4;
      if (loc.side === 'south') py = Math.min(gSize * cs - ph - 3, (bounds.maxR + 1) * cs + 3);
      else if (loc.side === 'north') py = Math.max(3, bounds.minR * cs - ph - 3);
      else if (loc.side === 'west') {
        px = Math.max(3, (bounds.minC * cs - tw) / 2);
        py = (bounds.minR + bounds.maxR + 1) * cs / 2 - ph / 2;
      } else if (loc.side === 'east') {
        px = Math.min(gSize * cs - tw - 3, (bounds.maxC + 1) * cs + 4);
        py = (bounds.minR + bounds.maxR + 1) * cs / 2 - ph / 2;
      }
      px = Math.max(3, Math.min(gSize * cs - tw - 3, px));
      py = Math.max(3, Math.min(gSize * cs - ph - 3, py));

      ctx.fillStyle = 'rgba(15, 23, 42, 0.84)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(px, py, tw, ph, 5);
      else ctx.rect(px, py, tw, ph);
      ctx.fill();
      ctx.strokeStyle = loc.color || '#38bdf8';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, px + tw / 2, py + ph / 2 + 0.5);
    }
    ctx.restore();
  }

  function drawBlueprintRenovationOverlays(ctx, targetGrid, cs, opts = {}) {
    if (!ctx || !targetGrid) return;
    const {
      selectedDemolishTarget = null,
      demolishMode = false,
      showBadges = true
    } = opts;
    const gSize = targetGrid.length;
    const lockedSeen = new Set();
    const selSet = new Set((selectedDemolishTarget && selectedDemolishTarget.cells || []).map(p => `${p.r},${p.c}`));

    ctx.save();
    for (let r = 0; r < gSize; r++) {
      for (let c = 0; c < gSize; c++) {
        const cell = targetGrid[r]?.[c];
        if (!cell || !cell.isExisting) continue;
        const x = c * cs, y = r * cs;
        const isSel = selSet.has(`${r},${c}`);

        if (cell.locked) {
          ctx.fillStyle = 'rgba(51, 65, 85, 0.14)';
          ctx.fillRect(x + 1, y + 1, cs - 2, cs - 2);
          ctx.strokeStyle = 'rgba(71, 85, 105, 0.72)';
          ctx.lineWidth = 1.6;
          ctx.strokeRect(x + 1.5, y + 1.5, cs - 3, cs - 3);

          const gKey = cell.renoGroupId || `lock_${cell.roomId}`;
          if (showBadges && cs >= 18 && !lockedSeen.has(gKey)) {
            lockedSeen.add(gKey);
            const sz = Math.max(10, Math.min(14, Math.round(cs * 0.36)));
            ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
            ctx.fillRect(x + 2, y + 2, sz, sz);
            ctx.fillStyle = '#fde047';
            ctx.font = `bold ${Math.max(7, sz - 4)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🔒', x + 2 + sz / 2, y + 2 + sz / 2 + 0.5);
          }
        } else {
          ctx.strokeStyle = isSel
            ? '#e11d48'
            : (demolishMode ? '#f59e0b' : 'rgba(217, 119, 6, 0.72)');
          ctx.lineWidth = isSel ? 2.5 : (demolishMode ? 2 : 1.3);
          ctx.setLineDash([4, 3]);
          ctx.strokeRect(x + 2, y + 2, cs - 4, cs - 4);
          ctx.setLineDash([]);
          if (isSel) {
            ctx.fillStyle = 'rgba(244, 63, 94, 0.25)';
            ctx.fillRect(x, y, cs, cs);
          } else if (demolishMode) {
            ctx.fillStyle = 'rgba(245, 158, 11, 0.14)';
            ctx.fillRect(x, y, cs, cs);
          }
        }
      }
    }

    // 固定躯体壁（鉄骨マーク付きダークレッド線）
    for (let r = 0; r < gSize; r++) {
      for (let c = 0; c < gSize; c++) {
        const x = c * cs, y = r * cs;
        if (hasLockedWall(targetGrid, r, c, r, c + 1)) {
          ctx.strokeStyle = '#9f1239';
          ctx.lineWidth = 4.5;
          ctx.beginPath(); ctx.moveTo(x + cs, y); ctx.lineTo(x + cs, y + cs); ctx.stroke();
          ctx.fillStyle = '#fef08a';
          ctx.fillRect(x + cs - 1.5, y + cs * 0.5 - 1.5, 3, 3);
        }
        if (hasLockedWall(targetGrid, r, c, r + 1, c)) {
          ctx.strokeStyle = '#9f1239';
          ctx.lineWidth = 4.5;
          ctx.beginPath(); ctx.moveTo(x, y + cs); ctx.lineTo(x + cs, y + cs); ctx.stroke();
          ctx.fillStyle = '#fef08a';
          ctx.fillRect(x + cs * 0.5 - 1.5, y + cs - 1.5, 3, 3);
        }
      }
    }
    ctx.restore();
  }

  function drawSitePreviewExtras(ctx, stageObj, pcs) {
    if (!ctx || !stageObj) return;
    const gSize = typeof GRID !== 'undefined' ? GRID : DEFAULT_GRID;
    const obsT = typeof T !== 'undefined' ? T.OBSTACLE : 'obstacle';
    const emptyT = typeof T !== 'undefined' ? T.EMPTY : 'empty';

    const tempGrid = Array.from({ length: gSize }, () => Array.from({ length: gSize }, () => ({ type: emptyT })));
    if (Array.isArray(stageObj.obstacles)) {
      for (const obs of stageObj.obstacles) {
        for (let r = obs.r; r < obs.r + (obs.h || 1); r++) {
          for (let c = obs.c; c < obs.c + (obs.w || 1); c++) {
            if (r >= 0 && r < gSize && c >= 0 && c < gSize) {
              tempGrid[r][c] = { type: obsT };
            }
          }
        }
      }
    }
    if (stageObj.location) {
      drawBlueprintLocationOverlay(ctx, tempGrid, stageObj, pcs, false);
    }

    if (stageObj.renovation && Array.isArray(stageObj.renovation.pieces)) {
      const styleMap = typeof CELL_STYLE !== 'undefined' ? CELL_STYLE : {};
      for (const p of stageObj.renovation.pieces) {
        const st = styleMap[p.type] || { bg: '#dbeafe', border: '#93c5fd' };
        ctx.save();
        for (let dr = 0; dr < (p.h || 1); dr++) {
          for (let dc = 0; dc < (p.w || 1); dc++) {
            const rx = (p.c + dc) * pcs;
            const ry = (p.r + dr) * pcs;
            ctx.fillStyle = st.bg;
            ctx.fillRect(rx + 1, ry + 1, pcs - 2, pcs - 2);
            if (p.locked) {
              ctx.strokeStyle = '#334155';
              ctx.lineWidth = 1.5;
              ctx.strokeRect(rx + 1.5, ry + 1.5, pcs - 3, pcs - 3);
            } else {
              ctx.strokeStyle = '#d97706';
              ctx.lineWidth = 1.2;
              ctx.setLineDash([3, 2]);
              ctx.strokeRect(rx + 1.5, ry + 1.5, pcs - 3, pcs - 3);
              ctx.setLineDash([]);
            }
          }
        }
        const ax = (p.c + (p.w || 1) / 2) * pcs;
        const ay = (p.r + (p.h || 1) / 2) * pcs;
        ctx.fillStyle = '#0f172a';
        ctx.font = `bold ${Math.max(7, Math.round(pcs * 0.38))}px "Zen Kaku Gothic New", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.locked ? `🔒${p.label}` : p.label, ax, ay);
        ctx.restore();
      }
    }
  }

  global.DXStage2 = {
    LOCATION_DEFS,
    RENOVATION_TEMPLATES,
    getSideLabel,
    getLotBounds,
    isCellInLocationBand,
    isNonEncroachableObstacle,
    buildLocationPayload,
    pickLocationForLot,
    cellHasSightlineToSide,
    detectLocationCombos,
    buildRenovationStage,
    generateRenovationMission,
    injectRenovationGrid,
    hasLockedWall,
    getDemolishCost,
    findDemolishTargetAt,
    hasDemolishableCells,
    calcPreservedBaseCost,
    hasNoNegativeCombos,
    drawBlueprintLocationOverlay,
    drawBlueprintRenovationOverlays,
    drawSitePreviewExtras
  };
})(window);
