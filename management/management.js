const DOCS = { identity: "Carte d’identité", license: "Permis de conduire", diploma: "Diplôme", contract: "Contrat" };
const ROLE_LABELS = { Patron: "Patron", "Co-patron": "Co-patronne", DRH: "DRH", RH: "RH", "Chef d’atelier": "Cheffe d’atelier", "Mécano confirmé": "Mécano confirmé", "Mécano apprenti": "Mécano apprenti", Stagiaire: "Stagiaire" };
const ROLE_ORDER = ["Patron", "Co-patron", "DRH", "RH", "Chef d’atelier", "Mécano confirmé", "Mécano apprenti", "Stagiaire"];
const CONTRACT_CATEGORIES = { entreprise: "Entreprise", famille: "Famille", groupe: "Groupe" };
const CONTRACT_SERVICES = { repair: "Réparation", impound: "Fourrière", displacement: "Déplacement" };
const notice = document.querySelector("#notice");
let employees = [];
let contracts = [];
let currentRole = "director";
let editingEmployeeId = null;
let editingContractId = null;
function tell(message, error = false) { notice.textContent = message; notice.classList.toggle("error", error); notice.hidden = !message; }
async function api(url, options = {}) {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...options, headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) } });
  if (response.status === 401) { window.location.assign("/login/?next=" + encodeURIComponent(location.pathname)); throw new Error("Connexion Discord requise."); }
  if (response.status === 403) throw new Error("Accès refusé. Seuls les comptes autorisés par l’admin peuvent ouvrir cette page.");
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(({ invalid_employee: "Vérifie les informations saisies, notamment l’ID Discord et le rôle.", employee_number_exists: "Cet ID unique est déjà utilisé.", employee_discord_id_exists: "Cet ID Discord est déjà associé à un autre employé.", invalid_contract: "Saisis un nom, une catégorie et au moins une prestation.", contract_exists: "Un contrat de cette catégorie porte déjà ce nom.", unsupported_file_type: "Format refusé : PDF, JPG, PNG ou WebP uniquement.", file_too_large: "Le fichier dépasse la limite de 4 Mo.", storage_unavailable: "Le stockage est momentanément indisponible." })[data.error] || "Une erreur est survenue. Réessaie.");
  return data;
}
function hasDocument(employee, type) {
  if (type === "diploma") return Array.isArray(employee.documents?.diplomas) ? employee.documents.diplomas.length > 0 : Boolean(employee.documents?.diploma);
  return Boolean(employee.documents?.[type]);
}
function missing(employee) { return Object.keys(DOCS).filter((key) => !hasDocument(employee, key)); }
function safe(text) { const el = document.createElement("span"); el.textContent = text || ""; return el.innerHTML; }
async function load() {
  if (document.body.dataset.page === "contracts") { await loadContracts(); return; }
  try {
    const result = await api("/api/management/employees"); employees = result.employees; currentRole = result.role;
    document.querySelectorAll("#director-name").forEach((el) => { el.textContent = "Direction connectée"; });
    document.querySelectorAll(".admin-link").forEach((link) => { link.hidden = currentRole !== "admin"; });
    if (document.body.dataset.page === "dashboard") renderDashboard(); else if (document.body.dataset.page === "employees") renderEmployees(); else await loadDirectors();
    tell("");
  } catch (error) { tell(error.message, true); document.querySelector("#employee-list")?.replaceChildren(); }
}
function renderDashboard() {
  const incomplete = employees.filter((employee) => missing(employee).length);
  document.querySelector("#total-count").textContent = employees.length;
  document.querySelector("#complete-count").textContent = employees.length - incomplete.length;
  document.querySelector("#incomplete-count").textContent = incomplete.length;
  const list = document.querySelector("#reminders");
  list.innerHTML = incomplete.length ? incomplete.slice(0, 8).map((employee) => '<article class="reminder"><i class="reminder-dot"></i><div><strong>' + safe(employee.firstName) + ' ' + safe(employee.lastName) + '</strong><small>À ajouter : ' + missing(employee).map((key) => DOCS[key]).join(", ") + '</small></div><a href="/employees/">Ouvrir le dossier ↗</a></article>').join("") : '<article class="reminder ok"><i class="reminder-dot"></i><div><strong>' + (employees.length ? "Tous les dossiers sont complets." : "Aucun employé enregistré.") + '</strong><small>' + (employees.length ? "Toutes les pièces requises sont présentes pour chaque membre." : "Ajoute le premier employé pour commencer le suivi.") + '</small></div><a href="/employees/">' + (employees.length ? "Voir les dossiers" : "Ajouter un employé") + ' ↗</a></article>';
}
function renderContracts() {
  const list = document.querySelector("#contract-list");
  list.innerHTML = contracts.length ? contracts.map((contract) => {
    const serviceLabels = contract.services.map((service) => CONTRACT_SERVICES[service]).filter(Boolean);
    const services = serviceLabels.map((label) => '<span class="service-pill">' + safe(label) + '</span>').join("");
    const date = contract.updatedAt || contract.createdAt;
    return '<article class="contract-card"><div class="contract-card-main"><div class="contract-kind">' + safe(CONTRACT_CATEGORIES[contract.category] || "Groupe") + '</div><h3>' + safe(contract.name) + '</h3><div class="contract-services">' + services + '</div><small class="contract-date">Mis à jour le ' + (date ? new Date(date).toLocaleDateString("fr-FR") : "—") + '</small></div><div class="contract-actions"><button class="edit-link" type="button" data-action="edit-contract" data-id="' + safe(contract.id) + '">Modifier</button><button class="remove-link" type="button" data-action="delete-contract" data-id="' + safe(contract.id) + '">Supprimer</button></div></article>';
  }).join("") : '<div class="empty-row">Aucun contrat enregistré. Ajoute le premier groupe ci-dessus.</div>';
  document.querySelector("#contract-count").textContent = contracts.length;
}
function resetContractForm() {
  const form = document.querySelector("#contract-form");
  if (!form) return;
  editingContractId = null;
  form.reset();
  document.querySelector("#contract-form-title").textContent = "Ajouter un contrat";
  document.querySelector("#contract-submit-label").textContent = "Enregistrer le contrat";
  document.querySelector("#contract-cancel").hidden = true;
}
async function loadContracts() {
  try {
    const result = await api("/api/management/employees?resource=contracts");
    contracts = result.contracts;
    currentRole = result.role;
    document.querySelectorAll("#director-name").forEach((el) => { el.textContent = "Direction connectée"; });
    document.querySelectorAll(".admin-link").forEach((link) => { link.hidden = currentRole !== "admin"; });
    renderContracts();
    tell("");
  } catch (error) { tell(error.message, true); document.querySelector("#contract-list")?.replaceChildren(); }
}
document.querySelector("#contract-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form));
  payload.services = new FormData(form).getAll("services");
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    const isEditing = Boolean(editingContractId);
    const endpoint = isEditing ? "/api/management/employees/" + encodeURIComponent(editingContractId) + "?resource=contracts" : "/api/management/employees?resource=contracts";
    await api(endpoint, { method: isEditing ? "PATCH" : "POST", body: JSON.stringify(payload) });
    resetContractForm();
    await loadContracts();
    tell(isEditing ? "Contrat mis à jour." : "Contrat ajouté.");
  } catch (error) { tell(error.message, true); }
  finally { button.disabled = false; }
});
document.querySelector("#contract-cancel")?.addEventListener("click", resetContractForm);
document.querySelector("#contract-list")?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const contract = contracts.find((item) => item.id === button.dataset.id);
  if (!contract) return;
  if (button.dataset.action === "edit-contract") {
    editingContractId = contract.id;
    const form = document.querySelector("#contract-form");
    form.elements.name.value = contract.name;
    form.elements.category.value = contract.category;
    for (const checkbox of form.querySelectorAll('input[name="services"]')) checkbox.checked = contract.services.includes(checkbox.value);
    document.querySelector("#contract-form-title").textContent = "Modifier le contrat";
    document.querySelector("#contract-submit-label").textContent = "Enregistrer les changements";
    document.querySelector("#contract-cancel").hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    form.elements.name.focus();
    return;
  }
  if (button.dataset.action === "delete-contract") {
    if (!confirm("Supprimer le contrat de « " + contract.name + " » ?")) return;
    try { await api("/api/management/employees/" + encodeURIComponent(contract.id) + "?resource=contracts", { method: "DELETE" }); await loadContracts(); tell("Contrat supprimé."); }
    catch (error) { tell(error.message, true); }
  }
});
function docCell(employee, type) {
  if (type === "diploma") {
    const docs = Array.isArray(employee.documents?.diplomas) ? employee.documents.diplomas : employee.documents?.diploma?.pathname ? [employee.documents.diploma] : [];
    const rows = docs.map((doc, index) => {
      const documentId = safe(doc.id || "");
      return '<div class="doc-row"><span class="doc-status present">Diplôme ' + (index + 1) + '</span><button class="file-button" type="button" data-action="preview" data-id="' + employee.id + '" data-type="diploma" data-document-id="' + documentId + '">Aperçu</button><button class="file-button" type="button" data-action="download" data-id="' + employee.id + '" data-type="diploma" data-document-id="' + documentId + '">Ouvrir ↗</button><button class="icon-button" type="button" title="Supprimer ce diplôme" data-action="remove-doc" data-id="' + employee.id + '" data-type="diploma" data-document-id="' + documentId + '">×</button></div>';
    }).join("");
  return '<div class="doc-list">' + (rows || '<span class="doc-status">Aucun diplôme</span>') + '<label class="file-button">+ Ajouter diplôme<input hidden type="file" data-action="upload" data-id="' + employee.id + '" data-type="diploma" accept="application/pdf,image/jpeg,image/png,image/webp"></label></div>';
  }
  const doc = employee.documents?.[type];
  return '<div class="doc-control">' + (doc ? '<span class="doc-status present">Présent</span><button class="file-button" type="button" data-action="preview" data-id="' + employee.id + '" data-type="' + type + '">Aperçu</button><button class="file-button" type="button" data-action="download" data-id="' + employee.id + '" data-type="' + type + '">Ouvrir ↗</button><button class="icon-button" type="button" title="Supprimer le document" data-action="remove-doc" data-id="' + employee.id + '" data-type="' + type + '">×</button>' : '<span class="doc-status">Manquant</span>') + '<label class="file-button">' + (doc ? "Remplacer" : "+ Ajouter") + '<input hidden type="file" data-action="upload" data-id="' + employee.id + '" data-type="' + type + '" accept="application/pdf,image/jpeg,image/png,image/webp"></label></div>';
}
function renderEmployees() {
  const query = (document.querySelector("#search")?.value || "").trim().toLocaleLowerCase("fr");
  const visible = employees.filter((e) => (e.firstName + " " + e.lastName + " " + e.employeeNumber + " " + (e.discordId || "") + " " + (e.garageRole || "")).toLocaleLowerCase("fr").includes(query)).sort((a, b) => {
    const rankA = ROLE_ORDER.indexOf(a.garageRole);
    const rankB = ROLE_ORDER.indexOf(b.garageRole);
    return (rankA < 0 ? ROLE_ORDER.length : rankA) - (rankB < 0 ? ROLE_ORDER.length : rankB) || (a.lastName || "").localeCompare(b.lastName || "", "fr") || (a.firstName || "").localeCompare(b.firstName || "", "fr");
  });
  document.querySelector("#employee-count").textContent = employees.length;
  const list = document.querySelector("#employee-list");
  const expandedIds = new Set([...list.querySelectorAll(".employee-card[open]")].map((card) => card.dataset.id));
  list.innerHTML = visible.length ? visible.map((employee) => {
    const miss = missing(employee);
    const initials = safe(((employee.firstName || "")[0] || "") + ((employee.lastName || "")[0] || "")).toLocaleUpperCase("fr");
    const date = employee.createdAt ? new Date(employee.createdAt).toLocaleDateString("fr-FR") : "—";
    const expanded = expandedIds.has(employee.id) ? " open" : "";
    const roleLabel = ROLE_LABELS[employee.garageRole] || employee.garageRole || "À définir";
    return '<details class="employee-card" data-id="' + employee.id + '"' + expanded + '><summary class="employee-summary"><span class="employee-identity"><span class="employee-avatar" aria-hidden="true">' + initials + '</span><span class="employee-name-block"><strong>' + safe(employee.firstName) + ' ' + safe(employee.lastName) + '</strong><small>ID unique · ' + safe(employee.employeeNumber) + '</small></span></span><span class="employee-summary-role"><small>Grade</small><strong class="role-pill">' + safe(roleLabel) + '</strong></span><span class="status-tag ' + (miss.length ? "incomplete" : "complete") + '">' + (miss.length ? miss.length + ' pièce' + (miss.length > 1 ? "s" : "") + ' à compléter' : "Dossier complet") + '</span><span class="employee-chevron" aria-hidden="true">⌄</span></summary><div class="employee-details"><div class="employee-detail-bar"><span class="employee-subtitle">Ajouté le ' + date + '</span><div class="employee-head-actions"><button class="edit-link" type="button" data-action="edit-employee" data-id="' + employee.id + '">Modifier la fiche</button><button class="remove-link" type="button" data-action="delete-employee" data-id="' + employee.id + '">Supprimer</button></div></div><div class="employee-meta"><div><span>ID unique</span><strong>' + safe(employee.employeeNumber) + '</strong></div><div><span>ID Discord</span><strong>' + safe(employee.discordId || "À renseigner") + '</strong></div><div><span>Rôle dans la société</span><strong class="role-pill">' + safe(roleLabel) + '</strong></div></div><div class="employee-documents"><section class="employee-document"><h4>Carte d’identité</h4>' + docCell(employee, "identity") + '</section><section class="employee-document"><h4>Permis de conduire</h4>' + docCell(employee, "license") + '</section><section class="employee-document"><h4>Diplômes</h4>' + docCell(employee, "diploma") + '</section><section class="employee-document"><h4>Contrat</h4>' + docCell(employee, "contract") + '</section></div></div></details>';
  }).join("") : '<div class="empty-row">' + (employees.length ? "Aucun résultat pour cette recherche." : "Aucun employé pour le moment. Ajoute le premier dossier.") + "</div>";
}
document.querySelector("#search")?.addEventListener("input", renderEmployees);
const dialog = document.querySelector("#employee-dialog");
const employeeForm = document.querySelector("#employee-form");
const employeeSubmitLabel = document.querySelector("#employee-submit-label");
function setEmployeeFormMode(employee = null) {
  editingEmployeeId = employee?.id || null;
  employeeForm.reset();
  const formNotice = document.querySelector("#employee-form-notice");
  formNotice.textContent = "";
  formNotice.hidden = true;
  document.querySelector("#employee-form-eyebrow").textContent = employee ? "MODIFICATION DU DOSSIER" : "NOUVEAU DOSSIER";
  document.querySelector("#employee-dialog-title").textContent = employee ? "Modifier la fiche" : "Ajouter un employé";
  employeeSubmitLabel.textContent = employee ? "Enregistrer les changements" : "Enregistrer";
  if (employee) for (const key of ["firstName", "lastName", "employeeNumber", "discordId", "garageRole"]) employeeForm.elements[key].value = employee[key] || "";
}
document.querySelector("#add-employee")?.addEventListener("click", () => { setEmployeeFormMode(); dialog.showModal(); });
document.querySelector(".dialog-close")?.addEventListener("click", () => dialog.close());
document.querySelector(".dialog-cancel")?.addEventListener("click", () => dialog.close());
dialog?.addEventListener("close", () => setEmployeeFormMode());
document.querySelector("#employee-form")?.addEventListener("submit", async (event) => {
  event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); const button = formElement.querySelector("[type=submit]"); button.disabled = true;
  try {
    const isEditing = Boolean(editingEmployeeId);
    const endpoint = isEditing ? "/api/management/employees/" + encodeURIComponent(editingEmployeeId) : "/api/management/employees";
    const saved = await api(endpoint, { method: isEditing ? "PATCH" : "POST", body: JSON.stringify(Object.fromEntries(form)) });
    if (isEditing && saved.employee) {
      employees = employees.map((employee) => employee.id === saved.employee.id ? saved.employee : employee);
      renderEmployees();
    } else {
      await load();
    }
    dialog.close(); tell(isEditing ? "Fiche employé mise à jour." : "Employé ajouté.");
  }
  catch (error) {
    if (dialog.open) {
      const formNotice = document.querySelector("#employee-form-notice");
      formNotice.textContent = error.message;
      formNotice.hidden = false;
      formNotice.focus?.();
    } else tell(error.message, true);
  } finally { button.disabled = false; }
});
document.querySelector("#employee-list")?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]"); if (!button) return;
  const { action, id, type, documentId } = button.dataset;
  try {
    const documentQuery = new URLSearchParams({ type });
    if (documentId) documentQuery.set("documentId", documentId);
    if (action === "edit-employee") {
      const employee = employees.find((item) => item.id === id);
      if (!employee) throw new Error("Fiche employé introuvable. Actualise la page et réessaie.");
      setEmployeeFormMode(employee);
      dialog.showModal();
      return;
    }
    if (action === "download") {
      const response = await fetch("/api/management/documents/" + id + "?" + documentQuery, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("Téléchargement impossible ou accès refusé.");
      const blob = await response.blob(); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "harmony-" + type; a.click(); URL.revokeObjectURL(a.href); return;
    }
    if (action === "remove-doc") { if (!confirm(type === "diploma" ? "Supprimer ce diplôme ?" : "Supprimer " + DOCS[type].toLowerCase() + " ?")) return; await api("/api/management/documents/" + id + "?" + documentQuery, { method: "DELETE" }); tell(type === "diploma" ? "Diplôme supprimé." : "Document supprimé."); await load(); }
    if (action === "delete-employee") { if (!confirm("Supprimer cet employé et toutes ses pièces ? Cette action est définitive.")) return; await api("/api/management/employees/" + id, { method: "DELETE" }); tell("Dossier employé supprimé."); await load(); }
  } catch (error) { tell(error.message, true); }
});
const previewPanel = document.createElement("aside");
previewPanel.className = "doc-preview";
previewPanel.hidden = true;
previewPanel.setAttribute("role", "status");
previewPanel.setAttribute("aria-live", "polite");
document.body.append(previewPanel);
let previewToken = 0;
let previewUrl = "";
function hidePreview() {
  previewToken += 1;
  previewPanel.hidden = true;
  previewPanel.replaceChildren();
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = "";
}
function positionPreview(button) {
  const rect = button.getBoundingClientRect();
  const width = Math.min(460, window.innerWidth - 24);
  let top = rect.top - 332;
  if (top < 12) top = Math.min(rect.bottom + 10, window.innerHeight - 332);
  previewPanel.style.width = width + "px";
  previewPanel.style.left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.right + 10)) + "px";
  previewPanel.style.top = Math.max(12, top) + "px";
}
async function showPreview(button) {
  hidePreview();
  const token = ++previewToken;
  positionPreview(button);
  previewPanel.textContent = "Chargement de l’aperçu…";
  previewPanel.hidden = false;
  const query = new URLSearchParams({ type: button.dataset.type });
  if (button.dataset.documentId) query.set("documentId", button.dataset.documentId);
  try {
    const response = await fetch("/api/management/documents/" + button.dataset.id + "?" + query, { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error("Aperçu indisponible.");
    const blob = await response.blob();
    if (token !== previewToken) return;
    previewUrl = URL.createObjectURL(blob);
    previewPanel.replaceChildren();
    if (blob.type === "application/pdf") {
      const frame = document.createElement("iframe");
      frame.title = "Aperçu du document PDF";
      frame.src = previewUrl;
      previewPanel.append(frame);
    } else if (blob.type.startsWith("image/")) {
      const image = document.createElement("img");
      image.alt = "Aperçu du document enregistré";
      image.src = previewUrl;
      previewPanel.append(image);
    } else {
      previewPanel.textContent = "Format d’aperçu non pris en charge.";
    }
    positionPreview(button);
  } catch (error) {
    if (token === previewToken) previewPanel.textContent = error.message;
  }
}
window.addEventListener("scroll", hidePreview, { passive: true });
window.addEventListener("resize", hidePreview);
document.querySelector("#employee-list")?.addEventListener("pointerover", (event) => {
  const button = event.target.closest('[data-action="preview"]');
  if (button && !button.contains(event.relatedTarget)) showPreview(button);
});
document.querySelector("#employee-list")?.addEventListener("pointerout", (event) => {
  const button = event.target.closest('[data-action="preview"]');
  if (button && !button.contains(event.relatedTarget)) hidePreview();
});
document.querySelector("#employee-list")?.addEventListener("focusin", (event) => {
  const button = event.target.closest('[data-action="preview"]');
  if (button) showPreview(button);
});
document.querySelector("#employee-list")?.addEventListener("focusout", (event) => {
  if (event.target.closest('[data-action="preview"]')) hidePreview();
});

document.querySelector("#employee-list")?.addEventListener("change", async (event) => {
  const input = event.target.closest('input[data-action="upload"]'); if (!input || !input.files?.[0]) return;
  const file = input.files[0]; input.disabled = true; tell("Envoi de " + DOCS[input.dataset.type].toLowerCase() + "…");
  try {
    const response = await fetch("/api/management/documents/" + input.dataset.id + "?type=" + input.dataset.type, { method: "PUT", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
    const data = await response.json().catch(() => ({})); if (response.status === 401) { location.assign("/login/"); return; }
    if (!response.ok) throw new Error(({ unsupported_file_type: "Format refusé : PDF, JPG, PNG ou WebP uniquement.", file_too_large: "Le fichier dépasse la limite de 4 Mo." })[data.error] || "Envoi impossible.");
    tell("Pièce enregistrée. Actualisation du dossier…"); await load();
  } catch (error) { tell(error.message, true); } finally { input.disabled = false; input.value = ""; }
});

async function loadDirectors() {
  try {
    const data = await api("/api/management/directors");
    const tbody = document.querySelector("#director-rows");
    tbody.innerHTML = data.directors.length ? data.directors.map((director) => '<tr><td><div class="person-name">' + safe(director.name || "Directeur") + (director.role === "admin" ? ' <span class="admin-badge">ADMIN</span>' : "") + '</div><div class="person-id">' + safe(director.discordId) + '</div></td><td>' + (director.addedAt ? new Date(director.addedAt).toLocaleDateString("fr-FR") : "Compte principal") + '</td><td>' + (director.role === "admin" ? '<span class="doc-status">Protégé</span>' : '<button class="remove-link" data-action="remove-director" data-id="' + safe(director.discordId) + '">Retirer l’accès</button>') + '</td></tr>').join("") : '<tr class="empty-row"><td colspan="3">Aucun directeur secondaire. Tu peux ajouter un compte ci-dessus.</td></tr>';
  } catch (error) { tell(error.message, true); }
}

document.querySelector("#director-form")?.addEventListener("submit", async (event) => {
  event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); const button = formElement.querySelector("[type=submit]"); button.disabled = true;
  try { await api("/api/management/directors", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) }); formElement.reset(); tell("Compte autorisé."); await loadDirectors(); }
  catch (error) { tell(error.message, true); } finally { button.disabled = false; }
});

document.querySelector("#director-rows")?.addEventListener("click", async (event) => {
  const button = event.target.closest('[data-action="remove-director"]'); if (!button) return;
  if (!confirm("Retirer l’accès de ce compte Discord ?")) return;
  try { await api("/api/management/directors/" + button.dataset.id, { method: "DELETE" }); tell("Accès retiré."); await loadDirectors(); }
  catch (error) { tell(error.message, true); }
});
load();


