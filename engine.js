/* engine.js — ตารางจับคู่ + รายการปรับปรุง + คำนวณกำไรรายช่องทางและกำไร CJ ต่อถุง */
(function (g) {
  'use strict';
  const SHARED = 'ส่วนกลาง', EXCLUDE = 'ไม่นับ';

  const DEFAULT_CFG = {
    channelMap: {},            // ช่องทางในโปรแกรมขาย → ช่องทางของ Report
    prefixMap: { CJ: 'CJ', FC: SHARED, EXP: SHARED, TAX: EXCLUDE },   // รหัสนำหน้าค่าใช้จ่าย → ช่องทาง
    catNature: {},             // หมวด → var | fix | ex (ถ้าไม่ตั้ง ใช้ค่าที่เดาให้)
    cost: {},                  // ต้นทุนต่อหน่วยที่แก้เอง
    tta: { cs: 0, ns: 0, dc: 0 },
    promo: { mode: 'accrual', rate: 0, skus: [] },
    notes: {},                 // หมายเหตุเฉพาะของกิจการ { price, fc, channels, warehouse }
    adjustments: [],           // { month, channel, label, amount, nature, reason }
    promoRounds: [],           // บิลค่าโปร 1 แถม 1 ที่กรอกเอง { month, label, amount }
    cjCreditDays: 60, cashOpen: 0, cjNewPrice: 0, present: false, promoInst: 1,
    channelRules: [],          // กฎช่องทางตามชื่อลูกค้า { raw, customer, to } เช่น ช่องทาง "เคลมสินค้า" ที่ลูกค้าเป็นคู่ค้ารายใหญ่ → ช่องทางของคู่ค้านั้น
    noCJ: [],                  // คำในชื่อรายการ/หมวด ของค่าใช้จ่ายส่วนกลางที่ไม่ปันให้ CJ (ปันเฉพาะช่องทางอื่น)
    excludeWords: [],          // คำในชื่อรายการ/หมวด ที่ไม่นับในกำไรขาดทุน
    catGroup: {},              // หมวดในไฟล์ → "กลุ่มหลัก|หมวดย่อย" ที่ตั้งเอง
    monthSource: {},           // เดือนที่มีไฟล์ export ชุดสมบูรณ์ล่าสุด { 'YYYY-MM': 'คำในชื่อไฟล์' } ใช้ไฟล์นั้นแทนไฟล์รุ่นเก่าของเดือนนั้น
    purchaseMonth: {},         // ใบซื้อที่ของเข้าคลังคนละเดือนกับวันที่ใบซื้อ { เลขที่ใบซื้อ: 'YYYY-MM' } ใช้ในการคำนวณต้นทุน
    partialWords: [],          // รายการที่นับเป็นค่าใช้จ่ายบางส่วน { word, pct, sub } เช่น เงินสมทบประกันสังคม นับเฉพาะส่วนนายจ้าง
    purchaseFeeSkus: [],       // รหัสในใบซื้อที่เป็นค่าธรรมเนียม ไม่ใช่สินค้า (นำไปปันเข้าต้นทุนสินค้าในใบเดียวกัน)
    rev: 0,
    fc: {}                     // สมมติฐานประมาณการเงินสดที่แก้เอง { open, cjSales, otherSales, buy, exp, promo }
  };

  const FIX_RE = /เงินเดือน|ประกันสังคม|ค่าเช่า|ทำบัญชี|ซอร์ฟแวร์|ซอฟต์แวร์|โทรศัพท์|อินเตอร์เน็ต|อุปกรณ์สำนักงาน|ซ่อม|เดินทาง|อบรม|การตลาด|เบ็ดเตล็ด|เครื่องจักร|ส่งเสริมการขาย|ไฟฟ้า|ประกัน|ยานพาหนะ|รับรอง/;
  const EX_RE = /ภาษี|สินทรัพย์/;
  const guessNature = cat => EX_RE.test(cat) ? 'ex' : FIX_RE.test(cat) ? 'fix' : 'var';

  // กลุ่มค่าใช้จ่ายหลัก (เรียงตามที่ใช้ในรายงาน) และกฎจัดหมวดย่อยจากชื่อหมวด/ชื่อรายการ
  const G_COST = 'ต้นทุนและคลังสินค้า', G_SELL = 'ค่าใช้จ่ายในการขาย', G_STAFF = 'ค่าใช้จ่ายพนักงาน', G_ADMIN = 'ค่าใช้จ่ายบริหาร', G_EX = 'ไม่นับในกำไรขาดทุน';
  const GROUPS = [G_COST, G_SELL, G_STAFF, G_ADMIN, G_EX];
  const OTHER_SUB = 'ค่าใช้จ่ายเบ็ดเตล็ด', SHIP_SUB = 'ค่าขนส่งสินค้า (ส่วนกลาง)', SHIP_CJ = 'ค่าขนส่งและกระจายสินค้าให้ CJ', SHIP_OTHER = 'ค่าขนส่งถึงลูกค้าช่องทางอื่น';
  const SUB_RULES = [
    [G_SELL, 'ค่าโปรและส่วนลดของคู่ค้า', /1\s*แถม\s*1|BOGO|ร่วมโปร|จัดโปร|ส่วนลดหน้าร้าน|premium/i],
    [G_SELL, 'ค่าสนับสนุนตามสัญญาคู่ค้า', /งบสนับสนุน|สาขาใหม่|commercial/i],
    [G_SELL, 'ค่าปรับและค่าชดเชย', /ค่าปรับ|ชดเชย/],
    [G_ADMIN, 'ค่าไปรษณีย์และส่งเอกสาร', /ไปรษณีย์/],
    [G_SELL, SHIP_SUB, /ขนส่ง|J&T|ลงสินค้า|ค่าตัก|กระจายสินค้า|DC\s*fee|น้ำมัน/i],
    [G_SELL, 'การตลาดและโฆษณา', /โฆษณา|การตลาด|marketing|\bads\b|คลิป|ไลฟ์|ออกบูธ|ไวนิล|ออกแบบ|ส่งเสริมการขาย|ของแถม|ตัวอย่าง|influencer|รีวิว|boost|meta/i],
    [G_SELL, 'ค่าคอมมิชชั่นและค่าธรรมเนียมการขาย', /คอมมิชชั่น|ค่าธรรมเนียม/],
    [G_SELL, 'ค่าบรรจุภัณฑ์', /บรรจุภัณฑ์|packag/i],
    [G_COST, 'ค่าเช่าและค่าใช้จ่ายโกดัง', /โกดัง|คลังสินค้า/],
    [G_COST, 'ค่าทดสอบคุณภาพสินค้า', /ทดสอบคุณภาพ|ตรวจแลป/],
    [G_STAFF, 'เงินเดือนกรรมการ', /เงินเดือนกรรมการ/],
    [G_STAFF, 'เงินเดือนและค่าจ้าง', /เงินเดือน|ค่าจ้าง|รายวัน|เบี้ยเลี้ยง|โบนัส/],
    [G_STAFF, 'เงินสมทบประกันสังคม (ส่วนนายจ้าง)', /ประกันสังคม/],
    [G_STAFF, 'สวัสดิการและอบรม', /สวัสดิการ|อบรม/],
    [G_ADMIN, 'ค่าซอฟต์แวร์และระบบ', /ระบบ|ซอร์ฟแวร์|ซอฟต์แวร์|software/i],
    [G_ADMIN, 'ค่าทำบัญชีและที่ปรึกษา', /บัญชี|ที่ปรึกษา|กฎหมาย/],
    [G_ADMIN, 'ค่าโทรศัพท์และอินเทอร์เน็ต', /โทรศัพท์|อินเตอร์เน็ต|อินเทอร์เน็ต/],
    [G_ADMIN, 'ค่าน้ำค่าไฟ', /ค่าไฟ|ไฟฟ้า|ประปา/],
    [G_ADMIN, 'ค่าเดินทาง', /เดินทาง|ทางด่วน|ที่พัก/],
    [G_ADMIN, 'ผ่อนชำระรถและเครื่องจักร', /ผ่อน|เครื่องจักร|โฟคลิฟ/],
    [G_ADMIN, 'ค่าซ่อมแซมและยานพาหนะ', /ซ่อม|รถยนต์|vehicle|ประกันรถ/i],
    [G_ADMIN, 'วัสดุและอุปกรณ์สำนักงาน', /อุปกรณ์|office supplies|ทำความสะอาด/i],
    [G_ADMIN, 'ค่าธรรมเนียมและจดทะเบียน', /จดแบรนด์|ขอเอกสาร|จดทะเบียน|หนังสือรับรอง/]
  ];
  // จัดจากชื่อหมวดก่อน ถ้าไม่เข้ากฎใดจึงดูชื่อรายการ
  function groupOf(category, name, nature, cfg, channel) {
    if (nature === 'ex') return { main: G_EX, sub: /สินทรัพย์/.test(category) ? 'ซื้อสินทรัพย์' : /ประกันสังคม/.test(category + name) ? 'เงินสมทบประกันสังคม' : 'ภาษี' };
    const own = cfg.catGroup && cfg.catGroup[category];
    if (own && own.indexOf('|') > 0) return { main: own.split('|')[0], sub: own.split('|')[1] };
    const hit = t => SUB_RULES.find(r => r[2].test(t));
    const r = hit(category || '') || hit(name || '');
    if (r && r[1] === SHIP_SUB) return { main: r[0], sub: channel === 'CJ' ? SHIP_CJ : channel && channel !== SHARED ? SHIP_OTHER : SHIP_SUB };
    return r ? { main: r[0], sub: r[1] } : { main: G_ADMIN, sub: OTHER_SUB };
  }

  // ประเภทรายการหักของ CJ
  const CJ_TYPES = { promoBill: 'ค่าโปร 1 แถม 1 (บิล CJ)', promoAccrual: 'ค่าร่วมโปร (ตั้งประมาณการ)', promo: 'ค่าโปรและส่วนลดอื่น', dc: 'DC fee', cs: 'งบสนับสนุน (Commercial support)', ns: 'ค่าสนับสนุนสาขาใหม่', logistics: 'ขนส่งและค่าลงสินค้า', penalty: 'ค่าปรับ', other: 'อื่น ๆ' };
  function classifyCJ(t) {
    if (/1\s*แถม\s*1|BOGO/i.test(t)) return 'promoBill';
    if (/DC\s*Fee/i.test(t)) return 'dc';
    if (/งบสนับสนุน|commercial/i.test(t)) return 'cs';
    if (/สาขาใหม่/.test(t)) return 'ns';
    if (/ขนส่ง|ลงสินค้า|ค่าตัก|กระจายสินค้า/.test(t)) return 'logistics';
    if (/โปร|premium|ส่วนลด/i.test(t)) return 'promo';
    if (/ปรับ/.test(t)) return 'penalty';
    return 'other';
  }

  function build(files, cfg) {
    files.forEach(f => { f.dup = ''; f.dupNote = ''; f.kept = null; });
    // ไฟล์ชนิดเดียวกันมักมาหลายรุ่น (ไฟล์ export, ไฟล์ที่ลูกค้าแก้, ไฟล์รวม) จึงกันนับซ้ำระดับรายการ:
    // รุ่นที่ลูกค้าใส่คอลัมน์จับคู่มาก่อน ตามด้วยไฟล์ที่ลูกค้าตั้งชื่อเอง แล้วจึงเป็นไฟล์ที่โปรแกรมตั้งชื่อให้
    const isExportName = n => /^[A-Za-z]+_\d{10,}_\w+\.xlsx/i.test(n);
    const rank = f => (f.hasMap ? 2 : 0) + (isExportName(f.file.split('/').pop()) ? 0 : 1);
    const order = kind => files.filter(f => f.used && f.kind === kind).sort((a, b) => rank(b) - rank(a));
    // เดือนที่กำหนดแหล่งหลักไว้: รายการของเดือนนั้นจากไฟล์อื่นไม่ใช้ (ไฟล์ export ใหม่ที่ลูกค้าคีย์ตามหลักแล้วแทนไฟล์รุ่นเก่า)
    const msrc = cfg.monthSource || {};
    const isSrc = (f, m) => !msrc[m] || f.name.indexOf(msrc[m]) >= 0;
    const docMonth = {}; files.forEach(f => { if (f.used && (f.kind === 'sales' || f.kind === 'purchases')) f.lines.forEach(l => { if (l.doc && l.month && !docMonth[l.doc]) docMonth[l.doc] = l.month; }); });
    const lineMonth = l => l.month || docMonth[l.doc] || '';
    const take = (kind, keyOf, byDoc) => {
      const owner = new Map(), out = [];
      order(kind).forEach(f => {
        const cnt = {}; let kept = 0; const from = {}; let replaced = 0;
        f.lines.forEach(l => {
          const lm = lineMonth(l); if (lm && !isSrc(f, lm)) { replaced++; return; }
          let k = keyOf(l);
          if (!byDoc) { cnt[k] = (cnt[k] || 0) + 1; k += '#' + cnt[k]; } // รายการเหมือนกันในไฟล์เดียวกันไม่ถือว่าซ้ำ
          const o = owner.get(k);
          if (o && o !== f) { from[o.name] = 1; return; }
          owner.set(k, f); l.file = f.name; out.push(l); kept++;
        });
        f.kept = kept;
        const skipped = f.lines.length - kept - replaced, src = Object.keys(from).join(', ');
        const rep = replaced ? `${replaced} บรรทัดเป็นเดือนที่ใช้ไฟล์ export ชุดใหม่แทน` : '';
        if (!kept && f.lines.length) { f.dup = src || 'ไฟล์ export ชุดใหม่'; f.dupNote = (src ? `ซ้ำกับ ${src}` : '') + (src && rep ? ' · ' : '') + (rep ? rep : ' ทั้งไฟล์ ใช้ไฟล์นั้นแทน'); }
        else if (skipped || replaced) f.dupNote = `ใช้ ${kept} บรรทัด` + (skipped ? ` · อีก ${skipped} บรรทัดซ้ำกับ ${src}` : '') + (rep ? ' · ' + rep : '');
      });
      return out;
    };
    // เอกสารที่ถูกยกเลิกในไฟล์รุ่นใดรุ่นหนึ่ง ถือว่ายกเลิก (ไฟล์ที่ export ทีหลังอาจยกเลิกเพิ่มจากไฟล์ที่ลูกค้าส่งมาก่อน)
    const cancelMap = new Map();
    order('sales').forEach(f => (f.cancelledDocs || []).forEach(c => { if (isSrc(f, c.month) && !cancelMap.has(c.doc)) cancelMap.set(c.doc, Object.assign({ file: f.name }, c)); }));
    const saleLines = take('sales', l => l.doc, true).filter(l => !cancelMap.has(l.doc)).concat(take('returns', l => l.doc, true));
    const expLines = take('expenses', l => l.month + '|' + l.name + '|' + l.amount.toFixed(2));
    const ordLines = take('orderExp', l => l.doc + '|' + l.name + '|' + l.amount.toFixed(2));
    const purchases = take('purchases', l => l.doc, true);
    const purchaseExp = take('purchaseExp', l => l.doc + '|' + l.name + '|' + l.amount.toFixed(2));
    const live = k => files.filter(f => f.used && f.kind === k && !f.dup);
    order('sales').concat(order('returns')).forEach(f => { if (f.learned) Object.keys(f.learned).forEach(r => { if (!(r in cfg.channelMap)) cfg.channelMap[r] = f.learned[r]; }); });

    // สต๊อก: เก็บเป็นภาพรายเดือน ต้นทุนของเดือนไหนใช้ภาพที่ใกล้เดือนนั้นที่สุด
    const snaps = {}; live('stock').forEach(f => { const m = f.month || 'ไม่ระบุ'; snaps[m] = snaps[m] || {}; f.lines.forEach(s => snaps[m][s.sku] = s); });
    const snapMonths = Object.keys(snaps).sort();
    const mi = m => +m.slice(0, 4) * 12 + +m.slice(5);
    const snapFor = month => { if (!snapMonths.length) return {}; const d = m => /^\d{4}-\d{2}$/.test(m) ? Math.abs(mi(m) - mi(month)) : 99; return snaps[snapMonths.slice().sort((a, b) => d(a) - d(b))[0]]; };
    // ต้นทุน: (1) ที่แก้เอง (2) ตารางต้นทุนถัวเฉลี่ยรายงวดของสำนักงาน (3) ต้นทุนในไฟล์สต๊อกของโปรแกรมขาย
    const costTab = {}, recon = {}, office = {};
    live('costTable').forEach(f => f.lines.forEach(l => {
      office[l.month] = 1; if (l.cost > 0) (costTab[l.month] || (costTab[l.month] = {}))[l.sku] = l.cost;
      if (l.openQty != null) (recon[l.month] || (recon[l.month] = {}))[l.sku] = Object.assign({ src: 'office', file: f.name }, l);
    }));
    // รายการซื้อรายบรรทัด: มูลค่าหลังส่วนลดท้ายใบ + ค่าใช้จ่ายนำเข้าของใบนั้นปันตามมูลค่าสินค้า (วิธีเดียวกับ Purchase Report ของสำนักงาน)
    const feeSkus = cfg.purchaseFeeSkus || [], buyLines = [];
    purchases.forEach(p => {
      if (!p.items || !p.items.length) return;
      const goods = p.items.filter(i => !feeSkus.includes(i.sku)), fee = p.items.filter(i => feeSkus.includes(i.sku)).reduce((t, i) => t + i.total, 0);
      const gsum = goods.reduce((t, i) => t + i.total, 0), f = gsum && p.preVat ? (p.preVat - fee) / gsum : 1;
      const exp = fee + purchaseExp.filter(x => x.doc === p.doc).reduce((t, x) => t + x.amount, 0);
      const bm = (cfg.purchaseMonth || {})[p.doc] || p.month;
      goods.forEach(i => buyLines.push({ month: bm, docMonth: p.month, doc: p.doc, sku: i.sku || i.name, name: i.name, qty: i.qty, val: i.total * f, alloc: gsum ? exp * i.total / gsum : 0, file: p.file }));
    });
    // เดือนที่สำนักงานยังไม่ได้ทำตารางต้นทุน แต่มีรายงานสินค้าเคลื่อนไหว: คำนวณต้นทุนถัวเฉลี่ยของงวดเอง
    // ยอดยกมา (ปลายงวดก่อน) + ซื้อเข้ารวมค่าใช้จ่าย = พร้อมขาย → ต้นทุนถัวเฉลี่ย → หักคงเหลือสิ้นเดือน = จำนวนขาย/ปรับปรุง
    const mv = {}; live('movement').forEach(f => { if (!f.month || !isSrc(f, f.month)) return; mv[f.month] = mv[f.month] || { file: f.name, rows: {} }; f.lines.forEach(l => { mv[f.month].rows[l.sku || l.name] = l; }); });
    const prevM = m => { const d = new Date(+m.slice(0, 4), +m.slice(5) - 2, 15); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
    Object.keys(mv).sort().forEach(m => {
      const prev = recon[prevM(m)]; if (office[m] || !prev) return;
      const buy = {}; buyLines.filter(b => b.month === m).forEach(b => { const x = buy[b.sku] || (buy[b.sku] = { qty: 0, val: 0, alloc: 0, name: b.name }); x.qty += b.qty; x.val += b.val; x.alloc += b.alloc; });
      const keys = [...new Set(Object.keys(prev).filter(k => prev[k].closeQty || prev[k].cost).concat(Object.keys(buy), Object.keys(mv[m].rows)))].sort();
      recon[m] = {}; costTab[m] = {};
      keys.forEach(k => {
        const p = prev[k], b = buy[k] || { qty: 0, val: 0, alloc: 0 }, w = mv[m].rows[k];
        const openQty = p ? p.closeQty : 0, pc = p ? p.cost : 0, openVal = p ? (pc > 0 ? p.closeQty * pc : (p.closeVal || 0)) : 0;   // ยกมาด้วยต้นทุนถัวเฉลี่ยของงวดก่อน (วิธีเดียวกับตารางสำนักงาน)
        const availQty = openQty + b.qty, availVal = openVal + b.val + b.alloc;
        const cost = availQty > 0 && availVal > 0 ? availVal / availQty : pc;
        const closeQty = w ? w.close : availQty, soldQty = availQty - closeQty;
        recon[m][k] = { src: 'calc', month: m, sku: k, name: (w && w.name) || (p && p.name) || b.name || '', cost, prevCost: pc, openQty, openVal, buyQty: b.qty, buyVal: b.val, alloc: b.alloc, closeQty, closeVal: closeQty * cost, soldQty, cogs: soldQty * cost, noMove: !w, mvIn: w ? w.inQty : null, mvOut: w ? w.outQty : null, file: mv[m].file };
        if (cost > 0) costTab[m][k] = cost;
      });
    });
    const costMonths = Object.keys(costTab).sort();
    const costOf = (sku, month) => { if (cfg.cost[sku] != null && cfg.cost[sku] !== '') return +cfg.cost[sku]; if (costTab[month] && costTab[month][sku]) return costTab[month][sku]; const pm = costMonths.filter(x => x < month && costTab[x][sku]).pop(); if (pm) return costTab[pm][sku]; const s = snapFor(month)[sku]; return s ? (s.cost || s.avgBuy || 0) : 0; };

    const unmappedCh = new Set(), noCost = {}, docIx = {}, sales = [], docs = [];
    saleLines.forEach(l => {
      if (!(l.rawChannel in cfg.channelMap)) unmappedCh.add(l.rawChannel);
      // กฎตามชื่อลูกค้า (เก็บผลไว้ที่บรรทัด เพราะชุดข้อมูลบนเว็บตัดชื่อลูกค้าออก)
      if (l.customer) { const ru = (cfg.channelRules || []).find(x => (!x.raw || x.raw === l.rawChannel) && x.customer && l.customer.indexOf(x.customer) >= 0); l.ruleCh = ru ? ru.to : ''; }
      const channel = l.ruleCh || cfg.channelMap[l.rawChannel] || l.rawChannel;
      const ret = l.kind === 'return';
      // รับคืน: ลดยอดขายเสมอ และลดจำนวน/ต้นทุนด้วย (ของกลับเข้าสต๊อกหรือไม่ได้ออกจริง) ยกเว้นของเสียหาย/ทำลายทิ้ง ซึ่งยังเป็นต้นทุนของบริษัท
      const qty = ret ? (/เสียหาย|ทำลาย|ชำรุด/.test(l.note) ? 0 : -l.qty) : l.qty;
      const cost = costOf(l.sku, l.month); if (!cost && qty) (noCost[l.month] || (noCost[l.month] = new Set())).add(l.sku);
      const dq = l.docQty != null ? l.docQty : l.qty;
      sales.push({ file: l.file, month: l.month, doc: l.doc, channel, sku: l.sku, name: l.name, qty, docQty: ret ? -dq : dq, revenue: ret ? -l.revenue : l.revenue, cogs: qty * cost, ret, note: ret ? l.note : '' });
      if (!ret) docIx[l.doc] = { channel, month: l.month };
      if (l.first && l.date) docs.push({ doc: l.doc, date: l.date, month: l.month, channel, value: ret ? -l.value : l.value, payDate: l.payDate, ret });
    });

    const unmappedPrefix = new Set(), expenses = []; const orphan = { n: 0, amt: 0 };
    expLines.forEach(e => {
      if (!(e.prefix in cfg.prefixMap)) unmappedPrefix.add(e.prefix || '(ไม่มีรหัสนำหน้า)');
      const channel = cfg.prefixMap[e.prefix] || SHARED;
      // ลักษณะต้นทุน: ที่ตั้งเอง > คอลัมน์ที่สำนักงานเติมในไฟล์ > รหัส FC (fixed cost) > เดาจากชื่อหมวด
      let nature = cfg.catNature[e.category] || e.hint || (e.prefix === 'FC' ? 'fix' : guessNature(e.category));
      const text = e.category + ' ' + e.name;
      if (channel === EXCLUDE || (!cfg.catNature[e.category] && (EX_RE.test(e.category) || (cfg.excludeWords || []).some(w => w && text.indexOf(w) >= 0)))) nature = 'ex';   // ภาษี สินทรัพย์ และคำที่ตั้งไว้ ไม่นับ แม้ไฟล์จะระบุลักษณะต้นทุนมา
      // รายการที่นับเป็นค่าใช้จ่ายเพียงบางส่วน (เช่น เงินสมทบประกันสังคมที่จ่ายรวมส่วนลูกจ้าง)
      const part = nature !== 'ex' ? (cfg.partialWords || []).find(x => x.word && text.indexOf(x.word) >= 0) : null;
      let amount = e.amount, partNote = '';
      if (part) { amount = e.amount * (+part.pct || 0) / 100; partNote = ` (นับ ${part.pct}% จาก ${e.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })})`; nature = 'fix'; }
      const g = groupOf(e.category, e.name, nature, cfg, channel);
      expenses.push({ file: e.file, month: e.month, channel, nature, category: e.category, name: e.name + partNote, amount, fullAmount: e.amount, source: e.source, payDate: e.payDate, payStatus: e.payStatus,
        main: g.main, sub: g.sub, pool: channel === SHARED ? ((cfg.noCJ || []).some(w => w && text.indexOf(w) >= 0) ? 'noCJ' : 'all') : '',
        cjType: channel === 'CJ' ? classifyCJ(e.name + ' ' + e.category) : '' });
    });
    ordLines.forEach(e => {
      const d = docIx[e.doc]; if (!d) { orphan.n++; orphan.amt += e.amount; return; }
      expenses.push({ file: e.file, month: d.month, channel: d.channel, nature: 'var', category: 'ค่าขนส่ง (ผูกใบขาย)', name: e.name, amount: e.amount, source: 'ผูกใบขาย', doc: e.doc, main: G_SELL, sub: d.channel === 'CJ' ? SHIP_CJ : SHIP_OTHER, pool: '', cjType: d.channel === 'CJ' ? 'logistics' : '' });
    });

    // เดือนที่ไม่มีไฟล์ค่าใช้จ่ายผูกใบขาย: ใช้ค่าขนส่งที่สำนักงานลงไว้ตามช่องทางใน Report แทน (ข้ามบรรทัดที่ยอดตรงกับไฟล์ดิบ กันนับซ้ำ)
    const officeLines = take('officeExp', l => l.month + '|' + l.name + '|' + l.detail + '|' + l.amount.toFixed(2));
    const hasOrd = {}; expenses.forEach(e => { if (e.source === 'ผูกใบขาย') hasOrd[e.month] = 1; });
    const salesMonths = {}; sales.forEach(s => { salesMonths[s.month] = 1; });
    const rawAmt = {}; expenses.forEach(e => { const k = e.month + '|' + e.amount.toFixed(2); rawAmt[k] = (rawAmt[k] || 0) + 1; });
    officeLines.forEach(l => {
      if (hasOrd[l.month] || !salesMonths[l.month] || l.category !== 'ค่าขนส่ง' || !l.channel || /^(shared|tax)$/i.test(l.channel)) return;
      const k = l.month + '|' + l.amount.toFixed(2); if (rawAmt[k]) { rawAmt[k]--; return; }
      expenses.push({ file: l.file, month: l.month, channel: l.channel, nature: 'var', category: 'ค่าขนส่ง (จาก Report สำนักงาน)', name: l.name + (l.detail ? ' · ' + l.detail : ''), amount: l.amount, source: 'Report สำนักงาน', main: G_SELL, sub: l.channel === 'CJ' ? SHIP_CJ : SHIP_OTHER, pool: '', cjType: l.channel === 'CJ' ? 'logistics' : '' });
    });

    const cnt = {}; sales.forEach(s => { if (!s.ret) cnt[s.month] = (cnt[s.month] || 0) + 1; });
    const months = Object.keys(cnt).filter(Boolean).sort();
    const summary = {}, detailValue = {};
    live('salesSummary').forEach(f => Object.keys(f.byMonth).forEach(m => { if (!isSrc(f, m)) return; summary[m] = (summary[m] || 0) + f.byMonth[m]; }));
    live('sales').forEach(f => { if (f.kept === f.lines.length) Object.keys(f.valueByMonth).forEach(m => { detailValue[m] = (detailValue[m] || 0) + f.valueByMonth[m]; }); });
    live('returns').forEach(f => { if (f.kept === f.lines.length) Object.keys(f.valueByMonth).forEach(m => { detailValue[m] = (detailValue[m] || 0) - f.valueByMonth[m]; }); });
    const noCostOut = {}; Object.keys(noCost).forEach(m => { noCostOut[m] = [...noCost[m]]; });
    const wh = {}; live('cjWarehouse').forEach(f => f.lines.forEach(l => { (wh[l.month] || (wh[l.month] = {}))[l.wh] = l.sales; }));
    const truck = {}; live('truckRates').forEach(f => f.lines.forEach(l => { if (l.perBag) (truck[l.wh] || (truck[l.wh] = {}))[l.type] = l; }));
    const cancelledDocs = [...cancelMap.values()].map(c => Object.assign({}, c, { channel: cfg.channelMap[c.rawChannel] || c.rawChannel }));
    return { wh, truck, sales, expenses, docs, purchases, purchaseExp, snapFor, snapMonths, costOf, months, mainMonth: months[months.length - 1] || '', recon, buyLines, cancelledDocs,
      has: m => ({ costCalc: !!(recon[m] && !office[m]), expenses: expenses.some(e => e.month === m && e.source === 'รายจ่ายอื่น'), orderExp: expenses.some(e => e.month === m && e.source === 'ผูกใบขาย'), fill: expenses.some(e => e.month === m && e.source === 'Report สำนักงาน'), stock: snapMonths.includes(m), cost: !!office[m], costFrom: costTab[m] ? m : (costMonths.filter(x => x < m).pop() || '') }),
      checks: { unmappedCh: [...unmappedCh], unmappedPrefix: [...unmappedPrefix], noCost: noCostOut, orphan, summary, detailValue,
        cancelled: cancelMap.size, dups: files.filter(f => f.dup) } };
  }

  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);

  // รายการค่าใช้จ่ายของเดือนตามวิธีรับรู้ค่าโปร
  function expensesFor(model, cfg, month, mode) {
    let ex = model.expenses.filter(e => e.month === month && e.nature !== 'ex');
    if (mode === 'accrual') {
      ex = ex.filter(e => e.cjType !== 'promoBill');
      const q = sum(model.sales.filter(s => s.month === month && s.channel === 'CJ' && cfg.promo.skus.includes(s.sku)), s => s.qty);
      if (q) ex.push({ month, channel: 'CJ', nature: 'var', category: 'ค่าร่วมโปร (ตั้งประมาณการ)', name: `${cfg.promo.rate} บาท x ${q.toLocaleString()} ถุง`, amount: q * cfg.promo.rate, source: 'สูตร', main: G_SELL, sub: SUB_RULES[0][1], pool: '', cjType: 'promoAccrual' });
    }
    if (mode !== 'accrual') cfg.promoRounds.filter(a => a.month === month).forEach(a => ex.push({ month, channel: 'CJ', nature: 'var', category: 'ค่าโปร 1 แถม 1 (กรอกจากใบแจ้งหนี้)', name: a.label, amount: +a.amount || 0, source: 'กรอกเอง', main: G_SELL, sub: SUB_RULES[0][1], pool: '', cjType: 'promoBill' }));
    cfg.adjustments.filter(a => a.month === month).forEach(a => ex.push({ month, channel: a.channel, nature: a.nature || 'var', category: 'รายการปรับปรุง', name: a.label, amount: +a.amount || 0, source: 'ปรับปรุง', main: G_ADMIN, sub: 'รายการปรับปรุงของสำนักงาน', pool: a.channel === SHARED ? 'all' : '', cjType: a.channel === 'CJ' ? 'other' : '' }));
    return ex;
  }

  function compute(model, cfg, month, mode) {
    mode = mode || cfg.promo.mode;
    const sl = model.sales.filter(s => s.month === month); const ex = expensesFor(model, cfg, month, mode);
    const ch = {};
    const get = c => ch[c] || (ch[c] = { channel: c, revenue: 0, qty: 0, cogs: 0, direct: 0 });
    sl.forEach(s => { const c = get(s.channel); c.revenue += s.revenue; c.qty += s.qty; c.cogs += s.cogs; });
    ex.filter(e => e.channel !== SHARED).forEach(e => { get(e.channel).direct += e.amount; });
    const shared = sum(ex.filter(e => e.channel === SHARED), e => e.amount);
    const revenue = sum(Object.values(ch), c => c.revenue);
    // ส่วนกลาง 2 กอง: กองที่ปันทุกช่องทางตามรายได้ และกองที่ไม่เกี่ยวกับ CJ ปันเฉพาะช่องทางอื่นตามรายได้
    const revNo = revenue - (ch.CJ ? ch.CJ.revenue : 0);
    const sharedNo = revNo > 0 ? sum(ex.filter(e => e.channel === SHARED && e.pool === 'noCJ'), e => e.amount) : 0, sharedAll = shared - sharedNo;
    const channels = Object.values(ch).map(c => {
      const gp = c.revenue - c.cogs, contrib = gp - c.direct, alloc = (revenue ? sharedAll * c.revenue / revenue : 0) + (c.channel !== 'CJ' && revNo > 0 ? sharedNo * c.revenue / revNo : 0);
      return Object.assign(c, { gp, gm: c.revenue ? gp / c.revenue : 0, contrib, contribPct: c.revenue ? contrib / c.revenue : 0, share: revenue ? c.revenue / revenue : 0, alloc, net: contrib - alloc, netPct: c.revenue ? (contrib - alloc) / c.revenue : 0 });
    }).sort((a, b) => b.revenue - a.revenue);
    const cogs = sum(channels, c => c.cogs), varExp = sum(ex.filter(e => e.nature === 'var'), e => e.amount), fixExp = sum(ex.filter(e => e.nature === 'fix'), e => e.amount);
    const cats = {}; ex.forEach(e => { const k = (e.main || G_ADMIN) + '|' + (e.sub || OTHER_SUB); (cats[k] || (cats[k] = { main: e.main || G_ADMIN, sub: e.sub || OTHER_SUB, amount: 0 })).amount += e.amount; });
    return { month, mode, channels, shared, sharedAll, sharedNo, expenses: ex, categories: Object.values(cats).sort((a, b) => GROUPS.indexOf(a.main) - GROUPS.indexOf(b.main) || b.amount - a.amount),
      totals: { revenue, cogs, gp: revenue - cogs, gm: revenue ? (revenue - cogs) / revenue : 0, varExp, fixExp, contribution: revenue - cogs - varExp, op: revenue - cogs - varExp - fixExp } };
  }

  // กำไร CJ: scope = null (ทุก SKU) หรือรายการ SKU
  function cjDetail(model, cfg, month, mode, scope) {
    mode = mode || cfg.promo.mode;
    const all = model.sales.filter(s => s.month === month && s.channel === 'CJ');
    const inS = s => !scope || scope.includes(s.sku);
    const S = all.filter(inS);
    const rev = sum(all, s => s.revenue), qty = sum(all, s => s.qty);
    const revS = sum(S, s => s.revenue), qtyS = sum(S, s => s.qty), cogsS = sum(S, s => s.cogs);
    const promoQty = sum(all.filter(s => cfg.promo.skus.includes(s.sku)), s => s.qty);
    const promoQtyS = sum(S.filter(s => cfg.promo.skus.includes(s.sku)), s => s.qty);
    const ex = expensesFor(model, cfg, month, mode).filter(e => e.channel === 'CJ');
    const by = {}; ex.forEach(e => { by[e.cjType] = (by[e.cjType] || 0) + e.amount; });
    const rs = rev ? revS / rev : 0, qs = qty ? qtyS / qty : 0, ps = promoQty ? promoQtyS / promoQty : 0;
    const part = { tta: ((by.dc || 0) + (by.cs || 0) + (by.ns || 0)) * rs, promoMain: ((by.promoBill || 0) + (by.promoAccrual || 0)) * ps, promoOther: ((by.promo || 0) + (by.penalty || 0) + (by.other || 0)) * rs, logistics: (by.logistics || 0) * qs };
    const profit = revS - part.tta - part.promoMain - part.promoOther - cogsS - part.logistics;
    const u = v => qtyS ? v / qtyS : 0;
    return { rev, qty, revS, qtyS, cogsS, by, part, profit, profitPct: revS ? profit / revS : 0, lines: ex,
      unit: { price: u(revS), tta: u(part.tta), promoMain: u(part.promoMain), promoOther: u(part.promoOther), cogs: u(cogsS), logistics: u(part.logistics), profit: u(profit) },
      ttaCheck: [['cs', cfg.tta.cs], ['ns', cfg.tta.ns], ['dc', cfg.tta.dc]].map(([k, r]) => ({ key: k, label: CJ_TYPES[k], rate: r, expected: sum(all.filter(s => !s.ret), s => s.revenue) * r / 100, actual: by[k] || 0 })) };
  }

  function skuTable(model, month, channel) {
    const m = {}, stock = model.snapFor(month);
    model.sales.filter(s => s.month === month && (!channel || s.channel === channel)).forEach(s => {
      const r = m[s.sku] || (m[s.sku] = { sku: s.sku, name: s.name, qty: 0, revenue: 0, cogs: 0, cjQty: 0, cjRev: 0 });
      r.qty += s.qty; r.revenue += s.revenue; r.cogs += s.cogs; if (s.channel === 'CJ') { r.cjQty += s.qty; r.cjRev += s.revenue; }
    });
    return Object.values(m).map(r => { const st = stock[r.sku]; return Object.assign(r, { cost: model.costOf(r.sku, month), gp: r.revenue - r.cogs, gm: r.revenue ? (r.revenue - r.cogs) / r.revenue : 0, stockQty: st ? st.qty : null, stockValue: st ? st.value : null, days: st && r.qty > 0 ? st.qty / (r.qty / 30) : null }); }).sort((a, b) => b.revenue - a.revenue);
  }

  // แนวโน้มรายเดือน
  function trend(model, cfg, mode) {
    return model.months.map(m => {
      const r = compute(model, cfg, m, mode), cj = r.channels.find(c => c.channel === 'CJ') || { revenue: 0, direct: 0, contrib: 0, share: 0, gm: 0, qty: 0 };
      const all = cjDetail(model, cfg, m, mode, null), p = cjDetail(model, cfg, m, mode, cfg.promo.skus);
      const promo = (all.by.promoBill || 0) + (all.by.promoAccrual || 0) + (all.by.promo || 0), tta = (all.by.dc || 0) + (all.by.cs || 0) + (all.by.ns || 0);
      return { month: m, has: model.has(m), cogs: r.totals.cogs, gp: r.totals.gp, varExp: r.totals.varExp, fixExp: r.totals.fixExp, cjCogs: cj.cogs || 0,
        revenue: r.totals.revenue, gm: r.totals.gm, op: r.totals.op, cjRev: cj.revenue, cjShare: cj.share, cjQty: cj.qty, cjGm: cj.gm,
        cjPromo: promo, cjTta: tta, cjLogi: all.by.logistics || 0, cjDirect: cj.direct, cjContrib: cj.contrib, cjContribPct: cj.revenue ? cj.contrib / cj.revenue : 0,
        promoQty: p.qtyS, unit: p.unit };
    });
  }

  const mk = d => d ? d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') : '';
  const nextM = (m, n) => mk(new Date(+m.slice(0, 4), +m.slice(5) - 1 + n, 15));
  const AD_RE = /ads|โฆษณา|การตลาด|meta|boost|ส่งเสริมการขาย/i;

  // จุดคุ้มทุน: ยอดขายที่กำไรส่วนเกินพอดีกับค่าใช้จ่ายคงที่
  function breakeven(model, cfg, month, mode) {
    const r = compute(model, cfg, month, mode), t = r.totals;
    const cj = r.channels.find(c => c.channel === 'CJ') || { revenue: 0, cogs: 0 };
    const cjVar = sum(r.expenses.filter(e => e.channel === 'CJ' && e.nature === 'var'), e => e.amount);
    const cm = t.contribution, cmr = t.revenue ? cm / t.revenue : 0;
    const revN = t.revenue - cj.revenue, cmN = cm - (cj.revenue - cj.cogs - cjVar), cmrN = revN ? cmN / revN : 0;
    return { month, revenue: t.revenue, fixed: t.fixExp, cm, cmr, be: cmr > 0 ? t.fixExp / cmr : null, safety: cmr > 0 && t.revenue ? 1 - (t.fixExp / cmr) / t.revenue : null,
      cjRev: cj.revenue, cjCm: cj.revenue - cj.cogs - cjVar, revN, cmN, cmrN, beN: cmrN > 0 ? t.fixExp / cmrN : null, op: t.op };
  }

  // ช่องทางที่ไม่ใช่ CJ รายเดือน
  function channelTrend(model, cfg, mode) {
    const data = {}, tot = {};
    model.months.forEach(m => {
      const r = compute(model, cfg, m, mode);
      r.channels.filter(c => c.channel !== 'CJ').forEach(c => {
        const ex = r.expenses.filter(e => e.channel === c.channel);
        const ads = sum(ex.filter(e => AD_RE.test(e.name + ' ' + e.category)), e => e.amount);
        (data[c.channel] || (data[c.channel] = {}))[m] = { revenue: c.revenue, gm: c.gm, direct: c.direct, ads, ship: c.direct - ads, contrib: c.contrib, contribPct: c.contribPct };
        tot[c.channel] = (tot[c.channel] || 0) + c.revenue;
      });
    });
    return { months: model.months, channels: Object.keys(tot).sort((a, b) => tot[b] - tot[a]), data };
  }

  // รอบโปร: เดือนที่มีบิลค่าโปร 1 แถม 1 เทียบกับเดือนที่ไม่มี
  function promoRounds(model, cfg) {
    const info = model.months.map(m => { const d = cjDetail(model, cfg, m, 'actual', cfg.promo.skus); return { month: m, d, bill: d.part.promoMain, names: d.lines.filter(e => e.cjType === 'promoBill').map(e => e.name) }; });
    const base = info.filter(x => !x.bill && x.d.qtyS > 0);
    const baseQty = base.length ? sum(base, x => x.d.qtyS) / base.length : 0;
    return { baseMonths: base.map(x => x.month), baseQty, rounds: info.filter(x => x.bill > 0).map(x => {
      const u = x.d.unit, before = u.profit + u.promoMain, extra = x.d.qtyS - baseQty;
      return { month: x.month, names: x.names, qty: x.d.qtyS, bill: x.bill, perBag: u.promoMain, before, after: u.profit, extra, extraGain: extra * before, net: extra * before - x.bill,
        profitWith: x.d.qtyS * u.profit, profitWithout: baseQty * before };
    }) };
  }

  // เงินสดรายเดือน (ประมาณการจากวันครบกำหนดและวันที่จ่ายในไฟล์)
  function cash(model, cfg, asOf) {
    const first = model.months[0], last = model.months[model.months.length - 1]; if (!first) return { rows: [] };
    const months = []; for (let m = first; m <= nextM(last, 3); m = nextM(m, 1)) months.push(m);
    const R = {}; months.forEach(m => { R[m] = { month: m, known: m <= last, est: false, cjIn: 0, cjDeduct: 0, otherIn: 0, buy: 0, exp: 0 }; });
    const lag = Math.round((+cfg.cjCreditDays || 0) / 30);
    const add = (m, k, v) => { if (R[m]) R[m][k] += v; };
    asOf = asOf || last; let cjOpen = 0, cjOpenDeduct = 0; const dueMonths = {};
    model.docs.forEach(d => {
      if (d.channel === 'CJ') { const due = mk(new Date(d.date.getTime() + (+cfg.cjCreditDays || 0) * 864e5)); add(due, 'cjIn', d.value); if (d.month <= asOf && due > asOf) { cjOpen += d.value; dueMonths[due] = 1; } }
      else { const p = mk(d.payDate); add(p && p >= d.month ? p : d.month, 'otherIn', d.value); }
    });
    // เดือนที่ไม่มีไฟล์ขาย: ใช้ยอดขาย CJ รายเดือนจากไฟล์สรุปแยกคลังของลูกค้า (บวก VAT 7%) แทน
    Object.keys(model.wh).forEach(m => { if (model.months.includes(m)) return; const due = nextM(m, lag); if (!R[due]) return; const v = sum(Object.keys(model.wh[m]), k => model.wh[m][k]) * 1.07; R[due].cjIn += v; R[due].cjEst = (R[due].cjEst || 0) + v; R[due].est = true; });
    const ex = model.expenses.concat(cfg.promoRounds.map(a => ({ month: a.month, channel: 'CJ', source: 'กรอกเอง', cjType: 'promoBill', amount: +a.amount || 0, payDate: null })));
    const inst = Math.max(1, Math.round(+cfg.promoInst || 1));
    ex.forEach(e => {
      const cjBill = e.channel === 'CJ' && e.source !== 'ผูกใบขาย';   // รายการที่ CJ หักจากเงินที่จ่ายเรา
      const p = mk(e.payDate), m = p && p >= e.month ? p : (cjBill ? nextM(e.month, 1) : e.month);
      // บิลค่าโปร 1 แถม 1: CJ แบ่งหักเป็นงวดรายเดือน เริ่มเดือนถัดจากวันที่ในไฟล์
      if (cjBill && e.cjType === 'promoBill' && inst > 1) {
        for (let k = 1; k <= inst; k++) { const mm = nextM(m, k); add(mm, 'cjDeduct', e.amount / inst); if (e.month <= asOf && mm > asOf) cjOpenDeduct += e.amount / inst; }
        return;
      }
      add(m, cjBill ? 'cjDeduct' : 'exp', e.amount);
      if (cjBill && e.month <= asOf && m > asOf) cjOpenDeduct += e.amount;
    });
    model.purchases.forEach(p => { const m = mk(p.payDate) || p.month; add(m, 'buy', p.value); });
    model.purchaseExp.forEach(p => add(mk(p.payDate), 'buy', p.amount));
    const rows = months.map(m => { const r = R[m]; r.cjNet = r.cjIn - r.cjDeduct; r.net = r.cjNet + r.otherIn - r.buy - r.exp; return r; });
    const firstFull = nextM(first, lag); rows.forEach(r => { r.cjMissing = r.month < firstFull && !r.est; });
    return { rows, last, asOf, cjOpen, cjOpenDeduct, dueMonths: Object.keys(dueMonths).sort() };
  }

  // กำไรต่อถุงแยกคลัง CJ: ใช้ค่ารถ 10 ล้อ (อัตราสูงสุด) ของแต่ละคลังแทนค่าขนส่งเฉลี่ย
  function warehouses(model, cfg, month, mode) {
    const w = model.wh[month]; if (!w) return null;
    const d = cjDetail(model, cfg, month, mode, cfg.promo.skus), pre = d.unit.profit + d.unit.logistics, tot = sum(Object.keys(w), k => w[k]);
    return { pre, avgLogi: d.unit.logistics, rows: Object.keys(w).map(k => { const t = (model.truck[k] || {})['10 ล้อ']; return { wh: k, sales: w[k], share: tot ? w[k] / tot : 0, truck: t ? t.perBag : null, trip: t ? t.trip : null, profit: t ? pre - t.perBag : null }; }).sort((a, b) => b.sales - a.sales) };
  }

  // ประมาณการเงินสด 3 เดือนข้างหน้า: รายการที่รู้แล้ว (ใบกำกับที่ออกแล้ว ส่วนที่ CJ จะหัก รายจ่ายที่มีกำหนดจ่าย) + สมมติฐานยอดขายและรายจ่ายต่อเดือน
  function forecast(model, cfg) {
    const C = cash(model, cfg), last = C.last; if (!last) return null;
    const known = C.rows.filter(r => r.known), k3 = known.slice(-3), avg = (a, f) => a.length ? sum(a, f) / a.length : 0;
    const tr = model.months.map(m => { const r = compute(model, cfg, m, 'actual'), cj = r.channels.find(c => c.channel === 'CJ') || { revenue: 0 }, d = cjDetail(model, cfg, m, 'actual', null); return { cj: cj.revenue, other: r.totals.revenue - cj.revenue, bill: d.by.promoBill || 0 }; });
    const normal = tr.filter(t => !t.bill);
    const auto = { open: +cfg.cashOpen || 0, cjSales: avg(normal.length ? normal : tr, t => t.cj), otherSales: avg(tr.slice(-3), t => t.other), buy: avg(k3, r => r.buy), exp: avg(k3, r => r.exp), promo: 0 };
    const a = Object.assign({}, auto); Object.keys(cfg.fc || {}).forEach(k => { if (cfg.fc[k] !== '' && cfg.fc[k] != null && isFinite(+cfg.fc[k])) a[k] = +cfg.fc[k]; });
    const lag = Math.round((+cfg.cjCreditDays || 0) / 30), tta = (cfg.tta.cs + cfg.tta.ns + cfg.tta.dc) / 100;
    const byM = {}; C.rows.forEach(r => { byM[r.month] = r; });
    let bal = a.open;
    const rows = [1, 2, 3].map((n, i) => {
      const m = nextM(last, n), k = byM[m] || { cjIn: 0, cjDeduct: 0, otherIn: 0, buy: 0, exp: 0 };
      const cjNew = i - lag >= 0 ? a.cjSales * 1.07 : 0;            // ยอดขายเดือนที่คาดการณ์ ครบกำหนดหลังเครดิต
      const cjDedNew = (i >= 1 ? a.cjSales * tta : 0) + a.promo;     // ส่วนที่หักตามสัญญาของยอดขายเดือนก่อน + ค่าโปรที่คาด
      const buyAll = Math.max(k.buy, a.buy), expAll = Math.max(k.exp, a.exp); // รายจ่ายที่รู้แล้วเป็นส่วนหนึ่งของแผน ไม่บวกซ้ำ
      const net = k.cjIn + cjNew - k.cjDeduct - cjDedNew + k.otherIn + a.otherSales - buyAll - expAll;
      const open = bal; bal += net;
      return { month: m, known: false, open, cjIn: k.cjIn, cjNew, cjDeduct: k.cjDeduct, cjDedNew, otherIn: k.otherIn, otherNew: a.otherSales, buyAll, expAll, net, close: bal };
    });
    const min = rows.slice().sort((x, y) => x.close - y.close)[0];
    return { auto, a, rows, min, last };
  }

  g.Engine = { DEFAULT_CFG, SHARED, EXCLUDE, CJ_TYPES, GROUPS, groupOf, build, compute, cjDetail, skuTable, trend, breakeven, channelTrend, promoRounds, cash, forecast, warehouses, guessNature };
})(window);
