// =====================
// ĐỌC TRUYỆN - FRONTEND (Refined)
// =====================

// -------- Query params (?story=0&chapter=1)
const params = new URLSearchParams(window.location.search);
let storyIndex = parseInt(params.get("story") || "0", 10);
let chapterIndex = parseInt(params.get("chapter") || "0", 10);

// -------- Storage (an toàn hơn)
let savedStories = [];
try {
  const raw = localStorage.getItem("storyData");
  savedStories = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(savedStories)) savedStories = [];
} catch {
  console.warn("storyData bị hỏng -> reset");
  savedStories = [];
  localStorage.removeItem("storyData");
}

// -------- Helpers
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const currentStory = () => savedStories[storyIndex];
const currentChapters = () => currentStory()?.chapters || [];
const totalChapters = () => currentChapters().length;

// -------- Clamp chỉ số hợp lệ sớm để tránh lỗi
storyIndex = Number.isFinite(storyIndex) ? Math.max(0, storyIndex) : 0;
chapterIndex = Number.isFinite(chapterIndex) ? Math.max(0, chapterIndex) : 0;

// -------- DOM refs
const storyTitleEl = document.getElementById("story-title");
const storyIntroEl = document.getElementById("story-intro");
const chapterTitleEl = document.getElementById("chapter-title");
const chapterContentEl = document.getElementById("chapter-content");
const progressBarEl = document.querySelector(".read-progress__bar");

// Belt buttons (trên)
const prevTopBtn = document.getElementById("prev-chapter");
const nextTopBtn = document.getElementById("next-chapter");
// End buttons (dưới)
const prevEndBtn = document.getElementById("end-prev-chapter");
const nextEndBtn = document.getElementById("end-next-chapter");

// Hai nút "Danh sách chương" dùng CLASS (không trùng id)
const chapterListBtns = document.querySelectorAll(".open-chapter-list");

// Tools
const incBtn = document.getElementById("increase-font");
const decBtn = document.getElementById("decrease-font");
const themeBtn = document.getElementById("toggle-theme");

// Modal Danh sách chương
const modalEl = document.getElementById("chapter-modal");
const modalListEl = document.getElementById("chapter-list-menu");
const modalCloseBtn = document.getElementById("chapter-modal-close");

// -------- Settings (persist)
const FONT_KEY = "readerFontPx";
const THEME_ATTR = "data-theme";
const THEME_KEY = "readerTheme";
const htmlEl = document.documentElement;


let baseFont = parseInt(localStorage.getItem(FONT_KEY) || "18", 10);
baseFont = clamp(Number.isFinite(baseFont) ? baseFont : 18, 14, 28);

function applyFont() {
  // Dùng CSS variable cho mượt & đồng bộ
  htmlEl.style.setProperty("--reader-font-size", baseFont + "px");
}
function saveFont() {
  localStorage.setItem(FONT_KEY, String(baseFont));
}

// đảm bảo có thuộc tính theme + nhớ theme
(function initTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  const cur = stored || htmlEl.getAttribute(THEME_ATTR) || "rider";
  htmlEl.setAttribute(THEME_ATTR, cur);
})();

function toggleTheme() {
  const cur = htmlEl.getAttribute(THEME_ATTR) || "rider";
  const next = cur === "rider-dark" ? "rider" : "rider-dark";
  htmlEl.setAttribute(THEME_ATTR, next);
  localStorage.setItem(THEME_KEY, next);
}

// ---------------- Tiến độ đọc theo cuộn ----------------
function setProgress(pct) {
  if (progressBarEl) progressBarEl.style.width = clamp(pct, 0, 100) + "%";
}
function calcProgress() {
  const container = document.querySelector(".rider-reader");
  if (!container) return 0;

  const viewH = window.innerHeight || document.documentElement.clientHeight;
  const rect = container.getBoundingClientRect();
  const docY = window.scrollY || window.pageYOffset;
  const top = rect.top + docY;
  const totalScrollable = container.scrollHeight - viewH + 40; // đệm
  const scrolled = Math.max(0, Math.min(totalScrollable, docY - (top - 20)));
  if (totalScrollable <= 0) return 100;
  return Math.round((scrolled / totalScrollable) * 100);
}

// Coalesce sự kiện scroll bằng rAF để giảm reflow
let rafId = null;
function onScroll() {
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    setProgress(calcProgress());
  });
}
window.addEventListener("scroll", onScroll, { passive: true });

// ---------------- Popup Danh sách chương ----------------
let lastChapterListTrigger = null; // để trả focus khi đóng

