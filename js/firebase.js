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
  storageBucket: "blog-ab9bb.firebasestorage.app",
  messagingSenderId: "160345742636",
  appId: "1:160345742636:web:4fc69a7a7d0c7a3e356089",
  measurementId: "G-Y7JGMGGKCT",
};

/* ===== Init ===== */
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);              // dùng getAuth cho web tĩnh
const db   = getFirestore(app);
auth.languageCode = "vi";

// Đảm bảo session được giữ lại sau redirect/popup
setPersistence(auth, browserLocalPersistence).catch(err => {
  console.warn("[auth] setPersistence failed:", err?.code, err?.message);
});

// Provider
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

// 🔔 phát sự kiện để các trang khác (dang-truyen.js) tự refresh
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
  notifyStoriesUpdated(); // 🔔 báo cho trang khác

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

window.addStory = async ({ title, intro = "", chapters = [] }) => {
  const list = loadLocal();
  list.push({
    title: (title||"").trim() || "Truyện không tên",
    intro: (intro||"").trim(),
    chapters: Array.isArray(chapters) ? chapters : [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
  await pushCloudIfLoggedIn(list);
  return list;
};

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

  // Đăng nhập: thử POPUP trước, nếu fail thì REDIRECT
  loginBtn?.addEventListener("click", async () => {
    if (auth.currentUser) {
      togglePanel();
      return;
    }
    try {
      console.log("[login] trying popup…");
      await signInWithPopup(auth, provider);
      console.log("[login] popup success");
    } catch (e) {
      console.warn("[login] popup failed:", e?.code, e?.message);
      console.log("[login] fallback to redirect…");
      try {
        await signInWithRedirect(auth, provider);
      } catch (err) {
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

  // Nhận kết quả sau redirect (log chi tiết)
  getRedirectResult(auth)
    .then(res => {
      if (res?.user) console.log("[login] redirect OK:", res.user.email || res.user.uid);
    })
    .catch(err => console.error("[login] redirect error:", err?.code, err?.message));

  // Cập nhật UI theo trạng thái đăng nhập
  onAuthStateChanged(auth, async (user) => {
    console.log("[auth state]", user ? "signed in" : "signed out");
    console.log('[user uid]', user?.uid);
    console.log('[stories from cloud]', (snap.exists() && snap.data().stories?.length) || 0);


    if (user) {
      const name = user.displayName || user.email || "Đã đăng nhập";
      if (loginBtn)  { loginBtn.textContent = `👤 ${name}`; loginBtn.title="Mở tài khoản / đăng xuất"; }
      if (userInfoEl) userInfoEl.textContent = `👤 ${name}`;

      // Đồng bộ stories
      const ref = userDocRef(user.uid);
      const snap= await getDoc(ref);
      const local= loadLocal();

      if (snap.exists() && Array.isArray(snap.data().stories)) {
        saveLocal(snap.data().stories);
        notifyStoriesUpdated();  // 🔔 đã kéo dữ liệu từ cloud về
      } else if (local.length) {
        await setDoc(ref, { stories: local, updatedAt: serverTimestamp() });
        // sau khi setDoc xong Firestore sẽ bắn onSnapshot, listener bên dưới sẽ notify
      }

      if (unsubscribeCloud) unsubscribeCloud();
      unsubscribeCloud = onSnapshot(ref, (s)=>{
        if (s.exists() && Array.isArray(s.data().stories)) {
          saveLocal(s.data().stories);
          renderSidebarStories();
          notifyStoriesUpdated(); // 🔔 realtime từ cloud
        }
      });

    } else {
      if (loginBtn)  { loginBtn.textContent="🔑 Đăng nhập"; loginBtn.title="Đăng nhập Google"; }
      if (userInfoEl) userInfoEl.textContent="👤 User";
      closePanel();
      if (unsubscribeCloud) { unsubscribeCloud(); unsubscribeCloud=null; }
      renderSidebarStories();
      // signed out thì không phát sự kiện
    }
  });
});

/* Render sidebar lần đầu (nếu có) */
renderSidebarStories();
