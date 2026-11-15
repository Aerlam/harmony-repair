const SITE_TABS = [
  { label: "Vue d’ensemble", href: "/management/" },
  { label: "Employés", href: "/employees/" },
  { label: "Contrats", href: "/contracts/" },
  { label: "Partenaires", href: "/services/" },
  { label: "Accès", href: "/directors/" },
];

const currentPath = location.pathname.replace(/\/+$/, "") || "/";
document.querySelectorAll("[data-site-navigation]").forEach((navigation) => {
  navigation.replaceChildren(...SITE_TABS.map(({ label, href }) => {
    const link = document.createElement("a");
    link.href = href;
    link.textContent = label;
    if (currentPath === href.replace(/\/+$/, "") || currentPath === "/" && href === "/management/") {
      link.classList.add("active");
      link.setAttribute("aria-current", "page");
    }
    return link;
  }));
});