function buildChapterMenu() {
  if (!modalListEl) return;
  const chapters = currentChapters();
  modalListEl.innerHTML = "";

  if (!chapters.length) {
    const li = document.createElement("li");
    li.textContent = "Chưa có chương nào.";
    li.style.color = "#666";
    modalListEl.appendChild(li);
    return;
  }

  chapters.forEach((ch, idx) => {
    const li = document.createElement("li");
    li.className = "chapter-link-item";
    li.innerHTML = `
      <button class="chapter-link-btn" data-idx="${idx}">
        <span class="chapter-link-index">${idx + 1}.</span>
        <span class="chapter-link-title">${ch.title || "Chương " + (idx + 1)}</span>
      </button>
    `;
    modalListEl.appendChild(li);
  });

  // highlight chương hiện tại
  const currentBtn = modalListEl.querySelector(`.chapter-link-btn[data-idx="${chapterIndex}"]`);
  if (currentBtn) currentBtn.style.boxShadow = "0 0 0 2px rgba(46,204,113,.45) inset";

  // lắng nghe chọn
  modalListEl.querySelectorAll(".chapter-link-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.getAttribute("data-idx"), 10);
      if (!Number.isNaN(idx)) {
        chapterIndex = idx;
        closeChapterModal();
        updateURLAndRender(true); // manual = true
      }
    });
  });
}

// Trap focus cơ bản trong modal
function trapFocusIn(el) {
  const focusables = el.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  function onKey(e) {
    if (e.key !== "Tab") return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  }
  el.addEventListener("keydown", onKey);
  el._trapOff = () => el.removeEventListener("keydown", onKey);
}

function openChapterModal(e) {
  if (!modalEl) return;
  lastChapterListTrigger = e?.currentTarget || null; // nhớ nút đã bấm
  buildChapterMenu();
  modalEl.hidden = false;
  document.body.style.overflow = "hidden";
  trapFocusIn(modalEl);
  // focus nút đóng để hỗ trợ bàn phím
  modalCloseBtn?.focus();
}
function closeChapterModal() {
  if (!modalEl) return;
  modalEl.hidden = true;
  document.body.style.overflow = "";
  modalEl._trapOff?.();
  // trả focus về nút mở gần nhất
  lastChapterListTrigger?.focus?.();
}

// mở từ cả hai nút (trên/dưới)
chapterListBtns.forEach((btn) => btn?.addEventListener("click", openChapterModal));
modalCloseBtn?.addEventListener("click", closeChapterModal);
// click nền để đóng
modalEl?.addEventListener("click", (e) => {
  if (e.target === modalEl) closeChapterModal();
});

// ---------------- Nút điều hướng ----------------
function disableAllNav() {
  [prevTopBtn, prevEndBtn, nextTopBtn, nextEndBtn].forEach((b) => {
    if (b) b.disabled = true;
  });
}

function updateButtonsDisabled() {
  const total = totalChapters();
  const atStart = chapterIndex <= 0;
  const atEnd = total > 0 ? chapterIndex >= total - 1 : true;

  [prevTopBtn, prevEndBtn].forEach((b) => {
    if (b) b.disabled = atStart;
  });
  [nextTopBtn, nextEndBtn].forEach((b) => {
    if (b) b.disabled = atEnd;
  });
}

function goPrev() {
  if (chapterIndex > 0) {
    chapterIndex--;
    updateURLAndRender(true); // manual điều hướng
  } else {
    alert("📖 Đây là chương đầu tiên!");
  }
}
function goNext() {
  const total = totalChapters();
  if (chapterIndex < total - 1) {
    chapterIndex++;
    updateURLAndRender(true); // manual điều hướng
  } else {
    alert("📖 Đây là chương cuối cùng!");
  }
}

prevTopBtn?.addEventListener("click", goPrev);
nextTopBtn?.addEventListener("click", goNext);
prevEndBtn?.addEventListener("click", goPrev);
nextEndBtn?.addEventListener("click", goNext);

