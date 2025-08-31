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

// ===== State & Storage =====
let savedStories = JSON.parse(localStorage.getItem("storyData")) || [];
let selectedStoryIndex = null;

function save() {
  localStorage.setItem("storyData", JSON.stringify(savedStories));
}

function isoNow() {
  return new Date().toISOString();
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

    li.innerHTML = `
      <button class="story-select">${story.title}</button>
      <span class="story-date">(${new Date(story.createdAt).toLocaleDateString()})</span>
      <div class="story-actions">
        <button class="delete-story-btn" title="Xóa truyện">🗑️</button>
      </div>
    `;

    // Chọn truyện để xem/sửa chương
    li.querySelector(".story-select").addEventListener("click", () => {
      selectStory(index);
    });

    // Xóa truyện
    li.querySelector(".delete-story-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      const name = story.title || "truyện";
      if (confirm(`Bạn có muốn xóa "${name}"? Toàn bộ chương sẽ bị xóa.`)) {
        savedStories.splice(index, 1);
        save();
        // nếu đang xem truyện bị xóa -> ẩn phần chapter
        if (selectedStoryIndex === index) {
          selectedStoryIndex = null;
          chapterSection.hidden = true;
        }
        renderStories();
      }
    });

    storyList.appendChild(li);
  });

  // đánh dấu active
  if (selectedStoryIndex != null && savedStories[selectedStoryIndex]) {
    document
      .querySelectorAll("#story-list .story-item")
      .forEach((el) => el.classList.remove("active"));
    const active = document.querySelector(
      `#story-list .story-item[data-index="${selectedStoryIndex}"]`
    );
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
  selectedStoryIntro.textContent = s.intro;
  chapterSection.hidden = false;
  chapterForm.hidden = true; // đóng form khi chuyển truyện
  renderChapters();

  // đánh dấu active
  document
    .querySelectorAll("#story-list .story-item")
    .forEach((el) => el.classList.remove("active"));
  const active = document.querySelector(
    `#story-list .story-item[data-index="${selectedStoryIndex}"]`
  );
  if (active) active.classList.add("active");
}

// ===== Thêm truyện mới =====
postStoryForm.addEventListener("submit", function (e) {
  e.preventDefault();
  const title = document.getElementById("story-title").value.trim();
  const intro = document.getElementById("story-intro").value.trim();
  const createdAt = isoNow();
  if (!title || !intro) return;

  savedStories.unshift({ title, intro, createdAt, chapters: [] });
  save();
  renderStories();
  postStoryForm.reset();

  // tự chọn truyện vừa thêm (ở đầu danh sách)
  selectStory(0);
});

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

    // Link đọc chương + nút sửa/xóa
    li.innerHTML = `
      <div class="chapter-left">
        <div class="chapter-title">
          <a href="./doc-truyen.html?story=${selectedStoryIndex}&chapter=${i}">${chap.title}</a>
        </div>
        <div class="chapter-snippet">${(chap.content || "").slice(0, 120)}${(chap.content || "").length > 120 ? "…" : ""}</div>
      </div>
      <div class="chapter-actions">
        <button class="chapter-edit">Sửa</button>
        <button class="chapter-delete">Xóa</button>
      </div>
    `;

    // Sửa
    li.querySelector(".chapter-edit").addEventListener("click", () => {
      openChapterForm(i);
    });

    // Xóa
    li.querySelector(".chapter-delete").addEventListener("click", () => {
      if (confirm(`Xóa chương "${chap.title}"?`)) {
        story.chapters.splice(i, 1);
        save();
        renderChapters();
      }
    });

    chapterList.appendChild(li);
  });
}

// ===== Toggle danh sách chương =====
toggleChapterList.addEventListener("click", () => {
  chapterList.style.display =
    chapterList.style.display === "none" ? "block" : "none";
});

// ===== Mở form thêm/sửa chương =====
addChapterBtn.addEventListener("click", () => openChapterForm());

function openChapterForm(editIndex = null) {
  const story = savedStories[selectedStoryIndex];
  if (!story) return;

  if (editIndex === null) {
    // Thêm mới
    editIndexInput.value = "";
    chapterTitleInput.value = "";
    chapterContentInput.value = "";
  } else {
    // Sửa
    const ch = story.chapters[editIndex];
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

// ===== Lưu chương (thêm mới hoặc cập nhật) =====
chapterForm.addEventListener("submit", function (e) {
  e.preventDefault();
  const story = savedStories[selectedStoryIndex];
  if (!story) return;

  const title = chapterTitleInput.value.trim();
  const content = chapterContentInput.value.trim();
  if (!title || !content) return;

  const editIdxRaw = editIndexInput.value;
  const isEditing = editIdxRaw !== "";
  if (isEditing) {
    const idx = Number(editIdxRaw);
    if (story.chapters[idx]) {
      story.chapters[idx].title = title;
      story.chapters[idx].content = content;
    }
  } else {
    story.chapters.push({ title, content });
  }

  save();
  renderChapters();

  // reset + đóng form
  chapterForm.hidden = true;
  editIndexInput.value = "";
  chapterTitleInput.value = "";
  chapterContentInput.value = "";
});

// ===== Khởi tạo =====
renderStories();
// Nếu đã có truyện, tự chọn truyện đầu
if (savedStories[0]) selectStory(0);
