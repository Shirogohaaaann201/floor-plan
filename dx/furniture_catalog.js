'use strict';
/**
 * furniture_catalog.js
 * 家具・インテリア収集図鑑マスターカタログ & ID正規化モジュール (C-3 / A-3)
 * - 全78種（向き差分を統合した正規ID・カテゴリ・レア度・90°回転ビュー・フレーバー・出現ヒント）
 */
(function (global) {
  const CATEGORIES = [
    'リビング・洋室',
    '和室',
    '水回り・玄関・収納',
    '庭・外構',
    '特別・珍間取り',
    '壁装飾'
  ];

  const RARITY_META = {
    common:   { label: '定番', color: '#94a3b8', bg: 'rgba(148,163,184,0.16)', border: 'rgba(148,163,184,0.38)' },
    uncommon: { label: 'こだわり', color: '#38bdf8', bg: 'rgba(56,189,248,0.18)', border: 'rgba(56,189,248,0.42)' },
    special:  { label: '特別・珍', color: '#c084fc', bg: 'rgba(168,85,247,0.20)', border: 'rgba(168,85,247,0.45)' },
    rare:     { label: 'レア', color: '#fbbf24', bg: 'rgba(245,158,11,0.22)', border: 'rgba(245,158,11,0.5)' }
  };

  const WALL_DECO_TYPE_TO_ID = {
    fuji: 'wall_fuji',
    shower: 'wall_shower',
    kakejiku: 'wall_kakejiku',
    scroll_ninja: 'wall_scroll_ninja',
    art_1: 'wall_art_1',
    art_2: 'wall_art_2',
    clock: 'wall_clock',
    acoustic_panel: 'wall_acoustic_panel',
    gold_trophy: 'wall_gold_trophy'
  };

  const ITEMS = [
    // ================= 1. リビング・洋室 (16) =================
    {
      id: 'furn_kitchen',
      name: 'システムキッチン',
      category: 'リビング・洋室',
      rarity: 'common',
      floorId: 'floor_ldk',
      isWall: false,
      views: [
        { label: '北壁向き', spriteId: 'furn_kitchen' },
        { label: '東壁向き', spriteId: 'furn_kitchen_v_east' },
        { label: '西壁向き', spriteId: 'furn_kitchen_v_west' }
      ],
      aliases: [],
      flavor: '赤い鍋がかわいくてさ、気づいたらコンロ前に立つ時間が増えたんだよね。今週もう3日連続でカレーだけど！',
      reviewer: '20代・自炊デビュー',
      hint: 'LDKを設けると標準で備わる設備。広すぎると別のスタイルに格上げされる。'
    },
    {
      id: 'furn_island_kitchen',
      name: '対面アイランドキッチン',
      category: 'リビング・洋室',
      rarity: 'uncommon',
      floorId: 'floor_ldk',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_island_kitchen' }
      ],
      aliases: [],
      flavor: '友達を呼ぶたびに『お店みたい！』って褒められるんだよね。普段はここでカップ麺すすってるだけなんだけどさ。',
      reviewer: '30代・DINKS',
      hint: '縦横3マス以上で9マス以上のゆったりLDKに組むと、調理の主役が部屋の真ん中へ張り出してくる。'
    },
    {
      id: 'furn_fridge',
      name: '冷凍冷蔵庫',
      category: 'リビング・洋室',
      rarity: 'common',
      floorId: 'floor_ldk',
      isWall: false,
      views: [
        { label: '北壁', spriteId: 'furn_fridge_north' },
        { label: '東壁', spriteId: 'furn_fridge_east' },
        { label: '南壁', spriteId: 'furn_fridge_south' },
        { label: '西壁', spriteId: 'furn_fridge_west' }
      ],
      aliases: ['furn_fridge'],
      flavor: 'いやー、このサイズ最高！お気に入りのアイスを箱ごと3種類常備できるのが一番の贅沢なんだよな。',
      reviewer: '20代・甘党会社員',
      hint: 'LDKを6マス以上に広げると、台所まわりの必需品がもうひとつ増える。'
    },
    {
      id: 'furn_dining',
      name: 'ダイニングセット',
      category: 'リビング・洋室',
      rarity: 'common',
      floorId: 'floor_ldk',
      isWall: false,
      views: [
        { label: '椅子・上下', spriteId: 'furn_dining' },
        { label: '椅子・左右', spriteId: 'furn_dining_lr' }
      ],
      aliases: [],
      flavor: 'ここでゆっくり朝食をとる予定だったんだけどねぇ。気づいたら郵便物とチラシの特等席になっちゃったよ。',
      reviewer: '30代・共働き',
      hint: '3〜5マスのLDKや9マス以上の大空間で定番の食卓になる。おしゃれ系の物件だと別の顔に。'
    },
    {
      id: 'furn_cafe_table',
      name: 'カフェ丸テーブル',
      category: 'リビング・洋室',
      rarity: 'common',
      floorId: 'floor_ldk',
      isWall: false,
      views: [
        { label: '椅子・左右', spriteId: 'furn_cafe_table' },
        { label: '椅子・上下', spriteId: 'furn_cafe_table_tb' }
      ],
      aliases: [],
      flavor: '休日の朝にコーヒーを淹れて座るだけでさ、なんだかおしゃれなカフェに来た気分になれるんだよね！',
      reviewer: '20代・カフェ好き',
      hint: '陽だまりやおしゃれ系、DINKS向けのLDKでよく選ばれる。ふつうの依頼でもときどき気分で置かれるらしい。'
    },
    {
      id: 'furn_sofa',
      name: '2人掛けソファ',
      category: 'リビング・洋室',
      rarity: 'common',
      floorId: 'floor_ldk',
      isWall: false,
      views: [
        { label: '北向き(背もたれ北)', spriteId: 'furn_sofa' },
        { label: '東向き(背もたれ東)', spriteId: 'furn_sofa_v_east' },
        { label: '南向き(背もたれ南)', spriteId: 'furn_sofa_south' },
        { label: '西向き(背もたれ西)', spriteId: 'furn_sofa_v_west' }
      ],
      aliases: [],
      flavor: '2人掛けのはずなんだけどね、気づくといつもどっちかがゴロンと横になって全部使ってるんだよな。',
      reviewer: '30代・新婚夫婦',
      hint: 'LDKを6マス以上に広げると、くつろぎの特等席がやって来る。'
    },
    {
      id: 'furn_living_rug',
      name: 'リビングラグ',
      category: 'リビング・洋室',
      rarity: 'uncommon',
      floorId: 'floor_ldk',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_living_rug' }
      ],
      aliases: [],
      flavor: 'ふかふかで気持ちよすぎてさ、ソファを背もたれにして家族みんな床に座ってるんだよね。',
      reviewer: '40代・ファミリー',
      hint: '縦横3マス以上の広がりを持つ8マス以上のLDKを組むと、くつろぎスペースの足元まで整う。'
    },
    {
      id: 'furn_tv',
      name: 'テレビ＆ローボード',
      category: 'リビング・洋室',
      rarity: 'common',
      floorId: 'floor_ldk',
      isWall: false,
      views: [
        { label: '北壁', spriteId: 'furn_tv_north' },
        { label: '東壁', spriteId: 'furn_tv_east' },
        { label: '南壁', spriteId: 'furn_tv_south' },
        { label: '西壁', spriteId: 'furn_tv_west' }
      ],
      aliases: ['furn_tv'],
      flavor: '休日に部屋を暗くして映画を一気見するのが最高なんだよね！ポップコーンまで用意して満喫してるよ。',
      reviewer: '30代・映画ファン',
      hint: 'LDKを8マス以上に広げると、壁際に娯楽の主役が据えられる。窓のない要塞物件は別枠。'
    },
    {
      id: 'furn_bed_s',
      name: 'シングルベッド',
      category: 'リビング・洋室',
      rarity: 'common',
      floorId: 'floor_room',
      isWall: false,
      views: [
        { label: '北壁', spriteId: 'furn_bed_s_north' },
        { label: '東壁', spriteId: 'furn_bed_s_east' },
        { label: '南壁', spriteId: 'furn_bed_s_south' },
        { label: '西壁', spriteId: 'furn_bed_s_west' }
      ],
      aliases: ['furn_bed_s'],
      flavor: '寝返りうつとちょうど壁に手が届くサイズ感が落ち着くんだよね。自分だけの秘密基地って感じでさ！',
      reviewer: '20代・新社会人',
      hint: '5マス以下の洋室ならまず見かける、一人暮らしの相棒。'
    },
    {
      id: 'furn_bed_w',
      name: 'ダブルベッド',
      category: 'リビング・洋室',
      rarity: 'common',
      floorId: 'floor_room',
      isWall: false,
      views: [
        { label: '北壁', spriteId: 'furn_bed_w' },
        { label: '東壁', spriteId: 'furn_bed_w_v_east' },
        { label: '西壁', spriteId: 'furn_bed_w_v_west' }
      ],
      aliases: [],
      flavor: '1人で大の字になれるの、ほんと最高すぎない？もう片方の枕はね、抱き枕として大活躍してるよ。',
      reviewer: '30代・快眠ガチ勢',
      hint: '洋室を6マス以上の主寝室サイズまで広げると、寝床もゆったり格上げされる。'
    },
    {
      id: 'furn_kids_bed',
      name: '子ども用星柄ベッド',
      category: 'リビング・洋室',
      rarity: 'common',
      floorId: 'floor_room',
      isWall: false,
      views: [
        { label: '北壁', spriteId: 'furn_kids_bed' },
        { label: '東壁', spriteId: 'furn_kids_bed_east' },
        { label: '南壁', spriteId: 'furn_kids_bed_south' },
        { label: '西壁', spriteId: 'furn_kids_bed_west' }
      ],
      aliases: [],
      flavor: 'お星さまの模様がよっぽど嬉しかったみたいでね、『きょうから1人で寝る！』って3日で卒業しちゃったのよ。',
      reviewer: '30代・二児の母',
      hint: 'ファミリーや大家族の2室目の洋室でよく見かける。洋室を複数つくる間取りでもお目にかかれる。'
    },
    {
      id: 'furn_desk',
      name: 'パソコンデスク',
      category: 'リビング・洋室',
      rarity: 'common',
      floorId: 'floor_room',
      isWall: false,
      views: [
        { label: '北壁', spriteId: 'furn_desk' },
        { label: '東壁', spriteId: 'furn_desk_east' },
        { label: '南壁', spriteId: 'furn_desk_south' },
        { label: '西壁', spriteId: 'furn_desk_west' }
      ],
      aliases: [],
      flavor: 'マグカップ片手に作業するとすっごく捗るんだよね！……まあ、夕方になるとだいたい動画サイト開いちゃうけど。',
      reviewer: '20代・リモートワーカー',
      hint: '3マス以上の洋室を用意すると、寝床のほかに作業スペースまで確保される。'
    },
    {
      id: 'furn_gaming_desk',
      name: 'ゲーミングデスク',
      category: 'リビング・洋室',
      rarity: 'uncommon',
      floorId: 'floor_room',
      isWall: false,
      views: [
        { label: '北壁', spriteId: 'furn_gaming_desk' },
        { label: '東壁', spriteId: 'furn_gaming_desk_east' },
        { label: '南壁', spriteId: 'furn_gaming_desk_south' },
        { label: '西壁', spriteId: 'furn_gaming_desk_west' }
      ],
      aliases: [],
      flavor: '机が七色に光るおかげでテンション上がりっぱなし！深夜でも『よし、あと1戦だけ！』が止まらないんだよね。',
      reviewer: '20代・ゲーム好き',
      hint: '在宅ワーカーや趣味推しの依頼で洋室を組むと登場。洋室が2室以上ある物件でも巡り合える。'
    },
    {
      id: 'furn_book_desk',
      name: '文豪の書斎デスク',
      category: 'リビング・洋室',
      rarity: 'uncommon',
      floorId: 'floor_room',
      isWall: false,
      views: [
        { label: '北壁', spriteId: 'furn_book_desk' },
        { label: '東壁', spriteId: 'furn_book_desk_east' },
        { label: '南壁', spriteId: 'furn_book_desk_south' },
        { label: '西壁', spriteId: 'furn_book_desk_west' }
      ],
      aliases: [],
      flavor: 'この緑のランプを点けるとね、不思議と名探偵になった気分でさ。買い物メモまで万年筆で書きたくなるんだよ。',
      reviewer: '40代・ミステリー好き',
      hint: 'ミステリー好きやVIP、シニア向けの洋室で選ばれやすい。2室目以降の洋室で顔を出すことも。'
    },
    {
      id: 'furn_bookshelf',
      name: 'カラフル本棚',
      category: 'リビング・洋室',
      rarity: 'common',
      floorId: 'floor_room',
      isWall: false,
      views: [
        { label: '北壁', spriteId: 'furn_bookshelf_north' },
        { label: '東壁', spriteId: 'furn_bookshelf_east' },
        { label: '南壁', spriteId: 'furn_bookshelf_south' },
        { label: '西壁', spriteId: 'furn_bookshelf_west' }
      ],
      aliases: ['furn_bookshelf'],
      flavor: '背表紙をグラデーションに並べて大満足！……半分くらいまだ読んでないのは、これからの楽しみってことでね。',
      reviewer: '30代・読書好き',
      hint: '6マス以上の広い洋室や、書斎向けの落ち着いた個室で壁際を彩る。'
    },
    {
      id: 'furn_toy_box',
      name: 'おもちゃ箱',
      category: 'リビング・洋室',
      rarity: 'common',
      floorId: 'floor_room',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_toy_box' }
      ],
      aliases: [],
      flavor: 'あかいミニカーもつみきも、ぜーんぶここに入るんだよ！おうちで一番たからものが集まるばしょなんだ！',
      reviewer: '6歳・くるま大好き',
      hint: '2マス以上の子ども部屋ができると、床まわりに賑やかな一角が生まれる。'
    },

    // ================= 2. 和室 (7) =================
    {
      id: 'furn_chabudai',
      name: 'ちゃぶ台＆座布団',
      category: '和室',
      rarity: 'common',
      floorId: 'floor_washitsu',
      isWall: false,
      views: [
        { label: '座布団・上下', spriteId: 'furn_chabudai' },
        { label: '座布団・左右', spriteId: 'furn_chabudai_lr' }
      ],
      aliases: [],
      flavor: '急須でお茶を淹れてみんなで囲むとね、なんだか昭和のホームドラマみたいな楽しい会話が始まるんですよ。',
      reviewer: '40代・二世帯',
      hint: '和室を置いたときに選ばれる客間寄りの設え。和室を何部屋か組んでみれば出会える。'
    },
    {
      id: 'furn_kotatsu',
      name: 'こたつ＆みかん',
      category: '和室',
      rarity: 'common',
      floorId: 'floor_washitsu',
      isWall: false,
      views: [
        { label: '横向き', spriteId: 'furn_kotatsu' },
        { label: '縦向き', spriteId: 'furn_kotatsu_v' }
      ],
      aliases: [],
      flavor: 'ちょっと温まるだけのつもりだったんだけどさぁ……気づいたらみかんの皮の山といっしょに朝を迎えてたよ。',
      reviewer: '20代・寒がり',
      hint: '和室を置いたときに選ばれる冬支度仕様。和室をいくつか試すと自然と顔を出す。'
    },
    {
      id: 'furn_futon',
      name: 'お布団',
      category: '和室',
      rarity: 'common',
      floorId: 'floor_washitsu',
      isWall: false,
      views: [
        { label: '北枕', spriteId: 'furn_futon' },
        { label: '東枕', spriteId: 'furn_futon_east' },
        { label: '南枕', spriteId: 'furn_futon_south' },
        { label: '西枕', spriteId: 'furn_futon_west' }
      ],
      aliases: [],
      flavor: '毎晩『明日の朝こそきれいにたたむぞ』って決意して眠るんだけどね、結局そのまま出かけちゃうんだよな。',
      reviewer: '20代・一人暮らし',
      hint: '和室を置いたときに選ばれる寝どころ仕様。和室をいくつか組めばお目にかかれる。'
    },
    {
      id: 'furn_watansu',
      name: '和箪笥',
      category: '和室',
      rarity: 'common',
      floorId: 'floor_washitsu',
      isWall: false,
      views: [
        { label: '北壁', spriteId: 'furn_watansu' },
        { label: '東壁', spriteId: 'furn_watansu_east' },
        { label: '南壁', spriteId: 'furn_watansu_south' },
        { label: '西壁', spriteId: 'furn_watansu_west' }
      ],
      aliases: [],
      flavor: '開けるたび木のいい香りがするんですよ。季節の服を入れ替える時間も、なんだか楽しみになりましてね。',
      reviewer: '60代・シニア夫婦',
      hint: '4マス以上の和室にすると、壁際にどっしりとした収納家具が納まる。'
    },
    {
      id: 'furn_bonsai',
      name: '違い棚と小盆栽',
      category: '和室',
      rarity: 'common',
      floorId: 'floor_washitsu',
      isWall: false,
      views: [
        { label: '北壁', spriteId: 'furn_bonsai' },
        { label: '東壁', spriteId: 'furn_bonsai_east' },
        { label: '南壁', spriteId: 'furn_bonsai_south' },
        { label: '西壁', spriteId: 'furn_bonsai_west' }
      ],
      aliases: [],
      flavor: '違い棚に映えるからと世話を始めたらね、すっかり愛着が湧いちゃって。休日はハサミ片手に眺めてるんですよ。',
      reviewer: '50代・盆栽ビギナー',
      hint: '4マス以上の和室、とくに客間寄りの一室や6マス以上の大広間で壁際を飾る。'
    },
    {
      id: 'furn_tokonoma',
      name: '仏壇',
      category: '和室',
      rarity: 'uncommon',
      floorId: 'floor_washitsu',
      isWall: false,
      views: [
        { label: '北壁向き', spriteId: 'furn_tokonoma' }
      ],
      aliases: [],
      flavor: '内見のときから妙に落ち着くなぁと思ってたんですよ。ご先祖様がずっと見守ってくれてたみたいですね。',
      reviewer: '50代・二世帯',
      hint: '2×2マス以上の和室で北側に窓のない壁を2マス以上残しておくと、奥ゆかしい一角が設えられることがある。'
    },
    {
      id: 'furn_tea_set',
      name: '囲炉裏・茶室セット',
      category: '和室',
      rarity: 'special',
      floorId: 'floor_washitsu',
      isWall: false,
      views: [
        { label: '座布団・左右', spriteId: 'furn_tea_set_center' },
        { label: '座布団・上下', spriteId: 'furn_tea_set_center_v' },
        { label: '単独炉（狭小用）', spriteId: 'furn_tea_set' }
      ],
      aliases: ['furn_tea_set_center', 'furn_tea_set_center_v'],
      flavor: '鉄釜の湯気を眺めてると、すーっと心が静まるんですよ。夏場はさすがに少し暑いんですけど、それもまた一興ですね。',
      reviewer: '60代・茶道歴30年',
      hint: '和室4室を田の字に繋ぐ「古き良き日本家屋」を組むと、その一室が特別な趣に変わる。'
    },

    // ================= 3. 水回り・玄関・収納 (13) =================
    {
      id: 'furn_bath_tub',
      name: 'システムバス浴槽',
      category: '水回り・玄関・収納',
      rarity: 'common',
      floorId: 'floor_bath',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_bath_tub' }
      ],
      aliases: [],
      flavor: '仕事帰りに追い焚きボタンをポチッと押す瞬間が一番幸せ！お湯に浸かれば、きょうの疲れも全部ふっ飛ぶよ。',
      reviewer: '30代・営業職',
      hint: '1〜3マスの標準的な独立浴室を置けば、まず最初にお目にかかれる。'
    },
    {
      id: 'furn_bath_stool',
      name: '桧の風呂椅子＆ケロリン桶',
      category: '水回り・玄関・収納',
      rarity: 'common',
      floorId: 'floor_bath',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_bath_stool' }
      ],
      aliases: [],
      flavor: '桧の香りがたまらないんだよね！黄色い桶も頑丈そのもので、毎日おうち銭湯気分を味わってるよ。',
      reviewer: '40代・銭湯ファン',
      hint: '浴室を2マス以上に広げると、洗い場まわりに気の利いた小道具が揃う。'
    },
    {
      id: 'furn_ub',
      name: '3点ユニットバス',
      category: '水回り・玄関・収納',
      rarity: 'common',
      floorId: 'floor_ub',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_ub' }
      ],
      aliases: [],
      flavor: 'お風呂ついでに床ごとシャワーでざっと洗えるのが最高でさ！掃除がラクすぎて、気づいたら手放せなくなったよ。',
      reviewer: '30代・ミニマリスト',
      hint: '省スペースのUBピースを敷地に置けば、水回りがまるごとひとまとめになる。'
    },
    {
      id: 'furn_toilet',
      name: '洋式トイレ',
      category: '水回り・玄関・収納',
      rarity: 'common',
      floorId: 'floor_toilet',
      isWall: false,
      views: [
        { label: '北壁', spriteId: 'furn_toilet_north' },
        { label: '東壁', spriteId: 'furn_toilet_east' },
        { label: '南壁', spriteId: 'furn_toilet_south' },
        { label: '西壁', spriteId: 'furn_toilet_west' }
      ],
      aliases: ['furn_toilet'],
      flavor: 'なんだか妙に落ち着く空間でさ、スマホのニュースをゆっくり読む小さな書斎みたいになってるんだよな。',
      reviewer: '30代・会社員',
      hint: 'お手洗いを1マスでも設ければ、欠かさず据え付けられる定番設備。'
    },
    {
      id: 'furn_washbasin',
      name: '独立洗面台',
      category: '水回り・玄関・収納',
      rarity: 'common',
      floorId: 'floor_washroom',
      isWall: false,
      views: [
        { label: '北壁', spriteId: 'furn_washbasin_north' },
        { label: '東壁', spriteId: 'furn_washbasin_east' },
        { label: '南壁', spriteId: 'furn_washbasin_south' },
        { label: '西壁', spriteId: 'furn_washbasin_west' }
      ],
      aliases: ['furn_washbasin'],
      flavor: '朝の支度が風呂場と分かれただけで、気分がぜんぜん違うの！鏡の前でセットする時間も楽しくなったよ。',
      reviewer: '20代・会社員',
      hint: '洗面所を設けると壁際に納まる。3マス以上の広いお手洗いにもさりげなく現れる。'
    },
    {
      id: 'furn_washer',
      name: '全自動洗濯機',
      category: '水回り・玄関・収納',
      rarity: 'common',
      floorId: 'floor_washroom',
      isWall: false,
      views: [
        { label: '北壁', spriteId: 'furn_washer_north' },
        { label: '東壁', spriteId: 'furn_washer_east' },
        { label: '南壁', spriteId: 'furn_washer_south' },
        { label: '西壁', spriteId: 'furn_washer_west' }
      ],
      aliases: ['furn_washer'],
      flavor: '終了メロディが鳴ってから『はーい今行くよ〜』って言いながら、毎回ちょっとだけ熟成させちゃうんだよね。',
      reviewer: '20代・マイペース派',
      hint: '洗面所を2マス以上に広げ、ドアが塞がない壁際を残しておくと置かれる家電。'
    },
    {
      id: 'furn_bathmat',
      name: 'バスマット',
      category: '水回り・玄関・収納',
      rarity: 'common',
      floorId: 'floor_washroom',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_bathmat' }
      ],
      aliases: [],
      flavor: '友達んちに遊びに行ったらさ、玄関開けて一歩目がこれだったんだよ！雨の日だったから意外と助かっちゃったけどね。',
      reviewer: '30代・遊びに来た友人',
      hint: '玄関から水回りにしか進めない珍構造、「水門」を組んだ物件の入口にぽつんと敷かれる。'
    },
    {
      id: 'furn_shoesbox_slim',
      name: 'スリム下駄箱',
      category: '水回り・玄関・収納',
      rarity: 'common',
      floorId: 'floor_entrance',
      isWall: false,
      views: [
        { label: '北壁', spriteId: 'furn_shoesbox_slim_north' },
        { label: '東壁', spriteId: 'furn_shoesbox_slim_east' },
        { label: '南壁', spriteId: 'furn_shoesbox_slim_south' },
        { label: '西壁', spriteId: 'furn_shoesbox_slim_west' }
      ],
      aliases: ['furn_shoesbox_slim'],
      flavor: 'スリムなのに靴がびっくりするほど入るんだよね！上の小さな花瓶に季節のお花を飾るのが日課になってるよ。',
      reviewer: '20代・一人暮らし',
      hint: '玄関の横に壁を残して建てると、入口を塞がないようにそっと寄り添う。'
    },
    {
      id: 'furn_shoes_pair',
      name: '土間の揃え靴',
      category: '水回り・玄関・収納',
      rarity: 'common',
      floorId: 'floor_entrance',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_shoes_pair' }
      ],
      aliases: [],
      flavor: '内見の日から『よし、毎回きれいに揃えよう』って決めたんだよね！今のところ3週間連続で記録更新中だよ。',
      reviewer: '20代・新生活',
      hint: '玄関のある物件を完成させれば、引き渡し直前の入口にひっそり並んでいる。'
    },
    {
      id: 'furn_closet_rack',
      name: 'ハンガーラック',
      category: '水回り・玄関・収納',
      rarity: 'common',
      floorId: 'floor_closet',
      isWall: false,
      views: [
        { label: '北壁', spriteId: 'furn_closet_rack_north' },
        { label: '東壁', spriteId: 'furn_closet_rack_east' },
        { label: '南壁', spriteId: 'furn_closet_rack_south' },
        { label: '西壁', spriteId: 'furn_closet_rack_west' }
      ],
      aliases: ['furn_closet_rack'],
      flavor: 'お気に入りの服をセレクトショップみたいに並べたらさ、毎朝のコーデ選びがちょっと楽しみになったんだよね！',
      reviewer: '30代・ファッション好き',
      hint: '収納スペースを設けると最初に掛けられる基本の衣類整理アイテム。'
    },
    {
      id: 'furn_rack_steel',
      name: '大型スチールラック',
      category: '水回り・玄関・収納',
      rarity: 'common',
      floorId: 'floor_closet',
      isWall: false,
      views: [
        { label: '北壁', spriteId: 'furn_rack_steel_north' },
        { label: '東壁', spriteId: 'furn_rack_steel_east' },
        { label: '南壁', spriteId: 'furn_rack_steel_south' },
        { label: '西壁', spriteId: 'furn_rack_steel_west' }
      ],
      aliases: ['furn_rack_steel'],
      flavor: '頑丈だから通販の箱を『とりあえず』って載せてたらね、3段目がワクワクする開かずの宝箱になっちゃったよ。',
      reviewer: '30代・コレクター',
      hint: '収納を2マス以上に繋げると、もっと荷物を載せられる頼もしい棚が加わる。'
    },
    {
      id: 'furn_warehouse_crate',
      name: '積み上げ木箱と台車',
      category: '水回り・玄関・収納',
      rarity: 'uncommon',
      floorId: 'floor_closet',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_warehouse_crate' }
      ],
      aliases: [],
      flavor: 'うちに台車がある暮らしなんて初めてだけどさ、箱買いしたお水の移動がびっくりするくらいラクなんだよね！',
      reviewer: '40代・まとめ買い派',
      hint: '収納を4マス以上に広げると、もはやバックヤードのような荷物が運び込まれる。'
    },
    {
      id: 'furn_plant',
      name: '観葉植物',
      category: '水回り・玄関・収納',
      rarity: 'common',
      floorId: 'floor_room',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_plant' }
      ],
      aliases: [],
      flavor: 'これを1鉢置いただけで『ていねいな暮らし』っぽくなったよね！毎朝お水をあげながら『おはよう』って言ってるよ。',
      reviewer: '20代・インテリア好き',
      hint: '6マス以上の「大ホワイエ」や広めの書斎、おしゃれ系の大きなLDKにさりげなく彩りを添える。'
    },

    // ================= 4. 庭・外構 (11) =================
    {
      id: 'furn_flower',
      name: '色とりどりの花壇',
      category: '庭・外構',
      rarity: 'common',
      floorId: 'floor_garden',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_flower' }
      ],
      aliases: [],
      flavor: '毎朝カーテンを開けるのが楽しみになっちゃってね。通りすがりのご近所さんとお花の話で盛り上がるんですよ。',
      reviewer: '50代・ガーデニング好き',
      hint: '和室を入れない物件で2マス以上の庭を残すか、8マス以上の大庭園にすると彩りが芽吹く。'
    },
    {
      id: 'furn_tree',
      name: 'シンボルツリー',
      category: '庭・外構',
      rarity: 'common',
      floorId: 'floor_garden',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_tree' }
      ],
      aliases: [],
      flavor: '夏は涼しい木陰をつくってくれて大助かりだよ！季節ごとに葉の色が変わるのを眺めるのもいいもんだね。',
      reviewer: '40代・一戸建て派',
      hint: '敷地の余白に4マス以上のまとまった庭を残すと、立派な緑が枝を広げる。'
    },
    {
      id: 'furn_stepping_stone',
      name: '和風飛び石',
      category: '庭・外構',
      rarity: 'common',
      floorId: 'floor_garden',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_stepping_stone' }
      ],
      aliases: [],
      flavor: 'わざわざ石の上だけを歩いて玄関へ向かうのがクセになっちゃってね。全部きれいに踏めると、なんだか一日いい気分だよ！',
      reviewer: '30代・和モダン好き',
      hint: '和室のある家や和好みの依頼で、2マス以上の庭を残すと足元に趣が生まれる。'
    },
    {
      id: 'furn_lantern',
      name: '石灯籠とつくばい',
      category: '庭・外構',
      rarity: 'common',
      floorId: 'floor_garden',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_lantern' }
      ],
      aliases: [],
      flavor: '夕方に見ると、高級旅館に泊まりに来たみたいな気分になるんですよ。ついついお茶を淹れて眺めちゃいますね。',
      reviewer: '50代・庭園好き',
      hint: '和室のある家や和好みの依頼で、4マス以上の庭を確保すると一気に風情が増す。'
    },
    {
      id: 'furn_pond',
      name: '錦鯉の池',
      category: '庭・外構',
      rarity: 'uncommon',
      floorId: 'floor_garden',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_pond' }
      ],
      aliases: [],
      flavor: '引っ越してきた初日から、なぜか立派な鯉が優雅に泳いでましてね。今では1匹ずつ名前まで付けて、毎朝エサをあげるのが楽しみなんですよ。',
      reviewer: '60代・悠々自適',
      hint: '和室のある家で8〜11マスほどの大きな庭を造ると、水辺の主役が現れる。'
    },
    {
      id: 'furn_garden_table',
      name: 'パラソルガーデンセット',
      category: '庭・外構',
      rarity: 'uncommon',
      floorId: 'floor_garden',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_garden_table' }
      ],
      aliases: [],
      flavor: '晴れた日にパラソルの下で紅茶をいただくのが至福なんですの。ちょっとしたリゾート気分が味わえますわよ。',
      reviewer: '40代・マダム',
      hint: '和室を入れない洋風の家で8〜11マスほどの広い庭を残すと、屋外でくつろぐ特等席ができる。'
    },
    {
      id: 'furn_rose_arch',
      name: 'バラのアーチ',
      category: '庭・外構',
      rarity: 'uncommon',
      floorId: 'floor_garden',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_rose_arch' }
      ],
      aliases: [],
      flavor: '朝のゴミ出しでもここをくぐるとね、ちょっと物語の主人公になった気分でさ！背筋がふわっと軽くなるよ。',
      reviewer: '30代・お花好き',
      hint: '和室を入れない洋風の家で4マス以上の庭を残すと、華やかな見せ場が立ち上がる。'
    },
    {
      id: 'furn_birdbath',
      name: '小鳥の水浴び場',
      category: '庭・外構',
      rarity: 'uncommon',
      floorId: 'floor_garden',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_birdbath' }
      ],
      aliases: [],
      flavor: '毎朝やって来る青い小鳥を窓から見守ってるんですよ。あちらもこっちをチラッと見てて、すっかりお馴染みさんですね。',
      reviewer: '50代・バードウォッチャー',
      hint: '和室を入れない洋風の家で4マス以上の庭を残すと、小さな来客を招く石造りの飾りが置かれる。'
    },
    {
      id: 'furn_sandbox',
      name: '公園の砂場',
      category: '庭・外構',
      rarity: 'special',
      floorId: 'floor_garden',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_sandbox' }
      ],
      aliases: [],
      flavor: '近所の子どもたちが毎日遊びに来るようになってね。庭がこんなに賑やかなの、見てるこっちまで元気もらえるんだよ！',
      reviewer: '30代・大家族',
      hint: '庭を12マス以上に広げるか、「もはや公園」と呼べる規模にすると子どもの遊び場が生まれる。'
    },
    {
      id: 'furn_slide',
      name: '公園のすべり台',
      category: '庭・外構',
      rarity: 'special',
      floorId: 'floor_garden',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_slide' }
      ],
      aliases: [],
      flavor: '内見で『近くに公園があるんですか？』って聞いたら『いえ、敷地内です』って返されてさ！子どもが大喜びで即決したよ。',
      reviewer: '30代・子育て世帯',
      hint: '建物に負けないほど庭を大きく取り、「もはや公園」を成立させると本格的な遊具まで建つ。'
    },
    {
      id: 'furn_bench',
      name: '木製公園ベンチ',
      category: '庭・外構',
      rarity: 'special',
      floorId: 'floor_garden',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_bench' }
      ],
      aliases: [],
      flavor: '休日の昼下がりに缶コーヒー飲みながら座ってるとね、散歩中のワンちゃんがよく寄ってきてくれるんだよな。',
      reviewer: '40代・のんびり派',
      hint: '「もはや公園」と呼ばれるほど庭を広げると、遊びを見守る腰掛けも自然と備わる。'
    },

    // ================= 5. 特別・珍間取り (11) =================
    {
      id: 'furn_sento_tub',
      name: '銭湯の大浴槽',
      category: '特別・珍間取り',
      rarity: 'special',
      floorId: 'floor_bath',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_sento_tub' }
      ],
      aliases: [],
      flavor: '足を伸ばすどころか平泳ぎできそうな広さだよ！いやあ極楽極楽……まあ、水道代だけはあんまり見ないことにしてるけどね。',
      reviewer: '40代・湯道家',
      hint: '浴室を4マス以上のセレブ規模、あるいは8マス以上の大浴場へ広げると主役がどんと構える。'
    },
    {
      id: 'furn_kerorin',
      name: '銭湯のケロリン桶タワー',
      category: '特別・珍間取り',
      rarity: 'special',
      floorId: 'floor_bath',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_kerorin' }
      ],
      aliases: [],
      flavor: '入居したら最初から洗い場に桶がタワーになってて笑っちゃったよ！友達を呼ぶとみんなテンション上がるんだよね。',
      reviewer: '30代・サウナー',
      hint: '浴室を8マス以上つなげて「もはや銭湯」を実現すると、洗い場の名物が積み上がる。'
    },
    {
      id: 'furn_rug_foyer',
      name: '大ホワイエの豪奢絨毯',
      category: '特別・珍間取り',
      rarity: 'special',
      floorId: 'floor_corridor',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_rug_foyer' }
      ],
      aliases: [],
      flavor: '宅配のお兄さんが玄関で一瞬びっくりしてから、すごく丁寧に荷物を渡してくれるんですよ。なんだかちょっと照れちゃいますね。',
      reviewer: '50代・会社役員',
      hint: '玄関先に「大ホワイエ」を組み、上下左右を廊下に囲まれた中央マスができると足元が華やぐ。'
    },
    {
      id: 'furn_rug_red',
      name: 'ロングコリドーの赤絨毯',
      category: '特別・珍間取り',
      rarity: 'special',
      floorId: 'floor_corridor',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_rug_red' }
      ],
      aliases: [],
      flavor: '毎朝ここを歩くだけで、なんだか映画祭の主役みたいな気分になるんですよね。自然と背筋もピンと伸びちゃいます。',
      reviewer: '40代・VIP顧客',
      hint: '一直線に7マス以上つづく「ロングコリドー」を貫くと、歩きたくなる敷物が伸びていく。'
    },
    {
      id: 'furn_infinity_lamp',
      name: '無限回廊の道標ランプ',
      category: '特別・珍間取り',
      rarity: 'special',
      floorId: 'floor_corridor',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_infinity_lamp' }
      ],
      aliases: [],
      flavor: '夜中に水を飲みに出て廊下を2周しちゃったんだけどさ、青い灯りが幻想的で、ちょっとした探検気分だったよ！',
      reviewer: '20代・方向音痴',
      hint: '廊下をぐるりと繋げて「無限回廊」を組むと、迷い人を導く灯りがともる。'
    },
    {
      id: 'furn_coffin',
      name: '闇の棺桶',
      category: '特別・珍間取り',
      rarity: 'special',
      floorId: 'floor_darkness',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_coffin' }
      ],
      aliases: [],
      flavor: '日差しも来客も一切届かないんですよ。最初からこれが置いてあったのを見たとき、これ以上ない安眠の地だと確信しましたね。',
      reviewer: '夜勤勤務・自称ヨーロッパ出身',
      hint: 'ドアも窓も一切ない「封印されし闇」を造ると、部屋の真ん中に静かに鎮座する。'
    },
    {
      id: 'furn_candle',
      name: '銀の燭台',
      category: '特別・珍間取り',
      rarity: 'special',
      floorId: 'floor_darkness',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_candle' }
      ],
      aliases: [],
      flavor: '灯りを点けると一気に中世のお城みたいな雰囲気になるんです。夜ふかしの読書タイムにぴったりで気に入ってますよ。',
      reviewer: '夜型・アンティーク好き',
      hint: '「封印されし闇」を2マス以上の広さにすると、薄暗い片隅でゆらめく灯りが添えられる。'
    },
    {
      id: 'furn_fortress_console',
      name: '監視モニターデスク',
      category: '特別・珍間取り',
      rarity: 'special',
      floorId: 'floor_room',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_fortress_console' }
      ],
      aliases: [],
      flavor: '玄関前の野良猫の巡回ルートまでばっちり把握しましたよ！もはや町内の安全も僕が守ってる気分ですね。',
      reviewer: '30代・セキュリティ重視',
      hint: '窓をひとつも作らない「要塞化」を成し遂げると、洋室や8マス以上のLDKに司令席が現れる。'
    },
    {
      id: 'furn_supplies',
      name: '非常備蓄パック',
      category: '特別・珍間取り',
      rarity: 'special',
      floorId: 'floor_room',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_supplies' }
      ],
      aliases: [],
      flavor: '3週間は外に出なくてもへっちゃらな備えですよ！賞味期限が近づくと、友達を呼んで非常食パーティーを開くのが恒例なんです。',
      reviewer: '40代・防災マニア',
      hint: '窓をひとつも作らない「要塞化」を成し遂げると、LDKや4マス以上の洋室に籠城用の荷物が届く。'
    },
    {
      id: 'furn_ninja_gear',
      name: '忍具・鎖帷子セット',
      category: '特別・珍間取り',
      rarity: 'special',
      floorId: 'floor_washitsu',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_ninja_gear' }
      ],
      aliases: [],
      flavor: 'クローゼットの奥から出てきたときはびっくりしたけどさ、せっかくカッコいいからそのまま飾ってるんだよね。……いや、ほんとにただの会社員だよ？',
      reviewer: '自称・ただの会社員',
      hint: '収納の奥からしか入れない「隠し部屋」を仕込むと、表向きには置けない一式が並ぶ。'
    },
    {
      id: 'furn_safe_box',
      name: '秘密の重金庫',
      category: '特別・珍間取り',
      rarity: 'special',
      floorId: 'floor_closet',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_safe_box' }
      ],
      aliases: [],
      flavor: '最初から据え付けの立派な金庫があってさ！何を入れようかワクワク考えた結果、思い出の手紙と秘密のおやつが入ってるよ。',
      reviewer: '40代・ロマン派',
      hint: '「隠し部屋」や2マス以上の「秘密のトイレ」、あるいは8マス以上の巨大収納にこっそり据えられる。'
    },

    // ================= 6. 壁装飾 (7) =================
    {
      id: 'wall_art_1',
      name: '額縁の風景画',
      category: '壁装飾',
      rarity: 'common',
      floorId: 'floor_corridor',
      isWall: true,
      views: [
        { label: '壁掛け', spriteId: 'wall_art_1' }
      ],
      aliases: [],
      flavor: '廊下を通るたび山の絵が目に入るんだよね。ちょっと深呼吸したくなって、忙しい日もいい気分転換になるよ。',
      reviewer: '30代・旅行好き',
      hint: '廊下や洋室の北側に窓のない壁を残しておくと、ふと視線を和ませる飾りが掛かる。'
    },
    {
      id: 'wall_art_2',
      name: '額縁の抽象画',
      category: '壁装飾',
      rarity: 'common',
      floorId: 'floor_corridor',
      isWall: true,
      views: [
        { label: '壁掛け', spriteId: 'wall_art_2' }
      ],
      aliases: [],
      flavor: '入居したときから飾ってあった絵なんだけどさ、来客に『センスいいですね！』って褒められるから、最近はドヤ顔でうなずいてるよ。',
      reviewer: '20代・デザイン系',
      hint: '廊下の北側に窓のない壁をいくつか残しておくと、モダンな一枚が飾られることがある。'
    },
    {
      id: 'wall_clock',
      name: '丸型ウォールクロック',
      category: '壁装飾',
      rarity: 'common',
      floorId: 'floor_ldk',
      isWall: true,
      views: [
        { label: '壁掛け', spriteId: 'wall_clock' }
      ],
      aliases: [],
      flavor: 'スマホがあるのに、朝の支度中だけは結局これ見上げて『あと3分！』ってバタバタしてるんだよね。でも見やすくて大助かり！',
      reviewer: '20代・通勤組',
      hint: 'LDKの北側に窓のない壁を広めに残しておくと、暮らしのリズムを刻む小物が掛かる。'
    },
    {
      id: 'wall_shower',
      name: '浴室シャワー＆鏡',
      category: '壁装飾',
      rarity: 'common',
      floorId: 'floor_bath',
      isWall: true,
      views: [
        { label: '壁掛け', spriteId: 'wall_shower' }
      ],
      aliases: [],
      flavor: '水圧がちょうどよくて鏡もピカピカなんだよね！気持ちよすぎて、つい鼻歌がもう1曲増えちゃうよ。',
      reviewer: '30代・お風呂タイム派',
      hint: '2マス以上の独立浴室で北側に窓やドアのない壁を広く残しておくと、洗い場に取り付けられる。'
    },
    {
      id: 'wall_kakejiku',
      name: '和の掛け軸',
      category: '壁装飾',
      rarity: 'common',
      floorId: 'floor_washitsu',
      isWall: true,
      views: [
        { label: '壁掛け', spriteId: 'wall_kakejiku' }
      ],
      aliases: [],
      flavor: 'なんて書いてあるのか実はまだ読めてないんだけどさ、眺めてるだけで背筋がしゃんとするから気に入ってるんだよね。',
      reviewer: '40代・和室好き',
      hint: '和室の北側に窓のない壁があると、部屋を引き締める縦長の一幅が掛かる。'
    },
    {
      id: 'wall_scroll_ninja',
      name: '忍術秘伝の巻物',
      category: '壁装飾',
      rarity: 'special',
      floorId: 'floor_washitsu',
      isWall: true,
      views: [
        { label: '壁掛け', spriteId: 'wall_scroll_ninja' }
      ],
      aliases: [],
      flavor: '秘伝の奥義かと思ってドキドキしながら開いたら、『まずは早寝早起き』って書いてあって笑っちゃったよ。いや、大事だけどさ！',
      reviewer: '秘密の部屋の住人',
      hint: '「隠し部屋」や「秘密のトイレ」で北側に窓のない壁を残すと、知る人ぞ知る一幅が掲げられる。'
    },
    {
      id: 'wall_fuji',
      name: '銭湯の富士山ペンキ絵',
      category: '壁装飾',
      rarity: 'special',
      floorId: 'floor_bath',
      isWall: true,
      views: [
        { label: '壁掛け', spriteId: 'wall_fuji' }
      ],
      aliases: ['furn_fuji'],
      flavor: '遊びに来た友達がみんな、まず風呂場へ直行するんだよね！『今日もいい湯だった』って帰っていくから、うちが銭湯みたいになってきたよ。',
      reviewer: '30代・風呂好き',
      hint: '浴室を8マス以上つなげて「もはや銭湯」を実現すると、横に2マス並んだ北の壁一面が壮観に染まる。'
    },

    // =========================================================================
    //  6. A-3 DX限定 新部屋・特注コンボ家具（No.66〜No.78）
    // =========================================================================
    {
      id: 'furn_stream_desk',
      name: '配信スタジオデスク',
      category: 'リビング・洋室',
      rarity: 'uncommon',
      floorId: 'floor_studio',
      isWall: false,
      views: [
        { label: '北壁', spriteId: 'furn_stream_desk' },
        { label: '東壁', spriteId: 'furn_stream_desk_east' },
        { label: '南壁', spriteId: 'furn_stream_desk_south' },
        { label: '西壁', spriteId: 'furn_stream_desk_west' }
      ],
      aliases: [],
      flavor: 'モニター二枚並べてもまだ飲み物置けるの、ほんと助かる！配線もすっきり隠せるし、気づいたら朝の五時までゲームと配信ぶっ続けでやっちゃってたよ。',
      reviewer: '20代・夜型ストリーマー',
      hint: '防音仕様の書斎を間取りに組み込むと、作業と収録の要として部屋の特等席に据えられる。'
    },
    {
      id: 'furn_gear_rack',
      name: '音響機材ラック',
      category: 'リビング・洋室',
      rarity: 'uncommon',
      floorId: 'floor_studio',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_gear_rack' }
      ],
      aliases: [],
      flavor: 'ミキサーやらオーディオインターフェースやら、ついつい増えちゃう機材の定位置ができて大満足！ランプがぴかぴか光ってるだけで、なんだかプロっぽくてテンション上がるんだよね。',
      reviewer: '30代・音響マニア',
      hint: '防音仕様の書斎に複数のマスがあると、メインの作業場のとなりへ録音用の設備一式が並ぶ。'
    },
    {
      id: 'furn_hammock_chair',
      name: 'ハンモックチェア',
      category: 'リビング・洋室',
      rarity: 'uncommon',
      floorId: 'floor_sunroom',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_hammock_chair' }
      ],
      aliases: [],
      flavor: 'ポカポカの昼下がりにゆらゆら揺られてたら、五分と持たずに夢の中だよ。ここで読む漫画と昼寝が休日のいちばんの贅沢かもしれないなぁ。',
      reviewer: '30代・休日ゴロゴロ派',
      hint: 'ガラス張りのサンルームを建てると、日差しを浴びてくつろげる特等席がまず最初に用意される。'
    },
    {
      id: 'furn_cat_tower',
      name: 'ネコの爪とぎタワー',
      category: 'リビング・洋室',
      rarity: 'uncommon',
      floorId: 'floor_sunroom',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_cat_tower' }
      ],
      aliases: [],
      flavor: '組み立てた瞬間からうちの子が最上階を占領しちゃってさ！お日さま浴びながらてっぺんで丸くなってる姿を見られるだけで、家賃元取った気分だよニャ。',
      reviewer: '20代・ネコ飼い',
      hint: 'サンルームを二マス以上の広さでつくると、ひなたぼっこ好きな愛猫の遊び場まで置けるようになる。'
    },
    {
      id: 'furn_sunroom_planter',
      name: '観葉プランター棚',
      category: 'リビング・洋室',
      rarity: 'uncommon',
      floorId: 'floor_sunroom',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_sunroom_planter' }
      ],
      aliases: [],
      flavor: '日当たり抜群のおかげで、ズボラな私が育ててるハーブまでわさわさ元気に育ってる！朝起きてここへ水やりしに来るのが、毎日のちょっとした楽しみなんだ。',
      reviewer: '40代・家庭菜園ビギナー',
      hint: 'サンルームにさらにゆとりがあると、お日さまが大好きな鉢植えたちがずらりと並んでくれる。'
    },
    {
      id: 'furn_drum_washer',
      name: 'ドラム式洗濯乾燥機',
      category: '水回り・玄関・収納',
      rarity: 'uncommon',
      floorId: 'floor_laundry',
      isWall: false,
      views: [
        { label: '北壁', spriteId: 'furn_drum_washer' },
        { label: '東壁', spriteId: 'furn_drum_washer_east' },
        { label: '南壁', spriteId: 'furn_drum_washer_south' },
        { label: '西壁', spriteId: 'furn_drum_washer_west' }
      ],
      aliases: [],
      flavor: '洗剤も勝手に計ってくれるし乾燥まで一発だから、前の家より洗濯にかける時間が体感三分の一だよ！夜にスイッチ押して朝ふわふわなの、ほんと革命だね。',
      reviewer: '30代・共働きパパ',
      hint: 'ランドリー専用の家事室を採用すると、頼もしい主力家電が迷わずここに構えられる。'
    },
    {
      id: 'furn_ironing_set',
      name: 'スチームアイロン台',
      category: '水回り・玄関・収納',
      rarity: 'uncommon',
      floorId: 'floor_laundry',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_ironing_set' }
      ],
      aliases: [],
      flavor: '乾いたシャツを別の部屋へ運ばずその場でピシッと伸ばせる動線、想像以上に快適！おかげでアイロン掛けのハードルがぐんと下がって助かってるよ。',
      reviewer: '40代・きれい好き',
      hint: '家事室に洗う場所以外のスペースがあると、たたんだりシワを伸ばしたりする仕上げスペースも隣にそろう。'
    },
    {
      id: 'furn_classic_car',
      name: '愛車のクラシックカー',
      category: '水回り・玄関・収納',
      rarity: 'special',
      floorId: 'floor_garage',
      isWall: false,
      views: [
        { label: '横向き', spriteId: 'furn_classic_car' },
        { label: '縦向き', spriteId: 'furn_classic_car_v' }
      ],
      aliases: [],
      flavor: '部屋の中からガラス越しにこのボディライン眺められるだけで、もうご飯三杯いけるね！雨の日の心配もいらないし、週末のドライブが楽しみで仕方ないよ！',
      reviewer: '40代・旧車オーナー',
      hint: '土間ガレージを縦横二マス以上のまとまった広さで確保すると、とっておきの一台がどっしり収まる。'
    },
    {
      id: 'furn_tool_bench',
      name: 'ガレージ工具ワークベンチ',
      category: '水回り・玄関・収納',
      rarity: 'uncommon',
      floorId: 'floor_garage',
      isWall: false,
      views: [
        { label: '北壁', spriteId: 'furn_tool_bench' },
        { label: '東壁', spriteId: 'furn_tool_bench_east' },
        { label: '南壁', spriteId: 'furn_tool_bench_south' },
        { label: '西壁', spriteId: 'furn_tool_bench_west' }
      ],
      aliases: [],
      flavor: 'スパナもドライバーも壁掛けできれいに並べておけるから、ちょっとした部品いじりが楽しくてさ。DIY好きにはたまらない基地って感じだよ！',
      reviewer: '30代・日曜大工好き',
      hint: '土間ガレージのスペースに空きがあると、メンテナンスや日曜大工がはかどる作業机が備わる。'
    },
    {
      id: 'furn_road_bike',
      name: '愛用のロードバイク',
      category: '水回り・玄関・収納',
      rarity: 'uncommon',
      floorId: 'floor_garage',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_road_bike' }
      ],
      aliases: [],
      flavor: '屋外置きだと盗難やサビが怖かったんだけど、この屋内ガレージなら安心だし見た目も最高！休日の朝にここからサッと漕ぎ出す瞬間がいちばん気持ちいいんだよね。',
      reviewer: '20代・週末サイクリスト',
      hint: '土間ガレージの広さにさらに余裕があると、休日のツーリングに使われる二輪車まで停めておける。'
    },
    {
      id: 'furn_gold_cat',
      name: '黄金の招き猫',
      category: '特別・珍間取り',
      rarity: 'rare',
      floorId: 'floor_sunroom',
      isWall: false,
      views: [
        { label: '正面', spriteId: 'furn_gold_cat' }
      ],
      aliases: [],
      flavor: '内見のとき眩しすぎて二度見しちゃったんだけど、うちの子が毎朝この子の前でお手してるのが可愛くてさ！おかげで最近なんか運気もバッチリな気がするニャ。',
      reviewer: '30代・愛猫家',
      hint: 'サンルームを建てたうえで、室内や廊下をぐるりと一周できる回遊ループの動線をつくると姿を見せる。'
    },
    {
      id: 'wall_acoustic_panel',
      name: '防音吸音ウォールパネル',
      category: '壁装飾',
      rarity: 'uncommon',
      floorId: 'floor_studio',
      isWall: true,
      views: [
        { label: '壁掛け', spriteId: 'wall_acoustic_panel' }
      ],
      aliases: [],
      flavor: '声の反響がピタッと収まるから、マイク乗りが段違いにクリアになってびっくりしたよ！見た目もスタジオ感バッチリで、カメラに映り込むたびちょっと誇らしいんだ。',
      reviewer: '20代・実況プレイヤー',
      hint: '防音書斎の北側に窓のない壁面を用意しておくと、音漏れや反響を抑える専用の壁仕上げが施される。'
    },
    {
      id: 'wall_gold_trophy',
      name: '登録者100万人金の盾',
      category: '壁装飾',
      rarity: 'rare',
      floorId: 'floor_studio',
      isWall: true,
      views: [
        { label: '壁掛け', spriteId: 'wall_gold_trophy' }
      ],
      aliases: [],
      flavor: 'こんなすごいお部屋に住んでたら気合が入っちゃってさ、夢だった大台をついに突破したよ！記念のプレートが壁でキラキラ輝いてるの見ると、ちょっと泣きそうになるね。',
      reviewer: '20代・トップ配信者',
      hint: '防音書斎を設けたうえで建物全体の外壁から窓をひとつも無くしてしまうと、偉業をたたえる輝きが北の壁に飾られる。'
    }
  ];

  // 高速ルックアップマップの構築（正規ID・全ビューspriteId・aliasから正規IDを引ける）
  const BY_ID = new Map();
  const NORMALIZE_MAP = new Map();

  for (const item of ITEMS) {
    BY_ID.set(item.id, item);
    NORMALIZE_MAP.set(item.id, item.id);
    if (Array.isArray(item.views)) {
      for (const v of item.views) {
        if (v && v.spriteId) NORMALIZE_MAP.set(v.spriteId, item.id);
      }
    }
    if (Array.isArray(item.aliases)) {
      for (const a of item.aliases) {
        if (a) NORMALIZE_MAP.set(a, item.id);
      }
    }
  }

  function getById(id) {
    if (!id) return null;
    const norm = normalizeAssetId(id);
    return norm ? (BY_ID.get(norm) || null) : null;
  }

  function normalizeAssetId(rawId) {
    if (!rawId || typeof rawId !== 'string') return null;
    if (NORMALIZE_MAP.has(rawId)) return NORMALIZE_MAP.get(rawId);
    const suffixes = [
      '_v_west', '_v_east', '_center_v', '_center',
      '_north', '_east', '_south', '_west',
      '_lr', '_tb', '_v'
    ];
    for (const suf of suffixes) {
      if (rawId.endsWith(suf)) {
        const stripped = rawId.slice(0, -suf.length);
        if (NORMALIZE_MAP.has(stripped)) return NORMALIZE_MAP.get(stripped);
      }
    }
    return null;
  }

  global.FurnitureCatalog = {
    ITEMS,
    CATEGORIES,
    RARITY_META,
    WALL_DECO_TYPE_TO_ID,
    getById,
    normalizeAssetId
  };
})(window);
