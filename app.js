(() => {
  'use strict';

  const PARTITION = 0x40000;
  const GENERAL_SIZE = 0xF628;
  const STORAGE_START = 0xF700;
  const STORAGE_SIZE = 0x12310;
  const PARTY_COUNT_OFFSET = 0x94;
  const PARTY_START = 0x98;
  const PARTY_SIZE = 236;
  const STORED_SIZE = 136;
  const BOX_COUNT = 18;
  const BOX_SLOTS = 30;
  const BOX_STRIDE = 0x1000;
  const MIN_RAW_SIZE = PARTITION + STORAGE_START + STORAGE_SIZE;

  const BLOCK_ORDERS = [
    'ABCD','ABDC','ACBD','ACDB','ADBC','ADCB',
    'BACD','BADC','BCAD','BCDA','BDAC','BDCA',
    'CABD','CADB','CBAD','CBDA','CDAB','CDBA',
    'DABC','DACB','DBAC','DBCA','DCAB','DCBA'
  ];

  const NATURES = [
    '勤奮 Hardy','怕寂寞 Lonely','勇敢 Brave','固執 Adamant','頑皮 Naughty',
    '大膽 Bold','坦率 Docile','悠閒 Relaxed','淘氣 Impish','樂天 Lax',
    '膽小 Timid','急躁 Hasty','認真 Serious','爽朗 Jolly','天真 Naive',
    '內斂 Modest','慢吞吞 Mild','冷靜 Quiet','害羞 Bashful','馬虎 Rash',
    '溫和 Calm','溫順 Gentle','自大 Sassy','慎重 Careful','浮躁 Quirky'
  ];

  const STAT_KEYS = [
    ['hp','HP'], ['atk','攻擊'], ['def','防禦'], ['spa','特攻'], ['spd','特防'], ['spe','速度']
  ];

  // Gen IV uses a proprietary 16-bit character table. This covers the
  // Japanese and Western characters that can normally appear in nicknames.
  const G4_HIRAGANA = 'ぁあぃいぅうぇえぉおかがきぎくぐけげこござざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろわをん';
  const G4_KATAKANA = 'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロワヲン';
  const G4_ACCENTED = 'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿŒœŞşªº';
  const G4_SYMBOLS = new Map([
    [0x00E1,'！'],[0x00E2,'？'],[0x00E3,'、'],[0x00E4,'。'],[0x00E5,'…'],[0x00E6,'・'],[0x00E7,'／'],[0x00E8,'「'],[0x00E9,'」'],[0x00EA,'『'],[0x00EB,'』'],[0x00EC,'（'],[0x00ED,'）'],[0x00EE,'♂'],[0x00EF,'♀'],
    [0x00F0,'＋'],[0x00F1,'ー'],[0x00F2,'×'],[0x00F3,'÷'],[0x00F4,'＝'],[0x00F5,'～'],[0x00F6,'：'],[0x00F7,'；'],[0x00F8,'．'],[0x00F9,'，'],[0x00FA,'♠'],[0x00FB,'♣'],[0x00FC,'♥'],[0x00FD,'♦'],[0x00FE,'★'],[0x00FF,'◎'],
    [0x0100,'○'],[0x0101,'□'],[0x0102,'△'],[0x0103,'◇'],[0x0104,'＠'],[0x0105,'♪'],[0x0106,'％'],[0x0107,'☀'],[0x0108,'☁'],[0x0109,'☂'],[0x010A,'☃'],[0x0112,'円'],[0x011B,'←'],[0x011C,'↑'],[0x011D,'↓'],[0x011E,'→'],[0x011F,'►'],[0x0120,'＆'],
    [0x01A9,'¡'],[0x01AA,'¿'],[0x01AB,'!'],[0x01AC,'?'],[0x01AD,','],[0x01AE,'.'],[0x01AF,'…'],
    [0x01B0,'･'],[0x01B1,'/'],[0x01B2,'‘'],[0x01B3,"'"],[0x01B4,'“'],[0x01B5,'”'],[0x01B6,'„'],[0x01B7,'«'],[0x01B8,'»'],[0x01B9,'('],[0x01BA,')'],[0x01BB,'♂'],[0x01BC,'♀'],[0x01BD,'+'],[0x01BE,'-'],[0x01BF,'*'],
    [0x01C0,'#'],[0x01C1,'='],[0x01C2,'&'],[0x01C3,'~'],[0x01C4,':'],[0x01C5,';'],[0x01C6,'♠'],[0x01C7,'♣'],[0x01C8,'♥'],[0x01C9,'♦'],[0x01CA,'★'],[0x01CB,'◎'],[0x01CC,'○'],[0x01CD,'□'],[0x01CE,'△'],[0x01CF,'◇'],
    [0x01D0,'@'],[0x01D1,'♪'],[0x01D2,'%'],[0x01D3,'☀'],[0x01D4,'☁'],[0x01D5,'☂'],[0x01D6,'☃']
  ]);

  const NATURE_STAT_ORDER = ['atk', 'def', 'spe', 'spa', 'spd'];

  const fileInput = document.querySelector('#saveFile');
  const fileInfo = document.querySelector('#fileInfo');
  const status = document.querySelector('#status');
  const toolbar = document.querySelector('#toolbar');
  const results = document.querySelector('#results');
  const summary = document.querySelector('#summary');
  const searchInput = document.querySelector('#search');
  const locationFilter = document.querySelector('#locationFilter');
  const evFilter = document.querySelector('#evFilter');
  const template = document.querySelector('#cardTemplate');

  let allMons = [];
  const activeViews = new Map();
  const speciesCache = new Map();
  let fixedDexPromise = null;
  let dataCache = {};
  try { dataCache = JSON.parse(localStorage.getItem('hgssSpeciesDataV6') || '{}'); } catch (_) {}

  // V6.2 no longer depends on dozens of pokeapi.co requests.
  // It loads two static JSON files from a pinned GitHub revision, with jsDelivr
  // and PokeAPI as fallbacks, then caches only the species actually used.
  const STATIC_DATA_REV = '533df7e89f2975f5fa4a38e0ac731419a3f56b86';
  const STATIC_BASE_URLS = [
    `https://raw.githubusercontent.com/Yashwant2005/pokeplay/${STATIC_DATA_REV}/data/pokemon_base_stats_info2.json`,
    `https://cdn.jsdelivr.net/gh/Yashwant2005/pokeplay@${STATIC_DATA_REV}/data/pokemon_base_stats_info2.json`
  ];
  const STATIC_GROWTH_URLS = [
    `https://raw.githubusercontent.com/Yashwant2005/pokeplay/${STATIC_DATA_REV}/data/pokemon_data2.json`,
    `https://cdn.jsdelivr.net/gh/Yashwant2005/pokeplay@${STATIC_DATA_REV}/data/pokemon_data2.json`
  ];

  // Base stats that were changed after HGSS. Values below are the Gen IV values.
  // Keys: hp/atk/def/spa/spd/spe.
  const GEN4_STAT_OVERRIDES = {
    12:{spa:80}, 15:{atk:80}, 18:{spe:91}, 24:{atk:85}, 25:{def:30,spd:40}, 26:{spe:100},
    31:{atk:82}, 34:{atk:92}, 36:{spa:85}, 40:{spa:75}, 45:{spa:100}, 51:{atk:80},
    62:{atk:85}, 65:{spd:85}, 71:{spd:60}, 76:{atk:110}, 83:{atk:65}, 85:{spe:100},
    101:{spe:140}, 103:{spd:65}, 164:{spa:76}, 168:{spd:60}, 181:{def:75}, 182:{def:85},
    184:{spa:50}, 189:{spd:85}, 199:{spd:110}, 211:{def:75}, 219:{hp:50,spa:80},
    222:{hp:55,def:85,spd:85}, 226:{hp:65}, 267:{spa:90}, 277:{spa:50}, 279:{spa:85},
    284:{spa:80,spe:60}, 295:{spd:63}, 301:{spe:70}, 313:{def:55,spd:75}, 314:{def:55,spd:75},
    337:{hp:70}, 338:{hp:70}, 358:{hp:65,def:70,spd:80}, 398:{spd:50}, 407:{def:55},
    488:{def:120,spd:130}
  };

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    fileInfo.textContent = `${file.name} · ${formatBytes(file.size)}`;
    setStatus('正在解析存檔…');
    toolbar.classList.add('hidden');
    summary.classList.add('hidden');
    results.innerHTML = '';
    activeViews.clear();

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.length < MIN_RAW_SIZE) {
        throw new Error(`檔案太小（${formatBytes(bytes.length)}）。HGSS 原始存檔應至少包含約 512 KB 的資料。`);
      }

      allMons = parseHGSS(bytes);
      if (!allMons.length) {
        throw new Error('沒有找到可通過 Gen IV checksum 的 Pokémon。請確認這是《心金／魂銀》的 .sav / .dsv。');
      }

      allMons.forEach((mon, i) => { mon.uiKey = `${mon.locationType}:${mon.location}:${mon.pid}:${mon.checksum}:${i}`; });

      // V6：先準備此存檔需要的固定種族資料。靜態資料只需少量請求，
      // 不再對每隻 Pokémon 逐一向 PokeAPI 取資料。
      const uniqueSpecies = [...new Set(allMons.map(m => m.species))];
      setStatus('正在準備寶可夢固定資料（V6.1）…');
      const failedSpecies = await hydrateSpeciesData(uniqueSpecies);

      toolbar.classList.remove('hidden');
      summary.classList.remove('hidden');
      if (failedSpecies > 0) {
        setStatus(`完成：找到 ${allMons.length} 隻 Pokémon；${failedSpecies} 種盒內計算資料未能載入。隊伍資料仍可正常檢視。`, 'error');
      } else {
        setStatus(`完成：找到 ${allMons.length} 隻 Pokémon。`, 'ok');
      }
      renderSummary();
      render();
    } catch (err) {
      console.error(err);
      setStatus(err?.message || '解析失敗。', 'error');
      allMons = [];
    }
  });

  searchInput.addEventListener('input', render);
  evFilter.addEventListener('input', render);
  locationFilter.addEventListener('input', () => {
    renderSummary();
    render();
  });

  summary.addEventListener('click', (event) => {
    const button = event.target.closest('.stat[data-location]');
    if (!button) return;
    locationFilter.value = button.dataset.location;
    renderSummary();
    render();
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  function parseHGSS(bytes) {
    // Gen IV keeps two save partitions: one current copy and one backup.
    // V6 previously parsed both and then tried to merge them. If the backup
    // contained an older version of the same party slot, it could survive the
    // merge as a seventh "party" Pokémon. Match PKHeX's Gen IV block
    // selection instead: choose the newest General block (party) and newest
    // Storage block (boxes) independently from their footer counters.
    const generalPartition = getActiveBlockPartition(bytes, 0, GENERAL_SIZE);
    const storagePartition = getActiveBlockPartition(bytes, STORAGE_START, STORAGE_SIZE);

    const entries = [];
    parseParty(bytes, generalPartition * PARTITION, generalPartition, entries);
    parseBoxes(bytes, storagePartition * PARTITION, storagePartition, entries);
    return entries;
  }

  function getActiveBlockPartition(bytes, begin, length) {
    // HGSS keeps two copies of each save block. A higher counter normally means
    // newer, but a partially written/corrupted newer block must NOT beat an
    // older block whose CRC16 checksum is valid. This matters on emulator saves
    // where a write can be interrupted. Prefer checksum-valid data first, then
    // compare the Gen IV footer counters when both copies are valid (or both bad).
    const valid0 = isHGSSBlockChecksumValid(bytes, 0, begin, length);
    const valid1 = isHGSSBlockChecksumValid(bytes, 1, begin, length);
    if (valid0 !== valid1) return valid1 ? 1 : 0;

    const footer0 = begin + length - 0x14;
    const footer1 = footer0 + PARTITION;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    const major0 = dv.getUint32(footer0, true);
    const major1 = dv.getUint32(footer1, true);
    const major = compareSaveCounters(major0, major1);
    if (major !== 2) return major;

    const minor0 = dv.getUint32(footer0 + 4, true);
    const minor1 = dv.getUint32(footer1 + 4, true);
    const minor = compareSaveCounters(minor0, minor1);
    return minor === 1 ? 1 : 0;
  }

  function isHGSSBlockChecksumValid(bytes, partition, begin, length) {
    const start = partition * PARTITION + begin;
    const end = start + length;
    if (start < 0 || end > bytes.length || length < 0x10) return false;

    // HGSS uses a 0x10-byte footer. The saved CRC16 is the final uint16, and
    // the checksum covers the block excluding that footer.
    const saved = bytes[end - 2] | (bytes[end - 1] << 8);
    const calculated = crc16CcittHGSS(bytes, start, end - 0x10);
    return calculated === saved;
  }

  function crc16CcittHGSS(bytes, start, endExclusive) {
    // Same CRC16-CCITT routine used by Gen IV save blocks (initial 0xFFFF).
    let top = 0xFF;
    let bot = 0xFF;
    for (let i = start; i < endExclusive; i++) {
      let x = (bytes[i] ^ top) & 0xFF;
      x ^= x >>> 4;
      top = (bot ^ (x >>> 3) ^ ((x << 4) & 0xFF)) & 0xFF;
      bot = (x ^ ((x << 5) & 0xFF)) & 0xFF;
    }
    return ((top << 8) | bot) & 0xFFFF;
  }

  function compareSaveCounters(a, b) {
    // Uninitialized partition handling mirrors PKHeX's Gen IV selection.
    // 0 = first, 1 = second, 2 = same.
    if (a === 0xFFFFFFFF && b !== 0xFFFFFFFE) return 1;
    if (b === 0xFFFFFFFF && a !== 0xFFFFFFFE) return 0;
    if (a > b) return 0;
    if (a < b) return 1;
    return 2;
  }

  function parseParty(bytes, base, partition, out) {
    const count = Math.min(bytes[base + PARTY_COUNT_OFFSET] || 0, 6);
    for (let slot = 0; slot < count; slot++) {
      const offset = base + PARTY_START + slot * PARTY_SIZE;
      const mon = parsePK4(bytes, offset);
      if (!mon) continue;
      mon.locationType = 'party';
      mon.location = `隊伍 ${slot + 1}`;
      mon.partition = partition;
      mon.rawOffset = offset;
      mon.battleStats = parsePartyBattleStats(bytes, offset, mon.pid);
      out.push(mon);
    }
  }

  function parsePartyBattleStats(bytes, offset, pid) {
    const start = offset + 0x88;
    const length = 0x64;
    if (start + length > bytes.length) return null;
    const source = new DataView(bytes.buffer, bytes.byteOffset + start, length);
    const decrypted = new Uint8Array(length);
    let seed = pid >>> 0;
    for (let i = 0; i < length / 2; i++) {
      seed = (Math.imul(seed, 0x41C64E6D) + 0x6073) >>> 0;
      const word = source.getUint16(i * 2, true) ^ (seed >>> 16);
      decrypted[i * 2] = word & 0xFF;
      decrypted[i * 2 + 1] = word >>> 8;
    }
    const dv = new DataView(decrypted.buffer);
    const level = decrypted[0x04];
    if (level < 1 || level > 100) return null;
    return {
      level,
      currentHp: dv.getUint16(0x06, true),
      hp: dv.getUint16(0x08, true),
      atk: dv.getUint16(0x0A, true),
      def: dv.getUint16(0x0C, true),
      spe: dv.getUint16(0x0E, true),
      spa: dv.getUint16(0x10, true),
      spd: dv.getUint16(0x12, true),
      exact: true
    };
  }

  function parseBoxes(bytes, base, partition, out) {
    const storageBase = base + STORAGE_START;
    for (let box = 0; box < BOX_COUNT; box++) {
      const boxBase = storageBase + box * BOX_STRIDE;
      for (let slot = 0; slot < BOX_SLOTS; slot++) {
        const offset = boxBase + slot * STORED_SIZE;
        const mon = parsePK4(bytes, offset);
        if (!mon) continue;
        mon.locationType = 'box';
        mon.location = `盒子 ${box + 1} · ${slot + 1}`;
        mon.box = box + 1;
        mon.slot = slot + 1;
        mon.partition = partition;
        mon.rawOffset = offset;
        out.push(mon);
      }
    }
  }

  function parsePK4(bytes, offset) {
    if (offset < 0 || offset + STORED_SIZE > bytes.length) return null;
    const dv = new DataView(bytes.buffer, bytes.byteOffset + offset, STORED_SIZE);
    const pid = dv.getUint32(0, true);
    const checksum = dv.getUint16(6, true);
    if ((pid === 0 && checksum === 0) || (pid === 0xFFFFFFFF && checksum === 0xFFFF)) return null;

    const decryptedShuffled = new Uint8Array(128);
    let seed = checksum >>> 0;
    for (let i = 0; i < 64; i++) {
      seed = (Math.imul(seed, 0x41C64E6D) + 0x6073) >>> 0;
      const encryptedWord = dv.getUint16(8 + i * 2, true);
      const word = encryptedWord ^ (seed >>> 16);
      decryptedShuffled[i * 2] = word & 0xFF;
      decryptedShuffled[i * 2 + 1] = word >>> 8;
    }

    let sum = 0;
    for (let i = 0; i < 128; i += 2) {
      sum = (sum + decryptedShuffled[i] + (decryptedShuffled[i + 1] << 8)) & 0xFFFF;
    }
    if (sum !== checksum) return null;

    const shift = (((pid & 0x3E000) >>> 13) % 24) >>> 0;
    const order = BLOCK_ORDERS[shift];
    const canonical = new Uint8Array(128);
    for (let srcBlock = 0; srcBlock < 4; srcBlock++) {
      const canonicalIndex = order.charCodeAt(srcBlock) - 65;
      canonical.set(decryptedShuffled.subarray(srcBlock * 32, srcBlock * 32 + 32), canonicalIndex * 32);
    }

    const cdv = new DataView(canonical.buffer);
    const species = cdv.getUint16(0, true);
    if (species < 1 || species > 493) return null;

    const tid = cdv.getUint16(4, true);
    const sid = cdv.getUint16(6, true);
    const exp = cdv.getUint32(8, true);
    const evs = {
      hp: canonical[0x10], atk: canonical[0x11], def: canonical[0x12],
      spe: canonical[0x13], spa: canonical[0x14], spd: canonical[0x15]
    };

    const ivWord = cdv.getUint32(0x30, true);
    const ivs = {
      hp: (ivWord >>> 0) & 31,
      atk: (ivWord >>> 5) & 31,
      def: (ivWord >>> 10) & 31,
      spe: (ivWord >>> 15) & 31,
      spa: (ivWord >>> 20) & 31,
      spd: (ivWord >>> 25) & 31
    };

    const isEgg = !!(ivWord & 0x40000000);
    const isNicknamed = !!(ivWord & 0x80000000);
    const storedNickname = decodeGen4String(canonical, 0x40, 0x16);
    const nickname = isNicknamed ? storedNickname : '';
    const totalEV = Object.values(evs).reduce((a, b) => a + b, 0);
    const natureIndex = pid % 25;

    return { pid, checksum, species, tid, sid, exp, evs, ivs, totalEV, natureIndex, nature: NATURES[natureIndex], isEgg, isNicknamed, storedNickname, nickname };
  }

  function mergePartitionDuplicates(entries) {
    const map = new Map();
    for (const m of entries) {
      const key = [
        m.locationType, m.location, m.pid, m.checksum, m.species, m.tid, m.sid,
        m.exp, m.evs.hp, m.evs.atk, m.evs.def, m.evs.spa, m.evs.spd, m.evs.spe,
        m.ivs.hp, m.ivs.atk, m.ivs.def, m.ivs.spa, m.ivs.spd, m.ivs.spe,
        m.isNicknamed ? 1 : 0, m.storedNickname
      ].join(':');
      const existing = map.get(key);
      if (existing) {
        existing.partitions.add(m.partition);
        if (!existing.battleStats && m.battleStats) existing.battleStats = m.battleStats;
      } else {
        m.partitions = new Set([m.partition]);
        map.set(key, m);
      }
    }
    return [...map.values()].sort((a, b) => {
      if (a.locationType !== b.locationType) return a.locationType === 'party' ? -1 : 1;
      if (a.locationType === 'box') return (a.box - b.box) || (a.slot - b.slot);
      return parseInt(a.location.split(' ')[1]) - parseInt(b.location.split(' ')[1]);
    });
  }

  function filteredMons() {
    const q = searchInput.value.trim().toLowerCase();
    const loc = locationFilter.value;
    const evf = evFilter.value;
    return allMons.filter(m => {
      if (loc === 'party' && m.locationType !== 'party') return false;
      if (loc === 'box' && m.locationType !== 'box') return false;
      if (loc.startsWith('box:')) {
        const boxNumber = Number(loc.slice(4));
        if (m.locationType !== 'box' || m.box !== boxNumber) return false;
      }
      if (evf === 'trained' && m.totalEV === 0) return false;
      if (evf === 'maxed' && m.totalEV < 508) return false;
      if (evf === 'overcap' && m.totalEV <= 510) return false;
      if (q) {
        const meta = speciesCache.get(m.species);
        const hay = [m.species, `#${m.species}`, meta?.displayName, meta?.english, m.nickname, m.storedNickname, m.location, m.nature].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function render() {
    if (!allMons.length) return;
    const mons = filteredMons();
    results.innerHTML = '';
    if (!mons.length) {
      results.innerHTML = '<div class="empty">沒有符合篩選條件的 Pokémon。</div>';
      return;
    }
    const frag = document.createDocumentFragment();
    for (const mon of mons) frag.appendChild(makeCard(mon));
    results.appendChild(frag);
  }

  function makeCard(mon) {
    const node = template.content.firstElementChild.cloneNode(true);
    const meta = speciesCache.get(mon.species);
    const sprite = node.querySelector('.sprite');
    sprite.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${mon.species}.png`;
    sprite.alt = meta?.displayName || `Pokémon #${mon.species}`;
    sprite.onerror = () => { sprite.style.visibility = 'hidden'; };

    const speciesName = meta?.displayName || `Pokémon #${mon.species}`;
    const nicknameText = mon.isNicknamed && mon.nickname ? mon.nickname : '未設定';
    node.querySelector('.mon-name').innerHTML = `#${pad3(mon.species)} ${escapeHtml(speciesName)} <span class="nickname">｜暱稱：${escapeHtml(nicknameText)}</span>`;
    const eggTag = mon.isEgg ? ' · 蛋' : '';
    node.querySelector('.mon-meta').textContent = `${mon.location}${eggTag}`;

    const panel = node.querySelector('.stat-view');
    const buttons = [...node.querySelectorAll('.view-button')];
    const selected = activeViews.get(mon.uiKey) || '';
    if (selected) showView(node, mon, selected);

    buttons.forEach(button => {
      button.addEventListener('click', () => {
        const view = button.dataset.view;
        activeViews.set(mon.uiKey, view);
        showView(node, mon, view);
      });
    });
    return node;
  }

  function showView(card, mon, view) {
    const panel = card.querySelector('.stat-view');
    card.querySelectorAll('.view-button').forEach(btn => {
      const active = btn.dataset.view === view;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    panel.classList.remove('hidden');
    if (view === 'current') panel.innerHTML = renderCurrentView(mon);
    else if (view === 'iv') panel.innerHTML = renderIvView(mon);
    else if (view === 'ev') panel.innerHTML = renderEvView(mon);
    else if (view === 'nature') panel.innerHTML = renderNatureView(mon);
  }

  function renderCurrentView(mon) {
    const stats = getCurrentStats(mon);
    if (!stats) return unavailablePanel('目前數值所需的固定資料無法取得。');
    const maxValue = Math.max(...STAT_KEYS.map(([k]) => stats[k] || 0), 1);
    const source = stats.exact ? '存檔目前數值' : '依 EXP／IV／EV／性格計算';
    const hpText = stats.currentHp != null ? ` · 目前 HP ${stats.currentHp}/${stats.hp}` : '';
    return `
      <div class="view-heading"><strong>目前數值</strong><span>Lv.${stats.level}${hpText}</span></div>
      <div class="view-note">${source}</div>
      <div class="metric-grid">${STAT_KEYS.map(([key,label]) => metricHtml(label, stats[key], maxValue)).join('')}</div>`;
  }

  function renderIvView(mon) {
    return `
      <div class="view-heading"><strong>個體質</strong><span>單項上限 31</span></div>
      <div class="metric-grid">${STAT_KEYS.map(([key,label]) => metricHtml(label, mon.ivs[key], 31, mon.ivs[key] === 31 ? 'perfect' : '')).join('')}</div>`;
  }

  function renderEvView(mon) {
    const totalClass = mon.totalEV > 510 ? 'danger-text' : (mon.totalEV >= 508 ? 'good-text' : '');
    return `
      <div class="view-heading"><strong>努力值</strong><span class="${totalClass}">總 EV ${mon.totalEV} / 510</span></div>
      <div class="metric-grid">${STAT_KEYS.map(([key,label]) => {
        const value = mon.evs[key];
        return metricHtml(label, value, 255, value >= 252 ? 'full' : '', value > 252 ? '超過 252' : '');
      }).join('')}</div>`;
  }

  function renderNatureView(mon) {
    const meta = speciesCache.get(mon.species);
    let stats = getCalculatedStats(mon, meta);
    let sourceNote = '';
    if (!stats && mon.battleStats) {
      stats = getPartyNatureStats(mon);
      sourceNote = '<div class="view-note">依隊伍中存檔的實際能力值反推性格差異</div>';
    }
    if (!stats) return unavailablePanel('盒子 Pokémon 的目前能力值需要固定種族資料；V6.1 已嘗試所有備援來源。');
    const effect = natureEffect(mon.natureIndex);
    const maxValue = Math.max(...STAT_KEYS.map(([k]) => Math.max(stats.actual[k] || 0, stats.neutral[k] || 0)), 1);
    const neutralNature = !effect.up || !effect.down;
    const summaryText = neutralNature
      ? '此性格不增加也不扣除能力值'
      : `<span class="good-text">${statLabel(effect.up)} +10%</span> · <span class="danger-text">${statLabel(effect.down)} -10%</span>`;
    return `
      <div class="view-heading"><strong>性格影響</strong><span>${escapeHtml(mon.nature)}</span></div>
      ${sourceNote}
      <div class="nature-summary">${summaryText}</div>
      <div class="metric-grid">${STAT_KEYS.map(([key,label]) => natureMetricHtml(key, label, stats.actual[key], stats.neutral[key], maxValue, effect)).join('')}</div>
      <div class="legend"><span><i class="legend-dot normal"></i>一般數值</span><span><i class="legend-dot gain"></i>性格增加</span><span><i class="legend-dot loss"></i>性格扣除</span></div>`;
  }

  function getPartyNatureStats(mon) {
    const b = mon.battleStats;
    if (!b) return null;
    const effect = natureEffect(mon.natureIndex);
    const actual = { hp:b.hp, atk:b.atk, def:b.def, spa:b.spa, spd:b.spd, spe:b.spe };
    const neutral = { ...actual };
    for (const key of [effect.up, effect.down].filter(Boolean)) {
      neutral[key] = inferNeutralPartyStat(mon, key, actual[key], effect);
    }
    return { level:b.level, actual, neutral };
  }

  function inferNeutralPartyStat(mon, key, actualValue, effect) {
    const level = mon.battleStats?.level || 1;
    const modifier = key === effect.up ? 1.1 : (key === effect.down ? 0.9 : 1);
    if (modifier === 1) return actualValue;
    const matches = [];
    for (let base = 1; base <= 255; base++) {
      const pre = Math.floor(((2 * base + mon.ivs[key] + Math.floor(mon.evs[key] / 4)) * level) / 100) + 5;
      if (Math.floor(pre * modifier) === actualValue) matches.push(pre);
    }
    if (matches.length) {
      const target = actualValue / modifier;
      return matches.reduce((best, n) => Math.abs(n-target) < Math.abs(best-target) ? n : best, matches[0]);
    }
    return modifier > 1 ? Math.round(actualValue / 1.1) : Math.round(actualValue / 0.9);
  }

  function unavailablePanel(text) {
    return `<div class="loading-view">${escapeHtml(text)}<br><small>可先重新整理頁面再重新選擇存檔。</small></div>`;
  }

  function metricHtml(label, value, maxValue, cls = '', hint = '') {
    const width = Math.min(100, Math.max(0, value / Math.max(1, maxValue) * 100));
    return `<div class="metric ${cls}">
      <div class="metric-row"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span><b>${value}</b></div>
      <div class="bar"><span style="width:${width}%"></span></div>
    </div>`;
  }

  function natureMetricHtml(key, label, actual, neutral, maxValue, effect) {
    const actualWidth = actual / maxValue * 100;
    const neutralWidth = neutral / maxValue * 100;
    let segments = '';
    let deltaText = '';
    let cls = '';
    if (key === effect.up) {
      const baseWidth = Math.min(actualWidth, neutralWidth);
      const gainWidth = Math.max(0, actualWidth - neutralWidth);
      segments = `<span class="nature-base" style="width:${baseWidth}%"></span><span class="nature-gain" style="width:${gainWidth}%"></span>`;
      deltaText = `<small class="good-text">+${Math.max(0, actual - neutral)}</small>`;
      cls = 'nature-up';
    } else if (key === effect.down) {
      const baseWidth = Math.min(actualWidth, neutralWidth);
      const lossWidth = Math.max(0, neutralWidth - actualWidth);
      segments = `<span class="nature-base" style="width:${baseWidth}%"></span><span class="nature-loss" style="width:${lossWidth}%"></span>`;
      deltaText = `<small class="danger-text">-${Math.max(0, neutral - actual)}</small>`;
      cls = 'nature-down';
    } else {
      segments = `<span class="nature-base" style="width:${actualWidth}%"></span>`;
    }
    return `<div class="metric ${cls}">
      <div class="metric-row"><span>${label}${deltaText}</span><b>${actual}</b></div>
      <div class="bar nature-bar">${segments}</div>
    </div>`;
  }

  function natureEffect(index) {
    const upIndex = Math.floor(index / 5);
    const downIndex = index % 5;
    if (upIndex === downIndex) return { up: null, down: null };
    return { up: NATURE_STAT_ORDER[upIndex], down: NATURE_STAT_ORDER[downIndex] };
  }

  function statLabel(key) {
    return STAT_KEYS.find(([k]) => k === key)?.[1] || key;
  }

  function getCurrentStats(mon) {
    if (mon.battleStats) return mon.battleStats;
    const meta = speciesCache.get(mon.species);
    const calculated = getCalculatedStats(mon, meta);
    if (!calculated) return null;
    return { ...calculated.actual, level: calculated.level, currentHp: null, exact: false };
  }

  function getCalculatedStats(mon, meta) {
    if (!meta?.baseStats || !meta?.growthRate) return null;
    const level = levelFromExp(mon.exp, meta.growthRate);
    const effect = natureEffect(mon.natureIndex);
    const actual = {};
    const neutral = {};
    for (const [key] of STAT_KEYS) {
      const base = meta.baseStats[key];
      if (!Number.isFinite(base)) return null;
      const iv = mon.ivs[key];
      const ev = mon.evs[key];
      if (key === 'hp') {
        const hp = mon.species === 292 ? 1 : Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
        actual[key] = hp;
        neutral[key] = hp;
      } else {
        const preNature = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5;
        neutral[key] = preNature;
        const modifier = key === effect.up ? 1.1 : (key === effect.down ? 0.9 : 1);
        actual[key] = Math.floor(preNature * modifier);
      }
    }
    return { level, actual, neutral };
  }

  function levelFromExp(exp, growthRate) {
    let level = 1;
    for (let next = 2; next <= 100; next++) {
      if (exp >= expForLevel(next, growthRate)) level = next;
      else break;
    }
    return level;
  }

  function expForLevel(n, growthRate) {
    n = Math.max(1, Math.min(100, n));
    const n3 = n * n * n;
    switch (growthRate) {
      case 'fast': return Math.floor(4 * n3 / 5);
      case 'slow': return Math.floor(5 * n3 / 4);
      case 'medium-slow': return Math.max(0, Math.floor((6 * n3) / 5 - 15 * n * n + 100 * n - 140));
      case 'erratic':
        if (n <= 50) return Math.floor(n3 * (100 - n) / 50);
        if (n <= 68) return Math.floor(n3 * (150 - n) / 100);
        if (n <= 98) return Math.floor(n3 * Math.floor((1911 - 10 * n) / 3) / 500);
        return Math.floor(n3 * (160 - n) / 100);
      case 'fluctuating':
        if (n <= 15) return Math.floor(n3 * (Math.floor((n + 1) / 3) + 24) / 50);
        if (n <= 36) return Math.floor(n3 * (n + 14) / 50);
        return Math.floor(n3 * (Math.floor(n / 2) + 32) / 50);
      case 'medium-fast':
      case 'medium':
      default: return n3;
    }
  }

  function renderSummary() {
    const party = allMons.filter(m => m.locationType === 'party').length;
    const box = allMons.filter(m => m.locationType === 'box').length;
    const current = locationFilter.value;
    summary.innerHTML = `
      <button type="button" class="stat ${current === 'all' ? 'active' : ''}" data-location="all" aria-pressed="${current === 'all'}">
        <strong>${allMons.length}</strong><span>總數</span>
      </button>
      <button type="button" class="stat ${current === 'party' ? 'active' : ''}" data-location="party" aria-pressed="${current === 'party'}">
        <strong>${party}</strong><span>隊伍</span>
      </button>
      <button type="button" class="stat ${(current === 'box' || current.startsWith('box:')) ? 'active' : ''}" data-location="box" aria-pressed="${current === 'box' || current.startsWith('box:')}">
        <strong>${box}</strong><span>盒子</span>
      </button>`;
  }

  async function hydrateSpeciesData(ids) {
    let failed = 0;
    const unresolved = [];

    for (const id of ids) {
      const cached = dataCache[id];
      if (isUsableSpeciesMeta(cached)) speciesCache.set(id, cached);
      else unresolved.push(id);
    }
    if (!unresolved.length) return 0;

    let dex = null;
    try { dex = await loadFixedDex(); } catch (err) { console.warn('V6 static dex unavailable', err); }

    const stillMissing = [];
    for (const id of unresolved) {
      const meta = dex ? speciesMetaFromStaticDex(id, dex) : null;
      if (isUsableSpeciesMeta(meta)) {
        speciesCache.set(id, meta);
        dataCache[id] = meta;
      } else {
        stillMissing.push(id);
      }
    }

    // Last-resort fallback: only unresolved species use PokeAPI, with limited concurrency.
    const queue = [...stillMissing];
    const workers = Array.from({ length: Math.min(4, queue.length) }, () => (async () => {
      while (queue.length) {
        const id = queue.shift();
        if (!id) return;
        try {
          const meta = await fetchSpeciesFromPokeApi(id);
          if (!isUsableSpeciesMeta(meta)) throw new Error('incomplete species meta');
          speciesCache.set(id, meta);
          dataCache[id] = meta;
        } catch (err) {
          failed += 1;
          console.warn(`species ${id} unavailable`, err);
          if (!speciesCache.has(id)) speciesCache.set(id, { displayName:`Pokémon #${id}`, english:'' });
        }
      }
    })());
    await Promise.all(workers);

    try { localStorage.setItem('hgssSpeciesDataV6', JSON.stringify(dataCache)); } catch (_) {}
    return failed;
  }

  function isUsableSpeciesMeta(item) {
    return !!(item?.displayName && item?.growthRate && item?.baseStats &&
      ['hp','atk','def','spa','spd','spe'].every(k => Number.isFinite(item.baseStats[k])));
  }

  async function loadFixedDex() {
    if (fixedDexPromise) return fixedDexPromise;
    fixedDexPromise = (async () => {
      const [baseData, growthData] = await Promise.all([
        fetchJsonAny(STATIC_BASE_URLS),
        fetchJsonAny(STATIC_GROWTH_URLS)
      ]);
      const keys = Object.keys(baseData || {});
      if (keys.length < 493 || keys[0] !== 'bulbasaur') throw new Error('static dex order invalid');
      return { baseData, growthData, keys };
    })();
    try { return await fixedDexPromise; }
    catch (err) { fixedDexPromise = null; throw err; }
  }

  async function fetchJsonAny(urls) {
    let lastError = null;
    for (const url of urls) {
      try {
        const res = await fetch(url, { cache:'force-cache', mode:'cors' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (err) { lastError = err; }
    }
    throw lastError || new Error('all static sources failed');
  }

  function speciesMetaFromStaticDex(id, dex) {
    const key = dex.keys[id - 1];
    const row = key && dex.baseData[key];
    if (!row) return null;
    const growthRow = dex.growthData[key] || dex.growthData[baseSpeciesKey(key)];
    const growthRate = growthRow?.growth_rate;
    if (!growthRate) return null;
    const baseStats = {
      hp:Number(row.hp), atk:Number(row.attack), def:Number(row.defense),
      spa:Number(row.special_attack), spd:Number(row.special_defense), spe:Number(row.speed)
    };
    applyGen4Overrides(id, baseStats);
    const displayName = friendlySpeciesName(key);
    return { displayName, english:displayName, growthRate, baseStats, source:'static-v6' };
  }

  function baseSpeciesKey(key) {
    const special = {
      'deoxys-normal':'deoxys', 'wormadam-plant':'wormadam', 'giratina-altered':'giratina',
      'shaymin-land':'shaymin', 'rotom':'rotom'
    };
    return special[key] || key;
  }

  function friendlySpeciesName(key) {
    const special = {
      'nidoran-f':'Nidoran♀', 'nidoran-m':'Nidoran♂', 'farfetchd':"Farfetch'd",
      'mr-mime':'Mr. Mime', 'mime-jr':'Mime Jr.', 'ho-oh':'Ho-Oh', 'porygon-z':'Porygon-Z',
      'deoxys-normal':'Deoxys', 'wormadam-plant':'Wormadam', 'giratina-altered':'Giratina',
      'shaymin-land':'Shaymin'
    };
    if (special[key]) return special[key];
    return key.split('-').map(part => part ? part[0].toUpperCase() + part.slice(1) : part).join('-');
  }

  function applyGen4Overrides(id, stats) {
    const patch = GEN4_STAT_OVERRIDES[id];
    if (patch) Object.assign(stats, patch);
    return stats;
  }

  async function fetchSpeciesFromPokeApi(id) {
    const [speciesRes, pokemonRes] = await Promise.all([
      fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}/`, { cache:'force-cache' }),
      fetch(`https://pokeapi.co/api/v2/pokemon/${id}/`, { cache:'force-cache' })
    ]);
    if (!speciesRes.ok || !pokemonRes.ok) throw new Error('PokeAPI');
    const species = await speciesRes.json();
    const pokemon = await pokemonRes.json();
    const traditional = species.names?.find(n => n.language?.name === 'zh-Hant')?.name;
    const english = species.names?.find(n => n.language?.name === 'en')?.name || species.name;
    const simplified = species.names?.find(n => n.language?.name === 'zh-Hans')?.name;
    const byName = Object.fromEntries((pokemon.stats || []).map(s => [s.stat?.name, s.base_stat]));
    const baseStats = {
      hp:byName.hp, atk:byName.attack, def:byName.defense,
      spa:byName['special-attack'], spd:byName['special-defense'], spe:byName.speed
    };
    applyGen4Overrides(id, baseStats);
    return {
      displayName: traditional || simplified || english || `Pokémon #${id}`,
      english: english || '',
      growthRate: species.growth_rate?.name || '',
      baseStats, source:'pokeapi-fallback'
    };
  }

  function decodeGen4String(bytes, start, byteLength) {
    const chars = [];
    const end = Math.min(bytes.length, start + byteLength);
    for (let off = start; off + 1 < end; off += 2) {
      const code = bytes[off] | (bytes[off + 1] << 8);
      if (code === 0xFFFF || code === 0x0000) break;
      let ch = '';
      if (code === 0x0001) ch = '　';
      else if (code >= 0x0002 && code <= 0x0051) ch = G4_HIRAGANA[code - 0x0002] || '';
      else if (code >= 0x0052 && code <= 0x00A1) ch = G4_KATAKANA[code - 0x0052] || '';
      else if (code >= 0x00A2 && code <= 0x00AB) ch = String.fromCharCode(0xFF10 + code - 0x00A2);
      else if (code >= 0x00AC && code <= 0x00C5) ch = String.fromCharCode(0xFF21 + code - 0x00AC);
      else if (code >= 0x00C6 && code <= 0x00DF) ch = String.fromCharCode(0xFF41 + code - 0x00C6);
      else if (code >= 0x0121 && code <= 0x012A) ch = String.fromCharCode(0x30 + code - 0x0121);
      else if (code >= 0x012B && code <= 0x0144) ch = String.fromCharCode(0x41 + code - 0x012B);
      else if (code >= 0x0145 && code <= 0x015E) ch = String.fromCharCode(0x61 + code - 0x0145);
      else if (code >= 0x015F && code <= 0x01A4) ch = G4_ACCENTED[code - 0x015F] || '';
      else ch = G4_SYMBOLS.get(code) || '';
      chars.push(ch || '□');
    }
    return chars.join('').trim();
  }

  function setStatus(text, cls = '') {
    status.textContent = text;
    status.className = `status ${cls}`.trim();
  }
  function pad3(n) { return String(n).padStart(3, '0'); }
  function formatBytes(n) { return n >= 1024*1024 ? `${(n/1024/1024).toFixed(2)} MB` : `${(n/1024).toFixed(1)} KB`; }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
})();
