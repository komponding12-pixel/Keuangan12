// =========================================
//  FinTrack — Aplikasi Pencatatan Keuangan
// =========================================

// ===== DATA STORE =====
const DB_KEY       = 'fintrack_data';
const BUDGET_KEY   = 'fintrack_budgets';
const KANTONG_KEY  = 'fintrack_kantong';

const KATEGORI = {
  pemasukan: [
    { id: 'gaji',      label: 'Gaji / Upah',        emoji: '💼' },
    { id: 'bisnis',    label: 'Bisnis / Usaha',      emoji: '🏪' },
    { id: 'investasi', label: 'Investasi / Dividen', emoji: '📈' },
    { id: 'freelance', label: 'Freelance',           emoji: '💻' },
    { id: 'hadiah',    label: 'Hadiah / Bonus',      emoji: '🎁' },
    { id: 'lain_masuk',label: 'Lainnya',             emoji: '💰' },
  ],
  pengeluaran: [
    { id: 'makanan',    label: 'Makanan & Minuman',  emoji: '🍽️' },
    { id: 'transport',  label: 'Transportasi',       emoji: '🚗' },
    { id: 'belanja',    label: 'Belanja',            emoji: '🛍️' },
    { id: 'tagihan',    label: 'Tagihan & Utilitas', emoji: '⚡' },
    { id: 'kesehatan',  label: 'Kesehatan',          emoji: '🏥' },
    { id: 'hiburan',    label: 'Hiburan',            emoji: '🎬' },
    { id: 'pendidikan', label: 'Pendidikan',         emoji: '📚' },
    { id: 'rumah',      label: 'Rumah & Properti',   emoji: '🏠' },
    { id: 'pakaian',    label: 'Pakaian',            emoji: '👕' },
    { id: 'lain_keluar',label: 'Lainnya',            emoji: '💸' },
  ]
};

const CHART_COLORS = [
  '#7c3aed','#06b6d4','#10b981','#f59e0b','#f43f5e',
  '#8b5cf6','#0ea5e9','#34d399','#fbbf24','#fb7185',
];

let transactions = [];
let budgets      = [];
let kantong      = [];          // wallet / pocket list
let currentPage  = 'dashboard';
let currentType  = 'pemasukan';
let cashflowChart   = null;
let categoryChart   = null;
let reportBarChart  = null;
let reportPieChart  = null;

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  initDateDisplay();
  initNavigation();
  initModal();
  initBudgetModal();
  initKantongModal();
  initFilters();
  initSearch();
  initDatePicker();
  initBackup();
  // initAuth(); // Disabled as per user request to remove login system
});

// ===== DATA MANAGEMENT =====
let unsubscribeTx = null;
let unsubscribeBudgets = null;
let unsubscribeKantong = null;

function loadData() {
  try {
    transactions = JSON.parse(localStorage.getItem(DB_KEY))      || [];
    budgets      = JSON.parse(localStorage.getItem(BUDGET_KEY))  || [];
    kantong      = JSON.parse(localStorage.getItem(KANTONG_KEY)) || [];
  } catch (e) {
    transactions = []; budgets = []; kantong = [];
  }
}

function saveData()    { localStorage.setItem(DB_KEY,      JSON.stringify(transactions)); }
function saveBudgets() { localStorage.setItem(BUDGET_KEY,  JSON.stringify(budgets));      }
function saveKantong() { localStorage.setItem(KANTONG_KEY, JSON.stringify(kantong));      }

function startSync(user) {
  el('syncIndicator').style.display = 'flex';
  el('syncDot').className = 'sync-dot syncing';
  el('syncText').textContent = 'Sinkronisasi...';

  // Listen to transactions
  unsubscribeTx = db.collection('users').doc(user.uid).collection('transactions')
    .onSnapshot(snapshot => {
      transactions = [];
      snapshot.forEach(doc => {
        transactions.push(doc.data());
      });
      transactions.sort((a,b) => {
        const dateA = a.tanggal || '';
        const dateB = b.tanggal || '';
        if (dateA !== dateB) return dateB.localeCompare(dateA);
        const createA = a.createdAt || '';
        const createB = b.createdAt || '';
        return createB.localeCompare(createA);
      });
      renderAll();
      populateFilterOptions();
      updateSyncStatus();
    }, err => {
      console.error("Firestore tx listener error:", err);
    });

  // Listen to budgets
  unsubscribeBudgets = db.collection('users').doc(user.uid).collection('budgets')
    .onSnapshot(snapshot => {
      budgets = [];
      snapshot.forEach(doc => {
        budgets.push(doc.data());
      });
      renderAll();
      updateSyncStatus();
    }, err => {
      console.error("Firestore budgets listener error:", err);
    });

  // Listen to kantong
  unsubscribeKantong = db.collection('users').doc(user.uid).collection('kantong')
    .onSnapshot(snapshot => {
      kantong = [];
      snapshot.forEach(doc => {
        kantong.push(doc.data());
      });
      kantong.sort((a,b) => a.nama.localeCompare(b.nama));
      renderAll();
      updateSyncStatus();
    }, err => {
      console.error("Firestore kantong listener error:", err);
    });
}

function stopSync() {
  if (unsubscribeTx) unsubscribeTx();
  if (unsubscribeBudgets) unsubscribeBudgets();
  if (unsubscribeKantong) unsubscribeKantong();
  el('syncIndicator').style.display = 'none';
}

function updateSyncStatus() {
  el('syncDot').className = 'sync-dot online';
  el('syncText').textContent = 'Terhubung';
}

function checkAndUploadLocalData(uid) {
  db.collection('users').doc(uid).collection('transactions').limit(1).get().then(snap => {
    if (snap.empty && (transactions.length > 0 || kantong.length > 0 || budgets.length > 0)) {
      console.log("Firestore is empty. Migrating local data...");
      
      const batch = db.batch();
      transactions.forEach(t => {
        batch.set(db.collection('users').doc(uid).collection('transactions').doc(t.id), t);
      });
      kantong.forEach(k => {
        batch.set(db.collection('users').doc(uid).collection('kantong').doc(k.id), k);
      });
      budgets.forEach(b => {
        batch.set(db.collection('users').doc(uid).collection('budgets').doc(b.kategori), b);
      });
      
      batch.commit().then(() => {
        showToast("Data lokal disinkronkan ke cloud! ✓", "success");
      }).catch(err => {
        console.error("Migration batch commit failed:", err);
      });
    }
  });
}

function addTransaction(data) {
  const user = auth.currentUser;
  const tId = Date.now().toString() + Math.random().toString(36).substr(2,5);
  const t = {
    id: tId,
    ...data,
    createdAt: new Date().toISOString()
  };
  
  if (user) {
    db.collection('users').doc(user.uid).collection('transactions').doc(tId).set(t)
      .catch(err => {
        console.error("Error adding to Firestore:", err);
        showToast("Gagal menyimpan ke cloud", "error");
      });
  } else {
    transactions.unshift(t);
    saveData();
    renderAll();
    populateFilterOptions();
  }
  return t;
}

function deleteTransaction(id) {
  const user = auth.currentUser;
  if (user) {
    db.collection('users').doc(user.uid).collection('transactions').doc(id).delete()
      .catch(err => {
        console.error("Error deleting from Firestore:", err);
        showToast("Gagal menghapus dari cloud", "error");
      });
  } else {
    transactions = transactions.filter(t => t.id !== id);
    saveData();
    renderAll();
    applyFilters();
  }
}

// ===== KANTONG COMPUTED =====
function getKantongSaldo(kid) {
  const k = kantong.find(w => w.id === kid);
  if (!k) return 0;
  let saldo = k.saldoAwal || 0;
  transactions.forEach(t => {
    if (t.kantongId !== kid) return;
    if (t.type === 'transfer_in')  saldo += t.nominal;
    else if (t.type === 'transfer_out') saldo -= t.nominal;
    else if (t.type === 'pemasukan')    saldo += t.nominal;
    else if (t.type === 'pengeluaran')  saldo -= t.nominal;
  });
  return saldo;
}

