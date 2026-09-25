const supabaseClient = window.supabase.createClient(
  window.LIFE_JOURNAL_SUPABASE.url,
  window.LIFE_JOURNAL_SUPABASE.publishableKey
);
const AUTH_REDIRECT = 'https://farrelllovell.github.io/life-journal/';
const LEGACY_OWNER_ID = 'dde2ab1b-37b9-44d0-9879-f874d5b4c39d';
const $ = selector => document.querySelector(selector);
const localDateISO = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const formatDate = date => new Intl.DateTimeFormat('id-ID', {
  day: 'numeric', month: 'short', year: 'numeric'
}).format(new Date(`${date}T00:00:00`));
const formatMonth = date => new Intl.DateTimeFormat('id-ID', {
  month: 'long', year: 'numeric'
}).format(new Date(`${date}T00:00:00`));
const dayParts = date => {
  const d = new Date(`${date}T00:00:00`);
  return {
    day: d.getDate(),
    month: new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(d).toUpperCase()
  };
};

let entries = [];
let goals = [];
let insights = [];
let currentUser = null;
let authMode = 'signin';
let dataReady = false;
let loadedUserId = null;
let loadingUserId = null;
let accountLoadPromise = null;
let inboxDraft = null;

const showCloudStatus = (message, kind = 'info') => {
  const status = $('#cloud-status');
  status.textContent = message;
  status.dataset.kind = kind;
};
const clearAccountData = () => {
  currentUser = null;
  dataReady = false;
  loadedUserId = null;
  loadingUserId = null;
  accountLoadPromise = null;
  entries = [];
  goals = [];
  insights = [];
  $('#logout-button').hidden = true;
  $('#logout-status').textContent = '';
  showCloudStatus('');
  refresh();
};
const entryFromDatabase = row => ({
  id: row.id,
  date: row.entry_date,
  category: row.category,
  title: row.title,
  body: row.body,
  tags: row.tags || [],
  win: row.win || '',
  lesson: row.lesson || '',
  source: row.source || 'manual'
});
const entryFingerprint = entry => [entry.date || entry.entry_date, entry.title, entry.body]
  .map(value => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase())
  .join('|');
const displayNameFor = user => {
  const fullName = user.user_metadata?.full_name || user.user_metadata?.name;
  const rawName = fullName || (user.email || '').split('@')[0] || 'Anda';
  return rawName.replace(/[._-]+/g, ' ').replace(/\b\p{L}/gu, letter => letter.toUpperCase());
};

function updateProfileUi(user) {
  const name = displayNameFor(user);
  const today = localDateISO();
  $('#owner-label').textContent = `Jurnal pribadi ${name}`;
  $('#view-title').textContent = `Halo, ${name}.`;
  $('#today-label').textContent = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  }).format(new Date(`${today}T00:00:00`)).toLocaleUpperCase('id-ID');
  $('#entry-date').value = today;
  $('#monthly-heading').textContent = `${formatMonth(today)} dalam pandangan`;
  $('#summary-title').textContent = `Jejak ${formatMonth(today)}`;
  $('#month-chip').textContent = formatMonth(today).toLocaleUpperCase('id-ID');
  $('#active-period-label').textContent = formatMonth(today);
  $('#active-year-label').textContent = today.slice(0, 4);
}

function renderEntry(entry) {
  const template = $('#entry-template').content.cloneNode(true);
  const date = dayParts(entry.date);
  template.querySelector('.entry-date strong').textContent = date.day;
  template.querySelector('.entry-date span').textContent = date.month;
  template.querySelector('.category-badge').textContent = entry.category;
  template.querySelector('.read-time').textContent = formatDate(entry.date);
  template.querySelector('h3').textContent = entry.title;
  template.querySelector('.entry-content>p').textContent = entry.body;
  const tags = template.querySelector('.tags');
  for (const tag of entry.tags || []) {
    const chip = document.createElement('span');
    chip.textContent = `#${tag}`;
    tags.append(chip);
  }
  template.querySelector('.entry-note').textContent = entry.lesson ? `✦ ${entry.lesson}` : '';
  template.querySelector('.delete-entry').dataset.id = entry.id;
  return template;
}

