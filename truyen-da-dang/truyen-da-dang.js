const STORAGE_KEY = 'storyData';
const byDesc = (k) => (a,b) => (b[k]||0) - (a[k]||0);
const norm = (s='') => s.normalize('NFD').replace(/\p{Diacritic}+/gu,'').toLowerCase();

/* ====== Helpers ====== */
function calcStoryStats(story){
  const chapters = Array.isArray(story?.chapters) ? story.chapters : [];
  const count = chapters.length;
  const last = chapters[count-1] || null;
  const updatedAt = last?.updatedAt || last?.createdAt || story?.updatedAt || story?.createdAt || 0;
  return { count, updatedAt };
}

const PLACEHOLDER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="266"><rect width="100%" height="100%" fill="#f2f2f2"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="14" fill="#777">Không có bìa</text></svg>'
  );

function getCoverSrc(story){
  if (!story) return "";
  const c = story.cover ?? story.image ?? story.thumbnail ?? "";
  if (!c) return "";
  if (typeof c === "string") {
    if (c.startsWith("gs://")) return ""; // không hiển thị trực tiếp
    try { return new URL(c, window.location.href).href; } catch { return c; }
  }
  if (typeof c === "object") return c.url || "";
  return "";
}

// ✅ Luôn eager load ảnh (không lazy nữa)
function storyCover(story){
  const src = getCoverSrc(story) || PLACEHOLDER;
  return `
    <img
      src="${src}"
      alt="Bìa truyện"
      width="96" height="128"
      style="width:100%;height:100%;object-fit:cover;display:block"
      loading="eager"
      decoding="sync"
      fetchpriority="high"
      referrerpolicy="no-referrer"
      onerror="this.onerror=null;this.src='${PLACEHOLDER}'"
    >
  `;
}


const esc = (s = "") =>
  s.replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));

const shorten = (s = "", max = 160) => (s.length > max ? s.slice(0, max - 1) + "…" : s);


/* ====== UI render ====== */
function renderCard(story, index){
  const title  = (story?.title || `Truyện #${index+1}`).toString();
  const stats  = calcStoryStats(story);
  const href = `/doc-truyen/doc-truyen.html?story=${index}&chapter=0`;

  const author = story?.author || story?.tacgia || '';
  const genre  = story?.genre  || story?.theloai || '';
  const intro  = shorten((story?.intro || "").replace(/\s+/g, " ").trim(), 180); // ~2–3 dòng

  return `
    <article class="story-row">
      <a class="story-thumb" href="${href}">${storyCover(story)}</a>

      <div class="story-main">
        <h3 class="story-title"><a href="${href}">${esc(title)}</a></h3>
        <p class="story-intro">${esc(intro)}</p>
        <div class="story-sub">
          ${author ? `<span class="chip">${esc(author)}</span>` : ''}
          ${genre  ? `<span class="chip">${esc(genre)}</span>`  : ''}
        </div>
      </div>

      <div class="story-side">
        <div class="chapter-count">${stats.count} chương</div>
        <!-- ĐÃ BỎ nút Đọc thử -->
      </div>
    </article>`;
}



/* ====== Data & filters ====== */
function loadStories(){
  try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch{ return []; }
}
function applyFilters(stories){
  const q = norm(document.getElementById('search').value.trim());
  const sort = document.getElementById('sort').value;
  let arr = stories
    .map((s,i)=>({ s, i, ...calcStoryStats(s), title: s?.title||`Truyện #${i+1}` }))
    .filter(row => !q || norm(row.title).includes(q));
  if (sort==='alpha') arr.sort((a,b)=> norm(a.title).localeCompare(norm(b.title)));
  else if (sort==='chapters') arr.sort(byDesc('count'));
  else arr.sort(byDesc('updatedAt'));
  return arr;
}

/* ====== Render ====== */
function render(){
  const list = document.getElementById('list');
  const empty = document.getElementById('empty');
  const stories = loadStories();
  const rows = applyFilters(stories);
  if (!rows.length){ list.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display='none';
  list.innerHTML = rows.map(r=>renderCard(r.s,r.i)).join('');
}

/* ====== Init & live updates ====== */
window.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('search').addEventListener('input',render);
  document.getElementById('sort').addEventListener('change',render);
  render();
});
// Cập nhật nếu tab khác ghi vào localStorage
window.addEventListener('storage',(e)=>{ if(e.key===STORAGE_KEY) render(); });

// Nếu bạn phát broadcast từ firebase.js sau khi sync (tùy bạn có hay không)
window.addEventListener('stories-updated', render);
