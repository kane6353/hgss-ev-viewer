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

  const fileInput = document.querySelector('#saveFile');
  const fileInfo = document.querySelector('#fileInfo');
  const status = document.querySelector('#status');
  const toolbar = document.querySelector('#toolbar');
  const results = document.querySelector('#results');
  const summary = document.querySelector('#summary');
  const searchInput = document.querySelector('#search');
  const locationFilter = document.querySelector('#locationFilter');
  const evFilter = document.querySelector('#evFilter');
  const exportCsv = document.querySelector('#exportCsv');
  const template = document.querySelector('#cardTemplate');

  let allMons = [];
  const speciesCache = new Map();
  let nameCache = {};
  try { nameCache = JSON.parse(localStorage.getItem('hgssSpeciesNames') || '{}'); } catch (_) {}

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    fileInfo.textContent = `${file.name} · ${formatBytes(file.size)}`;
    setStatus('正在解析存檔…');
    toolbar.classList.add('hidden');
    summary.classList.add('hidden');
    results.innerHTML = '';

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.length < MIN_RAW_SIZE) {
        throw new Error(`檔案太小（${formatBytes(bytes.length)}）。HGSS 原始存檔應至少包含約 512 KB 的資料。`);
      }

      const parsed = parseHGSS(bytes);
      allMons = parsed;
      if (!allMons.length) {
        throw new Error('沒有找到可通過 Gen IV checksum 的 Pokémon。請確認這是《心金／魂銀》的 .sav / .dsv。');
      }

      toolbar.classList.remove('hidden');
      summary.classList.remove('hidden');
      setStatus(`完成：找到 ${allMons.length} 隻 Pokémon。`, 'ok');
      renderSummary();
      render();
      hydrateSpeciesNames([...new Set(allMons.map(m => m.species))]);
    } catch (err) {
      console.error(err);
      setStatus(err?.message || '解析失敗。', 'error');
      allMons = [];
    }
  });

  [searchInput, locationFilter, evFilter].forEach(el => el.addEventListener('input', render));
  exportCsv.addEventListener('click', exportCurrentCsv);

  function parseHGSS(bytes) {
    const entries = [];
    for (let p = 0; p < 2; p++) {
      const base = p * PARTITION;
      parseParty(bytes, base, p, entries);
      parseBoxes(bytes, base, p, entries);
    }
    return mergePartitionDuplicates(entries);
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
      out.push(mon);
    }
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

    // Empty slots are commonly all 00 / FF. Avoid unnecessary work.
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
      const canonicalIndex = order.charCodeAt(srcBlock) - 65; // A=0
      canonical.set(decryptedShuffled.subarray(srcBlock * 32, srcBlock * 32 + 32), canonicalIndex * 32);
    }

    const cdv = new DataView(canonical.buffer);
    const species = cdv.getUint16(0, true);
    if (species < 1 || species > 493) return null;

    const tid = cdv.getUint16(4, true);
    const sid = cdv.getUint16(6, true);
    const exp = cdv.getUint32(8, true);

    // Block A absolute 0x18..0x1D => relative to decrypted 0x08 = 0x10..0x15.
    const evs = {
      hp: canonical[0x10], atk: canonical[0x11], def: canonical[0x12],
      spe: canonical[0x13], spa: canonical[0x14], spd: canonical[0x15]
    };

    // Block B IV word absolute 0x38..0x3B => relative 0x30..0x33.
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
    const totalEV = Object.values(evs).reduce((a, b) => a + b, 0);
    const natureIndex = pid % 25;

    return { pid, checksum, species, tid, sid, exp, evs, ivs, totalEV, natureIndex, nature: NATURES[natureIndex], isEgg, isNicknamed };
  }

  function mergePartitionDuplicates(entries) {
    const map = new Map();
    for (const m of entries) {
      const key = [
        m.locationType, m.location, m.pid, m.checksum, m.species, m.tid, m.sid,
        m.exp, m.evs.hp, m.evs.atk, m.evs.def, m.evs.spa, m.evs.spd, m.evs.spe,
        m.ivs.hp, m.ivs.atk, m.ivs.def, m.ivs.spa, m.ivs.spd, m.ivs.spe
      ].join(':');
      const existing = map.get(key);
      if (existing) {
        existing.partitions.add(m.partition);
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
      if (loc !== 'all' && m.locationType !== loc) return false;
      if (evf === 'trained' && m.totalEV === 0) return false;
      if (evf === 'maxed' && m.totalEV < 508) return false;
      if (evf === 'overcap' && m.totalEV <= 510) return false;
      if (q) {
        const meta = speciesCache.get(m.species);
        const hay = [m.species, `#${m.species}`, meta?.displayName, meta?.english, m.location, m.nature].filter(Boolean).join(' ').toLowerCase();
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

    node.querySelector('.mon-name').textContent = meta?.displayName ? `#${pad3(mon.species)} ${meta.displayName}` : `#${pad3(mon.species)} Pokémon`;
    const backupTag = mon.partitions?.size > 1 ? '<span class="tag">主/備份皆有</span>' : '<span class="tag warn">單一分區</span>';
    const eggTag = mon.isEgg ? '<span class="tag">蛋</span>' : '';
    node.querySelector('.mon-meta').innerHTML = `${mon.location} · ${escapeHtml(mon.nature)}<br>${backupTag}${eggTag}`;

    const totalClass = mon.totalEV > 510 ? 'danger' : (mon.totalEV >= 508 ? 'good' : '');
    node.querySelector('.ev-total').innerHTML = `<span class="${totalClass}">${mon.totalEV}</span><small>總 EV / 510</small>`;

    const evGrid = node.querySelector('.ev-grid');
    for (const [key, label] of STAT_KEYS) {
      const value = mon.evs[key];
      const cell = document.createElement('div');
      cell.className = `ev ${value >= 252 ? 'full' : ''} ${value > 252 ? 'waste' : ''}`;
      const width = Math.min(100, value / 255 * 100);
      cell.innerHTML = `<div class="row"><span>${label}</span><b>${value}</b></div><div class="bar"><span style="width:${width}%"></span></div>`;
      evGrid.appendChild(cell);
    }

    const detail = node.querySelector('.detail-grid');
    detail.innerHTML = `
      <div><strong>IV</strong><br>${STAT_KEYS.map(([k,l]) => `${l} ${mon.ivs[k]}`).join(' · ')}</div>
      <div><strong>PID</strong><br>0x${mon.pid.toString(16).toUpperCase().padStart(8,'0')}</div>
      <div><strong>TID / SID</strong><br>${mon.tid} / ${mon.sid}</div>
      <div><strong>EXP</strong><br>${mon.exp.toLocaleString()}</div>
      <div><strong>Checksum</strong><br>0x${mon.checksum.toString(16).toUpperCase().padStart(4,'0')}</div>
      <div><strong>資料位置</strong><br>0x${mon.rawOffset.toString(16).toUpperCase()}</div>`;

    return node;
  }

  function renderSummary() {
    const party = allMons.filter(m => m.locationType === 'party').length;
    const box = allMons.filter(m => m.locationType === 'box').length;
    const trained = allMons.filter(m => m.totalEV > 0).length;
    const capped = allMons.filter(m => m.totalEV >= 508 && m.totalEV <= 510).length;
    summary.innerHTML = `
      <div class="stat"><strong>${allMons.length}</strong><span>找到 Pokémon</span></div>
      <div class="stat"><strong>${party}</strong><span>隊伍</span></div>
      <div class="stat"><strong>${box}</strong><span>盒子</span></div>
      <div class="stat"><strong>${capped}</strong><span>總 EV 508–510</span></div>`;
  }

  async function hydrateSpeciesNames(ids) {
    const queue = ids.filter(id => !speciesCache.has(id));
    const workers = Array.from({ length: Math.min(6, queue.length) }, () => worker());
    await Promise.all(workers);
    render();

    async function worker() {
      while (queue.length) {
        const id = queue.shift();
        if (!id) return;
        const cached = nameCache[id];
        if (cached) {
          speciesCache.set(id, cached);
          continue;
        }
        try {
          const res = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}/`);
          if (!res.ok) throw new Error(String(res.status));
          const data = await res.json();
          const traditional = data.names?.find(n => n.language?.name === 'zh-Hant')?.name;
          const english = data.names?.find(n => n.language?.name === 'en')?.name || data.name;
          const simplified = data.names?.find(n => n.language?.name === 'zh-Hans')?.name;
          const item = { displayName: traditional || simplified || english || `Pokémon #${id}`, english: english || '' };
          speciesCache.set(id, item);
          nameCache[id] = item;
          localStorage.setItem('hgssSpeciesNames', JSON.stringify(nameCache));
        } catch (_) {
          speciesCache.set(id, { displayName: `Pokémon #${id}`, english: '' });
        }
      }
    }
  }

  function exportCurrentCsv() {
    const mons = filteredMons();
    if (!mons.length) return;
    const header = ['Dex','Name','Location','Nature','EV Total','HP EV','Atk EV','Def EV','SpA EV','SpD EV','Spe EV','HP IV','Atk IV','Def IV','SpA IV','SpD IV','Spe IV','PID'];
    const rows = mons.map(m => {
      const meta = speciesCache.get(m.species);
      return [m.species, meta?.displayName || '', m.location, m.nature, m.totalEV,
        m.evs.hp,m.evs.atk,m.evs.def,m.evs.spa,m.evs.spd,m.evs.spe,
        m.ivs.hp,m.ivs.atk,m.ivs.def,m.ivs.spa,m.ivs.spd,m.ivs.spe,
        `0x${m.pid.toString(16).toUpperCase().padStart(8,'0')}`];
    });
    const csv = '\uFEFF' + [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hgss-ev.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function csvCell(v) {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replaceAll('"','""')}"` : s;
  }

  function setStatus(text, cls = '') {
    status.textContent = text;
    status.className = `status ${cls}`.trim();
  }
  function pad3(n) { return String(n).padStart(3, '0'); }
  function formatBytes(n) { return n >= 1024*1024 ? `${(n/1024/1024).toFixed(2)} MB` : `${(n/1024).toFixed(1)} KB`; }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
})();
