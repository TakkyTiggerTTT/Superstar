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
  wipMessage: "Superstar School is being updated. Please check again later."
};
let authResolved = false;
let profileResolved = false;
let unsubscribeProfile = null;

function isManagementRole(role) {
  return role === "owner" || role === "co-owner";
}

function isStaffRole(role) {
  return role === "admin" || role === "co-owner" || role === "owner";
}

function roleLabel(role) {
  if (role === "owner") return "Owner";
  if (role === "co-owner") return "Co-owner";
  if (role === "admin") return "Administrator";
  return "Student";
}

function applyTheme() {
  const accent = currentSettings.accentColor || "#ffb74d";
  const mode = currentSettings.themeMode || "dark";
  document.documentElement.style.setProperty("--accent", accent);
  document.documentElement.style.setProperty("--accentText", "#251500");
  document.documentElement.style.setProperty("--accent-text", "#251500");
  document.documentElement.style.setProperty("--donut-shell-accent", accent);
  document.documentElement.style.setProperty("--donut-shell-accent-text", "#251500");
  document.body?.classList.toggle("superstar-light-theme", mode === "light");
}

function applyAvatar(el, profile) {
  if (!el) return;
  const name = profile?.name || profile?.username || "User";
  const initial = name.trim().charAt(0).toUpperCase() || "S";
  const photo = profile?.photoDataUrl || profile?.photoUrl || "";
  if (photo) {
    el.textContent = "";
    el.style.backgroundImage = `url("${String(photo).replaceAll('"', '%22')}")`;
    el.style.backgroundSize = "cover";
    el.style.backgroundPosition = "center";
  } else {
    el.style.backgroundImage = "";
    el.textContent = initial;
  }
}


function activeFor(file) {
  return page === file ? " active" : "";
}

function navItems(role) {
  const staff = isStaffRole(role);
  const management = isManagementRole(role);
  const items = [
    ["dashboard.html", "🏫", "Dashboard", true],
    ["index.html", "📊", "Grades", true],
    ["announcements.html", "📢", "Announcements", true],
    ["events.html", "📅", "Events", true],
    ["quiz.html", "📝", "Quizzes", true],
    ["notifications.html", "🔔", "Notifications", true],
    ["profile.html", "👤", "Profile", true],
    ["leaderboard.html", "🏆", "Leaderboard", true],
    ["savelists.html", "💾", "SaveList", true],
    ["accounts.html", "🔑", "Student Accounts", staff],
    ["activity.html", "🧾", "Activity Log", management],
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

function dispatchSettings() {
  window.dispatchEvent(new CustomEvent("donut-site-settings", {
    detail: currentSettings
  }));
}

function dispatchProfile() {
  window.dispatchEvent(new CustomEvent("donut-profile-ready", {
    detail: currentProfile
  }));
}

function redirectToMaintenance() {
  if (!isMaintenancePage) {
    location.replace("./maintenance.html");
  }
}

function enforceAccess() {
  dispatchSettings();

  if (currentSettings.wipEnabled) {
    if (!authResolved) return;

    // owner.html must stay open so owners/co-owners can sign in and disable WIP.
    if (isOwnerPage) return;

    // If a signed-in user is still loading, do not redirect yet.
    // This prevents owners/co-owners from being bounced to maintenance/dashboard before their role is read.
    if (auth.currentUser && !profileResolved) return;

    // Owners and co-owners may still access the site while WIP mode is on.
    if (isManagementRole(currentProfile?.role)) return;

    redirectToMaintenance();
    return;
  }

  // If WIP is off, maintenance page should leave automatically.
  if (isMaintenancePage) {
    location.replace(auth.currentUser ? "./dashboard.html" : "./index.html");
    return;
  }

  // Signed-out users must be able to open owner.html so they can log in.
  // Signed-in non-owner users should not access owner.html.
  if (
    isOwnerPage &&
    authResolved &&
    profileResolved &&
    auth.currentUser &&
    !isManagementRole(currentProfile?.role)
  ) {
    location.replace("./dashboard.html");
  }
}

function removeShell() {
  document.getElementById("donutShellMenuButton")?.remove();
  document.getElementById("donutShellSidebar")?.remove();
  document.getElementById("donutShellOverlay")?.remove();
  document.body.classList.remove("donut-shell-active");
}

function updateShell(profile) {
  if (!profile || isMaintenancePage) {
    removeShell();
    return;
  }

  let sidebar = document.getElementById("donutShellSidebar");

  if (!sidebar) {
    injectShell(profile);
    return;
  }

  const name = profile.name || profile.username || "User";
  const initial = name.trim().charAt(0).toUpperCase() || "S";

  const avatar = sidebar.querySelector(".donut-shell-avatar");
  const profileName = sidebar.querySelector(".donut-shell-profile-name");
  const profileRole = sidebar.querySelector(".donut-shell-profile-role");
  const nav = sidebar.querySelector(".donut-shell-nav");

  applyAvatar(avatar, profile);
  if (profileName) profileName.textContent = name;
  if (profileRole) profileRole.textContent = roleLabel(profile.role);
  if (nav) {
    nav.innerHTML = navItems(profile.role);
    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", closeShell);
    });
  }

  document.body.classList.add("donut-shell-active");
}

