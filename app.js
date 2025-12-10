/* app.js — final integrated for your Mobile Pro UI
   - no photo column (first column left empty)
   - auto-load books.csv if present
   - fast debounced search
   - add / edit / delete
   - auto KHR -> USD conversion (RATE)
   - import CSV/XLSX, export CSV
   - theme toggle Option A: 🌙 when light, ☀️ when dark
*/

const STORAGE_KEY = 'bookstore_data_v1';
const THEME_KEY = 'bookstore_theme';
const RATE = 4000; // KHR -> USD

// quick selector
const $ = sel => document.querySelector(sel);

// state
let books = [];         // array of { name, khr, usd }
let searchIndex = [];   // precomputed lowercase index for fast search

// ---------------- storage ----------------
function loadFromStorage(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    books = raw ? JSON.parse(raw) : [];
  } catch (err) {
    books = [];
  }
}
function saveToStorage(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(books));
}

// ---------------- render ----------------
function render(list = books){
  const tbody = $('#tableBody');
  if(!tbody) return;
  if(!list || list.length === 0){
    tbody.innerHTML = '';
    $('#empty').style.display = 'block';
    return;
  }
  $('#empty').style.display = 'none';

  // build html string for better performance
  let html = '';
  for(let i=0;i<list.length;i++){
    const b = list[i];
    const name = escapeHtml(b.name || '');
    const khr = b.khr || '';
    const usd = b.usd || '';
    // first column left empty (to match your <th>), you can put row number if wanted
    html += `<tr data-idx="${i}">
      <td></td>
      <td class="col-name">${name}</td>
      <td class="col-price">KHR ${khr}</td>
      <td class="col-usd">${usd ? ('$ ' + usd) : ''}</td>
      <td class="col-actions">
        <button class="action-btn edit" onclick="openEdit(${i})">Edit</button>
        <button class="action-btn del" onclick="deleteBook(${i})">Delete</button>
      </td>
    </tr>`;
  }
  tbody.innerHTML = html;
}

// small helper to avoid XSS in names
function escapeHtml(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ---------------- CSV parser (robust) ----------------
function parseCSVText(text){
  const lines = text.split(/\r?\n/).filter(l=>l.trim()!== '');
  const rows = [];
  for(const line of lines){
    const cols = [];
    let cur = '', inQuotes = false;
    for(let i=0;i<line.length;i++){
      const ch = line[i];
      if(ch === '"'){
        if(inQuotes && line[i+1] === '"'){ cur += '"'; i++; continue; }
        inQuotes = !inQuotes;
        continue;
      }
      if(ch === ',' && !inQuotes){ cols.push(cur); cur = ''; continue; }
      cur += ch;
    }
    cols.push(cur);
    rows.push(cols);
  }
  return rows;
}

// ---------------- import file (CSV or XLSX) ----------------
$('#localCsvInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if(!file) return;

  const name = (file.name || '').toLowerCase();
  try{
    if(name.endsWith('.csv')){
      const txt = await file.text();
      const rows = parseCSVText(txt);
      if(rows.length === 0) return alert('CSV is empty');
      const header = rows.shift().map(h => h.trim().toLowerCase());
      const mapped = rows.map(r=>{
        const obj = {};
        header.forEach((h, idx) => obj[h] = r[idx] ? r[idx].trim() : '');
        return {
          name: obj['book title'] || obj['title'] || obj['name'] || '',
          khr: cleanCurrency(obj['price/unit'] || obj['khr'] || obj['price (khr)'] || ''),
          usd: formatUSD(obj['usd'] || (cleanCurrency(obj['price/unit']) / RATE))
        };
      });
      books = mapped;
      postImportFinish();
    } else {
      // xlsx
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { raw: false });
      books = json.map(r => ({
        name: r['Book Title'] || r['Title'] || r['name'] || '',
        khr: cleanCurrency(r['Price/Unit'] || r['KHR'] || ''),
        usd: formatUSD(r['USD'] || (r['Price/Unit'] ? Number(String(r['Price/Unit']).replace(/[^0-9.-]/g,''))/RATE : ''))
      }));
      postImportFinish();
    }
  } catch(err){
    console.error(err);
    alert('Import failed: ' + (err.message || err));
  }
});

