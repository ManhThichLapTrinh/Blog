// js/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider,
  signInWithRedirect, getRedirectResult,
  onAuthStateChanged, signOut,
  setPersistence, browserLocalPersistence,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

// ... giữ nguyên firebaseConfig + init
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
const provider = new GoogleAuthProvider();
// tuỳ chọn: luôn hỏi chọn account
provider.setCustomParameters({ prompt: "select_account" });

// ====== ĐỢI DOM SẴN RỒI MỚI GẮN NÚT ======
document.addEventListener("DOMContentLoaded", () => {
  const loginBtn   = document.getElementById("btn-login");
  const loginPanel = document.getElementById("login-panel");
  const userInfoEl = document.getElementById("user-info");
  const logoutBtn  = document.getElementById("btn-logout");

  const closePanel = () => { if (loginPanel) loginPanel.style.display="none"; };
  const togglePanel= () => {
    if (!loginPanel) return;
    loginPanel.style.display =
      (loginPanel.style.display==="none" || !loginPanel.style.display) ? "block" : "none";
  };

  // ép persistence = local (trước khi sign-in)
  setPersistence(auth, browserLocalPersistence).catch(err => {
    console.warn("[auth] setPersistence failed:", err?.code, err?.message);
  });

  // Nút Đăng nhập / Panel
  loginBtn?.addEventListener("click", async () => {
    if (auth.currentUser) {
      togglePanel();
      return;
    }
    try {
      console.log("[login] trying popup…");
      await signInWithPopup(auth, provider);     // thử popup trước
      console.log("[login] popup success");
    } catch (e) {
      console.warn("[login] popup failed:", e?.code, e?.message);
      console.log("[login] fallback to redirect…");
      try {
        await signInWithRedirect(auth, provider); // fallback redirect
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

  // Click ngoài để đóng panel
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
    if (user) {
      const name = user.displayName || user.email || "Đã đăng nhập";
      if (loginBtn)  { loginBtn.textContent = `👤 ${name}`; loginBtn.title="Mở tài khoản / đăng xuất"; }
      if (userInfoEl) userInfoEl.textContent = `👤 ${name}`;

      // === phần sync Firestore của bạn giữ nguyên ===
      const ref = doc(db, "users", user.uid);
      const snap= await getDoc(ref);
      const local= JSON.parse(localStorage.getItem("storyData")||"[]");
      if (snap.exists() && Array.isArray(snap.data().stories)) {
        localStorage.setItem("storyData", JSON.stringify(snap.data().stories));
      } else if (local.length) {
        await setDoc(ref, { stories: local, updatedAt: serverTimestamp() });
      }
      if (unsubscribeCloud) unsubscribeCloud();
      unsubscribeCloud = onSnapshot(ref, (s)=>{
        if (s.exists() && Array.isArray(s.data().stories)) {
          localStorage.setItem("storyData", JSON.stringify(s.data().stories));
          renderSidebarStories?.();
        }
      });
    } else {
      if (loginBtn)  { loginBtn.textContent="🔑 Đăng nhập"; loginBtn.title="Đăng nhập Google"; }
      if (userInfoEl) userInfoEl.textContent="👤 User";
      closePanel();
      if (unsubscribeCloud) { unsubscribeCloud(); unsubscribeCloud=null; }
      renderSidebarStories?.();
    }
  });
});

// Render lần đầu (nếu có sidebar)
renderSidebarStories?.();
