/* importer.js — อ่านไฟล์ export ตามที่ได้มา (ไม่แก้ไฟล์) แล้วแปลงเป็นรายการมาตรฐาน
   รู้จักตารางจากหัวคอลัมน์ ไม่ใช่จากชื่อไฟล์หรือชื่อชีต เพราะลูกค้าเปลี่ยนชื่อ ย้ายคอลัมน์ และรวมหลายชีตไว้ในไฟล์เดียว */
(function (g) {
  'use strict';

  const num = v => typeof v === 'number' ? v : (v == null || v === '' ? 0 : (parseFloat(String(v).replace(/,/g, '')) || 0));
  const str = v => v == null ? '' : String(v).replace(/\s+/g, ' ').trim();

  function toDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return new Date(v.getTime() + 60000); // กันเวลาเที่ยงคืนเพี้ยนไม่กี่วินาที
    const m = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) { let y = +m[3]; if (y > 2400) y -= 543; return new Date(y, +m[2] - 1, +m[1], 12); }
    const d = new Date(v);
    return isNaN(d) ? null : d;
  }
  const monthKey = d => d ? d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') : '';
  const PREFIX_RE = /^([A-Z]{1,4}\d{0,3})-/;

  function findHeader(rows) {
    for (let i = 0; i < Math.min(rows.length, 8); i++) if (rows[i] && str(rows[i][0]) === '#') return i;
    return -1;
  }
  function colIndex(header) {
    const ix = {};
    header.forEach((h, i) => { const k = str(h); if (k && !(k in ix)) ix[k] = i; });
    return ix;
  }
  const isFooter = r => r.some(c => /^(Exported by|Date Time)$/.test(str(c)));

  function parseSales(rows, hi, kind) {
    const H = rows[hi], ix = colIndex(H);
    const cCh = ix['ช่องทางการขาย'];
    // คอลัมน์จับคู่ช่องทางที่ลูกค้าเพิ่มเอง: ชื่อ "ช่องทาง" หรือคอลัมน์ไม่มีหัวถัดจาก "ช่องทางการขาย"
    const cMap = ix['ช่องทาง'] != null ? ix['ช่องทาง'] : (str(H[cCh + 1]) === '' ? cCh + 1 : null);
    const docs = new Map(); const learned = {}; let cancelled = 0, noSku = 0; const valueByMonth = {};
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i]; if (!r || isFooter(r)) continue;
      const no = str(r[ix['รายการ']]); if (!no) continue;
      let d = docs.get(no);
      if (!d) {
        d = { no, date: toDate(r[ix['วันที่ทำรายการ']]), rawChannel: str(r[cCh]), mapped: cMap != null ? str(r[cMap]) : '',
          status: str(r[ix['สถานะรายการ']]), customer: str(r[ix['ชื่อลูกค้า']]), note: str(r[ix['หมายเหตุ']]),
          preVat: num(r[ix['มูลค่ารวมก่อนภาษี']]), value: num(r[ix['มูลค่า']]), payDate: toDate(r[ix['วันที่ชำระเงิน']]), lines: [] };
        docs.set(no, d);
        if (d.mapped) learned[d.rawChannel || '(ไม่ระบุ)'] = d.mapped;
      }
      const sku = str(r[ix['รหัสสินค้า']]);
      if (!sku) {
        // บรรทัดไม่มีรหัสสินค้าแต่มียอด (เช่น ค่าขนส่งที่เก็บจากลูกค้า) นับเป็นรายได้ ไม่มีต้นทุนสินค้า
        noSku++;
        if (num(r[ix['ราคารวม']])) d.lines.push({ sku: '(ไม่มีรหัสสินค้า)', name: str(r[ix['ชื่อสินค้า']]), qty: 0, price: 0, total: num(r[ix['ราคารวม']]) });
        continue;
      }
      d.lines.push({ sku, name: str(r[ix['ชื่อสินค้า']]), qty: num(r[ix['จำนวน']]), price: num(r[ix['ราคาต่อหน่วย']]), total: num(r[ix['ราคารวม']]) });
    }
    const out = [];
    docs.forEach(d => {
      if (d.status === 'ถูกยกเลิก') { cancelled++; return; }
      const sum = d.lines.reduce((s, l) => s + l.total, 0), q = d.lines.reduce((s, l) => s + l.qty, 0);
      // บิลที่บรรทัดสินค้าไม่มีราคาแต่หัวบิลมียอด กระจายยอดหัวบิลตามจำนวน
      if (!sum && d.preVat && q) d.lines.forEach(l => { l.total = d.preVat * l.qty / q; });
      const f = sum ? d.preVat / sum : (d.preVat && q ? 1 : 0); // ปรับเป็นยอดก่อน VAT และกระจายส่วนลดท้ายบิล
      const month = monthKey(d.date);
      valueByMonth[month] = (valueByMonth[month] || 0) + d.value;
      d.lines.forEach((l, li) => out.push({ kind, doc: d.no, date: d.date, month, first: li === 0, value: d.value, payDate: d.payDate, rawChannel: d.rawChannel || '(ไม่ระบุ)',
        customer: d.customer, note: d.note, sku: l.sku, name: l.name, qty: l.qty, price: l.price, revenue: l.total * f }));
    });
    return { lines: out, learned, valueByMonth, cancelled, hasMap: cMap != null && Object.keys(learned).length > 0,
      info: `${docs.size} เอกสาร ${out.length} บรรทัด` + (cancelled ? ` · ตัดรายการยกเลิก ${cancelled}` : '') + (noSku ? ` · ไม่มีรหัสสินค้า ${noSku} แถว` : '') };
  }

  function parseExpenses(rows, hi) {
    const ix = colIndex(rows[hi]); const docs = new Map();
    const cCode = ix['ช่องทาง'] != null ? ix['ช่องทาง'] : ix['Code Group']; let anyCode = false;
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i]; if (!r || isFooter(r)) continue;
      const id = str(r[0]); const name = str(r[ix['ชื่อรายการ']]); if (!id || !name) continue;
      let d = docs.get(id);
      if (!d) { d = { date: toDate(r[ix['วันที่ทำรายการ']]), contact: str(r[ix['ชื่อผู้ติดต่อ']]), preVat: num(r[ix['มูลค่ารวมก่อนภาษี']]), lines: [] }; docs.set(id, d); }
      const cat = str(r[ix['หมวดหมู่']]); const code = cCode != null ? str(r[cCode]) : ''; if (code) anyCode = true;
      const nat = ix['ลักษณะต้นทุน'] != null ? str(r[ix['ลักษณะต้นทุน']]) : '';
      // รหัสช่องทาง: ลูกค้าใส่ไว้หน้าชื่อรายการ (ก.ย.) หรือหน้าหมวด (ก.ค.–ส.ค.) หรือคอลัมน์แยก
      const m = name.match(PREFIX_RE) || cat.match(PREFIX_RE);
      d.lines.push({ name, category: cat.replace(PREFIX_RE, ''), prefix: m ? m[1] : code, hint: nat === 'คงที่' ? 'fix' : nat === 'ผันแปร' ? 'var' : '', total: num(r[ix['ราคารวม']]), payDate: toDate(r[ix['วันที่ชำระเงิน']]), payStatus: str(r[ix['สถานะการชำระเงิน']]) });
    }
    const out = [];
    docs.forEach(d => {
      const sum = d.lines.reduce((s, l) => s + l.total, 0); const f = sum && d.preVat ? d.preVat / sum : 1;
      d.lines.forEach(l => out.push({ source: 'รายจ่ายอื่น', date: d.date, month: monthKey(d.date), contact: d.contact, name: l.name, category: l.category, prefix: l.prefix, hint: l.hint, amount: l.total * f, payDate: l.payDate, payStatus: l.payStatus }));
    });
    return { lines: out, hasMap: anyCode, info: `${docs.size} เอกสาร ${out.length} บรรทัด` };
  }

  function parseOrderExp(rows, hi) {
    const ix = colIndex(rows[hi]); const out = []; let cur = '', po = 0, n = 0;
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i]; if (!r || isFooter(r)) continue;
      if (str(r[ix['รายการ']])) { cur = str(r[ix['รายการ']]); n++; if (/^PO/i.test(cur)) po++; }
      const name = str(r[ix['ชื่อ']]); const amt = num(r[ix['มูลค่า']]);
      if (name && amt) out.push({ doc: cur, name, amount: amt, payDate: toDate(r[ix['วันที่ชำระเงิน']]) });
    }
    return { lines: out, isPurchase: n > 0 && po > n / 2, info: `${out.length} บรรทัด` };
  }

  // ใบซื้อสินค้า: ใช้ระดับใบ (ยอดรวมและวันที่จ่าย) สำหรับหน้าเงินสด
  function parsePurchases(rows, hi) {
    const ix = colIndex(rows[hi]); const docs = new Map();
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i]; if (!r || isFooter(r)) continue; const no = str(r[ix['รายการ']]); if (!no || docs.has(no)) continue;
      const date = toDate(r[ix['วันที่ทำรายการ']]);
      docs.set(no, { doc: no, date, month: monthKey(date), contact: str(r[ix['ชื่อผู้ติดต่อ']]), value: num(r[ix['มูลค่า']]), payDate: toDate(r[ix['วันที่ชำระเงิน']]), payStatus: str(r[ix['สถานะการชำระเงิน']]) });
    }
    return { lines: [...docs.values()], info: `${docs.size} ใบซื้อ · ใช้ในหน้าเงินสด` };
  }

  function parseStock(rows, hi, sheetName) {
    const ix = colIndex(rows[hi]); const out = []; let asOf = null;
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;
      if (isFooter(r)) { const k = r.findIndex(c => str(c) === 'Date Time'); if (k >= 0) asOf = toDate(r[k + 1]); continue; }
      const sku = str(r[ix['รหัส']]); if (!sku) continue;
      out.push({ sku, name: str(r[ix['สินค้า']]), category: str(r[ix['หมวดหมู่']]), cost: num(r[ix['ต้นทุน/หน่วย']]), avgBuy: num(r[ix['ราคาซื้อเฉลี่ย/หน่วย']]), qty: num(r[ix['จำนวนทั้งหมด']]), value: num(r[ix['มูลค่าทั้งหมด (บาท)']]) });
    }
    // ไฟล์สต๊อก export หลังสิ้นเดือน: ถือเป็นสต๊อกของเดือนก่อนวันที่ export
    // ถ้าชื่อชีตบอกเดือนไว้ (เช่น "สรุปมูลค่าสินค้าคงเหลือ 07.2026") ใช้เดือนนั้น
    let month = ''; const sm = String(sheetName || '').match(/(\d{2})\.(\d{4})/), sy = String(sheetName || '').match(/\b(20\d{2})\s*$/);
    if (sm) month = sm[2] + '-' + sm[1];
    else if (sy) month = sy[1] + '-12';
    else if (asOf) { const d = new Date(asOf.getFullYear(), asOf.getMonth() - 1, 15); month = monthKey(d); }
    return { lines: out, month, info: `${out.length} SKU` + (month ? ` · ถือเป็นสิ้นเดือน ${month}` : '') };
  }

  // ตารางต้นทุนถัวเฉลี่ยรายงวดที่สำนักงานคำนวณ (ชีต "ต้นทุนราย SKU"): งวด | SKU | ... | ต้นทุนถัวเฉลี่ย/หน่วย
  const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  function periodMonth(v) {
    if (v instanceof Date) return monthKey(toDate(v));
    const s = str(v); let best = -1, mon = -1;
    TH_MON.forEach((m, i) => { const k = s.lastIndexOf(m); if (k > best) { best = k; mon = i; } });
    const y = s.match(/(\d{2,4})\s*$/);
    if (mon < 0 || !y) return '';
    let yy = +y[1]; if (yy < 100) yy += 2000; if (yy > 2400) yy -= 543;
    return yy + '-' + String(mon + 1).padStart(2, '0');
  }
  function parseCost(rows, hi) {
    const ix = colIndex(rows[hi]); const out = []; const c = ix['ต้นทุนถัวเฉลี่ย/หน่วย'];
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue; const sku = str(r[ix['SKU']]), month = periodMonth(r[ix['งวด']]);
      if (sku && month && num(r[c]) > 0) out.push({ month, sku, cost: num(r[c]) });
    }
    const ms = [...new Set(out.map(l => l.month))].sort();
    return { lines: out, info: `${out.length} บรรทัด · งวด ${ms.join(', ')}` };
  }

  function parseSalesSummary(rows, hi) {
    const ix = colIndex(rows[hi]); const byMonth = {}; let n = 0;
    for (let i = hi + 1; i < rows.length; i++) { const r = rows[i]; if (!r || !str(r[ix['รายการ']])) continue; const m = monthKey(toDate(r[ix['วันที่']])); byMonth[m] = (byMonth[m] || 0) + num(r[ix['ยอดขาย']]); n++; }
    return { byMonth, info: `${n} เอกสาร ใช้ตรวจยอดขาย` };
  }

  // ไฟล์ xlsx บางไฟล์หัวไฟล์ 30 ไบต์แรกเสีย (เจอจริงในไฟล์ค่าใช้จ่าย ก.ค. 69) Excel เปิดได้แต่ไลบรารีอ่านไม่ได้
  // ซ่อมโดยเขียนหัวของไฟล์ย่อยตัวแรกขึ้นใหม่จากสารบัญท้ายไฟล์ (ทำกับสำเนาในหน่วยความจำ ไม่แตะไฟล์จริง)
  function repairZip(buf) {
    const u = new Uint8Array(buf);
    if (u.length < 100 || (u[0] === 0x50 && u[1] === 0x4b) || (u[0] === 0xd0 && u[1] === 0xcf)) return null;
    const dv = new DataView(u.buffer, u.byteOffset, u.byteLength); let e = -1;
    for (let i = u.length - 22; i >= Math.max(0, u.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) return null;
    const cd = dv.getUint32(e + 16, true);
    if (cd + 46 > u.length || dv.getUint32(cd, true) !== 0x02014b50 || dv.getUint32(cd + 42, true) !== 0) return null;
    const nameLen = dv.getUint16(cd + 28, true), csize = dv.getUint32(cd + 20, true);
    const next = cd + 46 + nameLen + dv.getUint16(cd + 30, true) + dv.getUint16(cd + 32, true);
    const off2 = next + 46 <= u.length && dv.getUint32(next, true) === 0x02014b50 ? dv.getUint32(next + 42, true) : cd;
    const extra = off2 - 30 - nameLen - csize; if (extra < 0 || extra > 65535) return null;
    const out = u.slice(), o = new DataView(out.buffer);
    o.setUint32(0, 0x04034b50, true);
    for (let k = 0; k < 22; k += 2) o.setUint16(4 + k, dv.getUint16(cd + 6 + k, true), true); // version, flags, method, time, date, crc, sizes
    o.setUint16(26, nameLen, true); o.setUint16(28, extra, true);
    return out;
  }

  // อ่านไฟล์ 1 ไฟล์ → รายการส่วน (1 ชีตที่รู้จัก = 1 ส่วน)
  function parseFile(name, buf) {
    const one = o => [Object.assign({ name, file: name, kind: 'unknown', label: 'ไม่รู้จักรูปแบบ', used: false, info: '' }, o)];
    if (/\.pdf$/i.test(name)) return one({ kind: 'pdf', label: 'เอกสาร PDF', info: 'ไม่อ่านอัตโนมัติ ใช้อ้างอิงตอนกรอกบิล CJ' });
    if (!/\.xlsx?$/i.test(name)) return one({ info: 'ไม่ใช่ไฟล์ Excel' });
    let wb; const fixed = repairZip(buf);
    try { wb = XLSX.read(fixed || buf, { type: 'array', cellDates: true }); } catch (e) { return one({ info: 'เปิดไฟล์ไม่ได้: ' + e.message }); }
    const parts = [];
    wb.SheetNames.forEach(sn => {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: null, raw: true });
      const hc = rows.slice(0, 12).findIndex(r => r && str(r[0]) === 'งวด' && str(r[1]) === 'SKU' && r.map(str).includes('ต้นทุนถัวเฉลี่ย/หน่วย'));
      if (hc >= 0) { parts.push(Object.assign({ name: name + ' › ' + sn, file: name, kind: 'costTable', label: 'ต้นทุนถัวเฉลี่ยรายงวด (สำนักงาน)', used: true }, parseCost(rows, hc))); return; }
      // Report ของสำนักงาน ชีต Expense Data: ใช้เติมเฉพาะเดือนที่ไฟล์ดิบขาด
      const ho = rows.slice(0, 10).findIndex(r => r && r.map(str).includes('ประเภทค่าใช้จ่าย') && r.map(str).includes('จำนวนเงินไม่รวม VAT'));
      if (ho >= 0) {
        const ix = colIndex(rows[ho]), lines = [];
        for (let i = ho + 1; i < rows.length; i++) {
          const r = rows[i]; if (!r) continue; const amt = num(r[ix['จำนวนเงินไม่รวม VAT']]), month = monthKey(toDate(r[ix['เดือน']]));
          if (amt && month) lines.push({ month, name: str(r[ix['ประเภทค่าใช้จ่าย']]), category: str(r[ix['หมวดค่าใช้จ่าย']]), detail: str(r[ix['รายละเอียด']]), channel: str(r[ix['ช่องทาง']]), amount: amt });
        }
        parts.push({ name: name + ' › ' + sn, file: name, kind: 'officeExp', label: 'ค่าใช้จ่ายใน Report สำนักงาน', used: true, lines, info: `${lines.length} บรรทัด · ใช้เติมเฉพาะเดือนที่ไฟล์ดิบขาด` }); return;
      }
      // ไฟล์ที่ลูกค้าสรุปเอง: ยอดขาย CJ แยกคลังรายเดือน และอัตราค่ารถไปแต่ละคลัง
      const hw = rows.slice(0, 12).findIndex(r => r && str(r[0]) === 'เดือน' && r.map(str).includes('รวม'));
      if (hw >= 0 && !parts.some(p => p.kind === 'cjWarehouse')) {
        const yr = (rows.slice(0, hw).map(r => r.map(str).join(' ')).join(' ') + ' ' + name).match(/(25\d{2}|20\d{2})/); let y = yr ? +yr[1] : new Date().getFullYear(); if (y > 2400) y -= 543;
        const whs = rows[hw].map(str), lines = [];
        for (let i = hw + 1; i < rows.length; i++) { const r = rows[i]; if (!r) continue; const mi = TH_MON.indexOf(str(r[0])); if (mi < 0) break; whs.forEach((w, c) => { if (c > 0 && w && w !== 'รวม') lines.push({ month: y + '-' + String(mi + 1).padStart(2, '0'), wh: w, sales: num(r[c]) }); }); }
        parts.push({ name: name + ' › ' + sn, file: name, kind: 'cjWarehouse', label: 'ยอดขาย CJ แยกคลัง (ลูกค้าสรุป)', used: true, lines, info: `${lines.length} ช่อง · ปี ${y}` }); return;
      }
      const ht = rows.slice(0, 15).findIndex(r => r && str(r[0]) === 'คลัง CJ' && r.map(str).includes('ประเภทรถ'));
      if (ht >= 0) {
        const H = rows[ht].map(str), cB = H.findIndex(h => h.indexOf('ต่อถุง สูงสุด') === 0), cT = H.findIndex(h => h.indexOf('ค่ารถสูงสุด') === 0), lines = [];
        for (let i = ht + 1; i < rows.length; i++) { const r = rows[i]; if (!r || !str(r[1])) break; lines.push({ wh: str(r[0]), type: str(r[1]), trip: num(r[cT]), perBag: num(r[cB]) }); }
        parts.push({ name: name + ' › ' + sn, file: name, kind: 'truckRates', label: 'อัตราค่ารถไปคลัง CJ (ลูกค้าสรุป)', used: true, lines, info: `${lines.length} บรรทัด` }); return;
      }
      const hi = findHeader(rows); if (hi < 0) return;
      const hs = rows[hi].map(str); const has = k => hs.includes(k);
      const P = (o, parsed) => { const p = Object.assign({ name: name + ' › ' + sn, file: name, used: false, info: '' }, o, parsed || {}); if (fixed) p.info += ' · หัวไฟล์เสีย ซ่อมตอนอ่านแล้ว'; parts.push(p); };
      if (has('รหัสสินค้า') && has('ช่องทางการขาย') && has('รายการ')) {
        const ret = /รับคืน/.test(sn);
        P({ kind: ret ? 'returns' : 'sales', label: ret ? 'รับคืนสินค้า' : 'รายการขาย (รายบรรทัด)', used: true }, parseSales(rows, hi, ret ? 'return' : 'sale'));
      } else if (has('ชื่อรายการ') && has('หมวดหมู่') && has('ราคารวม')) P({ kind: 'expenses', label: 'รายจ่ายอื่น', used: true }, parseExpenses(rows, hi));
      else if (has('ชื่อ') && has('มูลค่า') && has('รายการ') && !has('รหัสสินค้า')) {
        const p = parseOrderExp(rows, hi);
        if (p.isPurchase) P({ kind: 'purchaseExp', label: 'ค่าใช้จ่ายนำเข้า (ผูกใบซื้อ)', used: true }, Object.assign(p, { info: p.info + ' · ใช้ในหน้าเงินสด' }));
        else P({ kind: 'orderExp', label: 'ค่าใช้จ่ายที่ผูกกับใบขาย', used: true }, p);
      } else if (has('รหัส') && has('ต้นทุน/หน่วย')) P({ kind: 'stock', label: 'มูลค่าสินค้าคงเหลือ', used: true }, parseStock(rows, hi, sn));
      else if (has('ยอดขาย') && has('ช่องทางการขาย')) P({ kind: 'salesSummary', label: 'สรุปยอดขายรายเอกสาร', used: true }, parseSalesSummary(rows, hi));
      else if (has('รหัสสินค้า') && has('ชื่อผู้ติดต่อ')) P({ kind: 'purchases', label: 'รายการซื้อสินค้า', used: true }, parsePurchases(rows, hi));
      else if (sn === 'ยอดซื้อ' || has('ยอดซื้อ')) P({ kind: 'purchaseSummary', label: 'สรุปยอดซื้อ', info: 'รู้จักแล้ว ยังไม่ใช้ในรุ่นตัวอย่าง' });
    });
    if (parts.length === 1) parts[0].name = name;
    if (parts.length) return parts;
    if (wb.SheetNames.includes('orders')) return one({ kind: 'shopee', label: 'ออเดอร์ Shopee', info: 'รู้จักแล้ว ยังไม่ใช้ในรุ่นตัวอย่าง (ค่าธรรมเนียม Shopee)' });
    return one({ info: 'ไม่พบหัวตารางที่รู้จัก' });
  }

  g.Importer = { parseFile, monthKey, num, str };
})(window);