function renderGoals() {
  const list = $('#goal-list');
  list.replaceChildren();
  if (!goals.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-copy';
    empty.textContent = 'Belum ada goal. Tambahkan satu langkah yang ingin Anda kejar.';
    list.append(empty);
    return;
  }
  for (const goal of goals) {
    const item = document.createElement('div');
    item.className = 'goal-item';
    const heading = document.createElement('div');
    const title = document.createElement('span');
    title.textContent = goal.title;
    const progressLabel = document.createElement('span');
    progressLabel.textContent = `${goal.progress}%`;
    heading.append(title, progressLabel);
    const note = document.createElement('p');
    note.textContent = goal.note || 'Goal pribadi';
    const bar = document.createElement('div');
    bar.className = 'progress';
    const fill = document.createElement('span');
    fill.style.width = `${Math.max(0, Math.min(100, Number(goal.progress) || 0))}%`;
    bar.append(fill);
    const update = document.createElement('button');
    update.type = 'button';
    update.className = 'text-button goal-progress-button';
    update.dataset.updateGoal = goal.id;
    update.textContent = 'Perbarui progres';
    item.append(heading, note, bar, update);
    list.append(item);
  }
}

function renderInsights(section, targetId, emptyText) {
  const list = $(targetId);
  list.replaceChildren();
  const items = insights.filter(item => item.section === section)
    .sort((a, b) => a.position - b.position);
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-copy';
    empty.textContent = emptyText;
    list.append(empty);
    return;
  }
  items.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = section === 'gap' ? 'gap-item' : 'insight-item';
    if (section === 'gap') {
      const number = document.createElement('span');
      number.textContent = String(index + 1).padStart(2, '0');
      const title = document.createElement('h4');
      title.textContent = item.title;
      const body = document.createElement('p');
      body.textContent = item.body;
      card.append(number, title, body);
    } else {
      const title = document.createElement('strong');
      title.textContent = item.title;
      const body = document.createElement('p');
      body.textContent = item.body;
      card.append(title, body);
    }
    list.append(card);
  });
}

function refreshFilters() {
  const categoryFilter = $('#category-filter');
  const selectedCategory = categoryFilter.value || 'all';
  categoryFilter.replaceChildren(new Option('Semua kategori', 'all'));
  [...new Set(entries.map(entry => entry.category))].sort().forEach(category => {
    categoryFilter.add(new Option(category, category));
  });
  categoryFilter.value = [...categoryFilter.options].some(option => option.value === selectedCategory)
    ? selectedCategory : 'all';

  const periodFilter = $('#period-filter');
  const selectedPeriod = periodFilter.value || 'all';
  periodFilter.replaceChildren(new Option('Semua waktu', 'all'));
  [...new Set(entries.map(entry => entry.date.slice(0, 7)))].sort().reverse().forEach(period => {
    periodFilter.add(new Option(formatMonth(`${period}-01`), period));
  });
  periodFilter.value = [...periodFilter.options].some(option => option.value === selectedPeriod)
    ? selectedPeriod : 'all';
}

function renderTimeline() {
  const query = $('#search-input').value.trim().toLocaleLowerCase('id-ID');
  const category = $('#category-filter').value;
  const period = $('#period-filter').value;
  const filtered = entries.filter(entry => {
    const text = `${entry.title} ${entry.body} ${(entry.tags || []).join(' ')} ${entry.lesson || ''} ${entry.win || ''}`;
    return (category === 'all' || entry.category === category)
      && (period === 'all' || entry.date.startsWith(period))
      && (!query || text.toLocaleLowerCase('id-ID').includes(query));
  });
  const list = $('#timeline-list');
  list.replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-copy';
    empty.textContent = entries.length ? 'Belum ada catatan yang cocok.' : 'Jurnal Anda masih kosong. Catat momen pertama Anda.';
    list.append(empty);
    return;
  }
  filtered.forEach(entry => list.append(renderEntry(entry)));
}

