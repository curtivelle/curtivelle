(() => {
  'use strict';

  const CURRENCY = new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT', maximumFractionDigits: 2 });
  const DATE = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' });
  const BN_DATE = new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium' });
  const DEFAULT_TERMS = `1. Quotation validity: 15 days from issue date.\n2. Custom designs cannot be changed after approval and production start.\n3. Advance payments and custom-made products are non-refundable.\n4. Final measurements must be verified before production; customer-provided measurements remain the customer's responsibility.\n5. Installation schedule depends on site readiness and access.\n6. Products remain the property of Curtivelle until full payment is received.\n7. Delivery must be made within 1 month of production.`;
  const PRODUCTS = Array.isArray(window.CURTIVELLE_PRODUCTS) ? window.CURTIVELLE_PRODUCTS : [];
  const TASSELS = Array.isArray(window.CURTIVELLE_TASSELS) ? window.CURTIVELLE_TASSELS : [];
  const LINE_LABELS = { modelCode: 'প্রোডাক্ট', height: 'হাইট (ইঞ্চি)', width: 'উইডথ (ইঞ্চি)', pleatCount: 'ফোল্ড', yards: 'ফেব্রিক (ইয়ার্ড)', yardPrice: 'প্রতি ইয়ার্ড মূল্য', design: 'ডিজাইন (ঐচ্ছিক)', designRate: 'ডিজাইন রেট', pieces: 'পিস', source: 'নোট', total: 'টোটাল' };
  const BUSINESS_ADDRESS = 'Amanullah Trade Center (7th Floor), Gulshan Avenue, Circle-02, Gulshan-02, Dhaka, Bangladesh, 1212';
  const normalizeProductCode = value => String(value || '').trim().replace(/^start?\s+/i, '* ');
  const DB_KEY = 'curtivelle_crm_v1';
  const CONFIG_KEY = 'curtivelle_crm_config';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const uid = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const n = (value) => Number(value) || 0;
  const money = (value) => CURRENCY.format(n(value)).replace('BDT', '৳');
  const dateText = (value) => value ? DATE.format(new Date(value)) : '—';
  const bnDateText = (value) => value ? BN_DATE.format(new Date(value)) : '—';
  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const today = () => new Date().toISOString().slice(0, 10);

  const defaultDb = () => ({ customers: [], quotations: [], invoices: [], versions: [], counter: { customer: 0, quotation: 0, invoice: 0 } });
  const loadConfig = () => ({ apiUrl: '', businessName: 'Curtivelle', ...JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}') });
  const saveConfig = (config) => localStorage.setItem(CONFIG_KEY, JSON.stringify(config));

  class LocalStore {
    constructor() { this.db = { ...defaultDb(), ...JSON.parse(localStorage.getItem(DB_KEY) || '{}') }; }
    persist() { localStorage.setItem(DB_KEY, JSON.stringify(this.db)); }
    async list(type, includeDeleted = false) { return clone(this.db[type].filter(x => includeDeleted || !x.deletedAt)); }
    async get(type, id) { return clone(this.db[type].find(x => x.id === id)); }
    async save(type, record) {
      const now = new Date().toISOString();
      const index = this.db[type].findIndex(x => x.id === record.id);
      if (index >= 0) {
        this.db.versions.push({ id: uid('VER'), entityType: type, entityId: record.id, savedAt: now, snapshot: clone(this.db[type][index]) });
        this.db[type][index] = { ...this.db[type][index], ...clone(record), updatedAt: now };
      } else {
        this.db[type].push({ ...clone(record), createdAt: now, updatedAt: now, deletedAt: null });
      }
      this.persist();
      return clone(record);
    }
    async remove(type, id) { const record = await this.get(type, id); if (record) await this.save(type, { ...record, deletedAt: new Date().toISOString() }); }
    async restore(type, id) { const record = await this.get(type, id); if (record) await this.save(type, { ...record, deletedAt: null }); }
    async versions(type, id) { return clone(this.db.versions.filter(v => v.entityType === type && v.entityId === id).reverse()); }
    async nextNumber(type) {
      this.db.counter[type] = n(this.db.counter[type]) + 1;
      this.persist();
      const prefix = { customer: 'CUS', quotation: 'QT', invoice: 'INV' }[type];
      return `${prefix}-${new Date().getFullYear()}-${String(this.db.counter[type]).padStart(5, '0')}`;
    }
  }

  class ApiStore {
    constructor(url) { this.url = url; }
    async call(action, payload = {}) {
      const response = await fetch(this.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, ...payload }) });
      const result = await response.json();
      if (!result.ok) throw new Error(result.error || 'Server request failed');
      return result.data;
    }
    list(type, includeDeleted = false) { return this.call('list', { type, includeDeleted }); }
    get(type, id) { return this.call('get', { type, id }); }
    save(type, record) { return this.call('save', { type, record }); }
    remove(type, id) { return this.call('remove', { type, id }); }
    restore(type, id) { return this.call('restore', { type, id }); }
    versions(type, id) { return this.call('versions', { type, id }); }
    nextNumber(type) { return this.call('nextNumber', { type }); }
  }

  const state = { config: loadConfig(), store: null };
  const setStore = () => {
    state.store = state.config.apiUrl ? new ApiStore(state.config.apiUrl) : new LocalStore();
    $('#connectionDot').classList.toggle('online', Boolean(state.config.apiUrl));
    $('#connectionText').textContent = state.config.apiUrl ? 'Google Sheets connected' : 'Local demo mode';
  };
  const toast = (message) => { const el = $('#toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2600); };
  const setHeading = (title, subtitle = '') => { $('#pageTitle').textContent = title; $('#pageSubtitle').textContent = subtitle; };

  function statusBadge(status) {
    const className = ['paid', 'completed'].includes(status) ? 'paid' : ['pending', 'partial'].includes(status) ? 'due' : '';
    return `<span class="badge ${className}">${escapeHtml(status || 'draft')}</span>`;
  }

  async function dashboard() {
    setHeading('ড্যাশবোর্ড', 'Curtivelle business overview');
    const [customers, quotations, invoices] = await Promise.all(['customers', 'quotations', 'invoices'].map(x => state.store.list(x)));
    const sales = invoices.reduce((s, x) => s + n(x.grandTotal), 0);
    const due = invoices.reduce((s, x) => s + n(x.dueAmount), 0);
    const completed = invoices.filter(x => x.status === 'completed' || x.status === 'paid').length;
    const months = [...Array(6)].map((_, i) => { const d = new Date(); d.setMonth(d.getMonth() - (5 - i)); return { key: d.toISOString().slice(0, 7), label: d.toLocaleString('en', { month: 'short' }), total: 0 }; });
    invoices.forEach(inv => { const month = months.find(m => m.key === String(inv.date || '').slice(0, 7)); if (month) month.total += n(inv.grandTotal); });
    const max = Math.max(...months.map(m => m.total), 1);
    const recent = [...quotations].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 6);
    $('#app').innerHTML = `
      <div class="stats">
        <div class="stat"><span>মোট কাস্টমার</span><strong>${customers.length}</strong></div>
        <div class="stat"><span>মোট কোটেশন</span><strong>${quotations.length}</strong></div>
        <div class="stat"><span>মোট ইনভয়েস</span><strong>${invoices.length}</strong></div>
        <div class="stat accent"><span>মোট সেলস</span><strong>${money(sales)}</strong></div>
        <div class="stat"><span>পেন্ডিং / সম্পন্ন</span><strong>${money(due)} / ${completed}</strong></div>
      </div>
      <div class="dashboard-grid">
        <div class="card"><div class="card-head"><h2>সাম্প্রতিক কোটেশন</h2><a class="btn btn-secondary" href="#quotations">সব দেখুন</a></div>${recordTable('quotations', recent)}</div>
        <div class="card"><div class="card-head"><h2>মাসিক সেলস</h2></div><div class="chart">${months.map(m => `<div class="bar-wrap" title="${money(m.total)}"><div class="bar" style="height:${Math.max(2, m.total / max * 100)}%"></div><small>${m.label}</small></div>`).join('')}</div></div>
      </div>`;
  }

  function recordTable(type, rows) {
    if (!rows.length) return '<div class="empty">এখনও কোনো রেকর্ড নেই</div>';
    const isCustomers = type === 'customers';
    return `<div class="table-wrap"><table><thead><tr>${isCustomers ? '<th>Customer ID</th><th>নাম</th><th>ফোন</th>' : '<th>নম্বর</th><th>কাস্টমার</th><th>তারিখ</th><th>টোটাল</th><th>স্ট্যাটাস</th>'}<th class="no-print">অ্যাকশন</th></tr></thead><tbody>${rows.map(row => `<tr>${isCustomers
      ? `<td>${escapeHtml(row.customerNo)}</td><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.phone)}</td>`
      : `<td>${escapeHtml(row.number)}</td><td>${escapeHtml(row.customer?.name)}</td><td>${dateText(row.date)}</td><td>${money(row.grandTotal)}</td><td>${statusBadge(row.status)}</td>`}
      <td class="actions no-print">${type === 'quotations' ? `<a class="btn btn-secondary" href="#quotation/${row.id}">খুলুন</a>` : ''}${type === 'invoices' ? `<button class="btn btn-secondary" data-print="${row.id}">পেমেন্ট / প্রিন্ট</button>` : ''}<button class="btn btn-danger" data-delete="${type}:${row.id}">ডিলিট</button></td></tr>`).join('')}</tbody></table></div>`;
  }

  async function listPage(type) {
    const labels = { customers: ['কাস্টমার', 'Central customer database'], quotations: ['কোটেশন', 'Search, filter and manage quotations'], invoices: ['ইনভয়েস', 'Sales and payment tracking'] }[type];
    setHeading(...labels);
    const rows = await state.store.list(type);
    $('#app').innerHTML = `<div class="card"><div class="card-head"><h2>${labels[0]} লিস্ট</h2><div class="actions no-print"><button class="btn btn-secondary" id="exportCsv">CSV</button><button class="btn btn-secondary" id="printList">PDF / Print</button></div></div><div class="searchbar"><input id="recordSearch" type="search" placeholder="নাম, ফোন, ID, নম্বর, স্ট্যাটাস বা তারিখ দিয়ে খুঁজুন"><input id="fromDate" type="date" aria-label="From date"><input id="toDate" type="date" aria-label="To date"></div><div id="records">${recordTable(type, rows)}</div></div>`;
    const render = () => {
      const q = $('#recordSearch').value.toLowerCase(); const from = $('#fromDate').value; const to = $('#toDate').value;
      const filtered = rows.filter(row => {
        const haystack = JSON.stringify(row).toLowerCase(); const date = row.date || row.createdAt?.slice(0, 10) || '';
        return haystack.includes(q) && (!from || date >= from) && (!to || date <= to);
      });
      $('#records').innerHTML = recordTable(type, filtered);
      bindRecordActions();
      $('#exportCsv').onclick = () => exportCsv(type, filtered);
    };
    ['recordSearch', 'fromDate', 'toDate'].forEach(id => $(`#${id}`).addEventListener('input', render));
    $('#printList').onclick = () => window.print();
    render();
  }

  function bindRecordActions() {
    $$('[data-delete]').forEach(btn => btn.onclick = async () => {
      const [type, id] = btn.dataset.delete.split(':');
      if (!confirm('রেকর্ডটি রিসাইকেল বিনে পাঠাবেন?')) return;
      await state.store.remove(type, id); toast('রেকর্ড soft-delete করা হয়েছে'); route();
    });
    $$('[data-print]').forEach(btn => btn.onclick = async () => showInvoice(await state.store.get('invoices', btn.dataset.print)));
  }

  async function trashPage() {
    setHeading('রিসাইকেল বিন', 'Restore soft-deleted records');
    const groups = await Promise.all(['customers', 'quotations', 'invoices'].map(t => state.store.list(t, true).then(rows => [t, rows.filter(x => x.deletedAt)])));
    $('#app').innerHTML = groups.map(([type, rows]) => `<div class="card" style="margin-bottom:16px"><div class="card-head"><h2>${type}</h2></div>${rows.length ? `<div class="table-wrap"><table><tbody>${rows.map(x => `<tr><td>${escapeHtml(x.number || x.customerNo)}</td><td>${escapeHtml(x.name || x.customer?.name)}</td><td>${dateText(x.deletedAt)}</td><td><button class="btn btn-secondary" data-restore="${type}:${x.id}">Restore</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">কোনো deleted record নেই</div>'}</div>`).join('');
    $$('[data-restore]').forEach(btn => btn.onclick = async () => { const [type, id] = btn.dataset.restore.split(':'); await state.store.restore(type, id); toast('রেকর্ড restore হয়েছে'); trashPage(); });
  }

  const blankLine = () => ({ modelCode: '', height: '', width: '', pleatCount: '', yards: '', yardPrice: '', catalogUnitPrice: '', gsm: '', source: '', design: '', designRate: '', pieces: 1, total: 0 });
  const blankExtra = () => ({ description: '', quantity: 1, unit: '', unitPrice: '', total: 0 });
  const blankRoom = (name = 'Master Bedroom') => ({ id: uid('ROOM'), name, curtains: [blankLine()], sheers: [blankLine()], extraFabric: [blankExtra()], fittings: [blankExtra()], accessories: [blankExtra()], total: 0 });
  const blankQuote = async () => ({ id: uid('QUOTE'), number: await state.store.nextNumber('quotation'), date: today(), deliveryDate: '', validUntil: new Date(Date.now() + 15 * 86400000).toISOString().slice(0,10), status: 'draft', customer: { id: '', customerNo: '', name: '', phone: '', profession: '', address: '' }, rooms: [blankRoom()], discountPercent: 0, discountAmount: 0, advanceReceived: 0, subtotal: 0, grandTotal: 0, dueAmount: 0, paymentTerms: '30% advance, remaining payment before/at installation.', offer: '', terms: DEFAULT_TERMS, notes: '' });
  const normalizeLine = item => {
    const legacyPriceOnly = item.yards == null && item.unitPrice != null;
    item.modelCode = normalizeProductCode(item.modelCode);
    item.yards = n(item.pleatCount) > 0 ? Math.round(((n(item.pleatCount) * 13.5) / 36) * 10000) / 10000 : (item.yards ?? (legacyPriceOnly ? 1 : ''));
    item.yardPrice = item.yardPrice ?? item.unitPrice ?? '';
    item.designRate = item.designRate ?? '';
    item.source = item.source ?? '';
    item.pieces = item.pieces || 1;
    return item;
  };

  async function quotationPage(id) {
    const quote = id ? await state.store.get('quotations', id) : await blankQuote();
    if (!quote) { toast('কোটেশন পাওয়া যায়নি'); location.hash = '#quotations'; return; }
    quote.deliveryDate = quote.deliveryDate || '';
    quote.discountPercent = n(quote.discountPercent);
    quote.offer = quote.offer || '';
    quote.rooms.forEach(room => ['curtains','sheers'].forEach(key => (room[key] || []).forEach(normalizeLine)));
    setHeading(id ? quote.number : 'নতুন কোটেশন', 'Room-wise curtain quotation builder');
    $('#app').innerHTML = `<form id="quotationForm" class="quotation-layout">
      <div class="quotation-main">
        <section class="card"><div class="card-head"><h2>কাস্টমার ও কোটেশন তথ্য</h2></div><div class="form-grid">
          <label>নাম<input name="customerName" required value="${escapeHtml(quote.customer.name)}"></label>
          <label>ফোন<input name="customerPhone" required value="${escapeHtml(quote.customer.phone)}"></label>
          <label>প্রফেশন<input name="customerProfession" value="${escapeHtml(quote.customer.profession)}"></label>
          <label>Customer ID<input name="customerNo" value="${escapeHtml(quote.customer.customerNo)}" readonly placeholder="Auto"></label>
          <label class="span-2">অ্যাড্রেস<textarea name="customerAddress">${escapeHtml(quote.customer.address)}</textarea></label>
          <label>কোটেশন নম্বর<input value="${escapeHtml(quote.number)}" readonly></label>
          <label>তারিখ<input name="date" type="date" value="${quote.date}"></label>
          <label>Delivery date<input name="deliveryDate" type="date" value="${quote.deliveryDate}"></label>
          <label>Valid until<input name="validUntil" type="date" value="${quote.validUntil}"></label>
          <label>Status<select name="status">${['draft','sent','approved','rejected'].map(x => `<option ${quote.status === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        </div></section>
        <div><div class="section-title"><h2>রুমসমূহ</h2><button class="btn btn-secondary no-print" type="button" id="addRoom">+ রুম যোগ করুন</button></div><div id="rooms"></div></div>
        <section class="card"><div class="card-head"><h2>পেমেন্ট ও শর্তাবলি</h2></div><div class="form-grid">
          <label>Discount (%)<input name="discountPercent" type="number" min="0" max="100" step="0.01" value="${n(quote.discountPercent)}"></label>
          <label>Advance received<input name="advanceReceived" type="number" min="0" step="0.01" value="${n(quote.advanceReceived)}"></label>
          <label class="span-2">Payment terms<textarea name="paymentTerms">${escapeHtml(quote.paymentTerms)}</textarea></label>
          <label class="span-4">Offer / special note (optional)<textarea name="offer" placeholder="ফাঁকা রাখলে print-এ দেখাবে না">${escapeHtml(quote.offer)}</textarea></label>
          <label class="span-4">Terms & conditions<textarea name="terms" rows="8">${escapeHtml(quote.terms)}</textarea></label>
          <label class="span-4">Notes (optional)<textarea name="notes" placeholder="ফাঁকা রাখলে print-এ দেখাবে না">${escapeHtml(quote.notes)}</textarea></label>
        </div></section>
      </div>
      <aside class="card quote-summary"><div class="card-head"><h2>Project Summary</h2></div><div id="roomSummary"></div><div class="summary-line"><span>Subtotal</span><strong id="subtotal">৳0</strong></div><div class="summary-line" id="discountRow" hidden><span>Discount</span><strong id="discountTotal">৳0</strong></div><div class="summary-line grand"><span>Grand total</span><strong id="grandTotal">৳0</strong></div><div class="summary-line"><span>Advance</span><strong id="advanceTotal">৳0</strong></div><div class="summary-line due"><span>Due amount</span><strong id="dueTotal">৳0</strong></div><div class="actions no-print" style="margin-top:18px"><button class="btn btn-primary" type="submit">সেভ করুন</button>${id ? '<button class="btn btn-secondary" type="button" id="convertInvoice">Convert to Invoice</button><button class="btn btn-secondary" type="button" id="printQuote">Quotation PDF</button><button class="btn btn-secondary" type="button" id="printMaking">Making PDF</button><button class="btn btn-secondary" type="button" id="printChallan">Challan PDF</button>' : ''}</div></aside>
    </form>`;

    const roomsRoot = $('#rooms');
    const renderRooms = () => { roomsRoot.innerHTML = ''; quote.rooms.forEach((room, index) => roomsRoot.appendChild(roomElement(room, index, quote, renderRooms))); calculateQuote(quote); };
    $('#addRoom').onclick = () => { quote.rooms.push(blankRoom(`Room ${quote.rooms.length + 1}`)); renderRooms(); };
    $('#quotationForm').addEventListener('input', () => calculateQuote(quote));
    $('#quotationForm').onsubmit = async (event) => { event.preventDefault(); await saveQuotation(quote); };
    if ($('#convertInvoice')) $('#convertInvoice').onclick = async () => convertToInvoice(quote);
    if ($('#printQuote')) $('#printQuote').onclick = () => openPrintDocument(quote, 'quotation');
    if ($('#printMaking')) $('#printMaking').onclick = () => openPrintDocument(quote, 'making');
    if ($('#printChallan')) $('#printChallan').onclick = () => openPrintDocument(quote, 'challan');
    renderRooms();
  }

  function roomElement(room, index, quote, rerender) {
    const wrap = document.createElement('section'); wrap.className = 'room-card';
    wrap.innerHTML = `<div class="room-head"><input class="room-name" list="roomOptions" value="${escapeHtml(room.name)}" aria-label="Room name"><output>${money(room.total)}</output><button class="icon-btn danger no-print remove-room" type="button" title="Remove room">×</button></div><div class="room-body"></div>`;
    const body = $('.room-body', wrap);
    [['curtains','কার্টেন'], ['sheers','শিয়ার']].forEach(([key, label]) => body.appendChild(lineSection(room, key, label, quote)));
    [['extraFabric','এক্সট্রা ফেব্রিক'], ['fittings','ফিটিংস'], ['accessories','অ্যাক্সেসরিজ']].forEach(([key, label]) => body.appendChild(extraSection(room, key, label, quote)));
    $('.room-name', wrap).oninput = e => { room.name = e.target.value; calculateQuote(quote); };
    $('.remove-room', wrap).onclick = () => { if (quote.rooms.length === 1) return toast('কমপক্ষে একটি রুম রাখতে হবে'); quote.rooms.splice(index, 1); rerender(); };
    return wrap;
  }

  function lineSection(room, key, label, quote) {
    const el = document.createElement('div'); el.className = 'item-section';
    el.innerHTML = `<div class="item-section-head"><h3>${label}</h3><button type="button" class="btn btn-secondary no-print">+ আইটেম</button></div><div class="line-item column-labels"><span>প্রোডাক্ট</span><span>হাইট</span><span>উইডথ</span><span>ফোল্ড</span><span>ফেব্রিক</span><span>ইয়ার্ড মূল্য</span><span>ডিজাইন</span><span>ডিজাইন রেট</span><span>পিস</span><span>নোট</span><span>টোটাল</span></div><div class="rows"></div>`;
    const render = () => {
      const rows = $('.rows', el); rows.innerHTML = '';
      room[key].forEach((rawItem, index) => {
        const item = normalizeLine(rawItem);
        const row = $('#lineItemTemplate').content.firstElementChild.cloneNode(true);
        $$('[data-field]', row).forEach(control => {
          const field = control.dataset.field;
          const wrapper = document.createElement('label');
          wrapper.className = `line-field field-${field}`;
          const caption = document.createElement('span');
          caption.textContent = LINE_LABELS[field] || field;
          control.replaceWith(wrapper);
          wrapper.append(caption, control);
        });
        $$('[data-field]', row).forEach(input => {
          const field = input.dataset.field;
          if (input.tagName === 'OUTPUT') input.textContent = money(item.total);
          else {
            input.value = item[field] ?? '';
            input.oninput = () => {
              item[field] = input.value;
              if (field === 'pleatCount') {
                item.yards = input.value === '' ? '' : Math.round(((n(input.value) * 13.5) / 36) * 10000) / 10000;
                $('[data-field="yards"]', row).value = item.yards;
              }
              if (field === 'modelCode') {
                item.modelCode = normalizeProductCode(input.value);
                input.value = item.modelCode;
                const product = PRODUCTS.find(p => p.code.toLowerCase() === item.modelCode.toLowerCase());
                if (product) {
                  item.yardPrice = product.yardPrice;
                  item.catalogUnitPrice = product.unitPrice;
                  item.gsm = product.gsm || '';
                  $('[data-field="yardPrice"]', row).value = item.yardPrice;
                }
              }
              calculateQuote(quote);
            };
          }
        });
        $('.remove-row', row).onclick = () => { room[key].splice(index, 1); render(); calculateQuote(quote); };
        rows.appendChild(row);
      });
    };
    $('button', el).onclick = () => { room[key].push(blankLine()); render(); };
    render(); return el;
  }

  function extraSection(room, key, label, quote) {
    const el = document.createElement('div'); el.className = 'item-section';
    el.innerHTML = `<div class="item-section-head"><h3>${label}</h3><button type="button" class="btn btn-secondary no-print">+ আইটেম</button></div><div class="rows"></div>`;
    const render = () => {
      const rows = $('.rows', el); rows.innerHTML = '';
      room[key].forEach((item, index) => {
        const row = $('#extraItemTemplate').content.firstElementChild.cloneNode(true);
        const productInput = $('[data-field="description"]', row);
        if (key === 'extraFabric') { productInput.setAttribute('list', 'productOptions'); productInput.placeholder = 'প্রোডাক্ট নির্বাচন করুন'; }
        if (key === 'accessories') { productInput.setAttribute('list', 'tasselOptions'); productInput.placeholder = 'ট্যাসেল/অ্যাক্সেসরি নির্বাচন করুন'; }
        $$('[data-field]', row).forEach(input => { const field = input.dataset.field; if (input.tagName === 'OUTPUT') input.textContent = money(item.total); else { input.value = item[field] ?? ''; input.oninput = () => { item[field] = field === 'description' && key === 'extraFabric' ? normalizeProductCode(input.value) : input.value; if (field === 'description' && key === 'extraFabric') { input.value = item[field]; const product = PRODUCTS.find(p => p.code.toLowerCase() === item[field].toLowerCase()); if (product) { item.unitPrice = product.yardPrice; item.unit = 'yard'; $('[data-field="unitPrice"]', row).value = item.unitPrice; $('[data-field="unit"]', row).value = item.unit; } } if (field === 'description' && key === 'accessories') { const product = TASSELS.find(p => p.code.toLowerCase() === item[field].trim().toLowerCase()); if (product) { item.unitPrice = product.price; item.unit = product.unit; $('[data-field="unitPrice"]', row).value = item.unitPrice; $('[data-field="unit"]', row).value = item.unit; } } calculateQuote(quote); }; } });
        $('.remove-row', row).onclick = () => { room[key].splice(index, 1); render(); calculateQuote(quote); };
        rows.appendChild(row);
      });
    };
    $('button', el).onclick = () => { room[key].push(blankExtra()); render(); };
    render(); return el;
  }

  function calculateQuote(quote) {
    quote.rooms.forEach((room, i) => {
      ['curtains','sheers'].forEach(key => room[key].forEach(item => {
        normalizeLine(item);
        const fabricCost = n(item.yards) * n(item.yardPrice);
        const designCost = item.design ? n(item.pleatCount) * n(item.designRate) : 0;
        item.fabricCost = fabricCost;
        item.designCost = designCost;
        item.total = (fabricCost + designCost) * n(item.pieces);
      }));
      ['extraFabric','fittings','accessories'].forEach(key => room[key].forEach(item => item.total = n(item.quantity) * n(item.unitPrice)));
      room.total = ['curtains','sheers','extraFabric','fittings','accessories'].flatMap(key => room[key]).reduce((s, item) => s + n(item.total), 0);
      const roomEl = $$('.room-card')[i]; if (roomEl) { $('.room-head output', roomEl).textContent = money(room.total); $$('[data-field="total"]', roomEl).forEach((out, idx) => { const items = ['curtains','sheers','extraFabric','fittings','accessories'].flatMap(key => room[key]); out.textContent = money(items[idx]?.total); }); }
    });
    const form = $('#quotationForm');
    quote.subtotal = quote.rooms.reduce((s, room) => s + n(room.total), 0);
    quote.discountPercent = n(form?.elements.discountPercent.value ?? quote.discountPercent);
    quote.discountAmount = quote.subtotal * Math.min(100, quote.discountPercent) / 100;
    quote.advanceReceived = n(form?.elements.advanceReceived.value ?? quote.advanceReceived);
    quote.grandTotal = Math.max(0, quote.subtotal - quote.discountAmount);
    quote.dueAmount = Math.max(0, quote.grandTotal - quote.advanceReceived);
    $('#roomSummary').innerHTML = quote.rooms.map(room => `<div class="summary-line"><span>${escapeHtml(room.name)}</span><strong>${money(room.total)}</strong></div>`).join('');
    $('#subtotal').textContent = money(quote.subtotal);
    $('#discountRow').hidden = quote.discountPercent <= 0;
    $('#discountTotal').textContent = `${quote.discountPercent}% · ${money(quote.discountAmount)}`;
    $('#grandTotal').textContent = money(quote.grandTotal); $('#advanceTotal').textContent = money(quote.advanceReceived); $('#dueTotal').textContent = money(quote.dueAmount);
  }

  async function saveQuotation(quote) {
    const form = $('#quotationForm');
    if (!form.reportValidity()) return;
    const customer = { ...quote.customer, name: form.elements.customerName.value.trim(), phone: form.elements.customerPhone.value.trim(), profession: form.elements.customerProfession.value.trim(), address: form.elements.customerAddress.value.trim() };
    const customers = await state.store.list('customers');
    const existing = customers.find(x => x.id === customer.id || x.phone.replace(/\D/g,'') === customer.phone.replace(/\D/g,''));
    if (existing) Object.assign(customer, existing, customer); else { customer.id = uid('CUSTOMER'); customer.customerNo = await state.store.nextNumber('customer'); }
    await state.store.save('customers', customer);
    Object.assign(quote, { customer, date: form.elements.date.value, deliveryDate: form.elements.deliveryDate.value, validUntil: form.elements.validUntil.value, status: form.elements.status.value, paymentTerms: form.elements.paymentTerms.value, offer: form.elements.offer.value.trim(), terms: form.elements.terms.value, notes: form.elements.notes.value.trim() });
    calculateQuote(quote); await state.store.save('quotations', quote); toast('কোটেশন সেভ হয়েছে'); location.hash = `#quotation/${quote.id}`;
  }

  async function convertToInvoice(quote) {
    if (!confirm('এই কোটেশন থেকে ইনভয়েস তৈরি করবেন?')) return;
    const invoices = await state.store.list('invoices');
    const duplicate = invoices.find(x => x.quotationId === quote.id);
    if (duplicate) return showInvoice(duplicate);
    const initialPayment = n(quote.advanceReceived) > 0 ? [{ id: uid('PAY'), date: quote.date || today(), amount: n(quote.advanceReceived), method: 'Advance', reference: quote.number, note: 'Quotation advance payment', createdAt: new Date().toISOString() }] : [];
    const invoice = { ...clone(quote), id: uid('INVOICE'), number: await state.store.nextNumber('invoice'), quotationId: quote.id, quotationNumber: quote.number, date: today(), payments: initialPayment, totalPaid: n(quote.advanceReceived), status: quote.dueAmount <= 0 ? 'paid' : quote.advanceReceived > 0 ? 'partial' : 'pending' };
    await state.store.save('invoices', invoice); await state.store.save('quotations', { ...quote, status: 'approved', invoiceId: invoice.id }); toast('ইনভয়েস তৈরি হয়েছে'); showInvoice(invoice);
  }

  function showInvoice(invoice) {
    normalizeInvoicePayments(invoice);
    $('#modalRoot').innerHTML = `<div class="modal-backdrop"><div class="modal invoice-payment-modal"><div class="card-head"><h2>${escapeHtml(invoice.number)} · Installments</h2><button class="icon-btn" id="closeModal">×</button></div>
      <div class="payment-stats"><div><span>Invoice total</span><strong>${money(invoice.grandTotal)}</strong></div><div><span>Total paid</span><strong>${money(invoice.totalPaid)}</strong></div><div><span>Remaining due</span><strong>${money(invoice.dueAmount)}</strong></div><div><span>Status</span>${statusBadge(invoice.status)}</div></div>
      <form id="installmentForm" class="form-grid"><label>Date<input name="date" type="date" value="${today()}" required></label><label>Amount<input name="amount" type="number" min="0.01" max="${Math.max(0, invoice.dueAmount)}" step="0.01" required></label><label>Method<select name="method"><option>Cash</option><option>Bank Transfer</option><option>Card</option><option>bKash</option><option>Nagad</option><option>Cheque</option><option>Other</option></select></label><label>Reference<input name="reference" placeholder="Txn/Cheque reference"></label><label class="span-4">Note (optional)<input name="note" placeholder="Installment note"></label><div class="span-4 actions"><button class="btn btn-primary" ${invoice.dueAmount <= 0 ? 'disabled' : ''}>Add installment</button><button class="btn btn-secondary" type="button" id="invoicePrint">Invoice PDF</button><button class="btn btn-secondary" type="button" id="challanPrint">Challan PDF</button></div></form>
      <div class="section-title"><h2>Payment history</h2></div>${paymentHistoryTable(invoice, true)}</div></div>`;
    $('#closeModal').onclick = () => $('#modalRoot').innerHTML = '';
    $('#invoicePrint').onclick = () => openPrintDocument(invoice, 'invoice');
    $('#challanPrint').onclick = () => openPrintDocument(invoice, 'challan');
    $('#installmentForm').onsubmit = async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const amount = n(form.elements.amount.value);
      if (amount <= 0) return toast('Installment amount must be greater than zero');
      if (amount > invoice.dueAmount + 0.001) return toast(`Maximum payable amount is ${money(invoice.dueAmount)}`);
      invoice.payments.push({ id: uid('PAY'), date: form.elements.date.value, amount, method: form.elements.method.value, reference: form.elements.reference.value.trim(), note: form.elements.note.value.trim(), createdAt: new Date().toISOString() });
      normalizeInvoicePayments(invoice);
      await state.store.save('invoices', invoice);
      toast('Installment payment saved');
      showInvoice(invoice);
    };
    $$('[data-remove-payment]').forEach(button => button.onclick = async () => {
      if (!confirm('এই installment payment সরাবেন? Invoice version history-তে আগের তথ্য থাকবে।')) return;
      invoice.payments = invoice.payments.filter(payment => payment.id !== button.dataset.removePayment);
      normalizeInvoicePayments(invoice);
      await state.store.save('invoices', invoice);
      toast('Payment removed');
      showInvoice(invoice);
    });
  }

  function normalizeInvoicePayments(invoice) {
    if (!Array.isArray(invoice.payments)) {
      invoice.payments = n(invoice.advanceReceived) > 0 ? [{ id: `PAY-ADVANCE-${invoice.id}`, date: invoice.date || today(), amount: n(invoice.advanceReceived), method: 'Advance', reference: invoice.quotationNumber || '', note: 'Imported opening advance' }] : [];
    }
    invoice.totalPaid = invoice.payments.reduce((sum, payment) => sum + n(payment.amount), 0);
    invoice.advanceReceived = invoice.totalPaid;
    invoice.dueAmount = Math.max(0, n(invoice.grandTotal) - invoice.totalPaid);
    invoice.status = invoice.dueAmount <= 0.001 ? 'paid' : invoice.totalPaid > 0 ? 'partial' : 'pending';
    return invoice;
  }

  function paymentHistoryTable(invoice, editable = false) {
    const payments = Array.isArray(invoice.payments) ? invoice.payments : [];
    if (!payments.length) return '<div class="empty">এখনও কোনো payment নেই</div>';
    return `<div class="table-wrap payment-history"><table><thead><tr><th>#</th><th>Date</th><th>Method</th><th>Reference</th><th>Note</th><th>Amount</th>${editable ? '<th>Action</th>' : ''}</tr></thead><tbody>${payments.map((payment, index) => `<tr><td>${index + 1}</td><td>${dateText(payment.date)}</td><td>${escapeHtml(payment.method)}</td><td>${escapeHtml(payment.reference)}</td><td>${escapeHtml(payment.note)}</td><td><strong>${money(payment.amount)}</strong></td>${editable ? `<td><button class="icon-btn danger" type="button" data-remove-payment="${escapeHtml(payment.id)}" aria-label="Remove payment">×</button></td>` : ''}</tr>`).join('')}</tbody></table></div>`;
  }

  const meaningful = item => Boolean(String(item?.modelCode || item?.description || item?.design || item?.source || '').trim()) || n(item?.height) > 0 || n(item?.width) > 0 || n(item?.yards) > 0 || n(item?.unitPrice) > 0 || n(item?.total) > 0;
  const cell = value => escapeHtml(value == null ? '' : value);
  const MAKING_SECTION_LABELS = { Curtain: 'কার্টেন', Sheer: 'শিয়ার', 'Extra Fabric': 'এক্সট্রা ফেব্রিক', Fittings: 'ফিটিংস', Accessories: 'অ্যাক্সেসরিজ' };
  const MAKING_ROOM_LABELS = { 'Master Bedroom': 'মাস্টার বেডরুম', 'Living Room': 'লিভিং রুম', 'Dining Room': 'ডাইনিং রুম', 'Kids Room': 'কিডস রুম', 'Guest Bedroom': 'গেস্ট বেডরুম', 'Study Room': 'স্টাডি রুম', 'Family Living': 'ফ্যামিলি লিভিং', Kitchen: 'কিচেন', Office: 'অফিস', 'Prayer Room': 'নামাজের ঘর' };
  const makingRoomName = name => MAKING_ROOM_LABELS[name] || name;
  function itemRows(room, making) {
    const sections = [];
    [['curtains','Curtain'], ['sheers','Sheer']].forEach(([key, label]) => {
      const items = (room[key] || []).filter(meaningful);
      if (!items.length) return;
      sections.push(`<tr class="print-section"><th colspan="${making ? 7 : 10}">${making ? MAKING_SECTION_LABELS[label] : label}</th></tr>`);
      items.forEach(item => sections.push(`<tr><td>${cell(normalizeProductCode(item.modelCode))}</td><td>${cell(item.width)}</td><td>${cell(item.height)}</td><td>${cell(item.pleatCount)}</td><td>${cell(item.yards)}</td><td>${cell(item.design)}</td><td>${cell(item.pieces)}</td>${making ? '' : `<td>${cell(item.source)}</td><td>${money(item.yardPrice)}</td><td>${money(item.total)}</td>`}</tr>`));
    });
    [['extraFabric','Extra Fabric'], ['fittings','Fittings'], ['accessories','Accessories']].forEach(([key, label]) => {
      const items = (room[key] || []).filter(meaningful);
      if (!items.length) return;
      sections.push(`<tr class="print-section"><th colspan="${making ? 7 : 10}">${making ? MAKING_SECTION_LABELS[label] : label}</th></tr>`);
      items.forEach(item => sections.push(`<tr><td colspan="3">${cell(normalizeProductCode(item.description))}</td><td></td><td>${cell(item.quantity)}</td><td>${cell(item.unit)}</td><td></td>${making ? '' : `<td></td><td>${money(item.unitPrice)}</td><td>${money(item.total)}</td>`}</tr>`));
    });
    return sections.join('');
  }

  function makingFabricSummary(record) {
    const totals = new Map();
    (record.rooms || []).forEach(room => {
      const extraByProduct = new Map();
      (room.extraFabric || []).filter(meaningful).forEach(extra => {
        const code = normalizeProductCode(extra.description).toLowerCase();
        if (code) extraByProduct.set(code, (extraByProduct.get(code) || 0) + n(extra.quantity));
      });
      const roomProducts = new Map();
      ['curtains', 'sheers'].forEach(key => (room[key] || []).filter(meaningful).forEach(item => {
        const product = normalizeProductCode(item.modelCode) || 'নামবিহীন প্রোডাক্ট';
        const yards = n(item.yards);
        const pieces = n(item.pieces) || 1;
        const keyName = product.toLowerCase();
        const current = roomProducts.get(keyName) || { product, calculations: [], total: 0 };
        current.calculations.push(`${yards} × ${pieces}`);
        current.total += yards * pieces;
        roomProducts.set(keyName, current);
      }));
      extraByProduct.forEach((extra, keyName) => {
        const current = roomProducts.get(keyName) || { product: normalizeProductCode((room.extraFabric || []).find(item => normalizeProductCode(item.description).toLowerCase() === keyName)?.description) || 'নামবিহীন প্রোডাক্ট', calculations: [], total: 0 };
        if (extra > 0) {
          current.extra = extra;
          current.total += extra;
        }
        roomProducts.set(keyName, current);
      });
      roomProducts.forEach(roomProduct => {
        const current = totals.get(roomProduct.product) || { product: roomProduct.product, calculations: [], total: 0 };
        const base = roomProduct.calculations.length ? roomProduct.calculations.map(value => `(${value})`).join(' + ') : '0';
        current.calculations.push(`${base}${roomProduct.extra > 0 ? ` + ${roomProduct.extra}` : ''}`);
        current.total += roomProduct.total;
        totals.set(roomProduct.product, current);
      });
    });
    if (!totals.size) return '';
    const rows = [...totals.values()].map(item => `<tr><td>${cell(item.product)}</td><td>${item.calculations.join(' + ')}</td><td><strong>${item.total.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}</strong></td></tr>`).join('');
    const grand = [...totals.values()].reduce((sum, item) => sum + item.total, 0);
    return `<section class="making-fabric-summary"><h2>মোট ফেব্রিক হিসাব</h2><table><thead><tr><th>প্রোডাক্ট</th><th>হিসাব: (ফেব্রিক × পিস) + এক্সট্রা ইউনিট</th><th>মোট ফেব্রিক (ইয়ার্ড)</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><th colspan="2">সর্বমোট ফেব্রিক</th><th>${grand.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')} ইয়ার্ড</th></tr></tfoot></table><p>এক্সট্রা ফেব্রিক না থাকলে শুধু ফেব্রিক × পিস হিসাব করা হয়েছে।</p></section>`;
  }

  function challanItems(record) {
    const items = new Map();
    const add = (name, quantity) => {
      const product = normalizeProductCode(name);
      if (!product || n(quantity) <= 0) return;
      const key = product.toLowerCase();
      const current = items.get(key) || { product, quantity: 0 };
      current.quantity += n(quantity);
      items.set(key, current);
    };
    (record.rooms || []).forEach(room => {
      ['curtains', 'sheers'].forEach(key => (room[key] || []).filter(meaningful).forEach(item => add(item.modelCode, n(item.pieces) || 1)));
      ['extraFabric', 'fittings', 'accessories'].forEach(key => (room[key] || []).filter(meaningful).forEach(item => add(item.description, item.quantity)));
    });
    return [...items.values()];
  }

  function challanDocumentHtml(record) {
    const rows = challanItems(record).map(item => `<tr><td>${cell(item.product)}</td><td>${cell(item.quantity)}</td></tr>`).join('');
    return `<article class="print-document challan">
      <header class="print-brand"><img src="../assets/img/logo/logo-01.svg" alt="Curtivelle"><strong>CHALLAN</strong></header>
      <section class="challan-products"><table><thead><tr><th>Product</th><th>Quantity</th></tr></thead><tbody>${rows || '<tr><td colspan="2">No products</td></tr>'}</tbody></table></section>
      <footer class="print-footer"><span>${BUSINESS_ADDRESS}</span></footer>
    </article>`;
  }

  function printDocumentHtml(record, kind) {
    if (kind === 'challan') return challanDocumentHtml(record);
    const making = kind === 'making';
    if (kind === 'invoice') normalizeInvoicePayments(record);
    const title = making ? 'মেকিং শিট' : kind === 'invoice' ? 'INVOICE' : 'QUOTATION';
    const numberLabel = making ? 'কোটেশন রেফারেন্স' : title.charAt(0) + title.slice(1).toLowerCase() + ' No.';
    const discountPercent = n(record.discountPercent);
    const discountAmount = n(record.discountAmount);
    const terms = String(record.terms || '').split(/\n+/).filter(Boolean).map(x => `<li>${escapeHtml(x.replace(/^\s*\d+[.)]\s*/, ''))}</li>`).join('');
    return `<article class="print-document${making ? ' making' : ''}">
      <header class="print-brand"><img src="../assets/img/logo/logo-01.svg" alt="Curtivelle"><strong>${title}</strong></header>
      <section class="print-meta${making ? ' making-meta' : ''}"><div><span>${numberLabel}</span><strong>${escapeHtml(record.number)}</strong></div><div><span>${making ? 'তারিখ' : 'Date'}</span><strong>${making ? bnDateText(record.date) : dateText(record.date)}</strong></div><div><span>${making ? 'ডেলিভারি তারিখ' : 'Delivery Date'}</span><strong>${record.deliveryDate ? (making ? bnDateText(record.deliveryDate) : dateText(record.deliveryDate)) : ''}</strong></div>${making ? '' : `<div><span>Valid Until</span><strong>${kind === 'quotation' ? dateText(record.validUntil) : ''}</strong></div>`}</section>
      ${making ? '' : `<section class="print-customer"><h2>Customer</h2><p><strong>${cell(record.customer?.name)}</strong>${record.customer?.phone ? ` · ${cell(record.customer.phone)}` : ''}</p>${record.customer?.profession ? `<p>${cell(record.customer.profession)}</p>` : ''}${record.customer?.address ? `<p>${cell(record.customer.address)}</p>` : ''}</section>`}
      ${record.offer && !making ? `<section class="print-offer"><strong>Offer</strong><p>${escapeHtml(record.offer)}</p></section>` : ''}
      ${(record.rooms || []).map(room => `<section class="print-room"><h2>${cell(making ? makingRoomName(room.name) : room.name)}</h2><table><thead><tr><th>${making ? 'প্রোডাক্ট' : 'Product'}</th><th>${making ? 'প্রস্থ (ইঞ্চি)' : 'Width (in)'}</th><th>${making ? 'উচ্চতা (ইঞ্চি)' : 'Height (in)'}</th><th>${making ? 'ফোল্ড' : 'Fold'}</th><th>${making ? 'ইয়ার্ড/পরিমাণ' : 'Yard/Qty'}</th><th>${making ? 'ডিজাইন/ইউনিট' : 'Design/Unit'}</th><th>${making ? 'পিস' : 'Pieces'}</th>${making ? '' : '<th>Note</th><th>Yard Price</th><th>Total</th>'}</tr></thead><tbody>${itemRows(room, making)}</tbody>${making ? '' : `<tfoot><tr><th colspan="9">Room Total</th><th>${money(room.total)}</th></tr></tfoot>`}</table></section>`).join('')}
      ${making ? makingFabricSummary(record) : ''}
      ${making ? '' : `<section class="print-totals"><div><span>Subtotal</span><strong>${money(record.subtotal)}</strong></div>${discountPercent > 0 ? `<div><span>Discount (${discountPercent}%)</span><strong>− ${money(discountAmount)}</strong></div>` : ''}<div class="grand"><span>Grand Total</span><strong>${money(record.grandTotal)}</strong></div><div><span>${kind === 'invoice' ? 'Total Paid' : 'Advance Received'}</span><strong>${money(kind === 'invoice' ? record.totalPaid : record.advanceReceived)}</strong></div><div><span>Due Amount</span><strong>${money(record.dueAmount)}</strong></div></section>`}
      ${kind === 'invoice' && record.payments?.length ? `<section class="print-payments"><h2>Installment Payment History</h2>${paymentHistoryTable(record)}</section>` : ''}
      ${record.notes ? `<section class="print-note"><strong>${making ? 'নোট' : 'Notes'}</strong><p>${escapeHtml(record.notes)}</p></section>` : ''}
      ${!making && record.paymentTerms ? `<section class="print-terms"><h2>Payment Terms</h2><p>${escapeHtml(record.paymentTerms)}</p></section>` : ''}
      ${!making && terms ? `<section class="print-terms"><h2>Terms & Conditions</h2><ol>${terms}</ol></section>` : ''}
      <footer class="print-footer"><span>${BUSINESS_ADDRESS}</span></footer>
    </article>`;
  }

  const safeFilePart = value => String(value || '').trim().replace(/[^a-zA-Z0-9\u0980-\u09FF]+/g, '_').replace(/^_+|_+$/g, '') || 'Curtivelle';
  function printFileName(record, kind) {
    const address = String(record.customer?.address || '');
    const knownAreas = ['Mirpur','Gulshan','Banani','Uttara','Dhanmondi','Bashundhara','Mohammadpur','Badda','Baridhara','Khilgaon','Motijheel','Wari','Mohakhali'];
    const location = knownAreas.find(area => new RegExp(area, 'i').test(address)) || address.split(',').map(x => x.trim()).find(Boolean) || 'Dhaka';
    const type = kind === 'making' ? 'Making' : kind === 'invoice' ? 'Invoice' : kind === 'challan' ? 'Challan' : 'Quotation';
    return `${safeFilePart(location)}_${safeFilePart(record.customer?.name)}_${type}`;
  }

  function openPrintDocument(record, kind) {
    const previousTitle = document.title;
    const filename = printFileName(record, kind);
    document.title = filename;
    $('#modalRoot').innerHTML = `<div class="modal-backdrop print-backdrop"><div class="modal print-modal"><div class="card-head no-print"><h2>${kind === 'making' ? 'Making Sheet' : kind === 'invoice' ? 'Invoice' : kind === 'challan' ? 'Challan' : 'Quotation'} Preview</h2><button class="icon-btn" id="closeModal">×</button></div>${printDocumentHtml(record, kind)}<div class="actions no-print print-actions"><button class="btn btn-primary" id="modalPrint">Print / Save PDF</button></div></div></div>`;
    $('#closeModal').onclick = () => { $('#modalRoot').innerHTML = ''; document.title = previousTitle; };
    $('#modalPrint').onclick = () => { document.title = filename; window.print(); };
  }

  async function settingsPage() {
    setHeading('সেটিংস', 'Google Apps Script connection');
    $('#app').innerHTML = `<div class="card" style="max-width:760px"><div class="card-head"><h2>Backend configuration</h2></div><p>API URL ফাঁকা থাকলে browser localStorage-এ demo data থাকবে। Production-এ Apps Script Web App URL দিন।</p><form id="settingsForm" class="form-grid"><label class="span-4">Business name<input name="businessName" value="${escapeHtml(state.config.businessName)}"></label><label class="span-4">Apps Script Web App URL<input name="apiUrl" type="url" value="${escapeHtml(state.config.apiUrl)}" placeholder="https://script.google.com/macros/s/.../exec"></label><div class="span-4 actions"><button class="btn btn-primary">সেভ করুন</button><button class="btn btn-danger" type="button" id="disconnect">Local mode</button></div></form></div>`;
    $('#settingsForm').onsubmit = e => { e.preventDefault(); state.config = { businessName: e.target.elements.businessName.value, apiUrl: e.target.elements.apiUrl.value.trim() }; saveConfig(state.config); setStore(); toast('সেটিংস সেভ হয়েছে'); dashboard(); };
    $('#disconnect').onclick = () => { state.config.apiUrl = ''; saveConfig(state.config); setStore(); settingsPage(); };
  }

  function exportCsv(type, rows) {
    const data = rows.map(row => type === 'customers' ? { customer_id: row.customerNo, name: row.name, phone: row.phone, profession: row.profession, address: row.address, created_at: row.createdAt } : { number: row.number, customer_id: row.customer?.customerNo, customer: row.customer?.name, phone: row.customer?.phone, date: row.date, status: row.status, grand_total: row.grandTotal, advance: row.advanceReceived, due: row.dueAmount });
    if (!data.length) return toast('Export করার মতো data নেই');
    const headers = Object.keys(data[0]); const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = '\ufeff' + [headers.join(','), ...data.map(row => headers.map(h => cell(row[h])).join(','))].join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = `curtivelle-${type}-${today()}.csv`; a.click(); URL.revokeObjectURL(a.href);
  }

  async function route() {
    try {
      const parts = location.hash.replace(/^#\/?/, '').split('/'); const page = parts[0] || 'dashboard';
      $$('.nav a').forEach(a => a.classList.toggle('active', a.dataset.route === (page === 'quotation' ? 'quotation' : page)));
      if (page === 'dashboard') await dashboard();
      else if (page === 'quotation') await quotationPage(parts[1] === 'new' ? null : parts[1]);
      else if (['customers','quotations','invoices'].includes(page)) await listPage(page);
      else if (page === 'trash') await trashPage();
      else if (page === 'settings') await settingsPage();
      else location.hash = '#dashboard';
      bindRecordActions(); $('#sidebar').classList.remove('open');
    } catch (error) { console.error(error); $('#app').innerHTML = `<div class="card"><h2>ডেটা লোড করা যায়নি</h2><p>${escapeHtml(error.message)}</p><p>Settings থেকে backend URL যাচাই করুন অথবা Local mode ব্যবহার করুন।</p></div>`; }
  }

  $('#productOptions').innerHTML = PRODUCTS.map(product => `<option value="${escapeHtml(product.code)}">${escapeHtml(product.source)} · ৳${product.yardPrice}/yd</option>`).join('');
  $('#tasselOptions').innerHTML = TASSELS.map(product => `<option value="${escapeHtml(product.code)}">৳${product.price} · ${escapeHtml(product.unit)}</option>`).join('');
  setStore();
  window.addEventListener('hashchange', route);
  $('#quickQuotation').onclick = () => location.hash = '#quotation/new';
  $('#menuToggle').onclick = () => $('#sidebar').classList.toggle('open');
  route();
})();