function postImportFinish(){
  saveToStorage();
  buildSearchIndex();
  render();
  // clear file input so same file can be selected again
  try { $('#localCsvInput').value = ''; } catch(e){}
}

// ---------------- helpers ----------------
function cleanCurrency(v){
  if(v === undefined || v === null) return '';
  return String(v).replace(/"/g,'').replace(/KHR/ig,'').replace(/,/g,'').trim();
}
function formatUSD(v){
  if(v === undefined || v === null) return '';
  const n = parseFloat(String(v).replace(/[^0-9.-]/g,''));
  return isNaN(n) ? '' : Number(n).toFixed(2);
}

// toDataURL (for optional photo — not used here but kept)
function toDataURL(file){
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => res(e.target.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// ---------------- add / edit / delete ----------------
$('#addBtn').addEventListener('click', ()=> openModal('add'));
$('#cancelBtn').addEventListener('click', closeModal);
$('#saveBtn').addEventListener('click', saveFromModal);

function openModal(mode){
  $('#modal').classList.add('show');
  $('#modal').setAttribute('aria-hidden','false');
  $('#modalTitle').textContent = (mode === 'add' ? 'Add Book' : 'Edit Book');
  if(mode === 'add'){
    $('#editIndex').value = '';
    $('#bookName').value = '';
    $('#priceKHR').value = '';
    $('#priceUSD').value = '';
  }
  setTimeout(()=> { try{ $('#bookName').focus(); } catch(e){} }, 200);
}

function closeModal(){
  $('#modal').classList.remove('show');
  $('#modal').setAttribute('aria-hidden','true');
}

function openEdit(i){
  const b = books[i];
  if(!b) return;
  $('#editIndex').value = i;
  $('#bookName').value = b.name || '';
  $('#priceKHR').value = b.khr || '';
  $('#priceUSD').value = b.usd || '';
  openModal('edit');
}

$('#priceKHR').addEventListener('input', ()=> {
  const raw = ($('#priceKHR').value || '').replace(/,/g,'').trim();
  const n = parseFloat(raw) || 0;
  $('#priceUSD').value = (n / RATE).toFixed(2);
});

async function saveFromModal(){
  const idx = $('#editIndex').value;
  const name = ($('#bookName').value || '').trim();
  const khr = cleanCurrency($('#priceKHR').value);
  const usd = formatUSD($('#priceUSD').value);

  if(!name){ alert('សូមបញ្ចូលឈ្មោះសៀវភៅ'); return; }

  const entry = { name, khr, usd };

  if(idx === '') books.unshift(entry);
  else books[Number(idx)] = entry;

  saveToStorage();
  buildSearchIndex();
  render();
  closeModal();
}

function deleteBook(i){
  if(!confirm('Delete this book?')) return;
  books.splice(i,1);
  saveToStorage();
  buildSearchIndex();
  render();
}

// ---------------- export ----------------
$('#exportBtn').addEventListener('click', ()=>{
  if(!books.length) return alert('No data to export');
  const header = ['Book Title','Price/Unit','USD'];
  const rows = books.map(b => [b.name||'', b.khr||'', b.usd||'']);
  const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'books_export.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
});

// ---------------- fast search (pre-index + debounce) ----------------
function buildSearchIndex(){
  searchIndex = books.map(b => {
    const s = ((b.name||'') + ' ' + (b.khr||'') + ' ' + (b.usd||'')).toLowerCase();
    return s;
  });
}

function debounce(fn, t=120){
  let to;
  return (...a)=>{ clearTimeout(to); to=setTimeout(()=>fn(...a), t); };
}

const searchInput = $('#searchInput');
searchInput.addEventListener('input', debounce(()=>{
  const q = (searchInput.value || '').trim().toLowerCase();
  if(!q){ render(); return; }
  // filter using precomputed index for speed
  const filtered = [];
  for(let i=0;i<searchIndex.length;i++){
    if(searchIndex[i].includes(q)) filtered.push(books[i]);
  }
  render(filtered);
}, 80));

// ---------------- theme toggle Option A (auto switch) ----------------
const themeBtn = $('#themeToggle');
function setTheme(mode){
  if(mode === 'dark'){
    document.body.classList.add('dark');
    themeBtn.querySelector('.icon').textContent = '☀️'; // show sun in dark
  } else {
    document.body.classList.remove('dark');
    themeBtn.querySelector('.icon').textContent = '🌙'; // show moon in light
  }
  localStorage.setItem(THEME_KEY, mode);
}
themeBtn.addEventListener('click', ()=>{
  const cur = localStorage.getItem(THEME_KEY) || 'light';
  setTheme(cur === 'dark' ? 'light' : 'dark');
});

// ---------------- auto-load books.csv (optional) ----------------
async function loadDefaultCSV(){
  try{
    const res = await fetch('books.csv');
    if(!res.ok) return;
    const txt = await res.text();
    const rows = parseCSVText(txt);
    if(rows.length <= 1) return;
    const header = rows.shift().map(h => h.trim().toLowerCase());
    const mapped = rows.map(r=>{
      const obj = {};
      header.forEach((h,i)=> obj[h] = r[i] ? r[i].trim() : '');
      return {
        name: obj['book title'] || obj['title'] || obj['name'] || '',
        khr: cleanCurrency(obj['price/unit'] || obj['khr'] || ''),
        usd: formatUSD(obj['usd'] || (cleanCurrency(obj['price/unit']) / RATE))
      };
    });
    // only load default if local storage empty (don't overwrite user's data)
    if(!books || books.length === 0){
      books = mapped;
      saveToStorage();
    }
  }catch(err){
    // ignore if file not found or blocked by browser when using file://
    // console.warn('default books.csv not loaded', err);
  }
}

// ---------------- util ----------------
function initTheme(){
  const saved = localStorage.getItem(THEME_KEY) || 'light';
  setTheme(saved);
}

// ---------------- init ----------------
(async function init(){
  initTheme();
  loadFromStorage();
  await loadDefaultCSV();
  buildSearchIndex();
  render();
})();
// ---------- DARK MODE ----------
const toggle = document.getElementById("themeToggle");

function applyTheme() {
    const theme = localStorage.getItem("theme") || "light";
    document.body.classList.toggle("dark", theme === "dark");
    toggle.textContent = theme === "dark" ? "☀️" : "🌙";
}

toggle.addEventListener("click", () => {
    let theme = localStorage.getItem("theme") || "light";
    theme = theme === "light" ? "dark" : "light";
    localStorage.setItem("theme", theme);
    applyTheme();
});

applyTheme();

// ---------- SEARCH ----------
document.getElementById("searchInput").addEventListener("input", function () {
    const search = this.value.toLowerCase();
    document.querySelectorAll("#tableBody tr").forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(search) ? "" : "none";
    });
});

// ---------- LOAD CSV ----------
document.getElementById("loadBtn").addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv";

    input.onchange = e => {
        const file = e.target.files[0];
        const reader = new FileReader();

        reader.onload = event => {
            const lines = event.target.result.split("\n").slice(1);
            const tbody = document.getElementById("tableBody");
            tbody.innerHTML = "";

            lines.forEach(row => {
                const cols = row.split(",");
                if (cols.length >= 3) {
                    tbody.innerHTML += `
                        <tr>
                            <td>${cols[0]}</td>
                            <td>${cols[1]}</td>
                            <td>${cols[2]}</td>
                            <td>
                                <button class="edit-btn">Edit</button>
                                <button class="del-btn">Delete</button>
                            </td>
                        </tr>`;
                }
            });
        };

        reader.readAsText(file);
    };

    input.click();
});