function refresh() {
  entries.sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)));
  const month = localDateISO().slice(0, 7);
  const monthEntries = entries.filter(entry => entry.date.startsWith(month));
  $('#entry-count').textContent = monthEntries.length;
  $('#focus-count').textContent = new Set(monthEntries.map(entry => entry.category)).size;
  $('#wins-count').textContent = monthEntries.filter(entry => entry.win).length;
  $('#lesson-count').textContent = monthEntries.filter(entry => entry.lesson).length;
  $('#recent-entries').replaceChildren(...entries.slice(0, 3).map(renderEntry));
  if (!entries.length) {
    $('#monthly-summary').textContent = 'Catatan yang Anda simpan bulan ini akan menjadi rangkuman perjalanan Anda di sini.';
  } else if (!monthEntries.length) {
    $('#monthly-summary').textContent = `Belum ada entry untuk ${formatMonth(`${month}-01`)}. Entry lama Anda tetap tersedia di timeline.`;
  } else {
    const categories = [...new Set(monthEntries.map(entry => entry.category))];
    const wins = monthEntries.filter(entry => entry.win).length;
    $('#monthly-summary').textContent = `Anda menyimpan ${monthEntries.length} catatan di ${formatMonth(`${month}-01`)}, mencakup ${categories.join(', ')}. ${wins ? `${wins} win kecil ikut tercatat. ` : ''}Baca kembali entry untuk melihat keputusan, kemajuan, dan pelajaran yang paling berarti.`;
  }
  const themeLabels = [...new Set(monthEntries.map(entry => entry.category))].slice(0, 4);
  $('#summary-themes').replaceChildren(...themeLabels.map(theme => {
    const chip = document.createElement('span');
    chip.textContent = theme;
    return chip;
  }));
  $('#month-chip').textContent = formatMonth(`${month}-01`).toLocaleUpperCase('id-ID');
  $('#monthly-heading').textContent = `${formatMonth(`${month}-01`)} dalam pandangan`;
  $('#summary-title').textContent = `Jejak ${formatMonth(`${month}-01`)}`;
  $('#active-period-label').textContent = formatMonth(`${month}-01`);
  $('#active-year-label').textContent = month.slice(0, 4);
  renderGoals();
  renderInsights('built', '#built-list', 'Proyek yang Anda catat akan muncul di sini.');
  renderInsights('learned', '#learned-list', 'Pelajaran penting dari perjalanan Anda akan tersimpan di sini.');
  renderInsights('gap', '#gap-list', 'Langkah berikutnya dapat Anda tambahkan dari refleksi pribadi.');
  refreshFilters();
  renderTimeline();
}