// ---------------- Phím tắt trái/phải ----------------
function isTypingTarget(el) {
  const tag = (el?.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || el?.isContentEditable;
}

window.addEventListener("keydown", (e) => {
  // Nếu modal mở, cho phép ESC đóng, nhưng chặn left/right để không lỡ điều hướng
  if (modalEl && !modalEl.hidden) {
    if (e.key === "Escape") closeChapterModal();
    return;
  }
  if (isTypingTarget(e.target)) return;

  if (e.key === "ArrowLeft") goPrev();
  if (e.key === "ArrowRight") goNext();
});

// ---------------- Tools ----------------
incBtn?.addEventListener("click", () => {
  baseFont = clamp(baseFont + 1, 14, 28);
  applyFont();
  saveFont();
});
decBtn?.addEventListener("click", () => {
  baseFont = clamp(baseFont - 1, 14, 28);
  applyFont();
  saveFont();
});
themeBtn?.addEventListener("click", toggleTheme);

// ---------------- Swipe mobile ----------------
(function enableSwipe() {
  let startX = 0,
    startY = 0,
    touching = false;
  const threshold = 50;

  window.addEventListener(
    "touchstart",
    (e) => {
      // bỏ qua vùng có thể cần kéo riêng
      if (e.target?.closest?.("[data-no-swipe]")) return;
      const t = e.changedTouches[0];
      startX = t.clientX;
      startY = t.clientY;
      touching = true;
    },
    { passive: true }
  );

  window.addEventListener(
    "touchend",
    (e) => {
      if (!touching) return;
      touching = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > threshold) {
        if (dx < 0) goNext();
        else goPrev();
      }
    },
    { passive: true }
  );
})();

// ---------------- Render chương ----------------
function renderChapter(isManualScroll = false) {
  // Nếu storyIndex vượt quá số truyện, lùi về 0
  if (storyIndex >= savedStories.length) storyIndex = 0;

  const story = currentStory();
  if (!story) {
    if (storyTitleEl) storyTitleEl.textContent = "❌ Không tìm thấy truyện!";
    if (storyIntroEl) storyIntroEl.textContent = "";
    if (chapterTitleEl) chapterTitleEl.textContent = "";
    if (chapterContentEl) chapterContentEl.textContent = "";
    setProgress(0);
    disableAllNav();
    buildChapterMenu();
    return;
  }

  // chuẩn hóa index chương
  const total = totalChapters();
  if (total > 0) {
    chapterIndex = clamp(chapterIndex, 0, total - 1);
  } else {
    chapterIndex = 0;
  }

  // header truyện
  if (storyTitleEl) storyTitleEl.textContent = story.title || "Không có tiêu đề";
  if (storyIntroEl) storyIntroEl.textContent = story.intro || "";

  const chapters = currentChapters();
  const chapter = chapters[chapterIndex];

  if (!chapter) {
    if (chapterTitleEl) chapterTitleEl.textContent = "📭 Chưa có chương!";
    if (chapterContentEl) chapterContentEl.textContent = "";
    setProgress(0);
    updateButtonsDisabled();
    buildChapterMenu();
    return;
  }

  if (chapterTitleEl) chapterTitleEl.textContent = chapter.title || `Chương ${chapterIndex + 1}`;

  // Nếu dữ liệu là plain text giữ textContent an toàn XSS;
  // Nếu chương có HTML hợp lệ và dữ liệu tin cậy, thay thành innerHTML.
  if (chapterContentEl) chapterContentEl.textContent = chapter.content || "";

  // về đầu bài khi render
  const readerEl = document.querySelector(".rider-reader");
  if (readerEl) {
    readerEl.scrollIntoView({
      behavior: isManualScroll ? "smooth" : "instant",
      block: "start",
    });
  }

  // tiến độ đầu chương
  setProgress(calcProgress());

  // build lại menu danh sách chương (để tiêu đề luôn đúng)
  buildChapterMenu();

  updateButtonsDisabled();
}

// ---------------- URL + Render ----------------
function updateURLAndRender(manual = false) {
  const url = new URL(location.href);
  url.searchParams.set("story", String(storyIndex));
  url.searchParams.set("chapter", String(chapterIndex));
  history.pushState({ storyIndex, chapterIndex }, "", url);
  renderChapter(manual);
}

// ---------------- Popstate (Back/Forward) ----------------
window.addEventListener("popstate", (e) => {
  if (e.state && typeof e.state.storyIndex === "number") {
    storyIndex = e.state.storyIndex;
    chapterIndex = e.state.chapterIndex;
  } else {
    const p = new URLSearchParams(window.location.search);
    storyIndex = Math.max(0, parseInt(p.get("story") || "0", 10));
    chapterIndex = Math.max(0, parseInt(p.get("chapter") || "0", 10));
  }
  renderChapter(false); // không cuộn mượt khi back/forward
});

// ---------------- Init ----------------
applyFont();
renderChapter(false);
updateButtonsDisabled();
setProgress(calcProgress());

// Đảm bảo back/forward mượt từ lần vào trang đầu
if (!history.state) {
  history.replaceState({ storyIndex, chapterIndex }, "", location.href);
}
