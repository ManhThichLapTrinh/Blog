// ===== Tham chiếu DOM =====
const storyList = document.getElementById("story-list");
const postStoryForm = document.getElementById("post-story-form");
const chapterSection = document.getElementById("chapter-section");
const chapterList = document.getElementById("chapter-list");
const chapterForm = document.getElementById("chapter-form");
const selectedStoryName = document.getElementById("selected-story-name");
const selectedStoryIntro = document.getElementById("selected-story-intro");
const toggleChapterList = document.getElementById("toggle-chapter-list");
const addChapterBtn = document.getElementById("add-chapter-btn");
const editIndexInput = document.getElementById("edit-index");
const chapterTitleInput = document.getElementById("chapter-title");
const chapterContentInput = document.getElementById("chapter-content");
const cancelEditBtn = document.getElementById("cancel-edit");

// Ảnh bìa
const coverInput = document.getElementById("story-cover");
const coverPreview = document.getElementById("story-cover-preview");

// ===== State & Storage =====
let savedStories = (() => {
  try { return JSON.parse(localStorage.getItem("storyData")) || []; }
  catch { return []; }
})();
let selectedStoryIndex = null;

// ===== Utils =====
function persistLocal() {
  localStorage.setItem("storyData", JSON.stringify(savedStories));
  window.dispatchEvent(new CustomEvent("stories-updated"));
}

async function save() {
  // Chỉ lưu LOCAL để tránh vượt 1MB khi sync Cloud
  try {
    persistLocal();
  } catch (e) {
    console.error("Lưu dữ liệu lỗi (local):", e);
  }
}

const isoNow = () => new Date().toISOString();

const NO_COVER_DATAURL =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><rect width="100%" height="100%" fill="#e9f3ec"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="10" fill="#6b8a7a">No Cover</text></svg>'
  );

// ==== Helper: chuyển file ảnh -> base64, có nén kích thước ====
// opts: { maxW, maxH, quality }
async function fileToBase64Resized(file, opts = {}) {
  const { maxW = 512, maxH = 512, quality = 0.8 } = opts;
  const createBitmap = "createImageBitmap" in window
    ? window.createImageBitmap(file)
    : new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = URL.createObjectURL(file);
      });
  const bitmap = await createBitmap;
  const ratio = Math.min(maxW / bitmap.width, maxH / bitmap.height, 1);
  const w = Math.max(1, Math.round(bitmap.width * ratio));
  const h = Math.max(1, Math.round(bitmap.height * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, w, h);

  const type = /png/i.test(file.type) ? "image/png" : "image/jpeg";
  return canvas.toDataURL(type, quality); // -> "data:image/jpeg;base64,..."
}

// Chuẩn hoá nguồn ảnh bìa (hỗ trợ nhiều schema)
function getCoverSrc(story) {
  if (!story) return "";
  const c = story.cover ?? story.image ?? story.thumbnail ?? story.coverUrl ?? "";
  if (!c) return "";
  if (typeof c === "string") {
    if (c.startsWith("gs://")) return ""; // không load trực tiếp được
    try { return new URL(c, window.location.href).href; } catch { return c; }
  }
  if (typeof c === "object") return c.url || "";
  return "";
}

function safeThumbElement(story) {
  const img = document.createElement("img");
  img.className = "thumb";
  img.alt = "Bìa";
  img.loading = "lazy";
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";

  const src = getCoverSrc(story);
  img.src = src || NO_COVER_DATAURL;
  img.onerror = () => { img.src = NO_COVER_DATAURL; };
  return img;
}

