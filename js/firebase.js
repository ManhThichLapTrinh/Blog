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
  getFirestore, doc, getDoc, setDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

/* ===== Firebase config ===== */
const firebaseConfig = {
  apiKey: "AIzaSyA7Q7ivZIm3L4w2p7Cwp28PZDPfREv6Er8",
  authDomain: "blog-ab9bb.firebaseapp.com",
  projectId: "blog-ab9bb",
  storageBucket: "blog-ab9bb.firebasestorage.app", // không dùng Storage ở bản free, vẫn để nguyên
  messagingSenderId: "160345742636",
  appId: "1:160345742636:web:4fc69a7a7d0c7a3e356089",
  measurementId: "G-Y7JGMGGKCT",
};

/* ===== Init ===== */
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
auth.languageCode = "vi";

// Giữ phiên đăng nhập
setPersistence(auth, browserLocalPersistence).catch(err => {
  console.warn("[auth] setPersistence failed:", err?.code, err?.message);
});

// Google provider
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

/* ===== Local helpers ===== */
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

/* ===== Sidebar render (nếu có) ===== */
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

/* ===== Cloud helpers ===== */
const userDocRef = (uid) => doc(db, "users", uid);

async function pushCloudIfLoggedIn(stories) {
  // luôn cập nhật local + UI
  saveLocal(stories);
  renderSidebarStories();
  notifyStoriesUpdated();

  const user = auth.currentUser;
  if (user) {
    await setDoc(userDocRef(user.uid), { stories, updatedAt: serverTimestamp() });
  }
}

/* ===== Public API (gắn lên window) ===== */
window.getStories = () => loadLocal();

window.saveStories = async (stories) => {
  await pushCloudIfLoggedIn(stories);
  return stories;
};

/* ✅ FIX: lưu cả cover (base64/URL) khi thêm truyện */
window.addStory = async ({ title, intro = "", cover = "", chapters = [] }) => {
  const list = loadLocal();
  list.push({
    title: (title||"").trim() || "Truyện không tên",
    intro: (intro||"").trim(),
    cover: cover || "",                // <— thêm dòng này
    chapters: Array.isArray(chapters) ? chapters : [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
  await pushCloudIfLoggedIn(list);
  return list;
};

/* Cho phép cập nhật bất kỳ trường nào (kể cả cover) */
window.updateStory = async (index, patch) => {
  const list = loadLocal();
  if (!list[index]) return list;
  list[index] = { ...list[index], ...patch, updatedAt: Date.now() };
  await pushCloudIfLoggedIn(list);
  return list;
};

window.deleteStory = async (index) => {
  const list = loadLocal();
  if (index<0 || index>=list.length) return list;
  list.splice(index,1);
  await pushCloudIfLoggedIn(list);
  return list;
};

/* ===== Auth UI (đợi DOM sẵn) ===== */
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

  // Click ngoài panel để đóng
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

      const ref = userDocRef(user.uid);
      let snap = null;
      try { snap = await getDoc(ref); }
      catch (e) { console.error("[firestore] getDoc error:", e?.code, e?.message); }

      const local = loadLocal();

      if (snap && snap.exists() && Array.isArray(snap.data().stories)) {
        const cloudStories = snap.data().stories || [];
        saveLocal(cloudStories);
        renderSidebarStories();
        window.dispatchEvent(new Event("stories-updated"));
      } else if (local.length) {
        await setDoc(ref, { stories: local, updatedAt: serverTimestamp() });
      }

      if (unsubscribeCloud) unsubscribeCloud();
      unsubscribeCloud = onSnapshot(ref, (s) => {
        const arr = (s.exists() && Array.isArray(s.data().stories)) ? s.data().stories : [];
        saveLocal(arr);
        renderSidebarStories();
        window.dispatchEvent(new Event("stories-updated"));
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