function getTotalKantong() {
  return kantong.reduce((s, k) => s + getKantongSaldo(k.id), 0);
}

// ===== COMPUTED VALUES =====
function getTotals(txList) {
  return txList.reduce((acc, t) => {
    if (t.type === 'pemasukan')  acc.income  += t.nominal;
    else if (t.type === 'pengeluaran') acc.expense += t.nominal;
    return acc;
  }, { income: 0, expense: 0 });
}

function getFilteredByPeriod(period) {
  const now = new Date();
  return transactions.filter(t => {
    if (t.type === 'transfer_in' || t.type === 'transfer_out') return false;
    const d = new Date(t.tanggal);
    if (period === 'bulan')  return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear();
    if (period === '3bulan') { const c=new Date(now); c.setMonth(c.getMonth()-3); return d>=c; }
    if (period === 'tahun')  return d.getFullYear()===now.getFullYear();
    return true;
  });
}

// ===== RENDER ALL =====
function renderAll() {
  renderDashboard();
  renderTransactionPage();
  renderReportPage();
  renderBudgetPage();
  renderKantongPage();
}

// ===== DASHBOARD =====
function renderDashboard() {
  const regularTx = transactions.filter(t => t.type==='pemasukan'||t.type==='pengeluaran');
  const totals = getTotals(regularTx);
  const saldo  = kantong.length > 0 ? getTotalKantong() : (totals.income - totals.expense);
  const savingsPct = totals.income>0 ? Math.round(((totals.income-totals.expense)/totals.income)*100) : 0;
  const incomeCount  = regularTx.filter(t=>t.type==='pemasukan').length;
  const expenseCount = regularTx.filter(t=>t.type==='pengeluaran').length;

  el('totalSaldo').textContent     = formatRp(saldo);
  el('totalPemasukan').textContent = formatRp(totals.income);
  el('totalPengeluaran').textContent = formatRp(totals.expense);
  el('tabunganBersih').textContent = formatRp(totals.income - totals.expense);
  el('countPemasukan').textContent  = `${incomeCount} transaksi`;
  el('countPengeluaran').textContent = `${expenseCount} transaksi`;
  el('savingsPercent').textContent  = `${savingsPct}% dari pemasukan`;

  // Trend
  const netSaldo = totals.income - totals.expense;
  const trendEl   = el('trendText');
  const trendIcon = el('balanceTrend').querySelector('.trend-icon');
  if (regularTx.length === 0) {
    trendEl.textContent  = 'Mulai mencatat keuangan Anda';
    trendIcon.textContent = '📈';
  } else if (netSaldo >= 0) {
    trendEl.textContent  = `Surplus ${formatRp(netSaldo)}`;
    trendIcon.textContent = '📈';
  } else {
    trendEl.textContent  = `Defisit ${formatRp(Math.abs(netSaldo))}`;
    trendIcon.textContent = '📉';
  }

  // Kantong mini preview
  renderKantongMini();

  // Recent transactions (last 5, skip transfers)
  const recent = transactions.filter(t=>t.type!=='transfer_in'&&t.type!=='transfer_out').slice(0,5);
  renderTransactionList('recentTransactions', recent);

  renderCashflowChart();
  renderCategoryChart();
}

// ===== KANTONG MINI (Dashboard) =====
function renderKantongMini() {
  const section = el('kantongMiniSection');
  const list    = el('kantongMiniList');
  if (kantong.length === 0) { section.style.display='none'; return; }

  section.style.display = 'block';
  list.innerHTML = kantong.map(k => {
    const saldo = getKantongSaldo(k.id);
    return `
      <div class="kantong-mini-card" style="--kc-color:${k.color}">
        <div class="kantong-mini-top">
          <span>${k.emoji}</span>
          <span class="kantong-mini-name">${escHtml(k.nama)}</span>
        </div>
        <div class="kantong-mini-saldo" style="color:${k.color}">${formatRp(saldo)}</div>
      </div>`;
  }).join('');
}