function setView(view) {
  document.querySelectorAll('.view').forEach(element => {
    element.classList.toggle('active', element.id === `${view}-view`);
  });
  document.querySelectorAll('.nav-item').forEach(element => {
    element.classList.toggle('active', element.dataset.view === view);
  });
  const name = currentUser ? displayNameFor(currentUser) : 'Life Journal';
  $('#view-title').textContent = view === 'dashboard' ? `Halo, ${name}.`
    : view === 'timeline' ? 'Jejak yang tersimpan.'
      : view === 'inbox' ? 'Percakapan yang layak diingat.' : 'Ruang untuk mengingat.';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function insertEntry(entry) {
  if (!currentUser || !dataReady) throw new Error('Sesi jurnal belum siap. Coba muat ulang halaman.');
  const row = {
    user_id: currentUser.id,
    entry_date: entry.date,
    category: entry.category || 'Reflection',
    title: entry.title.trim(),
    body: entry.body.trim(),
    tags: entry.tags || [],
    win: entry.win || null,
    lesson: entry.lesson || null,
    source: entry.source || 'manual'
  };
  const { data, error } = await supabaseClient.from('journal_entries').insert(row).select('*').single();
  if (error) throw error;
  const saved = entryFromDatabase(data);
  entries.unshift(saved);
  refresh();
  return saved;
}

function safeMessage(error) {
  const text = String(error?.message || '').toLowerCase();
  if (text.includes('duplicate key')) return 'Goal dengan nama itu sudah ada.';
  if (text.includes('row-level security')) return 'Perubahan ditolak oleh aturan keamanan. Keluar lalu masuk kembali.';
  if (text.includes('failed to fetch')) return 'Tidak tersambung ke server. Periksa koneksi internet lalu coba lagi.';
  return error?.message || 'Terjadi kendala. Coba lagi sebentar.';
}

async function importLegacyEntries(user) {
  if (user.id !== LEGACY_OWNER_ID) return [];
  const marker = `farrell-journal-cloud-migrated:${user.id}`;
  if (localStorage.getItem(marker) === '1') return [];
  const raw = localStorage.getItem('farrell-journal-entries');
  if (!raw) {
    localStorage.setItem(marker, '1');
    return [];
  }
  let legacy;
  try {
    legacy = JSON.parse(raw);
  } catch {
    throw new Error('Data jurnal lama di perangkat ini tidak terbaca. Jangan hapus cache sebelum mengekspornya.');
  }
  if (!Array.isArray(legacy)) throw new Error('Format jurnal lama tidak dikenali; ekspor JSON dulu sebelum lanjut.');
  const existing = new Set(entries.map(entryFingerprint));
  const rows = legacy.filter(item => item && item.date && item.title && item.body)
    .filter(item => !existing.has(entryFingerprint(item)))
    .map(item => ({
      user_id: user.id,
      entry_date: item.date,
      category: item.category || 'Reflection',
      title: String(item.title).slice(0, 240),
      body: String(item.body),
      tags: Array.isArray(item.tags) ? item.tags.map(String).slice(0, 30) : [],
      win: item.win || null,
      lesson: item.lesson || null,
      source: item.source || 'legacy_import'
    }));
  if (rows.length) {
    const { data, error } = await supabaseClient.from('journal_entries').insert(rows).select('*');
    if (error) throw error;
    entries.push(...(data || []).map(entryFromDatabase));
  }
  localStorage.removeItem('farrell-journal-entries');
  localStorage.setItem(marker, '1');
  return rows;
}

async function loadAccount(user) {
  if (!user?.id) return;
  if (loadedUserId === user.id && dataReady) {
    currentUser = user;
    $('#auth-screen').hidden = true;
    $('#logout-button').hidden = false;
    return;
  }
  if (loadingUserId === user.id && accountLoadPromise) return accountLoadPromise;
  if (currentUser?.id !== user.id) {
    entries = [];
    goals = [];
    insights = [];
  }
  currentUser = user;
  dataReady = false;
  loadingUserId = user.id;
  $('#auth-screen').hidden = true;
  $('#logout-button').hidden = false;
  $('#logout-status').textContent = '';
  updateProfileUi(user);
  showCloudStatus('Menghubungkan jurnal ke cloud…');
  const request = (async () => {
    const [entryResult, goalResult, insightResult] = await Promise.all([
      supabaseClient.from('journal_entries').select('*').order('entry_date', { ascending: false }).order('created_at', { ascending: false }),
      supabaseClient.from('journal_goals').select('*').order('created_at', { ascending: true }),
      supabaseClient.from('journal_insights').select('*').order('position', { ascending: true })
    ]);
    if (currentUser?.id !== user.id) return;
    const failure = entryResult.error || goalResult.error || insightResult.error;
    if (failure) throw failure;
    entries = (entryResult.data || []).map(entryFromDatabase);
    goals = goalResult.data || [];
    insights = insightResult.data || [];
    await importLegacyEntries(user);
    if (currentUser?.id !== user.id) return;
    loadedUserId = user.id;
    dataReady = true;
    refresh();
    showCloudStatus('Jurnal tersimpan aman dan tersinkron di perangkat ini.', 'success');
  })();
  accountLoadPromise = request;
  try {
    await request;
  } catch (error) {
    if (currentUser?.id === user.id) {
      dataReady = false;
      loadedUserId = null;
      showCloudStatus(`Jurnal cloud belum termuat: ${safeMessage(error)}`, 'error');
      refresh();
    }
  } finally {
    if (loadingUserId === user.id) {
      loadingUserId = null;
      accountLoadPromise = null;
    }
  }
}

document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
document.querySelectorAll('[data-view-link]').forEach(button => button.addEventListener('click', () => setView(button.dataset.viewLink)));
document.querySelectorAll('[data-open-entry]').forEach(button => button.addEventListener('click', () => setView('entry')));
$('#search-input').addEventListener('input', renderTimeline);
$('#category-filter').addEventListener('change', renderTimeline);
$('#period-filter').addEventListener('change', renderTimeline);

$('#entry-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('[type="submit"]');
  const tags = $('#entry-tags').value.split(',').map(tag => tag.trim()).filter(Boolean);
  button.disabled = true;
  $('#save-status').textContent = 'Menyimpan ke cloud…';
  try {
    await insertEntry({
      date: $('#entry-date').value,
      category: $('#entry-category').value,
      title: $('#entry-title').value.trim(),
      body: $('#entry-body').value.trim(),
      tags,
      win: $('#entry-win').value.trim(),
      lesson: $('#entry-lesson').value.trim(),
      source: 'manual'
    });
    event.currentTarget.reset();
    $('#entry-date').value = localDateISO();
    $('#save-status').textContent = 'Tersimpan—jurnal tersedia di perangkat lain juga.';
  } catch (error) {
    $('#save-status').textContent = `Belum tersimpan: ${safeMessage(error)}`;
  } finally {
    button.disabled = false;
    setTimeout(() => { $('#save-status').textContent = ''; }, 6000);
  }
});