function openShell() {
  document.getElementById("donutShellSidebar")?.classList.add("open");
  document.getElementById("donutShellOverlay")?.classList.add("open");
}

function closeShell() {
  document.getElementById("donutShellSidebar")?.classList.remove("open");
  document.getElementById("donutShellOverlay")?.classList.remove("open");
}

function injectShell(profile) {
  if (!profile || isMaintenancePage) return;
  if (document.querySelector(".app-shell .sidebar")) return;

  removeShell();

  const name = profile.name || profile.username || "User";
  const initial = name.trim().charAt(0).toUpperCase() || "S";
  const wrapper = document.createElement("div");

  wrapper.innerHTML = `
    <button class="donut-shell-menu-button" id="donutShellMenuButton" type="button" aria-label="Open school menu">☰</button>
    <aside class="donut-shell-sidebar" id="donutShellSidebar">
      <div class="donut-shell-brand">
        <span class="donut-shell-brand-mark">S</span>
        <span>Superstar School</span>
      </div>

      <div class="donut-shell-profile">
        <div class="donut-shell-avatar"></div>
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
  applyAvatar(document.querySelector(".donut-shell-avatar"), profile);
  document.body.classList.add("donut-shell-active");

  document.getElementById("donutShellMenuButton")?.addEventListener("click", openShell);
  document.getElementById("donutShellOverlay")?.addEventListener("click", closeShell);
  document.querySelectorAll(".donut-shell-nav a").forEach((link) => {
    link.addEventListener("click", closeShell);
  });

  document.getElementById("donutShellRefresh")?.addEventListener("click", () => {
    location.reload();
  });

  document.getElementById("donutShellLogout")?.addEventListener("click", async () => {
    await logoutEverywhere();
  });
}

async function logoutEverywhere() {
  await signOut(auth).catch(() => {});
  currentProfile = null;
  removeShell();
  dispatchProfile();

  // When logout happens from any subpage, return to login page.
  if (page !== "index.html") {
    location.replace("./index.html");
  }
}

function listenToProfile(user) {
  if (unsubscribeProfile) {
    unsubscribeProfile();
    unsubscribeProfile = null;
  }

  if (!user) {
    profileResolved = true;
    currentProfile = null;
    updateShell(null);
    enforceAccess();
    dispatchProfile();
    return;
  }

  profileResolved = false;

  unsubscribeProfile = onSnapshot(
    doc(db, "users", user.uid),
    async (snapshot) => {
      profileResolved = true;

      if (!snapshot.exists()) {
        currentProfile = null;
        updateShell(null);
        dispatchProfile();
        await signOut(auth).catch(() => {});
        if (page !== "index.html") location.replace("./index.html");
        return;
      }

      currentProfile = {
        id: user.uid,
        ...snapshot.data()
      };

      updateShell(currentProfile);
      enforceAccess();
      dispatchProfile();
    },
    async (error) => {
      console.warn("Could not listen for shell profile:", error);
      profileResolved = true;
      currentProfile = null;
      updateShell(null);
      dispatchProfile();
    }
  );
}

onSnapshot(
  doc(db, "settings", "site"),
  (snapshot) => {
    currentSettings = snapshot.exists()
      ? { ...currentSettings, ...snapshot.data() }
      : currentSettings;

    applyTheme();
    enforceAccess();
  },
  (error) => {
    console.warn("Could not listen for site settings:", error);
  }
);

onAuthStateChanged(auth, (user) => {
  authResolved = true;
  profileResolved = false;
  listenToProfile(user);
});

applyTheme();

// Let page code ask the shell to refresh without reloading the page.
window.DonutShell = {
  get auth() {
    return auth;
  },
  get profile() {
    return currentProfile;
  },
  get settings() {
    return currentSettings;
  },
  refresh() {
    updateShell(currentProfile);
    enforceAccess();
    dispatchProfile();
  },
  logout: logoutEverywhere
};

// Keep the sidebar correct when returning to the tab after signing in/out elsewhere.
window.addEventListener("pageshow", () => {
  updateShell(currentProfile);
  enforceAccess();
});

window.addEventListener("focus", () => {
  updateShell(currentProfile);
  enforceAccess();
});