// ===== KANTONG PAGE =====
function renderKantongPage() {
  const grid = el('kantongGrid');

  // Update nav badge
  const badge = el('navKantongCount');
  if (badge) badge.textContent = kantong.length;

  // Update total
  const totalEl = el('kantongTotalAll');
  if (totalEl) totalEl.textContent = formatRp(getTotalKantong());

  if (kantong.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">👛</div>
        <p>Belum ada kantong</p>
        <span>Buat kantong untuk memisahkan keuangan (dompet, rekening, dll.)</span>
      </div>`;
    el('transferSection').style.display  = 'none';
    el('kantongTxSection').style.display = 'none';
    return;
  }

  // Render cards
  grid.innerHTML = kantong.map(k => {
    const saldo = getKantongSaldo(k.id);
    const txK   = transactions.filter(t=>t.kantongId===k.id && (t.type==='pemasukan'||t.type==='pengeluaran'));
    const inc   = txK.filter(t=>t.type==='pemasukan').reduce((s,t)=>s+t.nominal,0);
    const exp   = txK.filter(t=>t.type==='pengeluaran').reduce((s,t)=>s+t.nominal,0);
    return `
      <div class="kantong-card" style="--kc-color:${k.color}">
        <div class="kantong-card-header">
          <div class="kantong-card-icon-name">
            <div class="kantong-icon-circle" style="background:${k.color}20">${k.emoji}</div>
            <div>
              <div class="kantong-card-name">${escHtml(k.nama)}</div>
              <div class="kantong-card-desc">${escHtml(k.catatan||'')}</div>
            </div>
          </div>
          <div class="kantong-card-actions">
            <button class="btn-icon" data-edit="${k.id}" title="Edit">✏️</button>
            <button class="btn-icon danger" data-del="${k.id}" title="Hapus">🗑</button>
          </div>
        </div>
        <div class="kantong-saldo-label">SALDO SAAT INI</div>
        <div class="kantong-saldo-value">${formatRp(saldo)}</div>
        <div class="kantong-stats">
          <div class="kantong-stat">
            <span class="kantong-stat-label">Masuk</span>
            <span class="kantong-stat-value income">+${formatRp(inc)}</span>
          </div>
          <div class="kantong-stat">
            <span class="kantong-stat-label">Keluar</span>
            <span class="kantong-stat-value expense">-${formatRp(exp)}</span>
          </div>
          <div class="kantong-stat">
            <span class="kantong-stat-label">Transaksi</span>
            <span class="kantong-stat-value">${txK.length}</span>
          </div>
        </div>
      </div>`;
  }).join('');

  // Edit/delete handlers
  grid.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => openKantongModal(btn.dataset.edit));
  });
  grid.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Hapus kantong ini? Transaksi yang terhubung tidak akan dihapus.')) {
        const user = auth.currentUser;
        if (user) {
          db.collection('users').doc(user.uid).collection('kantong').doc(btn.dataset.del).delete()
            .then(() => showToast('Kantong dihapus', 'info'))
            .catch(err => console.error("Error deleting kantong:", err));
        } else {
          kantong = kantong.filter(k => k.id !== btn.dataset.del);
          saveKantong();
          renderAll();
          showToast('Kantong dihapus', 'info');
        }
      }
    });
  });

  // Show transfer + tx section
  if (kantong.length >= 2) {
    el('transferSection').style.display = 'block';
    populateTransferSelects();
  } else {
    el('transferSection').style.display = 'none';
  }

  el('kantongTxSection').style.display = 'block';
  populateKantongTxFilter();
  renderKantongTxList();
}

function populateTransferSelects() {
  const opts = kantong.map(k=>`<option value="${k.id}">${k.emoji} ${escHtml(k.nama)}</option>`).join('');
  el('transferDari').innerHTML = opts;
  el('transferKe').innerHTML   = opts;
  // default second option for "ke"
  if (kantong.length>=2 && el('transferKe').options.length>=2) el('transferKe').selectedIndex=1;
}

function populateKantongTxFilter() {
  const sel = el('filterKantongTx');
  if (!sel) return;
  sel.innerHTML = '<option value="all">Semua Kantong</option>' +
    kantong.map(k=>`<option value="${k.id}">${k.emoji} ${escHtml(k.nama)}</option>`).join('');
  sel.onchange = renderKantongTxList;
}

function renderKantongTxList() {
  const kid = el('filterKantongTx')?.value || 'all';
  let list = transactions.filter(t=>t.kantongId);
  if (kid !== 'all') list = list.filter(t=>t.kantongId===kid);
  list = list.filter(t=>t.type!=='transfer_in'&&t.type!=='transfer_out')
             .concat(transactions.filter(t=>t.kantongId===kid&&(t.type==='transfer_in'||t.type==='transfer_out')));
  // All tx for selected kantong
  const allKtx = kid==='all'
    ? transactions.filter(t=>t.kantongId)
    : transactions.filter(t=>t.kantongId===kid);

  renderTransactionList('kantongTxList', allKtx.slice(0,30));
}

// ===== TRANSACTION LIST RENDER =====
function renderTransactionList(containerId, txList) {
  const container = el(containerId);
  if (!txList || txList.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">💸</div>
        <p>Belum ada transaksi</p>
        <span>Klik tombol "Tambah" untuk mulai mencatat</span>
      </div>`;
    return;
  }

  // Group by date
  const groups = {};
  txList.forEach(t => {
    const d = formatDate(t.tanggal || t.createdAt?.split('T')[0]);
    if (!groups[d]) groups[d] = [];
    groups[d].push(t);
  });

  let html = '';
  Object.entries(groups).forEach(([date, items]) => {
    html += `<div class="date-group-header">${date}</div>`;
    items.forEach(t => {
      const isTransfer = t.type==='transfer_in'||t.type==='transfer_out';
      const kat = !isTransfer ? findKategori(t.type, t.kategori) : null;
      const k   = t.kantongId ? kantong.find(w=>w.id===t.kantongId) : null;

      // Icon & label for transfers
      let iconEmoji = kat ? kat.emoji : '💰';
      let typeLabel = t.type==='pemasukan' ? 'Masuk' : 'Keluar';
      let typeBadgeClass = `badge-${t.type}`;
      if (t.type==='transfer_in')  { iconEmoji='↙️'; typeLabel='Transfer Masuk'; typeBadgeClass='badge-pemasukan'; }
      if (t.type==='transfer_out') { iconEmoji='↗️'; typeLabel='Transfer Keluar'; typeBadgeClass='badge-pengeluaran'; }

      const amountClass = (t.type==='pemasukan'||t.type==='transfer_in') ? 'amount-income' : 'amount-expense';
      const amountSign  = (t.type==='pemasukan'||t.type==='transfer_in') ? '+' : '-';
      const iconBgClass = (t.type==='pemasukan'||t.type==='transfer_in') ? 'ti-pemasukan' : 'ti-pengeluaran';

      html += `
        <div class="transaction-item animate-in" data-id="${t.id}">
          <div class="ti-icon ${iconBgClass}">${iconEmoji}</div>
          <div class="ti-info">
            <div class="ti-desc">${escHtml(t.deskripsi)}</div>
            <div class="ti-meta">
              <span class="ti-badge ${typeBadgeClass}">${typeLabel}</span>
              ${kat ? `<span>${kat.label}</span>` : ''}
              ${k   ? `<span class="ti-kantong-badge">${k.emoji} ${escHtml(k.nama)}</span>` : ''}
              ${t.catatan ? `<span>· ${escHtml(t.catatan)}</span>` : ''}
            </div>
          </div>
          <div class="ti-amount ${amountClass}">
            ${amountSign}${formatRp(t.nominal)}
          </div>
          <div class="ti-actions">
            <button class="btn-delete" data-id="${t.id}" title="Hapus" aria-label="Hapus">
              <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>`;
    });
  });

  container.innerHTML = html;

  // Delete handlers
  container.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTransaction(btn.dataset.id);
      renderAll();
      applyFilters();
      showToast('Transaksi dihapus', 'info');
    });
  });
}

// ===== TRANSAKSI PAGE =====
function renderTransactionPage() { applyFilters(); }

