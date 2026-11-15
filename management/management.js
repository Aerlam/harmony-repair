const DOCS = { identity: "Carte d’identité", license: "Permis de conduire", diploma: "Diplôme", contract: "Contrat" };
const ROLE_LABELS = { Patron: "Patron", "Co-patron": "Co-patronne", DRH: "DRH", RH: "RH", "Chef d’atelier": "Cheffe d’atelier", "Mécano confirmé": "Mécano confirmé", "Mécano apprenti": "Mécano apprenti", Stagiaire: "Stagiaire" };
const ROLE_ORDER = ["Patron", "Co-patron", "DRH", "RH", "Chef d’atelier", "Mécano confirmé", "Mécano apprenti", "Stagiaire"];
const CONTRACT_CATEGORIES = { entreprise: "Entreprise", famille_groupe: "Famille / Groupe" };
const CONTRACT_SERVICES = { repair: "Réparation", impound: "Fourrière", displacement: "Déplacement" };
const notice = document.querySelector("#notice");
let employees = [];
let contracts = [];
let contractsWeek = "";
let currentRole = "director";
let currentKind = "director";
let editingEmployeeId = null;
let editingContractId = null;
let pendingContractPdfData = "";
let contractFormDirty = false;
function tell(message, error = false) { notice.textContent = message; notice.classList.toggle("error", error); notice.hidden = !message; }
async function api(url, options = {}) {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...options, headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) } });
  if (response.status === 401) { window.location.assign("/login/?next=" + encodeURIComponent(location.pathname)); throw new Error("Connexion Discord requise."); }
  if (response.status === 403) throw new Error("Accès refusé. Seuls les comptes autorisés par l’admin peuvent ouvrir cette page.");
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  const batchErrors = { invalid_employee_batch: "Vérifie les lignes : Nom, Prénom et ID unique, puis choisis un rôle pour le lot.", employee_number_duplicate_in_batch: "Un ID unique apparaît plusieurs fois dans le copier-coller.", employee_number_exists: "Un des ID uniques du lot est déjà utilisé.", bulk_creation_failed: "L’ajout du lot a échoué. Recharge la liste avant de réessayer." };
  if (!response.ok && batchErrors[data.error]) throw new Error(batchErrors[data.error]);
  if (!response.ok && data.error === "contract_file_upload_failed") throw new Error("La fiche est enregistrée, mais le PDF n’a pas pu être stocké. Réessaie l’ajout du fichier.");
  if (!response.ok) throw new Error(({ invalid_employee: "Vérifie les informations saisies, notamment l’ID Discord et le rôle.", employee_number_exists: "Cet ID unique est déjà utilisé.", employee_discord_id_exists: "Cet ID Discord est déjà associé à un autre employé.", invalid_role_permissions: "Chaque rôle doit conserver au moins un onglet accessible.", invalid_contract: "Vérifie le nom, le type, le nombre de membres déclarés, le prix et les prestations. Si le contrat est limité à certaines personnes, complète leurs prénoms et noms.", contract_exists: "Un contrat de cette catégorie porte déjà ce nom.", invalid_contract_file: "Le fichier du contrat est invalide.", unsupported_contract_file: "Le fichier doit être un PDF valide.", contract_file_too_large: "Le PDF dépasse la limite de 3 Mo.", contract_file_not_found: "Aucun PDF de contrat n’est enregistré.", contract_pdf_unreadable: "Aucun texte exploitable n’a été trouvé. Tu peux toujours joindre le PDF et remplir la fiche manuellement.", unsupported_file_type: "Format refusé : PDF, JPG, PNG ou WebP uniquement.", file_too_large: "Le fichier dépasse la limite de 4 Mo.", storage_unavailable: "Le stockage est momentanément indisponible." })[data.error] || "Une erreur est survenue. Réessaie.");
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
    const page = document.body.dataset.page;
    const result = await api(page === "dashboard" ? "/api/management/employees?resource=dashboard" : "/api/management/employees"); employees = result.employees; currentRole = result.role; currentKind = result.kind || "director";
    document.querySelectorAll("#director-name").forEach((el) => { el.textContent = result.name || (result.role === "admin" || result.role === "director" ? "Direction connectée" : result.role); });
    document.querySelectorAll(".admin-link").forEach((link) => { link.hidden = currentRole !== "admin"; });
    if (document.body.dataset.page === "dashboard") renderDashboard(); else if (document.body.dataset.page === "employees") { renderEmployees(); applyEmployeeReadOnly(); } else await loadDirectors();
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
    const serviceManager = '<details class="contract-service-manager"><summary>Ajouter / enlever des prestations</summary><form class="contract-services-form" data-id="' + safe(contract.id) + '"><div>' + Object.entries(CONTRACT_SERVICES).map(([key, label]) => '<label><input type="checkbox" name="services" value="' + key + '"' + (contract.services.includes(key) ? ' checked' : '') + '><span>' + safe(label) + '</span></label>').join("") + '</div><button class="file-button" type="submit">Enregistrer</button></form></details>';
    const people = contract.restrictToPeople ? contract.authorizedPeople.map((person) => safe(person.firstName + " " + person.lastName)).join(", ") : "Ouvert à tous les membres du groupe";
    const date = contract.updatedAt || contract.createdAt;
    const file = contract.contractFile ? '<div class="contract-attached"><span>Contrat signé : ' + safe(contract.contractFile.filename || "contrat.pdf") + '</span><button class="file-button" type="button" data-action="open-contract-file" data-id="' + safe(contract.id) + '">Ouvrir</button><button class="remove-link" type="button" data-action="remove-contract-file" data-id="' + safe(contract.id) + '">Retirer</button></div>' : '<small class="contract-no-file">Aucun contrat signé joint</small>';
    const declaredMembers = Number.isInteger(contract.declaredMembers) && contract.declaredMembers > 0 ? contract.declaredMembers + ' membre' + (contract.declaredMembers > 1 ? 's' : '') + ' déclarés' : 'Effectif déclaré non renseigné';
    const priceUnit = contract.pricingMode === "per_member" ? ' $ / membre / semaine' : ' $ / semaine';
    const weeklyUsage = contract.weeklyUsage || { counts: {} };
    const weeklyCounts = Object.entries(CONTRACT_SERVICES).map(([key, label]) => '<span>' + safe(label) + ' <strong>' + Number(weeklyUsage.counts?.[key] || 0) + '</strong></span>').join("");
    const memberCount = Array.isArray(contract.members) ? contract.members.length : 0;
    const members = memberCount ? '<details class="contract-member-summary"><summary>Membres enregistrés (' + memberCount + ')</summary><ul>' + contract.members.map((member) => '<li>' + safe(member.firstName + ' ' + member.lastName) + ' <small>ID ' + safe(member.employeeNumber) + '</small></li>').join("") + '</ul></details>' : '<small class="contract-no-members">Aucune liste de membres enregistrée</small>';
    const usageMembers = Array.isArray(weeklyUsage.members) && weeklyUsage.members.length ? '<details class="contract-member-summary"><summary>Détail des prestations par membre</summary><ul>' + weeklyUsage.members.map((member) => '<li>' + safe([member.firstName, member.lastName].filter(Boolean).join(" ") || member.employeeNumber || "Membre") + (member.employeeNumber ? ' <small>ID ' + safe(member.employeeNumber) + '</small>' : '') + ' — Réparation ' + Number(member.counts.repair || 0) + ', dépannage ' + Number(member.counts.impound || 0) + ', déplacement ' + Number(member.counts.displacement || 0) + '</li>').join("") + '</ul></details>' : '';
    return '<article class="contract-card"><div class="contract-card-main"><div class="contract-kind">' + safe(CONTRACT_CATEGORIES[contract.category] || "Groupe") + '</div><h3>' + safe(contract.name) + '</h3><div class="contract-meta"><span>' + declaredMembers + '</span><span>' + Number(contract.weeklyPrice).toLocaleString("fr-FR") + priceUnit + '</span></div><div class="contract-services">' + services + '</div>' + serviceManager + '<div class="weekly-contract-usage"><small>Prestations cette semaine (' + safe(contractsWeek || "") + ')</small><div>' + weeklyCounts + '</div></div>' + members + usageMembers + '<small class="contract-people">' + (contract.restrictToPeople ? "Personnes autorisées : " : "Accès : ") + people + '</small>' + file + '<small class="contract-date">Mis à jour le ' + (date ? new Date(date).toLocaleDateString("fr-FR") : "—") + '</small></div><div class="contract-actions"><button class="edit-link" type="button" data-action="edit-contract" data-id="' + safe(contract.id) + '">Modifier</button><button class="remove-link" type="button" data-action="delete-contract" data-id="' + safe(contract.id) + '">Supprimer</button></div></article>';
  }).join("") : '<div class="empty-row">Aucun contrat enregistré. Ajoute le premier groupe ci-dessus.</div>';
  document.querySelector("#contract-count").textContent = contracts.length;
  if (currentKind === "employee") {
    document.querySelectorAll('#contract-list [data-action]:not([data-action="open-contract-file"])').forEach((control) => { control.hidden = true; });
    document.querySelectorAll("#contract-list .contract-service-manager").forEach((control) => { control.hidden = true; });
  }
}
function resetContractForm() {
  const form = document.querySelector("#contract-form");
  if (!form) return;
  editingContractId = null;
  pendingContractPdfData = "";
  contractFormDirty = false;
  form.reset();
  syncContractPriceLabel();
  document.querySelector("#contract-restricted").checked = false;
  document.querySelector("#contract-people-fields").hidden = true;
  document.querySelector("#contract-people-list").replaceChildren();
  document.querySelector("#contract-members-list").replaceChildren();
  updateContractMemberEmptyState();
  document.querySelector("#contract-file-current").replaceChildren();
  document.querySelector("#contract-file-current").hidden = true;
  document.querySelector("#contract-extra-fields").open = false;
  document.querySelector("#contract-form-title").textContent = "Ajouter un contrat";
  document.querySelector("#contract-submit-label").textContent = "Enregistrer le contrat";
  document.querySelector("#contract-cancel").hidden = true;
}
function syncContractPriceLabel() {
  const perMember = document.querySelector("#contract-pricing-mode")?.value === "per_member";
  document.querySelector("#contract-weekly-price-title").textContent = perMember ? "Tarif par membre et par semaine ($)" : "Prix du forfait par semaine ($)";
  document.querySelector('[name="weeklyPrice"]').placeholder = perMember ? "Ex. 2 000" : "Ex. 35 000";
  document.querySelector("#contract-price-help").textContent = perMember ? "Le total hebdomadaire estimé dépendra du nombre de membres déclarés." : "Indique 0 si le contrat est gratuit.";
}
async function loadContracts() {
  try {
    const result = await api("/api/management/employees?resource=contracts");
    contracts = result.contracts;
    contractsWeek = result.week || "";
    currentRole = result.role;
    currentKind = result.kind || "director";
    document.querySelectorAll("#add-contract, #contract-form, .contract-editor").forEach((element) => { element.hidden = currentKind === "employee"; });
    document.querySelectorAll("#director-name").forEach((el) => { el.textContent = result.name || (currentKind === "employee" ? currentRole : "Direction connectée"); });
    document.querySelectorAll(".admin-link").forEach((link) => { link.hidden = currentRole !== "admin"; });
    renderContracts();
    tell("");
  } catch (error) { tell(error.message, true); document.querySelector("#contract-list")?.replaceChildren(); }
}
document.querySelector("#contract-form")?.addEventListener("input", () => { contractFormDirty = true; });
document.querySelector("#contract-form")?.addEventListener("change", () => { contractFormDirty = true; });
document.querySelector("#contract-pricing-mode")?.addEventListener("change", syncContractPriceLabel);
document.querySelector("#contract-file-input")?.addEventListener("change", async (event) => {
  const file = event.currentTarget.files?.[0];
  pendingContractPdfData = "";
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".pdf") || file.size > 3 * 1024 * 1024) {
    tell(file.size > 3 * 1024 * 1024 ? "Le PDF dépasse la limite de 3 Mo." : "Choisis un fichier PDF.", true);
    event.currentTarget.value = "";
    return;
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    pendingContractPdfData = btoa(binary);
    tell("Lecture du contrat en cours… Le PDF sera joint à la fiche après son enregistrement.");
    const result = await api("/api/management/employees?resource=contract-import", { method: "POST", body: JSON.stringify({ fileName: file.name, data: pendingContractPdfData }) });
    const extracted = result.extracted || {};
    const form = document.querySelector("#contract-form");
    const detected = [];
    const fill = (field, value, label) => { if (value !== null && value !== undefined && value !== "") { form.elements[field].value = value; detected.push(label); } };
    fill("name", extracted.name, "nom");
    fill("category", extracted.category, "type");
    fill("responsibleName", extracted.responsibleName, "responsable");
    fill("declaredMembers", extracted.declaredMembers, "effectif déclaré");
    fill("contactName", extracted.contactName, "contact");
    fill("pricingMode", extracted.pricingMode, "formule tarifaire");
    if (extracted.weeklyPrice !== null && extracted.weeklyPrice !== undefined) fill("weeklyPrice", extracted.weeklyPrice, "tarif");
    fill("startDate", extracted.startDate, "date d’effet");
    if (Array.isArray(extracted.services) && extracted.services.length) {
      for (const checkbox of form.querySelectorAll('input[name="services"]')) checkbox.checked = extracted.services.includes(checkbox.value);
      detected.push("prestations");
    }
    if (["responsable", "contact", "formule tarifaire", "date d’effet"].some((field) => detected.includes(field))) document.querySelector("#contract-extra-fields").open = true;
    syncContractPriceLabel();
    tell(detected.length ? "Champs préremplis depuis le PDF : " + detected.join(", ") + ". Vérifie-les et complète ce qui manque avant d’enregistrer." : "Aucun champ reconnu dans ce PDF. Tu peux le joindre et remplir la fiche manuellement.");
  } catch (error) {
    tell(error.message + " Tu peux quand même remplir les champs manuellement et joindre le PDF.", true);
  }
});
document.querySelector("#contract-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form));
  payload.services = new FormData(form).getAll("services");
  payload.declaredMembers = Number(payload.declaredMembers);
  payload.weeklyPrice = Number(payload.weeklyPrice);
  payload.restrictToPeople = document.querySelector("#contract-restricted").checked;
  payload.authorizedPeople = payload.restrictToPeople ? [...document.querySelectorAll(".contract-person-row")].map((row) => ({
    firstName: row.querySelector('[name="authorizedFirstName"]').value.trim(),
    lastName: row.querySelector('[name="authorizedLastName"]').value.trim(),
    employeeNumber: row.querySelector('[name="authorizedEmployeeNumber"]').value.trim(),
  })) : [];
  payload.members = [...document.querySelectorAll(".contract-member-row")].map((row) => ({
    firstName: row.querySelector('[name="memberFirstName"]').value.trim(),
    lastName: row.querySelector('[name="memberLastName"]').value.trim(),
    employeeNumber: row.querySelector('[name="memberEmployeeNumber"]').value.trim(),
  })).filter((member) => member.firstName || member.lastName || member.employeeNumber);
  const button = form.querySelector('[type="submit"]');
  const fileInput = document.querySelector("#contract-file-input");
  const selectedFile = fileInput.files?.[0];
  if (selectedFile && (!selectedFile.name.toLowerCase().endsWith(".pdf") || selectedFile.size > 3 * 1024 * 1024)) {
    tell(selectedFile.size > 3 * 1024 * 1024 ? "Le PDF dépasse la limite de 3 Mo." : "Le fichier du contrat doit être un PDF.", true);
    return;
  }
  button.disabled = true;
  try {
    const isEditing = Boolean(editingContractId);
    const endpoint = isEditing ? "/api/management/employees/" + encodeURIComponent(editingContractId) + "?resource=contracts" : "/api/management/employees?resource=contracts";
    const result = await api(endpoint, { method: isEditing ? "PATCH" : "POST", body: JSON.stringify(payload) });
    let savedContract = result.contract;
    if (savedContract) {
      contracts = isEditing ? contracts.map((contract) => contract.id === savedContract.id ? savedContract : contract) : [...contracts, savedContract];
      renderContracts();
    }
    if (savedContract && selectedFile) {
      try {
        if (!pendingContractPdfData) {
          const bytes = new Uint8Array(await selectedFile.arrayBuffer());
          let binary = "";
          for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
          pendingContractPdfData = btoa(binary);
        }
        const uploaded = await api("/api/management/employees/" + encodeURIComponent(savedContract.id) + "?resource=contract-file", { method: "PUT", body: JSON.stringify({ fileName: selectedFile.name, data: pendingContractPdfData }) });
        savedContract = uploaded.contract;
        contracts = contracts.map((contract) => contract.id === savedContract.id ? savedContract : contract);
        renderContracts();
      } catch (error) {
        editingContractId = savedContract.id;
        document.querySelector("#contract-form-title").textContent = "Contrat créé — fichier à ajouter";
        document.querySelector("#contract-submit-label").textContent = "Réessayer l’ajout du PDF";
        document.querySelector("#contract-cancel").hidden = false;
        tell("La fiche partenaire est enregistrée, mais le PDF n’a pas été ajouté : " + error.message, true);
        return;
      }
    }
    resetContractForm();
    tell(isEditing ? "Contrat mis à jour." : "Contrat ajouté.");
  } catch (error) { tell(error.message, true); }
  finally { button.disabled = false; }
});
document.querySelector("#contract-cancel")?.addEventListener("click", resetContractForm);
function updateContractMemberEmptyState() {
  const list = document.querySelector("#contract-members-list");
  const empty = document.querySelector("#contract-members-empty");
  if (list && empty) empty.hidden = list.querySelectorAll(".contract-member-row").length > 0;
}
function addContractMemberRow(member = {}) {
  const row = document.createElement("div");
  row.className = "contract-member-row";
  row.innerHTML = '<label>Prénom<input name="memberFirstName" maxlength="60" autocomplete="given-name" required></label><label>Nom<input name="memberLastName" maxlength="60" autocomplete="family-name" required></label><label>ID unique<input name="memberEmployeeNumber" maxlength="24" pattern="[A-Za-zÀ-ž0-9_-]{2,24}" placeholder="Ex. HR-024" required></label><button class="icon-button" type="button" data-action="remove-contract-member" aria-label="Retirer ce membre">×</button>';
  row.querySelector('[name="memberFirstName"]').value = member.firstName || "";
  row.querySelector('[name="memberLastName"]').value = member.lastName || "";
  row.querySelector('[name="memberEmployeeNumber"]').value = member.employeeNumber || "";
  document.querySelector("#contract-members-list").append(row);
  updateContractMemberEmptyState();
}
document.querySelector("#contract-add-member")?.addEventListener("click", () => addContractMemberRow());
document.querySelector("#contract-members-list")?.addEventListener("click", (event) => {
  const button = event.target.closest('[data-action="remove-contract-member"]');
  if (!button) return;
  button.closest(".contract-member-row").remove();
  updateContractMemberEmptyState();
});
function addAuthorizedPersonRow(person = {}) {
  const row = document.createElement("div");
  row.className = "contract-person-row";
  row.innerHTML = '<label>Prénom<input name="authorizedFirstName" maxlength="60" autocomplete="given-name"></label><label>Nom<input name="authorizedLastName" maxlength="60" autocomplete="family-name"></label><label>ID unique<input name="authorizedEmployeeNumber" maxlength="24" pattern="[A-Za-zÀ-ž0-9_-]{2,24}" placeholder="ID du membre"></label><button class="icon-button" type="button" data-action="remove-authorized-person" aria-label="Retirer cette personne">×</button>';
  row.querySelector('[name="authorizedFirstName"]').value = person.firstName || "";
  row.querySelector('[name="authorizedLastName"]').value = person.lastName || "";
  row.querySelector('[name="authorizedEmployeeNumber"]').value = person.employeeNumber || "";
  for (const input of row.querySelectorAll("input")) input.required = document.querySelector("#contract-restricted").checked;
  document.querySelector("#contract-people-list").append(row);
}
document.querySelector("#contract-restricted")?.addEventListener("change", (event) => {
  const enabled = event.currentTarget.checked;
  document.querySelector("#contract-people-fields").hidden = !enabled;
  for (const input of document.querySelectorAll(".contract-person-row input")) input.required = enabled;
  if (enabled && !document.querySelector(".contract-person-row")) addAuthorizedPersonRow();
});
document.querySelector("#contract-add-person")?.addEventListener("click", () => addAuthorizedPersonRow());
document.querySelector("#contract-people-list")?.addEventListener("click", (event) => {
  const button = event.target.closest('[data-action="remove-authorized-person"]');
  if (!button) return;
  button.closest(".contract-person-row").remove();
});
document.querySelector("#contract-list")?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const contract = contracts.find((item) => item.id === button.dataset.id);
  if (!contract) return;
  if (button.dataset.action === "open-contract-file") {
    window.open("/api/management/employees/" + encodeURIComponent(contract.id) + "?resource=contract-file", "_blank", "noopener");
    return;
  }
  if (button.dataset.action === "remove-contract-file") {
    if (!confirm("Retirer le PDF du contrat « " + contract.name + " » ?")) return;
    try {
      const result = await api("/api/management/employees/" + encodeURIComponent(contract.id) + "?resource=contract-file", { method: "DELETE" });
      contracts = contracts.map((item) => item.id === contract.id ? result.contract : item);
      renderContracts();
      if (editingContractId === contract.id) { const currentFile = document.querySelector("#contract-file-current"); currentFile.replaceChildren(); currentFile.hidden = true; }
      tell("PDF du contrat retiré.");
    } catch (error) { tell(error.message, true); }
    return;
  }
  if (button.dataset.action === "edit-contract") {
    editingContractId = contract.id;
    pendingContractPdfData = "";
    const form = document.querySelector("#contract-form");
    document.querySelector("#contract-file-input").value = "";
    form.elements.name.value = contract.name;
    form.elements.category.value = contract.category;
    form.elements.responsibleName.value = contract.responsibleName || "";
    form.elements.declaredMembers.value = contract.declaredMembers ?? "";
    form.elements.contactName.value = contract.contactName || "";
    form.elements.pricingMode.value = contract.pricingMode || "flat";
    form.elements.weeklyPrice.value = contract.weeklyPrice;
    form.elements.startDate.value = contract.startDate || "";
    document.querySelector("#contract-extra-fields").open = Boolean(contract.responsibleName || contract.contactName || contract.startDate || contract.pricingMode === "per_member");
    syncContractPriceLabel();
    const currentFile = document.querySelector("#contract-file-current");
    if (contract.contractFile) {
      currentFile.innerHTML = 'PDF actuel : <strong>' + safe(contract.contractFile.filename || "contrat.pdf") + '</strong>. Sélectionne un autre PDF pour le remplacer.';
      currentFile.hidden = false;
    } else { currentFile.replaceChildren(); currentFile.hidden = true; }
    for (const checkbox of form.querySelectorAll('input[name="services"]')) checkbox.checked = contract.services.includes(checkbox.value);
    const restricted = Boolean(contract.restrictToPeople);
    document.querySelector("#contract-restricted").checked = restricted;
    document.querySelector("#contract-people-fields").hidden = !restricted;
    const peopleList = document.querySelector("#contract-people-list");
    peopleList.replaceChildren();
    if (restricted) (contract.authorizedPeople.length ? contract.authorizedPeople : [{}]).forEach(addAuthorizedPersonRow);
    for (const input of peopleList.querySelectorAll("input")) input.required = restricted;
    const membersList = document.querySelector("#contract-members-list");
    membersList.replaceChildren();
    (contract.members || []).forEach(addContractMemberRow);
    updateContractMemberEmptyState();
    document.querySelector("#contract-form-title").textContent = "Modifier le contrat";
    document.querySelector("#contract-submit-label").textContent = "Enregistrer les changements";
    document.querySelector("#contract-cancel").hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    form.elements.name.focus();
    return;
  }
  if (button.dataset.action === "delete-contract") {
    if (!confirm("Supprimer le contrat de « " + contract.name + " » ?")) return;
    try { await api("/api/management/employees/" + encodeURIComponent(contract.id) + "?resource=contracts", { method: "DELETE" }); contracts = contracts.filter((item) => item.id !== contract.id); renderContracts(); tell("Contrat supprimé."); }
    catch (error) { tell(error.message, true); }
  }
});
document.querySelector("#contract-list")?.addEventListener("submit", async (event) => {
  const form = event.target.closest(".contract-services-form");
  if (!form) return;
  event.preventDefault();
  const contract = contracts.find((item) => item.id === form.dataset.id);
  const services = new FormData(form).getAll("services");
  if (!contract || !services.length) { tell("Garde au moins une prestation autorisée.", true); return; }
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    const result = await api("/api/management/employees/" + encodeURIComponent(contract.id) + "?resource=contracts", { method: "PATCH", body: JSON.stringify({ ...contract, services }) });
    contracts = contracts.map((item) => item.id === contract.id ? { ...result.contract, weeklyUsage: item.weeklyUsage } : item);
    renderContracts();
    tell("Prestations autorisées mises à jour pour « " + contract.name + " ». ");
  } catch (error) { tell(error.message, true); button.disabled = false; }
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
function applyEmployeeReadOnly() {
  if (currentKind !== "employee") return;
  document.querySelectorAll("#add-employee, #add-employees-paste").forEach((button) => { button.hidden = true; });
  document.querySelectorAll('#employee-list [data-action="edit-employee"], #employee-list [data-action="delete-employee"], #employee-list [data-action="remove-doc"]').forEach((button) => { button.hidden = true; });
  document.querySelectorAll('#employee-list input[data-action="upload"]').forEach((input) => { if (input.closest("label")) input.closest("label").hidden = true; });
  document.querySelectorAll("#employee-list .employee-head-actions").forEach((actions) => { actions.hidden = true; });
}
function parseEmployeePaste() {
  const lines = (document.querySelector("#employee-bulk-rows")?.value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rows = [];
  let malformed = 0;
  for (const [index, line] of lines.entries()) {
    if (index === 0 && /nom/i.test(line) && /pr[eé]nom/i.test(line) && /id/i.test(line)) continue;
    let columns;
    if (line.includes("\t")) columns = line.split("\t");
    else if (line.includes(";")) columns = line.split(";");
    else if (line.includes("|")) columns = line.split("|");
    else if (line.includes(",")) columns = line.split(",");
    else {
      const match = line.match(/^(.+?)\s+([^\s]+)\s+([\p{L}\p{N}_-]{2,24})$/u);
      columns = match ? [match[1], match[2], match[3]] : [];
    }
    if (columns.length !== 3) { malformed += 1; continue; }
    const [lastName, firstName, employeeNumber] = columns.map((value) => value.trim().replace(/^\s*["']|["']\s*$/g, ""));
    if (!lastName || !firstName || !/^[\p{L}\p{N}_-]{2,24}$/u.test(employeeNumber)) { malformed += 1; continue; }
    rows.push({ lastName, firstName, employeeNumber });
  }
  const seen = new Set();
  const duplicates = rows.filter((row) => { const key = row.employeeNumber.toLocaleLowerCase("fr"); if (seen.has(key)) return true; seen.add(key); return false; });
  return { rows, malformed, duplicates };
}
function updateEmployeeBulkPreview() {
  const { rows, malformed, duplicates } = parseEmployeePaste();
  const preview = document.querySelector("#employee-bulk-preview");
  if (!preview) return;
  preview.classList.toggle("error", Boolean(malformed || duplicates.length));
  const sample = rows.slice(0, 5).map((row) => row.lastName + " " + row.firstName + " · " + row.employeeNumber).join("\n");
  preview.textContent = rows.length + " ligne(s) reconnue(s)" + (malformed ? " · " + malformed + " ligne(s) à corriger" : "") + (duplicates.length ? " · " + duplicates.length + " ID(s) en double" : "") + (sample ? "\n" + sample : "");
}
const employeeBulkDialog = document.querySelector("#employee-bulk-dialog");
document.querySelector("#add-employees-paste")?.addEventListener("click", () => { updateEmployeeBulkPreview(); document.querySelector("#employee-bulk-notice").hidden = true; employeeBulkDialog.showModal(); });
document.querySelector("#employee-bulk-rows")?.addEventListener("input", updateEmployeeBulkPreview);
document.querySelector("#bulk-dialog-close")?.addEventListener("click", () => employeeBulkDialog.close());
document.querySelector("#bulk-dialog-cancel")?.addEventListener("click", () => employeeBulkDialog.close());
document.querySelector("#employee-bulk-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const { rows, malformed, duplicates } = parseEmployeePaste();
  if (!rows.length || malformed || duplicates.length) { updateEmployeeBulkPreview(); return; }
  const button = event.currentTarget.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    const result = await api("/api/management/employees?resource=bulk", { method: "POST", body: JSON.stringify({ rows, garageRole: document.querySelector("#employee-bulk-role").value }) });
    employees = [...employees, ...result.employees];
    renderEmployees();
    employeeBulkDialog.close();
    event.currentTarget.reset();
    document.querySelector("#employee-bulk-preview").textContent = "Aucune ligne prête.";
    tell(result.employees.length + " employé(s) ajouté(s). Ajoute leur ID Discord en modifiant les fiches au besoin.");
  } catch (error) {
    const formNotice = document.querySelector("#employee-bulk-notice");
    formNotice.textContent = error.message;
    formNotice.hidden = false;
    formNotice.focus();
  }
  finally { button.disabled = false; }
});
document.querySelector("#search")?.addEventListener("input", () => { renderEmployees(); applyEmployeeReadOnly(); });
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
    await loadRolePermissions();
  } catch (error) { tell(error.message, true); }
}

async function loadRolePermissions() {
  const panel = document.querySelector("#role-permissions-panel");
  if (!panel) return;
  const data = await api("/api/management/employees?resource=permissions");
  const tbody = document.querySelector("#role-permission-rows");
  const tabLabels = Object.fromEntries(data.tabs.map((tab) => [tab.key, tab.label]));
  const tabs = data.tabs.map((tab) => tab.key);
  tbody.innerHTML = data.roles.map((role) => '<tr><th scope="row">' + safe(ROLE_LABELS[role] || role) + '</th>' + tabs.map((tab) => '<td><label class="permission-toggle"><input type="checkbox" data-role="' + safe(role) + '" data-tab="' + safe(tab) + '" ' + (data.permissions[role][tab] ? "checked" : "") + '><span class="sr-only">' + safe(tabLabels[tab] + " pour " + (ROLE_LABELS[role] || role)) + '</span></label></td>').join("") + '</tr>').join("");
  panel.hidden = false;
}

document.querySelector("#save-role-permissions")?.addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const permissions = {};
    document.querySelectorAll("#role-permission-rows input[data-role]").forEach((input) => {
      permissions[input.dataset.role] ||= {};
      permissions[input.dataset.role][input.dataset.tab] = input.checked;
    });
    await api("/api/management/employees?resource=permissions", { method: "PUT", body: JSON.stringify({ permissions }) });
    tell("Les permissions des rôles ont été enregistrées.");
  } catch (error) { tell(error.message, true); }
  finally { button.disabled = false; }
});

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

window.addEventListener("harmony:refresh", () => {
  if (document.visibilityState !== "visible" || document.querySelector("dialog[open]")) return;
  const page = document.body.dataset.page;
  if (page === "contracts" && (editingContractId || contractFormDirty || pendingContractPdfData)) return;
  if (page === "directors") { loadDirectors(); return; }
  load();
});

Promise.resolve(window.siteAccessReady).then((access) => { if (access) load(); });


