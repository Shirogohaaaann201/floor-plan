'use strict';
/**
 * furniture_catalog.js
 * 家具・インテリア収集図鑑マスターカタログ & ID正規化モジュール (C-3)
 * - 全65種（向き差分を統合した正規ID・カテゴリ・レア度・90°回転ビュー・フレーバー・出現ヒント）
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
    clock: 'wall_clock'
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
      flavor: '赤い両手鍋を置いただけで料理上手になった気分。今のところ湯沸かし専用。',
      reviewer: '20代・一人暮らし',
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
      flavor: '友達を呼ぶたびに『お店みたい』と褒められる。なお普段はカップ麺ばかり。',
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
      flavor: 'でかくて頼もしいのに、開けると麦茶と冷凍うどんしか入っていない。',
      reviewer: '20代・会社員',
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
      flavor: 'ちゃんとここで食べるつもりが、いつの間にか郵便物とチラシの定位置になった。',
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
      flavor: '休日の朝にコーヒーを淹れるだけで、なぜか意識が3割ほど高くなる。',
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
      flavor: '2人掛けのはずなのに、だいたい1人が横になって全部使っている。',
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
      flavor: '座り心地がよすぎて、ソファを背もたれにして床に座る謎の現象が起きている。',
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
      flavor: 'つけておかないと部屋が静かすぎるので、ほぼ環境音として流している。',
      reviewer: '30代・在宅勤務',
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
      flavor: '朝のアラームを3回止めてからが本番。寝返りひとつで現実に戻る狭さがちょうどいい。',
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
      flavor: '1人で大の字になれる贅沢を噛みしめている。枕が2つある理由は聞かないでほしい。',
      reviewer: '30代・独身貴族',
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
      flavor: '星の模様が気に入ったのか、自分の部屋で寝る練習が3日で成功した。',
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
      flavor: '仕事用のつもりで整えたのに、気づけば動画サイトと通販しか開いていない。',
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
      flavor: '机が七色に光るせいで、深夜に目が覚めても昼間と錯覚してもう1戦してしまう。',
      reviewer: '20代・配信者志望',
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
      flavor: '緑のランプを点けると名作が書けそうな気がする。いまのところ3行で止まっている。',
      reviewer: '40代・小説家志望',
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
      flavor: '背表紙の色を揃えて並べたら満足してしまい、半分くらいまだ読んでいない。',
      reviewer: '30代・積読家',
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
      flavor: '片づけたはずの赤い車が、なぜか毎晩廊下のど真ん中で踏まれるのを待っている。',
      reviewer: '30代・パパ',
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
      flavor: '急須でお茶を淹れると、急に昭和のホームドラマみたいな会話が始まる。',
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
      flavor: 'ちょっと温まるだけのつもりが、気づいたらみかんの皮の山と朝を迎えていた。',
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
      flavor: '毎朝たたむ決意をして眠り、毎朝そのまま出かけている。',
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
      flavor: '引き出しを開けるたび木のいい匂いがする。下の段にはだいたい開かずの着物がある。',
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
      flavor: '水やりを始めたら妙に愛着が湧いて、休日はハサミを持ってじっと枝を眺めている。',
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
      flavor: '内見のときから妙に落ち着くと思ったら、ご先祖様が見守っていたらしい。',
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
      flavor: '鉄釜の湯気を眺めているだけで心が静まる。ただ、夏場はさすがにちょっと暑い。',
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
      flavor: '追い焚きボタンを押した瞬間から、きょうの嫌なことはだいたい水に流せる。',
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
      flavor: '黄色い桶の頑丈さがすごい。うっかり落としても床のほうが負けそうな音がする。',
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
      flavor: '風呂ついでに床ごと洗えるので、気づけば手放せなくなった。',
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
      flavor: '家の中でいちばんスマホの通知を静かに見られる、小さな書斎みたいな場所。',
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
      flavor: '朝の支度が風呂場と分かれただけで、生活レベルが2段階くらい上がった気がする。',
      reviewer: '20代・OL',
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
      flavor: '終了メロディが鳴ってから取り出すまで、なぜか毎回2時間ほど熟成させてしまう。',
      reviewer: '20代・ズボラ代表',
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
      flavor: '玄関を開けて一歩目がこれなのはどう考えてもおかしいが、雨の日は意外と助かる。',
      reviewer: '30代・珍物件マニア',
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
      flavor: '細いのに意外と入る。ただ、上の花瓶に鍵と印鑑を置きすぎて結局ごちゃつく。',
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
      flavor: '内見の日からずっと揃えて脱ぐようにしている。今のところ3週間続いている。',
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
      flavor: '服を色順に掛けた初日がピークだった。今はだいたい黒とグレーがぎっしり。',
      reviewer: '30代・アパレル勤務',
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
      flavor: '通販の段ボールを『とりあえず』と載せ続け、3段目が開かずのタイムカプセルに。',
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
      flavor: '自宅に台車がある暮らしは初めてだが、箱買いした水の移動が劇的にラクになった。',
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
      flavor: '1鉢置いただけで『ていねいな暮らし』っぽくなる。枯らさないことだけが今の使命。',
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
      flavor: '毎朝カーテンを開けるのが楽しみになった。ご近所さんとの世間話も少し増えた。',
      reviewer: '50代・主婦',
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
      flavor: '夏は涼しい木陰をつくってくれて最高。秋になると落ち葉との戦いが幕を開ける。',
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
      flavor: 'わざわざ石の上だけを歩いて玄関へ向かう癖がついた。外すと少し悔しい。',
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
      flavor: '夕方に見ると高級旅館に泊まっている錯覚が起きる。夕飯はふつうの生姜焼きだけど。',
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
      flavor: 'エサをやる時間がいちばんの癒やし。ただ、鯉のほうが私より立派な暮らしをしている。',
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
      flavor: '晴れた日にここで紅茶を飲むと優雅な気分。風が強い日はパラソルと格闘になる。',
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
      flavor: '朝のゴミ出しでもここをくぐると、ちょっとだけ物語の主人公みたいな気持ちになる。',
      reviewer: '30代・ガーデナー',
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
      flavor: '毎朝やって来る青い鳥を窓から見守っている。あちらもこちらを観察している気がする。',
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
      flavor: '近所の子どもたちが普通に遊びに来るようになった。もはやうちの庭という概念がない。',
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
      flavor: '内見時に『公園が近いんですか？』と聞いたら『敷地内です』と返されて二度見した。',
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
      flavor: '休日の昼下がりに座って缶コーヒーを飲んでいると、通りすがりの犬によく懐かれる。',
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
      flavor: '足を伸ばすどころか平泳ぎできそう。ただし毎月の水道代だけは直視しないようにしている。',
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
      flavor: 'なぜ自宅に桶が何個も積んであるのか謎だが、並んでいると妙にテンションが上がる。',
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
      flavor: '宅配便の配達員さんが玄関で一瞬たじろいでから、やたら丁寧に荷物を渡してくれる。',
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
      flavor: 'トイレへ行くだけなのに授賞式みたいな歩幅になる。忘れ物をして戻るときが一番つらい。',
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
      flavor: '夜中に水を飲みに出て廊下を2周してしまったが、青い灯りだけは妙にきれいだった。',
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
      flavor: '日差しも来客も一切届かない。これ以上ないほど安眠できる。',
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
      flavor: 'ブレーカーが落ちても雰囲気だけは最高。電気代は安いがロウの減りだけが早い。',
      reviewer: '夜型・アンティーク収集家',
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
      flavor: '玄関前の野良猫の巡回ルートまで把握した。防犯意識が宇宙レベルまで高まっている。',
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
      flavor: '3週間は外に出ずに暮らせる計算。賞味期限が近づくと非常食パーティーが開かれる。',
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
      flavor: 'クローゼットの奥で見つけて以来、なんとなく誰にも言えないまま定位置にしている。',
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
      flavor: '立派すぎて何を入れるか迷った末、今はへそくりと昔の日記と予備の乾電池が入っている。',
      reviewer: '40代・用心深い性格',
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
      flavor: '廊下を通るたび山の絵が目に入る。出張に行けない月もこれを見て少し旅した気分になる。',
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
      flavor: '何を描いた絵なのかさっぱり分からないが、来客には『いいセンスですね』と褒められる。',
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
      flavor: 'スマホがあるのに、朝の支度中だけは結局これを見上げて3分ごとに焦っている。',
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
      flavor: '湯気で曇る前の鏡に映る自分を見て、毎晩『明日こそ早く寝よう』と誓っている。',
      reviewer: '30代・夜ふかし派',
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
      flavor: 'なんて書いてあるのか実は読めていないが、姿勢を正したくなる説得力だけはある。',
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
      flavor: '読めば読むほど『まずは早寝早起き』みたいな堅実なことばかり書いてあった。',
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
      flavor: '遊びに来た友人が全員まず風呂場へ直行する。家なのか銭湯なのかもう分からない。',
      reviewer: '30代・風呂好き',
      hint: '浴室を8マス以上つなげて「もはや銭湯」を実現すると、横に2マス並んだ北の壁一面が壮観に染まる。'
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
