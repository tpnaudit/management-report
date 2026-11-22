/* export.js — ส่งออก Excel หลาย Tab มีสูตรเชื่อมจากหน้าสรุปไปถึงข้อมูลรายบรรทัด เพื่อไล่ที่มาของตัวเลขแต่ละเดือน */
(function (g) {
  'use strict';
  const TEAL = 'FF0E5E6F', TINT = 'FFEEF7F8', INK = 'FF1D2B33', MUTED = 'FF5D6B73';
  const NUM = '#,##0;[Red]-#,##0', NUM2 = '#,##0.00;[Red]-#,##0.00', PCT = '0.0%;[Red]-0.0%';
  const TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const mLabel = k => TH_M[+k.slice(5) - 1] + ' ' + (+k.slice(0, 4) + 543);
  const col = n => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; };
  const S = 'ข้อมูลขาย', X = 'ข้อมูลค่าใช้จ่าย', B = 'ข้อมูลซื้อ', RC = 'กระทบต้นทุน', SUMSHEET = 'สรุป';
  const NAT = { var: 'ผันแปร', fix: 'คงที่', ex: 'ไม่นับ' };
  const GROUP = { dc: 'TTA', cs: 'TTA', ns: 'TTA', promoBill: 'ค่าโปร', promoAccrual: 'ค่าโปร', promo: 'ค่าโปร', logistics: 'ขนส่ง', penalty: 'อื่น ๆ', other: 'อื่น ๆ' };
  const POOL = { all: 'ทุกช่องทาง', noCJ: 'ไม่รวม CJ' };

  function style(ws) {
    ws.eachRow(r => r.eachCell(c => { c.font = Object.assign({ name: 'Leelawadee UI', size: 10, color: { argb: INK } }, c.font || {}); }));
  }
  function head(row, from, to) {
    for (let c = from; c <= to; c++) { const x = row.getCell(c); x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL } }; x.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Leelawadee UI', size: 10 }; x.alignment = { vertical: 'middle', horizontal: c === from ? 'left' : 'center', wrapText: true }; }
    row.height = 22;
  }
  function title(ws, text, sub) {
    ws.getCell('A1').value = text; ws.getCell('A1').font = { bold: true, size: 14, color: { argb: TEAL }, name: 'Leelawadee UI' };
    if (sub) { ws.getCell('A2').value = sub; ws.getCell('A2').font = { size: 9, color: { argb: MUTED }, name: 'Leelawadee UI' }; }
  }
  const total = (row, from, to) => { for (let c = from; c <= to; c++) { const x = row.getCell(c); x.font = Object.assign({}, x.font, { bold: true }); x.border = { top: { style: 'thin', color: { argb: TEAL } } }; } };
  const sect = (row, to) => { for (let c = 1; c <= to; c++) { const x = row.getCell(c); x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TINT } }; x.font = { bold: true, color: { argb: TEAL }, name: 'Leelawadee UI', size: 10 }; } };

  async function build(model, cfg, files, E) {
    const wb = new ExcelJS.Workbook(); wb.creator = 'Management Report'; wb.created = new Date();
    wb.calcProperties.fullCalcOnLoad = true;
    const months = model.months, M = months.length, modeLabel = cfg.promo.mode === 'actual' ? 'บิลจริง' : 'ประมาณการ';
    const G_SELL = E.GROUPS[1], G_ADMIN = E.GROUPS[3], G_EX = E.GROUPS[4], PROMO_SUB = E.groupOf('ค่าร่วมโปร', '', 'var', cfg).sub;

    /* ---------- ข้อมูลรายบรรทัด ---------- */
    const sales = model.sales.map(s => Object.assign({}, s))
      .concat((model.cancelledDocs || []).filter(c => months.includes(c.month)).map(c => ({ month: c.month, doc: c.doc, channel: c.channel, sku: '', name: '(เอกสารถูกยกเลิก)', qty: 0, docQty: 0, revenue: 0, cogs: 0, cancel: true, file: c.file, note: `ถูกยกเลิกในไฟล์ดิบ ยอดตามเอกสาร ${(+c.preVat || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท ไม่นับเป็นรายได้` })))
      .sort((a, b) => a.month < b.month ? -1 : a.month > b.month ? 1 : (a.doc < b.doc ? -1 : a.doc > b.doc ? 1 : 0));
    const exps = [];
    model.expenses.forEach(e => exps.push({ month: e.month, channel: e.channel, nat: NAT[e.nature] || e.nature, group: e.channel === 'CJ' ? (GROUP[e.cjType] || 'อื่น ๆ') : '', category: e.category, name: e.name, amount: e.amount, use: e.cjType === 'promoBill' ? 'บิลจริง' : 'ทั้งสอง', source: e.source, file: e.file || '', main: e.main, sub: e.sub, pool: POOL[e.pool] || '', doc: e.doc || '' }));
    cfg.promoRounds.forEach(a => exps.push({ month: a.month, channel: 'CJ', nat: 'ผันแปร', group: 'ค่าโปร', category: 'ค่าโปร 1 แถม 1 (กรอกจากใบแจ้งหนี้)', name: a.label, amount: +a.amount || 0, use: 'บิลจริง', source: 'กรอกเอง', file: '', main: G_SELL, sub: PROMO_SUB, pool: '', doc: '' }));
    months.forEach(m => { const q = model.sales.filter(s => s.month === m && s.channel === 'CJ' && cfg.promo.skus.includes(s.sku)).reduce((s, x) => s + x.qty, 0); if (q) exps.push({ month: m, channel: 'CJ', nat: 'ผันแปร', group: 'ค่าโปร', category: 'ค่าร่วมโปร (ตั้งประมาณการ)', name: `${cfg.promo.rate} บาท x ${q} ถุง (${cfg.promo.skus.join(', ')})`, amount: q * cfg.promo.rate, use: 'ประมาณการ', source: 'สูตร', file: '', main: G_SELL, sub: PROMO_SUB, pool: '', doc: '' }); });
    cfg.adjustments.forEach(a => exps.push({ month: a.month, channel: a.channel, nat: 'ผันแปร', group: a.channel === 'CJ' ? 'อื่น ๆ' : '', category: 'รายการปรับปรุง', name: a.label + ' · ' + a.reason, amount: +a.amount || 0, use: 'ทั้งสอง', source: 'ปรับปรุง', file: '', main: G_ADMIN, sub: 'รายการปรับปรุงของสำนักงาน', pool: a.channel === E.SHARED ? POOL.all : '', doc: '' }));
    exps.sort((a, b) => a.month < b.month ? -1 : a.month > b.month ? 1 : b.amount - a.amount);
    const buys = (model.buyLines || []).slice().sort((a, b) => a.month < b.month ? -1 : a.month > b.month ? 1 : (a.doc < b.doc ? -1 : a.doc > b.doc ? 1 : 0));
    const nS = sales.length + 1, nX = exps.length + 1, nB = Math.max(2, buys.length + 1);
    const sR = c => `'${S}'!$${c}$2:$${c}$${nS}`, xR = c => `'${X}'!$${c}$2:$${c}$${nX}`, bR = c => `'${B}'!$${c}$2:$${c}$${nB}`;
    // ผลรวมตามเงื่อนไข (ใช้เติมค่าในเซลล์ให้เห็นทันทีที่เปิดไฟล์ ก่อน Excel คำนวณสูตร)
    const sSum = (f, m, ch) => sales.filter(s => s.month === m && (!ch || s.channel === ch)).reduce((t, s) => t + f(s), 0);
    const xSum = (m, o) => exps.filter(e => e.month === m && (e.use === 'ทั้งสอง' || e.use === modeLabel) && e.nat !== 'ไม่นับ' && (!o.nat || e.nat === o.nat) && (!o.ch || e.channel === o.ch) && (!o.group || e.group === o.group) && (!o.main || e.main === o.main) && (!o.sub || e.sub === o.sub) && (!o.pool || e.pool === o.pool)).reduce((t, e) => t + e.amount, 0);
    const xF = (mRef, extra) => { const base = `${xR('G')},${xR('A')},${mRef}${extra}`; return `SUMIFS(${base},${xR('H')},"ทั้งสอง")+SUMIFS(${base},${xR('H')},'${SUMSHEET}'!$B$3)`; };
    const comp = {}; months.forEach(m => { comp[m] = E.compute(model, cfg, m); });
    const chOf = (m, ch) => comp[m].channels.find(c => c.channel === ch) || { alloc: 0, net: 0, revenue: 0 };

    /* ---------- สรุป ---------- */
    const ws = wb.addWorksheet(SUMSHEET, { views: [{ state: 'frozen', xSplit: 1, ySplit: 5 }] });
    title(ws, 'สรุปผลดำเนินงานรายเดือน', `ทุกตัวเลขเป็นสูตรที่ดึงจาก Tab "${S}" และ "${X}" · ข้อมูล ${mLabel(months[0])} ถึง ${mLabel(months[M - 1])}`);
    ws.getCell('A3').value = 'วิธีคิดค่าโปร 1 แถม 1 (เปลี่ยนได้)'; ws.getCell('B3').value = modeLabel;
    ws.getCell('B3').dataValidation = { type: 'list', allowBlank: false, formulae: ['"ประมาณการ,บิลจริง"'] };
    ws.getCell('B3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } }; ws.getCell('B3').font = { bold: true };
    ws.getCell('C3').value = `ประมาณการ = ${cfg.promo.rate} บาทต่อถุง · บิลจริง = ตามใบแจ้งหนี้ CJ`; ws.getCell('C3').font = { size: 9, color: { argb: MUTED } };
    const hr = ws.getRow(5); hr.getCell(1).value = 'รายการ'; months.forEach((m, i) => { hr.getCell(2 + i).value = mLabel(m); ws.getCell(4, 2 + i).value = m; ws.getCell(4, 2 + i).font = { size: 8, color: { argb: MUTED } }; ws.getCell(4, 2 + i).alignment = { horizontal: 'right' }; });
    ws.getCell('A4').value = 'รหัสเดือน (ใช้ในสูตร)'; ws.getCell('A4').font = { size: 8, color: { argb: MUTED } };
    head(hr, 1, 1 + M);
    let r = 6; const rowOf = {};
    const line = (key, label, fx, val, fmt, opt) => {
      const row = ws.getRow(r); row.getCell(1).value = label; rowOf[key] = r;
      months.forEach((m, i) => { const c = col(2 + i), cell = row.getCell(2 + i); cell.value = { formula: fx(c, `${c}$4`, m), result: val ? val(m) : undefined }; cell.numFmt = fmt || NUM; });
      if (opt === 'tot') total(row, 1, 1 + M); r++;
    };
    const secRow = t => { ws.getRow(r).getCell(1).value = t; sect(ws.getRow(r), 1 + M); r++; };
    secRow('ทั้งบริษัท');
    line('rev', 'รายได้สุทธิ (ไม่รวม VAT)', (c, m) => `SUMIFS(${sR('G')},${sR('A')},${m})`, m => sSum(s => s.revenue, m));
    line('cogs', 'ต้นทุนขาย', (c, m) => `SUMIFS(${sR('I')},${sR('A')},${m})`, m => sSum(s => s.cogs, m));
    line('gp', 'กำไรขั้นต้น', c => `${c}${rowOf.rev}-${c}${rowOf.cogs}`, m => sSum(s => s.revenue - s.cogs, m), NUM, 'tot');
    line('gm', '   % ต่อรายได้', c => `IF(${c}${rowOf.rev}=0,0,${c}${rowOf.gp}/${c}${rowOf.rev})`, null, PCT);
    line('var', 'ค่าใช้จ่ายผันแปร', (c, m) => xF(m, `,${xR('C')},"ผันแปร"`), m => xSum(m, { nat: 'ผันแปร' }));
    line('fix', 'ค่าใช้จ่ายคงที่', (c, m) => xF(m, `,${xR('C')},"คงที่"`), m => xSum(m, { nat: 'คงที่' }));
    line('op', 'กำไรจากการดำเนินงาน', c => `${c}${rowOf.gp}-${c}${rowOf.var}-${c}${rowOf.fix}`, m => sSum(s => s.revenue - s.cogs, m) - xSum(m, { nat: 'ผันแปร' }) - xSum(m, { nat: 'คงที่' }), NUM, 'tot');
    line('opp', '   % ต่อรายได้', c => `IF(${c}${rowOf.rev}=0,0,${c}${rowOf.op}/${c}${rowOf.rev})`, null, PCT);
    r++; secRow('CJ');
    line('cjrev', 'ยอดขาย CJ', (c, m) => `SUMIFS(${sR('G')},${sR('A')},${m},${sR('C')},"CJ")`, m => sSum(s => s.revenue, m, 'CJ'));
    line('cjshare', '   สัดส่วนต่อรายได้ทั้งบริษัท', c => `IF(${c}${rowOf.rev}=0,0,${c}${rowOf.cjrev}/${c}${rowOf.rev})`, null, PCT);
    line('cjqty', 'จำนวนที่ส่งเข้า CJ (ทุกสินค้า หน่วย)', (c, m) => `SUMIFS(${sR('L')},${sR('A')},${m},${sR('C')},"CJ")`, m => sSum(s => s.qty, m, 'CJ'));
    line('cjcogs', 'ต้นทุนสินค้า CJ', (c, m) => `SUMIFS(${sR('I')},${sR('A')},${m},${sR('C')},"CJ")`, m => sSum(s => s.cogs, m, 'CJ'));
    [['cjtta', 'หักตามสัญญา (TTA)', 'TTA'], ['cjpromo', 'ค่าโปรและส่วนลด', 'ค่าโปร'], ['cjlogi', 'ขนส่งและค่าลงสินค้า', 'ขนส่ง'], ['cjoth', 'ค่าปรับและอื่น ๆ', 'อื่น ๆ']].forEach(([k, l, gname]) =>
      line(k, l, (c, m) => xF(m, `,${xR('B')},"CJ",${xR('D')},"${gname}"`), m => xSum(m, { ch: 'CJ', group: gname })));
    line('cjnet', 'กำไร CJ หลังค่าใช้จ่ายตรง', c => `${c}${rowOf.cjrev}-${c}${rowOf.cjcogs}-${c}${rowOf.cjtta}-${c}${rowOf.cjpromo}-${c}${rowOf.cjlogi}-${c}${rowOf.cjoth}`, null, NUM, 'tot');
    line('cjnetp', '   % ต่อยอดขาย CJ', c => `IF(${c}${rowOf.cjrev}=0,0,${c}${rowOf.cjnet}/${c}${rowOf.cjrev})`, null, PCT);
    line('cjpp', '   ค่าโปรต่อยอดขาย CJ', c => `IF(${c}${rowOf.cjrev}=0,0,${c}${rowOf.cjpromo}/${c}${rowOf.cjrev})`, null, PCT);
    r++; secRow('ตรวจกับโปรแกรม (ณ เวลาที่ Export แบบ ' + modeLabel + ')');
    { const row = ws.getRow(r); row.getCell(1).value = 'กำไรจากการดำเนินงานตามโปรแกรม'; months.forEach((m, i) => { const c = row.getCell(2 + i); c.value = comp[m].totals.op; c.numFmt = NUM; }); rowOf.chk = r; r++; }
    line('chkd', 'ผลต่าง (ควรเป็น 0 ถ้าไม่ได้เปลี่ยนวิธีคิดค่าโปร)', c => `ROUND(${c}${rowOf.op}-${c}${rowOf.chk},0)`, null, NUM);
    ws.getColumn(1).width = 44; for (let i = 0; i < M; i++) ws.getColumn(2 + i).width = 16;

    /* ---------- ช่องทาง ---------- */
    const wc = wb.addWorksheet('ช่องทาง', { views: [{ state: 'frozen', xSplit: 1, ySplit: 4 }] });
    title(wc, 'รายได้และกำไรแยกช่องทาง (รวมปันส่วนค่าใช้จ่ายส่วนกลาง)', `สูตรดึงจาก "${S}" และ "${X}" · ค่าโปรใช้วิธีตาม "${SUMSHEET}"!B3 · ส่วนกลางปันตามสัดส่วนรายได้ รายการที่คอลัมน์ "ปันส่วนกลาง" เป็น "ไม่รวม CJ" ปันเฉพาะช่องทางอื่น (แก้ค่าในคอลัมน์นั้นได้ สูตรจะคำนวณใหม่)`);
    const chans = [...new Set(sales.map(s => s.channel))].sort((a, b) => sales.filter(s => s.channel === b).reduce((t, s) => t + s.revenue, 0) - sales.filter(s => s.channel === a).reduce((t, s) => t + s.revenue, 0));
    months.forEach((m, i) => { wc.getCell(3, 2 + i).value = m; wc.getCell(3, 2 + i).font = { size: 8, color: { argb: MUTED } }; wc.getCell(3, 2 + i).alignment = { horizontal: 'right' }; });
    let rc = 4; const blockStart = {};
    const block = (key, label, fx, val, withTotal, fmt, totFx) => {
      const h = wc.getRow(rc); h.getCell(1).value = label; months.forEach((m, i) => { h.getCell(2 + i).value = mLabel(m); }); head(h, 1, 1 + M); rc++; blockStart[key] = rc;
      chans.forEach((ch, k) => { const row = wc.getRow(rc); row.getCell(1).value = ch; months.forEach((m, i) => { const c = col(2 + i), cell = row.getCell(2 + i); cell.value = { formula: fx(c, `${c}$3`, `$A${rc}`, k), result: val ? val(m, ch) : undefined }; cell.numFmt = fmt || NUM; }); rc++; });
      if (withTotal) { const row = wc.getRow(rc); row.getCell(1).value = 'รวม'; months.forEach((m, i) => { const c = col(2 + i); row.getCell(2 + i).value = { formula: totFx ? totFx(c) : `SUM(${c}${blockStart[key]}:${c}${rc - 1})` }; row.getCell(2 + i).numFmt = fmt || NUM; }); total(row, 1, 1 + M); rc++; }
      rc++;
    };
    const nC = chans.length;
    block('rev', 'รายได้สุทธิ', (c, m, a) => `SUMIFS(${sR('G')},${sR('A')},${m},${sR('C')},${a})`, (m, ch) => sSum(s => s.revenue, m, ch), true);
    block('cogs', 'ต้นทุนสินค้า', (c, m, a) => `SUMIFS(${sR('I')},${sR('A')},${m},${sR('C')},${a})`, (m, ch) => sSum(s => s.cogs, m, ch), true);
    block('dir', 'ค่าใช้จ่ายตรงของช่องทาง', (c, m, a) => { const base = `${xR('G')},${xR('A')},${m},${xR('B')},${a}`; return `SUMIFS(${base},${xR('H')},"ทั้งสอง",${xR('C')},"<>ไม่นับ")+SUMIFS(${base},${xR('H')},'${SUMSHEET}'!$B$3,${xR('C')},"<>ไม่นับ")`; }, (m, ch) => xSum(m, { ch }), true);
    block('net', 'กำไรหลังค่าใช้จ่ายตรง (ก่อนปันส่วนกลาง)', (c, m, a, k) => `${c}${blockStart.rev + k}-${c}${blockStart.cogs + k}-${c}${blockStart.dir + k}`, (m, ch) => sSum(s => s.revenue - s.cogs, m, ch) - xSum(m, { ch }), true);
    // ค่าใช้จ่ายส่วนกลาง 2 กอง
    { const h = wc.getRow(rc); h.getCell(1).value = 'ค่าใช้จ่ายส่วนกลางที่ต้องปัน'; months.forEach((m, i) => { h.getCell(2 + i).value = mLabel(m); }); head(h, 1, 1 + M); rc++; }
    const poolRow = {};
    [['all', 'ส่วนกลางที่ปันให้ทุกช่องทาง', POOL.all], ['noCJ', 'ส่วนกลางที่ไม่ปันให้ CJ (ปันเฉพาะช่องทางอื่น)', POOL.noCJ]].forEach(([k, l, pv]) => {
      const row = wc.getRow(rc); row.getCell(1).value = l; poolRow[k] = rc;
      months.forEach((m, i) => { const c = col(2 + i); row.getCell(2 + i).value = { formula: `SUMIFS(${xR('G')},${xR('A')},${c}$3,${xR('B')},"${E.SHARED}",${xR('C')},"<>ไม่นับ",${xR('M')},"${pv}")`, result: xSum(m, { ch: E.SHARED, pool: pv }) }; row.getCell(2 + i).numFmt = NUM; }); rc++;
    });
    { const row = wc.getRow(rc); row.getCell(1).value = 'รวมค่าใช้จ่ายส่วนกลาง'; months.forEach((m, i) => { const c = col(2 + i); row.getCell(2 + i).value = { formula: `${c}${poolRow.all}+${c}${poolRow.noCJ}`, result: xSum(m, { ch: E.SHARED }) }; row.getCell(2 + i).numFmt = NUM; }); total(row, 1, 1 + M); rc += 2; }
    const revTot = blockStart.rev + nC, revRng = c => `${c}$${blockStart.rev}:${c}$${blockStart.rev + nC - 1}`, aRng = `$A$${blockStart.rev}:$A$${blockStart.rev + nC - 1}`;
    block('alloc', 'ส่วนกลางที่ปันให้แต่ละช่องทาง (ตามสัดส่วนรายได้)', (c, m, a, k) => {
      const T = `${c}$${revTot}`, N = `(${T}-SUMIF(${aRng},"CJ",${revRng(c)}))`, rv = `${c}${blockStart.rev + k}`, A = `${c}$${poolRow.all}`, Bp = `${c}$${poolRow.noCJ}`;
      return `IF(${T}=0,0,(${A}+IF(${N}<=0,${Bp},0))*${rv}/${T})+IF(OR(${a}="CJ",${N}<=0),0,${Bp}*${rv}/${N})`;
    }, (m, ch) => chOf(m, ch).alloc, true);
    block('fin', 'กำไรสุทธิของช่องทาง (หลังปันส่วนกลาง)', (c, m, a, k) => `${c}${blockStart.net + k}-${c}${blockStart.alloc + k}`, (m, ch) => chOf(m, ch).net, true);
    block('finp', '% กำไรสุทธิต่อรายได้ของช่องทาง', (c, m, a, k) => `IF(${c}${blockStart.rev + k}=0,0,${c}${blockStart.fin + k}/${c}${blockStart.rev + k})`, null, true, PCT, c => `IF(${c}${revTot}=0,0,${c}${blockStart.fin + nC}/${c}${revTot})`);
    wc.getColumn(1).width = 46; for (let i = 0; i < M; i++) wc.getColumn(2 + i).width = 16;

    /* ---------- ค่าใช้จ่ายตามหมวด ---------- */
    const we = wb.addWorksheet('ค่าใช้จ่ายตามหมวด', { views: [{ state: 'frozen', xSplit: 1, ySplit: 4 }] });
    title(we, 'ค่าใช้จ่ายตามกลุ่มหลัก', `สูตรดึงจาก "${X}" คอลัมน์ กลุ่มหลัก และ หมวดย่อย · ค่าโปรใช้วิธีตาม "${SUMSHEET}"!B3 · ไม่รวมต้นทุนสินค้าที่ขาย (อยู่ใน Tab "${SUMSHEET}" และ "${RC}")`);
    months.forEach((m, i) => { we.getCell(3, 2 + i).value = m; we.getCell(3, 2 + i).font = { size: 8, color: { argb: MUTED } }; we.getCell(3, 2 + i).alignment = { horizontal: 'right' }; });
    { const h = we.getRow(4); h.getCell(1).value = 'กลุ่มหลัก / หมวดย่อย'; months.forEach((m, i) => { h.getCell(2 + i).value = mLabel(m); }); h.getCell(2 + M).value = 'รวม'; head(h, 1, 2 + M); }
    let re = 5; const subTotRows = [];
    const rowSum = row => { const c = row.getCell(2 + M); c.value = { formula: `SUM(B${row.number}:${col(1 + M)}${row.number})` }; c.numFmt = NUM; };
    E.GROUPS.filter(gn => gn !== G_EX).forEach((gn, gi) => {
      const subs = {}; exps.filter(e => e.main === gn && e.nat !== 'ไม่นับ').forEach(e => { subs[e.sub] = (subs[e.sub] || 0) + e.amount; });
      const list = Object.keys(subs).sort((a, b) => subs[b] - subs[a]); if (!list.length) return;
      we.getRow(re).getCell(1).value = `${gi + 1}. ${gn}`; sect(we.getRow(re), 2 + M); re++;
      const from = re;
      list.forEach(sb => { const row = we.getRow(re); row.getCell(1).value = sb; row.getCell(1).alignment = { indent: 1 };
        months.forEach((m, i) => { const c = col(2 + i); row.getCell(2 + i).value = { formula: xF(`${c}$3`, `,${xR('K')},"${gn}",${xR('L')},$A${re},${xR('C')},"<>ไม่นับ"`), result: xSum(m, { main: gn, sub: sb }) }; row.getCell(2 + i).numFmt = NUM; }); rowSum(row); re++; });
      const row = we.getRow(re); row.getCell(1).value = `รวม ${gn}`; months.forEach((m, i) => { const c = col(2 + i); row.getCell(2 + i).value = { formula: `SUM(${c}${from}:${c}${re - 1})`, result: xSum(m, { main: gn }) }; row.getCell(2 + i).numFmt = NUM; }); rowSum(row); total(row, 1, 2 + M); subTotRows.push(re); re += 2;
    });
    { const row = we.getRow(re); row.getCell(1).value = 'รวมค่าใช้จ่ายทั้งหมด'; months.forEach((m, i) => { const c = col(2 + i); row.getCell(2 + i).value = { formula: subTotRows.map(x => `${c}${x}`).join('+') || '0' }; row.getCell(2 + i).numFmt = NUM; }); rowSum(row); total(row, 1, 2 + M); const tr = re; re++;
      const r2 = we.getRow(re); r2.getCell(1).value = '   % ต่อรายได้'; months.forEach((m, i) => { const c = col(2 + i); r2.getCell(2 + i).value = { formula: `IF('${SUMSHEET}'!${c}${rowOf.rev}=0,0,${c}${tr}/'${SUMSHEET}'!${c}${rowOf.rev})` }; r2.getCell(2 + i).numFmt = PCT; }); re++;
      const r3 = we.getRow(re); r3.getCell(1).value = 'ผลต่างกับ Tab สรุป (ผันแปร + คงที่) ควรเป็น 0'; months.forEach((m, i) => { const c = col(2 + i); r3.getCell(2 + i).value = { formula: `ROUND(${c}${tr}-'${SUMSHEET}'!${c}${rowOf.var}-'${SUMSHEET}'!${c}${rowOf.fix},0)` }; r3.getCell(2 + i).numFmt = NUM; r3.getCell(2 + i).font = { size: 9, color: { argb: MUTED } }; }); r3.getCell(1).font = { size: 9, color: { argb: MUTED } }; re += 2; }
    { const subs = {}; exps.filter(e => e.nat === 'ไม่นับ').forEach(e => { subs[e.sub] = (subs[e.sub] || 0) + e.amount; }); const list = Object.keys(subs).sort((a, b) => subs[b] - subs[a]);
      if (list.length) { we.getRow(re).getCell(1).value = 'รายการที่ไม่นับในกำไรขาดทุน (แสดงให้ตรวจ ไม่ได้รวมในยอดข้างบน)'; sect(we.getRow(re), 2 + M); re++;
        list.forEach(sb => { const row = we.getRow(re); row.getCell(1).value = sb; row.getCell(1).alignment = { indent: 1 }; months.forEach((m, i) => { const c = col(2 + i); row.getCell(2 + i).value = { formula: `SUMIFS(${xR('G')},${xR('A')},${c}$3,${xR('C')},"ไม่นับ",${xR('L')},$A${re})`, result: exps.filter(e => e.month === m && e.nat === 'ไม่นับ' && e.sub === sb).reduce((t, e) => t + e.amount, 0) }; row.getCell(2 + i).numFmt = NUM; }); rowSum(row); re++; }); } }
    we.getColumn(1).width = 50; for (let i = 0; i <= M; i++) we.getColumn(2 + i).width = 16;

    /* ---------- เงินสด ---------- */
    const wk = wb.addWorksheet('เงินสด', { views: [{ state: 'frozen', xSplit: 1, ySplit: 4 }] });
    const C = E.cash(model, cfg), F = E.forecast(model, cfg);
    title(wk, 'เงินสดรับจ่ายรายเดือน และประมาณการ 3 เดือนข้างหน้า', `ประมาณการจากวันครบกำหนดและวันที่จ่ายในไฟล์ ไม่ใช่ยอดธนาคาร · เครดิต CJ ${cfg.cjCreditDays} วัน`);
    const known = C.rows.filter(x => x.known), allc = known.concat(F ? F.rows : []);
    const hk = wk.getRow(4); hk.getCell(1).value = 'รายการ'; allc.forEach((x, i) => { hk.getCell(2 + i).value = mLabel(x.month) + (x.known ? '' : ' (ประมาณการ)'); }); head(hk, 1, 1 + allc.length);
    const kr = [['เงินสดต้นงวด', x => x.known ? null : x.open], ['ใบกำกับ CJ ที่ครบกำหนด (ออกใบแล้ว)', x => x.cjIn], ['CJ จากยอดขายที่คาดการณ์', x => x.known ? 0 : x.cjNew], ['หัก ส่วนที่ CJ หัก (รู้แล้ว)', x => -x.cjDeduct], ['หัก ส่วนที่ CJ หัก (คาดการณ์)', x => x.known ? 0 : -x.cjDedNew], ['เงินเข้าจากช่องทางอื่น', x => x.known ? x.otherIn : x.otherIn + x.otherNew], ['จ่ายค่าสินค้าและค่านำเข้า', x => -(x.known ? x.buy : x.buyAll)], ['จ่ายค่าใช้จ่ายอื่น', x => -(x.known ? x.exp : x.expAll)]];
    kr.forEach((it, k) => { const row = wk.getRow(5 + k); row.getCell(1).value = it[0]; allc.forEach((x, i) => { const v = it[1](x); if (v != null) { row.getCell(2 + i).value = v; row.getCell(2 + i).numFmt = NUM; } }); });
    { const row = wk.getRow(5 + kr.length); row.getCell(1).value = 'เงินสดสุทธิของเดือน'; allc.forEach((x, i) => { const c = col(2 + i); row.getCell(2 + i).value = { formula: `SUM(${c}6:${c}${4 + kr.length})`, result: x.net }; row.getCell(2 + i).numFmt = NUM; }); total(row, 1, 1 + allc.length);
      const row2 = wk.getRow(6 + kr.length); row2.getCell(1).value = 'เงินสดปลายงวด (เฉพาะช่วงประมาณการ)'; allc.forEach((x, i) => { if (x.known) return; const c = col(2 + i); row2.getCell(2 + i).value = { formula: `${c}5+${c}${5 + kr.length}`, result: x.close }; row2.getCell(2 + i).numFmt = NUM; }); total(row2, 1, 1 + allc.length); }
    if (F) { let q = 9 + kr.length; wk.getCell(q, 1).value = 'สมมติฐานของประมาณการ (ต่อเดือน)'; sect(wk.getRow(q), 3); q++;
      [['เงินสดต้นงวด', F.a.open], ['ยอดขาย CJ ที่คาด (ไม่รวม VAT)', F.a.cjSales], ['ยอดขายช่องทางอื่นที่คาด', F.a.otherSales], ['จ่ายค่าสินค้าและค่านำเข้า', F.a.buy], ['จ่ายค่าใช้จ่ายอื่น', F.a.exp], ['ค่าโปรที่คาดว่า CJ จะหักเพิ่ม', F.a.promo]].forEach(([l, v]) => { wk.getCell(q, 1).value = l; wk.getCell(q, 2).value = v; wk.getCell(q, 2).numFmt = NUM; q++; }); }
    wk.getColumn(1).width = 40; for (let i = 0; i < allc.length; i++) wk.getColumn(2 + i).width = 18;

    /* ---------- กระทบต้นทุน ---------- */
    const recon = model.recon || {}, rcMonths = Object.keys(recon).sort(), rcRows = [];
    rcMonths.forEach(m => Object.keys(recon[m]).sort().forEach(k => { const x = recon[m][k]; if (x.src === 'office' && !(x.openQty || x.buyQty || x.closeQty || x.soldQty || x.cost)) return; rcRows.push(x); }));
    const R0 = 5; let rr = R0; const rcAt = {};
    const layout = []; rcMonths.forEach(m => { const rowsM = rcRows.filter(x => x.month === m); if (!rowsM.length) return; const from = rr; rowsM.forEach(x => { rcAt[m + '|' + x.sku] = rr; layout.push({ x, row: rr }); rr++; }); layout.push({ tot: m, from, to: rr - 1, row: rr }); rr += 2; });
    const nR = Math.max(R0, rr - 1), rcR = c => `'${RC}'!$${c}$${R0}:$${c}$${nR}`;
    const wr = wb.addWorksheet(RC, { views: [{ state: 'frozen', xSplit: 3, ySplit: 4 }] });
    title(wr, 'กระทบต้นทุนสินค้าราย SKU (ต้นทุนถัวเฉลี่ยรายงวด)', 'ยอดยกมา + ซื้อเข้ารวมค่าใช้จ่ายนำเข้า = พร้อมขาย → ต้นทุนถัวเฉลี่ย/หน่วย → หักคงเหลือสิ้นเดือน = จำนวนขาย/ปรับปรุง · งวดที่มีตารางของสำนักงานใช้ค่าตามตารางนั้น งวดที่ยังไม่มีโปรแกรมคำนวณให้ด้วยสูตรเดียวกัน');
    wr.getCell('A3').value = 'คอลัมน์ L (ต้นทุนถัวเฉลี่ย/หน่วย) คือค่าที่ Tab "' + S + '" ดึงไปคูณจำนวนขาย · ต้นทุนขายในงบใช้คอลัมน์ R (จำนวนตามใบขาย × ต้นทุนถัวเฉลี่ย) · คอลัมน์ S–T คือส่วนที่จำนวนหายจากสต๊อกไม่เท่ากับจำนวนตามใบขาย'; wr.getCell('A3').font = { size: 9, color: { argb: MUTED } };
    const RH = ['งวด', 'SKU', 'ชื่อสินค้า', 'จำนวนต้นงวด', 'มูลค่าต้นงวด', 'จำนวนซื้อเข้า', 'มูลค่าซื้อ', 'ค่าใช้จ่ายจัดสรร', 'ซื้อเข้ารวมค่าใช้จ่าย', 'จำนวนพร้อมขาย', 'มูลค่าพร้อมขาย', 'ต้นทุนถัวเฉลี่ย/หน่วย', 'จำนวนปลายงวด', 'มูลค่าปลายงวด', 'จำนวนขาย/ปรับปรุง', 'ต้นทุนขาย (ตามจำนวนที่ออกจากสต๊อก)', 'จำนวนขายตามใบขาย', 'ต้นทุนขายตามใบขาย (ใช้ในงบ)', 'ผลต่างจำนวน', 'ผลต่างมูลค่า', 'รับเข้าตามรายงานเคลื่อนไหว', 'จ่ายออกตามรายงานเคลื่อนไหว', 'ที่มา'];
    RH.forEach((h, i) => { wr.getRow(4).getCell(1 + i).value = h; }); head(wr.getRow(4), 1, RH.length); wr.getRow(4).height = 44;
    const salesQty = (m, k) => sales.filter(s => s.month === m && s.sku === k).reduce((t, s) => t + s.qty, 0), salesCogs = (m, k) => sales.filter(s => s.month === m && s.sku === k).reduce((t, s) => t + s.cogs, 0);
    layout.forEach(it => {
      const n = it.row, row = wr.getRow(n);
      if (it.tot) {
        row.getCell(3).value = 'รวม ' + mLabel(it.tot);
        ['E', 'G', 'H', 'I', 'K', 'N', 'P', 'R', 'T'].forEach(c => { row.getCell(c).value = { formula: `SUM(${c}${it.from}:${c}${it.to})` }; row.getCell(c).numFmt = NUM; });
        total(row, 1, RH.length); return;
      }
      const x = it.x, calc = x.src === 'calc', avail = x.openQty + x.buyQty, availV = x.openVal + x.buyVal + x.alloc;
      row.getCell('A').value = x.month; row.getCell('B').value = x.sku; row.getCell('C').value = x.name;
      row.getCell('D').value = x.openQty; row.getCell('E').value = x.openVal;
      if (calc) {
        row.getCell('F').value = { formula: `SUMIFS(${bR('E')},${bR('A')},$A${n},${bR('C')},$B${n})`, result: x.buyQty };
        row.getCell('G').value = { formula: `SUMIFS(${bR('F')},${bR('A')},$A${n},${bR('C')},$B${n})`, result: x.buyVal };
        row.getCell('H').value = { formula: `SUMIFS(${bR('G')},${bR('A')},$A${n},${bR('C')},$B${n})`, result: x.alloc };
        row.getCell('L').value = { formula: `IF(AND(J${n}>0,K${n}>0),K${n}/J${n},${x.prevCost || 0})`, result: x.cost };
        row.getCell('M').value = x.closeQty;
        row.getCell('N').value = { formula: `M${n}*L${n}`, result: x.closeVal };
        row.getCell('O').value = { formula: `J${n}-M${n}`, result: x.soldQty };
        row.getCell('P').value = { formula: `O${n}*L${n}`, result: x.cogs };
        if (x.mvIn != null) { row.getCell('U').value = x.mvIn; row.getCell('V').value = x.mvOut; }
      } else {
        row.getCell('F').value = x.buyQty; row.getCell('G').value = x.buyVal; row.getCell('H').value = x.alloc; row.getCell('L').value = x.cost;
        row.getCell('M').value = x.closeQty; row.getCell('N').value = x.closeVal; row.getCell('O').value = x.soldQty; row.getCell('P').value = x.cogs;
      }
      row.getCell('I').value = { formula: `G${n}+H${n}`, result: x.buyVal + x.alloc };
      row.getCell('J').value = { formula: `D${n}+F${n}`, result: avail };
      row.getCell('K').value = { formula: `E${n}+I${n}`, result: availV };
      if (!x.cum) {
        row.getCell('Q').value = { formula: `SUMIFS(${sR('L')},${sR('A')},$A${n},${sR('D')},$B${n})`, result: salesQty(x.month, x.sku) };
        row.getCell('R').value = { formula: `SUMIFS(${sR('I')},${sR('A')},$A${n},${sR('D')},$B${n})`, result: salesCogs(x.month, x.sku) };
        row.getCell('S').value = { formula: `O${n}-Q${n}`, result: x.soldQty - salesQty(x.month, x.sku) };
        row.getCell('T').value = { formula: `P${n}-R${n}`, result: x.cogs - salesCogs(x.month, x.sku) };
      }
      row.getCell('W').value = calc ? 'โปรแกรมคำนวณ: ยกมาจากปลายงวดก่อน · ซื้อเข้าจาก Tab ' + B + ' · ปลายงวดจาก ' + (x.noMove ? '(ไม่มีในรายงานเคลื่อนไหว ถือว่าไม่มีการขาย)' : x.file) : 'ตารางสำนักงาน' + (x.label ? ' งวด ' + x.label + ' (สะสม จึงไม่เทียบกับใบขายรายเดือน)' : '') + ': ' + (x.file || '');
      ['D', 'F', 'J', 'M', 'O', 'Q', 'S', 'U', 'V'].forEach(c => { row.getCell(c).numFmt = NUM; }); ['E', 'G', 'H', 'I', 'K', 'L', 'N', 'P', 'R', 'T'].forEach(c => { row.getCell(c).numFmt = NUM2; });
    });
    [10, 14, 38, 11, 14, 11, 14, 14, 15, 11, 14, 13, 11, 14, 12, 16, 12, 16, 11, 13, 13, 13, 70].forEach((w, i) => { wr.getColumn(1 + i).width = w; });
    if (layout.length) wr.autoFilter = { from: 'A4', to: `${col(RH.length)}${nR}` };

    /* ---------- ข้อมูลขาย ---------- */
    const wsS = wb.addWorksheet(S, { views: [{ state: 'frozen', ySplit: 1 }] });
    wsS.columns = [{ header: 'เดือน', width: 10 }, { header: 'เลขที่เอกสาร', width: 16 }, { header: 'ช่องทาง', width: 14 }, { header: 'รหัสสินค้า', width: 14 }, { header: 'ชื่อสินค้า', width: 40 }, { header: 'จำนวน (ตามเอกสาร)', width: 12 }, { header: 'รายได้ไม่รวม VAT', width: 16 }, { header: 'ต้นทุน/หน่วย', width: 13 }, { header: 'ต้นทุนรวม', width: 14 }, { header: 'ประเภท', width: 10 }, { header: 'ไฟล์ที่มา', width: 46 }, { header: 'จำนวนที่นับต้นทุน', width: 12 }, { header: 'หมายเหตุ', width: 60 }];
    sales.forEach((s, i) => {
      const n = i + 2, u = s.cancel ? 0 : (s.qty ? s.cogs / s.qty : model.costOf(s.sku, s.month)), rx = recon[s.month] && recon[s.month][s.sku];
      const linked = !s.cancel && rx && rcAt[s.month + '|' + s.sku] && Math.abs((rx.cost || 0) - u) < 1e-6;
      const type = s.cancel ? 'ยกเลิก' : s.ret ? 'รับคืน' : s.sku === '(ค่าส่ง)' ? 'ค่าส่ง' : 'ขาย';
      const note = s.cancel ? s.note : s.ret ? ((s.note || '') + (s.qty === 0 ? (s.note ? ' · ' : '') + 'ลดรายได้ ไม่ลดต้นทุน (ของเสียหาย/ทำลาย ไม่ได้กลับเข้าสต๊อก)' : '')) : s.sku === '(ค่าส่ง)' ? 'ค่าส่งที่เรียกเก็บจากลูกค้า แยกจากค่าสินค้าในใบเดียวกัน' : (s.sku === '(ไม่มีรหัสสินค้า)' && !s.revenue ? 'บรรทัดไม่มีรหัสสินค้าและไม่มีราคา (ของแถม)' : '');
      const row = wsS.addRow([s.month, s.doc, s.channel, s.sku, s.name, s.docQty != null ? s.docQty : s.qty, s.revenue,
        linked ? { formula: `SUMIFS(${rcR('L')},${rcR('A')},A${n},${rcR('B')},D${n})`, result: u } : u, { formula: `L${n}*H${n}`, result: s.cogs }, type, s.file || '', s.qty, note]);
      row.getCell(6).numFmt = NUM; row.getCell(7).numFmt = NUM2; row.getCell(8).numFmt = NUM2; row.getCell(9).numFmt = NUM2; row.getCell(12).numFmt = NUM;
    });
    head(wsS.getRow(1), 1, 13); wsS.autoFilter = { from: 'A1', to: `M${nS}` };

    /* ---------- ข้อมูลค่าใช้จ่าย ---------- */
    const wsX = wb.addWorksheet(X, { views: [{ state: 'frozen', ySplit: 1 }] });
    wsX.columns = [{ header: 'เดือน', width: 10 }, { header: 'ช่องทาง', width: 14 }, { header: 'ลักษณะ', width: 10 }, { header: 'กลุ่ม CJ', width: 10 }, { header: 'หมวดในไฟล์', width: 30 }, { header: 'รายการ', width: 46 }, { header: 'จำนวนเงินไม่รวม VAT', width: 18 }, { header: 'ใช้ในแบบ', width: 12 }, { header: 'ที่มา', width: 16 }, { header: 'ไฟล์ที่มา', width: 40 }, { header: 'กลุ่มหลัก', width: 24 }, { header: 'หมวดย่อย', width: 32 }, { header: 'ปันส่วนกลาง', width: 14 }, { header: 'เลขที่ใบขายอ้างอิง', width: 18 }];
    exps.forEach(e => { const row = wsX.addRow([e.month, e.channel, e.nat, e.group, e.category, e.name, e.amount, e.use, e.source, e.file, e.main, e.sub, e.pool, e.doc]); row.getCell(7).numFmt = NUM2; });
    head(wsX.getRow(1), 1, 14); wsX.autoFilter = { from: 'A1', to: `N${nX}` };
    wsX.getColumn(13).eachCell((c, n) => { if (n > 1 && c.value) c.dataValidation = { type: 'list', allowBlank: true, formulae: [`"${POOL.all},${POOL.noCJ}"`] }; });

    /* ---------- ข้อมูลซื้อ ---------- */
    const wsB = wb.addWorksheet(B, { views: [{ state: 'frozen', ySplit: 1 }] });
    wsB.columns = [{ header: 'เดือน (ตามวันที่ใบซื้อ)', width: 12 }, { header: 'เลขที่ใบซื้อ', width: 16 }, { header: 'รหัสสินค้า', width: 16 }, { header: 'ชื่อสินค้า', width: 42 }, { header: 'จำนวน', width: 10 }, { header: 'มูลค่าซื้อ (หลังส่วนลด)', width: 16 }, { header: 'ค่าใช้จ่ายนำเข้าที่ปันให้', width: 16 }, { header: 'ต้นทุนรับเข้ารวม', width: 16 }, { header: 'ต้นทุน/หน่วย', width: 12 }, { header: 'ไฟล์ที่มา', width: 60 }];
    buys.forEach((b, i) => { const n = i + 2, row = wsB.addRow([b.month, b.doc, b.sku, b.name, b.qty, b.val, b.alloc, { formula: `F${n}+G${n}`, result: b.val + b.alloc }, { formula: `IF(E${n}=0,0,H${n}/E${n})`, result: b.qty ? (b.val + b.alloc) / b.qty : 0 }, b.file || '']); row.getCell(5).numFmt = NUM; [6, 7, 8, 9].forEach(c => { row.getCell(c).numFmt = NUM2; }); });
    head(wsB.getRow(1), 1, 10); wsB.getRow(1).height = 34; wsB.autoFilter = { from: 'A1', to: `J${nB}` };

    /* ---------- ตารางจับคู่ ---------- */
    const wm = wb.addWorksheet('ตารางจับคู่');
    title(wm, 'ตารางจับคู่และค่าที่ตั้งไว้', 'สิ่งที่โปรแกรมใช้แปลงไฟล์ดิบเป็นรายงาน');
    let q = 4; const tbl = (t, hdr, rows) => { wm.getCell(q, 1).value = t; sect(wm.getRow(q), Math.max(2, hdr.length)); q++; hdr.forEach((h, i) => wm.getCell(q, 1 + i).value = h); head(wm.getRow(q), 1, hdr.length); q++; rows.forEach(rw => { rw.forEach((v, i) => wm.getCell(q, 1 + i).value = v); q++; }); q++; };
    tbl('ช่องทางขาย', ['ชื่อในโปรแกรมขาย', 'ช่องทางของ Report'], Object.keys(cfg.channelMap).sort().map(k => [k, cfg.channelMap[k]]));
    if ((cfg.channelRules || []).length) tbl('กฎช่องทางตามชื่อลูกค้า (มาก่อนตารางช่องทางขาย)', ['ชื่อในโปรแกรมขาย', 'ถ้าชื่อลูกค้ามีคำว่า', 'ลงช่องทาง'], cfg.channelRules.map(x => [x.raw || '(ทุกช่องทาง)', x.customer, x.to]));
    tbl('รหัสนำหน้าค่าใช้จ่าย', ['รหัสนำหน้า', 'ลงที่'], Object.keys(cfg.prefixMap).sort().map(k => [k, cfg.prefixMap[k]]));
    { const cm = {}; model.expenses.forEach(e => { const k = e.category + '|' + e.main + '|' + e.sub; (cm[k] || (cm[k] = { c: e.category, m: e.main, s: e.sub, n: 0, a: 0 })).n++; cm[k].a += e.amount; });
      const ord = x => E.GROUPS.indexOf(x.m);
      tbl('หมวดค่าใช้จ่าย: หมวดในไฟล์ → หมวดย่อย → กลุ่มหลัก', ['หมวดในไฟล์', 'หมวดย่อยในรายงาน', 'กลุ่มหลัก', 'จำนวนรายการ', 'ยอดรวมทุกเดือน'], Object.values(cm).sort((a, b) => ord(a) - ord(b) || (a.s < b.s ? -1 : a.s > b.s ? 1 : 0) || (a.c < b.c ? -1 : 1)).map(x => [x.c, x.s, x.m, x.n, Math.round(x.a * 100) / 100])); }
    if ((cfg.noCJ || []).length) tbl('ค่าใช้จ่ายส่วนกลางที่ไม่ปันให้ CJ (รายการที่ชื่อมีคำเหล่านี้)', ['คำในชื่อรายการ / หมวด'], cfg.noCJ.map(x => [x]));
    if ((cfg.excludeWords || []).length) tbl('รายการที่ไม่นับในกำไรขาดทุน (นอกจากภาษีและสินทรัพย์)', ['คำในชื่อรายการ / หมวด'], cfg.excludeWords.map(x => [x]));
    tbl('ค่าที่ตั้งไว้', ['รายการ', 'ค่า'], [['ประมาณการค่าร่วมโปร (บาท/ถุง)', cfg.promo.rate], ['สินค้าที่ร่วมโปร', cfg.promo.skus.join(', ')], ['Commercial support %', cfg.tta.cs], ['สาขาใหม่ %', cfg.tta.ns], ['DC fee %', cfg.tta.dc], ['เครดิต CJ (วัน)', cfg.cjCreditDays]]);
    if (cfg.adjustments.length || cfg.promoRounds.length) tbl('รายการที่กรอกเอง', ['รายการ', 'จำนวนเงิน'], cfg.promoRounds.map(a => [`${a.month} บิลค่าโปร: ${a.label}`, +a.amount]).concat(cfg.adjustments.map(a => [`${a.month} ${a.channel}: ${a.label} (${a.reason})`, +a.amount])));
    wm.getColumn(1).width = 46; wm.getColumn(2).width = 34; wm.getColumn(3).width = 26; wm.getColumn(4).width = 14; wm.getColumn(5).width = 16;

    /* ---------- ไฟล์ที่นำเข้า ---------- */
    const wf = wb.addWorksheet('ไฟล์ที่นำเข้า', { views: [{ state: 'frozen', ySplit: 1 }] });
    wf.columns = [{ header: 'ไฟล์ / ชีต', width: 70 }, { header: 'ระบบอ่านเป็น', width: 34 }, { header: 'สถานะ', width: 14 }, { header: 'รายละเอียด', width: 70 }];
    files.forEach(f => wf.addRow([f.name, f.label, f.dup ? 'ซ้ำ ไม่นับ' : f.used ? 'ใช้คำนวณ' : 'ยังไม่ใช้', f.dup ? f.dupNote : (f.info || '') + (f.dupNote ? ' · ' + f.dupNote : '')]));
    head(wf.getRow(1), 1, 4);

    wb.eachSheet(style);
    [ws, wc, we, wk, wr, wm].forEach(w => { w.getCell('A1').font = { bold: true, size: 14, color: { argb: TEAL }, name: 'Leelawadee UI' }; });
    return wb.xlsx.writeBuffer();
  }

  g.Exporter = { build };
})(window);
