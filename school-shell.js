import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { getFirestore, doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDHc7HwBlR6N_GBkpbmMudhN_RZ9P7yqFk",
  authDomain: "donut-grade-portal.firebaseapp.com",
  projectId: "donut-grade-portal",
  storageBucket: "donut-grade-portal.firebasestorage.app",
  messagingSenderId: "154823535840",
  appId: "1:154823535840:web:b25deb1c1f3cb9405cb485"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
const isOwnerPage = page === "owner.html";
const isMaintenancePage = page === "maintenance.html";
let currentProfile = null;
let currentSettings = {
  wipEnabled: false,
  wipMessage: "Donut School is being updated. Please check again later."
};
let authResolved = false;

function isManagementRole(role) {
  return role === "owner" || role === "co-owner";
}

function roleLabel(role) {
  if (role === "owner") return "Owner";
  if (role === "co-owner") return "Co-owner";
  if (role === "admin") return "Administrator";
  return "Student";
}

function activeFor(file) {
  return page === file ? " active" : "";
}

function dispatchSettings() {
  window.dispatchEvent(new CustomEvent("donut-site-settings", { detail: currentSettings }));
}

function redirectToMaintenance() {
  if (!isMaintenancePage) location.replace("./maintenance.html");
}

function enforceAccess() {
  dispatchSettings();

  if (currentSettings.wipEnabled) {
    // Wait until Firebase Authentication and the user's Firestore profile are resolved.
    // This prevents an owner or co-owner being redirected before their role is known.
    if (!authResolved) return;

    // The Owner Controls page must stay reachable while WIP mode is on,
    // even when nobody is signed in yet. owner.html performs its own
    // owner/co-owner permission check after login.
    if (isOwnerPage) return;

    if (isManagementRole(currentProfile?.role)) return;
    redirectToMaintenance();
    return;
  }

  if (isMaintenancePage) {
    location.replace(auth.currentUser ? "./dashboard.html" : "./index.html");
    return;
  }

  if (isOwnerPage && authResolved && !isManagementRole(currentProfile?.role)) {
    location.replace(auth.currentUser ? "./dashboard.html" : "./index.html");
  }
}

function navItems(role) {
  const staff = ["admin", "co-owner", "owner"].includes(role);
  const management = isManagementRole(role);
  const items = [
    ["dashboard.html", "🏫", "Dashboard", true],
    ["index.html", "📊", "Grades", true],
    ["announcements.html", "📢", "Announcements", true],
    ["events.html", "📅", "Events", true],
    ["savelists.html", "💾", "SaveList", true],
    ["accounts.html", "🔑", "Student Accounts", staff],
    ["owner.html", "👑", "Owner", management]
  ];

  return items
    .filter((item) => item[3])
    .map(([file, icon, label]) => `
      <a class="donut-shell-nav-item${activeFor(file)}" href="./${file}">
        <span class="donut-shell-nav-icon">${icon}</span>
        <span>${label}</span>
      </a>
    `)
    .join("");
}

function injectShell(profile) {
  if (!profile || isMaintenancePage || document.getElementById("donutShellSidebar")) return;
  if (document.querySelector(".app-shell .sidebar")) return;

  const name = profile.name || profile.username || "User";
  const initial = name.trim().charAt(0).toUpperCase() || "D";
  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <button class="donut-shell-menu-button" id="donutShellMenuButton" type="button" aria-label="Open school menu">☰</button>
    <aside class="donut-shell-sidebar" id="donutShellSidebar">
      <div class="donut-shell-brand">
        <span class="donut-shell-brand-mark">D</span>
        <span>Donut School</span>
      </div>
      <div class="donut-shell-profile">
        <div class="donut-shell-avatar">${initial}</div>
        <div style="min-width:0">
          <div class="donut-shell-profile-name"></div>
          <div class="donut-shell-profile-role">${roleLabel(profile.role)}</div>
        </div>
      </div>
      <nav class="donut-shell-nav">${navItems(profile.role)}</nav>
      <div class="donut-shell-spacer"></div>
      <div class="donut-shell-footer">
        <button class="donut-shell-refresh" id="donutShellRefresh" type="button">↻ Refresh</button>
        <button class="donut-shell-logout" id="donutShellLogout" type="button">Log Out</button>
      </div>
    </aside>
    <div class="donut-shell-overlay" id="donutShellOverlay"></div>
  `;

  document.body.append(...wrapper.children);
  document.querySelector(".donut-shell-profile-name").textContent = name;
  document.body.classList.add("donut-shell-active");

  const sidebar = document.getElementById("donutShellSidebar");
  const overlay = document.getElementById("donutShellOverlay");
  const open = () => {
    sidebar.classList.add("open");
    overlay.classList.add("open");
  };
  const close = () => {
    sidebar.classList.remove("open");
    overlay.classList.remove("open");
  };

  document.getElementById("donutShellMenuButton").addEventListener("click", open);
  overlay.addEventListener("click", close);
  sidebar.querySelectorAll("a").forEach((link) => link.addEventListener("click", close));
  document.getElementById("donutShellRefresh").addEventListener("click", () => location.reload());
  document.getElementById("donutShellLogout").addEventListener("click", async () => {
    await signOut(auth);
    location.replace("./index.html");
  });
}

onSnapshot(
  doc(db, "settings", "site"),
  (snapshot) => {
    currentSettings = snapshot.exists()
      ? { ...currentSettings, ...snapshot.data() }
      : currentSettings;
    enforceAccess();
  },
  (error) => {
    console.warn("Could not listen for site settings:", error);
  }
);

onAuthStateChanged(auth, async (user) => {
  currentProfile = null;

  if (user) {
    try {
      const profileSnapshot = await getDoc(doc(db, "users", user.uid));
      if (profileSnapshot.exists()) {
        currentProfile = { id: user.uid, ...profileSnapshot.data() };
      }
    } catch (error) {
      console.warn("Could not load shell profile:", error);
    }
  }

  authResolved = true;
  enforceAccess();
  if (currentProfile) injectShell(currentProfile);
  window.dispatchEvent(new CustomEvent("donut-profile-ready", { detail: currentProfile }));
});