// ===== Render danh sách truyện =====
function renderStories() {
  storyList.innerHTML = "";

  if (!savedStories.length) {
    const li = document.createElement("li");
    li.textContent = "Chưa có truyện nào";
    li.style.color = "#777";
    storyList.appendChild(li);
    chapterSection.hidden = true;
    return;
  }

  savedStories.forEach((story, index) => {
    const li = document.createElement("li");
    li.className = "story-item";
    li.dataset.index = index;

    // cột 1: thumbnail bìa
    const thumb = safeThumbElement(story);

    // cột 2: nút chọn truyện (tiêu đề + ngày)
    const titleBtn = document.createElement("button");
    titleBtn.className = "story-select";
    titleBtn.textContent = story.title || `Truyện #${index + 1}`;
    titleBtn.addEventListener("click", () => selectStory(index));

    const dateSpan = document.createElement("span");
    dateSpan.className = "story-date";
    const created = story.createdAt || Date.now();
    dateSpan.textContent = `(${new Date(created).toLocaleDateString()})`;

    const titleWrap = document.createElement("div");
    titleWrap.style.display = "flex";
    titleWrap.style.alignItems = "center";
    titleWrap.style.gap = "6px";
    titleWrap.appendChild(titleBtn);
    titleWrap.appendChild(dateSpan);

    // cột 3: actions
    const act = document.createElement("div");
    act.className = "story-actions";
    const delBtn = document.createElement("button");
    delBtn.className = "delete-story-btn";
    delBtn.title = "Xóa truyện";
    delBtn.textContent = "🗑️";
    delBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const name = story.title || "truyện";
      if (!confirm(`Bạn có muốn xóa "${name}"? Toàn bộ chương sẽ bị xóa.`)) return;

      // Cloud (tùy chọn) — đã được vá trong firebase.js để tránh 400
      try {
        if (story.id && typeof window.deleteStory === "function") {
          await window.deleteStory(story.id);
        }
      } catch (err) {
        console.warn("Xóa trên cloud lỗi (bỏ qua):", err);
      }

      const wasIndex = index;
      savedStories.splice(index, 1);
      await save();

      if (savedStories.length) {
        selectedStoryIndex = Math.min(wasIndex, savedStories.length - 1);
        selectStory(selectedStoryIndex);
      } else {
        selectedStoryIndex = null;
        chapterSection.hidden = true;
      }
      renderStories();
    });
    act.appendChild(delBtn);

    // ghép vào li
    li.appendChild(thumb);
    li.appendChild(titleWrap);
    li.appendChild(act);
    storyList.appendChild(li);
  });

  // đánh dấu active
  if (selectedStoryIndex != null && savedStories[selectedStoryIndex]) {
    document.querySelectorAll("#story-list .story-item").forEach((el) => el.classList.remove("active"));
    const active = document.querySelector(`#story-list .story-item[data-index="${selectedStoryIndex}"]`);
    if (active) active.classList.add("active");
  }
}

function selectStory(index) {
  selectedStoryIndex = index;
  const s = savedStories[selectedStoryIndex];
  if (!s) {
    chapterSection.hidden = true;
    return;
  }
  selectedStoryName.textContent = s.title;
  selectedStoryIntro.textContent = s.intro || "";
  chapterSection.hidden = false;
  chapterForm.hidden = true;
  renderChapters();

  document.querySelectorAll("#story-list .story-item").forEach((el) => el.classList.remove("active"));
  const active = document.querySelector(`#story-list .story-item[data-index="${selectedStoryIndex}"]`);
  if (active) active.classList.add("active");
}

// ===== Thêm truyện mới =====
postStoryForm.addEventListener("submit", async function (e) {
  e.preventDefault();
  const title = document.getElementById("story-title").value.trim();
  const intro = document.getElementById("story-intro").value.trim();
  const createdAt = isoNow();
  if (!title || !intro) return;

  const file = coverInput?.files?.[0] || null;

  // coverUrl cho Cloud, coverBase64 cho local preview
  let coverUrl = "";
  let coverBase64 = "";

  try {
    if (file && typeof window.uploadCover === "function") {
      coverUrl = await window.uploadCover(file); // hiện đang stub trong firebase.js
    }
  } catch (err) {
    console.warn("Upload cover lên cloud lỗi (bỏ qua):", err);
  }

  try {
    // base64 nén nhẹ cho local/offline
    if (file) {
      coverBase64 = await fileToBase64Resized(file, { maxW: 512, maxH: 512, quality: 0.8 });
    } else if (coverPreview?.dataset?.src) {
      coverBase64 = coverPreview.dataset.src;
    }
  } catch (err) {
    console.warn("Convert cover to base64 lỗi:", err);
  }

  // Cloud: ghi metadata story nhỏ gọn (không chapters, không base64)
  let cloudStoryId = null;
  try {
    if (typeof window.addStory === "function") {
      const cloud = await window.addStory({ title, intro, coverUrl, createdAt });
      cloudStoryId = cloud?.id || cloud?.storyId || null;
    }
  } catch (err) {
    console.warn("Ghi story lên cloud lỗi (bỏ qua):", err);
  }

  // Local: thêm vào bộ nhớ; giữ base64 nếu chưa có URL
  savedStories.unshift({
    id: cloudStoryId || undefined,
    title,
    intro,
    coverUrl: coverUrl || undefined,
    cover: !coverUrl ? coverBase64 : undefined,
    createdAt,
    chapters: []
  });
  await save();

  renderStories();
  postStoryForm.reset();
  if (coverPreview) {
    coverPreview.textContent = "Chưa chọn ảnh";
    delete coverPreview.dataset.src;
  }
  selectStory(0);
});

