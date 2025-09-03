// js/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider,
  setPersistence, browserLocalPersistence,
  onAuthStateChanged,
  signInWithPopup, signInWithRedirect, getRedirectResult,
  signOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot, serverTimestamp,
  collection, addDoc, updateDoc, deleteDoc, getDocs, query, orderBy
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

/* ===== Firebase config ===== */
const firebaseConfig = {
  apiKey: "AIzaSyA7Q7ivZIm3L4w2p7Cwp28PZDPfREv6Er8",
  authDomain: "blog-ab9bb.firebaseapp.com",
  projectId: "blog-ab9bb",
  storageBucket: "blog-ab9bb.firebasestorage.app", // không dùng Storage trong bản base64
  messagingSenderId: "160345742636",
  appId: "1:160345742636:web:4fc69a7a7d0c7a3e356089",
  measurementId: "G-Y7JGMGGKCT",
};

/* ===== Init ===== */
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
auth.languageCode = "vi";

setPersistence(auth, browserLocalPersistence).catch(err => {
  console.warn("[auth] setPersistence failed:", err?.code, err?.message);
});

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

/* ===== Local storage helpers ===== */
const STORAGE_KEY = "storyData";
let unsubscribeCloud = null;

function loadLocal() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function saveLocal(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}
function notifyStoriesUpdated() {
  try { window.dispatchEvent(new CustomEvent("stories-updated")); } catch {}
}

/* ===== UI helper: render sidebar (nếu có) ===== */
function renderSidebarStories() {
  const sidebar = document.querySelector("aside.sidebar");
  if (!sidebar) return;
  const h3 = sidebar.querySelector("h3");
  if (!h3 || !/Truyện đã đăng/i.test(h3.textContent || "")) return;

  let ul = sidebar.querySelector("ul");
  if (!ul) { ul = document.createElement("ul"); sidebar.appendChild(ul); }

  const stories = loadLocal();
  ul.innerHTML = stories.length
    ? stories.map((s,i)=>`<li><a href="./doc-truyen/doc-truyen.html?story=${i}&chapter=0">${s.title||"Truyện không tên"}</a></li>`).join("")
    : "<li>Chưa có truyện nào</li>";
}

/* ===== Firestore paths ===== */
const userDocRef    = (uid) => doc(db, "users", uid);
const storiesColRef = (uid) => collection(db, "users", uid, "stories");
const storyDocRef   = (uid, storyId) => doc(db, "users", uid, "stories", storyId);
const chaptersCol   = (uid, storyId) => collection(db, "users", uid, "stories", storyId, "chapters");
const chapterDocRef = (uid, storyId, chapterId) => doc(db, "users", uid, "stories", storyId, "chapters", chapterId);

/* ===== Public APIs exposed to UI (window.*) ===== */
// Local getters/setters (KHÔNG đẩy cả mảng lên cloud để tránh >1MB)
window.getStories = () => loadLocal();
window.saveStories = async (stories) => {
  saveLocal(stories);
  renderSidebarStories();
  notifyStoriesUpdated();
  return stories;
};

/* === Upload cover: dùng base64, không dùng Storage ===
 * Trả về chuỗi dataURL để UI hiển thị/giữ LOCAL.
 * LƯU Ý: addStory bên dưới sẽ không ghi chuỗi base64 này vào Firestore.
 */
window.uploadCover = async (file) => {
  if (!file) return "";
  // Nếu muốn nén/resize thêm, bạn có thể chuyển qua Canvas; ở đây đọc thẳng base64.
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);         // "data:image/...;base64,...."
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
};

