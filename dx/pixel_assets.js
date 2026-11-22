'use strict';
/**
 * pixel_assets.js
 * ハイブリッド型ドット絵アセットエンジン
 * - 床タイル: 24x24 基準（背景に徹する低コントラスト配色）
 * - 家具・設備・人物・オフィス什器: 48x48 基準（大型 96x48 / 48x96 / L字 96x96 / 壁飾 48x22 / 96x22）
 * - 外部PNG登録があればそちらを優先し、なければプロシージャル高精細ドット絵を生成する
 */
(function (global) {
  const registry = new Map();
  const externalSources = new Map();

  function createCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function registerCanvasAsset(id, w, h, drawFn) {
    const c = createCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const g = makeDrawHelper(ctx);
    drawFn(g, w, h);
    registry.set(id, { width: w, height: h, canvas: c, isExternal: false });
    return c;
  }

  function registerMirroredX(newId, sourceId) {
    const src = registry.get(sourceId);
    if (!src) return null;
    const c = createCanvas(src.width, src.height);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.translate(src.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(src.canvas, 0, 0);
    registry.set(newId, { width: src.width, height: src.height, canvas: c, isExternal: false });
    return c;
  }

  function makeDrawHelper(ctx) {
    const px = (x, y, col) => {
      ctx.fillStyle = col;
      ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1);
    };
    const rect = (x, y, w, h, col) => {
      if (w <= 0 || h <= 0) return;
      ctx.fillStyle = col;
      ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
    };
    const box = (x, y, w, h, fill, stroke, bw = 1) => {
      rect(x, y, w, h, stroke);
      if (w > bw * 2 && h > bw * 2) rect(x + bw, y + bw, w - bw * 2, h - bw * 2, fill);
    };
    const roundBox = (x, y, w, h, fill, stroke, r = 1) => {
      if (r >= 2 && w >= 6 && h >= 6) {
        rect(x + 2, y, w - 4, h, stroke);
        rect(x, y + 2, w, h - 4, stroke);
        rect(x + 1, y + 1, w - 2, h - 2, stroke);
        rect(x + 2, y + 2, w - 4, h - 4, fill);
      } else {
        rect(x + 1, y, w - 2, h, stroke);
        rect(x, y + 1, w, h - 2, stroke);
        if (w > 2 && h > 2) rect(x + 1, y + 1, w - 2, h - 2, fill);
      }
    };
    const shadow = (x, y, w, h = 4) => {
      rect(x, y, w, h, 'rgba(15, 23, 42, 0.16)');
    };
    const hline = (x, y, w, col) => rect(x, y, w, 1, col);
    const vline = (x, y, h, col) => rect(x, y, 1, h, col);
    return { ctx, px, rect, box, roundBox, shadow, hline, vline };
  }

  function registerExternal(id, url) {
    const img = new Image();
    const entry = { url, img, loaded: false };
    externalSources.set(id, entry);
    img.onload = () => {
      entry.loaded = true;
      const c = createCanvas(img.naturalWidth || img.width, img.naturalHeight || img.height);
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0);
      registry.set(id, { width: c.width, height: c.height, canvas: c, isExternal: true });
    };
    img.src = url;
  }

  function getSprite(id) {
    return registry.get(id) || null;
  }

  function drawSprite(ctx, id, dx, dy, dw, dh) {
    const spr = getSprite(id);
    if (!spr) return false;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(spr.canvas, dx, dy, dw, dh);
    ctx.restore();
    return true;
  }

  /* ============================================================
     1. 床タイル (24x24: 低コントラストで圧の少ない優しい背景)
  ============================================================ */
  function registerFloorTiles() {
    registerCanvasAsset('floor_outside', 24, 24, (g) => {
      g.rect(0, 0, 24, 24, '#e2e8f0');
      g.hline(0, 11, 24, '#d8e0eb');
      g.hline(0, 23, 24, '#d8e0eb');
      g.vline(11, 0, 12, '#d8e0eb');
      g.vline(23, 12, 12, '#d8e0eb');
      g.px(4, 4, '#eef2f7'); g.px(16, 7, '#d5dde8');
      g.px(7, 17, '#eef2f7'); g.px(19, 19, '#d5dde8');
    });

    registerCanvasAsset('floor_obstacle', 24, 24, (g) => {
      g.rect(0, 0, 24, 24, '#94a3b8');
      g.rect(2, 2, 5, 3, '#8897ab');
      g.rect(14, 13, 6, 4, '#8897ab');
      g.roundBox(4, 6, 5, 4, '#cbd5e1', '#64748b');
      g.roundBox(15, 16, 5, 4, '#cbd5e1', '#64748b');
      g.px(17, 5, '#65a30d'); g.px(18, 4, '#84cc16'); g.px(19, 5, '#65a30d');
      g.px(6, 18, '#65a30d'); g.px(7, 17, '#84cc16');
    });

    registerCanvasAsset('floor_garden', 24, 24, (g) => {
      g.rect(0, 0, 24, 24, '#b8e27a');
      const spots = [[3,4],[9,2],[17,6],[20,14],[12,11],[5,16],[15,20],[2,21],[21,3]];
      spots.forEach(([x, y], i) => {
        g.px(x, y, i % 2 === 0 ? '#a7d666' : '#c6ec8c');
        g.px(x + 1, y, i % 2 === 0 ? '#a7d666' : '#c6ec8c');
      });
    });

    registerCanvasAsset('floor_entrance', 24, 24, (g) => {
      g.rect(0, 0, 24, 24, '#e7e5e4');
      g.hline(0, 11, 24, '#d6d3d1');
      g.hline(0, 23, 24, '#d6d3d1');
      g.vline(11, 0, 24, '#d6d3d1');
      g.vline(23, 0, 24, '#d6d3d1');
      g.px(3, 3, '#f5f5f4'); g.px(15, 3, '#f5f5f4');
      g.px(3, 15, '#f5f5f4'); g.px(15, 15, '#f5f5f4');
    });

    registerCanvasAsset('floor_corridor', 24, 24, (g) => {
      g.rect(0, 0, 24, 24, '#fcf0d2');
      for (let x = 5; x < 24; x += 6) g.vline(x, 0, 24, '#f2dfb8');
      g.hline(0, 8, 6, '#f2dfb8');
      g.hline(6, 18, 6, '#f2dfb8');
      g.hline(12, 5, 6, '#f2dfb8');
      g.hline(18, 14, 6, '#f2dfb8');
    });

    registerCanvasAsset('floor_ldk', 24, 24, (g) => {
      g.rect(0, 0, 24, 24, '#fae0be');
      for (let y = 5; y < 24; y += 6) g.hline(0, y, 24, '#efd0aa');
      g.vline(8, 0, 6, '#efd0aa');
      g.vline(18, 6, 6, '#efd0aa');
      g.vline(4, 12, 6, '#efd0aa');
      g.vline(14, 18, 6, '#efd0aa');
      g.hline(2, 2, 4, '#fdf0dc');
      g.hline(11, 14, 5, '#fdf0dc');
    });

    registerCanvasAsset('floor_room', 24, 24, (g) => {
      g.rect(0, 0, 24, 24, '#efe0cb');
      for (let y = 5; y < 24; y += 6) g.hline(0, y, 24, '#e3d0b6');
      g.vline(12, 0, 6, '#e3d0b6');
      g.vline(6, 6, 6, '#e3d0b6');
      g.vline(18, 12, 6, '#e3d0b6');
      g.vline(10, 18, 6, '#e3d0b6');
    });

    registerCanvasAsset('floor_washitsu', 24, 24, (g) => {
      g.rect(0, 0, 24, 24, '#c1d691');
      for (let y = 2; y < 24; y += 2) {
        g.hline(0, y, 24, y % 4 === 0 ? '#b7cd86' : '#c9dc9c');
      }
      g.hline(0, 0, 24, '#6b8749');
      g.hline(0, 11, 24, '#6b8749');
      g.hline(0, 12, 24, '#8aa564');
      g.vline(11, 0, 12, '#8aa564');
      g.vline(23, 12, 12, '#8aa564');
    });

    registerCanvasAsset('floor_bath', 24, 24, (g) => {
      g.rect(0, 0, 24, 24, '#d8f1fd');
      g.hline(0, 7, 24, '#c3e7fa'); g.hline(0, 15, 24, '#c3e7fa'); g.hline(0, 23, 24, '#c3e7fa');
      g.vline(7, 0, 24, '#c3e7fa'); g.vline(15, 0, 24, '#c3e7fa'); g.vline(23, 0, 24, '#c3e7fa');
      g.px(2, 2, '#eef9ff'); g.px(10, 10, '#eef9ff'); g.px(18, 18, '#eef9ff');
    });

    registerCanvasAsset('floor_ub', 24, 24, (g) => {
      g.rect(0, 0, 24, 24, '#f8fafc');
      g.hline(0, 11, 24, '#e8eef5'); g.hline(0, 23, 24, '#e8eef5');
      g.vline(11, 0, 24, '#e8eef5'); g.vline(23, 0, 24, '#e8eef5');
    });

    registerCanvasAsset('floor_toilet', 24, 24, (g) => {
      g.rect(0, 0, 24, 24, '#fefce8');
      g.rect(0, 0, 12, 12, '#fcf6d2');
      g.rect(12, 12, 12, 12, '#fcf6d2');
    });

    registerCanvasAsset('floor_washroom', 24, 24, (g) => {
      g.rect(0, 0, 24, 24, '#e6fbf3');
      g.hline(0, 11, 24, '#cff3e5'); g.hline(0, 23, 24, '#cff3e5');
      g.vline(11, 0, 24, '#cff3e5'); g.vline(23, 0, 24, '#cff3e5');
    });

    registerCanvasAsset('floor_closet', 24, 24, (g) => {
      g.rect(0, 0, 24, 24, '#cbb195');
      for (let y = 5; y < 24; y += 6) g.hline(0, y, 24, '#bda183');
      g.vline(9, 0, 6, '#bda183'); g.vline(16, 12, 6, '#bda183');
    });

    registerCanvasAsset('floor_darkness', 24, 24, (g) => {
      g.rect(0, 0, 24, 24, '#241f3b');
      g.hline(0, 11, 24, '#1b172e'); g.hline(0, 23, 24, '#1b172e');
      g.vline(11, 0, 12, '#1b172e'); g.vline(23, 12, 12, '#1b172e');
    });
  }

  /* ============================================================
     2. 家具・設備・ネタ家具 (48x48 基準 / 96x48 / 48x96 / 壁48x22)
     - 主要輪郭2px + 繊細1pxディテールで壁際密着＆質感を際立たせる
  ============================================================ */
  function registerFurniture() {
    const INK = '#1e293b';
    const SLATE_LN = '#475569';
    const WOOD_DK = '#5c371e';
    const WOOD_MD = '#9c5d33';
    const WOOD_LT = '#d49a6a';
    const WOOD_HI = '#f0c8a0';

    const drawPottedAccent = (g, x, y) => {
      g.roundBox(x, y + 6, 8, 8, '#e07a5f', '#7c2d12');
      g.hline(x + 1, y + 7, 6, '#f4a261');
      g.roundBox(x - 1, y + 1, 10, 6, '#16a34a', '#14532d');
      g.rect(x + 1, y, 5, 3, '#4ade80');
      g.px(x + 2, y + 2, '#bbf7d0');
    };

    // 玄関: 下駄箱＋小鉢 (48x48)
    registerCanvasAsset('furn_shoesbox', 48, 48, (g) => {
      g.shadow(7, 36, 34, 4);
      g.roundBox(7, 14, 27, 22, WOOD_MD, WOOD_DK, 2);
      g.rect(9, 16, 23, 6, WOOD_LT);
      g.hline(9, 16, 23, WOOD_HI);
      g.hline(9, 22, 23, WOOD_DK);
      g.rect(20, 23, 2, 11, WOOD_DK);
      g.rect(14, 26, 4, 2, WOOD_HI); g.rect(24, 26, 4, 2, WOOD_HI);
      // ルーバー
      [25, 28, 31].forEach(yy => {
        g.hline(11, yy, 7, WOOD_DK);
        g.hline(24, yy, 7, WOOD_DK);
      });
      drawPottedAccent(g, 35, 22);
    });

    // 玄関: マット＆傘立て (48x48)
    registerCanvasAsset('furn_mat', 48, 48, (g) => {
      g.roundBox(7, 26, 27, 14, '#dc2626', '#7f1d1d', 2);
      g.box(11, 29, 19, 8, '#fca5a5', '#b91c1c');
      g.rect(14, 31, 13, 4, '#ef4444');
      // 傘立て＋傘2本
      g.shadow(34, 36, 9, 3);
      g.roundBox(34, 19, 9, 17, '#94a3b8', INK, 2);
      g.rect(36, 12, 2, 9, '#3b82f6');
      g.rect(39, 14, 2, 7, '#eab308');
      g.px(35, 11, '#1d4ed8'); g.px(41, 13, '#a16207');
    });

    // 観葉植物 (48x48: 葉の陰影と木製鉢カバー付き)
    registerCanvasAsset('furn_plant', 48, 48, (g) => {
      g.shadow(15, 38, 18, 4);
      g.roundBox(17, 29, 14, 11, '#d97706', '#78350f', 2);
      g.rect(18, 30, 12, 3, '#f59e0b');
      g.rect(22, 22, 4, 8, WOOD_DK);
      // 重なり合う葉
      g.roundBox(11, 15, 26, 14, '#15803d', '#14532d', 2);
      g.roundBox(15, 9, 18, 12, '#16a34a', '#14532d', 2);
      g.rect(18, 11, 10, 5, '#22c55e');
      g.rect(12, 18, 8, 5, '#22c55e');
      g.rect(27, 17, 8, 5, '#16a34a');
      g.rect(19, 12, 4, 2, '#86efac');
      g.rect(14, 19, 3, 2, '#86efac');
    });

    // 大ホワイエ豪華ラグ (48x48)
    registerCanvasAsset('furn_rug_foyer', 48, 48, (g) => {
      g.rect(4, 4, 40, 40, '#991b1b');
      g.box(6, 6, 36, 36, '#b91c1c', '#fbbf24', 2);
      g.box(12, 12, 24, 24, '#991b1b', '#fde68a', 2);
      g.rect(18, 18, 12, 12, '#fbbf24');
      g.rect(20, 20, 8, 8, '#dc2626');
      // 房飾り
      for (let x = 6; x < 42; x += 4) {
        g.rect(x, 2, 2, 2, '#fef3c7');
        g.rect(x, 44, 2, 2, '#fef3c7');
      }
    });

    // ロングコリドー・レッドカーペット (48x48)
    registerCanvasAsset('furn_rug_red', 48, 48, (g) => {
      g.rect(0, 8, 48, 32, '#991b1b');
      g.rect(0, 10, 48, 2, '#fbbf24');
      g.rect(0, 36, 48, 2, '#fbbf24');
      g.rect(0, 14, 48, 20, '#dc2626');
      g.hline(0, 16, 48, '#ef4444');
    });

    // システムキッチン (96x48: 2マス幅・ステンレス＋包丁＆まな板＋コンロ＆お鍋)
    registerCanvasAsset('furn_kitchen', 96, 48, (g) => {
      g.shadow(7, 38, 82, 4);
      g.roundBox(7, 9, 82, 29, '#f8fafc', SLATE_LN, 2);
      // 背面パネル＆前面キャビネット
      g.rect(9, 26, 78, 10, '#cbd5e1');
      g.vline(34, 26, 10, '#94a3b8');
      g.vline(61, 26, 10, '#94a3b8');
      g.hline(17, 29, 10, '#64748b');
      g.hline(43, 29, 10, '#64748b');
      g.hline(70, 29, 10, '#64748b');
      // 左: ステンレスシンク＋蛇口
      g.box(13, 13, 20, 11, '#7dd3fc', '#64748b', 2);
      g.rect(16, 16, 6, 3, '#bae6fd');
      g.rect(22, 11, 3, 4, '#334155');
      g.rect(22, 14, 3, 2, '#cbd5e1');
      // 中央: 木製まな板＋野菜＋包丁
      g.roundBox(39, 15, 16, 9, '#fde68a', '#d97706');
      g.rect(42, 17, 5, 3, '#f97316'); // にんじん
      g.rect(48, 17, 5, 2, '#94a3b8');
      // 右: IH/ガス2口コンロ＋赤い両手鍋
      g.box(61, 13, 23, 11, '#334155', INK, 2);
      g.roundBox(64, 15, 7, 7, '#ef4444', '#991b1b');
      g.rect(66, 16, 3, 2, '#fca5a5');
      g.roundBox(74, 15, 7, 7, '#64748b', '#1e293b');
    });

    // 冷蔵庫 (48x48)
    registerCanvasAsset('furn_fridge', 48, 48, (g) => {
      g.shadow(13, 39, 22, 4);
      g.roundBox(13, 6, 22, 33, '#f8fafc', '#64748b', 2);
      g.rect(15, 8, 18, 11, '#ffffff');
      g.rect(15, 19, 18, 2, '#94a3b8');
      g.rect(15, 21, 18, 16, '#f1f5f9');
      // ドアハンドル＆製氷タッチパネル
      g.rect(29, 11, 2, 6, '#64748b');
      g.rect(29, 24, 2, 9, '#64748b');
      g.rect(17, 11, 4, 3, '#bae6fd');
    });

    // ダイニングテーブル＆椅子 (48x48)
    registerCanvasAsset('furn_dining', 48, 48, (g) => {
      g.shadow(9, 39, 30, 4);
      g.roundBox(17, 6, 14, 7, WOOD_MD, WOOD_DK, 2);
      g.roundBox(17, 35, 14, 7, WOOD_MD, WOOD_DK, 2);
      g.roundBox(8, 13, 32, 22, WOOD_LT, WOOD_DK, 2);
      g.rect(10, 15, 28, 16, WOOD_HI);
      // ランチョンマット＋お皿＋ティーポット
      g.roundBox(13, 19, 7, 7, '#ffffff', '#cbd5e1');
      g.roundBox(28, 21, 7, 7, '#ffffff', '#cbd5e1');
      g.roundBox(21, 17, 5, 5, '#ef4444', '#991b1b');
      g.rect(22, 18, 2, 2, '#fecaca');
    });

    // ソファ (96x48: ふかふかクッション＋ひじ掛け＋ステッチ)
    registerCanvasAsset('furn_sofa', 96, 48, (g) => {
      g.shadow(11, 39, 74, 4);
      g.roundBox(11, 11, 74, 28, '#e11d48', '#881337', 2);
      g.rect(13, 13, 70, 9, '#fb7185'); // 背もたれ
      g.hline(14, 15, 68, '#fda4af');
      // 肘掛け
      g.roundBox(13, 18, 7, 17, '#be123c', '#881337');
      g.roundBox(76, 18, 7, 17, '#be123c', '#881337');
      // 座面クッション2つ
      g.roundBox(21, 22, 26, 13, '#f43f5e', '#9f1239');
      g.roundBox(49, 22, 26, 13, '#f43f5e', '#9f1239');
      // アクセント小さなクッション
      g.roundBox(23, 21, 7, 6, '#fef3c7', '#d97706');
    });

    // テレビ＆TVボード (48x48)
    registerCanvasAsset('furn_tv', 48, 48, (g) => {
      g.shadow(7, 36, 34, 4);
      g.roundBox(7, 24, 34, 12, WOOD_MD, WOOD_DK, 2);
      g.rect(9, 26, 30, 4, WOOD_LT);
      g.rect(12, 31, 10, 3, WOOD_DK); g.rect(26, 31, 10, 3, WOOD_DK);
      g.roundBox(11, 9, 26, 17, '#1e293b', INK, 2);
      g.rect(13, 11, 22, 13, '#38bdf8');
      g.rect(15, 13, 8, 4, '#bae6fd');
      g.px(32, 24, '#22c55e');
    });

    // シングルベッド (48x48)
    registerCanvasAsset('furn_bed_s', 48, 48, (g) => {
      g.shadow(11, 39, 26, 4);
      g.roundBox(11, 7, 26, 33, '#f8fafc', WOOD_DK, 2);
      g.rect(13, 9, 22, 4, WOOD_MD);
      g.roundBox(15, 14, 18, 7, '#ffffff', '#cbd5e1', 2);
      g.rect(13, 21, 22, 17, '#60a5fa');
      g.rect(13, 21, 22, 3, '#93c5fd'); // 折り返しシーツ
      g.rect(13, 32, 22, 6, '#3b82f6');
    });

    // ダブルベッド (96x48)
    registerCanvasAsset('furn_bed_w', 96, 48, (g) => {
      g.shadow(15, 39, 66, 4);
      g.roundBox(15, 7, 66, 33, '#f8fafc', WOOD_DK, 2);
      g.rect(17, 9, 62, 4, WOOD_MD);
      g.roundBox(21, 14, 23, 7, '#ffffff', '#cbd5e1', 2);
      g.roundBox(52, 14, 23, 7, '#ffffff', '#cbd5e1', 2);
      g.rect(17, 21, 62, 17, '#a855f7');
      g.rect(17, 21, 62, 3, '#d8b4fe');
      g.rect(17, 32, 62, 6, '#7e22ce');
    });

    // パソコンデスク＆チェア (48x48)
    registerCanvasAsset('furn_desk', 48, 48, (g) => {
      g.shadow(7, 31, 34, 4);
      g.roundBox(7, 9, 34, 19, WOOD_LT, WOOD_DK, 2);
      g.rect(9, 22, 30, 4, WOOD_MD);
      g.box(15, 11, 18, 9, '#38bdf8', INK, 2);
      g.rect(17, 13, 7, 3, '#bae6fd');
      g.rect(17, 21, 12, 3, '#e2e8f0'); // キーボード
      g.rect(31, 21, 3, 3, '#94a3b8');  // マウス
      g.rect(9, 14, 4, 4, '#d97706');   // マグ
      g.roundBox(17, 30, 14, 11, '#475569', INK, 2);
      g.rect(19, 32, 10, 6, '#64748b');
    });

    // 本棚 (48x48)
    registerCanvasAsset('furn_bookshelf', 48, 48, (g) => {
      g.shadow(9, 38, 30, 4);
      g.roundBox(9, 6, 30, 33, WOOD_MD, WOOD_DK, 2);
      const cols = ['#ef4444', '#3b82f6', '#eab308', '#22c55e', '#f8fafc', '#a855f7', '#fb923c'];
      [10, 19, 28].forEach((ry, rowI) => {
        g.rect(11, ry + 7, 26, 2, WOOD_DK);
        for (let bx = 12; bx < 36; bx += 3) {
          const hDiff = ((bx + rowI) % 2);
          g.rect(bx, ry + hDiff, 2, 7 - hDiff, cols[(bx + rowI * 3) % cols.length]);
        }
      });
    });

    // 和室: ちゃぶ台＆座布団 (48x48)
    registerCanvasAsset('furn_chabudai', 48, 48, (g) => {
      g.roundBox(17, 6, 14, 9, '#15803d', '#14532d', 2);
      g.roundBox(17, 33, 14, 9, '#15803d', '#14532d', 2);
      g.shadow(11, 30, 26, 4);
      g.roundBox(11, 13, 26, 20, WOOD_LT, WOOD_DK, 2);
      g.rect(13, 15, 22, 15, WOOD_HI);
      // 急須＆湯呑み2つ
      g.roundBox(17, 19, 5, 5, '#f8fafc', '#94a3b8');
      g.roundBox(26, 18, 4, 4, '#16a34a', '#14532d');
      g.roundBox(25, 24, 4, 4, '#16a34a', '#14532d');
    });

    // 和室: こたつ＆みかん (48x48)
    registerCanvasAsset('furn_kotatsu', 48, 48, (g) => {
      g.shadow(7, 37, 34, 4);
      g.roundBox(7, 11, 34, 28, '#dc2626', '#7f1d1d', 2);
      g.box(9, 13, 30, 24, '#ef4444', '#b91c1c');
      g.roundBox(12, 16, 24, 18, WOOD_LT, WOOD_DK, 2);
      g.rect(14, 18, 20, 14, WOOD_HI);
      // お盆＋みかん盛り
      g.roundBox(19, 20, 10, 9, '#78350f', WOOD_DK);
      g.rect(21, 22, 3, 3, '#f97316');
      g.rect(24, 23, 3, 3, '#fb923c');
      g.rect(22, 20, 3, 3, '#f97316');
      g.px(23, 20, '#22c55e');
    });

    // 和室: お布団 (48x48)
    registerCanvasAsset('furn_futon', 48, 48, (g) => {
      g.shadow(11, 39, 26, 4);
      g.roundBox(11, 7, 26, 33, '#f8fafc', '#64748b', 2);
      g.roundBox(15, 10, 18, 6, '#e2e8f0', '#94a3b8', 2);
      g.rect(13, 18, 22, 20, '#f43f5e');
      g.rect(13, 18, 22, 3, '#fda4af');
      g.rect(13, 32, 22, 6, '#e11d48');
    });

    // 和室: 床の間（掛け軸＋盆栽）(48x48)
    registerCanvasAsset('furn_tokonoma', 48, 48, (g) => {
      g.box(15, 5, 18, 21, '#fef3c7', WOOD_DK, 2);
      g.rect(17, 7, 14, 17, '#fef9c3');
      g.rect(23, 10, 2, 10, '#1e293b');
      g.rect(21, 13, 6, 2, '#1e293b');
      g.px(26, 21, '#dc2626');
      // 床板＋盆栽
      g.roundBox(7, 26, 34, 13, WOOD_MD, WOOD_DK, 2);
      g.roundBox(27, 20, 9, 8, '#15803d', '#14532d');
      g.rect(29, 18, 5, 4, '#22c55e');
      g.rect(29, 28, 5, 4, '#78350f');
    });

    // 浴室: 標準バスタブ＋風呂桶 (48x48)
    registerCanvasAsset('furn_bath_tub', 48, 48, (g) => {
      g.shadow(7, 33, 34, 4);
      g.roundBox(7, 9, 34, 25, '#ffffff', '#64748b', 2);
      g.rect(11, 13, 26, 17, '#38bdf8');
      g.rect(13, 15, 9, 4, '#bae6fd');
      g.rect(24, 24, 9, 2, '#7dd3fc');
      // 蛇口＆シャンプーボトル
      g.rect(9, 18, 3, 4, '#cbd5e1');
      g.rect(34, 11, 3, 4, '#f43f5e');
      g.rect(38, 12, 3, 3, '#3b82f6');
      // 黄色の桶
      g.roundBox(11, 36, 9, 6, '#facc15', '#ca8a04');
    });

    // ユニットバス (96x48: 浴槽＋洗面＋便器一体)
    registerCanvasAsset('furn_ub', 96, 48, (g) => {
      g.shadow(7, 37, 82, 4);
      g.roundBox(7, 9, 42, 29, '#ffffff', '#64748b', 2);
      g.rect(11, 13, 34, 21, '#38bdf8');
      g.rect(15, 16, 11, 4, '#bae6fd');
      g.roundBox(52, 11, 16, 15, '#f8fafc', '#64748b', 2);
      g.rect(56, 15, 8, 7, '#7dd3fc');
      g.roundBox(71, 9, 17, 10, '#ffffff', '#64748b', 2);
      g.roundBox(73, 19, 13, 16, '#f1f5f9', '#64748b', 2);
      g.rect(76, 23, 7, 6, '#bae6fd');
    });

    // トイレ: 洋式便器 (48x48)
    registerCanvasAsset('furn_toilet', 48, 48, (g) => {
      g.roundBox(13, 28, 22, 13, '#fce7f3', '#f472b6', 2);
      g.shadow(15, 32, 18, 4);
      g.roundBox(15, 8, 18, 9, '#ffffff', '#64748b', 2);
      g.rect(31, 11, 3, 2, '#94a3b8'); // レバー
      g.roundBox(17, 17, 14, 15, '#ffffff', '#64748b', 2);
      g.rect(20, 21, 8, 7, '#bae6fd');
      g.roundBox(35, 14, 5, 7, '#f8fafc', '#94a3b8'); // ペーパー
    });

    // 独立洗面台 (48x48)
    registerCanvasAsset('furn_washbasin', 48, 48, (g) => {
      g.box(13, 6, 22, 11, '#bae6fd', '#64748b', 2);
      g.hline(17, 10, 6, '#ffffff');
      g.shadow(9, 34, 30, 4);
      g.roundBox(9, 18, 30, 18, '#ffffff', '#64748b', 2);
      g.roundBox(15, 22, 18, 10, '#7dd3fc', '#38bdf8');
      g.rect(22, 19, 4, 4, '#475569');
      g.rect(11, 20, 3, 5, '#fb7185'); // コップ
    });

    // 洗濯機 (48x48)
    registerCanvasAsset('furn_washer', 48, 48, (g) => {
      g.shadow(11, 38, 26, 4);
      g.roundBox(11, 8, 26, 30, '#ffffff', '#64748b', 2);
      g.rect(13, 10, 22, 6, '#cbd5e1');
      g.rect(15, 12, 6, 2, '#38bdf8');
      g.roundBox(17, 19, 14, 14, '#38bdf8', '#475569', 2);
      g.rect(20, 22, 4, 4, '#e0f2fe');
    });

    // 収納: ハンガーラック & 段ボール (48x48)
    registerCanvasAsset('furn_closet_rack', 48, 48, (g) => {
      g.rect(9, 8, 30, 2, '#475569');
      g.rect(11, 9, 2, 14, '#64748b'); g.rect(35, 9, 2, 14, '#64748b');
      g.roundBox(14, 11, 5, 12, '#ef4444', '#991b1b');
      g.roundBox(21, 11, 5, 12, '#3b82f6', '#1e3a8a');
      g.roundBox(28, 11, 5, 12, '#eab308', '#a16207');
      g.shadow(11, 36, 26, 4);
      g.roundBox(11, 25, 26, 13, WOOD_LT, WOOD_DK, 2);
      g.rect(13, 30, 22, 2, WOOD_MD);
    });

    // 収納が本体: 大型スチールラック (48x48)
    registerCanvasAsset('furn_rack_steel', 48, 48, (g) => {
      g.shadow(7, 38, 34, 4);
      g.box(7, 7, 34, 32, '#94a3b8', '#475569', 2);
      [17, 27].forEach(sy => g.rect(9, sy, 30, 2, '#475569'));
      g.roundBox(11, 9, 11, 7, WOOD_LT, WOOD_DK);
      g.roundBox(25, 9, 10, 7, '#3b82f6', '#1e3a8a');
      g.roundBox(11, 19, 9, 7, '#eab308', '#a16207');
      g.roundBox(23, 20, 12, 6, WOOD_MD, WOOD_DK);
      g.roundBox(13, 29, 22, 8, WOOD_LT, WOOD_DK);
    });

    // 庭: 花壇 (48x48)
    registerCanvasAsset('furn_flower', 48, 48, (g) => {
      g.rect(11, 20, 9, 4, '#15803d'); g.roundBox(13, 15, 5, 5, '#f43f5e', '#be123c'); g.px(15, 17, '#fef08a');
      g.rect(27, 13, 9, 4, '#15803d'); g.roundBox(29, 8, 5, 5, '#facc15', '#ca8a04'); g.px(31, 10, '#ffffff');
      g.rect(19, 32, 9, 4, '#15803d'); g.roundBox(21, 27, 5, 5, '#a855f7', '#6b21a8'); g.px(23, 29, '#fef08a');
    });

    // 庭: 木 (48x48)
    registerCanvasAsset('furn_tree', 48, 48, (g) => {
      g.shadow(14, 38, 20, 4);
      g.rect(20, 28, 8, 12, WOOD_DK);
      g.rect(22, 28, 4, 12, WOOD_MD);
      g.roundBox(9, 7, 30, 25, '#15803d', '#14532d', 2);
      g.roundBox(13, 10, 21, 15, '#16a34a', '#15803d', 2);
      g.rect(16, 12, 10, 5, '#22c55e');
      g.rect(17, 13, 4, 2, '#86efac');
    });

    // もはや公園: 砂場 (96x48)
    registerCanvasAsset('furn_sandbox', 96, 48, (g) => {
      g.shadow(9, 38, 78, 4);
      g.roundBox(9, 9, 78, 29, '#d97706', WOOD_DK, 2);
      g.rect(13, 13, 70, 21, '#fde68a');
      g.roundBox(22, 19, 12, 8, '#fcd34d', '#f59e0b'); // 砂山
      g.roundBox(57, 17, 9, 9, '#ef4444', '#991b1b');   // 赤バケツ
      g.rect(69, 23, 7, 4, '#3b82f6');                  // スコップ
    });

    // もはや公園: すべり台 (48x48)
    registerCanvasAsset('furn_slide', 48, 48, (g) => {
      g.shadow(8, 36, 32, 4);
      g.rect(10, 11, 7, 25, '#475569');
      g.roundBox(13, 9, 11, 8, '#ef4444', INK, 2);
      for (let i = 0; i < 16; i++) {
        g.rect(20 + i, 16 + i, 8, 3, '#facc15');
        g.rect(20 + i, 19 + i, 8, 2, '#ca8a04');
      }
    });

    // もはや公園: ベンチ (48x48)
    registerCanvasAsset('furn_bench', 48, 48, (g) => {
      g.shadow(7, 35, 34, 4);
      g.roundBox(7, 13, 34, 19, WOOD_LT, WOOD_DK, 2);
      g.rect(9, 20, 30, 2, WOOD_DK);
      g.rect(9, 24, 30, 4, WOOD_HI);
      g.rect(11, 32, 4, 5, '#334155');
      g.rect(33, 32, 4, 5, '#334155');
    });

    // もはや銭湯: 富士山壁画 (96x48)
    registerCanvasAsset('furn_fuji', 96, 48, (g) => {
      g.box(4, 4, 88, 39, '#38bdf8', WOOD_DK, 2);
      g.roundBox(18, 9, 9, 9, '#fde047', '#facc15');
      for (let row = 0; row < 22; row++) {
        const halfW = 6 + row * 2;
        const cx = 50;
        const y = 12 + row;
        g.hline(cx - halfW, y, halfW * 2, row < 8 ? '#ffffff' : '#2563eb');
      }
      g.rect(6, 33, 84, 7, '#16a34a');
      g.rect(6, 38, 84, 3, '#14532d');
    });

    // もはや銭湯: 大浴槽 (96x48)
    registerCanvasAsset('furn_sento_tub', 96, 48, (g) => {
      g.shadow(5, 38, 86, 4);
      g.roundBox(5, 7, 86, 33, '#f8fafc', '#64748b', 2);
      g.rect(9, 11, 78, 25, '#0ea5e9');
      g.rect(13, 13, 70, 21, '#38bdf8');
      g.rect(19, 17, 17, 4, '#bae6fd');
      g.rect(54, 24, 20, 4, '#bae6fd');
    });

    // もはや銭湯: 黄色い洗面桶（ケロリン風）(48x48)
    registerCanvasAsset('furn_kerorin', 48, 48, (g) => {
      g.shadow(10, 31, 15, 3);
      g.roundBox(10, 17, 15, 13, '#facc15', '#a16207', 2);
      g.rect(12, 19, 11, 7, '#e0f2fe');
      g.rect(16, 21, 3, 2, '#ef4444');
      g.roundBox(28, 21, 11, 9, '#38bdf8', '#0284c7', 2);
    });

    // 封印されし闇: 棺桶 (48x48)
    registerCanvasAsset('furn_coffin', 48, 48, (g) => {
      g.shadow(13, 39, 22, 4);
      g.roundBox(15, 7, 18, 9, '#4c1d95', '#1e1b4b', 2);
      g.roundBox(13, 13, 22, 18, '#581c87', '#1e1b4b', 2);
      g.roundBox(15, 29, 18, 10, '#4c1d95', '#1e1b4b', 2);
      g.rect(23, 14, 2, 16, '#fbbf24');
      g.rect(18, 19, 12, 2, '#fbbf24');
    });

    // 封印されし闇: ロウソク台 (48x48)
    registerCanvasAsset('furn_candle', 48, 48, (g) => {
      g.rect(22, 9, 4, 4, '#fef08a');
      g.rect(22, 12, 4, 4, '#f97316');
      g.box(19, 16, 10, 13, '#f8fafc', '#64748b', 2);
      g.roundBox(15, 29, 18, 8, '#fbbf24', '#92400e', 2);
    });

    // 玄関土間: 揃えて脱いだ靴 (48x24)
    registerCanvasAsset('furn_shoes_pair', 48, 24, (g) => {
      // 革靴ペア
      g.roundBox(9, 5, 7, 13, '#b45309', '#451a03');
      g.rect(11, 7, 3, 3, '#fde68a');
      g.roundBox(18, 5, 7, 13, '#b45309', '#451a03');
      g.rect(20, 7, 3, 3, '#fde68a');
      // スニーカーペア
      g.roundBox(28, 7, 7, 11, '#3b82f6', '#1e3a8a');
      g.rect(30, 8, 3, 3, '#ffffff');
      g.roundBox(37, 7, 7, 11, '#3b82f6', '#1e3a8a');
      g.rect(39, 8, 3, 3, '#ffffff');
    });

    // 玄関隅: スリム下駄箱 (4方向壁密着・48x48)
    registerCanvasAsset('furn_shoesbox_slim_north', 48, 48, (g) => {
      g.shadow(11, 21, 26, 3);
      g.roundBox(11, 2, 26, 18, WOOD_MD, WOOD_DK, 2);
      g.rect(13, 4, 22, 5, WOOD_LT);
      g.rect(13, 10, 22, 2, WOOD_DK);
      g.rect(17, 13, 5, 2, WOOD_HI); g.rect(26, 13, 5, 2, WOOD_HI);
      g.roundBox(31, 0, 5, 4, '#16a34a', '#14532d');
    });
    registerCanvasAsset('furn_shoesbox_slim_west', 48, 48, (g) => {
      // 左壁にピッタリ寄せた薄型木製シューズ棚
      g.shadow(2, 37, 15, 3);
      g.roundBox(1, 9, 15, 28, WOOD_MD, WOOD_DK, 2);
      g.rect(3, 11, 8, 24, WOOD_LT); // 上面天板
      g.rect(11, 11, 3, 24, WOOD_DK); // 正面縦パネルエッジ
      g.rect(13, 17, 2, 4, WOOD_HI);
      g.rect(13, 26, 2, 4, WOOD_HI);
      // 上に載せた鍵トレイ＆小鉢
      g.roundBox(3, 24, 6, 6, '#e07a5f', '#7c2d12');
      g.rect(4, 15, 5, 6, '#16a34a'); g.px(6, 14, '#4ade80');
    });
    registerMirroredX('furn_shoesbox_slim_east', 'furn_shoesbox_slim_west');
    registerCanvasAsset('furn_shoesbox_slim_south', 48, 48, (g) => {
      g.roundBox(11, 29, 26, 17, WOOD_MD, WOOD_DK, 2);
      g.rect(13, 31, 22, 9, WOOD_LT);
      g.rect(30, 33, 6, 4, '#16a34a');
    });
    registry.set('furn_shoesbox_slim', registry.get('furn_shoesbox_slim_north'));

    // 壁向き別: 洗面台 (48x48 — 鏡＆蛇口＆ボウルが壁側にしっかり寄る！)
    registerCanvasAsset('furn_washbasin_north', 48, 48, (g) => {
      g.box(13, 0, 22, 10, '#bae6fd', '#64748b', 2);
      g.hline(17, 4, 6, '#ffffff');
      g.shadow(9, 28, 30, 3);
      g.roundBox(9, 10, 30, 18, '#ffffff', '#64748b', 2);
      g.roundBox(15, 13, 18, 10, '#7dd3fc', '#38bdf8');
      g.rect(22, 10, 4, 4, '#475569');
      g.rect(11, 12, 3, 5, '#fb7185');
    });
    registerCanvasAsset('furn_washbasin_west', 48, 48, (g) => {
      g.shadow(1, 37, 19, 3);
      // 左壁に縦鏡＋張り出した白カウンター＋丸ボウル＋銀蛇口
      g.rect(1, 9, 4, 28, '#38bdf8');
      g.rect(1, 9, 2, 28, '#475569');
      g.roundBox(4, 9, 17, 28, '#ffffff', '#64748b', 2);
      g.roundBox(8, 16, 9, 14, '#7dd3fc', '#38bdf8');
      g.rect(5, 22, 4, 2, '#475569'); // 横蛇口
      g.rect(9, 11, 3, 4, '#fb7185'); // コップ
    });
    registerMirroredX('furn_washbasin_east', 'furn_washbasin_west');
    registerCanvasAsset('furn_washbasin_south', 48, 48, (g) => {
      g.roundBox(9, 25, 30, 20, '#ffffff', '#64748b', 2);
      g.roundBox(15, 28, 18, 10, '#7dd3fc', '#38bdf8');
      g.rect(11, 43, 26, 3, '#475569');
    });
    registry.set('furn_washbasin', registry.get('furn_washbasin_north'));

    // 壁向き別: 本棚 (48x48 — 東西壁にピッタリ沿うスリム書棚)
    registerCanvasAsset('furn_bookshelf_north', 48, 48, (g) => {
      g.shadow(9, 34, 30, 3);
      g.roundBox(9, 2, 30, 31, WOOD_MD, WOOD_DK, 2);
      const cols = ['#ef4444', '#3b82f6', '#eab308', '#22c55e', '#f8fafc', '#a855f7'];
      [6, 14, 22].forEach((ry, rowI) => {
        g.rect(11, ry + 6, 26, 2, WOOD_DK);
        for (let bx = 12; bx < 36; bx += 3) {
          g.rect(bx, ry, 2, 6, cols[(bx + rowI * 2) % cols.length]);
        }
      });
    });
    registerCanvasAsset('furn_bookshelf_west', 48, 48, (g) => {
      g.shadow(1, 39, 17, 3);
      g.roundBox(1, 7, 17, 32, WOOD_MD, WOOD_DK, 2);
      g.rect(3, 9, 8, 28, WOOD_LT); // 上面天板
      const cols = ['#ef4444', '#3b82f6', '#eab308', '#22c55e', '#a855f7', '#fb923c'];
      for (let by = 9; by < 36; by += 3) {
        g.rect(12, by, 4, 2, cols[by % cols.length]);
      }
      g.rect(16, 9, 2, 28, WOOD_DK);
    });
    registerMirroredX('furn_bookshelf_east', 'furn_bookshelf_west');
    registerCanvasAsset('furn_bookshelf_south', 48, 48, (g) => {
      g.roundBox(9, 27, 30, 19, WOOD_MD, WOOD_DK, 2);
      g.rect(11, 29, 26, 10, WOOD_LT);
      g.rect(11, 41, 26, 3, WOOD_DK);
    });
    registry.set('furn_bookshelf', registry.get('furn_bookshelf_north'));

    // 壁向き別: 洗濯機 (48x48)
    registerCanvasAsset('furn_washer_north', 48, 48, (g) => {
      g.shadow(11, 34, 26, 3);
      g.roundBox(11, 3, 26, 29, '#ffffff', '#64748b', 2);
      g.rect(13, 5, 22, 6, '#cbd5e1');
      g.roundBox(17, 14, 14, 13, '#38bdf8', '#475569', 2);
      g.rect(20, 17, 4, 4, '#e0f2fe');
    });
    registerCanvasAsset('furn_washer_west', 48, 48, (g) => {
      g.shadow(1, 35, 23, 3);
      g.roundBox(1, 11, 23, 23, '#ffffff', '#64748b', 2);
      g.rect(3, 13, 6, 19, '#cbd5e1');
      g.roundBox(11, 15, 10, 15, '#38bdf8', '#475569', 2);
      g.rect(13, 18, 3, 4, '#e0f2fe');
    });
    registerMirroredX('furn_washer_east', 'furn_washer_west');
    registerCanvasAsset('furn_washer_south', 48, 48, (g) => {
      g.roundBox(11, 21, 26, 25, '#ffffff', '#64748b', 2);
      g.roundBox(17, 25, 14, 11, '#38bdf8', '#475569', 2);
      g.rect(13, 38, 22, 6, '#cbd5e1');
    });
    registry.set('furn_washer', registry.get('furn_washer_north'));

    // 壁向き別: TV台 (48x48)
    registerCanvasAsset('furn_tv_north', 48, 48, (g) => {
      g.shadow(7, 31, 34, 3);
      g.roundBox(7, 17, 34, 13, WOOD_MD, WOOD_DK, 2);
      g.rect(9, 19, 30, 5, WOOD_LT);
      g.roundBox(11, 3, 26, 16, '#1e293b', INK, 2);
      g.rect(13, 5, 22, 12, '#38bdf8');
      g.rect(15, 7, 8, 4, '#bae6fd');
    });
    registerCanvasAsset('furn_tv_west', 48, 48, (g) => {
      g.shadow(1, 39, 17, 3);
      g.roundBox(1, 9, 15, 30, WOOD_MD, WOOD_DK, 2);
      g.rect(3, 11, 11, 26, WOOD_LT);
      g.box(4, 13, 8, 22, '#38bdf8', INK, 2);
    });
    registerMirroredX('furn_tv_east', 'furn_tv_west');
    registerCanvasAsset('furn_tv_south', 48, 48, (g) => {
      g.roundBox(7, 29, 34, 17, WOOD_MD, WOOD_DK, 2);
      g.rect(11, 33, 26, 9, '#1e293b');
    });
    registry.set('furn_tv', registry.get('furn_tv_north'));

    // 壁向き別: 冷蔵庫 (48x48)
    registerCanvasAsset('furn_fridge_north', 48, 48, (g) => {
      g.shadow(13, 33, 22, 3);
      g.roundBox(13, 1, 22, 31, '#f8fafc', '#64748b', 2);
      g.rect(15, 3, 18, 10, '#ffffff');
      g.rect(15, 13, 18, 2, '#94a3b8');
      g.rect(15, 15, 18, 15, '#f1f5f9');
      g.rect(29, 6, 2, 5, '#94a3b8');
      g.rect(29, 18, 2, 8, '#94a3b8');
    });
    registerCanvasAsset('furn_fridge_west', 48, 48, (g) => {
      g.shadow(1, 35, 21, 3);
      g.roundBox(1, 13, 21, 22, '#f8fafc', '#64748b', 2);
      g.rect(3, 15, 17, 18, '#ffffff');
      g.rect(18, 17, 2, 13, '#94a3b8');
    });
    registerMirroredX('furn_fridge_east', 'furn_fridge_west');
    registerCanvasAsset('furn_fridge_south', 48, 48, (g) => {
      g.roundBox(13, 23, 22, 23, '#e2e8f0', '#64748b', 2);
      g.rect(15, 25, 18, 19, '#f1f5f9');
    });
    registry.set('furn_fridge', registry.get('furn_fridge_north'));

    // 壁向き別: シングルベッド (48x48)
    registerCanvasAsset('furn_bed_s_north', 48, 48, (g) => {
      g.shadow(11, 35, 26, 3);
      g.roundBox(11, 3, 26, 31, '#f8fafc', WOOD_DK, 2);
      g.rect(13, 5, 22, 4, WOOD_MD);
      g.roundBox(15, 9, 18, 6, '#ffffff', '#cbd5e1', 2);
      g.rect(13, 15, 22, 17, '#60a5fa');
      g.rect(13, 15, 22, 3, '#93c5fd');
      g.rect(13, 26, 22, 6, '#3b82f6');
    });
    registerCanvasAsset('furn_bed_s_west', 48, 48, (g) => {
      g.shadow(1, 35, 34, 3);
      g.roundBox(1, 11, 34, 24, '#f8fafc', WOOD_DK, 2);
      g.rect(3, 13, 4, 20, WOOD_MD);
      g.roundBox(7, 15, 7, 16, '#ffffff', '#cbd5e1', 2);
      g.rect(14, 13, 19, 20, '#60a5fa');
      g.rect(14, 13, 3, 20, '#93c5fd');
      g.rect(27, 13, 6, 20, '#3b82f6');
    });
    registerMirroredX('furn_bed_s_east', 'furn_bed_s_west');
    registerCanvasAsset('furn_bed_s_south', 48, 48, (g) => {
      g.roundBox(11, 13, 26, 32, '#f8fafc', WOOD_DK, 2);
      g.rect(13, 39, 22, 4, WOOD_MD);
      g.roundBox(15, 32, 18, 7, '#ffffff', '#cbd5e1', 2);
      g.rect(13, 15, 22, 17, '#60a5fa');
    });
    registry.set('furn_bed_s', registry.get('furn_bed_s_north'));

    // 壁向き別: 収納ラック & スチールラック (48x48)
    registerCanvasAsset('furn_closet_rack_north', 48, 48, (g) => {
      g.rect(9, 5, 30, 2, '#475569');
      g.rect(11, 7, 2, 12, '#64748b'); g.rect(35, 7, 2, 12, '#64748b');
      g.roundBox(15, 8, 5, 11, '#ef4444', '#991b1b');
      g.roundBox(21, 8, 5, 11, '#3b82f6', '#1e3a8a');
      g.roundBox(27, 8, 5, 11, '#eab308', '#a16207');
      g.shadow(11, 33, 26, 3);
      g.roundBox(11, 21, 26, 13, WOOD_LT, WOOD_DK, 2);
      g.rect(13, 26, 22, 2, WOOD_MD);
    });
    registerCanvasAsset('furn_closet_rack_west', 48, 48, (g) => {
      g.shadow(1, 37, 16, 3);
      g.roundBox(1, 9, 15, 28, WOOD_LT, WOOD_DK, 2);
      g.roundBox(3, 13, 9, 6, '#ef4444', '#991b1b');
      g.roundBox(3, 21, 9, 6, '#3b82f6', '#1e3a8a');
      g.roundBox(3, 29, 9, 5, '#eab308', '#a16207');
    });
    registerMirroredX('furn_closet_rack_east', 'furn_closet_rack_west');
    registerCanvasAsset('furn_closet_rack_south', 48, 48, (g) => {
      g.roundBox(11, 29, 26, 16, WOOD_LT, WOOD_DK, 2);
      g.rect(13, 35, 22, 2, WOOD_MD);
    });
    registry.set('furn_closet_rack', registry.get('furn_closet_rack_north'));

    registerCanvasAsset('furn_rack_steel_west', 48, 48, (g) => {
      g.shadow(1, 39, 17, 3);
      g.box(1, 7, 17, 32, '#94a3b8', '#475569', 2);
      g.roundBox(3, 11, 11, 9, WOOD_LT, WOOD_DK);
      g.roundBox(3, 23, 11, 9, '#3b82f6', '#1e3a8a');
    });
    registerMirroredX('furn_rack_steel_east', 'furn_rack_steel_west');
    registry.set('furn_rack_steel_north', registry.get('furn_rack_steel'));
    registry.set('furn_rack_steel_south', registry.get('furn_rack_steel'));

    // 壁向き別: トイレ (48x48)
    registerCanvasAsset('furn_toilet_west', 48, 48, (g) => {
      g.roundBox(13, 13, 20, 22, '#fce7f3', '#f472b6', 2);
      g.shadow(3, 33, 24, 3);
      g.roundBox(1, 15, 9, 18, '#ffffff', '#64748b', 2);
      g.roundBox(9, 17, 16, 14, '#ffffff', '#64748b', 2);
      g.rect(13, 20, 7, 8, '#bae6fd');
    });
    registerMirroredX('furn_toilet_east', 'furn_toilet_west');
    registerCanvasAsset('furn_toilet_south', 48, 48, (g) => {
      g.roundBox(13, 11, 22, 17, '#fce7f3', '#f472b6', 2);
      g.roundBox(15, 34, 18, 10, '#ffffff', '#64748b', 2);
      g.roundBox(17, 21, 14, 14, '#ffffff', '#64748b', 2);
      g.rect(20, 25, 8, 5, '#bae6fd');
    });
    registry.set('furn_toilet_north', registry.get('furn_toilet'));

    // 縦2マス壁用 (48x96): 縦キッチン & 縦ソファ & 縦ダブルベッド
    registerCanvasAsset('furn_kitchen_v_west', 48, 96, (g) => {
      g.shadow(2, 87, 28, 4);
      g.roundBox(1, 7, 27, 82, '#f8fafc', SLATE_LN, 2);
      g.rect(20, 9, 6, 78, '#cbd5e1');
      g.box(5, 13, 13, 21, '#7dd3fc', '#64748b', 2);
      g.roundBox(7, 40, 9, 14, '#fde68a', '#d97706');
      g.box(5, 61, 13, 21, '#334155', INK, 2);
      g.roundBox(7, 65, 7, 7, '#ef4444', '#991b1b');
    });
    registerMirroredX('furn_kitchen_v_east', 'furn_kitchen_v_west');

    registerCanvasAsset('furn_sofa_v_west', 48, 96, (g) => {
      g.shadow(3, 85, 27, 4);
      g.roundBox(3, 11, 25, 74, '#e11d48', '#881337', 2);
      g.rect(5, 13, 8, 70, '#fb7185');
      g.roundBox(13, 19, 13, 27, '#f43f5e', '#9f1239');
      g.roundBox(13, 50, 13, 27, '#f43f5e', '#9f1239');
    });
    registerMirroredX('furn_sofa_v_east', 'furn_sofa_v_west');

    registerCanvasAsset('furn_bed_w_v_west', 48, 96, (g) => {
      g.shadow(3, 81, 33, 4);
      g.roundBox(1, 15, 35, 66, '#f8fafc', WOOD_DK, 2);
      g.rect(3, 17, 4, 62, WOOD_MD);
      g.roundBox(7, 21, 7, 23, '#ffffff', '#cbd5e1', 2);
      g.roundBox(7, 52, 7, 23, '#ffffff', '#cbd5e1', 2);
      g.rect(14, 17, 20, 62, '#a855f7');
      g.rect(14, 17, 3, 62, '#d8b4fe');
    });
    registerMirroredX('furn_bed_w_v_east', 'furn_bed_w_v_west');

    // 立ち上がり北壁用装飾 (48x22 / 96x22)
    registerCanvasAsset('wall_art_1', 48, 22, (g) => {
      g.box(9, 2, 30, 18, '#e0f2fe', WOOD_DK, 2);
      g.rect(11, 4, 26, 8, '#7dd3fc');
      g.rect(15, 6, 6, 2, '#ffffff');
      g.rect(30, 5, 3, 3, '#fde047');
      g.rect(11, 12, 26, 6, '#22c55e');
      g.rect(23, 10, 9, 4, '#16a34a');
    });

    registerCanvasAsset('wall_art_2', 48, 22, (g) => {
      g.box(11, 2, 26, 18, '#fef3c7', '#78350f', 2);
      g.rect(15, 4, 18, 14, '#ef4444');
      g.roundBox(19, 7, 10, 8, '#fde047', '#f59e0b');
      g.rect(22, 9, 4, 4, '#ffffff');
    });

    registerCanvasAsset('wall_clock', 48, 22, (g) => {
      g.roundBox(16, 2, 16, 17, '#ffffff', '#334155', 2);
      g.rect(23, 4, 2, 7, '#ef4444');
      g.rect(23, 9, 6, 2, '#0f172a');
      g.px(20, 10, '#64748b'); g.px(28, 10, '#64748b');
    });

    registerCanvasAsset('wall_kakejiku', 48, 22, (g) => {
      g.rect(15, 0, 18, 20, '#d97706');
      g.rect(17, 2, 14, 16, '#fef3c7');
      g.rect(23, 4, 2, 9, '#1e293b');
      g.rect(20, 7, 8, 2, '#1e293b');
      g.rect(25, 14, 3, 3, '#dc2626');
      g.rect(13, 18, 22, 2, '#78350f');
    });

    registerCanvasAsset('wall_fuji', 96, 22, (g) => {
      g.box(4, 0, 88, 22, '#38bdf8', '#cbd5e1', 2);
      g.roundBox(15, 4, 8, 7, '#fde047', '#facc15');
      g.rect(68, 4, 12, 4, '#ffffff');
      for (let r = 0; r < 14; r++) {
        const hw = 6 + r * 3;
        g.hline(48 - hw, 4 + r, hw * 2, r < 5 ? '#ffffff' : '#2563eb');
      }
      g.rect(6, 16, 84, 4, '#16a34a');
      g.rect(6, 19, 84, 1, '#14532d');
    });

    // --- Step C: コンボ・珍間取り専用家具 (48x48 / 96x48 / 壁48x22) ---
    // 要塞化: セキュリティ3画面監視デスク (48x48)
    registerCanvasAsset('furn_fortress_console', 48, 48, (g) => {
      g.shadow(6, 36, 36, 4);
      g.roundBox(6, 14, 36, 20, '#334155', '#0f172a', 2);
      g.box(9, 10, 9, 10, '#22c55e', '#0f172a', 1);
      g.box(19, 9, 10, 11, '#38bdf8', '#0f172a', 1);
      g.box(30, 10, 9, 10, '#ef4444', '#0f172a', 1);
      g.rect(20, 11, 4, 3, '#bae6fd');
      g.rect(14, 24, 20, 4, '#94a3b8'); // キーコンソール
      g.px(36, 26, '#ef4444'); // 警告ランプ
      g.roundBox(19, 35, 10, 6, '#1e293b', '#020617', 1);
    });

    // 要塞化: 非常用備蓄食料クレート＆水箱 (48x48)
    registerCanvasAsset('furn_supplies', 48, 48, (g) => {
      g.shadow(8, 37, 32, 4);
      g.roundBox(8, 18, 16, 18, '#65a30d', '#365314', 2); // ミリタリーボックス
      g.hline(10, 25, 12, '#4d7c0f');
      g.roundBox(25, 22, 15, 15, '#3b82f6', '#1e3a8a', 2); // 飲料水ケース
      g.rect(28, 25, 4, 5, '#bae6fd');
      g.rect(33, 25, 4, 5, '#bae6fd');
      g.roundBox(13, 10, 14, 9, '#d97706', '#78350f', 2); // 上積み缶詰箱
    });

    // 隠し部屋: 忍びの巻物・刀台 (48x48)
    registerCanvasAsset('furn_ninja_gear', 48, 48, (g) => {
      g.shadow(8, 36, 32, 4);
      g.roundBox(8, 14, 32, 20, '#1e1b4b', '#0f172a', 2);
      g.rect(10, 16, 28, 15, '#312e81');
      // 横たわる刀＋鞘＋赤い巻物
      g.rect(13, 18, 22, 3, '#cbd5e1');
      g.rect(13, 18, 5, 3, '#b91c1c');
      g.roundBox(14, 25, 12, 4, '#dc2626', '#7f1d1d');
      g.rect(18, 25, 4, 4, '#facc15');
      // 手裏剣
      g.rect(31, 25, 5, 1, '#94a3b8');
      g.rect(33, 23, 1, 5, '#94a3b8');
    });

    // 隠し部屋・倉庫: 秘密の金庫箱 (48x48)
    registerCanvasAsset('furn_safe_box', 48, 48, (g) => {
      g.shadow(11, 37, 26, 4);
      g.roundBox(11, 12, 26, 25, '#475569', '#0f172a', 2);
      g.box(14, 15, 20, 19, '#64748b', '#334155', 1);
      g.roundBox(22, 20, 8, 8, '#facc15', '#a16207'); // 金ダイヤル
      g.rect(16, 21, 3, 7, '#cbd5e1'); // ハンドル
    });

    // 無限回廊: 回廊フロアランプ (48x48)
    registerCanvasAsset('furn_infinity_lamp', 48, 48, (g) => {
      g.shadow(15, 37, 18, 3);
      g.roundBox(16, 30, 16, 9, '#334155', '#0f172a', 2);
      g.roundBox(18, 14, 12, 17, '#fef08a', '#b45309', 2);
      g.rect(20, 17, 8, 10, '#ffffff');
      g.rect(16, 12, 16, 3, '#78350f');
    });

    // 箱庭・庭園: 石灯籠＋つくばい (48x48)
    registerCanvasAsset('furn_lantern', 48, 48, (g) => {
      g.shadow(14, 38, 20, 4);
      g.rect(20, 24, 8, 14, '#94a3b8');
      g.roundBox(16, 16, 16, 9, '#cbd5e1', '#475569', 1);
      g.rect(21, 18, 6, 5, '#fef08a'); // 火袋灯り
      g.roundBox(12, 11, 24, 6, '#94a3b8', '#475569', 2); // 笠
      g.roundBox(21, 8, 6, 4, '#cbd5e1', '#475569');
      // 脇の水鉢
      g.roundBox(31, 28, 11, 9, '#64748b', '#334155', 2);
      g.rect(33, 30, 7, 5, '#38bdf8');
    });

    // 広大なる庭園: 鯉の泳ぐ池＋飛び石 (96x48)
    registerCanvasAsset('furn_pond', 96, 48, (g) => {
      g.roundBox(7, 7, 82, 34, '#64748b', '#334155', 2);
      g.roundBox(11, 11, 74, 26, '#0ea5e9', '#0284c7', 2);
      g.rect(16, 14, 64, 20, '#38bdf8');
      g.rect(22, 17, 16, 3, '#bae6fd');
      // 赤白の鯉 2匹
      g.roundBox(32, 23, 8, 4, '#ef4444', '#ffffff');
      g.roundBox(57, 19, 9, 4, '#f97316', '#f8fafc');
      // 岩アクセント
      g.roundBox(11, 27, 10, 9, '#94a3b8', '#475569', 2);
      g.roundBox(74, 12, 11, 9, '#94a3b8', '#475569', 2);
    });

    // 広大なる庭園: ガーデンパラソル＆ティー卓 (48x48)
    registerCanvasAsset('furn_garden_table', 48, 48, (g) => {
      g.shadow(11, 36, 26, 4);
      g.roundBox(14, 20, 20, 16, '#f8fafc', '#64748b', 2);
      g.roundBox(9, 10, 30, 15, '#ef4444', '#991b1b', 2); // 赤パラソル
      g.rect(18, 11, 12, 13, '#ffffff'); // ストライプ
      g.rect(23, 25, 2, 12, WOOD_DK);
    });

    // 収納が本体: 台車＆積み上げ木箱 (48x48)
    registerCanvasAsset('furn_warehouse_crate', 48, 48, (g) => {
      g.shadow(9, 38, 30, 4);
      g.roundBox(10, 24, 24, 14, '#dc2626', '#7f1d1d', 1); // 台車ベース
      g.roundBox(12, 11, 16, 13, WOOD_LT, WOOD_DK, 2); // 木箱
      g.roundBox(26, 15, 11, 10, '#fbbf24', '#92400e', 1); // 段ボール
      g.rect(34, 14, 3, 20, '#475569'); // 台車ハンドル
      g.roundBox(12, 36, 5, 5, '#1e293b', '#020617');
      g.roundBox(28, 36, 5, 5, '#1e293b', '#020617');
    });

    // 水門: 玄関吸水バスマット＆すのこ (48x48)
    registerCanvasAsset('furn_bathmat', 48, 48, (g) => {
      g.roundBox(9, 25, 30, 15, '#fef3c7', WOOD_DK, 1);
      [29, 34].forEach(yy => g.hline(11, yy, 26, WOOD_MD));
      g.roundBox(14, 12, 20, 12, '#bae6fd', '#0284c7', 2);
    });

    // 隠し部屋用北壁装飾: 「忍」掛け軸 (48x22)
    registerCanvasAsset('wall_scroll_ninja', 48, 22, (g) => {
      g.rect(15, 0, 18, 20, '#312e81');
      g.rect(17, 2, 14, 16, '#1e1b4b');
      g.rect(20, 5, 8, 2, '#facc15');
      g.rect(23, 7, 2, 7, '#f8fafc');
      g.px(20, 11, '#ef4444'); g.px(27, 11, '#ef4444');
      g.rect(13, 18, 22, 2, '#0f172a');
    });

    // --- 第2段階: 部屋インテリアテーマバリエーション用スプライト (48x48 × 10種) ---
    // 1. ゲーミングデスク＆チェア
    registerCanvasAsset('furn_gaming_desk', 48, 48, (g) => {
      g.shadow(6, 33, 36, 4);
      g.roundBox(6, 9, 36, 19, '#1e293b', '#020617', 2);
      g.hline(8, 26, 32, '#38bdf8'); // RGBエッジライト
      // デュアルモニター（シアン＆ライム）
      g.box(9, 10, 14, 10, '#06b6d4', '#020617', 2);
      g.rect(11, 12, 7, 3, '#a5f3fc');
      g.box(25, 10, 14, 10, '#22c55e', '#020617', 2);
      g.rect(27, 12, 7, 3, '#bbf7d0');
      // 光るキーボード＆マウス
      g.rect(14, 21, 14, 3, '#a855f7');
      g.rect(31, 21, 4, 3, '#f43f5e');
      // 黒赤ゲーミングチェア
      g.roundBox(17, 29, 14, 13, '#0f172a', '#020617', 2);
      g.rect(19, 30, 10, 8, '#dc2626');
      g.rect(21, 32, 6, 4, '#1e293b');
    });

    // 2. 子ども用シングルベッド（パステル＆星柄布団）
    registerCanvasAsset('furn_kids_bed', 48, 48, (g) => {
      g.shadow(11, 39, 26, 4);
      g.roundBox(11, 6, 26, 35, '#93c5fd', '#2563eb', 2);
      g.rect(13, 8, 22, 4, '#60a5fa');
      g.roundBox(15, 12, 18, 7, '#e0f2fe', '#38bdf8', 1); // 水色枕
      g.roundBox(13, 19, 22, 20, '#fef08a', '#ca8a04', 2); // 星柄イエロー布団
      g.rect(13, 19, 22, 3, '#ffffff');
      g.px(18, 26, '#f97316'); g.px(29, 30, '#ef4444'); g.px(23, 34, '#3b82f6');
      g.rect(22, 27, 3, 3, '#facc15');
    });

    // 3. おもちゃ箱＆積み木＆丸ラグ
    registerCanvasAsset('furn_toy_box', 48, 48, (g) => {
      g.roundBox(8, 20, 32, 22, '#fbcfe8', '#f472b6', 2);
      g.roundBox(12, 24, 24, 14, '#fef08a', '#facc15', 2);
      g.shadow(10, 22, 28, 3);
      g.roundBox(10, 7, 28, 15, '#fb923c', '#9a3412', 2); // おもちゃ箱
      g.rect(12, 9, 24, 4, '#fdba74');
      // 積み木ブロック
      g.box(14, 24, 6, 6, '#ef4444', '#7f1d1d', 1);
      g.box(22, 25, 6, 6, '#3b82f6', '#1e3a8a', 1);
      g.box(18, 19, 6, 6, '#facc15', '#854d0e', 1);
      g.box(30, 27, 5, 5, '#22c55e', '#14532d', 1);
    });

    // 4. 文豪・書斎デスク（濃木目＋バンカーズランプ＋原稿）
    registerCanvasAsset('furn_book_desk', 48, 48, (g) => {
      g.shadow(6, 33, 36, 4);
      g.roundBox(6, 9, 36, 20, '#7c2d12', '#451a03', 2);
      g.rect(8, 11, 32, 15, '#9a3412');
      // 緑シェードのバンカーズランプ
      g.roundBox(9, 10, 8, 6, '#15803d', '#052e16', 1);
      g.rect(12, 16, 2, 3, '#fbbf24');
      // 原稿用紙＆インク瓶＆羽ペン
      g.box(19, 13, 12, 11, '#fefce8', '#64748b', 1);
      g.hline(21, 16, 8, '#94a3b8'); g.hline(21, 19, 6, '#94a3b8'); g.hline(21, 21, 7, '#94a3b8');
      g.roundBox(34, 15, 5, 5, '#1e293b', '#020617');
      g.rect(36, 11, 2, 4, '#f8fafc');
      // 重厚チェア
      g.roundBox(17, 30, 14, 11, '#78350f', '#451a03', 2);
      g.rect(19, 32, 10, 6, '#b45309');
    });

    // 5. 茶室セット（炉＋茶釜＋赤い毛氈座布団＋抹茶椀）
    registerCanvasAsset('furn_tea_set', 48, 48, (g) => {
      g.roundBox(7, 25, 16, 15, '#dc2626', '#7f1d1d', 2); // 毛氈座布団
      g.rect(9, 27, 12, 11, '#ef4444');
      g.shadow(16, 20, 18, 3);
      g.box(16, 9, 18, 16, '#475569', '#0f172a', 2); // 炉枠
      g.roundBox(19, 11, 12, 12, '#1e293b', '#020617', 2); // 黒い茶釜
      g.rect(22, 13, 6, 3, '#64748b');
      // 抹茶椀＆茶筅
      g.roundBox(28, 28, 10, 9, '#0f172a', '#020617', 2);
      g.rect(30, 30, 6, 5, '#22c55e');
      g.roundBox(31, 19, 4, 6, '#fef3c7', '#92400e');
    });

    // 6. 飾り台＆松盆栽
    registerCanvasAsset('furn_bonsai', 48, 48, (g) => {
      g.shadow(9, 36, 30, 4);
      g.roundBox(9, 27, 30, 11, WOOD_DK, '#1e293b', 2);
      g.rect(11, 29, 26, 4, WOOD_MD);
      g.roundBox(16, 21, 16, 8, '#1e293b', '#020617', 1); // 黒鉢
      g.rect(21, 14, 5, 8, '#78350f'); // 曲がった幹
      g.rect(24, 12, 4, 4, '#78350f');
      // 松の葉の段層
      g.roundBox(11, 9, 14, 7, '#15803d', '#052e16', 1);
      g.roundBox(21, 5, 15, 8, '#16a34a', '#052e16', 1);
      g.rect(24, 7, 7, 3, '#4ade80');
      g.rect(14, 11, 6, 2, '#22c55e');
    });

    // 7. カフェ風丸テーブル＆椅子2脚
    registerCanvasAsset('furn_cafe_table', 48, 48, (g) => {
      g.roundBox(5, 18, 9, 12, WOOD_MD, WOOD_DK, 2);
      g.roundBox(34, 18, 9, 12, WOOD_MD, WOOD_DK, 2);
      g.shadow(11, 35, 26, 4);
      g.roundBox(11, 11, 26, 25, WOOD_HI, WOOD_DK, 2);
      g.rect(14, 14, 20, 19, WOOD_LT);
      // コーヒーカップ2客＋小皿
      g.roundBox(16, 17, 6, 6, '#ffffff', '#64748b');
      g.rect(18, 19, 2, 2, '#78350f');
      g.roundBox(26, 24, 6, 6, '#ffffff', '#64748b');
      g.rect(28, 26, 2, 2, '#78350f');
      g.roundBox(22, 16, 5, 5, '#fde047', '#b45309');
    });

    // 8. ローズアーチ（イングリッシュガーデン用）
    registerCanvasAsset('furn_rose_arch', 48, 48, (g) => {
      g.shadow(7, 38, 34, 4);
      g.roundBox(9, 16, 6, 24, '#f8fafc', '#64748b', 1);
      g.roundBox(33, 16, 6, 24, '#f8fafc', '#64748b', 1);
      g.roundBox(8, 6, 32, 12, '#ffffff', '#64748b', 2);
      g.rect(13, 12, 22, 6, '#86efac');
      // 緑のツル＆赤・ピンクのバラ花
      g.roundBox(8, 10, 10, 15, '#15803d', '#14532d', 1);
      g.roundBox(30, 10, 10, 15, '#15803d', '#14532d', 1);
      g.roundBox(16, 5, 16, 8, '#16a34a', '#14532d', 1);
      [[11, 13, '#e11d48'], [20, 7, '#f43f5e'], [27, 8, '#fb7185'], [34, 14, '#e11d48'], [10, 21, '#fb7185'], [35, 22, '#f43f5e']].forEach(([rx, ry, rc]) => {
        g.rect(rx, ry, 3, 3, rc);
        g.px(rx + 1, ry + 1, '#ffe4e6');
      });
    });

    // 9. 白い石造りバードバス
    registerCanvasAsset('furn_birdbath', 48, 48, (g) => {
      g.shadow(13, 38, 22, 4);
      g.roundBox(16, 33, 16, 7, '#e2e8f0', '#64748b', 1); // 台座
      g.box(20, 20, 8, 14, '#f1f5f9', '#64748b', 1); // 石柱
      g.roundBox(10, 10, 28, 13, '#f8fafc', '#64748b', 2); // 水盤
      g.roundBox(13, 12, 22, 8, '#38bdf8', '#0284c7', 1);
      g.rect(16, 14, 9, 2, '#bae6fd');
      // 小鳥アクセント
      g.rect(31, 8, 4, 3, '#f59e0b');
      g.px(35, 9, '#ef4444');
    });

    // 10. 日本庭園の飛び石＆苔小岩
    registerCanvasAsset('furn_stepping_stone', 48, 48, (g) => {
      g.roundBox(6, 26, 14, 11, '#cbd5e1', '#475569', 2);
      g.rect(8, 28, 9, 6, '#e2e8f0');
      g.roundBox(18, 17, 13, 10, '#cbd5e1', '#475569', 2);
      g.rect(20, 19, 8, 5, '#e2e8f0');
      g.roundBox(28, 7, 14, 10, '#cbd5e1', '#475569', 2);
      // 苔＆小岩・低木
      g.roundBox(6, 9, 11, 9, '#64748b', '#334155', 2);
      g.rect(7, 9, 7, 4, '#22c55e');
      g.roundBox(31, 28, 11, 10, '#15803d', '#14532d', 2);
      g.rect(33, 30, 6, 4, '#4ade80');
    });
  }

  /* ============================================================
     3. ちびキャラ生成 (48x48 高精細2フレーム: 瞳ハイライト＋服飾ディテール)
  ============================================================ */
  function registerCharacters() {
    const INK = '#1e293b';
    function makePerson(idPrefix, cfg) {
      const skin = cfg.skin || '#fde68a';
      const skinShade = cfg.skinShade || '#fcd34d';
      const hair = cfg.hair || '#451a03';
      const cloth = cfg.cloth || '#3b82f6';
      const clothDark = cfg.clothDark || '#1d4ed8';
      const pants = cfg.pants || '#334155';
      const eye = cfg.eye || '#0f172a';
      const accent = cfg.accent || '#f8fafc';

      [0, 1].forEach(frame => {
        registerCanvasAsset(`${idPrefix}_${frame}`, 48, 48, (g) => {
          const bob = frame === 1 ? -2 : 0;

          // 背面長髪やマント（任意）
          if (cfg.cape) {
            g.roundBox(12, 24 + bob, 24, 14, clothDark, INK, 2);
          }

          // 頭部＆髪型
          g.roundBox(13, 5 + bob, 22, 13, hair, INK, 2);
          if (cfg.hat) {
            g.roundBox(15, 3 + bob, 18, 6, cloth, INK);
            g.rect(10, 10 + bob, 28, 3, accent);
          }
          if (cfg.crown) {
            g.rect(17, 2 + bob, 14, 5, '#facc15');
            g.rect(18, 1 + bob, 3, 2, '#facc15');
            g.rect(23, 0 + bob, 3, 3, '#facc15');
            g.rect(28, 1 + bob, 3, 2, '#facc15');
            g.px(24, 3 + bob, '#ef4444');
          }

          // 顔輪郭
          g.roundBox(15, 11 + bob, 18, 13, skin, INK, 2);
          // 前髪
          g.rect(16, 11 + bob, 16, 4, hair);
          g.rect(18, 14 + bob, 3, 2, hair);
          g.rect(27, 14 + bob, 3, 2, hair);
          // 瞳（白目ハイライト＋黒目）
          g.rect(18, 17 + bob, 3, 4, eye);
          g.px(18, 17 + bob, '#ffffff');
          g.rect(27, 17 + bob, 3, 4, eye);
          g.px(27, 17 + bob, '#ffffff');
          // メガネ（任意）
          if (cfg.glasses) {
            g.box(17, 16 + bob, 5, 6, 'rgba(186,230,253,0.25)', '#334155');
            g.box(26, 16 + bob, 5, 6, 'rgba(186,230,253,0.25)', '#334155');
            g.hline(22, 18 + bob, 4, '#334155');
          }
          // ほっぺ＆口元／ひげ
          if (!cfg.noBlush) {
            g.rect(16, 20 + bob, 3, 2, '#fda4af');
            g.rect(29, 20 + bob, 3, 2, '#fda4af');
          }
          if (cfg.beard) {
            g.roundBox(18, 22 + bob, 12, 8, '#f8fafc', '#cbd5e1');
          } else {
            g.hline(23, 22 + bob, 2, '#c2410c');
          }
          if (cfg.towel) {
            // 頭上の白い手ぬぐい
            g.roundBox(17, 4 + bob, 14, 5, '#ffffff', '#94a3b8');
          }

          // 胴体（スーツ・作業着・着物）
          g.roundBox(13, 24 + bob, 22, 13, cloth, INK, 2);
          g.rect(15, 31 + bob, 18, 4, clothDark);
          // 襟＆ネクタイ／スカーフ
          g.rect(21, 25 + bob, 6, 3, '#ffffff');
          g.rect(23, 26 + bob, 2, 7, accent);
          // 手（左右）＋肌影
          g.roundBox(10, 26 + bob, 4, 7, skin, INK);
          g.roundBox(34, 26 + bob, 4, 7, skin, INK);
          g.px(11, 31 + bob, skinShade);

          // 足＆靴（2フレーム歩行）
          if (frame === 0) {
            g.roundBox(16, 37, 6, 7, pants, INK);
            g.rect(16, 42, 6, 3, '#1e293b');
            g.roundBox(26, 37, 6, 5, pants, INK);
            g.rect(26, 40, 6, 2, '#1e293b');
          } else {
            g.roundBox(16, 37, 6, 5, pants, INK);
            g.rect(16, 40, 6, 2, '#1e293b');
            g.roundBox(26, 37, 6, 7, pants, INK);
            g.rect(26, 42, 6, 3, '#1e293b');
          }
        });
      });
    }

    function makeKid(idPrefix, cloth, clothDark, hair) {
      [0, 1].forEach(frame => {
        registerCanvasAsset(`${idPrefix}_${frame}`, 48, 48, (g) => {
          const bob = frame === 1 ? -2 : 0;
          g.roundBox(16, 13 + bob, 16, 11, hair || '#78350f', INK, 2);
          g.roundBox(17, 17 + bob, 14, 11, '#fde68a', INK, 2);
          g.rect(18, 17 + bob, 12, 3, hair || '#78350f');
          g.rect(20, 21 + bob, 2, 3, INK); g.px(20, 21 + bob, '#ffffff');
          g.rect(26, 21 + bob, 2, 3, INK); g.px(26, 21 + bob, '#ffffff');
          g.rect(18, 24 + bob, 2, 1, '#fda4af');
          g.rect(28, 24 + bob, 2, 1, '#fda4af');
          g.roundBox(16, 28 + bob, 16, 9, cloth, INK, 2);
          g.rect(18, 33 + bob, 12, 3, clothDark);
          if (frame === 0) {
            g.roundBox(18, 37, 5, 7, '#334155', INK);
            g.roundBox(25, 37, 5, 5, '#334155', INK);
          } else {
            g.roundBox(18, 37, 5, 5, '#334155', INK);
            g.roundBox(25, 37, 5, 7, '#334155', INK);
          }
        });
      });
    }

    makePerson('char_casual_blue', { cloth: '#3b82f6', clothDark: '#1d4ed8', hair: '#451a03' });
    makePerson('char_casual_pink', { cloth: '#ec4899', clothDark: '#be185d', hair: '#78350f', accent: '#fce7f3' });
    makePerson('char_suit',        { cloth: '#334155', clothDark: '#1e293b', hair: '#0f172a', accent: '#ef4444' });
    makePerson('char_worker',      { cloth: '#10b981', clothDark: '#047857', hair: '#451a03', accent: '#fef08a' });
    makePerson('char_cafe',        { cloth: '#f59e0b', clothDark: '#b45309', hair: '#78350f', hat: true });
    makePerson('char_wa',          { cloth: '#7c3aed', clothDark: '#5b21b6', hair: '#0f172a', accent: '#fef3c7' });

    makeKid('char_kid_1', '#f97316', '#c2410c', '#451a03');
    makeKid('char_kid_2', '#eab308', '#a16207', '#78350f');

    makePerson('char_vip', { cloth: '#f59e0b', clothDark: '#b45309', hair: '#e2e8f0', accent: '#ffffff', hat: true, glasses: true });
    makePerson('char_sp',  { cloth: '#0f172a', clothDark: '#020617', hair: '#020617', eye: '#38bdf8', accent: '#e2e8f0', noBlush: true, glasses: true });

    makePerson('char_ninja',   { cloth: '#1e1b4b', clothDark: '#0f172a', hair: '#0f172a', accent: '#dc2626', hat: true, noBlush: true });
    makePerson('char_vampire', { cloth: '#18181b', clothDark: '#09090b', skin: '#e2e8f0', hair: '#1e293b', accent: '#dc2626', eye: '#ef4444', noBlush: true, cape: true });
    makePerson('char_king',    { cloth: '#dc2626', clothDark: '#991b1b', hair: '#facc15', accent: '#fef08a', crown: true, cape: true });
    makePerson('char_sennin',  { cloth: '#16a34a', clothDark: '#14532d', hair: '#f8fafc', accent: '#fde047', beard: true });

    // Step C: 追加バリエーション（一般客・二世帯＆案内・案B個性派）
    makePerson('char_minimal',       { cloth: '#65a30d', clothDark: '#3f6212', hair: '#451a03', accent: '#e2e8f0', hat: true });
    makePerson('char_fashion',       { cloth: '#db2777', clothDark: '#9d174d', hair: '#78350f', accent: '#fef08a', glasses: true });
    makePerson('char_senior_m',      { cloth: '#475569', clothDark: '#334155', hair: '#e2e8f0', accent: '#cbd5e1', beard: true });
    makePerson('char_senior_f',      { cloth: '#9333ea', clothDark: '#6b21a8', hair: '#e2e8f0', accent: '#fef3c7' });
    makePerson('char_lady_vip',      { cloth: '#be185d', clothDark: '#831843', hair: '#facc15', accent: '#fef08a', cape: true });
    makePerson('char_sento',         { cloth: '#0ea5e9', clothDark: '#0369a1', hair: '#451a03', accent: '#facc15', towel: true });
    makePerson('char_toilet_critic', { cloth: '#f8fafc', clothDark: '#cbd5e1', hair: '#334155', accent: '#3b82f6', glasses: true });
    makePerson('char_mystery',       { cloth: '#78350f', clothDark: '#451a03', hair: '#1e293b', accent: '#fde047', hat: true, glasses: true });

    // オフィス社長 (Rank0 作業着 / Rank1-2 紺スーツ / Rank3-4 高級黒スーツ＋金バッジ)
    makePerson('boss_0', { cloth: '#3b82f6', clothDark: '#1d4ed8', hair: '#1e293b', accent: '#fde047', hat: true });
    makePerson('boss_1', { cloth: '#1e3a8a', clothDark: '#172554', hair: '#0f172a', accent: '#ef4444' });
    makePerson('boss_2', { cloth: '#0f172a', clothDark: '#020617', hair: '#334155', accent: '#facc15', glasses: true });

    // オフィススタッフ (4職種グループ)
    makePerson('staff_field',   { cloth: '#0284c7', clothDark: '#0369a1', hair: '#451a03', accent: '#facc15', hat: true });
    makePerson('staff_design',  { cloth: '#7c3aed', clothDark: '#5b21b6', hair: '#78350f', accent: '#e0e7ff', glasses: true });
    makePerson('staff_sales',   { cloth: '#e11d48', clothDark: '#be123c', hair: '#451a03', accent: '#ffffff' });
    makePerson('staff_finance', { cloth: '#334155', clothDark: '#1e293b', hair: '#0f172a', accent: '#38bdf8', glasses: true });
  }

  /* ============================================================
     4. オフィス画面専用アセット (48x48 / 72x48 / 84x48 / 96x48 / 144x48 / 96x96)
  ============================================================ */
  function registerOfficeAssets() {
    const INK = '#1e293b';
    const SLATE_LN = '#475569';
    const WOOD_DK = '#5c371e';
    const WOOD_MD = '#9c5d33';
    const WOOD_LT = '#d49a6a';
    const WOOD_HI = '#f0c8a0';

    // オフィス床タイル (24x24: 低コントラスト)
    registerCanvasAsset('floor_office_blue', 24, 24, (g) => {
      g.rect(0, 0, 24, 24, '#dbeafe');
      g.hline(0, 11, 24, '#cfe3fc'); g.hline(0, 23, 24, '#cfe3fc');
      g.vline(11, 0, 24, '#cfe3fc'); g.vline(23, 0, 24, '#cfe3fc');
      g.px(4, 4, '#eff6ff'); g.px(16, 16, '#eff6ff');
    });
    registerCanvasAsset('floor_office_studio', 24, 24, (g) => {
      g.rect(0, 0, 24, 24, '#e7d7c1');
      for (let y = 5; y < 24; y += 6) g.hline(0, y, 24, '#dbc6aa');
      g.vline(10, 0, 6, '#dbc6aa'); g.vline(18, 12, 6, '#dbc6aa');
    });
    registerCanvasAsset('floor_office_vip', 24, 24, (g) => {
      g.rect(0, 0, 24, 24, '#e11d48');
      g.rect(1, 0, 22, 24, '#be123c');
      g.vline(2, 0, 24, '#fbbf24');
      g.vline(21, 0, 24, '#fbbf24');
      g.rect(4, 2, 16, 20, '#9f1239');
    });

    // --- 社長デスク 4段階 ---
    // Rank 1 (48x48): 木の作業机
    registerCanvasAsset('off_desk_boss_0', 48, 48, (g) => {
      g.shadow(5, 36, 38, 4);
      g.roundBox(5, 16, 38, 21, WOOD_LT, WOOD_DK, 2);
      g.rect(7, 30, 34, 5, WOOD_MD);
      g.box(10, 19, 14, 9, '#f8fafc', '#64748b', 1); // 図面用紙
      g.hline(12, 22, 8, '#38bdf8');
      g.roundBox(29, 20, 7, 6, '#ef4444', '#991b1b'); // 電卓
      g.rect(38, 19, 3, 4, '#334155');
    });

    // Rank 2 (48x48): 事務社長デスク
    registerCanvasAsset('off_desk_boss_1', 48, 48, (g) => {
      g.shadow(4, 36, 40, 4);
      g.roundBox(4, 15, 40, 22, '#e2e8f0', SLATE_LN, 2);
      g.rect(6, 30, 36, 5, '#94a3b8');
      g.box(11, 17, 16, 10, '#38bdf8', INK, 2);
      g.rect(13, 19, 6, 3, '#bae6fd');
      g.roundBox(31, 20, 9, 7, '#f8fafc', '#94a3b8');
      g.rect(34, 22, 4, 2, '#ef4444');
    });

    // Rank 3 (72x48, w=1.5): 駅前オフィス ワイド社長デスク＋袖机
    registerCanvasAsset('off_desk_boss_1_wide', 72, 48, (g) => {
      g.shadow(5, 37, 62, 4);
      g.roundBox(5, 14, 62, 23, '#cbd5e1', '#334155', 2);
      g.rect(7, 16, 40, 15, '#e2e8f0');
      g.rect(47, 16, 18, 19, '#94a3b8'); // 右袖キャビネット
      g.hline(51, 22, 10, '#334155');
      g.hline(51, 29, 10, '#334155');
      g.box(13, 17, 20, 11, '#38bdf8', INK, 2);
      g.rect(15, 19, 8, 4, '#bae6fd');
      g.rect(36, 21, 8, 7, '#fef3c7'); // 決裁書類
      g.rect(52, 17, 6, 4, '#facc15'); // 金ネームプレート
    });

    // Rank 4-5 (96x48, w=2.0): 重厚マホガニー重役デスク
    registerCanvasAsset('off_desk_boss_2', 96, 48, (g) => {
      g.shadow(6, 38, 84, 4);
      g.roundBox(6, 13, 84, 25, '#7c2d12', '#451a03', 2);
      g.rect(8, 15, 80, 16, '#9a3412');
      g.rect(28, 18, 28, 11, '#1e293b'); // 高級黒レザーデスクマット
      g.box(15, 16, 20, 10, '#38bdf8', '#0f172a', 2); // 大型モニタ
      g.rect(17, 18, 8, 4, '#bae6fd');
      g.roundBox(41, 20, 13, 8, '#fef3c7', '#d97706'); // 決裁書類
      g.roundBox(62, 17, 9, 8, '#facc15', '#a16207');  // 金のペン立て
      g.roundBox(68, 27, 13, 5, '#ffffff', '#64748b');  // 社長銘板
      g.rect(71, 29, 7, 1, '#0f172a');
    });

    // --- スタッフデスク (Rank2: 48x48 / Rank3: 72x48 / Rank4-5: 84x48) ---
    function makeStaffDeskSet(prefix, w, mode) {
      ['empty', '1', '2', '3'].forEach(tier => {
        registerCanvasAsset(`${prefix}_${tier}`, w, 48, (g) => {
          const isEmpty = tier === 'empty';
          const pad = 4;
          const dw = w - pad * 2;
          g.shadow(pad, 36, dw, 4);

          if (mode === 'pro') {
            // L字返り付きプロ用ワークステーション
            g.roundBox(pad, 15, dw, 21, '#f8fafc', '#334155', 2);
            g.roundBox(pad, 25, 16, 15, '#e2e8f0', '#334155', 2); // 左L字袖
            g.roundBox(w - pad - 16, 17, 14, 17, '#cbd5e1', '#475569'); // 右キャビネット
            if (isEmpty) {
              g.box(Math.round(w * 0.32), 18, 22, 10, '#475569', INK, 2);
              g.roundBox(Math.round(w * 0.42), 37, 16, 6, '#94a3b8', SLATE_LN);
            } else {
              const scrCol = tier === '3' ? '#38bdf8' : '#60a5fa';
              // デュアルモニタ (★2〜3) / ワイドモニタ (★1)
              if (tier === '3' || tier === '2') {
                g.box(22, 17, 17, 10, scrCol, '#0f172a', 2);
                g.box(41, 17, 17, 10, '#38bdf8', '#0f172a', 2);
                g.rect(24, 19, 6, 3, '#bae6fd');
              } else {
                g.box(28, 17, 22, 10, scrCol, '#0f172a', 2);
              }
              g.rect(28, 29, 20, 3, '#cbd5e1'); // キーボード
              g.roundBox(6, 27, 11, 8, '#dbeafe', '#3b82f6'); // 左袖に図面紙
              if (tier === '3') g.roundBox(w - 15, 19, 6, 8, '#16a34a', '#14532d'); // ミニ観葉
            }
          } else if (mode === 'mid') {
            // Rank 3: 袖机付きワイドデスク (72x48)
            g.roundBox(pad, 16, dw, 20, '#f8fafc', '#475569', 2);
            g.rect(w - pad - 16, 18, 14, 16, '#cbd5e1');
            g.hline(w - pad - 13, 24, 8, '#475569');
            if (isEmpty) {
              g.box(18, 18, 22, 10, '#475569', INK, 2);
              g.roundBox(26, 37, 14, 6, '#94a3b8', SLATE_LN);
            } else {
              g.box(12, 18, 18, 10, '#38bdf8', INK, 2);
              g.rect(14, 20, 6, 3, '#bae6fd');
              if (tier === '3') g.box(32, 18, 16, 10, '#60a5fa', INK, 2);
              else g.roundBox(34, 20, 11, 8, '#ffffff', '#64748b');
              g.rect(17, 30, 14, 2, '#94a3b8');
              g.rect(52, 20, 5, 5, '#d97706');
            }
          } else {
            // Rank 2: 標準デスク (48x48)
            g.roundBox(pad + 1, 17, dw - 2, 19, '#f8fafc', '#64748b', 2);
            if (isEmpty) {
              g.box(14, 19, 20, 10, '#475569', INK, 2);
              g.roundBox(18, 37, 12, 6, '#94a3b8', SLATE_LN);
            } else {
              if (tier === '3') {
                g.box(8, 19, 14, 10, '#38bdf8', '#0f172a', 2);
                g.box(24, 19, 14, 10, '#60a5fa', '#0f172a', 2);
              } else {
                g.box(14, 19, 18, 10, '#38bdf8', INK, 2);
                g.rect(16, 21, 5, 3, '#bae6fd');
              }
              g.rect(16, 31, 14, 2, '#cbd5e1');
              g.rect(35, 22, 4, 4, '#d97706');
            }
          }
        });
      });
    }

    makeStaffDeskSet('off_desk_staff', 48, 'std');
    makeStaffDeskSet('off_desk_staff_mid', 72, 'mid');
    makeStaffDeskSet('off_desk_staff_pro', 84, 'pro');

    // --- 受付カウンター 4段階（大きさ＆L字形状進化）---
    // Rank 1 (48x48): コンパクト木製受付
    registerCanvasAsset('off_counter_small', 48, 48, (g) => {
      g.shadow(5, 36, 38, 4);
      g.roundBox(5, 14, 38, 22, WOOD_LT, WOOD_DK, 2);
      g.rect(7, 26, 34, 8, WOOD_MD);
      g.roundBox(10, 17, 10, 7, '#ef4444', '#991b1b'); // 赤チラシ立て
      g.roundBox(26, 19, 7, 5, '#facc15', '#a16207'); // 呼び出しベル
      g.rect(35, 18, 5, 6, '#f8fafc');
    });

    // Rank 2 (96x48): 標準2マス受付カウンター
    registerCanvasAsset('off_counter', 96, 48, (g) => {
      g.shadow(5, 38, 86, 4);
      g.roundBox(5, 14, 86, 24, WOOD_LT, WOOD_DK, 2);
      g.rect(7, 26, 82, 10, WOOD_MD);
      g.roundBox(14, 17, 15, 8, '#ef4444', '#991b1b');
      g.rect(17, 19, 9, 3, '#fef08a');
      g.roundBox(41, 19, 9, 6, '#facc15', '#a16207');
      g.box(61, 15, 17, 10, '#38bdf8', INK, 2);
      g.rect(63, 17, 6, 3, '#bae6fd');
    });

    // Rank 3 (144x48): 駅前ワイド3マス受付カウンター
    registerCanvasAsset('off_counter_wide', 144, 48, (g) => {
      g.shadow(5, 38, 134, 4);
      g.roundBox(5, 13, 134, 25, '#f8fafc', WOOD_DK, 2);
      g.rect(7, 27, 130, 9, WOOD_MD);
      g.rect(8, 15, 128, 11, WOOD_LT);
      // パンフレットスタンド×2 + 受付端末×2 + ベル + 小花瓶
      g.roundBox(13, 16, 16, 8, '#ef4444', '#991b1b');
      g.rect(16, 18, 10, 3, '#fef08a');
      g.box(37, 15, 18, 10, '#38bdf8', INK, 2);
      g.roundBox(67, 18, 10, 6, '#facc15', '#a16207');
      g.box(88, 15, 18, 10, '#38bdf8', INK, 2);
      g.roundBox(117, 15, 12, 9, '#16a34a', '#14532d'); // 受付装花
      g.rect(120, 13, 6, 4, '#f43f5e');
    });

    // Rank 4-5 (96x96, 2x2): L字型コンシェルジュカウンター
    registerCanvasAsset('off_counter_l', 96, 96, (g) => {
      g.shadow(6, 78, 84, 5);
      // 横ウィング（奥側: y=10..42, x=6..90）
      g.roundBox(6, 10, 84, 30, WOOD_LT, WOOD_DK, 2);
      g.rect(8, 29, 80, 9, WOOD_MD);
      // 縦ウィング（左側手前へ折れ: x=6..36, y=10..84）
      g.roundBox(6, 10, 32, 74, WOOD_LT, WOOD_DK, 2);
      g.rect(8, 12, 24, 66, WOOD_HI);
      g.rect(31, 34, 5, 48, WOOD_MD); // 内側側面エッジ
      // 大理石フロント天板ライン
      g.rect(8, 12, 80, 16, '#f8fafc');
      g.rect(8, 12, 22, 68, '#f8fafc');
      // 受付端末2台＆呼び鈴＆卓上装花＆カタログ
      g.box(41, 14, 17, 10, '#38bdf8', INK, 2);
      g.box(64, 14, 17, 10, '#38bdf8', INK, 2);
      g.roundBox(14, 38, 12, 10, '#16a34a', '#14532d');
      g.rect(17, 36, 6, 4, '#fb7185');
      g.roundBox(15, 56, 10, 7, '#facc15', '#a16207'); // 呼び鈴
      g.roundBox(12, 68, 14, 9, '#ef4444', '#991b1b'); // パンフ
    });

    // --- 物件ファイル棚・書庫・製図台 (48x48 / 96x48) ---
    registerCanvasAsset('off_cabinet', 48, 48, (g) => {
      g.shadow(8, 37, 32, 4);
      g.roundBox(8, 5, 32, 33, '#cbd5e1', '#475569', 2);
      g.rect(10, 7, 28, 12, '#e2e8f0');
      g.rect(10, 21, 28, 15, '#cbd5e1');
      g.rect(18, 13, 12, 2, '#334155');
      g.rect(18, 27, 12, 2, '#334155');
      // 物件ファイルタブ
      g.rect(12, 7, 4, 4, '#ef4444');
      g.rect(18, 7, 4, 4, '#3b82f6');
      g.rect(24, 7, 4, 4, '#10b981');
      g.rect(30, 7, 4, 4, '#f59e0b');
    });

    registerCanvasAsset('off_bookshelf', 48, 48, (g) => {
      g.shadow(8, 37, 32, 4);
      g.roundBox(8, 5, 32, 33, WOOD_MD, WOOD_DK, 2);
      const cols = ['#f59e0b', '#3b82f6', '#ef4444', '#10b981', '#a855f7', '#e2e8f0'];
      [8, 17, 26].forEach((ry, ri) => {
        g.rect(10, ry + 7, 28, 2, WOOD_DK);
        for (let bx = 11; bx < 36; bx += 3) {
          g.rect(bx, ry, 2, 7, cols[(bx + ri * 2) % cols.length]);
        }
      });
    });

    registerCanvasAsset('off_draft_table', 96, 48, (g) => {
      g.shadow(9, 38, 78, 4);
      g.roundBox(9, 10, 78, 28, '#f8fafc', '#475569', 2);
      g.box(15, 14, 30, 18, '#dbeafe', '#3b82f6', 2); // 青焼き図面
      g.hline(19, 19, 14, '#60a5fa');
      g.rect(22, 22, 16, 6, '#bfdbfe');
      // 建築立体模型
      g.roundBox(53, 14, 24, 18, '#f1f5f9', '#475569', 2);
      g.rect(56, 12, 18, 7, '#ef4444'); // 赤屋根
      g.rect(59, 22, 12, 7, '#bae6fd');
    });

    // --- カレンダー -> Rank 3からホワイトボード進化 ---
    registerCanvasAsset('off_calendar', 48, 22, (g) => {
      g.box(13, 2, 22, 18, '#ffffff', '#334155', 2);
      g.rect(15, 3, 18, 5, '#ef4444');
      for (let gx = 18; gx <= 28; gx += 5) {
        g.rect(gx, 10, 2, 2, '#0f172a');
        g.rect(gx, 14, 2, 2, gx === 28 ? '#ef4444' : '#0f172a');
      }
    });

    // Rank 3 (96x22): 大型ホワイトボードスケジュール表
    registerCanvasAsset('off_whiteboard_mid', 96, 22, (g) => {
      g.box(6, 1, 84, 19, '#f8fafc', '#64748b', 2);
      // 左: 月カレンダー枠
      g.rect(10, 3, 30, 4, '#ef4444');
      g.box(10, 7, 30, 10, '#ffffff', '#94a3b8');
      for (let gx = 13; gx < 37; gx += 6) {
        g.rect(gx, 9, 3, 2, '#334155');
        g.rect(gx, 13, 3, 2, gx === 25 ? '#ef4444' : '#334155');
      }
      // 右: 予定＆工程メモ
      g.rect(45, 4, 26, 2, '#2563eb');
      g.rect(45, 8, 36, 2, '#64748b');
      g.rect(45, 12, 28, 2, '#64748b');
      g.rect(76, 4, 5, 5, '#facc15'); // 付箋
      g.rect(82, 4, 4, 4, '#ef4444'); // マグネット
      // 下トレイ＋ペン
      g.rect(24, 19, 48, 2, '#334155');
      g.rect(30, 18, 6, 1, '#ef4444');
      g.rect(39, 18, 6, 1, '#2563eb');
    });

    // Rank 4-5 (96x24): プロ仕様ガラススケジュールボード
    registerCanvasAsset('off_whiteboard_pro', 96, 24, (g) => {
      g.box(4, 1, 88, 21, '#f0f9ff', '#334155', 2);
      g.rect(6, 3, 84, 3, '#1e3a8a'); // タイトル帯
      // 左: カレンダーグリッド
      g.box(9, 8, 32, 11, '#ffffff', '#94a3b8');
      for (let gx = 12; gx < 38; gx += 5) {
        g.rect(gx, 10, 2, 2, '#0f172a');
        g.rect(gx, 14, 2, 2, gx === 27 ? '#ef4444' : '#334155');
      }
      // 中央: 売上グラフ
      g.rect(46, 16, 4, 3, '#10b981');
      g.rect(52, 13, 4, 6, '#38bdf8');
      g.rect(58, 10, 4, 9, '#f59e0b');
      // 右: 付箋・KPIメモ
      g.rect(67, 8, 9, 5, '#fef08a');
      g.rect(78, 8, 9, 5, '#fecdd3');
      g.rect(67, 15, 20, 2, '#475569');
      g.rect(22, 21, 52, 2, '#475569');
    });

    registerCanvasAsset('off_trophy', 48, 22, (g) => {
      g.box(13, 2, 22, 18, '#fef3c7', '#b45309', 2);
      g.rect(19, 5, 10, 8, '#facc15');
      g.rect(22, 13, 4, 4, '#b45309');
      g.rect(18, 16, 12, 2, '#92400e');
    });

    // --- 密度・オフィス感アップ用の新規什器 ---
    // 複合コピー機 (48x48)
    registerCanvasAsset('off_printer', 48, 48, (g) => {
      g.shadow(9, 37, 30, 4);
      g.roundBox(9, 10, 30, 28, '#f1f5f9', '#475569', 2);
      g.rect(11, 12, 26, 6, '#e2e8f0'); // スキャナ蓋
      g.rect(31, 14, 4, 2, '#22c55e'); // 緑ランプ
      g.rect(13, 22, 22, 6, '#cbd5e1'); // カセット1
      g.rect(13, 30, 22, 6, '#94a3b8'); // カセット2
      g.rect(39, 18, 5, 6, '#ffffff');  // 給紙トレイ
    });

    // ウォーターサーバー (48x48)
    registerCanvasAsset('off_water', 48, 48, (g) => {
      g.shadow(14, 38, 20, 4);
      g.roundBox(15, 18, 18, 21, '#f8fafc', '#64748b', 2);
      g.roundBox(17, 6, 14, 13, '#38bdf8', '#0284c7', 2); // 水タンク
      g.rect(20, 9, 4, 5, '#bae6fd');
      g.rect(19, 24, 10, 6, '#334155');
      g.px(22, 26, '#ef4444'); g.px(25, 26, '#3b82f6');
    });

    // 社員ロッカー (48x48)
    registerCanvasAsset('off_locker', 48, 48, (g) => {
      g.shadow(8, 38, 32, 4);
      g.roundBox(8, 6, 32, 33, '#94a3b8', '#475569', 2);
      g.vline(24, 8, 29, '#475569');
      g.rect(12, 11, 8, 2, '#475569'); g.rect(28, 11, 8, 2, '#475569');
      g.px(21, 21, '#1e293b'); g.px(27, 21, '#1e293b');
    });

    // 建材・間取りサンプル棚 (48x48)
    registerCanvasAsset('off_shelf_sample', 48, 48, (g) => {
      g.shadow(7, 37, 34, 4);
      g.roundBox(7, 7, 34, 31, WOOD_MD, WOOD_DK, 2);
      g.rect(9, 18, 30, 2, WOOD_DK);
      g.rect(11, 10, 7, 7, '#f8fafc');
      g.rect(20, 10, 7, 7, '#fde68a');
      g.rect(29, 10, 7, 7, '#bae6fd');
      g.rect(12, 22, 8, 12, '#cbd5e1');
      g.rect(24, 22, 12, 11, '#f43f5e');
    });

    // パンフレットスタンド (48x48)
    registerCanvasAsset('off_stand', 48, 48, (g) => {
      g.shadow(14, 37, 20, 3);
      g.roundBox(14, 8, 20, 28, '#475569', INK, 2);
      g.rect(16, 11, 7, 9, '#ef4444');
      g.rect(25, 11, 7, 9, '#3b82f6');
      g.rect(16, 22, 7, 9, '#10b981');
      g.rect(25, 22, 7, 9, '#f59e0b');
    });

    // 商談・打合せセット (96x48: テーブル＋丸椅子2脚＋図面)
    registerCanvasAsset('off_meeting_set', 96, 48, (g) => {
      g.shadow(12, 36, 72, 4);
      // 左右の椅子
      g.roundBox(12, 16, 13, 16, '#3b82f6', '#1e3a8a', 2);
      g.roundBox(71, 16, 13, 16, '#3b82f6', '#1e3a8a', 2);
      // テーブル
      g.roundBox(26, 9, 44, 30, '#f8fafc', SLATE_LN, 2);
      g.box(33, 14, 18, 12, '#dbeafe', '#3b82f6');
      g.roundBox(57, 16, 8, 8, '#f8fafc', '#94a3b8');
      g.rect(59, 18, 4, 4, '#78350f');
    });

    // 応接ローテーブル (96x48)
    registerCanvasAsset('off_lounge_table', 96, 48, (g) => {
      g.shadow(14, 35, 68, 4);
      g.roundBox(14, 12, 68, 24, WOOD_LT, WOOD_DK, 2);
      g.rect(16, 14, 64, 18, '#f8fafc');
      g.roundBox(24, 18, 16, 10, '#f59e0b', '#b45309'); // カタログ雑誌
      g.roundBox(54, 17, 12, 10, '#e2e8f0', '#64748b'); // お茶セット
      g.rect(58, 19, 4, 4, '#16a34a');
    });

    // サーバーラック (48x48)
    registerCanvasAsset('off_server', 48, 48, (g) => {
      g.shadow(10, 38, 28, 4);
      g.roundBox(10, 5, 28, 34, '#1e293b', '#020617', 2);
      [9, 17, 25, 33].forEach((yy, idx) => {
        g.rect(13, yy, 22, 5, '#334155');
        g.rect(15, yy + 2, 3, 2, idx % 2 === 0 ? '#38bdf8' : '#22c55e');
        g.rect(20, yy + 2, 3, 2, '#facc15');
      });
    });
  }

  function initAllAssets() {
    if (registry.size > 0) return;
    registerFloorTiles();
    registerFurniture();
    registerCharacters();
    registerOfficeAssets();
  }

  global.PixelAssets = {
    initAllAssets,
    registerExternal,
    getSprite,
    drawSprite,
    listIds: () => Array.from(registry.keys())
  };
})(window);
