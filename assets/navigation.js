const SITE_TABS = [
  { key: "dashboard", label: "Vue d’ensemble", href: "/management/" },
  { key: "employees", label: "Employés", href: "/employees/" },
  { key: "contracts", label: "Contrats", href: "/contracts/" },
  { key: "services", label: "Partenaires", href: "/services/" },
  { key: "directors", label: "Accès", href: "/directors/" },
];

async function loadSiteAccess() {
  const navs = [...document.querySelectorAll("[data-site-navigation]")];
  try {
    const response = await fetch("/api/management/employees?resource=access", {
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (response.status === 401) {
      location.assign("/login/?next=" + encodeURIComponent(location.pathname));
      return null;
    }
    if (response.status === 403) {
      for (const nav of navs) nav.textContent = "Accès employé requis";
      return null;
    }
    if (!response.ok) throw new Error("site_access_unavailable");
    const access = await response.json();
    const allowedTabs = new Set(access.tabs || []);
    const visibleTabs = SITE_TABS.filter((tab) => allowedTabs.has(tab.key));
    for (const nav of navs) {
      nav.replaceChildren(...visibleTabs.map(({ label, href }) => {
        const link = document.createElement("a");
        link.href = href;
        link.textContent = label;
        const currentPath = location.pathname.replace(/\/+$/, "") || "/";
        if (currentPath === href.replace(/\/+$/, "") || currentPath === "/" && href === "/management/") {
          link.classList.add("active");
          link.setAttribute("aria-current", "page");
        }
        return link;
      }));
    }
    document.querySelectorAll("#director-name").forEach((element) => {
      element.textContent = access.user?.name || access.role || "Connecté";
    });
    const currentPath = location.pathname.replace(/\/+$/, "") || "/";
    const currentTab = SITE_TABS.find((tab) => tab.href.replace(/\/+$/, "") === currentPath);
    if (currentTab && !allowedTabs.has(currentTab.key) && visibleTabs.length) location.replace(visibleTabs[0].href);
    return access;
  } catch {
    for (const nav of navs) nav.textContent = "Accès momentanément indisponible";
    return null;
  }
}

window.siteAccessReady = loadSiteAccess();
window.addEventListener("harmony:refresh", (event) => {
  if (["local-change", "another-tab", "tab-visible", "periodic-sync"].includes(event.detail?.source)) loadSiteAccess();
});