$('#export-button').addEventListener('click', () => {
  const backup = {
    owner: currentUser?.email || 'Life Journal user',
    exportedAt: new Date().toISOString(),
    entries,
    goals,
    insights
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'life-journal-backup.json';
  anchor.click();
  URL.revokeObjectURL(url);
});

$('#add-goal').addEventListener('click', () => {
  if (!dataReady) {
    showCloudStatus('Tunggu sampai jurnal selesai tersambung ke cloud.', 'error');
    return;
  }
  $('#goal-form').reset();
  $('#goal-dialog').showModal();
  $('#goal-title').focus();
});
$('#cancel-goal').addEventListener('click', () => $('#goal-dialog').close());
$('#goal-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentUser || !dataReady) return;
  const submit = event.currentTarget.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const row = {
      user_id: currentUser.id,
      title: $('#goal-title').value.trim(),
      note: $('#goal-note').value.trim(),
      progress: 0
    };
    const { data, error } = await supabaseClient.from('journal_goals').insert(row).select('*').single();
    if (error) throw error;
    goals.push(data);
    renderGoals();
    $('#goal-dialog').close();
    showCloudStatus('Goal tersimpan di cloud.', 'success');
  } catch (error) {
    showCloudStatus(`Goal belum tersimpan: ${safeMessage(error)}`, 'error');
  } finally {
    submit.disabled = false;
  }
});