// Preview ảnh bìa khi chọn file (dùng nén nhỏ để preview mượt)
if (coverInput && coverPreview) {
  coverInput.addEventListener("change", async () => {
    const file = coverInput.files && coverInput.files[0];
    if (!file) {
      coverPreview.textContent = "Chưa chọn ảnh";
      delete coverPreview.dataset.src;
      return;
    }
    try {
      const dataUrl = await fileToBase64Resized(file, { maxW: 256, maxH: 256, quality: 0.8 });
      coverPreview.innerHTML = `<img src="${dataUrl}" alt="Bìa truyện">`;
      coverPreview.dataset.src = dataUrl; // base64 cho submit (local)
    } catch (e) {
      console.warn("Preview cover lỗi:", e);
      coverPreview.textContent = "Không xem trước được";
      delete coverPreview.dataset.src;
    }
  });
}

// ===== Render danh sách chương =====
function renderChapters() {
  chapterList.innerHTML = "";
  const story = savedStories[selectedStoryIndex];
  if (!story) return;

  const chapters = story.chapters || [];
  if (!chapters.length) {
    const li = document.createElement("li");
    li.textContent = "Chưa có chương nào";
    li.style.color = "#777";
    chapterList.appendChild(li);
    return;
  }

  chapters.forEach((chap, i) => {
    const li = document.createElement("li");
    li.className = "chapter-item";
    li.dataset.index = i;

    li.innerHTML = `
      <div class="chapter-left">
        <div class="chapter-title">
          <a href="../doc-truyen/doc-truyen.html?story=${selectedStoryIndex}&chapter=${i}" target="_blank">${chap.title}</a>
        </div>
        <div class="chapter-snippet">${(chap.content || "").slice(0, 120)}${(chap.content || "").length > 120 ? "…" : ""}</div>
      </div>
      <div class="chapter-actions">
        <button class="chapter-edit">Sửa</button>
        <button class="chapter-delete">Xóa</button>
      </div>
    `;

    li.querySelector(".chapter-edit").addEventListener("click", () => {
      openChapterForm(i);
    });

    li.querySelector(".chapter-delete").addEventListener("click", async () => {
      if (!confirm(`Xóa chương "${chap.title}"?`)) return;

      // Cloud (tùy chọn) — chỉ khi có id
      const storyObj = savedStories[selectedStoryIndex];
      try {
        if (storyObj?.id && chap.id && typeof window.deleteChapter === "function") {
          await window.deleteChapter(storyObj.id, chap.id);
        }
      } catch (err) {
        console.warn("Xóa chapter trên cloud lỗi (bỏ qua):", err);
      }

      // Local
      story.chapters.splice(i, 1);
      story.updatedAt = isoNow();
      await save();
      renderChapters();
    });

    chapterList.appendChild(li);
  });
}

// ===== Toggle danh sách chương =====
toggleChapterList.addEventListener("click", () => {
  chapterList.style.display = chapterList.style.display === "none" ? "block" : "none";
});

// ===== Mở form thêm/sửa chương =====
addChapterBtn.addEventListener("click", () => openChapterForm());

function openChapterForm(editIndex = null) {
  const story = savedStories[selectedStoryIndex];
  if (!story) return;

  if (editIndex === null) {
    editIndexInput.value = "";
    chapterTitleInput.value = "";
    chapterContentInput.value = "";
  } else {
    const ch = story.chapters?.[editIndex];
    if (!ch) return;
    editIndexInput.value = String(editIndex);
    chapterTitleInput.value = ch.title || "";
    chapterContentInput.value = ch.content || "";
  }

  chapterForm.hidden = false;
  chapterTitleInput.focus();
}

// ===== Hủy form =====
cancelEditBtn.addEventListener("click", () => {
  chapterForm.hidden = true;
  editIndexInput.value = "";
  chapterTitleInput.value = "";
  chapterContentInput.value = "";
});

