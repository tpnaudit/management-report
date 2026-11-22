/* export.js — ส่งออก Excel หลาย Tab มีสูตรเชื่อมจากหน้าสรุปไปถึงข้อมูลรายบรรทัด เพื่อไล่ที่มาของตัวเลขแต่ละเดือน */
(function (g) {
  'use strict';
  const TEAL = 'FF0E5E6F', TINT = 'FFEEF7F8', LINE = 'FFDBE5E8', INK = 'FF1D2B33', MUTED = 'FF5D6B73';
  const NUM = '#,##0;[Red]-#,##0', NUM2 = '#,##0.00;[Red]-#,##0.00', PCT = '0.0%;[Red]-0.0%';
  const TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const mLabel = k => TH_M[+k.slice(5) - 1] + ' ' + (+k.slice(0, 4) + 543);
  const col = n => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; };
  const S = 'ข้อมูลขาย', X = 'ข้อมูลค่าใช้จ่าย', SUMSHEET = 'สรุป';
  const NAT = { var: 'ผันแปร', fix: 'คงที่', ex: 'ไม่นับ' };
  const GROUP = { dc: 'TTA', cs: 'TTA', ns: 'TTA', promoBill: 'ค่าโปร', promoAccrual: 'ค่าโปร', promo: 'ค่าโปร', logistics: 'ขนส่ง', penalty: 'อื่น ๆ', other: 'อื่น ๆ' };

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

    /* ---------- ข้อมูลรายบรรทัด ---------- */
    const sales = model.sales.slice().sort((a, b) => a.month < b.month ? -1 : a.month > b.month ? 1 : (a.doc < b.doc ? -1 : 1));
    const exps = [];
    model.expenses.forEach(e => exps.push({ month: e.month, channel: e.channel, nat: NAT[e.nature] || e.nature, group: e.channel === 'CJ' ? (GROUP[e.cjType] || 'อื่น ๆ') : '', category: e.category, name: e.name, amount: e.amount, use: e.cjType === 'promoBill' ? 'บิลจริง' : 'ทั้งสอง', source: e.source, file: e.file || '' }));
    cfg.promoRounds.forEach(a => exps.push({ month: a.month, channel: 'CJ', nat: 'ผันแปร', group: 'ค่าโปร', category: 'ค่าโปร 1 แถม 1 (กรอกจากใบแจ้งหนี้)', name: a.label, amount: +a.amount || 0, use: 'บิลจริง', source: 'กรอกเอง', file: '' }));
    months.forEach(m => { const q = model.sales.filter(s => s.month === m && s.channel === 'CJ' && cfg.promo.skus.includes(s.sku)).reduce((s, x) => s + x.qty, 0); if (q) exps.push({ month: m, channel: 'CJ', nat: 'ผันแปร', group: 'ค่าโปร', category: 'ค่าร่วมโปร (ตั้งประมาณการ)', name: `${cfg.promo.rate} บาท x ${q} ถุง (${cfg.promo.skus.join(', ')})`, amount: q * cfg.promo.rate, use: 'ประมาณการ', source: 'สูตร', file: '' }); });
    cfg.adjustments.forEach(a => exps.push({ month: a.month, channel: a.channel, nat: 'ผันแปร', group: a.channel === 'CJ' ? 'อื่น ๆ' : '', category: 'รายการปรับปรุง', name: a.label + ' · ' + a.reason, amount: +a.amount || 0, use: 'ทั้งสอง', source: 'ปรับปรุง', file: '' }));
    exps.sort((a, b) => a.month < b.month ? -1 : a.month > b.month ? 1 : b.amount - a.amount);
    const nS = sales.length + 1, nX = exps.length + 1;
    const sR = c => `'${S}'!$${c}$2:$${c}$${nS}`, xR = c => `'${X}'!$${c}$2:$${c}$${nX}`;
    // ผลรวมตามเงื่อนไข (ใช้เติมค่าในเซลล์ให้เห็นทันทีที่เปิดไฟล์ ก่อน Excel คำนวณสูตร)
    const sSum = (f, m, ch) => sales.filter(s => s.month === m && (!ch || s.channel === ch)).reduce((t, s) => t + f(s), 0);
    const xSum = (m, o) => exps.filter(e => e.month === m && (e.use === 'ทั้งสอง' || e.use === modeLabel) && e.nat !== 'ไม่นับ' && (!o.nat || e.nat === o.nat) && (!o.ch || e.channel === o.ch) && (!o.group || e.group === o.group)).reduce((t, e) => t + e.amount, 0);
    const xF = (mRef, extra) => { const base = `${xR('G')},${xR('A')},${mRef}${extra}`; return `SUMIFS(${base},${xR('H')},"ทั้งสอง")+SUMIFS(${base},${xR('H')},'${SUMSHEET}'!$B$3)`; };

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
    line('cjqty', 'จำนวนที่ส่งเข้า CJ (ทุกสินค้า หน่วย)', (c, m) => `SUMIFS(${sR('F')},${sR('A')},${m},${sR('C')},"CJ")`, m => sSum(s => s.qty, m, 'CJ'));
    line('cjcogs', 'ต้นทุนสินค้า CJ', (c, m) => `SUMIFS(${sR('I')},${sR('A')},${m},${sR('C')},"CJ")`, m => sSum(s => s.cogs, m, 'CJ'));
    [['cjtta', 'หักตามสัญญา (TTA)', 'TTA'], ['cjpromo', 'ค่าโปรและส่วนลด', 'ค่าโปร'], ['cjlogi', 'ขนส่งและค่าลงสินค้า', 'ขนส่ง'], ['cjoth', 'ค่าปรับและอื่น ๆ', 'อื่น ๆ']].forEach(([k, l, gname]) =>
      line(k, l, (c, m) => xF(m, `,${xR('B')},"CJ",${xR('D')},"${gname}"`), m => xSum(m, { ch: 'CJ', group: gname })));
    line('cjnet', 'กำไร CJ หลังค่าใช้จ่ายตรง', c => `${c}${rowOf.cjrev}-${c}${rowOf.cjcogs}-${c}${rowOf.cjtta}-${c}${rowOf.cjpromo}-${c}${rowOf.cjlogi}-${c}${rowOf.cjoth}`, null, NUM, 'tot');
    line('cjnetp', '   % ต่อยอดขาย CJ', c => `IF(${c}${rowOf.cjrev}=0,0,${c}${rowOf.cjnet}/${c}${rowOf.cjrev})`, null, PCT);
    line('cjpp', '   ค่าโปรต่อยอดขาย CJ', c => `IF(${c}${rowOf.cjrev}=0,0,${c}${rowOf.cjpromo}/${c}${rowOf.cjrev})`, null, PCT);
    r++; secRow('ตรวจกับโปรแกรม (ณ เวลาที่ Export แบบ ' + modeLabel + ')');
    { const row = ws.getRow(r); row.getCell(1).value = 'กำไรจากการดำเนินงานตามโปรแกรม'; months.forEach((m, i) => { const c = row.getCell(2 + i); c.value = E.compute(model, cfg, m).totals.op; c.numFmt = NUM; }); rowOf.chk = r; r++; }
    line('chkd', 'ผลต่าง (ควรเป็น 0 ถ้าไม่ได้เปลี่ยนวิธีคิดค่าโปร)', c => `ROUND(${c}${rowOf.op}-${c}${rowOf.chk},0)`, null, NUM);
    ws.getColumn(1).width = 44; for (let i = 0; i < M; i++) ws.getColumn(2 + i).width = 16;

    /* ---------- ช่องทาง ---------- */
    const wc = wb.addWorksheet('ช่องทาง', { views: [{ state: 'frozen', xSplit: 1, ySplit: 4 }] });
    title(wc, 'รายได้และกำไรแยกช่องทาง', `สูตรดึงจาก "${S}" และ "${X}" · ค่าโปรใช้วิธีตาม "${SUMSHEET}"!B3 · ช่องทาง "ส่วนกลาง" คือค่าใช้จ่ายที่ไม่ได้ผูกกับช่องทางใด`);
    const chans = [...new Set(sales.map(s => s.channel))].sort((a, b) => sales.filter(s => s.channel === b).reduce((t, s) => t + s.revenue, 0) - sales.filter(s => s.channel === a).reduce((t, s) => t + s.revenue, 0));
    months.forEach((m, i) => { wc.getCell(3, 2 + i).value = m; wc.getCell(3, 2 + i).font = { size: 8, color: { argb: MUTED } }; wc.getCell(3, 2 + i).alignment = { horizontal: 'right' }; });
    let rc = 4; const blockStart = {};
    const block = (key, label, fx, val, withTotal) => {
      const h = wc.getRow(rc); h.getCell(1).value = label; months.forEach((m, i) => { h.getCell(2 + i).value = mLabel(m); }); head(h, 1, 1 + M); rc++; blockStart[key] = rc;
      chans.forEach((ch, k) => { const row = wc.getRow(rc); row.getCell(1).value = ch; months.forEach((m, i) => { const c = col(2 + i), cell = row.getCell(2 + i); cell.value = { formula: fx(c, `${c}$3`, `$A${rc}`, k), result: val ? val(m, ch) : undefined }; cell.numFmt = NUM; }); rc++; });
      if (withTotal) { const row = wc.getRow(rc); row.getCell(1).value = 'รวม'; months.forEach((m, i) => { const c = col(2 + i); row.getCell(2 + i).value = { formula: `SUM(${c}${blockStart[key]}:${c}${rc - 1})` }; row.getCell(2 + i).numFmt = NUM; }); total(row, 1, 1 + M); rc++; }
      rc++;
    };
    block('rev', 'รายได้สุทธิ', (c, m, a) => `SUMIFS(${sR('G')},${sR('A')},${m},${sR('C')},${a})`, (m, ch) => sSum(s => s.revenue, m, ch), true);
    block('cogs', 'ต้นทุนสินค้า', (c, m, a) => `SUMIFS(${sR('I')},${sR('A')},${m},${sR('C')},${a})`, (m, ch) => sSum(s => s.cogs, m, ch), true);
    block('dir', 'ค่าใช้จ่ายตรงของช่องทาง', (c, m, a) => { const base = `${xR('G')},${xR('A')},${m},${xR('B')},${a}`; return `SUMIFS(${base},${xR('H')},"ทั้งสอง",${xR('C')},"<>ไม่นับ")+SUMIFS(${base},${xR('H')},'${SUMSHEET}'!$B$3,${xR('C')},"<>ไม่นับ")`; }, (m, ch) => xSum(m, { ch }), true);
    block('net', 'กำไรหลังค่าใช้จ่ายตรง', (c, m, a, k) => `${c}${blockStart.rev + k}-${c}${blockStart.cogs + k}-${c}${blockStart.dir + k}`, (m, ch) => sSum(s => s.revenue - s.cogs, m, ch) - xSum(m, { ch }), true);
    { const row = wc.getRow(rc); row.getCell(1).value = 'ค่าใช้จ่ายส่วนกลาง (ยังไม่ได้จัดสรร)'; months.forEach((m, i) => { const c = col(2 + i); const base = `${xR('G')},${xR('A')},${c}$3,${xR('B')},"${E.SHARED}"`; row.getCell(2 + i).value = { formula: `SUMIFS(${base},${xR('C')},"<>ไม่นับ")`, result: xSum(m, { ch: E.SHARED }) }; row.getCell(2 + i).numFmt = NUM; }); total(row, 1, 1 + M); }
    wc.getColumn(1).width = 34; for (let i = 0; i < M; i++) wc.getColumn(2 + i).width = 16;

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

    /* ---------- ข้อมูลขาย ---------- */
    const wsS = wb.addWorksheet(S, { views: [{ state: 'frozen', ySplit: 1 }] });
    wsS.columns = [{ header: 'เดือน', width: 10 }, { header: 'เลขที่เอกสาร', width: 16 }, { header: 'ช่องทาง', width: 14 }, { header: 'รหัสสินค้า', width: 14 }, { header: 'ชื่อสินค้า', width: 40 }, { header: 'จำนวน', width: 10 }, { header: 'รายได้ไม่รวม VAT', width: 16 }, { header: 'ต้นทุน/หน่วย', width: 13 }, { header: 'ต้นทุนรวม', width: 14 }, { header: 'ประเภท', width: 10 }, { header: 'ไฟล์ที่มา', width: 46 }];
    sales.forEach((s, i) => { const u = s.qty ? s.cogs / s.qty : model.costOf(s.sku, s.month); const row = wsS.addRow([s.month, s.doc, s.channel, s.sku, s.name, s.qty, s.revenue, u, { formula: `F${i + 2}*H${i + 2}`, result: s.cogs }, s.ret ? 'รับคืน' : 'ขาย', s.file || '']); row.getCell(6).numFmt = NUM; row.getCell(7).numFmt = NUM2; row.getCell(8).numFmt = NUM2; row.getCell(9).numFmt = NUM2; });
    head(wsS.getRow(1), 1, 11); wsS.autoFilter = { from: 'A1', to: `K${nS}` };

    /* ---------- ข้อมูลค่าใช้จ่าย ---------- */
    const wsX = wb.addWorksheet(X, { views: [{ state: 'frozen', ySplit: 1 }] });
    wsX.columns = [{ header: 'เดือน', width: 10 }, { header: 'ช่องทาง', width: 14 }, { header: 'ลักษณะ', width: 10 }, { header: 'กลุ่ม CJ', width: 10 }, { header: 'หมวด', width: 34 }, { header: 'รายการ', width: 48 }, { header: 'จำนวนเงินไม่รวม VAT', width: 18 }, { header: 'ใช้ในแบบ', width: 12 }, { header: 'ที่มา', width: 18 }, { header: 'ไฟล์ที่มา', width: 46 }];
    exps.forEach(e => { const row = wsX.addRow([e.month, e.channel, e.nat, e.group, e.category, e.name, e.amount, e.use, e.source, e.file]); row.getCell(7).numFmt = NUM2; });
    head(wsX.getRow(1), 1, 10); wsX.autoFilter = { from: 'A1', to: `J${nX}` };

    /* ---------- ตารางจับคู่ ---------- */
    const wm = wb.addWorksheet('ตารางจับคู่');
    title(wm, 'ตารางจับคู่และค่าที่ตั้งไว้', 'สิ่งที่โปรแกรมใช้แปลงไฟล์ดิบเป็นรายงาน');
    let q = 4; const tbl = (t, hdr, rows) => { wm.getCell(q, 1).value = t; sect(wm.getRow(q), 2); q++; hdr.forEach((h, i) => wm.getCell(q, 1 + i).value = h); head(wm.getRow(q), 1, hdr.length); q++; rows.forEach(rw => { rw.forEach((v, i) => wm.getCell(q, 1 + i).value = v); q++; }); q++; };
    tbl('ช่องทางขาย', ['ชื่อในโปรแกรมขาย', 'ช่องทางของ Report'], Object.keys(cfg.channelMap).sort().map(k => [k, cfg.channelMap[k]]));
    tbl('รหัสนำหน้าค่าใช้จ่าย', ['รหัสนำหน้า', 'ลงที่'], Object.keys(cfg.prefixMap).sort().map(k => [k, cfg.prefixMap[k]]));
    tbl('ค่าที่ตั้งไว้', ['รายการ', 'ค่า'], [['ประมาณการค่าร่วมโปร (บาท/ถุง)', cfg.promo.rate], ['สินค้าที่ร่วมโปร', cfg.promo.skus.join(', ')], ['Commercial support %', cfg.tta.cs], ['สาขาใหม่ %', cfg.tta.ns], ['DC fee %', cfg.tta.dc], ['เครดิต CJ (วัน)', cfg.cjCreditDays]]);
    if (cfg.adjustments.length || cfg.promoRounds.length) tbl('รายการที่กรอกเอง', ['รายการ', 'จำนวนเงิน'], cfg.promoRounds.map(a => [`${a.month} บิลค่าโปร: ${a.label}`, +a.amount]).concat(cfg.adjustments.map(a => [`${a.month} ${a.channel}: ${a.label} (${a.reason})`, +a.amount])));
    wm.getColumn(1).width = 46; wm.getColumn(2).width = 30;

    /* ---------- ไฟล์ที่นำเข้า ---------- */
    const wf = wb.addWorksheet('ไฟล์ที่นำเข้า', { views: [{ state: 'frozen', ySplit: 1 }] });
    wf.columns = [{ header: 'ไฟล์ / ชีต', width: 70 }, { header: 'ระบบอ่านเป็น', width: 34 }, { header: 'สถานะ', width: 14 }, { header: 'รายละเอียด', width: 70 }];
    files.forEach(f => wf.addRow([f.name, f.label, f.dup ? 'ซ้ำ ไม่นับ' : f.used ? 'ใช้คำนวณ' : 'ยังไม่ใช้', f.dup ? f.dupNote : (f.info || '') + (f.dupNote ? ' · ' + f.dupNote : '')]));
    head(wf.getRow(1), 1, 4);

    wb.eachSheet(style);
    [ws, wc, wk, wm].forEach(w => { w.getCell('A1').font = { bold: true, size: 14, color: { argb: TEAL }, name: 'Leelawadee UI' }; });
    return wb.xlsx.writeBuffer();
  }

  g.Exporter = { build };
})(window);
