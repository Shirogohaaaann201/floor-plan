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
      flavor: 'まな板の上のにんじんと2口コンロの赤い両手鍋が料理意欲をそそる標準キッチン。',
      hint: 'LDKを配置すると壁沿いに設置（アイランド不在時）'
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
      flavor: '家族や来客とおしゃべりしながら料理ができる憧れのオープンカウンター。',
      hint: 'LDKが9マス以上（幅3×縦3以上）で部屋中央に空きがあると出現'
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
      flavor: '製氷タッチパネル付きの白い大型冷蔵庫。冷たい飲み物がいつでもスタンバイ。',
      hint: '6マス以上のLDKを造るとキッチン近くに設置'
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
      flavor: '温もりある木目テーブルに赤いティーポット。部屋の形状に合わせて椅子向きが変わる。',
      hint: 'LDK（3〜5マス、またはソファ無しの標準LDK）で出現'
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
      flavor: '2客のコーヒーカップと小皿が並ぶ、おうちカフェ気分のコンパクト丸テーブル。',
      hint: 'おしゃれ系／陽だまり／DINKSの依頼や一部のLDKで出現'
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
      flavor: 'ふかふかステッチが自慢のローズレッドソファ。広いリビングではTV正面に向くことも。',
      hint: '6マス以上のLDKを造るとくつろぎ空間に設置'
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
      flavor: 'テレビと対面ソファの足元をふんわり彩る、やさしい生成り色の大判織りラグ。',
      hint: '8マス以上（幅3×縦3以上）の広いLDKで対面ソファが組まれると敷かれる'
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
      flavor: '薄型ワイド液晶と観葉小物付きのAVボード。休日の映画鑑賞タイムの主役。',
      hint: '8マス以上のLDKを造ると壁際に設置（通常客）'
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
      flavor: 'さわやかなブルーの掛け布団と白シーツ。どの壁に沿ってもぴったり収まる定番寝具。',
      hint: '洋室（1〜5マス）や個室に広く登場'
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
      flavor: '枕が2つ並んだゆったりホテルライク仕様。主寝室らしい風格たっぷり。',
      hint: '6マス以上の広い洋室（主寝室）を造ると出現'
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
      flavor: 'パステルフレームに星模様の黄色いお布団。楽しい夢が見られそうな子ども部屋ベッド。',
      hint: 'ファミリー／大家族の2室目の洋室や一部の洋室で出現'
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
      flavor: 'モニターにキーボード、温かいマグカップまで揃った機能的なワークデスク。',
      hint: '3マス以上の洋室（寝室・子ども部屋など）で壁際に設置'
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
      flavor: 'デュアルモニターとRGBエッジライト、黒赤ゲーミングチェアで集中力MAX。',
      hint: '在宅ワーカー／趣味推しの洋室や一部のサブ洋室で出現'
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
      flavor: '緑シェードのバンカーズランプが照らす濃木目の重厚机。原稿と羽ペンが主を待つ。',
      hint: 'ミステリー／豪邸／VIP／シニア等の洋室や書斎テーマで出現'
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
      flavor: '色とりどりの背表紙がぎっしり並ぶ3段書棚。読書家にも収納派にも嬉しい一棹。',
      hint: '書斎テーマや6マス以上の広い洋室で設置'
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
      flavor: '積み木とぬいぐるみ、赤いおもちゃの車があふれる賑やかな木製ボックス。',
      hint: '子ども部屋テーマの洋室（2マス以上）を造ると出現'
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
      flavor: '白い急須と緑の湯呑みが2つ。井草の香りただよう客間の中心アイテム。',
      hint: '和室（客間パターン）を配置すると中央に出現'
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
      flavor: '真っ赤な掛け布団に山盛りみかんのお盆。一度入ったらもう抜け出せない幸福装置。',
      hint: '和室（こたつ間パターン）を配置すると中央に出現'
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
      flavor: 'ふっくら敷布団に赤い掛け布団。2枚並べて川の字で眠れば和室の魅力も倍増。',
      hint: '和室（寝間パターン）や隠し和室・横長/縦長和室で出現'
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
      flavor: '黒鉄のＬ字金具と丸錠前が渋く光る時代箪笥。側面から見ても格調高い。',
      hint: '4マス以上の和室（こたつ間・寝間・広い客間）の壁際に出現'
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
      flavor: '濃ウォルナットの違い棚に端正な松盆栽と青磁の花瓶。部屋の品格を静かに底上げ。',
      hint: '和室（客間4マス〜・広いこたつ間・広い寝間）の壁際に出現'
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
      flavor: '黒檀塗りに金の装飾と仏花・蝋燭が厳かに灯る本格お仏壇。ご先祖様もきっと安心。',
      hint: '和室の掛け軸のない北壁（窓なし）に一定条件で出現'
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
      flavor: '緋毛氈に桧炉縁の囲炉裏、鉄釜から立ち上る湯気と藍座布団の静謐な茶空間。',
      hint: '田の字コンボ「古き良き日本家屋」を成立させると和室の1室が茶室に変化'
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
      flavor: 'ふかふかの青いお湯に湯気ゆらめく標準浴槽。一日の疲れをすっきり洗い流す。',
      hint: '浴室（1〜7マス）を配置すると自動で設置'
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
      flavor: '木のぬくもり香る桧の洗い場椅子と、おなじみ黄色い湯桶の名コンビ。',
      hint: '2マス以上の通常浴室でドア前を避けて出現'
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
      flavor: '浴槽・洗面・トイレがひとつになった省スペースの要。家賃控えめ物件の強い味方。',
      hint: 'UB（ユニットバス）ピースを配置すると出現'
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
      flavor: 'ロールペーパー付きの清潔な水洗便器。4方向どの壁向きでも違和感ゼロ。',
      hint: 'トイレを配置すると必ず設置'
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
      flavor: '朝の身支度に欠かせないミラーキャビネットとコップ付きの清潔な洗面化粧台。',
      hint: '洗面所を配置すると壁際に設置'
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
      flavor: '透け蓋から回る洗濯槽が見える最新式。ドア動線を塞がない安全な隅へ設置される。',
      hint: '2マス以上の洗面所でドアに塞がれない置き場があると出現'
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
      flavor: '浴室からの湯上がり足をやさしく受け止める、ふかふかミントグリーンの珪藻風マット。',
      hint: '2マス以上の洗面所で足元に余裕があると敷かれる'
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
      flavor: '玄関の上がり框を塞がずに壁ピタで収まる木製シューズボックス。小さな花瓶付き。',
      hint: '玄関があると空いた側壁に沿って自動設置'
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
      flavor: '御影石タイルの土間にきちんと揃えられた革靴。生活感と礼儀正しさが漂う。',
      hint: '玄関があり家具付き表示にすると土間に出現'
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
      flavor: '赤・青・黄色の3着のシャツが仲良く掛かるクローゼット用ハンガーラック。',
      hint: '収納（または1〜3マスの収納スペース）に設置'
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
      flavor: '段ボールや衣装ケースもまるごと受け止める無骨で頼もしい収納シェルフ。',
      hint: '2マス以上の収納（または「収納が本体」コンボ）で出現'
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
      flavor: '荷造り木箱に運搬台車、さらに謎の金の壺まで紛れ込む大倉庫の象徴。',
      hint: '8マス以上の巨大収納（「収納が本体」コンボ等）で出現'
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
      flavor: 'テラコッタの鉢に青々とした葉を広げるインテリアグリーン。どの部屋にも映える。',
      hint: '洋室・大ホワイエ廊下・カフェLDKなど広いスペースに出現'
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
      flavor: '赤・黄・紫のかわいい小花が芝生にリズムを添えるガーデニングの基本。',
      hint: '建物の余白に「庭」ができると彩りとして咲く'
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
      flavor: '木漏れ日が心地よい庭のシンボル広葉樹。季節の移ろいをそっと伝えてくれる。',
      hint: '2マス以上の庭ができると木陰をつくるように出現'
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
      flavor: '苔むした小石を添えた風情ある飛び石。歩くたびに和の情緒が深まる。',
      hint: '和室に隣接する和風庭園や坪庭で出現'
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
      flavor: '水鏡のつくばいに寄り添う石灯籠。日が暮れると穏やかな風情を醸し出す。',
      hint: '4マス以上の庭や和風庭園を造ると出現'
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
      flavor: '庭石に囲まれた青い池を朱色の錦鯉が優雅に泳ぐ、贅沢な大庭園の主役。',
      hint: '8マス以上の大きな庭（広大庭園等）で出現'
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
      flavor: '赤白パラソルの下で優雅にティータイムを楽しめるイングリッシュガーデンのテラス席。',
      hint: '和室に面しない8マス以上の洋風広大庭園で出現'
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
      flavor: '白いトレリスに赤とピンクの薔薇が咲き誇る、絵本の1ページのような庭アーチ。',
      hint: '和室に面しない4マス以上の洋風庭園（イングリッシュガーデン）で出現'
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
      flavor: '青い小鳥がちょこんと羽を休めにやって来る石造りのバードバス。',
      hint: '和室に面しない4マス以上の洋風庭園で出現'
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
      flavor: '赤いバケツと青いスコップが置きっぱなしになった、子どもの歓声が聞こえそうな砂場。',
      hint: '珍コンボ「もはや公園」（庭12マス以上＆延床面積以上）で出現'
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
      flavor: '黄色のはしごとつるつるの赤いスロープ。もはや自宅敷地というより児童公園。',
      hint: '珍コンボ「もはや公園」（庭12マス以上＆延床面積以上）で出現'
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
      flavor: '砂場やすべり台を見守りながら一休みできる公園仕様の長椅子。',
      hint: '珍コンボ「もはや公園」で出現'
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
      flavor: 'ジェット泡と湯気がもくもく立ち昇る2×2マスの広大湯船。家の風呂を越えた迫力。',
      hint: '珍コンボ「もはや銭湯」（浴室8マス以上）を達成すると出現'
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
      flavor: '洗い場用の青い風呂椅子と、おなじみ黄色い桶2つが並んだ銭湯必須アイテム。',
      hint: '珍コンボ「もはや銭湯」（浴室8マス以上）を達成すると出現'
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
      flavor: '黄金の縁取りと房飾りが気品あふれる宮殿級の大広間カーペット。',
      hint: '王道コンボ「大ホワイエ」（廊下2×2塊を含む広大廊下）で出現'
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
      flavor: '一直線の長い廊下を貫く金縁のレッドカーペット。思わず背筋が伸びる。',
      hint: '「ロングコリドー」（廊下7〜8マス以上の直線廊下）で出現'
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
      flavor: 'ループする廊下の四隅でぽわっと幻想的に揺らめく青いランタン。',
      hint: '珍コンボ「無限回廊」（廊下でループ動線を組む）で出現'
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
      flavor: '金十字が輝く重厚な棺。窓も入口もない密室にだけひっそりと現れる。',
      hint: '珍コンボ「封印されし闇」（到達不能かつ窓なし部屋）で出現'
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
      flavor: '暗い密室の片隅を妖しく揺れる炎で照らす3本立ての銀燭台。',
      hint: '珍コンボ「封印されし闇」で2マス以上の密室があると出現'
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
      flavor: '緑・シアン・赤の計器が光り続ける、篭城・防犯仕様のマルチ監視コンソール。',
      hint: '珍コンボ「要塞化」（窓ゼロ＆赤壁多数の鉄壁間取り）で出現'
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
      flavor: '非常用飲料水のポリタンクと食糧箱のセット。これがあれば何日でも籠もれる。',
      hint: '珍コンボ「要塞化」を成立させると室内に出現'
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
      flavor: '忍刀・手裏剣・巻物が赤い敷物に整然と並ぶ。表からは決して見えない秘密の一式。',
      hint: '珍コンボ「隠し部屋」（収納を通らないと行けない部屋）で出現'
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
      flavor: 'ダイヤルと頑丈なハンドルを備えた鋼鉄金庫。秘密の隠し部屋や大倉庫の隅に鎮座。',
      hint: '「隠し部屋」や「収納が本体」（大倉庫の確率出現）で出現'
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
      flavor: '青空と白い山並みを描いた木枠の小さな風景画。廊下や洋室の壁を品良く彩る。',
      hint: '廊下・洋室の窓も背高家具もない北壁に飾られる'
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
      flavor: 'モダンな赤×黄の幾何学アート。何気ない廊下をギャラリーに変える一枚。',
      hint: '廊下の窓も背高家具もない北壁に飾られる'
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
      flavor: '見やすい白い文字盤のシンプルな壁掛け時計。忙しい朝の強い味方。',
      hint: 'LDKの冷蔵庫や窓に塞がれていない北壁に飾られる'
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
      flavor: 'キラッと光る縦長ミラーとサーモ水栓・シャワーヘッド。通常浴室の必須壁面設備。',
      hint: '通常浴室（銭湯・UB以外）の北壁に自動で設置'
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
      flavor: '達筆な一筆と書印が心を鎮める和室の定番壁飾り。客人の目線を最初に迎える。',
      hint: '和室の窓のない北壁に飾られる'
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
      flavor: '「秘」「忍」の文字と手裏剣紋様が刻まれた極秘の掛け軸。知る人ぞ知る一幅。',
      hint: '珍コンボ「隠し部屋」内の窓なし北壁に飾られる'
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
      flavor: '真っ白な雪をいただく雄大な霊峰富士と朝日。お湯に浸かりながら見上げれば極楽気分。',
      hint: '珍コンボ「もはや銭湯」（浴室8マス以上）の2マス並び北壁に出現'
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