// ===== Lưu chương (AUTO lấy dòng đầu làm tiêu đề & xóa dòng đó) =====
chapterForm.addEventListener("submit", async function (e) {
  e.preventDefault();
  const story = savedStories[selectedStoryIndex];
  if (!story) return;

  const raw = (chapterContentInput.value || "").replace(/\r\n/g, "\n");
  const lines = raw.split("\n");
  const firstIdx = lines.findIndex((ln) => ln.trim() !== "");
  const firstLine = firstIdx >= 0 ? lines[firstIdx] : "";
  let autoTitle = firstLine.replace(/^#{1,6}\s*/, "").trim();
  if (!autoTitle) autoTitle = (chapterTitleInput.value || "Chương mới").trim();

  const body =
    firstIdx >= 0
      ? lines
          .slice(0, firstIdx)
          .concat(lines.slice(firstIdx + 1))
          .join("\n")
          .replace(/^\s*\n+/, "")
          .replace(/\n+\s*$/, "")
      : raw;

  const editIdxRaw = editIndexInput.value;
  const isEditing = editIdxRaw !== "";

  // ====== Cloud (nếu có) — mỗi CHAPTER là 1 document riêng ======
  const storyId = story.id || null;
  if (storyId && typeof window.addChapter === "function") {
    try {
      if (isEditing) {
        const idx = Number(editIdxRaw);
        const chap = story.chapters?.[idx];
        if (chap?.id && typeof window.updateChapter === "function") {
          await window.updateChapter(storyId, chap.id, {
            title: autoTitle,
            content: body,
            updatedAt: isoNow(),
          });
        }
        // Local mirror
        if (story.chapters && story.chapters[idx]) {
          story.chapters[idx].title = autoTitle;
          story.chapters[idx].content = body;
          story.chapters[idx].updatedAt = isoNow();
        }
      } else {
        const created = isoNow();
        // Cloud tạo doc -> trả về id
        const res = await window.addChapter(storyId, {
          title: autoTitle,
          content: body,
          createdAt: created,
          updatedAt: created,
        });
        const newId = res?.id || null;

        if (!Array.isArray(story.chapters)) story.chapters = [];
        story.chapters.push({
          id: newId || undefined,
          title: autoTitle,
          content: body,
          createdAt: created,
          updatedAt: created,
        });
      }
      story.updatedAt = isoNow();
      await save();
      renderChapters();

      chapterForm.hidden = true;
      editIndexInput.value = "";
      chapterTitleInput.value = "";
      chapterContentInput.value = "";
      return; // kết thúc nhánh cloud
    } catch (err) {
      console.warn("Ghi chapter lên cloud lỗi (tiếp tục local):", err);
      // fallthrough xuống local
    }
  }

  // ====== Local fallback ======
  if (isEditing) {
    const idx = Number(editIdxRaw);
    if (story.chapters && story.chapters[idx]) {
      story.chapters[idx].title = autoTitle;
      story.chapters[idx].content = body;
      story.chapters[idx].updatedAt = isoNow();
    }
  } else {
    if (!Array.isArray(story.chapters)) story.chapters = [];
    story.chapters.push({
      title: autoTitle,
      content: body,
      createdAt: isoNow(),
      updatedAt: isoNow(),
    });
  }
  story.updatedAt = isoNow();

  await save();
  renderChapters();

  chapterForm.hidden = true;
  editIndexInput.value = "";
  chapterTitleInput.value = "";
  chapterContentInput.value = "";
});

// ===== Khởi tạo =====
try {
  if (typeof window.getStories === "function") {
    const list = window.getStories();
    if (Array.isArray(list)) savedStories = list;
  }
} catch {}
renderStories();
if (savedStories[0]) selectStory(0);

// Realtime sync (nếu dùng firebase.js)
window.addEventListener("stories-updated", () => {
  try {
    let list;
    if (typeof window.getStories === "function") {
      list = window.getStories();
    } else {
      list = JSON.parse(localStorage.getItem("storyData") || "[]");
    }
    if (!Array.isArray(list)) list = [];
    savedStories = list;

    renderStories();

    if (savedStories.length && (selectedStoryIndex == null || !savedStories[selectedStoryIndex])) {
      selectStory(0);
    } else if (!savedStories.length) {
      chapterSection.hidden = true;
    }
  } catch (e) {
    console.warn("[stories-updated] refresh failed:", e);
  }
});

// Optional: refresh nhẹ sau khi đồng bộ cloud
setTimeout(() => {
  try {
    if (typeof window.getStories === "function") {
      const list = window.getStories();
      if (Array.isArray(list)) {
        savedStories = list;
        renderStories();
        if (savedStories[0]) selectStory(0);
      }
    }
  } catch {}
}, 800);