$('#create-draft').addEventListener('click', () => {
  const text = $('#inbox-text').value.trim();
  if (!text) { $('#inbox-text').focus(); return; }
  const lower = text.toLocaleLowerCase('id-ID');
  const contains = words => words.some(word => lower.includes(word));
  const category = contains(['roblox', 'ugc', 'robux', 'trading', 'profit', 'bisnis', 'plts']) ? 'Business'
    : contains(['tisco', 'fsd', 'mom', 'gantt', 'magang', 'kuliah', 'project']) ? 'Work & Study' : 'Reflection';
  const tags = [['roblox', 'Roblox UGC'], ['ugc', 'UGC'], ['tisco', 'TISCO'], ['ai', 'AI'], ['mcp', 'MCP'],
    ['api', 'API'], ['database', 'database'], ['plts', 'PLTS'], ['finance', 'finance'], ['gantt', 'project management']]
    .filter(([word]) => lower.includes(word)).map(([, tag]) => tag);
  const topic = tags[0] || (category === 'Work & Study' ? 'project dan pembelajaran' : category === 'Business' ? 'ide bisnis' : 'refleksi');
  inboxDraft = {
    date: localDateISO(), category,
    title: `Catatan dari percakapan: ${topic}`,
    body: text.length > 640 ? `${text.slice(0, 637).trim()}...` : text,
    tags, win: '', lesson: 'Hal yang dibahas layak dijadikan langkah atau pertanyaan berikutnya.', source: 'ai_inbox'
  };
  $('#draft-empty').hidden = true;
  $('#draft-result').hidden = false;
  $('#draft-category').textContent = category;
  $('#draft-title').textContent = inboxDraft.title;
  $('#draft-body').textContent = inboxDraft.body;
  const tagList = $('#draft-tags');
  tagList.replaceChildren(...tags.map(tag => {
    const chip = document.createElement('span');
    chip.textContent = `#${tag}`;
    return chip;
  }));
  $('#draft-win').value = '';
  $('#draft-lesson').value = inboxDraft.lesson;
});
$('#discard-draft').addEventListener('click', () => {
  inboxDraft = null;
  $('#draft-result').hidden = true;
  $('#draft-empty').hidden = false;
});
$('#save-draft').addEventListener('click', async event => {
  if (!inboxDraft) return;
  const button = event.currentTarget;
  button.disabled = true;
  inboxDraft.win = $('#draft-win').value.trim();
  inboxDraft.lesson = $('#draft-lesson').value.trim();
  try {
    await insertEntry(inboxDraft);
    $('#inbox-text').value = '';
    $('#draft-result').hidden = true;
    $('#draft-empty').hidden = false;
    inboxDraft = null;
    showCloudStatus('Draft disimpan di jurnal cloud.', 'success');
    setView('timeline');
  } catch (error) {
    showCloudStatus(`Draft belum tersimpan: ${safeMessage(error)}`, 'error');
  } finally {
    button.disabled = false;
  }
});

document.addEventListener('click', async event => {
  const deleteButton = event.target.closest('.delete-entry');
  const goalButton = event.target.closest('[data-update-goal]');
  if (deleteButton) {
    const entry = entries.find(item => item.id === deleteButton.dataset.id);
    if (!entry || !dataReady || !confirm(`Hapus entry “${entry.title}” dari jurnal cloud?`)) return;
    deleteButton.disabled = true;
    const { data, error } = await supabaseClient.from('journal_entries').delete().eq('id', entry.id).select('id');
    if (error || !data?.length) {
      deleteButton.disabled = false;
      showCloudStatus(`Entry belum terhapus: ${safeMessage(error || new Error('Entry tidak ditemukan.'))}`, 'error');
      return;
    }
    entries = entries.filter(item => item.id !== entry.id);
    refresh();
    showCloudStatus('Entry dihapus dari cloud.', 'success');
  } else if (goalButton) {
    const goal = goals.find(item => item.id === goalButton.dataset.updateGoal);
    if (!goal || !dataReady) return;
    const value = prompt(`Progres untuk “${goal.title}” (0–100):`, String(goal.progress));
    if (value === null) return;
    const progress = Number(value);
    if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
      showCloudStatus('Masukkan angka progres dari 0 sampai 100.', 'error');
      return;
    }
    goalButton.disabled = true;
    const { data, error } = await supabaseClient.from('journal_goals')
      .update({ progress, updated_at: new Date().toISOString() }).eq('id', goal.id).select('*').single();
    if (error) {
      goalButton.disabled = false;
      showCloudStatus(`Progres belum tersimpan: ${safeMessage(error)}`, 'error');
      return;
    }
    goals = goals.map(item => item.id === goal.id ? data : item);
    renderGoals();
    showCloudStatus('Progres goal tersimpan di cloud.', 'success');
  }
});