/* === Story (Cloud: metadata-only) === */
window.addStory = async ({ title, intro = "", coverUrl = "", createdAt = new Date().toISOString() }) => {
  const user = auth.currentUser;
  if (!user) return { id: null };

  // 🔒 Không cho coverUrl là base64 ghi vào Firestore
  const sanitizedCoverUrl = (typeof coverUrl === "string" && /^data:image\//i.test(coverUrl)) ? "" : (coverUrl || "");

  const payload = {
    ownerId: user.uid,
    title: (title||"").trim() || "Truyện không tên",
    intro: (intro||"").trim(),
    coverUrl: sanitizedCoverUrl,   // nếu là base64 -> để chuỗi rỗng
    createdAt,
    updatedAt: serverTimestamp()
  };
  const ref = await addDoc(storiesColRef(user.uid), payload);
  return { id: ref.id };
};

// Update metadata story theo id (KHÔNG đụng tới chapters)
window.updateStoryMeta = async (storyId, patch) => {
  const user = auth.currentUser;
  if (!user || !storyId) return;
  const safe = {};
  if (typeof patch?.title === "string")   safe.title = patch.title.trim();
  if (typeof patch?.intro === "string")   safe.intro = patch.intro.trim();
  if (typeof patch?.coverUrl === "string") {
    // cũng chặn base64 khi update
    safe.coverUrl = /^data:image\//i.test(patch.coverUrl) ? "" : patch.coverUrl;
  }
  safe.updatedAt = serverTimestamp();
  await updateDoc(storyDocRef(user.uid, storyId), safe);
};

/* === Delete story (đã vá: kiểm tra chủ sở hữu để tránh 400) === */
window.deleteStory = async (storyId) => {
  const user = auth.currentUser;
  if (!user || !storyId) return;

  const sRef = storyDocRef(user.uid, storyId);

  // Kiểm tra doc tồn tại & thuộc UID hiện tại
  try {
    const snap = await getDoc(sRef);
    if (!snap.exists()) {
      console.warn("[deleteStory] Story không tồn tại dưới users/", user.uid, "/stories/", storyId);
      return;
    }
    const data = snap.data() || {};
    if (data.ownerId && data.ownerId !== user.uid) {
      console.warn("[deleteStory] Khác chủ UID. Bỏ qua xoá cloud.", { ownerId: data.ownerId, uid: user.uid });
      return;
    }
  } catch (e) {
    console.warn("[deleteStory] getDoc lỗi, bỏ qua xoá cloud:", e?.code, e?.message);
    return;
  }

  // Xoá chapters trước (bọc try/catch để không chặn xoá story)
  try {
    const qs = await getDocs(chaptersCol(user.uid, storyId));
    const tasks = [];
    qs.forEach((d) => tasks.push(deleteDoc(chapterDocRef(user.uid, storyId, d.id))));
    await Promise.allSettled(tasks);
  } catch (e) {
    console.warn("[deleteStory] getDocs/delete chapters lỗi (tiếp tục xoá story):", e?.code, e?.message);
  }

  try {
    await deleteDoc(sRef);
  } catch (e) {
    console.warn("[deleteStory] delete story lỗi:", e?.code, e?.message);
  }
};

/* === Chapter (mỗi chapter là 1 document) === */
window.addChapter = async (storyId, { title, content, createdAt, updatedAt }) => {
  const user = auth.currentUser;
  if (!user || !storyId) return { id: null };
  const ref = await addDoc(chaptersCol(user.uid, storyId), {
    title: (title||"").trim() || "Chương mới",
    content: content || "",
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: updatedAt ? updatedAt : serverTimestamp()
  });
  return { id: ref.id };
};

window.updateChapter = async (storyId, chapterId, patch) => {
  const user = auth.currentUser;
  if (!user || !storyId || !chapterId) return;
  const safe = {};
  if (typeof patch?.title === "string")   safe.title = patch.title.trim();
  if (typeof patch?.content === "string") safe.content = patch.content;
  safe.updatedAt = serverTimestamp();
  await updateDoc(chapterDocRef(user.uid, storyId, chapterId), safe);
};

window.deleteChapter = async (storyId, chapterId) => {
  const user = auth.currentUser;
  if (!user || !storyId || !chapterId) return;
  await deleteDoc(chapterDocRef(user.uid, storyId, chapterId));
};

/* ===== Realtime: stories metadata -> merge local (KHÔNG đè chapters) ===== */
function mergeCloudStoriesIntoLocal(cloudMetas) {
  const local = loadLocal();

  const byIdLocal = new Map();
  local.forEach((s) => { if (s.id) byIdLocal.set(s.id, s); });

  const merged = cloudMetas.map(meta => {
    const cur = meta.id ? byIdLocal.get(meta.id) : null;
    return {
      id: meta.id,
      title: meta.title || cur?.title || "Truyện không tên",
      intro: meta.intro ?? cur?.intro ?? "",
      coverUrl: meta.coverUrl ?? cur?.coverUrl,
      // nếu có URL cloud thì bỏ base64 nặng ở local
      cover: meta.coverUrl ? undefined : cur?.cover,
      createdAt: meta.createdAt || cur?.createdAt || new Date().toISOString(),
      updatedAt: meta.updatedAt || cur?.updatedAt || new Date().toISOString(),
      chapters: Array.isArray(cur?.chapters) ? cur.chapters : []
    };
  });

  const leftover = local.filter(s => !s.id);
  const finalList = [...(cloudMetas.length ? merged : []), ...leftover];

  saveLocal(finalList);
  renderSidebarStories();
  notifyStoriesUpdated();
}

/* ==== Migration: local (không id) -> Cloud cho account hiện tại ==== */
async function migrateLocalToCloudForUser(uid) {
  if (!uid) return;

  const MIG_KEY = `migrated_for_${uid}`;
  if (localStorage.getItem(MIG_KEY) === "1") return;

  const local = loadLocal();
  const unsynced = local.filter(s => !s.id);
  if (!unsynced.length) {
    localStorage.setItem(MIG_KEY, "1");
    return;
  }

  for (const s of unsynced) {
    const meta = {
      ownerId: uid,
      title: (s.title || "").trim() || "Truyện không tên",
      intro: (s.intro || "").trim(),
      coverUrl: s.coverUrl || "", // local có thể giữ base64 ở field 'cover' – KHÔNG đẩy
      createdAt: typeof s.createdAt === "string" ? s.createdAt : new Date().toISOString(),
      updatedAt: serverTimestamp(),
    };
    const newStoryRef = await addDoc(storiesColRef(uid), meta);
    s.id = newStoryRef.id;

    if (Array.isArray(s.chapters)) {
      for (const ch of s.chapters) {
        await addDoc(chaptersCol(uid, s.id), {
          title: (ch.title || "").trim() || "Chương mới",
          content: ch.content || "",
          createdAt: ch.createdAt || new Date().toISOString(),
          updatedAt: ch.updatedAt ? ch.updatedAt : serverTimestamp(),
        });
      }
    }
  }

  saveLocal(local);
  notifyStoriesUpdated();
  localStorage.setItem(MIG_KEY, "1");
}

/* ==== Hydrate: tải chapters từ Cloud về local theo story id ==== */
async function hydrateChaptersFromCloud(uid, metaList) {
  if (!uid || !Array.isArray(metaList) || !metaList.length) return;

  const local = loadLocal();
  const byId = new Map(local.map(s => [s.id, s]));
  let changed = false;

  for (const meta of metaList) {
    if (!meta?.id) continue;
    try {
      const qs = await getDocs(query(chaptersCol(uid, meta.id), orderBy("createdAt", "asc")));
      const chapters = [];
      qs.forEach((d) => {
        const data = d.data() || {};
        chapters.push({
          id: d.id,
          title: data.title || "Chương mới",
          content: data.content || "",
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt || new Date().toISOString(),
        });
      });

      const target = byId.get(meta.id);
      if (target) {
        target.chapters = chapters;
        changed = true;
      } else {
        local.unshift({ ...meta, chapters });
        changed = true;
      }
    } catch (e) {
      console.warn("[hydrate] fetch chapters error:", e?.code, e?.message);
    }
  }

  if (changed) {
    saveLocal(local);
    notifyStoriesUpdated();
  }
}

/* ===== Auth UI & state ===== */
document.addEventListener("DOMContentLoaded", () => {
  const loginBtn   = document.getElementById("btn-login");
  const loginPanel = document.getElementById("login-panel");
  const userInfoEl = document.getElementById("user-info");
  const logoutBtn  = document.getElementById("btn-logout");

  const closePanel = () => { if (loginPanel) loginPanel.style.display="none"; };
  const togglePanel= () => {
    if (!loginPanel) return;
    loginPanel.style.display = (loginPanel.style.display==="none" || !loginPanel.style.display) ? "block" : "none";
  };

  // Đăng nhập: popup → fallback redirect
  loginBtn?.addEventListener("click", async () => {
    if (auth.currentUser) { togglePanel(); return; }
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      try { await signInWithRedirect(auth, provider); }
      catch (err) {
        console.error("[login] redirect failed:", err?.code, err?.message);
        alert("Không đăng nhập được: " + (err?.message || err));
      }
    }
  });

  // Đăng xuất
  logoutBtn?.addEventListener("click", async () => {
    await signOut(auth);
    closePanel();
  });

  // Đóng panel khi click ngoài
  document.addEventListener("click", (e) => {
    if (!loginPanel || !loginBtn) return;
    const inside = loginPanel.contains(e.target) || loginBtn.contains(e.target);
    if (!inside) closePanel();
  });

  // Kết quả sau redirect
  getRedirectResult(auth).catch(err =>
    console.error("[login] redirect error:", err?.code, err?.message)
  );

  // Theo dõi trạng thái đăng nhập
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const name = user.displayName || user.email || "Đã đăng nhập";
      const loginBtnEl = document.getElementById("btn-login");
      const userInfoEl2 = document.getElementById("user-info");
      if (loginBtnEl) { loginBtnEl.textContent = `👤 ${name}`; loginBtnEl.title = "Mở tài khoản / đăng xuất"; }
      if (userInfoEl2) userInfoEl2.textContent = `👤 ${name}`;

      // Ensure user doc
      try {
        const ref = userDocRef(user.uid);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          await setDoc(ref, { createdAt: serverTimestamp() });
        }
      } catch (e) {
        console.warn("[firestore] ensure user doc error:", e?.code, e?.message);
      }

      // Migration: đẩy local (không id) lên Cloud
      await migrateLocalToCloudForUser(user.uid);

      // Realtime: nghe danh sách stories metadata -> merge -> hydrate chapters
      if (unsubscribeCloud) unsubscribeCloud();
      const qStories = query(storiesColRef(user.uid), orderBy("createdAt", "desc"));
      unsubscribeCloud = onSnapshot(qStories, (qs) => {
        const metas = [];
        qs.forEach((d) => {
          const data = d.data() || {};
          metas.push({
            id: d.id,
            title: data.title || "Truyện không tên",
            intro: data.intro || "",
            coverUrl: data.coverUrl || "",
            createdAt: typeof data.createdAt === "string" ? data.createdAt : new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        });
        mergeCloudStoriesIntoLocal(metas);
        hydrateChaptersFromCloud(user.uid, metas).catch(err =>
          console.warn("[hydrate] error:", err?.code, err?.message)
        );
      }, (err) => {
        console.warn("[firestore] onSnapshot stories error:", err?.code, err?.message);
      });

    } else {
      const loginBtnEl = document.getElementById("btn-login");
      const userInfoEl2 = document.getElementById("user-info");
      if (loginBtnEl)  { loginBtnEl.textContent = "🔑 Đăng nhập"; loginBtnEl.title = "Đăng nhập Google"; }
      if (userInfoEl2) userInfoEl2.textContent = "👤 User";
      const loginPanelEl = document.getElementById("login-panel");
      if (loginPanelEl) loginPanelEl.style.display = "none";
      if (unsubscribeCloud) { unsubscribeCloud(); unsubscribeCloud = null; }
      renderSidebarStories();
    }
  });
});

/* Render sidebar lần đầu (nếu có) */
renderSidebarStories();

/* Optional: export nếu bạn import từ file khác */
export { app, auth, db };
