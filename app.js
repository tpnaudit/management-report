/* app.js — หน้าจอ */
(function () {
  'use strict';
  const E = Engine, $ = s => document.querySelector(s), view = $('#view');
  const KEY = 'mr_cfg_v3';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const f0 = n => (Math.round(n) || 0).toLocaleString('en-US');
  const f2 = n => (+n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pc = n => ((+n || 0) * 100).toFixed(1) + '%';
  const cls = n => n < -0.005 ? ' neg' : '';
  const TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const mShort = k => k ? TH_M[+k.slice(5) - 1] : '';
  const mLabel = k => k ? TH_M[+k.slice(5) - 1] + ' ' + (+k.slice(0, 4) + 543) : '';

  let hosted = false, hostKey = '';
  let cfg = loadCfg(), files = [], model = null, tab = 'import', month = '', sample = null, cjScope = 'promo', sim = null, picked = false;

  function loadCfg() {
    const d = JSON.parse(JSON.stringify(E.DEFAULT_CFG)), cl = window.MR_CLIENT || {};
    Object.keys(cl).forEach(k => { d[k] = (d[k] && typeof d[k] === 'object' && !Array.isArray(d[k])) ? Object.assign(d[k], cl[k]) : cl[k]; });
    let srev = 0; try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) srev = s.rev || 0; if (s) Object.keys(d).forEach(k => { if (s[k] != null) d[k] = (typeof d[k] === 'object' && !Array.isArray(d[k])) ? Object.assign(d[k], s[k]) : s[k]; }); } catch (e) { /* ใช้ค่าเริ่มต้น */ }
    // ไฟล์ค่าเฉพาะกิจการมี rev ใหม่กว่าที่บันทึกไว้: ใช้ตารางจับคู่และกฎจากไฟล์นั้นทับ 1 ครั้ง
    if (cl.rev && srev !== cl.rev) { ['channelMap', 'prefixMap'].forEach(k => Object.assign(d[k], cl[k] || {})); ['channelRules', 'noCJ', 'excludeWords', 'purchaseFeeSkus', 'partialWords', 'purchaseMonth'].forEach(k => { if (cl[k]) d[k] = cl[k]; }); d.rev = cl.rev; }
    return d;
  }
  function saveCfg() { try { localStorage.setItem(hosted ? hostKey : KEY, JSON.stringify(cfg)); } catch (e) { /* เก็บไม่ได้ก็ยังใช้งานต่อได้ */ } }

  function rebuild() {
    model = files.some(f => f.used) ? E.build(files, cfg) : null;
    if (model && !model.months.includes(month)) month = model.mainMonth;
    saveCfg(); sim = null; pr = null;
    $('#month').innerHTML = model ? model.months.map(m => `<option value="${m}"${m === month ? ' selected' : ''}>${mLabel(m)}</option>`).join('') : '<option>-</option>';
    $('#range').textContent = model && model.months.length ? `ข้อมูล ${mLabel(model.months[0])} ถึง ${mLabel(model.months[model.months.length - 1])}` : 'รายงานผลดำเนินงานรายเดือน';
    render();
  }

  async function addFiles(list) {
    for (const f of list) {
      const buf = f.buf || await f.arrayBuffer();
      const parts = Importer.parseFile(f.name, buf);
      files = files.filter(x => x.file !== f.name).concat(parts);
    }
    const first = !model; rebuild();
    if (first && model) { if (!picked || tab === 'import') tab = model.months.length > 1 ? 'trend' : 'overview'; render(); }
  }
  async function loadSample() {
    if (!sample) return;
    view.innerHTML = '<div class="empty">กำลังอ่านไฟล์จากโฟลเดอร์ตัวอย่าง…</div>';
    const list = [];
    for (const n of sample.files) {
      try { const r = await fetch('sample/' + n.split('/').map(encodeURIComponent).join('/')); if (r.ok) list.push({ name: n, buf: await r.arrayBuffer() }); }
      catch (e) { /* ไฟล์ที่อ่านไม่ได้ (เช่น เปิดค้างในโปรแกรมอื่น) ข้ามไป */ }
    }
    await addFiles(list);
  }

  /* ---------- ส่วนประกอบ ---------- */
  const tip = k => `<button type="button" class="tip" data-tip="${k}" aria-label="คำอธิบาย">i</button>`;
  const H = (title, k, sub) => `<h2>${title}${k ? tip(k) : ''}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}`;
  const lead = (kind, title, text) => `<div class="lead ${kind}"><div class="lt">${title}</div><div>${text}</div></div>`;
  const N = new Proxy({}, { get: (t, k) => (cfg.notes || {})[k] });
  const modeName = m => m === 'actual' ? 'ตามบิล CJ จริง' : `ตั้งประมาณการ ${cfg.promo.rate} บาท/ถุง`;
  const arrow = (now, prev, pct) => { if (prev == null || !isFinite(prev) || prev === 0) return ''; const d = pct ? now - prev : now / prev - 1; const up = d >= 0; return `<span class="dl ${up ? 'up' : 'dn'}">${up ? '▲' : '▼'} ${pct ? Math.abs(d * 100).toFixed(1) + ' จุด' : Math.abs(d * 100).toFixed(0) + '%'}</span>`; };
  function kpi(label, k, value, note, o) {
    o = o || {};
    return `<div class="kpi${o.bad ? ' bad' : ''}${o.big ? ' big' : ''}"><div class="l">${label}${k ? tip(k) : ''}</div><div class="v">${value}</div><div class="n">${o.delta || ''}${note ? `<span>${note}</span>` : ''}</div></div>`;
  }
  function bars(items) { // แท่งแนวนอน [{label, value}]
    const max = Math.max(1, ...items.map(i => Math.abs(i.value)));
    return '<div class="bars">' + items.map(i => `<div>${esc(i.label)}</div><div class="track"><div class="bar${i.value < 0 ? ' neg' : ''}" style="left:0;width:${Math.abs(i.value) / max * 100}%"></div></div><div class="val${cls(i.value)}">${f0(i.value)}</div>`).join('') + '</div>';
  }
  function cols(items, fmt) { // แท่งแนวตั้งรายเดือน [{label, value, hot}]
    const max = Math.max(0, ...items.map(i => i.value)), min = Math.min(0, ...items.map(i => i.value)), span = (max - min) || 1, P = max / span * 100, N = 100 - P;
    return `<div class="cols">${items.map(i => { const h = Math.abs(i.value) / span * 100; return `<div class="col${i.hot ? ' hot' : ''}"><div class="cv${cls(i.value)}">${fmt(i.value)}</div><div class="plot"><div class="pos" style="height:${P}%"><div class="b" style="height:${i.value > 0 && P ? h / P * 100 : 0}%"></div></div><div class="ng" style="height:${N}%"><div class="b" style="height:${i.value < 0 && N ? h / N * 100 : 0}%"></div></div></div><div class="cl">${esc(i.label)}</div></div>`; }).join('')}</div>`;
  }
  function waterfall(steps) { // [{label, value}] ตัวแรกคือราคา ตัวสุดท้ายคือผลลัพธ์
    const max = steps[0].value || 1; let run = 0;
    return '<div class="bars">' + steps.map((s, i) => {
      let left, w, c;
      if (i === 0) { left = 0; w = s.value; run = s.value; c = ' end'; }
      else if (i === steps.length - 1) { left = 0; w = Math.abs(s.value); c = s.value < 0 ? ' neg' : ' end'; }
      else { run += s.value; left = run; w = -s.value; c = ' neg'; }
      const L = Math.max(0, left) / max * 100, W = Math.max(0.4, Math.min(100 - L, w / max * 100));
      return `<div>${esc(s.label)}</div><div class="track"><div class="bar${c}" style="left:${L}%;width:${W}%"></div></div><div class="val${cls(s.value)}">${f2(s.value)}</div>`;
    }).join('') + '</div>';
  }
  const stepsOf = d => [{ label: 'ราคาขายต่อถุง', value: d.unit.price }, { label: 'หักตามสัญญา (TTA)', value: -d.unit.tta }, { label: 'ค่าโปร 1 แถม 1', value: -d.unit.promoMain }, { label: 'ค่าโปรและค่าปรับอื่น', value: -d.unit.promoOther }, { label: 'ต้นทุนสินค้า', value: -d.unit.cogs }, { label: 'ขนส่งและค่าลงสินค้า', value: -d.unit.logistics }, { label: 'กำไรต่อถุง', value: d.unit.profit }];
  const prevOf = m => { const i = model.months.indexOf(m); return i > 0 ? model.months[i - 1] : null; };

  /* ---------- แนวโน้ม ---------- */
  function vTrend() {
    const T = E.trend(model, cfg), A = E.trend(model, cfg, 'actual'), B = E.trend(model, cfg, 'accrual'), si = Math.max(0, T.findIndex(t => t.month === month)), L = T[si], AL = A[si];
    const sec = l => `<tr class="sec"><td colspan="${1 + T.length * 2}">${l}</td></tr>`;
    const ap = (l, f, base, k, fmt) => `<tr${k ? ' class="' + k + '"' : ''}><td>${l}</td>${T.map(t => { const v = f(t), b = base(t); return `<td class="r${cls(v)}">${(fmt || f0)(v)}</td><td class="r pct${cls(v)}">${b ? pc(v / b) : ''}</td>`; }).join('')}</tr>`;
    const miss = T.filter(t => !t.has.expenses || (!t.has.orderExp && !t.has.fill)), filled = T.filter(t => t.has.fill);
    const before = A.slice(0, si).filter(t => t.promoQty > 0), others = before.length ? before : A.filter((t, i) => i !== si && t.promoQty > 0), cmp = before.length ? 'เดือนก่อนหน้า' : 'เดือนอื่น', avgQ = others.length ? others.reduce((s, t) => s + t.promoQty, 0) / others.length : 0, avgU = others.length ? others.reduce((s, t) => s + t.unit.profit, 0) / others.length : 0;
    const col = (f, fmt) => cols(T.map(t => ({ label: mShort(t.month), value: f(t), hot: t.month === month })), fmt);
    return `
    ${T.length > 1 ? lead(AL.unit.profit < avgU * 0.5 ? 'warn' : 'ok', `สรุป ${mLabel(L.month)}`, `ส่ง${esc(N.productLabel || 'สินค้าที่ร่วมโปร')}เข้า CJ <b>${f0(L.promoQty)} ถุง</b>${avgQ ? ` (${(L.promoQty / avgQ).toFixed(1)} เท่าของค่าเฉลี่ย${cmp})` : ''} ถ้านับค่าโปร 1 แถม 1 ตามบิลจริง เหลือกำไร <b class="${AL.unit.profit < 0 ? 'neg' : ''}">${f2(AL.unit.profit)} บาทต่อถุง</b> เทียบกับเฉลี่ย${cmp} ${f2(avgU)} บาท ส่วนแบบตั้งประมาณการ ${cfg.promo.rate} บาท/ถุงจะเห็นเป็น ${f2(B[si].unit.profit)} บาท`) : ''}
    <div class="grid g2">
      <div class="card">${H('กำไรต่อถุงที่ขายให้ CJ', 'tUnit', 'บาทต่อถุง · ' + modeName(cfg.promo.mode))}${col(t => t.unit.profit, f2)}</div>
      <div class="card">${H(cfg.promo.mode === 'actual' ? 'ค่าโปรตามบิล CJ ต่อยอดขาย CJ' : 'ค่าโปร (ตั้งประมาณการ) ต่อยอดขาย CJ', 'tPromoPct', 'ไม่รวมส่วนที่หักตามสัญญา · ' + modeName(cfg.promo.mode))}${col(t => t.cjRev ? t.cjPromo / t.cjRev : 0, pc)}</div>
      <div class="card">${H('กำไรจาก CJ ทั้งเดือน', 'tCj', 'บาท หลังค่าใช้จ่ายตรงของ CJ · ' + modeName(cfg.promo.mode))}${col(t => t.cjContrib, f0)}</div>
      <div class="card">${H('จำนวนถุงที่ส่งเข้า CJ', 'tQty', 'เฉพาะสินค้าที่ร่วมโปร: ' + esc(cfg.promo.skus.join(', ')))}${col(t => t.promoQty, f0)}</div>
      <div class="card">${H('% กำไรขั้นต้น (GP) ทั้งบริษัท', 'tGp', 'กำไรขั้นต้นต่อรายได้สุทธิ')}${col(t => t.gm, pc)}</div>
      <div class="card">${H('% กำไรจากการดำเนินงาน (NP) ทั้งบริษัท', 'tNp', 'กำไรจากการดำเนินงานต่อรายได้สุทธิ · ' + modeName(cfg.promo.mode))}${col(t => t.revenue ? t.op / t.revenue : 0, pc)}</div>
    </div>
    <div class="card">${H('ตารางเทียบรายเดือน', 'tTable', `วิธีคิดค่าโปร 1 แถม 1: ${modeName(cfg.promo.mode)} · คอลัมน์ % คือสัดส่วนต่อยอดขายของกลุ่มนั้น`)}
      <div class="tw"><table class="trend"><thead>
        <tr><th rowspan="2">รายการ</th>${T.map(t => `<th class="r mh" colspan="2">${mLabel(t.month)}</th>`).join('')}</tr>
        <tr>${T.map(() => '<th class="r">บาท</th><th class="r pct">% ต่อยอดขาย</th>').join('')}</tr></thead><tbody>
      ${sec('ทั้งบริษัท · % ต่อรายได้สุทธิ')}
      ${ap('รายได้สุทธิ', t => t.revenue, t => t.revenue)}
      ${ap('ต้นทุนขาย', t => t.cogs, t => t.revenue)}
      ${ap('กำไรขั้นต้น', t => t.gp, t => t.revenue)}
      ${ap('ค่าใช้จ่ายผันแปร', t => t.varExp, t => t.revenue)}
      ${ap('ค่าใช้จ่ายคงที่', t => t.fixExp, t => t.revenue)}
      ${ap('กำไรจากการดำเนินงาน', t => t.op, t => t.revenue, 'tot')}
      ${sec('CJ · % ต่อยอดขาย CJ')}
      ${ap('ยอดขาย CJ', t => t.cjRev, t => t.cjRev)}
      ${ap('ต้นทุนสินค้า', t => t.cjCogs, t => t.cjRev)}
      ${ap('กำไรขั้นต้นตามใบกำกับ', t => t.cjRev - t.cjCogs, t => t.cjRev)}
      ${ap('หักตามสัญญา (TTA)', t => t.cjTta, t => t.cjRev)}
      ${ap('ค่าโปรและส่วนลด', t => t.cjPromo, t => t.cjRev)}
      ${ap('ขนส่งและค่าลงสินค้า', t => t.cjLogi, t => t.cjRev)}
      ${ap('กำไร CJ หลังค่าใช้จ่ายตรง', t => t.cjContrib, t => t.cjRev, 'tot')}
      ${sec('สินค้าที่ร่วมโปร ต่อถุง · % ต่อราคาขาย')}
      <tr><td>จำนวนถุงที่ส่งเข้า CJ</td>${T.map(t => `<td class="r">${f0(t.promoQty)}</td><td class="r pct"></td>`).join('')}</tr>
      ${ap('ราคาขาย', t => t.unit.price, t => t.unit.price, '', f2)}
      ${ap('หักตามสัญญา (TTA)', t => t.unit.tta, t => t.unit.price, '', f2)}
      ${ap('ค่าโปร 1 แถม 1', t => t.unit.promoMain, t => t.unit.price, '', f2)}
      ${ap('ค่าโปรและค่าปรับอื่น', t => t.unit.promoOther, t => t.unit.price, '', f2)}
      ${ap('ต้นทุนสินค้า', t => t.unit.cogs, t => t.unit.price, '', f2)}
      ${ap('ขนส่งและค่าลงสินค้า', t => t.unit.logistics, t => t.unit.price, '', f2)}
      ${ap('กำไรต่อถุง', t => t.unit.profit, t => t.unit.price, 'tot', f2)}
      <tr><td>กำไรต่อถุง ถ้าใช้บิล CJ จริง</td>${T.map((t, i) => `<td class="r${cls(A[i].unit.profit)}">${f2(A[i].unit.profit)}</td><td class="r pct${cls(A[i].unit.profit)}">${pc(t.unit.price ? A[i].unit.profit / t.unit.price : 0)}</td>`).join('')}</tr>
      </tbody></table></div>
      ${miss.length ? `<div class="note"><b class="neg">ข้อมูลไม่ครบ:</b> ${miss.map(t => mLabel(t.month) + ' ไม่มี' + [!t.has.expenses ? 'ไฟล์รายจ่ายอื่น' : '', !t.has.orderExp ? 'ไฟล์ค่าขนส่งรายบิล' : ''].filter(Boolean).join('และ')).join(' · ')} กำไรของเดือนนั้นจึงสูงกว่าความจริง</div>` : ''}
      ${filled.length ? `<div class="note">${filled.map(t => mLabel(t.month)).join(', ')}: ไม่มีไฟล์ค่าขนส่งรายบิล ใช้ค่าขนส่งตามช่องทางจาก Management Report ของสำนักงานแทน</div>` : ''}</div>`;
  }

  /* ---------- ภาพรวมเดือน ---------- */
  // คำเตือนเฉพาะช่องทาง (เช่น ข้อมูลค่าใช้จ่ายยังไม่ครบ) แสดงทั้งมุมมองสำนักงานและมุมมองผู้บริหาร
  const chMark = c => (N.channelWarn && N.channelWarn[c]) ? ' <sup class="neg">*</sup>' : '';
  const chWarn = list => { const w = N.channelWarn || {}; const k = Object.keys(w).filter(c => list.includes(c)); return k.length ? `<p class="warnline">${k.map(c => `<b>* ${esc(c)}</b> ${esc(w[c])}`).join(' · ')}</p>` : ''; };

  function vOverview() {
    const r = E.compute(model, cfg, month), t = r.totals, a = E.compute(model, cfg, month, 'actual').totals, b = E.compute(model, cfg, month, 'accrual').totals;
    const pm = prevOf(month), pr = pm ? E.compute(model, cfg, pm) : null, p = pr ? pr.totals : null;
    const cj = r.channels.find(c => c.channel === 'CJ'), pcj = pr ? pr.channels.find(c => c.channel === 'CJ') : null;
    const gap = b.op - a.op;
    const bill = E.cjDetail(model, cfg, month, 'actual', null).by.promoBill || 0;
    return `
    ${lead(t.op < 0 ? 'warn' : 'ok', `สรุป ${mLabel(month)}: ${t.op < 0 ? 'ขาดทุน' : 'กำไร'}จากการดำเนินงาน ${f0(Math.abs(t.op))} บาท`, `ขายได้ <b>${f0(t.revenue)} บาท</b>${p ? ' ' + arrow(t.revenue, p.revenue) + ' จาก ' + mShort(pm) : ''} เหลือกำไรขั้นต้น ${pc(t.gm)} หลังหักค่าใช้จ่ายทั้งหมด ${f0(t.varExp + t.fixExp)} บาท ${t.op < 0 ? 'ขาดทุน' : 'เหลือกำไร'} <b class="${t.op < 0 ? 'neg' : ''}">${f0(Math.abs(t.op))} บาท</b> (${pc(t.revenue ? t.op / t.revenue : 0)} ของรายได้)${cj ? ` โดย CJ เป็น ${pc(cj.share)} ของรายได้` : ''} · คิดแบบ ${modeName(r.mode)}`)}
    ${bill > 0 ? lead(gap > 0 ? 'warn' : 'info', `เดือนนี้มีบิลค่าโปร 1 แถม 1 จาก CJ ${f0(bill)} บาท`, `ถ้านับตามบิลจริง กำไรจากการดำเนินงานคือ <b class="${a.op < 0 ? 'neg' : ''}">${f0(a.op)} บาท</b> ถ้าตั้งประมาณการ ${cfg.promo.rate} บาท/ถุง คือ <b>${f0(b.op)} บาท</b> ต่างกัน ${f0(Math.abs(gap))} บาท`) : `<div class="note" style="margin:0 0 18px">เดือนนี้ไม่มีบิลค่าโปร 1 แถม 1 ในข้อมูล แบบตั้งประมาณการจึงหักค่าโปรล่วงหน้าไว้ ${f0(Math.abs(gap))} บาท (กำไร ${f0(b.op)} บาท) ส่วนแบบตามบิลจริงไม่หัก (กำไร ${f0(a.op)} บาท)</div>`}
    <div class="kpis">
      ${kpi('รายได้สุทธิ', 'revenue', f0(t.revenue), cj ? 'CJ ' + pc(cj.share) + ' ของรายได้' : '', { delta: p ? arrow(t.revenue, p.revenue) : '' })}
      ${kpi('กำไรขั้นต้น', 'gp', f0(t.gp), pc(t.gm) + ' ของรายได้', { delta: p ? arrow(t.gm, p.gm, 1) : '' })}
      ${kpi('กำไรหลังค่าใช้จ่ายผันแปร', 'contribution', f0(t.contribution), pc(t.revenue ? t.contribution / t.revenue : 0) + ' ของรายได้', { bad: t.contribution < 0 })}
      ${kpi('กำไรจากการดำเนินงาน', 'op', f0(t.op), pc(t.revenue ? t.op / t.revenue : 0) + ' ของรายได้', { bad: t.op < 0, delta: p ? arrow(t.op, p.op) : '' })}
      ${cj ? kpi('กำไร CJ ก่อนปันส่วนกลาง', 'cjContrib', f0(cj.contrib), pc(cj.contribPct) + ' ของยอดขาย CJ', { bad: cj.contrib < 0, delta: pcj ? arrow(cj.contribPct, pcj.contribPct, 1) : '' }) : ''}
      ${cj ? kpi('กำไรสุทธิ CJ หลังปันส่วนกลาง', 'cjNet', f0(cj.net), pc(cj.netPct) + ' ของยอดขาย CJ', { bad: cj.net < 0, delta: pcj ? arrow(cj.netPct, pcj.netPct, 1) : '' }) : ''}
    </div>
    <div class="card">${H('กำไรรายช่องทาง', 'oChannel', `${mLabel(month)} · ค่าใช้จ่ายส่วนกลาง ${f0(r.shared)} บาท ปันตามสัดส่วนรายได้${r.sharedNo ? ` โดย ${f0(r.sharedNo)} บาทเป็นรายการที่ไม่เกี่ยวกับ CJ จึงปันเฉพาะช่องทางอื่น` : ''}`)}
      <div class="tw"><table><thead><tr><th>ช่องทาง</th><th class="r">รายได้</th><th class="r">สัดส่วน</th><th class="r">ต้นทุนสินค้า</th><th class="r">กำไรขั้นต้น %</th><th class="r">ค่าใช้จ่ายตรง</th><th class="r">กำไรหลังค่าใช้จ่ายตรง</th><th class="r">%</th><th class="r">ส่วนกลางที่ปันให้</th><th class="r">กำไรสุทธิ</th><th class="r">%</th></tr></thead><tbody>
      ${r.channels.map(c => `<tr${c.channel === 'CJ' ? ' class="hl"' : ''}><td>${esc(c.channel)}${chMark(c.channel)}</td><td class="r">${f0(c.revenue)}</td><td class="r">${pc(c.share)}</td><td class="r">${f0(c.cogs)}</td><td class="r">${pc(c.gm)}</td><td class="r">${f0(c.direct)}</td><td class="r${cls(c.contrib)}">${f0(c.contrib)}</td><td class="r${cls(c.contrib)}">${pc(c.contribPct)}</td><td class="r">${f0(c.alloc)}</td><td class="r${cls(c.net)}">${f0(c.net)}</td><td class="r${cls(c.net)}">${pc(c.netPct)}</td></tr>`).join('')}
      <tr class="tot"><td>รวม</td><td class="r">${f0(t.revenue)}</td><td class="r">100.0%</td><td class="r">${f0(t.cogs)}</td><td class="r">${pc(t.gm)}</td><td class="r">${f0(r.channels.reduce((s, c) => s + c.direct, 0))}</td><td class="r">${f0(r.channels.reduce((s, c) => s + c.contrib, 0))}</td><td></td><td class="r">${f0(r.shared)}</td><td class="r${cls(t.op)}">${f0(t.op)}</td><td class="r${cls(t.op)}">${pc(t.revenue ? t.op / t.revenue : 0)}</td></tr>
      </tbody></table></div>${chWarn(r.channels.map(c => c.channel))}</div>
    <div class="grid g2">
      <div class="card">${H('ช่องทางไหนทำกำไรให้บริษัท', 'oBars', 'กำไรสุทธิหลังปันส่วนกลาง · บาท')}${bars(r.channels.map(c => ({ label: c.channel, value: c.net })))}</div>
      <div class="card">${H('เงินออกไปกับอะไร', 'oCats', 'ค่าใช้จ่ายตามกลุ่มหลัก ไม่รวม VAT ไม่รวมต้นทุนสินค้า')}
        <div class="tw"><table><thead><tr><th>กลุ่ม / หมวด</th><th class="r">บาท</th><th class="r">ต่อรายได้</th></tr></thead><tbody>
        ${E.GROUPS.map(gn => { const cs = r.categories.filter(c => c.main === gn); if (!cs.length) return ''; const sm = cs.reduce((s, c) => s + c.amount, 0);
          return `<tr class="grp"><td>${esc(gn)}</td><td class="r">${f0(sm)}</td><td class="r">${pc(t.revenue ? sm / t.revenue : 0)}</td></tr>` + cs.map(c => `<tr><td class="ind">${esc(c.sub)}</td><td class="r">${f0(c.amount)}</td><td class="r">${pc(t.revenue ? c.amount / t.revenue : 0)}</td></tr>`).join(''); }).join('')}
        <tr class="tot"><td>รวม</td><td class="r">${f0(t.varExp + t.fixExp)}</td><td class="r">${pc(t.revenue ? (t.varExp + t.fixExp) / t.revenue : 0)}</td></tr></tbody></table></div></div>
    </div>`;
  }

  /* ---------- กำไร CJ ---------- */
  function vCJ() {
    const scope = cjScope === 'promo' ? cfg.promo.skus : null;
    const A = E.cjDetail(model, cfg, month, 'actual', scope), B = E.cjDetail(model, cfg, month, 'accrual', scope);
    if (!A.qty) return '<div class="empty">เดือนนี้ไม่มียอดขาย CJ</div>';
    const row = (l, k, neg) => `<tr><td>${l}</td><td class="r">${f2((neg ? -1 : 1) * A.unit[k])}</td><td class="r">${f2((neg ? -1 : 1) * B.unit[k])}</td></tr>`;
    const full = E.cjDetail(model, cfg, month, 'actual', null);
    const types = Object.keys(E.CJ_TYPES).filter(k => full.by[k]);
    const dedTotal = types.reduce((s, k) => s + full.by[k], 0);
    const W = E.warehouses(model, cfg, month, cfg.promo.mode);
    return `
    ${lead(A.unit.profit < 0 ? 'warn' : 'ok', `${mLabel(month)}: ขายให้ CJ 1 ถุง เหลือกำไร ${f2(A.unit.profit)} บาท ตามบิลจริง`, `ราคาขาย ${f2(A.unit.price)} บาท ถูกหักตามสัญญา ${f2(A.unit.tta)} บาท ค่าโปร 1 แถม 1 <b>${f2(A.unit.promoMain)} บาท</b> ต้นทุนสินค้า ${f2(A.unit.cogs)} บาท และขนส่ง ${f2(A.unit.logistics)} บาท ถ้าเฉลี่ยค่าโปรเป็น ${cfg.promo.rate} บาทต่อถุงแบบที่สำนักงานตั้ง จะเห็นกำไรเป็น <b>${f2(B.unit.profit)} บาท</b>`)}
    <div class="row" style="margin-bottom:14px"><span class="muted">แสดง</span>
      <div class="seg dark"><button data-scope="promo" aria-pressed="${cjScope === 'promo'}">เฉพาะสินค้าที่ร่วมโปร (${esc(cfg.promo.skus.join(', '))})</button><button data-scope="all" aria-pressed="${cjScope === 'all'}">ทุกสินค้าที่ขายให้ CJ</button></div>
      <span class="muted">${mLabel(month)} · ${f0(A.qtyS)} ถุง · ยอดขาย ${f0(A.revS)} บาท</span></div>
    <div class="kpis">
      ${kpi('กำไรต่อถุง ตามบิล CJ จริง', 'cjUnitA', f2(A.unit.profit), pc(A.profitPct) + ' ของราคาขาย', { bad: A.unit.profit < 0, big: 1 })}
      ${kpi(`กำไรต่อถุง ตั้งประมาณการ ${cfg.promo.rate} บาท`, 'cjUnitB', f2(B.unit.profit), pc(B.profitPct) + ' ของราคาขาย', { bad: B.unit.profit < 0, big: 1 })}
      ${kpi('ค่าโปร 1 แถม 1 ต่อถุง ตามบิล', 'cjBogo', f2(A.unit.promoMain), `ที่ตั้งไว้ ${f2(B.unit.promoMain)} บาท`, { bad: A.unit.promoMain > B.unit.promoMain + 0.005 })}
      ${kpi('กำไรรวมของกลุ่มนี้ ตามบิลจริง', 'cjTotal', f0(A.profit), `แบบตั้งประมาณการ ${f0(B.profit)}`, { bad: A.profit < 0 })}
    </div>
    <div class="grid g2">
      <div class="card">${H('ขาย 1 ถุง เหลือกำไรเท่าไร · ตามบิล CJ จริง', 'cjWater', 'บาทต่อถุง')}${waterfall(stepsOf(A))}</div>
      <div class="card">${H(`ขาย 1 ถุง เหลือกำไรเท่าไร · ตั้งประมาณการ ${cfg.promo.rate} บาท`, 'cjWater', 'บาทต่อถุง')}${waterfall(stepsOf(B))}</div>
    </div>
    ${W ? `<div class="card">${H('กำไรต่อถุงแยกคลัง CJ', 'cjWh', `${mLabel(month)} · กำไรก่อนค่าขนส่ง ${f2(W.pre)} บาทต่อถุง · ${modeName(cfg.promo.mode)} · ยอดขายและค่ารถจากไฟล์ที่ลูกค้าสรุป`)}
      <div class="tw"><table><thead><tr><th>คลัง</th><th class="r">ยอดขายเดือนนี้</th><th class="r">สัดส่วน</th><th class="r">ค่ารถ 10 ล้อ ต่อเที่ยว</th><th class="r">ค่ารถต่อถุง</th><th class="r">กำไรต่อถุงหลังค่ารถ</th></tr></thead><tbody>
      ${W.rows.map(x => `<tr><td>${esc(x.wh)}</td><td class="r">${f0(x.sales)}</td><td class="r">${pc(x.share)}</td><td class="r">${x.trip ? f0(x.trip) : '<span class="muted">ไม่มีข้อมูล</span>'}</td><td class="r">${x.truck != null ? f2(x.truck) : ''}</td><td class="r${x.profit != null ? cls(x.profit) : ''}">${x.profit != null ? f2(x.profit) : ''}</td></tr>`).join('')}
      </tbody></table></div>${N.warehouse ? `<div class="note">${esc(N.warehouse)}</div>` : ''}</div>` : ''}
    <div class="card">${H('เทียบสองวิธี', 'cjCompare', 'บาทต่อถุง')}<div class="tw"><table><thead><tr><th>รายการ</th><th class="r">ตามบิล CJ จริง</th><th class="r">ตั้งประมาณการ</th></tr></thead><tbody>
      ${row('ราคาขาย', 'price')}${row('หักตามสัญญา (TTA)', 'tta', 1)}${row('ค่าโปร 1 แถม 1', 'promoMain', 1)}${row('ค่าโปรและค่าปรับอื่น', 'promoOther', 1)}${row('ต้นทุนสินค้า', 'cogs', 1)}${row('ขนส่งและค่าลงสินค้า', 'logistics', 1)}
      <tr class="tot"><td>กำไรต่อถุง</td><td class="r${cls(A.unit.profit)}">${f2(A.unit.profit)}</td><td class="r${cls(B.unit.profit)}">${f2(B.unit.profit)}</td></tr></tbody></table></div>
      <div class="note">TTA และค่าโปรอื่นกระจายตามยอดขาย · ขนส่งกระจายตามจำนวนถุง · ค่าโปร 1 แถม 1 ลงเฉพาะสินค้าที่ร่วมโปร</div></div>
    <div class="grid g2">
      <div class="card">${H('CJ หักตรงตามสัญญาไหม', 'cjTta', `อัตราตามสัญญา x ยอดขาย CJ ${f0(full.rev)} บาท`)}<div class="tw"><table><thead><tr><th>รายการ</th><th class="r">อัตรา</th><th class="r">ควรถูกหัก</th><th class="r">ที่บันทึก</th><th class="r">ผลต่าง</th></tr></thead><tbody>
        ${full.ttaCheck.map(x => `<tr><td>${esc(x.label)}</td><td class="r">${x.rate}%</td><td class="r">${f0(x.expected)}</td><td class="r">${f0(x.actual)}</td><td class="r${Math.abs(x.actual - x.expected) > Math.max(100, x.expected * 0.01) ? ' neg' : ''}">${f0(x.actual - x.expected)}</td></tr>`).join('')}
        </tbody></table></div></div>
      <div class="card">${H('ค่าใช้จ่ายของ CJ ทั้งเดือน', 'cjBars', `ตามบิลจริง รวม ${f0(dedTotal)} บาท = ${pc(full.rev ? dedTotal / full.rev : 0)} ของยอดขาย CJ`)}
        ${bars(types.map(k => ({ label: E.CJ_TYPES[k], value: full.by[k] })))}</div>
    </div>
    <details><summary>รายการค่าใช้จ่าย CJ ในไฟล์ดิบ (${full.lines.length} บรรทัด)</summary><div class="card">${H('รายการค่าใช้จ่าย CJ', 'cjLines')}<div class="tw"><table><thead><tr><th>รายการ</th><th>หมวดในไฟล์</th><th>จัดเป็น</th><th>ที่มา</th><th class="r">บาท</th></tr></thead><tbody>
      ${full.lines.slice().sort((x, y) => y.amount - x.amount).slice(0, 40).map(e => `<tr><td>${esc(e.name)}</td><td class="muted">${esc(e.category)}</td><td>${esc(E.CJ_TYPES[e.cjType] || '')}</td><td class="muted">${esc(e.source)}</td><td class="r">${f0(e.amount)}</td></tr>`).join('')}
      </tbody></table></div>${full.lines.length > 40 ? `<p class="sub" style="margin-top:8px">แสดง 40 รายการที่ยอดสูงสุด</p>` : ''}</div></details>`;
  }

  /* ---------- รอบโปร + จำลอง ---------- */
  function simDefaults() {
    const d = E.cjDetail(model, cfg, month, 'actual', cfg.promo.skus), pr = E.promoRounds(model, cfg);
    return { price: +d.unit.price.toFixed(2), cost: +d.unit.cogs.toFixed(2), tta: cfg.tta.cs + cfg.tta.ns + cfg.tta.dc, logi: +d.unit.logistics.toFixed(2), promo: +(d.unit.promoMain || cfg.promo.rate).toFixed(2), normal: Math.round(pr.baseQty) || 20000, units: Math.round(d.qtyS) };
  }
  function simOut() {
    const s = sim, base = s.price * (1 - s.tta / 100) - s.cost - s.logi, pu = base - s.promo;
    const normalTotal = base * s.normal, promoTotal = pu * s.units, need = pu > 0 ? normalTotal / pu : null;
    return `<div class="kpis">
      ${kpi('กำไรต่อถุง เดือนปกติ', '', f2(base), 'ก่อนค่าโปร')}
      ${kpi('กำไรต่อถุง เดือนที่มีโปร', '', f2(pu), 'หลังค่าโปร ' + f2(s.promo) + ' บาท', { bad: pu < 0 })}
      ${kpi('กำไรรวม เดือนปกติ', '', f0(normalTotal), f0(s.normal) + ' ถุง')}
      ${kpi('กำไรรวม เดือนที่มีโปร', '', f0(promoTotal), f0(s.units) + ' ถุง', { bad: promoTotal < normalTotal })}
    </div>
    <ul class="chk">
      <li><span class="tag ${pu > 0 ? 'ok' : 'warn'}">จุดคุ้มทุน</span><span>ค่าโปรต่อถุงสูงสุดที่ยังไม่ขาดทุนคือ <b>${f2(base)}</b> บาท ตอนนี้ใส่ไว้ ${f2(s.promo)} บาท</span></li>
      <li><span class="tag ${need != null && s.units >= need ? 'ok' : 'warn'}">ยอดขั้นต่ำ</span><span>${need == null ? 'ค่าโปรระดับนี้ขาดทุนทุกถุง ขายเพิ่มเท่าไรก็ไม่คุ้ม' : `ต้องขายช่วงโปรอย่างน้อย <b>${f0(need)}</b> ถุง (${(need / (s.normal || 1)).toFixed(1)} เท่าของเดือนปกติ) จึงจะได้กำไรรวมเท่าเดือนปกติ`}</span></li>
      <li><span class="tag ${promoTotal >= normalTotal ? 'ok' : 'warn'}">ผลต่าง</span><span>เดือนที่มีโปรได้กำไรรวม${promoTotal >= normalTotal ? 'มากกว่า' : 'น้อยกว่า'}เดือนปกติ <b>${f0(Math.abs(promoTotal - normalTotal))}</b> บาท</span></li>
    </ul>`;
  }
  function vPromo() {
    const P = E.promoRounds(model, cfg); if (!sim) sim = simDefaults();
    const inp = (k, l, step) => `<label>${l}<input type="number" step="${step || 'any'}" data-sim="${k}" value="${sim[k]}"></label>`;
    const worst = P.rounds.find(x => x.month === month), any = P.rounds.length;
    return `
    ${worst ? lead(worst.net < 0 ? 'warn' : 'ok', `รอบโปร ${mLabel(worst.month)}: ${worst.net < 0 ? 'ไม่คุ้ม' : 'คุ้ม'}`, `ขายได้มากกว่าเดือนปกติ <b>${f0(worst.extra)} ถุง</b> ได้กำไรเพิ่ม ${f0(worst.extraGain)} บาท แต่ CJ เรียกเก็บค่าโปร <b>${f0(worst.bill)} บาท</b> สุทธิ${worst.net < 0 ? 'ขาด' : 'ได้'} <b class="${worst.net < 0 ? 'neg' : ''}">${f0(Math.abs(worst.net))} บาท</b> เทียบกับไม่ทำโปร`) : lead('info', `${mLabel(month)}: ไม่มีบิลค่าโปร 1 แถม 1 ในข้อมูล`, any ? `เดือนที่มีบิลคือ ${P.rounds.map(x => mLabel(x.month)).join(', ')} ดูได้ในตารางด้านล่าง ถ้าเดือนนี้มีโปรแต่ยังไม่ได้บิล กรอกยอดในแบบฟอร์มด้านล่างได้` : 'กรอกยอดจากใบแจ้งหนี้ของ CJ ในแบบฟอร์มด้านล่าง เพื่อดูว่าแต่ละรอบคุ้มหรือไม่')}
    <div class="card">${H('แต่ละรอบโปรคุ้มไหม', 'pRound', `เดือนปกติที่ใช้เทียบ: ${P.baseMonths.map(mLabel).join(', ') || 'ไม่มี'} · เฉลี่ย ${f0(P.baseQty)} ถุงต่อเดือน ${tip('pBase')}`)}
      <div class="tw"><table><thead><tr><th>เดือนที่มีโปร</th><th class="r">ถุงที่ส่งเข้า CJ</th><th class="r">มากกว่าเดือนปกติ</th><th class="r">กำไรต่อถุงก่อนค่าโปร</th><th class="r">กำไรจากถุงที่เพิ่ม</th><th class="r">ค่าโปรที่ CJ เรียกเก็บ</th><th class="r">ค่าโปรต่อถุง</th><th class="r">สุทธิ คุ้มหรือขาด ${tip('pNet')}</th></tr></thead><tbody>
      ${P.rounds.map(x => `<tr${x.month === month ? ' class="hl"' : ''}><td>${mLabel(x.month)}<div class="muted sm">${esc(x.names.join(' · '))}</div></td><td class="r">${f0(x.qty)}</td><td class="r">${f0(x.extra)}</td><td class="r">${f2(x.before)}</td><td class="r">${f0(x.extraGain)}</td><td class="r">${f0(x.bill)}</td><td class="r">${f2(x.perBag)}</td><td class="r${cls(x.net)}"><b>${f0(x.net)}</b></td></tr>`).join('') || '<tr><td colspan="8" class="muted">ยังไม่มีเดือนที่มีบิลค่าโปร 1 แถม 1</td></tr>'}
      </tbody></table></div>
      <div class="note">เทียบระดับเดือน เพราะไฟล์ขายบอกวันที่ส่งของเข้าคลัง CJ ไม่ใช่วันที่ขายออกจากร้าน ของที่ส่งเข้าช่วงโปรอาจค้างที่ CJ และทำให้เดือนถัดไปสั่งน้อยลง ซึ่งตารางนี้ยังไม่นับ</div></div>
    <div class="card office">${H('กรอกบิลค่าโปรของเดือนอื่น', 'pAdd', 'ใช้เมื่อได้ใบแจ้งหนี้ค่าโปร 1 แถม 1 ที่ไม่อยู่ในไฟล์ค่าใช้จ่าย')}
      <div class="tw"><table><thead><tr><th>เดือน</th><th>ชื่อรอบ</th><th class="r">ยอดบิล</th><th></th></tr></thead><tbody>
      ${cfg.promoRounds.map((a, i) => `<tr><td>${mLabel(a.month)}</td><td>${esc(a.label)}</td><td class="r">${f0(a.amount)}</td><td><button class="btn g sm" data-delround="${i}">ลบ</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted">ยังไม่มีบิลที่กรอกเอง</td></tr>'}
      </tbody></table></div>
      <div class="form" style="margin-top:12px"><label>เดือนที่เกิดโปร<select id="rdMonth">${model.months.map(m => `<option value="${m}"${m === month ? ' selected' : ''}>${mLabel(m)}</option>`).join('')}</select></label><label>ชื่อรอบ เช่น BOGO 20–26 ส.ค.<input type="text" id="rdLabel"></label><label>ยอดบิลรวมทุกงวด (บาท)<input type="number" step="any" id="rdAmt"></label></div>
      <div style="margin-top:10px"><button class="btn" id="rdAdd">เพิ่มบิล</button></div></div>
    <div class="card">${H('จำลองโปรก่อนตอบรับ CJ', 'pSim', `ค่าเริ่มต้นมาจากข้อมูลจริง ${mLabel(month)} แก้ตัวเลขได้ทุกช่อง`)}
      <div class="form">${inp('price', 'ราคาขายให้ CJ ต่อถุง (ไม่รวม VAT)')}${inp('cost', 'ต้นทุนสินค้าต่อถุง')}${inp('tta', 'หักตามสัญญา TTA (%)')}${inp('logi', 'ขนส่งและค่าลงสินค้าต่อถุง')}${inp('promo', 'ค่าโปรที่เรารับภาระต่อถุง')}${inp('normal', 'ยอดขายเดือนปกติ (ถุง)', 1)}${inp('units', 'ยอดขายเดือนที่มีโปร (ถุง)', 1)}</div>
      <div id="simOut" style="margin-top:16px">${simOut()}</div></div>`;
  }

  /* ---------- จุดคุ้มทุน ---------- */
  function vBE() {
    const b = E.breakeven(model, cfg, month), all = model.months.map(m => E.breakeven(model, cfg, m));
    const maxv = Math.max(b.revenue, b.be || 0, 1);
    return `
    ${b.be == null ? lead('warn', 'เดือนนี้ไม่มีจุดคุ้มทุน', 'ขายได้ทุก 100 บาทยังไม่เหลือเงินไปจ่ายค่าใช้จ่ายประจำ ยิ่งขายมากยิ่งขาดทุน ต้องแก้ที่ราคาหรือค่าโปรก่อน') : lead(b.revenue >= b.be ? 'ok' : 'warn', `${mLabel(month)}: ${b.revenue >= b.be ? 'ขายเกินจุดคุ้มทุน' : 'ขายไม่ถึงจุดคุ้มทุน'}`, `ต้องขายอย่างน้อย <b>${f0(b.be)} บาทต่อเดือน</b> จึงจะไม่ขาดทุน เดือนนี้ขายได้ ${f0(b.revenue)} บาท ${b.revenue >= b.be ? 'สูงกว่า' : 'ต่ำกว่า'}จุดคุ้มทุน <b class="${b.revenue < b.be ? 'neg' : ''}">${f0(Math.abs(b.revenue - b.be))} บาท</b> · คิดแบบ ${modeName(cfg.promo.mode)}`)}
    <div class="kpis">
      ${kpi('จุดคุ้มทุนต่อเดือน', 'be', b.be == null ? 'ไม่มี' : f0(b.be), 'ยอดขายขั้นต่ำที่ไม่ขาดทุน', { big: 1, bad: b.be == null })}
      ${kpi('ยอดขายเกินจุดคุ้มทุน', 'beSafety', b.safety == null ? '-' : pc(b.safety), b.safety == null ? '' : (b.safety >= 0 ? 'ยอดขายตกได้เท่านี้ก่อนขาดทุน' : 'ต้องขายเพิ่มเท่านี้'), { bad: b.safety != null && b.safety < 0 })}
      ${kpi('ขาย 100 บาท เหลือ', 'beCmr', f2(b.cmr * 100) + ' บาท', 'ไปจ่ายค่าใช้จ่ายประจำ', { bad: b.cmr <= 0 })}
      ${kpi('ค่าใช้จ่ายประจำ', 'fixExp', f0(b.fixed), 'ต่อเดือน')}
      ${kpi('ถ้าไม่มี CJ ต้องขาย', 'beNoCj', b.beN == null ? 'ไม่มี' : f0(b.beN), `ช่องทางอื่นขายได้ ${f0(b.revN)} บาท`, { bad: b.beN == null || b.revN < b.beN })}
    </div>
    <div class="card">${H('ยอดขายจริงเทียบจุดคุ้มทุน', 'be', mLabel(month) + ' · บาท')}
      <div class="bars"><div>ยอดขายจริง</div><div class="track"><div class="bar end" style="left:0;width:${b.revenue / maxv * 100}%"></div></div><div class="val">${f0(b.revenue)}</div>
      <div>จุดคุ้มทุน</div><div class="track"><div class="bar lite" style="left:0;width:${(b.be || 0) / maxv * 100}%"></div></div><div class="val">${b.be == null ? 'ไม่มี' : f0(b.be)}</div>
      <div>ช่องทางอื่น (ไม่รวม CJ)</div><div class="track"><div class="bar" style="left:0;width:${b.revN / maxv * 100}%"></div></div><div class="val">${f0(b.revN)}</div>
      <div>จุดคุ้มทุนถ้าไม่มี CJ</div><div class="track"><div class="bar lite" style="left:0;width:${Math.min(100, (b.beN || 0) / maxv * 100)}%"></div></div><div class="val">${b.beN == null ? 'ไม่มี' : f0(b.beN)}</div></div>
      <div class="note">ช่องทางอื่นเหลือกำไร ${f2(b.cmrN * 100)} บาทจากยอดขายทุก 100 บาท ส่วน CJ เหลือ ${f2(b.cjRev ? b.cjCm / b.cjRev * 100 : 0)} บาท</div></div>
    <div class="card">${H('จุดคุ้มทุนรายเดือน', 'beTable')}
      <div class="tw"><table><thead><tr><th>เดือน</th><th class="r">ยอดขายจริง</th><th class="r">ค่าใช้จ่ายประจำ</th><th class="r">ขาย 100 บาท เหลือ</th><th class="r">จุดคุ้มทุน</th><th class="r">เกิน (ขาด)</th><th class="r">จุดคุ้มทุนถ้าไม่มี CJ</th><th class="r">ช่องทางอื่นขายได้</th></tr></thead><tbody>
      ${all.map(x => `<tr${x.month === month ? ' class="hl"' : ''}><td>${mLabel(x.month)}</td><td class="r">${f0(x.revenue)}</td><td class="r">${f0(x.fixed)}</td><td class="r${cls(x.cmr)}">${f2(x.cmr * 100)}</td><td class="r">${x.be == null ? 'ไม่มี' : f0(x.be)}</td><td class="r${x.be == null || x.revenue < x.be ? ' neg' : ''}">${x.be == null ? '-' : f0(x.revenue - x.be)}</td><td class="r">${x.beN == null ? 'ไม่มี' : f0(x.beN)}</td><td class="r${x.beN == null || x.revN < x.beN ? ' neg' : ''}">${f0(x.revN)}</td></tr>`).join('')}
      </tbody></table></div></div>`;
  }

  /* ---------- ช่องทางอื่น ---------- */
  function vCh() {
    const C = E.channelTrend(model, cfg), ms = C.months, pm = prevOf(month);
    const rows = C.channels.map(c => ({ c, d: C.data[c] }));
    const totOf = m => rows.reduce((s, r) => s + ((r.d[m] || {}).revenue || 0), 0);
    const cur = rows.map(r => Object.assign({ c: r.c }, r.d[month] || { revenue: 0, ads: 0, ship: 0, contrib: 0, contribPct: 0, gm: 0 })).filter(x => x.revenue || x.ads).sort((a, b) => b.revenue - a.revenue);
    const tot = cur.reduce((s, x) => ({ revenue: s.revenue + x.revenue, ads: s.ads + x.ads, ship: s.ship + x.ship, contrib: s.contrib + x.contrib }), { revenue: 0, ads: 0, ship: 0, contrib: 0 });
    // 1 เดือน = ยอดขาย | เพิ่ม (ลด) เป็นบาท | เป็น % เทียบเดือนก่อน
    const chg = (v, p) => { if (p == null) return `<td class="r${cls(v)}">${f0(v)}</td>`; const d = v - p; return `<td class="r${cls(v)}">${f0(v)}</td><td class="r pct${d < -0.5 ? ' neg' : ''}">${Math.abs(d) < 0.5 ? '-' : (d > 0 ? '+' : '') + f0(d)}</td><td class="r pct${d < -0.5 ? ' neg' : ''}">${p > 0 && Math.abs(d) >= 0.5 ? (d > 0 ? '+' : '') + (d / p * 100).toFixed(0) + '%' : ''}</td>`; };
    const best = cur.filter(x => x.revenue > 20000).sort((a, b) => b.contribPct - a.contribPct)[0];
    return `
    ${lead('info', `ช่องทางที่ไม่ใช่ CJ · ${mLabel(month)}`, `ขายรวม <b>${f0(tot.revenue)} บาท</b>${pm ? ' ' + arrow(totOf(month), totOf(pm)) + ' จากเดือนก่อน' : ''} เหลือกำไรหลังค่าใช้จ่ายตรง <b>${pc(tot.revenue ? tot.contrib / tot.revenue : 0)}</b> ของยอดขาย${best ? ` ช่องทางที่เหลือกำไรต่อยอดขายสูงสุดคือ <b>${esc(best.c)}</b> (${pc(best.contribPct)})` : ''}`)}
    <div class="card">${H('ยอดขายรวมของช่องทางอื่น', 'chRev', 'บาท')}${cols(ms.map(m => ({ label: mShort(m), value: totOf(m), hot: m === month })), f0)}</div>
    <div class="card">${H('ยอดขายรายเดือนของแต่ละช่องทาง', 'chRev', 'บาท · คอลัมน์ "เพิ่ม (ลด)" เทียบกับเดือนก่อนหน้า')}
      <div class="tw"><table class="trend"><thead>
        <tr><th rowspan="2">ช่องทาง</th>${ms.map((m, i) => `<th class="r mh"${i ? ' colspan="3"' : ''}>${mLabel(m)}</th>`).join('')}</tr>
        <tr>${ms.map((m, i) => '<th class="r">บาท</th>' + (i ? '<th class="r pct">เพิ่ม (ลด)</th><th class="r pct">%</th>' : '')).join('')}</tr></thead><tbody>
      ${rows.map(r => `<tr><td>${esc(r.c)}</td>${ms.map((m, i) => chg((r.d[m] || {}).revenue || 0, i ? (r.d[ms[i - 1]] || {}).revenue || 0 : null)).join('')}</tr>`).join('')}
      <tr class="tot"><td>รวมช่องทางอื่น</td>${ms.map((m, i) => chg(totOf(m), i ? totOf(ms[i - 1]) : null)).join('')}</tr>
      </tbody></table></div></div>
    <div class="card">${H('ค่าโฆษณาและกำไรของแต่ละช่องทาง', 'chDetail', mLabel(month))}
      <div class="tw"><table><thead><tr><th>ช่องทาง</th><th class="r">ยอดขาย</th><th class="r">กำไรขั้นต้น %</th><th class="r">ค่าโฆษณา</th><th class="r">ค่าโฆษณาต่อยอดขาย</th><th class="r">ค่าขนส่งและอื่น ๆ</th><th class="r">กำไรหลังค่าใช้จ่ายตรง</th><th class="r">%</th></tr></thead><tbody>
      ${cur.map(x => `<tr><td>${esc(x.c)}${chMark(x.c)}</td><td class="r">${f0(x.revenue)}</td><td class="r">${pc(x.gm)}</td><td class="r">${x.ads ? f0(x.ads) : ''}</td><td class="r${x.revenue && x.ads / x.revenue > 0.2 ? ' neg' : ''}">${x.ads && x.revenue ? pc(x.ads / x.revenue) : ''}</td><td class="r">${x.ship ? f0(x.ship) : ''}</td><td class="r${cls(x.contrib)}">${f0(x.contrib)}</td><td class="r${cls(x.contrib)}">${pc(x.contribPct)}</td></tr>`).join('')}
      <tr class="tot"><td>รวม</td><td class="r">${f0(tot.revenue)}</td><td></td><td class="r">${f0(tot.ads)}</td><td class="r">${pc(tot.revenue ? tot.ads / tot.revenue : 0)}</td><td class="r">${f0(tot.ship)}</td><td class="r">${f0(tot.contrib)}</td><td class="r">${pc(tot.revenue ? tot.contrib / tot.revenue : 0)}</td></tr>
      </tbody></table></div>
      ${chWarn(cur.map(x => x.c))}${N.channels ? `<div class="note">${esc(N.channels)}</div>` : ''}</div>`;
  }

  /* ---------- ประมาณการเงินสด 3 เดือน ---------- */
  function fcCard() {
    const F = E.forecast(model, cfg); if (!F) return '';
    const R = F.rows, a = F.a, inp = (k, l) => `<label>${l}<input type="number" step="any" data-fc="${k}" value="${Math.round(a[k])}"${cfg.fc[k] != null && cfg.fc[k] !== '' ? ' class="edited"' : ''}></label>`;
    const line = (l, f, k) => `<tr${k ? ' class="' + k + '"' : ''}><td>${l}</td>${R.map(r => { const v = f(r); return `<td class="r${cls(v)}">${f0(v)}</td>`; }).join('')}</tr>`;
    const edited = Object.keys(cfg.fc).length > 0;
    return `
    ${lead(F.min.close < 0 ? 'warn' : 'ok', F.min.close < 0 ? `ประมาณการ: เงินสดจะติดลบใน ${mLabel(F.min.month)}` : `ประมาณการ: เงินสดพอตลอด 3 เดือนข้างหน้า`, `เริ่มจากเงินสด <b>${f0(a.open)} บาท</b> ณ สิ้น ${mLabel(F.last)} ${R.map(r => `${mShort(r.month)} เหลือ <b class="${r.close < 0 ? 'neg' : ''}">${f0(r.close)}</b>`).join(' · ')} บาท${F.min.close < 0 ? ` ต้องเตรียมเงินเพิ่มอย่างน้อย <b class="neg">${f0(-F.min.close)} บาท</b>` : ''}${a.open === 0 ? ' · ยังไม่ได้ใส่เงินสดต้นงวด ตัวเลขนี้จึงเป็นเงินสดที่เพิ่มขึ้นหรือลดลงสะสม' : ''}`)}
    <div class="card">${H('ประมาณการเงินสด 3 เดือนข้างหน้า', 'fc', 'บาท · เงินสดคงเหลือปลายเดือน')}
      ${cols(R.map(r => ({ label: mLabel(r.month), value: r.close })), f0)}
      <div class="tw" style="margin-top:16px"><table><thead><tr><th>รายการ</th>${R.map(r => `<th class="r">${mLabel(r.month)}</th>`).join('')}</tr></thead><tbody>
      ${line('เงินสดต้นเดือน', r => r.open)}
      ${line('CJ จ่ายตามใบกำกับที่ออกแล้ว', r => r.cjIn)}
      ${line('CJ จ่ายจากยอดขายที่คาดการณ์', r => r.cjNew)}
      ${line('หัก ส่วนที่ CJ หัก (รู้แล้ว)', r => -r.cjDeduct)}
      ${line('หัก ส่วนที่ CJ หัก (คาดการณ์)', r => -r.cjDedNew)}
      ${line('เงินเข้าจากช่องทางอื่น', r => r.otherIn + r.otherNew)}
      ${line('จ่ายค่าสินค้าและค่านำเข้า', r => -r.buyAll)}
      ${line('จ่ายค่าใช้จ่ายอื่น', r => -r.expAll)}
      ${line('เงินสดสุทธิของเดือน', r => r.net, 'tot')}
      ${line('เงินสดปลายเดือน', r => r.close, 'hl')}
      </tbody></table></div></div>
    <div class="card">${H('สมมติฐานของประมาณการ', 'fcInputs', 'ต่อเดือน · แก้ได้ทุกช่อง' + (edited ? ' · ช่องที่แก้เองมีกรอบสีเข้ม' : ''))}
      <div class="form">${inp('open', `เงินสดในบัญชี ณ สิ้น ${mShort(F.last)} (บาท)`)}${inp('cjSales', 'ยอดขาย CJ ต่อเดือน ไม่รวม VAT')}${inp('otherSales', 'ยอดขายช่องทางอื่นต่อเดือน')}${inp('buy', 'จ่ายค่าสินค้าและค่านำเข้าต่อเดือน')}${inp('exp', 'จ่ายค่าใช้จ่ายอื่นต่อเดือน')}${inp('promo', 'ค่าโปรที่คาดว่า CJ จะหักเพิ่มต่อเดือน')}</div>
      ${edited ? '<div style="margin-top:10px"><button class="btn g sm" id="fcReset">กลับไปใช้ค่าตั้งต้น</button></div>' : ''}
      <div class="note">ค่าตั้งต้น: ยอดขาย CJ ใช้ค่าเฉลี่ยของเดือนที่ไม่มีบิลโปร 1 แถม 1 · ช่องทางอื่นและรายจ่ายใช้ค่าเฉลี่ย 3 เดือนล่าสุด · ยอดขาย CJ ที่คาดการณ์จะได้เงินหลังเครดิต ${cfg.cjCreditDays} วัน (รวม VAT 7%) และถูกหักตามสัญญา ${cfg.tta.cs + cfg.tta.ns + cfg.tta.dc}% ในเดือนถัดจากเดือนที่ขาย · รายจ่ายที่มีกำหนดจ่ายอยู่แล้วนับเป็นส่วนหนึ่งของยอดต่อเดือน ไม่บวกซ้ำ · ยังไม่รวม VAT ที่ต้องนำส่ง ภาษีเงินได้ และเงินกู้${N.fc ? '<br>' + esc(N.fc) : ''}</div></div>`;
  }

  /* ---------- เงินสด ---------- */
  function vCash() {
    const C = E.cash(model, cfg, month), R = C.rows; if (!R.length) return '<div class="empty">ยังไม่มีข้อมูล</div>';
    const mk = r => (r.known ? '' : ' *') + (r.est ? ' †' : '');
    const line = (l, f, k) => `<tr${k ? ' class="' + k + '"' : ''}><td>${l}</td>${R.map(r => { const v = f(r); return `<td class="r${cls(v)}${r.known ? '' : ' fut'}">${f0(v)}</td>`; }).join('')}</tr>`;
    return `
    ${lead('info', `เงินจาก CJ เข้าช้ากว่ายอดขาย ${cfg.cjCreditDays} วัน`, `ณ สิ้น ${mLabel(month)} CJ ยังค้างจ่าย <b>${f0(C.cjOpen)} บาท</b> แต่มีรายการที่รู้แล้วว่าจะถูกหัก <b>${f0(C.cjOpenDeduct)} บาท</b> เหลือที่คาดว่าจะเข้าบัญชีจริง <b>${f0(C.cjOpen - C.cjOpenDeduct)} บาท</b> ${C.dueMonths.length ? 'ในช่วง ' + C.dueMonths.map(mShort).join(' ') : ''} ขณะที่เดือน ${mShort(month)} จ่ายค่าสินค้าและค่านำเข้า <b>${f0((R.find(r => r.month === month) || {}).buy)} บาท</b>`)}
    <div class="kpis">
      ${kpi('CJ ค้างจ่าย ณ สิ้น ' + mShort(month), 'cashOpenCj', f0(C.cjOpen), 'ยอดตามใบกำกับ รวม VAT', { big: 1 })}
      ${kpi('ที่รู้แล้วว่าจะถูกหัก', 'cashOpenCj', f0(C.cjOpenDeduct), 'ค่าโปรและส่วนที่หักตามสัญญา', { bad: C.cjOpenDeduct > C.cjOpen * 0.2 })}
      ${kpi('คาดว่าเข้าบัญชีจริง', 'cashCj', f0(C.cjOpen - C.cjOpenDeduct), pc(C.cjOpen ? (C.cjOpen - C.cjOpenDeduct) / C.cjOpen : 0) + ' ของยอดใบกำกับ')}
    </div>
    <div class="card">${H('เงินสดสุทธิรายเดือน', 'cash', 'บาท · เงินเข้า ลบ เงินออก')}
      ${cols(R.map(r => ({ label: mShort(r.month) + mk(r), value: r.net, hot: r.month === month })), f0)}</div>
    <div class="card">${H('เงินเข้า เงินออก รายเดือน', 'cashTable', `เครดิต CJ ${cfg.cjCreditDays} วัน`)}
      <div class="tw"><table class="cash"><thead><tr><th>รายการ</th>${R.map(r => `<th class="r">${mLabel(r.month)}${mk(r)}</th>`).join('')}</tr></thead><tbody>
      ${line('ใบกำกับ CJ ที่ครบกำหนด', r => r.cjIn)}
      ${line('หัก ส่วนที่ CJ หักก่อนจ่าย', r => -r.cjDeduct)}
      ${line('เงินเข้าจาก CJ สุทธิ ' + tip('cashCj'), r => r.cjNet, 'hl')}
      ${line('เงินเข้าจากช่องทางอื่น', r => r.otherIn)}
      ${line('จ่ายค่าสินค้าและค่านำเข้า', r => -r.buy)}
      ${line('จ่ายค่าใช้จ่ายอื่น', r => -r.exp)}
      ${line('เงินสดสุทธิของเดือน', r => r.net, 'tot')}
      </tbody></table></div>
      <div class="form office" style="margin-top:14px"><label>เครดิตที่ให้ CJ (วัน)<input type="number" data-cfg1="cjCreditDays" value="${cfg.cjCreditDays}"></label><label>CJ แบ่งหักบิลค่าโปร 1 แถม 1 กี่งวด (รายเดือน)<input type="number" min="1" data-cfg1="promoInst" value="${cfg.promoInst}"></label></div>
      <div class="note">เป็นประมาณการ ไม่ใช่ยอดธนาคาร<br>* เดือนที่ยังไม่มีไฟล์ จึงมีเฉพาะรายการที่รู้ล่วงหน้า ยังไม่มียอดขายใหม่และค่าใช้จ่ายของเดือนนั้น<br>† เงินจาก CJ ของเดือนนี้มาจากยอดขายของเดือนที่ไม่มีไฟล์ขาย จึงใช้ยอดขาย CJ รายเดือนจากไฟล์สรุปแยกคลังของลูกค้า บวก VAT 7% และยังไม่ได้หักส่วนที่ CJ หัก<br>เงินจาก CJ นับวันขายบวกจำนวนวันเครดิต · รายจ่ายใช้วันที่จ่ายในไฟล์ ถ้าไม่มีใช้เดือนที่เกิดรายการ · ส่วนที่ CJ หักใช้ยอดไม่รวม VAT · บิลที่ CJ แบ่งหักหลายงวดลงงวดเดียวตามวันที่ในไฟล์</div></div>
      ${fcCard()}`;
  }

  /* ---------- ตั้งราคา CJ ---------- */
  function prDefaults() {
    const d = E.cjDetail(model, cfg, month, 'actual', cfg.promo.skus), r = E.compute(model, cfg, month);
    return { cost: +d.unit.cogs.toFixed(2), logi: +d.unit.logistics.toFixed(2), other: +d.unit.promoOther.toFixed(2), promo: +(d.unit.promoMain || cfg.promo.rate).toFixed(2), tta: cfg.tta.cs + cfg.tta.ns + cfg.tta.dc,
      oh: +(r.totals.revenue ? r.shared / r.totals.revenue * 100 : 10).toFixed(1), target: 10, newPrice: +cfg.cjNewPrice || 0, price: +d.unit.price.toFixed(2), actual: +d.unit.promoMain.toFixed(2) };
  }
  function prCalc(p, promo) {
    const c = p.cost + p.logi + p.other + promo, t = p.tta / 100, o = p.oh / 100, g = p.target / 100;
    const div = x => x > 0.01 ? c / x : null;
    return { min: div(1 - t), be: div(1 - t - o), target: div(1 - t - o - g), now: p.price * (1 - t - o) - c, at: p.newPrice * (1 - t - o) - c };
  }
  function prOut() {
    const p = pr, x = prCalc(p, p.promo), pv = v => v == null ? 'ตั้งไม่ได้' : f2(v);
    const list = [...new Set([0, cfg.promo.rate, 10, p.actual, p.promo, 20].filter(v => v >= 0).map(v => +v.toFixed(2)))].sort((a, b) => a - b);
    return `
    ${lead(x.now < 0 ? 'warn' : 'ok', x.now < 0 ? `ราคา ${f2(p.price)} บาท ขาดทุนถุงละ ${f2(-x.now)} บาท` : `ราคา ${f2(p.price)} บาท เหลือกำไรถุงละ ${f2(x.now)} บาท`, `ถ้าค่าโปรอยู่ที่ <b>${f2(p.promo)} บาทต่อถุง</b> ต้องขายให้ CJ อย่างน้อย <b>${pv(x.be)} บาท</b> จึงจะเท่าทุน และถ้าต้องการกำไร ${p.target}% ต้องตั้ง <b>${pv(x.target)} บาท</b>`)}
    <div class="kpis">
      ${kpi('ราคาเท่าทุน รวมส่วนกลาง', 'prBe', pv(x.be), 'บาทต่อถุง ไม่รวม VAT', { big: 1, bad: x.be == null || x.be > p.price })}
      ${kpi(`ราคาที่ได้กำไร ${p.target}%`, 'prTarget', pv(x.target), 'บาทต่อถุง ไม่รวม VAT', { big: 1 })}
      ${kpi('ราคาต่ำสุด ก่อนส่วนกลาง', 'prMin', pv(x.min), 'ต่ำกว่านี้ขาดทุนทุกถุง')}
      ${kpi('กำไรต่อถุงที่ราคาปัจจุบัน', 'prNow', f2(x.now), pc(p.price ? x.now / p.price : 0) + ' ของราคาขาย', { bad: x.now < 0 })}
    </div>
    <div class="card">${H('ค่าโปรเปลี่ยน ราคาต้องเปลี่ยนเท่าไร', 'prScen', `ราคาปัจจุบัน ${f2(p.price)} บาทต่อถุง`)}
      <div class="tw"><table><thead><tr><th>ค่าโปรต่อถุง</th><th class="r">ราคาเท่าทุน</th><th class="r">ราคาที่ได้กำไร ${p.target}%</th><th class="r">กำไรต่อถุงที่ราคาปัจจุบัน</th><th class="r">กำไรต่อถุงที่ราคาใหม่ ${f2(p.newPrice)}</th><th class="r">ต้องขึ้นราคาอีก</th></tr></thead><tbody>
      ${list.map(v => { const y = prCalc(p, v), lab = v === 0 ? 'ไม่มีโปร' : f2(v) + ' บาท' + (v === p.actual && v ? ' (บิลจริงเดือนนี้)' : v === cfg.promo.rate ? ' (ที่สำนักงานตั้งไว้)' : ''); return `<tr${v === p.promo ? ' class="hl"' : ''}><td>${lab}</td><td class="r">${pv(y.be)}</td><td class="r">${pv(y.target)}</td><td class="r${cls(y.now)}">${f2(y.now)}</td><td class="r${cls(y.at)}">${f2(y.at)}</td><td class="r">${y.be != null && y.be > p.price ? f2(y.be - p.price) : '-'}</td></tr>`; }).join('')}
      </tbody></table></div>
      <div class="note">${N.price ? esc(N.price) + '<br>' : ''}ราคาเท่าทุน = (ต้นทุนสินค้า + ขนส่ง + ค่าโปร + ค่าปรับอื่น) หารด้วย (100% − ส่วนที่ CJ หักตามสัญญา − ส่วนกลาง)</div></div>`;
  }
  let pr = null;
  function vPrice() {
    if (!pr) pr = prDefaults();
    const inp = (k, l) => `<label>${l}<input type="number" step="any" data-pr="${k}" value="${pr[k]}"></label>`;
    return `<div class="card">${H('ตั้งราคาขายให้ CJ เท่าไรจึงจะดี', 'prInputs', `${esc(N.productLabel || 'สินค้าที่ร่วมโปร')} (${esc(cfg.promo.skus.join(', '))}) · ตัวเลขตั้งต้นจากข้อมูลจริง ${mLabel(month)}`)}
      <div class="form">${inp('price', 'ราคาขายให้ CJ ตอนนี้ (บาท/ถุง)')}${inp('newPrice', 'ราคาใหม่ที่ขอ CJ (บาท/ถุง)')}${inp('cost', 'ต้นทุนสินค้าถึงโกดัง (บาท/ถุง)')}${inp('logi', 'ขนส่งไปคลัง CJ และค่าลงสินค้า (บาท/ถุง)')}${inp('promo', 'ค่าโปรที่ CJ เรียกเก็บ (บาท/ถุง)')}${inp('other', 'ค่าปรับและส่วนลดอื่น (บาท/ถุง)')}${inp('tta', 'CJ หักตามสัญญา (% ของราคา)')}${inp('oh', 'ค่าใช้จ่ายส่วนกลาง (% ของราคา)')}${inp('target', 'กำไรที่ต้องการ (% ของราคา)')}</div></div>
      <div id="prOut">${prOut()}</div>`;
  }

  /* ---------- สินค้า ---------- */
  let skuCh = '';
  function vSku() {
    const chs = [...new Set(model.sales.filter(s => s.month === month).map(s => s.channel))].sort();
    if (skuCh && !chs.includes(skuCh)) skuCh = '';
    const rows = E.skuTable(model, month, skuCh || null), top = rows.filter(r => r.qty > 0).slice(0, 8), tot = rows.reduce((s, r) => s + r.revenue, 0);
    return `
    ${top.length ? lead('info', `${mLabel(month)} · ${skuCh ? esc(skuCh) : 'ทุกช่องทาง'}: ขายดีที่สุดคือ ${esc(top[0].name)}`, `ยอดขาย <b>${f0(top[0].revenue)} บาท</b> (${pc(tot ? top[0].revenue / tot : 0)} ของยอดขาย${skuCh ? 'ช่องทางนี้' : 'ทั้งหมด'}) จำนวน ${f0(top[0].qty)} ชิ้น กำไรขั้นต้น ${pc(top[0].gm)}${top[1] ? ` รองลงมาคือ ${esc(top[1].name)} ${f0(top[1].revenue)} บาท` : ''}`) : ''}
    <div class="row" style="margin-bottom:14px"><label class="muted">ช่องทาง ${tip('skuCh')} <select id="skuCh" style="margin-left:6px"><option value="">ทุกช่องทาง</option>${chs.map(c => `<option${c === skuCh ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label><span class="muted">${mLabel(month)} · ยอดขาย ${f0(tot)} บาท</span></div>
    <div class="card">${H('สินค้าขายดี ' + (skuCh ? 'ของ ' + esc(skuCh) : 'ทุกช่องทาง'), 'skuCh', 'ยอดขาย · บาท')}${bars(top.map(r => ({ label: r.sku + ' ' + (N.nameTrim && r.name.indexOf(N.nameTrim) === 0 ? r.name.slice(N.nameTrim.length) : r.name).slice(0, 26), value: r.revenue })))}</div>
    <div class="card">${H('กำไรและสต๊อกรายสินค้า', 'sku', `"พอขาย" คิดจากยอดขายเดือนนี้ทุกช่องทาง`)}
      <div class="tw"><table><thead><tr><th>รหัส</th><th>สินค้า</th><th class="r">จำนวนขาย</th><th class="r">ยอดขาย</th><th class="r">สัดส่วน</th><th class="r">กำไรขั้นต้น</th><th class="r">%</th><th class="r">ราคาเฉลี่ย</th><th class="r">ต้นทุน/หน่วย</th><th class="r">สต๊อก</th><th class="r">พอขาย (วัน)</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${esc(r.sku)}</td><td>${esc(r.name)}</td><td class="r">${f0(r.qty)}</td><td class="r">${f0(r.revenue)}</td><td class="r">${pc(tot ? r.revenue / tot : 0)}</td>${!r.cost && r.qty > 0 && r.sku.charAt(0) !== '(' ? '<td class="r" colspan="2"><span class="tag warn">ไม่มีข้อมูลต้นทุน</span></td>' : `<td class="r${cls(r.gp)}">${f0(r.gp)}</td><td class="r${cls(r.gp)}">${pc(r.gm)}</td>`}<td class="r">${r.qty > 0 ? f2(r.revenue / r.qty) : ''}</td><td class="r">${!r.cost && r.qty > 0 && r.sku.charAt(0) !== '(' ? '<span class="muted">ไม่มีข้อมูล</span>' : f2(r.cost)}</td><td class="r${r.stockQty < 0 ? ' neg' : ''}">${r.stockQty == null ? '<span class="muted">ไม่มีข้อมูล</span>' : f0(r.stockQty)}</td><td class="r${!skuCh && r.days != null && r.days < 15 ? ' neg' : ''}">${skuCh || r.days == null ? '' : f0(r.days)}</td></tr>`).join('')}
      </tbody></table></div></div>`;
  }

  /* ---------- นำเข้าและจับคู่ ---------- */
  function vImport() {
    const c = model ? model.checks : null;
    const li = (ok, t) => `<li><span class="tag ${ok ? 'ok' : 'warn'}">${ok ? 'ผ่าน' : 'ต้องดู'}</span><span>${t}</span></li>`;
    let checks = '';
    if (c) {
      const sm = c.summary[month], dv = c.detailValue[month] || 0, nc = c.noCost[month] || [], h = model.has(month);
      checks = `<div class="card">${H('ตรวจก่อนเชื่อตัวเลข · ' + mLabel(month), 'iChecks')}<ul class="chk">
        ${sm != null ? li(Math.abs(dv - sm) < Math.max(1, sm * 0.0005), `ยอดขายรวม VAT หักรับคืน จากไฟล์รายบรรทัด ${f0(dv)} บาท เทียบไฟล์สรุปยอดขาย ${f0(sm)} บาท ผลต่าง ${f0(dv - sm)}`) : li(false, 'เดือนนี้ไม่มีไฟล์สรุปยอดขายให้เทียบ')}
        ${li(h.expenses, h.expenses ? 'มีไฟล์รายจ่ายอื่นของเดือนนี้' : 'เดือนนี้ไม่มีไฟล์รายจ่ายอื่น กำไรจะสูงเกินจริง')}
        ${li(h.orderExp || h.fill, h.orderExp ? 'มีไฟล์ค่าใช้จ่ายที่ผูกกับใบขาย (ค่าขนส่ง) ของเดือนนี้' : h.fill ? 'เดือนนี้ไม่มีไฟล์ค่าใช้จ่ายที่ผูกกับใบขาย ใช้ค่าขนส่งตามช่องทางจาก Report สำนักงานแทน' : 'เดือนนี้ไม่มีไฟล์ค่าใช้จ่ายที่ผูกกับใบขาย ค่าขนส่งรายบิลจึงไม่ครบ')}
        ${li(h.cost || h.costCalc, h.cost ? 'ใช้ต้นทุนถัวเฉลี่ยของงวดนี้จากตารางต้นทุนที่สำนักงานคำนวณ' : h.costCalc ? 'สำนักงานยังไม่ได้ทำตารางต้นทุนของเดือนนี้ โปรแกรมคำนวณต้นทุนถัวเฉลี่ยของงวดให้จากยอดยกมา รายการซื้อ ค่าใช้จ่ายนำเข้า และรายงานสินค้าเคลื่อนไหว (ดู Tab กระทบต้นทุน ในไฟล์ Export)' : h.costFrom ? `สำนักงานยังไม่ได้คำนวณต้นทุนของเดือนนี้ ใช้ต้นทุนถัวเฉลี่ยของ ${mLabel(h.costFrom)} แทนไปก่อน` : (h.stock ? 'ไม่มีตารางต้นทุนของสำนักงานสำหรับเดือนนี้ ใช้ต้นทุนต่อหน่วยในไฟล์สต๊อกของโปรแกรมขายแทน' : 'ไม่มีทั้งตารางต้นทุนและไฟล์สต๊อกของเดือนนี้ ใช้ต้นทุนจากเดือนที่ใกล้ที่สุด'))}
        ${li(h.stock, h.stock ? 'มีไฟล์สต๊อกสิ้นเดือนนี้' : 'ไม่มีไฟล์สต๊อกสิ้นเดือนนี้ หน้าสินค้าใช้สต๊อกของเดือนที่ใกล้ที่สุด')}
        ${li(!c.unmappedCh.length, c.unmappedCh.length ? 'ช่องทางที่ยังไม่ได้จับคู่ (ทุกเดือน): ' + esc(c.unmappedCh.join(', ')) : 'ทุกช่องทางขายจับคู่แล้ว')}
        ${li(!c.unmappedPrefix.length, c.unmappedPrefix.length ? 'รหัสนำหน้าค่าใช้จ่ายที่ยังไม่ได้จับคู่ (ลงส่วนกลางไว้ก่อน): ' + esc(c.unmappedPrefix.join(', ')) : 'ทุกรหัสนำหน้าค่าใช้จ่ายจับคู่แล้ว')}
        ${li(!nc.length, nc.length ? 'สินค้าที่ขายแต่ไม่มีต้นทุน: ' + esc(nc.join(', ')) : 'ทุกสินค้าที่ขายมีต้นทุนต่อหน่วย')}
        ${li(!c.orphan.n, c.orphan.n ? `ค่าใช้จ่ายผูกใบขาย ${c.orphan.n} บรรทัด (${f0(c.orphan.amt)} บาท) หาใบขายไม่เจอ จึงไม่นับ` : 'ค่าใช้จ่ายผูกใบขายหาใบขายเจอครบ')}
        ${c.dups.length ? `<li><span class="tag">แจ้ง</span><span>ตารางที่ซ้ำกับไฟล์อื่นทั้งหมด ไม่นับซ้ำ: ${c.dups.map(f => esc(f.name)).join(' · ')}</span></li>` : ''}
        ${c.cancelled ? `<li><span class="tag">แจ้ง</span><span>ตัดรายการขายที่ถูกยกเลิก ${c.cancelled} เอกสาร (ทุกเดือน)</span></li>` : ''}
      </ul></div>`;
    }
    const chans = model ? [...new Set(Object.values(cfg.channelMap).concat(Object.values(cfg.prefixMap)))].filter(x => x && x !== E.EXCLUDE) : [];
    const dl = `<datalist id="dlch">${chans.concat([E.SHARED, E.EXCLUDE]).filter((v, i, a) => a.indexOf(v) === i).map(x => `<option value="${esc(x)}">`).join('')}</datalist>`;
    const rawCh = model ? [...new Set(model.checks.unmappedCh.concat(Object.keys(cfg.channelMap)))] : [];
    const cats = model ? [...new Set(model.expenses.filter(e => e.source === 'รายจ่ายอื่น').map(e => e.category))].sort() : [];
    return `
    <div class="drop" id="drop"><div class="dt">ลากไฟล์ export ของเดือนมาวางที่นี่</div>
      <p class="sub">วางได้หลายไฟล์พร้อมกัน ไฟล์ถูกอ่านในเครื่องนี้เท่านั้น ไม่ถูกส่งออกไปที่ไหน</p>
      <div class="row" style="justify-content:center"><label class="btn">เลือกไฟล์<input type="file" id="pick" multiple hidden></label>
      ${sample ? `<button class="btn g" id="btnSample">โหลดจากโฟลเดอร์ตัวอย่าง (${sample.files.length} ไฟล์)</button>` : ''}
      ${files.length ? '<button class="btn g" id="btnClear">ล้างไฟล์ทั้งหมด</button>' : ''}
      ${model && !hosted ? '<button class="btn g" id="btnEnc">สร้างไฟล์ข้อมูลสำหรับเว็บ (เข้ารหัส)</button>' : ''}</div></div>
    ${checks}
    ${files.length ? `<details><summary>ไฟล์ที่นำเข้า (${new Set(files.map(f => f.file)).size} ไฟล์ · ใช้คำนวณ ${files.filter(f => f.used && !f.dup).length} ตาราง)</summary><div class="card">${H('ไฟล์ที่นำเข้า', 'iFiles')}<div class="tw"><table><thead><tr><th>ไฟล์</th><th>ระบบอ่านเป็น</th><th>สถานะ</th><th>รายละเอียด</th></tr></thead><tbody>
      ${files.map(f => `<tr><td>${esc(f.name)}</td><td>${esc(f.label)}</td><td>${f.dup ? '<span class="tag warn">ซ้ำ ไม่นับ</span>' : f.used ? '<span class="tag ok">ใช้คำนวณ</span>' : '<span class="tag">ยังไม่ใช้</span>'}</td><td class="muted">${esc(f.dup ? f.dupNote : f.info + (f.dupNote ? ' · ' + f.dupNote : ''))}</td></tr>`).join('')}</tbody></table></div></div></details>` : ''}
    ${model ? `${dl}
    <details><summary>วิธีคิดค่าโปร 1 แถม 1 และอัตราตามสัญญา CJ</summary><div class="card"><div class="form">
      <label>ประมาณการค่าร่วมโปร (บาท/ถุง)<input type="number" step="any" data-cfg="promo.rate" value="${cfg.promo.rate}"></label>
      <label>รหัสสินค้าที่ร่วมโปร (คั่นด้วยจุลภาค)<input type="text" data-cfg="promo.skus" value="${esc(cfg.promo.skus.join(', '))}"></label>
      <label>Commercial support (%)<input type="number" step="any" data-cfg="tta.cs" value="${cfg.tta.cs}"></label>
      <label>สาขาใหม่ (%)<input type="number" step="any" data-cfg="tta.ns" value="${cfg.tta.ns}"></label>
      <label>DC fee (%)<input type="number" step="any" data-cfg="tta.dc" value="${cfg.tta.dc}"></label></div></div></details>
    <details><summary>ค่าใช้จ่ายส่วนกลาง: รายการที่ไม่ปันให้ CJ และรายการที่ไม่นับ</summary><div class="card"><p class="sub">ใส่คำที่อยู่ในชื่อรายการหรือชื่อหมวด คั่นด้วยจุลภาค รายการส่วนกลางที่ชื่อมีคำเหล่านี้จะปันเฉพาะช่องทางที่ไม่ใช่ CJ · รายการที่ชื่อมีคำในช่องที่สองจะไม่นับในกำไรขาดทุน (ภาษีและสินทรัพย์ไม่นับอยู่แล้ว)</p><div class="form">
      <label style="grid-column:1/-1">คำของรายการส่วนกลางที่ไม่ปันให้ CJ<input type="text" data-list="noCJ" value="${esc((cfg.noCJ || []).join(', '))}"></label>
      <label style="grid-column:1/-1">คำของรายการที่ไม่นับในกำไรขาดทุน<input type="text" data-list="excludeWords" value="${esc((cfg.excludeWords || []).join(', '))}"></label></div></div></details>
    <details><summary>รายการปรับปรุงของสำนักงาน (${cfg.adjustments.length})</summary><div class="card"><p class="sub">ใช้แทนการแก้ตัวเลขในไฟล์ดิบ ทุกรายการต้องมีเหตุผล และยังอยู่แม้อัปโหลดไฟล์ดิบใหม่</p>
      <div class="tw"><table><thead><tr><th>เดือน</th><th>ช่องทาง</th><th>รายการ</th><th class="r">ค่าใช้จ่ายเพิ่ม (ลด)</th><th>เหตุผล</th><th></th></tr></thead><tbody>
      ${cfg.adjustments.map((a, i) => `<tr><td>${mLabel(a.month)}</td><td>${esc(a.channel)}</td><td>${esc(a.label)}</td><td class="r">${f0(a.amount)}</td><td>${esc(a.reason)}</td><td><button class="btn g sm" data-deladj="${i}">ลบ</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">ยังไม่มีรายการปรับปรุง</td></tr>'}
      </tbody></table></div>
      <div class="form" style="margin-top:12px"><label>ช่องทาง<input type="text" id="adjCh" list="dlch" value="CJ"></label><label>รายการ<input type="text" id="adjLabel"></label><label>ค่าใช้จ่ายเพิ่ม (ใส่ลบเพื่อลด)<input type="number" step="any" id="adjAmt"></label><label>เหตุผล<input type="text" id="adjReason"></label></div>
      <div style="margin-top:10px"><button class="btn" id="adjAdd">เพิ่มรายการปรับปรุงของ ${mLabel(month)}</button></div></div></details>
    <details><summary>จับคู่ช่องทางขาย (${rawCh.length})</summary><div class="card"><p class="sub">ซ้าย = ชื่อในโปรแกรมขาย · ขวา = ช่องทางของ Report ค่าเริ่มต้นเรียนรู้จากคอลัมน์ที่ลูกค้าเพิ่มในไฟล์</p><div class="tw"><table><thead><tr><th>ในโปรแกรมขาย</th><th>ช่องทางของ Report</th></tr></thead><tbody>
      ${rawCh.map(r => `<tr><td>${esc(r)}</td><td><input type="text" list="dlch" data-map="channelMap" data-k="${esc(r)}" value="${esc(cfg.channelMap[r] || '')}"></td></tr>`).join('')}</tbody></table></div></div></details>
    <details><summary>จับคู่รหัสนำหน้าค่าใช้จ่าย (${Object.keys(cfg.prefixMap).length})</summary><div class="card"><p class="sub">รหัสหน้าชื่อรายการ เช่น CJ-ค่าขนส่ง → ช่องทาง CJ · "${E.SHARED}" คือจัดสรรทุกช่องทาง · "${E.EXCLUDE}" คือไม่เข้ารายงาน</p><div class="tw"><table><thead><tr><th>รหัสนำหน้า</th><th>ลงที่</th></tr></thead><tbody>
      ${[...new Set(Object.keys(cfg.prefixMap).concat(c.unmappedPrefix.filter(p => !p.startsWith('('))))].map(p => `<tr><td>${esc(p)}</td><td><input type="text" list="dlch" data-map="prefixMap" data-k="${esc(p)}" value="${esc(cfg.prefixMap[p] || '')}"></td></tr>`).join('')}</tbody></table></div></div></details>
    <details><summary>ลักษณะต้นทุนของแต่ละหมวด (${cats.length})</summary><div class="card"><div class="tw"><table><thead><tr><th>หมวดในไฟล์</th><th>ลักษณะ</th></tr></thead><tbody>
      ${cats.map(k => { const v = cfg.catNature[k] || ''; return `<tr><td>${esc(k)}</td><td><select data-map="catNature" data-k="${esc(k)}"><option value=""${!v ? ' selected' : ''}>ตามไฟล์ / เดาให้</option><option value="var"${v === 'var' ? ' selected' : ''}>ผันแปร</option><option value="fix"${v === 'fix' ? ' selected' : ''}>คงที่</option><option value="ex"${v === 'ex' ? ' selected' : ''}>ไม่นับ</option></select></td></tr>`; }).join('')}</tbody></table></div></div></details>` : ''}`;
  }

  /* ---------- เวอร์ชันบนเว็บ: ข้อมูลเข้ารหัสด้วยรหัสผ่าน (AES-256-GCM, PBKDF2 600,000 รอบ) ---------- */
  const b64 = u8 => { let t = ''; for (let i = 0; i < u8.length; i += 0x8000) t += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(t); };
  const unb64 = t => Uint8Array.from(atob(t), ch => ch.charCodeAt(0));
  async function keyOf(pin, salt, iter) {
    const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  const pipe = async (bytes, T) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new T('gzip'))).arrayBuffer());
  // ตัดข้อมูลส่วนบุคคลออกก่อนขึ้นเว็บ: ชื่อลูกค้า ผู้ติดต่อ เบอร์โทร ที่อยู่ ไม่อยู่ในชุดข้อมูลนี้
  const scrub = t => String(t || '').replace(/\(?0\d{1,2}[- ]?\d{3}[- ]?\d{4}\)?/g, '').replace(/\s+/g, ' ').trim();
  function snapshotData() {
    const parts = files.filter(f => f.used && !f.dup).map(f => {
      const o = { name: f.name, file: f.file, kind: f.kind, label: f.label, used: true, info: f.info, hasMap: !!f.hasMap, learned: f.learned, month: f.month, byMonth: f.byMonth, valueByMonth: f.valueByMonth, cancelled: f.cancelled, cancelledDocs: f.cancelledDocs, hash: f.hash };
      let lines = f.lines || [];
      if (f.kind === 'sales' || f.kind === 'returns') lines = lines.map(l => Object.assign({}, l, { customer: '', note: /ขาดส่ง/.test(l.note) ? 'ขาดส่ง' : /เสียหาย|ทำลาย|ชำรุด/.test(l.note) ? 'เสียหาย' : '' }));
      else if (f.kind === 'expenses') lines = lines.map(l => Object.assign({}, l, { contact: '', name: scrub(l.name) }));
      else if (f.kind === 'purchases') lines = lines.map(l => Object.assign({}, l, { contact: '' }));
      else if (f.kind === 'officeExp') lines = lines.filter(l => l.category === 'ค่าขนส่ง').map(l => Object.assign({}, l, { detail: scrub(l.detail) }));
      if (f.lines) o.lines = lines;
      return o;
    });
    const c = JSON.parse(JSON.stringify(cfg)); c.present = true;
    return { v: 1, made: new Date().toISOString(), cfg: c, files: parts };
  }
  async function makeEnc(pin) {
    let bytes = new TextEncoder().encode(JSON.stringify(snapshotData())), gz = false;
    if (window.CompressionStream) { bytes = await pipe(bytes, CompressionStream); gz = true; }
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), iter = 600000;
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyOf(pin, salt, iter), bytes));
    return 'window.MR_ENC=' + JSON.stringify({ v: 1, gz, iter, salt: b64(salt), iv: b64(iv), ct: b64(ct) }) + ';\n';
  }
  async function openEnc(pin) {
    const e = window.MR_ENC;
    let bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(e.iv) }, await keyOf(pin, unb64(e.salt), e.iter), unb64(e.ct)));
    if (e.gz) bytes = await pipe(bytes, DecompressionStream);
    return JSON.parse(new TextDecoder().decode(bytes), (k, v) => (k === 'date' || k === 'payDate') && typeof v === 'string' ? new Date(v) : v);
  }
  function lockScreen(msg) {
    document.body.classList.add('locked');
    view.innerHTML = `<form class="lock" id="lock"><div class="lt">ใส่รหัสเพื่อเปิดรายงาน</div><input id="pin" type="password" inputmode="numeric" autocomplete="off" aria-label="รหัส" autofocus><button class="btn" type="submit">เปิดรายงาน</button><div class="msg">${msg || ''}</div></form>`;
  }
  async function unlock(pin, silent) {
    let d;
    try { d = await openEnc(pin); } catch (e) { lockScreen(silent ? '' : 'รหัสไม่ถูกต้อง'); return; }
    hosted = true; hostKey = 'mr_cfg_web_' + d.made;
    cfg = d.cfg;                                   // ตารางจับคู่และค่าที่ตั้งไว้มากับชุดข้อมูล
    try { const own = JSON.parse(localStorage.getItem(hostKey) || 'null'); if (own) cfg = own; } catch (e) { /* ใช้ค่าจากชุดข้อมูล */ }
    try { localStorage.setItem('mr_pin', pin); } catch (e) { /* ไม่จำรหัสก็ยังใช้ได้ */ }
    files = d.files; document.body.classList.remove('locked');
    applyPresent(); rebuild(); if (!picked || (tab === 'import' && cfg.present)) tab = 'trend'; render();
  }
  function startHosted() {
    let saved = ''; try { saved = localStorage.getItem('mr_pin') || ''; } catch (e) { /* ไม่มีรหัสที่จำไว้ */ }
    if (saved) { view.innerHTML = '<div class="empty">กำลังเปิดรายงาน…</div>'; unlock(saved, true); } else lockScreen('');
  }
  view.addEventListener('submit', e => { if (e.target.id !== 'lock') return; e.preventDefault(); const p = $('#pin').value.trim(); if (!p) return; view.querySelector('.msg').textContent = 'กำลังตรวจรหัส…'; unlock(p, false); });

  /* ---------- วาดและผูกเหตุการณ์ ---------- */
  const VIEWS = { trend: vTrend, overview: vOverview, cj: vCJ, promo: vPromo, price: vPrice, be: vBE, ch: vCh, cash: vCash, sku: vSku, import: vImport };
  function render() {
    hideTip();
    document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
    document.querySelectorAll('#mode button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === cfg.promo.mode));
    if (!model && tab !== 'import') { view.innerHTML = '<div class="empty">ยังไม่มีข้อมูล ไปที่ "นำเข้าและจับคู่" เพื่อใส่ไฟล์ของเดือน</div>'; return; }
    view.innerHTML = VIEWS[tab]();
  }

  // คำอธิบาย: ชี้เมาส์ โฟกัส หรือกด ที่เครื่องหมาย i
  const tipbox = $('#tipbox'); let tipFor = null;
  function showTip(el) {
    const t = window.TIPS[el.dataset.tip]; if (!t) return;
    tipFor = el; tipbox.textContent = t; tipbox.hidden = false;
    const r = el.getBoundingClientRect(), w = Math.min(340, window.innerWidth - 24);
    tipbox.style.width = w + 'px';
    const left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2)); let top = r.bottom + 8;
    if (top + tipbox.offsetHeight > window.innerHeight - 8) top = Math.max(8, r.top - tipbox.offsetHeight - 8);
    tipbox.style.left = left + 'px'; tipbox.style.top = top + 'px';
  }
  function hideTip() { tipFor = null; tipbox.hidden = true; }
  const tipOf = e => e.target.closest ? e.target.closest('.tip') : null;
  document.addEventListener('mouseover', e => { const t = tipOf(e); if (t) showTip(t); });
  document.addEventListener('mouseout', e => { const t = tipOf(e); if (t && t === tipFor && document.activeElement !== t) hideTip(); });
  document.addEventListener('focusin', e => { const t = tipOf(e); if (t) showTip(t); });
  document.addEventListener('focusout', e => { if (tipOf(e)) hideTip(); });
  document.addEventListener('click', e => { const t = tipOf(e); if (t) { e.preventDefault(); e.stopPropagation(); showTip(t); } else if (!(e.target.closest && e.target.closest('#tipbox'))) hideTip(); }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hideTip(); });
  window.addEventListener('scroll', hideTip, true);

  $('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { tab = b.dataset.tab; picked = true; render(); window.scrollTo(0, 0); } });
  $('#mode').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { cfg.promo.mode = b.dataset.mode; saveCfg(); render(); } });
  function applyPresent() { document.body.classList.toggle('present', !!cfg.present); $('#present').checked = !!cfg.present; if (cfg.present && tab === 'import' && model) tab = 'trend'; }
  $('#present').addEventListener('change', e => { cfg.present = e.target.checked; saveCfg(); applyPresent(); render(); });
  $('#btnExport').addEventListener('click', async () => {
    if (!model) { alert('ยังไม่มีข้อมูลให้ Export'); return; }
    const b = $('#btnExport'), old = b.textContent; b.textContent = 'กำลังสร้างไฟล์…'; b.disabled = true;
    try {
      const buf = await Exporter.build(model, cfg, files, E);
      const name = `Management Report ${model.months[0]} ถึง ${model.months[model.months.length - 1]}.xlsx`;
      if (window.__mrSaveTo) await fetch(window.__mrSaveTo, { method: 'PUT', body: buf });   // ใช้ตอนทดสอบเท่านั้น
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); }
    } catch (err) { alert('สร้างไฟล์ Excel ไม่สำเร็จ: ' + err.message); window.__mrExportErr = String(err && err.stack || err); }
    b.textContent = old; b.disabled = false;
  });
  $('#month').addEventListener('change', e => { month = e.target.value; sim = null; pr = null; render(); });

  view.addEventListener('click', e => {
    const t = e.target.closest('button') || e.target;
    if (t.dataset.scope) { cjScope = t.dataset.scope; render(); }
    else if (t.id === 'btnSample') loadSample();
    else if (t.id === 'btnClear') { files = []; rebuild(); }
    else if (t.id === 'btnEnc') { const p = prompt('ตั้งรหัสสำหรับเปิดรายงานบนเว็บ'); if (p) makeEnc(p.trim()).then(txt => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/javascript' })); a.download = 'data.enc.js'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); }); }
    else if (t.dataset.deladj != null) { cfg.adjustments.splice(+t.dataset.deladj, 1); rebuild(); }
    else if (t.id === 'fcReset') { cfg.fc = {}; saveCfg(); render(); }
    else if (t.dataset.delround != null) { cfg.promoRounds.splice(+t.dataset.delround, 1); rebuild(); }
    else if (t.id === 'rdAdd') {
      const a = { month: $('#rdMonth').value, label: $('#rdLabel').value.trim() || 'ค่าโปร 1 แถม 1', amount: +$('#rdAmt').value || 0 };
      if (!a.amount) { alert('กรอกยอดบิล'); return; }
      cfg.promoRounds.push(a); rebuild();
    }
    else if (t.id === 'adjAdd') {
      const a = { month, channel: $('#adjCh').value.trim() || 'CJ', label: $('#adjLabel').value.trim(), amount: +$('#adjAmt').value || 0, reason: $('#adjReason').value.trim(), nature: 'var' };
      if (!a.label || !a.amount || !a.reason) { alert('กรอกรายการ จำนวนเงิน และเหตุผลให้ครบ'); return; }
      cfg.adjustments.push(a); rebuild();
    }
  });
  view.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'pick') addFiles([...t.files]);
    else if (t.id === 'skuCh') { skuCh = t.value; render(); }
    else if (t.dataset.map) { const v = t.value.trim(); if (v) cfg[t.dataset.map][t.dataset.k] = v; else delete cfg[t.dataset.map][t.dataset.k]; rebuild(); }
    else if (t.dataset.fc) { if (t.value === '') delete cfg.fc[t.dataset.fc]; else cfg.fc[t.dataset.fc] = +t.value || 0; saveCfg(); render(); }
    else if (t.dataset.list) { cfg[t.dataset.list] = t.value.split(',').map(x => x.trim()).filter(Boolean); rebuild(); }
    else if (t.dataset.cfg1) { cfg[t.dataset.cfg1] = +t.value || 0; saveCfg(); render(); }
    else if (t.dataset.cfg) {
      const [a, b] = t.dataset.cfg.split('.');
      cfg[a][b] = b === 'skus' ? t.value.split(',').map(s => s.trim()).filter(Boolean) : (+t.value || 0);
      rebuild();
    }
  });
  view.addEventListener('input', e => {
    const q = e.target.dataset.pr; if (q) { pr[q] = +e.target.value || 0; $('#prOut').innerHTML = prOut(); return; }
    const k = e.target.dataset.sim; if (!k) return;
    sim[k] = +e.target.value || 0; $('#simOut').innerHTML = simOut();
  });
  view.addEventListener('dragover', e => { const d = e.target.closest('#drop'); if (d) { e.preventDefault(); d.classList.add('over'); } });
  view.addEventListener('dragleave', e => { const d = e.target.closest('#drop'); if (d) d.classList.remove('over'); });
  view.addEventListener('drop', e => { const d = e.target.closest('#drop'); if (d) { e.preventDefault(); d.classList.remove('over'); addFiles([...e.dataTransfer.files]); } });

  applyPresent();
  // เริ่มต้น: ถ้าเปิดผ่าน serve.py ที่ชี้โฟลเดอร์ตัวอย่างไว้ ให้โหลดเลย
  rebuild();
  fetch('sample/index.json').then(r => r.ok ? r.json() : null).catch(() => null).then(j => { if (j && j.files && j.files.length) { sample = j; loadSample(); } else if (window.MR_ENC) startHosted(); });

  window.__mr = { makeEnc, get hosted() { return hosted; }, get model() { return model; }, get cfg() { return cfg; }, get month() { return month; } };
})();