const authMessage = (message, kind = 'info') => {
  const target = $('#auth-message');
  target.textContent = message;
  target.dataset.kind = kind;
};
const setAuthMode = mode => {
  authMode = mode;
  const signup = mode === 'signup';
  const forgot = mode === 'forgot';
  const recovery = mode === 'recovery';
  const needsPassword = !forgot;
  const needsConfirmation = signup || recovery;
  $('#auth-title').textContent = signup ? 'Buat akun Life Journal' : forgot ? 'Lupa kata sandi?'
    : recovery ? 'Buat kata sandi baru' : 'Masuk ke Life Journal';
  $('#auth-subtitle').textContent = signup ? 'Mulai simpan cerita dan progress-mu.' : forgot
    ? 'Kami akan mengirim tautan untuk mengatur ulang kata sandi.'
    : recovery ? 'Gunakan kata sandi baru untuk akun Anda.' : 'Lanjutkan perjalanan yang sedang Anda catat.';
  $('.auth-switch').hidden = recovery;
  $('#auth-switch-copy').textContent = signup ? 'Sudah punya akun?' : forgot ? 'Ingat kata sandi?' : 'Belum punya akun?';
  $('#auth-mode-toggle').textContent = signup || forgot ? 'Masuk' : 'Buat akun';
  $('#auth-email-field').hidden = recovery;
  $('#auth-email').required = !recovery;
  $('#auth-password-field').hidden = !needsPassword;
  $('#auth-password').required = needsPassword;
  $('#auth-password').autocomplete = signup || recovery ? 'new-password' : 'current-password';
  $('#auth-confirm-field').hidden = !needsConfirmation;
  $('#auth-confirm-password').required = needsConfirmation;
  $('#forgot-password').hidden = mode !== 'signin';
  $('#auth-divider').hidden = forgot || recovery;
  $('#google-login').hidden = forgot || recovery;
  $('#auth-submit').textContent = signup ? 'Buat akun' : forgot ? 'Kirim link reset'
    : recovery ? 'Simpan kata sandi' : 'Masuk';
  authMessage('');
};
const setAuthBusy = busy => {
  $('#auth-submit').disabled = busy;
  $('#google-login').disabled = busy;
  $('#auth-mode-toggle').disabled = busy;
  $('#forgot-password').disabled = busy;
};
const friendlyAuthError = error => {
  const message = (error?.message || '').toLowerCase();
  if (message.includes('invalid login credentials')) return 'Email atau kata sandi belum cocok. Periksa kembali, atau buat akun baru.';
  if (message.includes('email not confirmed')) return 'Silakan verifikasi email Anda dari tautan yang kami kirim.';
  if (message.includes('password should be at least')) return 'Kata sandi terlalu pendek. Gunakan minimal 6 karakter.';
  return error?.message || 'Terjadi kendala. Coba lagi sebentar.';
};

