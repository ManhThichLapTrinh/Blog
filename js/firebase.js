// js/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider,
  signInWithRedirect, getRedirectResult,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

/* ============== CONFIG ============== */
const firebaseConfig = {
  apiKey: "AIzaSyA7Q7ivZIm3L4w2p7Cwp28PZDPfREv6Er8",
  authDomain: "blog-ab9bb.firebaseapp.com",
  projectId: "blog-ab9bb",
  storageBucket: "blog-ab9bb.firebasestorage.app",
  messagingSenderId: "160345742636",
  appId: "1:160345742636:web:4fc69a7a7d0c7a3e356089",
  measurementId: "G-Y7JGMGGKCT"
};
/* ==================================== */

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
const provider = new GoogleAuthProvider();

const STORAGE_KEY = "storyData";
let unsubscribeCloud = null;

/* ------------- Local helpers ------------- */
function loadLocal() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function saveLocal(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

/* ------------- Sidebar render (nếu có) ------------- */
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

/* ------------- Cloud helpers ------------- */
const userDocRef = (uid) => doc(db, "users", uid);

async function pushCloudIfLoggedIn(stories) {
  saveLocal(stories);
  renderSidebarStories();
  const user = auth.currentUser;
  if (user) {
    await setDoc(userDocRef(user.uid), { stories, updatedAt: serverTimestamp() });
  }
}

/* ========== Public API (CRUD) ========== */
window.getStories = () => loadLocal();
window.saveStories = async (stories) => { await pushCloudIfLoggedIn(stories); return stories; };
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

/* ========== Auth UI ========== */
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

  loginBtn?.addEventListener("click", () => {
    if (auth.currentUser) {
      togglePanel();
    } else {
      signInWithRedirect(auth, provider);
    }
  });
  logoutBtn?.addEventListener("click", async () => { await signOut(auth); closePanel(); });

  document.addEventListener("click", (e) => {
    if (!loginPanel || !loginBtn) return;
    const inside = loginPanel.contains(e.target) || loginBtn.contains(e.target);
    if (!inside) closePanel();
  });

  getRedirectResult(auth).catch(err=>console.error("Login error:",err));

  onAuthStateChanged(auth, async (user) => {
    console.log("[auth state]", user ? "signed in" : "signed out");
    if (user) {
      const name = user.displayName || user.email || "Đã đăng nhập";
      if (loginBtn)  { loginBtn.textContent = `👤 ${name}`; loginBtn.title="Mở tài khoản / đăng xuất"; }
      if (userInfoEl) userInfoEl.textContent = `👤 ${name}`;

      const ref = userDocRef(user.uid);
      const snap= await getDoc(ref);
      const local= loadLocal();
      if (snap.exists() && Array.isArray(snap.data().stories)) {
        saveLocal(snap.data().stories);
      } else if (local.length) {
        await setDoc(ref, { stories: local, updatedAt: serverTimestamp() });
      }

      if (unsubscribeCloud) unsubscribeCloud();
      unsubscribeCloud = onSnapshot(ref, (s)=>{
        if (s.exists() && Array.isArray(s.data().stories)) {
          saveLocal(s.data().stories);
          renderSidebarStories();
        }
      });
    } else {
      if (loginBtn)  { loginBtn.textContent="🔑 Đăng nhập"; loginBtn.title="Đăng nhập Google"; }
      if (userInfoEl) userInfoEl.textContent="👤 User";
      closePanel();
      if (unsubscribeCloud) { unsubscribeCloud(); unsubscribeCloud=null; }
    }
    renderSidebarStories();
  });
});

/* Render lần đầu */
renderSidebarStories();