function applyFilters() {
  const search      = el('searchInput')?.value?.toLowerCase() || '';
  const typeFilter  = el('filterType')?.value  || 'all';
  const katFilter   = el('filterKategori')?.value || 'all';
  const bulanFilter = el('filterBulan')?.value  || 'all';

  let filtered = transactions.filter(t=>t.type!=='transfer_in'&&t.type!=='transfer_out');

  if (typeFilter !== 'all') filtered = filtered.filter(t => t.type === typeFilter);
  if (katFilter  !== 'all') filtered = filtered.filter(t => t.kategori === katFilter);
  if (bulanFilter !== 'all') {
    filtered = filtered.filter(t => {
      const d = new Date(t.tanggal);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` === bulanFilter;
    });
  }
  if (search) {
    filtered = filtered.filter(t =>
      t.deskripsi.toLowerCase().includes(search) ||
      t.kategori.toLowerCase().includes(search) ||
      (t.catatan && t.catatan.toLowerCase().includes(search))
    );
  }

  renderTransactionList('allTransactions', filtered);
}

function populateFilterOptions() {
  const katSelect = el('filterKategori');
  if (katSelect) {
    const allKat = [...KATEGORI.pemasukan, ...KATEGORI.pengeluaran];
    katSelect.innerHTML = '<option value="all">Semua Kategori</option>' +
      allKat.map(k=>`<option value="${k.id}">${k.emoji} ${k.label}</option>`).join('');
  }

  const bulanSelect = el('filterBulan');
  if (bulanSelect) {
    const months = [...new Set(transactions
      .filter(t=>t.tanggal)
      .map(t => {
        const d = new Date(t.tanggal);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      }))].sort().reverse();
    bulanSelect.innerHTML = '<option value="all">Semua Bulan</option>' +
      months.map(m => {
        const [y,mo] = m.split('-');
        const label = new Date(parseInt(y),parseInt(mo)-1,1).toLocaleDateString('id-ID',{month:'long',year:'numeric'});
        return `<option value="${m}">${label}</option>`;
      }).join('');
  }
}

// ===== REPORT PAGE =====
function renderReportPage() {
  const period = el('reportPeriod')?.value || 'bulan';
  const txList = getFilteredByPeriod(period);
  const totals = getTotals(txList);
  const saldo  = totals.income - totals.expense;

  el('reportPemasukan').textContent  = formatRp(totals.income);
  el('reportPengeluaran').textContent = formatRp(totals.expense);
  el('reportSavings').textContent    = formatRp(saldo);
  el('reportCount').textContent      = txList.length;

  renderReportCharts(txList, totals);
}

function renderReportCharts(txList, totals) {
  const expenseByKat = {};
  txList.filter(t=>t.type==='pengeluaran').forEach(t => {
    const kat = findKategori('pengeluaran', t.kategori);
    const label = kat ? `${kat.emoji} ${kat.label}` : t.kategori;
    expenseByKat[label] = (expenseByKat[label]||0) + t.nominal;
  });

  const barLabels = Object.keys(expenseByKat);
  const barData   = Object.values(expenseByKat);

  if (reportBarChart) reportBarChart.destroy();
  const barCtx = el('reportBarChart');
  if (barCtx && barLabels.length>0) {
    reportBarChart = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels: barLabels,
        datasets: [{ label:'Pengeluaran', data:barData,
          backgroundColor: CHART_COLORS.map(c=>c+'90'),
          borderColor: CHART_COLORS, borderWidth:2, borderRadius:6 }]
      },
      options: {
        ...chartOptions(),
        plugins: { ...chartOptions().plugins, legend:{display:false},
          tooltip:{ callbacks:{label:(ctx)=>` ${formatRp(ctx.raw)}`} } },
        scales: {
          x: { ticks:{color:'#94a3b8',font:{size:11,family:'Inter'}}, grid:{color:'rgba(255,255,255,0.03)'} },
          y: { ticks:{color:'#94a3b8',font:{size:11,family:'Inter'},callback:v=>formatRpShort(v)}, grid:{color:'rgba(255,255,255,0.05)'} }
        }
      }
    });
  }

  if (reportPieChart) reportPieChart.destroy();
  const pieCtx = el('reportPieChart');
  if (pieCtx && (totals.income>0||totals.expense>0)) {
    reportPieChart = new Chart(pieCtx, {
      type: 'doughnut',
      data: {
        labels:['Pemasukan','Pengeluaran'],
        datasets:[{ data:[totals.income,totals.expense],
          backgroundColor:['rgba(16,185,129,0.8)','rgba(244,63,94,0.8)'],
          borderColor:['#10b981','#f43f5e'], borderWidth:2, hoverOffset:6 }]
      },
      options: {
        ...chartOptions(), cutout:'65%',
        plugins:{ legend:{display:true,position:'bottom',labels:{color:'#94a3b8',font:{family:'Inter',size:12},padding:16}},
          tooltip:{callbacks:{label:(ctx)=>` ${formatRp(ctx.raw)}`}} }
      }
    });
  }
}

// ===== BUDGET PAGE =====
function renderBudgetPage() {
  const container = el('budgetList');
  if (!budgets.length) {
    container.innerHTML=`<div class="empty-state"><div class="empty-icon">🎯</div><p>Belum ada anggaran</p><span>Klik "Atur Anggaran" untuk menetapkan batas pengeluaran</span></div>`;
    return;
  }

  const now = new Date();
  const thisMonthExpenses = transactions.filter(t => {
    if (t.type!=='pengeluaran') return false;
    const d = new Date(t.tanggal);
    return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear();
  });

  let html = '';
  budgets.forEach(b => {
    const kat = findKategori('pengeluaran', b.kategori);
    const spent = thisMonthExpenses.filter(t=>t.kategori===b.kategori).reduce((s,t)=>s+t.nominal,0);
    const pct   = Math.min(Math.round((spent/b.limit)*100),100);
    const statusClass = pct>=100?'budget-over':pct>=80?'budget-warn':'budget-safe';
    const statusColor = pct>=100?'#f43f5e':pct>=80?'#f59e0b':'#10b981';
    html+=`
      <div class="budget-item ${statusClass}">
        <div class="budget-item-header">
          <div class="budget-item-name"><span>${kat?kat.emoji:'💸'}</span><span>${kat?kat.label:b.kategori}</span></div>
          <div style="display:flex;align-items:center;gap:12px">
            <div class="budget-item-amounts">
              <span class="budget-spent">${formatRp(spent)}</span>
              <span class="budget-limit">/ ${formatRp(b.limit)}</span>
            </div>
            <button class="btn-delete-budget" data-kat="${b.kategori}" title="Hapus">🗑</button>
          </div>
        </div>
        <div class="budget-bar-track">
          <div class="budget-bar-fill" style="width:${pct}%;background:linear-gradient(90deg,${statusColor}cc,${statusColor})"></div>
        </div>
        <div class="budget-percent" style="color:${statusColor}">${pct}% terpakai</div>
      </div>`;
  });

  container.innerHTML = html;
  container.querySelectorAll('.btn-delete-budget').forEach(btn => {
    btn.addEventListener('click',()=>{
      const user = auth.currentUser;
      if (user) {
        db.collection('users').doc(user.uid).collection('budgets').doc(btn.dataset.kat).delete()
          .then(() => showToast('Anggaran dihapus', 'info'))
          .catch(err => console.error("Error deleting budget:", err));
      } else {
        budgets=budgets.filter(b=>b.kategori!==btn.dataset.kat);
        saveBudgets(); renderBudgetPage();
        showToast('Anggaran dihapus','info');
      }
    });
  });
}

// ===== CHARTS =====
function chartOptions() {
  return {
    responsive:true, maintainAspectRatio:false,
    plugins:{
      legend:{display:false},
      tooltip:{
        backgroundColor:'#1a1f35',borderColor:'rgba(148,163,184,0.1)',borderWidth:1,
        titleColor:'#f1f5f9',bodyColor:'#94a3b8',padding:12,
        titleFont:{family:'Inter',size:13,weight:'600'},bodyFont:{family:'Inter',size:12}
      }
    }
  };
}

function renderCashflowChart() {
  const months = getLast6Months();
  const incomeData=[], expenseData=[];
  months.forEach(({year,month})=>{
    const txM = transactions.filter(t=>{
      if (t.type!=='pemasukan'&&t.type!=='pengeluaran') return false;
      const d=new Date(t.tanggal);
      return d.getMonth()===month&&d.getFullYear()===year;
    });
    const totals=getTotals(txM);
    incomeData.push(totals.income); expenseData.push(totals.expense);
  });
  const labels=months.map(m=>new Date(m.year,m.month,1).toLocaleDateString('id-ID',{month:'short',year:'2-digit'}));

  if (cashflowChart) cashflowChart.destroy();
  const ctx=el('cashflowChart'); if (!ctx) return;
  cashflowChart=new Chart(ctx,{
    type:'line',
    data:{labels,datasets:[
      {label:'Pemasukan',data:incomeData,borderColor:'#10b981',backgroundColor:'rgba(16,185,129,0.08)',
       pointBackgroundColor:'#10b981',pointBorderColor:'#10b981',pointRadius:5,pointHoverRadius:7,borderWidth:2.5,tension:0.4,fill:true},
      {label:'Pengeluaran',data:expenseData,borderColor:'#f43f5e',backgroundColor:'rgba(244,63,94,0.08)',
       pointBackgroundColor:'#f43f5e',pointBorderColor:'#f43f5e',pointRadius:5,pointHoverRadius:7,borderWidth:2.5,tension:0.4,fill:true}
    ]},
    options:{
      ...chartOptions(),interaction:{mode:'index',intersect:false},
      scales:{
        x:{ticks:{color:'#94a3b8',font:{size:11,family:'Inter'}},grid:{color:'rgba(255,255,255,0.03)'}},
        y:{ticks:{color:'#94a3b8',font:{size:11,family:'Inter'},callback:v=>formatRpShort(v)},grid:{color:'rgba(255,255,255,0.05)'}}
      },
      plugins:{...chartOptions().plugins,tooltip:{...chartOptions().plugins.tooltip,callbacks:{label:(ctx)=>` ${ctx.dataset.label}: ${formatRp(ctx.raw)}`}}}
    }
  });
}

function renderCategoryChart() {
  const expenses=transactions.filter(t=>t.type==='pengeluaran');
  const byKat={};
  expenses.forEach(t=>{
    const kat=findKategori('pengeluaran',t.kategori);
    const label=kat?`${kat.emoji} ${kat.label}`:t.kategori;
    byKat[label]=(byKat[label]||0)+t.nominal;
  });
  const labels=Object.keys(byKat), data=Object.values(byKat);
  const total=data.reduce((s,v)=>s+v,0);

  if (categoryChart) categoryChart.destroy();
  const ctx=el('categoryChart'); if (!ctx) return;

  if (labels.length===0){
    el('doughnutLegend').innerHTML='<div style="color:#4b5563;font-size:13px;text-align:center">Belum ada pengeluaran</div>';
    return;
  }
  categoryChart=new Chart(ctx,{
    type:'doughnut',
    data:{labels,datasets:[{data,backgroundColor:CHART_COLORS.map(c=>c+'cc'),borderColor:CHART_COLORS,borderWidth:2,hoverOffset:6}]},
    options:{...chartOptions(),cutout:'68%',plugins:{...chartOptions().plugins,tooltip:{callbacks:{label:(ctx)=>` ${formatRp(ctx.raw)}`}}}}
  });
  el('doughnutLegend').innerHTML=labels.map((label,i)=>{
    const pct=Math.round((data[i]/total)*100);
    return `<div class="doughnut-legend-item">
      <span class="doughnut-legend-label"><span class="doughnut-legend-dot" style="background:${CHART_COLORS[i%CHART_COLORS.length]}"></span><span>${label}</span></span>
      <span class="doughnut-legend-value">${pct}%</span></div>`;
  }).join('');
}

// ===== NAVIGATION =====
function initNavigation() {
  document.querySelectorAll('.nav-item').forEach(item=>{
    item.addEventListener('click',(e)=>{ e.preventDefault(); navigateTo(item.dataset.page); closeSidebar(); });
  });
  el('viewAllBtn')?.addEventListener('click',()=>navigateTo('transaksi'));
  el('viewKantongBtn')?.addEventListener('click',()=>navigateTo('kantong'));
  el('menuToggle')?.addEventListener('click',toggleSidebar);
  el('sidebarClose')?.addEventListener('click',closeSidebar);
  el('overlay')?.addEventListener('click',closeSidebar);
  el('reportPeriod')?.addEventListener('change',renderReportPage);
}

function navigateTo(page) {
  currentPage=page;
  document.querySelectorAll('.nav-item').forEach(item=>item.classList.toggle('active',item.dataset.page===page));
  document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===`page-${page}`));
  const titles={dashboard:'Dashboard',kantong:'Kantong',transaksi:'Transaksi',laporan:'Laporan',anggaran:'Anggaran'};
  el('pageTitle').textContent=titles[page]||page;
  if (page==='transaksi') { populateFilterOptions(); applyFilters(); }
  if (page==='laporan')   renderReportPage();
  if (page==='anggaran')  renderBudgetPage();
  if (page==='kantong')   renderKantongPage();
}

function toggleSidebar() { el('sidebar').classList.toggle('open'); el('overlay').classList.toggle('active'); }
function closeSidebar()  { el('sidebar').classList.remove('open'); el('overlay').classList.remove('active'); }

// ===== DATE PICKER (clickable anywhere) =====
function initDatePicker() {
  const wrapper = el('datepickerWrapper');
  const input   = el('inputTanggal');
  const display = el('dateDisplay');
  if (!wrapper||!input||!display) return;

  // Click on wrapper → open native picker
  wrapper.addEventListener('click', () => {
    try { input.showPicker(); } catch(e) { input.focus(); input.click(); }
  });

  // Sync display text when value changes
  input.addEventListener('change', () => updateDateDisplay(input.value, display));
  input.addEventListener('input',  () => updateDateDisplay(input.value, display));

  // Set today initially
  const today = todayISO();
  input.value = today;
  updateDateDisplay(today, display);
}

function updateDateDisplay(val, displayEl) {
  if (!val) {
    displayEl.textContent = 'Pilih tanggal';
    displayEl.classList.add('placeholder');
    return;
  }
  displayEl.classList.remove('placeholder');
  const d = new Date(val + 'T00:00:00');
  displayEl.textContent = d.toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}

// Reset date display on modal open
function resetDateDisplay(val) {
  updateDateDisplay(val, el('dateDisplay'));
}

// ===== TRANSACTION MODAL =====
function initModal() {
  el('btnAddTopbar')?.addEventListener('click',()=>openModal());
  el('modalClose')?.addEventListener('click',closeModal);
  el('btnCancelForm')?.addEventListener('click',closeModal);
  el('modalOverlay')?.addEventListener('click',(e)=>{ if(e.target===el('modalOverlay')) closeModal(); });
  el('btnPemasukan')?.addEventListener('click',()=>setType('pemasukan'));
  el('btnPengeluaran')?.addEventListener('click',()=>setType('pengeluaran'));
  el('inputNominal')?.addEventListener('input',(e)=>{
    let raw=e.target.value.replace(/\D/g,'');
    e.target.value=raw?Number(raw).toLocaleString('id-ID'):'';
  });
  el('transactionForm')?.addEventListener('submit',(e)=>{ e.preventDefault(); submitTransaction(); });
}

function openModal(editId=null) {
  el('transactionForm').reset();
  const today = todayISO();
  el('inputTanggal').value = today;
  resetDateDisplay(today);
  el('transactionId').value = editId||'';
  setType('pemasukan');
  populateKantongSelect();
  el('modalTitle').textContent    = editId?'Edit Transaksi':'Tambah Transaksi';
  el('btnSubmitForm').textContent = editId?'Perbarui':'Simpan Transaksi';
  el('modalOverlay').classList.add('active');
  setTimeout(()=>el('inputNominal')?.focus(),100);
}

function closeModal() { el('modalOverlay').classList.remove('active'); }

function setType(type) {
  currentType=type;
  el('transactionType').value=type;
  el('btnPemasukan').classList.toggle('active',type==='pemasukan');
  el('btnPengeluaran').classList.toggle('active',type==='pengeluaran');
  populateKategoriSelect(type);
}

function populateKategoriSelect(type) {
  const select=el('inputKategori');
  select.innerHTML='<option value="">-- Pilih Kategori --</option>'+
    KATEGORI[type].map(k=>`<option value="${k.id}">${k.emoji} ${k.label}</option>`).join('');
}

function populateKantongSelect() {
  const select=el('inputKantong');
  if (!select) return;
  select.innerHTML='<option value="">— Tanpa Kantong —</option>'+
    kantong.map(k=>`<option value="${k.id}">${k.emoji} ${escHtml(k.nama)}</option>`).join('');
}

function submitTransaction() {
  const nominal=parseInt(el('inputNominal').value.replace(/\D/g,''));
  if (!nominal||nominal<=0) { showToast('Masukkan nominal yang valid','error'); return; }

  const data={
    type:      el('transactionType').value,
    nominal,
    deskripsi: el('inputDeskripsi').value.trim(),
    kategori:  el('inputKategori').value,
    tanggal:   el('inputTanggal').value,
    catatan:   el('inputCatatan').value.trim(),
    kantongId: el('inputKantong').value || null,
  };

  addTransaction(data);
  closeModal();
  renderAll();
  populateFilterOptions();
  showToast('Transaksi berhasil ditambahkan! ✓','success');
}

// ===== BUDGET MODAL =====
function initBudgetModal() {
  el('btnSetBudget')?.addEventListener('click',()=>{ populateBudgetKategori(); el('budgetModalOverlay').classList.add('active'); });
  el('budgetModalClose')?.addEventListener('click',()=>el('budgetModalOverlay').classList.remove('active'));
  el('btnCancelBudget')?.addEventListener('click',()=>el('budgetModalOverlay').classList.remove('active'));
  el('budgetModalOverlay')?.addEventListener('click',(e)=>{ if(e.target===el('budgetModalOverlay')) el('budgetModalOverlay').classList.remove('active'); });
  el('budgetNominal')?.addEventListener('input',(e)=>{ let r=e.target.value.replace(/\D/g,''); e.target.value=r?Number(r).toLocaleString('id-ID'):''; });
  el('budgetForm')?.addEventListener('submit',(e)=>{
    e.preventDefault();
    const kat=el('budgetKategori').value, limit=parseInt(el('budgetNominal').value.replace(/\D/g,''));
    if(!kat||!limit){ showToast('Lengkapi semua data','error'); return; }
    
    const user = auth.currentUser;
    if (user) {
      db.collection('users').doc(user.uid).collection('budgets').doc(kat).set({
        kategori: kat,
        limit
      }).then(() => showToast('Anggaran berhasil diatur! ✓','success'))
        .catch(err => console.error("Error setting budget:", err));
    } else {
      const existing=budgets.findIndex(b=>b.kategori===kat);
      if(existing>=0) budgets[existing].limit=limit; else budgets.push({kategori:kat,limit});
      saveBudgets();
      renderBudgetPage();
      showToast('Anggaran berhasil diatur! ✓','success');
    }
    el('budgetModalOverlay').classList.remove('active');
  });
}

function populateBudgetKategori() {
  el('budgetKategori').innerHTML='<option value="">-- Pilih Kategori Pengeluaran --</option>'+
    KATEGORI.pengeluaran.map(k=>`<option value="${k.id}">${k.emoji} ${k.label}</option>`).join('');
}

// ===== KANTONG MODAL =====
function initKantongModal() {
  el('btnAddKantong')?.addEventListener('click',()=>openKantongModal());
  el('kantongModalClose')?.addEventListener('click',closeKantongModal);
  el('btnCancelKantong')?.addEventListener('click',closeKantongModal);
  el('kantongModalOverlay')?.addEventListener('click',(e)=>{ if(e.target===el('kantongModalOverlay')) closeKantongModal(); });

  // Emoji picker
  el('emojiPicker')?.querySelectorAll('.emoji-opt').forEach(opt=>{
    opt.addEventListener('click',()=>{
      el('emojiPicker').querySelectorAll('.emoji-opt').forEach(o=>o.classList.remove('active'));
      opt.classList.add('active');
      el('kantongEmoji').value=opt.dataset.emoji;
    });
  });

  // Color picker
  el('colorPicker')?.querySelectorAll('.color-opt').forEach(opt=>{
    opt.addEventListener('click',()=>{
      el('colorPicker').querySelectorAll('.color-opt').forEach(o=>o.classList.remove('active'));
      opt.classList.add('active');
      el('kantongColor').value=opt.dataset.color;
    });
  });

  // Nominal format
  el('kantongSaldoAwal')?.addEventListener('input',(e)=>{
    let r=e.target.value.replace(/\D/g,''); e.target.value=r?Number(r).toLocaleString('id-ID'):'';
  });

  el('kantongForm')?.addEventListener('submit',(e)=>{ e.preventDefault(); submitKantong(); });

  // Transfer between wallets
  el('transferNominal')?.addEventListener('input',(e)=>{ let r=e.target.value.replace(/\D/g,''); e.target.value=r?Number(r).toLocaleString('id-ID'):''; });
  el('btnDoTransfer')?.addEventListener('click', doTransfer);
}

function openKantongModal(editId=null) {
  el('kantongForm').reset();
  el('kantongEditId').value=editId||'';
  // Reset pickers
  el('emojiPicker').querySelectorAll('.emoji-opt').forEach((o,i)=>o.classList.toggle('active',i===0));
  el('kantongEmoji').value='👛';
  el('colorPicker').querySelectorAll('.color-opt').forEach((o,i)=>o.classList.toggle('active',i===0));
  el('kantongColor').value='#7c3aed';

  if (editId) {
    const k=kantong.find(w=>w.id===editId);
    if (k) {
      el('kantongNama').value   = k.nama;
      el('kantongEmoji').value  = k.emoji;
      el('kantongColor').value  = k.color;
      el('kantongCatatan').value= k.catatan||'';
      // Highlight active emoji
      el('emojiPicker').querySelectorAll('.emoji-opt').forEach(o=>{
        o.classList.toggle('active', o.dataset.emoji===k.emoji);
      });
      el('colorPicker').querySelectorAll('.color-opt').forEach(o=>{
        o.classList.toggle('active', o.dataset.color===k.color);
      });
    }
  }

  el('kantongModalTitle').textContent      = editId?'Edit Kantong':'Tambah Kantong';
  el('btnSubmitKantong').textContent       = editId?'Perbarui Kantong':'Simpan Kantong';
  const saldoGroup=el('kantongSaldoAwal')?.closest('.form-group');
  if (saldoGroup) saldoGroup.style.display = editId?'none':'block';

  el('kantongModalOverlay').classList.add('active');
  setTimeout(()=>el('kantongNama')?.focus(),100);
}

function closeKantongModal() { el('kantongModalOverlay').classList.remove('active'); }

function submitKantong() {
  const nama = el('kantongNama').value.trim();
  if (!nama) { showToast('Masukkan nama kantong','error'); return; }

  const editId = el('kantongEditId').value;
  const user = auth.currentUser;

  if (user) {
    if (editId) {
      db.collection('users').doc(user.uid).collection('kantong').doc(editId).update({
        nama,
        emoji: el('kantongEmoji').value,
        color: el('kantongColor').value,
        catatan: el('kantongCatatan').value.trim()
      }).then(() => showToast('Kantong diperbarui ✓','success'))
        .catch(err => console.error("Error updating kantong:", err));
    } else {
      const id = Date.now().toString()+Math.random().toString(36).substr(2,4);
      const saldoAwal = parseInt(el('kantongSaldoAwal').value.replace(/\D/g,'')||'0');
      db.collection('users').doc(user.uid).collection('kantong').doc(id).set({
        id,
        nama,
        emoji: el('kantongEmoji').value,
        color: el('kantongColor').value,
        catatan: el('kantongCatatan').value.trim(),
        saldoAwal,
        createdAt: new Date().toISOString(),
      }).then(() => showToast('Kantong berhasil dibuat! ✓','success'))
        .catch(err => console.error("Error creating kantong:", err));
    }
  } else {
    if (editId) {
      const idx = kantong.findIndex(k=>k.id===editId);
      if (idx>=0) {
        kantong[idx].nama    = nama;
        kantong[idx].emoji   = el('kantongEmoji').value;
        kantong[idx].color   = el('kantongColor').value;
        kantong[idx].catatan = el('kantongCatatan').value.trim();
      }
      showToast('Kantong diperbarui ✓','success');
    } else {
      const saldoAwal = parseInt(el('kantongSaldoAwal').value.replace(/\D/g,'')||'0');
      kantong.push({
        id:       Date.now().toString()+Math.random().toString(36).substr(2,4),
        nama,
        emoji:    el('kantongEmoji').value,
        color:    el('kantongColor').value,
        catatan:  el('kantongCatatan').value.trim(),
        saldoAwal,
        createdAt: new Date().toISOString(),
      });
      showToast('Kantong berhasil dibuat! ✓','success');
    }
    saveKantong();
    renderAll();
  }
  closeKantongModal();
}

function doTransfer() {
  const dari    = el('transferDari').value;
  const ke      = el('transferKe').value;
  const nominal = parseInt(el('transferNominal').value.replace(/\D/g,'')||'0');

  if (!dari||!ke||!nominal) { showToast('Lengkapi data transfer','error'); return; }
  if (dari===ke)            { showToast('Kantong asal dan tujuan tidak boleh sama','error'); return; }

  const kDari = kantong.find(k=>k.id===dari);
  const kKe   = kantong.find(k=>k.id===ke);
  const today  = todayISO();

  addTransaction({ type:'transfer_out', nominal, deskripsi:`Transfer ke ${kKe?.nama}`, kantongId:dari, tanggal:today, kategori:'transfer', catatan:'' });
  addTransaction({ type:'transfer_in',  nominal, deskripsi:`Transfer dari ${kDari?.nama}`, kantongId:ke, tanggal:today, kategori:'transfer', catatan:'' });

  el('transferNominal').value='';
  renderAll();
  showToast(`Transfer ${formatRp(nominal)} dari ${kDari?.emoji} ${kDari?.nama} → ${kKe?.emoji} ${kKe?.nama} berhasil!`, 'success');
}

// ===== FILTERS & SEARCH =====
function initFilters() {
  el('filterType')?.addEventListener('change',applyFilters);
  el('filterKategori')?.addEventListener('change',applyFilters);
  el('filterBulan')?.addEventListener('change',applyFilters);
}

function initSearch() {
  let debounce;
  el('searchInput')?.addEventListener('input',()=>{ clearTimeout(debounce); debounce=setTimeout(applyFilters,200); });
}

// ===== DATE DISPLAY (topbar) =====
function initDateDisplay() {
  const now=new Date();
  el('currentDate').textContent=now.toLocaleDateString('id-ID',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
}

// ===== TOAST =====
let toastTimer;
function showToast(msg, type='info') {
  const toast=el('toast');
  toast.textContent=msg;
  toast.className=`toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>toast.classList.remove('show'),3500);
}

// ===== HELPERS =====
function el(id) { return document.getElementById(id); }

function formatRp(amount) {
  if (amount===undefined||amount===null) return 'Rp 0';
  return 'Rp '+Math.abs(amount).toLocaleString('id-ID');
}

function formatRpShort(amount) {
  if (amount>=1_000_000_000) return `${(amount/1_000_000_000).toFixed(1)}M`;
  if (amount>=1_000_000)     return `${(amount/1_000_000).toFixed(1)}jt`;
  if (amount>=1_000)         return `${(amount/1_000).toFixed(0)}rb`;
  return amount;
}

function formatDate(dateStr) {
  if (!dateStr) return 'Tanpa tanggal';
  const d=new Date(dateStr+'T00:00:00');
  if (isNaN(d)) return dateStr;
  const today=new Date(), yesterday=new Date(today);
  yesterday.setDate(today.getDate()-1);
  if (d.toDateString()===today.toDateString())     return 'Hari ini';
  if (d.toDateString()===yesterday.toDateString()) return 'Kemarin';
  return d.toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
}

function todayISO() {
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function findKategori(type, id) { return KATEGORI[type]?.find(k=>k.id===id); }

function getLast6Months() {
  const months=[]; const now=new Date();
  for(let i=5;i>=0;i--){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    months.push({year:d.getFullYear(),month:d.getMonth()});
  }
  return months;
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== EXPORT & IMPORT (BACKUP) =====
function initBackup() {
  // Export button
  el('btnExport')?.addEventListener('click', exportData);

  // Import button → trigger file input
  el('btnImport')?.addEventListener('click', () => el('importFileInput')?.click());

  // File selected
  el('importFileInput')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        handleImport(parsed);
      } catch {
        showToast('File tidak valid! Pastikan file backup FinTrack (.json)', 'error');
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be selected again
    e.target.value = '';
  });
}

function exportData() {
  const backup = {
    _app: 'FinTrack',
    _version: '1.0',
    _exportedAt: new Date().toISOString(),
    _summary: {
      transactions: transactions.length,
      kantong: kantong.length,
      budgets: budgets.length,
    },
    transactions,
    kantong,
    budgets,
  };

  const json     = JSON.stringify(backup, null, 2);
  const blob     = new Blob([json], { type: 'application/json' });
  const url      = URL.createObjectURL(blob);
  const a        = document.createElement('a');
  const dateStr  = new Date().toLocaleDateString('id-ID',{day:'2-digit',month:'2-digit',year:'numeric'}).replace(/\//g,'-');
  a.href         = url;
  a.download     = `fintrack-backup-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`✅ Backup tersimpan: fintrack-backup-${dateStr}.json`, 'success');
}

function handleImport(data) {
  // Validate structure
  if (!data._app || data._app !== 'FinTrack') {
    showToast('File bukan backup FinTrack yang valid!', 'error');
    return;
  }

  const incomingTx  = Array.isArray(data.transactions) ? data.transactions : [];
  const incomingKt  = Array.isArray(data.kantong)      ? data.kantong      : [];
  const incomingBg  = Array.isArray(data.budgets)      ? data.budgets      : [];
  const exportedAt  = data._exportedAt
    ? new Date(data._exportedAt).toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })
    : 'Tidak diketahui';

  const user = auth.currentUser;

  // Show confirmation dialog
  showImportConfirm({
    exportedAt,
    txCount : incomingTx.length,
    ktCount : incomingKt.length,
    bgCount : incomingBg.length,
    onReplace: () => {
      if (user) {
        replaceFirestoreData(incomingTx, incomingKt, incomingBg);
      } else {
        // Full replace
        transactions = incomingTx;
        kantong      = incomingKt;
        budgets      = incomingBg;
        saveData(); saveKantong(); saveBudgets();
        renderAll(); populateFilterOptions();
        showToast(`✅ Data berhasil diimport (${incomingTx.length} transaksi, ${incomingKt.length} kantong)`, 'success');
      }
    },
    onMerge: () => {
      if (user) {
        mergeFirestoreData(incomingTx, incomingKt, incomingBg);
      } else {
        // Merge — skip duplicates by id
        const existingIds = new Set(transactions.map(t => t.id));
        const newTx = incomingTx.filter(t => !existingIds.has(t.id));
        transactions = [...newTx, ...transactions];

        const existingKtIds = new Set(kantong.map(k => k.id));
        const newKt = incomingKt.filter(k => !existingKtIds.has(k.id));
        kantong = [...kantong, ...newKt];

        // Merge budgets — prefer imported values for same category
        incomingBg.forEach(b => {
          const idx = budgets.findIndex(x => x.kategori === b.kategori);
          if (idx >= 0) budgets[idx] = b; else budgets.push(b);
        });

        saveData(); saveKantong(); saveBudgets();
        renderAll(); populateFilterOptions();
        showToast(`✅ Merge berhasil! +${newTx.length} transaksi baru, +${newKt.length} kantong baru`, 'success');
      }
    }
  });
}

async function replaceFirestoreData(incomingTx, incomingKt, incomingBg) {
  const user = auth.currentUser;
  if (!user) return;

  showToast("Mengunggah data baru ke cloud...", "info");

  try {
    const batch = db.batch();

    // 1. Delete all current (since they are in local arrays, we delete them)
    transactions.forEach(t => {
      batch.delete(db.collection('users').doc(user.uid).collection('transactions').doc(t.id));
    });
    kantong.forEach(k => {
      batch.delete(db.collection('users').doc(user.uid).collection('kantong').doc(k.id));
    });
    budgets.forEach(b => {
      batch.delete(db.collection('users').doc(user.uid).collection('budgets').doc(b.kategori));
    });

    await batch.commit();

    // 2. Upload new
    let newBatch = db.batch();
    let count = 0;

    for (const t of incomingTx) {
      newBatch.set(db.collection('users').doc(user.uid).collection('transactions').doc(t.id), t);
      count++;
      if (count === 400) {
        await newBatch.commit();
        newBatch = db.batch();
        count = 0;
      }
    }

    for (const k of incomingKt) {
      newBatch.set(db.collection('users').doc(user.uid).collection('kantong').doc(k.id), k);
      count++;
      if (count === 400) {
        await newBatch.commit();
        newBatch = db.batch();
        count = 0;
      }
    }

    for (const b of incomingBg) {
      newBatch.set(db.collection('users').doc(user.uid).collection('budgets').doc(b.kategori), b);
      count++;
      if (count === 400) {
        await newBatch.commit();
        newBatch = db.batch();
        count = 0;
      }
    }

    if (count > 0) {
      await newBatch.commit();
    }

    showToast(`✅ Data cloud berhasil diganti`, 'success');
  } catch (err) {
    console.error("Replace Firestore data failed:", err);
    showToast("Gagal menyimpan ke cloud", "error");
  }
}

async function mergeFirestoreData(incomingTx, incomingKt, incomingBg) {
  const user = auth.currentUser;
  if (!user) return;

  showToast("Menggabungkan data ke cloud...", "info");

  try {
    const existingIds = new Set(transactions.map(t => t.id));
    const newTx = incomingTx.filter(t => !existingIds.has(t.id));

    const existingKtIds = new Set(kantong.map(k => k.id));
    const newKt = incomingKt.filter(k => !existingKtIds.has(k.id));

    let batch = db.batch();
    let count = 0;

    for (const t of newTx) {
      batch.set(db.collection('users').doc(user.uid).collection('transactions').doc(t.id), t);
      count++;
      if (count === 400) {
        await batch.commit();
        batch = db.batch();
        count = 0;
      }
    }

    for (const k of newKt) {
      batch.set(db.collection('users').doc(user.uid).collection('kantong').doc(k.id), k);
      count++;
      if (count === 400) {
        await batch.commit();
        batch = db.batch();
        count = 0;
      }
    }

    for (const b of incomingBg) {
      batch.set(db.collection('users').doc(user.uid).collection('budgets').doc(b.kategori), b);
      count++;
      if (count === 400) {
        await batch.commit();
        batch = db.batch();
        count = 0;
      }
    }

    if (count > 0) {
      await batch.commit();
    }

    showToast(`✅ Merge cloud berhasil! +${newTx.length} transaksi, +${newKt.length} kantong`, 'success');
  } catch (err) {
    console.error("Merge Firestore data failed:", err);
    showToast("Gagal menggabungkan data ke cloud", "error");
  }
}

function showImportConfirm({ exportedAt, txCount, ktCount, bgCount, onReplace, onMerge }) {
  // Remove existing if any
  const existing = document.getElementById('importConfirmOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'importConfirmOverlay';
  overlay.className = 'modal-overlay active';
  overlay.innerHTML = `
    <div class="modal" style="max-width:440px">
      <div class="modal-header">
        <h2 class="modal-title">📥 Import Data</h2>
        <button class="modal-close" id="importConfirmClose">&#10005;</button>
      </div>
      <div class="import-info-box">
        <div class="import-info-row">
          <span>📅 Tanggal backup</span>
          <strong>${exportedAt}</strong>
        </div>
        <div class="import-info-row">
          <span>💸 Transaksi</span>
          <strong>${txCount} data</strong>
        </div>
        <div class="import-info-row">
          <span>👛 Kantong</span>
          <strong>${ktCount} data</strong>
        </div>
        <div class="import-info-row">
          <span>🎯 Anggaran</span>
          <strong>${bgCount} data</strong>
        </div>
      </div>
      <p class="import-hint">Pilih cara import:</p>
      <div class="import-actions">
        <button class="import-btn-merge" id="importBtnMerge">
          <span>🔀</span>
          <div>
            <strong>Gabungkan</strong>
            <span>Tambahkan data baru, data lama tetap ada</span>
          </div>
        </button>
        <button class="import-btn-replace" id="importBtnReplace">
          <span>🔄</span>
          <div>
            <strong>Ganti Semua</strong>
            <span>Hapus semua data lama, ganti dengan file ini</span>
          </div>
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  document.getElementById('importConfirmClose')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  document.getElementById('importBtnMerge')?.addEventListener('click', () => {
    close(); onMerge();
  });
  document.getElementById('importBtnReplace')?.addEventListener('click', () => {
    if (confirm('⚠️ Semua data saat ini akan dihapus dan diganti. Lanjutkan?')) {
      close(); onReplace();
    }
  });
}

// ===== AUTHENTICATION SYSTEM =====
let authMode = 'login'; // 'login' or 'register'

function initAuth() {
  const loginOverlay = el('loginOverlay');
  
  if (!auth) {
    showToast("Koneksi Firebase gagal! Matikan adblocker Anda.", "error");
    if (loginOverlay) {
      loginOverlay.style.display = 'flex';
      const header = loginOverlay.querySelector('.login-header');
      if (header && !header.querySelector('.firebase-error-box')) {
        header.innerHTML += `
          <div class="firebase-error-box" style="background: rgba(244, 63, 94, 0.1); border: 1px solid var(--expense-color); color: var(--expense-color); padding: 16px; border-radius: var(--radius-md); margin-top: 20px; font-size: 13px; text-align: left; line-height: 1.5;">
            <strong>⚠️ Firebase Gagal Dimuat!</strong><br>
            Aplikasi tidak dapat terhubung ke server Google Firebase. Hal ini biasanya disebabkan oleh:
            <ul style="margin: 6px 0 0 16px; padding: 0;">
              <li>Adblocker (uBlock Origin, AdGuard, dll.) memblokir Google services.</li>
              <li>DNS pemblokir iklan (NextDNS, Pi-hole).</li>
              <li>Koneksi internet Anda sedang terganggu.</li>
            </ul>
            <p style="margin-top: 10px; font-weight: 600;">Solusi: Nonaktifkan adblocker/DNS pemblokir iklan Anda untuk situs ini, lalu refresh halaman (F5).</p>
          </div>
        `;
      }
    }
    return;
  }

  const btnLogout = el('btnLogout');
  const emailLoginForm = el('emailLoginForm');
  const btnToggleAuthMode = el('btnToggleAuthMode');
  const toggleAuthModeText = el('toggleAuthModeText');
  const btnEmailLogin = el('btnEmailLogin');

  // Listen to Auth State
  auth.onAuthStateChanged(user => {
    if (user) {
      // Logged in
      loginOverlay.style.display = 'none';
      btnLogout.style.display = 'flex';
      
      // Update User Card
      const name = user.displayName || user.email.split('@')[0];
      el('userName').textContent = name;
      el('userEmail').textContent = user.email;
      el('userAvatar').textContent = name.charAt(0).toUpperCase();

      // Start Sync
      checkAndUploadLocalData(user.uid);
      startSync(user);
    } else {
      // Logged out
      loginOverlay.style.display = 'flex';
      btnLogout.style.display = 'none';
      el('syncIndicator').style.display = 'none';
      
      // Reset local arrays to avoid showing old user data
      transactions = [];
      kantong = [];
      budgets = [];
      renderAll();

      stopSync();
    }
  });

  // Toggle Auth Mode
  btnToggleAuthMode?.addEventListener('click', (e) => {
    e.preventDefault();
    toggleAuthMode();
  });

  function toggleAuthMode() {
    const title = el('loginOverlay').querySelector('h2');
    if (authMode === 'login') {
      authMode = 'register';
      toggleAuthModeText.innerHTML = 'Sudah punya akun? <a href="#" id="btnToggleAuthMode">Masuk di sini</a>';
      btnEmailLogin.textContent = 'Daftar & Masuk';
      title.textContent = 'Buat Akun Baru';
    } else {
      authMode = 'login';
      toggleAuthModeText.innerHTML = 'Belum punya akun? <a href="#" id="btnToggleAuthMode">Daftar Baru</a>';
      btnEmailLogin.textContent = 'Masuk';
      title.textContent = 'Masuk ke Akun Anda';
    }
    // Rebind link
    el('btnToggleAuthMode')?.addEventListener('click', (e) => {
      e.preventDefault();
      toggleAuthMode();
    });
  }

  // Email & Password Login / Register
  emailLoginForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = el('loginEmail').value.trim();
    const password = el('loginPassword').value;

    if (authMode === 'login') {
      auth.signInWithEmailAndPassword(email, password)
        .catch(err => {
          console.error("Login Error:", err);
          alert("Error Login Email:\n" + err.message + "\n(Code: " + err.code + ")");
          let msg = "Gagal masuk. Periksa kembali email dan password.";
          if (err.code === 'auth/user-not-found') msg = "Akun tidak ditemukan.";
          if (err.code === 'auth/wrong-password') msg = "Password salah.";
          showToast(msg, 'error');
        });
    } else {
      auth.createUserWithEmailAndPassword(email, password)
        .then(() => {
          showToast("Pendaftaran berhasil! ✓", "success");
        })
        .catch(err => {
          console.error("Register Error:", err);
          alert("Error Daftar Email:\n" + err.message + "\n(Code: " + err.code + ")");
          let msg = "Gagal membuat akun.";
          if (err.code === 'auth/email-already-in-use') msg = "Email sudah digunakan.";
          if (err.code === 'auth/weak-password') msg = "Password terlalu lemah (min. 6 karakter).";
          if (err.code === 'auth/invalid-email') msg = "Format email tidak valid.";
          showToast(msg, 'error');
        });
    }
  });

  // Logout Button
  btnLogout?.addEventListener('click', () => {
    if (confirm("Apakah Anda yakin ingin keluar?")) {
      auth.signOut().then(() => {
        showToast("Berhasil keluar", "info");
      });
    }
  });
}