$('#auth-mode-toggle').addEventListener('click', () => {
  setAuthMode(authMode === 'signup' || authMode === 'forgot' ? 'signin' : 'signup');
  $('#auth-password').value = '';
  $('#auth-confirm-password').value = '';
});
$('#forgot-password').addEventListener('click', () => {
  setAuthMode('forgot');
  $('#auth-email').focus();
});
$('#password-visibility').addEventListener('click', event => {
  const input = $('#auth-password');
  const visible = input.type === 'password';
  input.type = visible ? 'text' : 'password';
  event.currentTarget.setAttribute('aria-pressed', String(visible));
  event.currentTarget.setAttribute('aria-label', visible ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi');
});

$('#auth-form').addEventListener('submit', async event => {
  event.preventDefault();
  const email = $('#auth-email').value.trim();
  const password = $('#auth-password').value;
  const confirmation = $('#auth-confirm-password').value;
  if ((authMode === 'signup' || authMode === 'recovery') && password !== confirmation) {
    authMessage('Kata sandi yang Anda masukkan belum sama.', 'error');
    $('#auth-confirm-password').focus();
    return;
  }
  setAuthBusy(true);
  authMessage(authMode === 'signin' ? 'Sedang masuk…' : authMode === 'signup' ? 'Membuat akun…'
    : authMode === 'forgot' ? 'Mengirim tautan…' : 'Memperbarui kata sandi…');
  try {
    if (authMode === 'signin') {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } else if (authMode === 'signup') {
      const { data, error } = await supabaseClient.auth.signUp({
        email, password, options: { emailRedirectTo: AUTH_REDIRECT }
      });
      if (error) throw error;
      if (!data.session) {
        setAuthMode('signin');
        authMessage('Akun berhasil dibuat. Periksa email untuk verifikasi sebelum masuk.', 'success');
      }
    } else if (authMode === 'forgot') {
      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: AUTH_REDIRECT });
      if (error) throw error;
      authMessage('Jika email tersebut terdaftar, tautan reset akan dikirim. Periksa inbox dan folder spam.', 'success');
    } else {
      const { error } = await supabaseClient.auth.updateUser({ password });
      if (error) throw error;
      await supabaseClient.auth.signOut({ scope: 'local' });
      setAuthMode('signin');
      $('#auth-password').value = '';
      $('#auth-confirm-password').value = '';
      authMessage('Kata sandi diperbarui. Silakan masuk dengan kata sandi baru.', 'success');
    }
  } catch (error) {
    authMessage(friendlyAuthError(error), 'error');
  } finally {
    setAuthBusy(false);
  }
});

$('#google-login').addEventListener('click', async () => {
  setAuthBusy(true);
  try {
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google', options: { redirectTo: AUTH_REDIRECT }
    });
    if (error) throw error;
  } catch (error) {
    authMessage(friendlyAuthError(error), 'error');
  } finally {
    setAuthBusy(false);
  }
});

supabaseClient.auth.onAuthStateChange((event, session) => {
  setTimeout(() => {
    if (event === 'PASSWORD_RECOVERY') {
      $('#logout-button').hidden = true;
      setAuthMode('recovery');
      $('#auth-screen').hidden = false;
    } else if (session) {
      void loadAccount(session.user);
    } else if (event === 'SIGNED_OUT') {
      clearAccountData();
      $('#auth-screen').hidden = false;
      setAuthMode('signin');
      authMessage('Anda berhasil keluar. Silakan masuk kembali.', 'success');
    }
  }, 0);
});

async function showSession() {
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error) {
    showCloudStatus(`Sesi belum bisa diperiksa: ${safeMessage(error)}`, 'error');
    return;
  }
  if (window.location.hash.includes('type=recovery')) {
    $('#logout-button').hidden = true;
    setAuthMode('recovery');
    $('#auth-screen').hidden = false;
  } else if (session) {
    await loadAccount(session.user);
  } else {
    $('#logout-button').hidden = true;
  }
}
showSession();

$('#logout-button').addEventListener('click', async () => {
  const button = $('#logout-button');
  const status = $('#logout-status');
  button.disabled = true;
  button.textContent = 'Keluar…';
  status.textContent = '';
  try {
    const { error } = await supabaseClient.auth.signOut({ scope: 'local' });
    if (error) throw error;
  } catch (error) {
    status.textContent = `Gagal keluar: ${friendlyAuthError(error)}`;
    button.disabled = false;
    button.textContent = 'Keluar';
  }
});

$('#entry-date').value = localDateISO();
refresh();

