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
  storageBucket: "blog-ab9bb.firebasestorage.app", // chưa dùng Storage ở bản này
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
// Local getters/setters (KHÔNG đẩy cả mảng lên cloud)
window.getStories = () => loadLocal();
window.saveStories = async (stories) => {
  // Giữ lại để tương thích, nhưng CHỈ lưu local để tránh >1MB
  saveLocal(stories);
  renderSidebarStories();
  notifyStoriesUpdated();
  return stories;
};

/* Upload cover: tuỳ bạn hiện thực (Storage/Cloudinary). Ở đây trả rỗng để UI bỏ qua. */
window.uploadCover = async (file) => {
  console.warn("[uploadCover] Chưa cấu hình Storage/Cloudinary. Trả về ''.");
  return ""; // → UI sẽ dùng base64 local cho preview, không ghi lên cloud
};

/* === Story (Cloud: metadata-only) === */
window.addStory = async ({ title, intro = "", coverUrl = "", createdAt = new Date().toISOString() }) => {
  const user = auth.currentUser;
  if (!user) return { id: null };

  const payload = {
    ownerId: user.uid,
    title: (title||"").trim() || "Truyện không tên",
    intro: (intro||"").trim(),
    coverUrl: coverUrl || "",
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
  if (typeof patch?.coverUrl === "string") safe.coverUrl = patch.coverUrl;
  safe.updatedAt = serverTimestamp();
  await updateDoc(storyDocRef(user.uid, storyId), safe);
};

// Xoá story + toàn bộ chapters (cloud)
window.deleteStory = async (storyId) => {
  const user = auth.currentUser;
  if (!user || !storyId) return;

  // Xoá toàn bộ chapters trước (đơn giản: quét rồi xoá)
  const qs = await getDocs(chaptersCol(user.uid, storyId));
  const tasks = [];
  qs.forEach((d) => tasks.push(deleteDoc(chapterDocRef(user.uid, storyId, d.id))));
  await Promise.allSettled(tasks);

  await deleteDoc(storyDocRef(user.uid, storyId));
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

/* ===== Optional: realtime sync metadata stories -> merge vào local (KHÔNG đè chapters) ===== */
function mergeCloudStoriesIntoLocal(cloudMetas) {
  const local = loadLocal();

  // Map theo id để merge metadata mà giữ nguyên chapters local
  const byIdLocal = new Map();
  local.forEach((s) => { if (s.id) byIdLocal.set(s.id, s); });

  const merged = cloudMetas.map(meta => {
    const cur = meta.id ? byIdLocal.get(meta.id) : null;
    return {
      id: meta.id,
      title: meta.title || cur?.title || "Truyện không tên",
      intro: meta.intro ?? cur?.intro ?? "",
      coverUrl: meta.coverUrl ?? cur?.coverUrl,
      // Nếu có coverUrl thì bỏ cover base64 nặng ở local
      cover: meta.coverUrl ? undefined : cur?.cover,
      createdAt: meta.createdAt || cur?.createdAt || new Date().toISOString(),
      updatedAt: meta.updatedAt || cur?.updatedAt || new Date().toISOString(),
      chapters: Array.isArray(cur?.chapters) ? cur.chapters : []
    };
  });

  // Giữ lại các local stories chưa có trên cloud (user offline tạo)
  const leftover = local.filter(s => !s.id);
  const finalList = [...cloudMetas.length ? merged : [], ...leftover];

  saveLocal(finalList);
  renderSidebarStories();
  notifyStoriesUpdated();
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

  logoutBtn?.addEventListener("click", async () => {
    await signOut(auth);
    closePanel();
  });

  document.addEventListener("click", (e) => {
    if (!loginPanel || !loginBtn) return;
    const inside = loginPanel.contains(e.target) || loginBtn.contains(e.target);
    if (!inside) closePanel();
  });

  getRedirectResult(auth).catch(err =>
    console.error("[login] redirect error:", err?.code, err?.message)
  );

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const name = user.displayName || user.email || "Đã đăng nhập";
      const loginBtnEl = document.getElementById("btn-login");
      const userInfoEl2 = document.getElementById("user-info");
      if (loginBtnEl) { loginBtnEl.textContent = `👤 ${name}`; loginBtnEl.title = "Mở tài khoản / đăng xuất"; }
      if (userInfoEl2) userInfoEl2.textContent = `👤 ${name}`;

      // Tạo hồ sơ user nếu chưa có (nhẹ, chỉ để đánh dấu)
      try {
        const ref = userDocRef(user.uid);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          await setDoc(ref, { createdAt: serverTimestamp() });
        }
      } catch (e) {
        console.warn("[firestore] ensure user doc error:", e?.code, e?.message);
      }

      // Realtime: nghe danh sách stories metadata, merge vào local (giữ chapters local)
      if (unsubscribeCloud) unsubscribeCloud();
      const q = query(storiesColRef(user.uid), orderBy("createdAt", "desc"));
      unsubscribeCloud = onSnapshot(q, (qs) => {
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
