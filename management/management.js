const DOCS = { identity: "Carte d’identité", license: "Permis de conduire", diploma: "Diplôme" };
const notice = document.querySelector("#notice");
let employees = [];
function tell(message, error = false) { notice.textContent = message; notice.classList.toggle("error", error); notice.hidden = !message; }
async function api(url, options = {}) {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...options, headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) } });
  if (response.status === 401) { window.location.assign("/login/?next=" + encodeURIComponent(location.pathname)); throw new Error("Connexion Discord requise."); }
  if (response.status === 403) throw new Error("Accès refusé. Demande à la direction d’ajouter ton identifiant Discord dans Vercel.");
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(({ employee_number_exists: "Cet ID unique est déjà utilisé.", unsupported_file_type: "Format refusé : PDF, JPG, PNG ou WebP uniquement.", file_too_large: "Le fichier dépasse la limite de 4 Mo.", storage_unavailable: "Le stockage est momentanément indisponible." })[data.error] || "Une erreur est survenue. Réessaie.");
  return data;
}
function missing(employee) { return Object.keys(DOCS).filter((key) => !employee.documents?.[key]); }
function safe(text) { const el = document.createElement("span"); el.textContent = text || ""; return el.innerHTML; }
async function load() {
  try {
    const result = await api("/api/management/employees"); employees = result.employees;
    document.querySelectorAll("#director-name").forEach((el) => { el.textContent = "Direction connectée"; });
    if (document.body.dataset.page === "dashboard") renderDashboard(); else renderEmployees();
    tell("");
  } catch (error) { tell(error.message, true); document.querySelector("#employee-rows")?.replaceChildren(); }
}
function renderDashboard() {
  const incomplete = employees.filter((employee) => missing(employee).length);
  document.querySelector("#total-count").textContent = employees.length;
  document.querySelector("#complete-count").textContent = employees.length - incomplete.length;
  document.querySelector("#incomplete-count").textContent = incomplete.length;
  const list = document.querySelector("#reminders");
  list.innerHTML = incomplete.length ? incomplete.slice(0, 8).map((employee) => '<article class="reminder"><i class="reminder-dot"></i><div><strong>' + safe(employee.firstName) + ' ' + safe(employee.lastName) + '</strong><small>À ajouter : ' + missing(employee).map((key) => DOCS[key]).join(", ") + '</small></div><a href="/employees/">Ouvrir le dossier ↗</a></article>').join("") : '<article class="reminder ok"><i class="reminder-dot"></i><div><strong>' + (employees.length ? "Tous les dossiers sont complets." : "Aucun employé enregistré.") + '</strong><small>' + (employees.length ? "Les trois justificatifs sont présents pour chaque membre." : "Ajoute le premier employé pour commencer le suivi.") + '</small></div><a href="/employees/">' + (employees.length ? "Voir les dossiers" : "Ajouter un employé") + ' ↗</a></article>';
}
function docCell(employee, type) {
  const doc = employee.documents?.[type];
  return '<div class="doc-control">' + (doc ? '<span class="doc-status present">Présent</span><button class="file-button" data-action="download" data-id="' + employee.id + '" data-type="' + type + '">Ouvrir ↗</button><button class="icon-button" title="Supprimer le document" data-action="remove-doc" data-id="' + employee.id + '" data-type="' + type + '">×</button>' : '<span class="doc-status">Manquant</span>') + '<label class="file-button">' + (doc ? "Remplacer" : "+ Ajouter") + '<input hidden type="file" data-action="upload" data-id="' + employee.id + '" data-type="' + type + '" accept="application/pdf,image/jpeg,image/png,image/webp"></label></div>';
}
function renderEmployees() {
  const query = (document.querySelector("#search")?.value || "").trim().toLocaleLowerCase("fr");
  const visible = employees.filter((e) => (e.firstName + " " + e.lastName + " " + e.employeeNumber).toLocaleLowerCase("fr").includes(query));
  document.querySelector("#employee-count").textContent = employees.length;
  const tbody = document.querySelector("#employee-rows");
  tbody.innerHTML = visible.length ? visible.map((employee) => {
    const miss = missing(employee);
    return '<tr><td><div class="person-name">' + safe(employee.firstName) + ' ' + safe(employee.lastName) + '</div><div class="person-id">Ajouté le ' + new Date(employee.createdAt).toLocaleDateString("fr-FR") + '</div></td><td><strong>' + safe(employee.employeeNumber) + '</strong></td><td>' + docCell(employee, "identity") + '</td><td>' + docCell(employee, "license") + '</td><td>' + docCell(employee, "diploma") + '</td><td><span class="status-tag ' + (miss.length ? "incomplete" : "complete") + '">' + (miss.length ? miss.length + ' pièce' + (miss.length > 1 ? "s" : "") + ' manquante' + (miss.length > 1 ? "s" : "") : "Complet") + '</span></td><td><button class="remove-link" data-action="delete-employee" data-id="' + employee.id + '">Supprimer</button></td></tr>';
  }).join("") : '<tr class="empty-row"><td colspan="7">' + (employees.length ? "Aucun résultat pour cette recherche." : "Aucun employé pour le moment. Ajoute le premier dossier.") + "</td></tr>";
}
document.querySelector("#search")?.addEventListener("input", renderEmployees);
const dialog = document.querySelector("#employee-dialog");
document.querySelector("#add-employee")?.addEventListener("click", () => dialog.showModal());
document.querySelector(".dialog-close")?.addEventListener("click", () => dialog.close());
document.querySelector(".dialog-cancel")?.addEventListener("click", () => dialog.close());
document.querySelector("#employee-form")?.addEventListener("submit", async (event) => {
  event.preventDefault(); const form = new FormData(event.currentTarget); const button = event.currentTarget.querySelector("[type=submit]"); button.disabled = true;
  try { await api("/api/management/employees", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) }); dialog.close(); event.currentTarget.reset(); tell("Employé ajouté."); await load(); }
  catch (error) { tell(error.message, true); } finally { button.disabled = false; }
});
document.querySelector("#employee-rows")?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]"); if (!button) return;
  const { action, id, type } = button.dataset;
  try {
    if (action === "download") {
      const response = await fetch("/api/management/documents/" + id + "?type=" + type, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("Téléchargement impossible ou accès refusé.");
      const blob = await response.blob(); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "harmony-" + type; a.click(); URL.revokeObjectURL(a.href); return;
    }
    if (action === "remove-doc") { if (!confirm("Supprimer " + DOCS[type].toLowerCase() + " ?")) return; await api("/api/management/documents/" + id + "?type=" + type, { method: "DELETE" }); tell("Document supprimé."); await load(); }
    if (action === "delete-employee") { if (!confirm("Supprimer cet employé et toutes ses pièces ? Cette action est définitive.")) return; await api("/api/management/employees/" + id, { method: "DELETE" }); tell("Dossier employé supprimé."); await load(); }
  } catch (error) { tell(error.message, true); }
});
document.querySelector("#employee-rows")?.addEventListener("change", async (event) => {
  const input = event.target.closest('input[data-action="upload"]'); if (!input || !input.files?.[0]) return;
  const file = input.files[0]; input.disabled = true; tell("Envoi de " + DOCS[input.dataset.type].toLowerCase() + "…");
  try {
    const response = await fetch("/api/management/documents/" + input.dataset.id + "?type=" + input.dataset.type, { method: "PUT", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
    const data = await response.json().catch(() => ({})); if (response.status === 401) { location.assign("/login/"); return; }
    if (!response.ok) throw new Error(({ unsupported_file_type: "Format refusé : PDF, JPG, PNG ou WebP uniquement.", file_too_large: "Le fichier dépasse la limite de 4 Mo." })[data.error] || "Envoi impossible.");
    tell("Document enregistré dans l’espace privé."); await load();
  } catch (error) { tell(error.message, true); } finally { input.disabled = false; input.value = ""; }
});
load();
