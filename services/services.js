const SERVICE_LABELS = { repair: "Réparation", impound: "Dépannage / fourrière", displacement: "Déplacement" };
const resultsElement = document.querySelector("#service-results");
const notice = document.querySelector("#service-notice");
let lastResults = [];
let searchTimer;

function safe(value) {
  const element = document.createElement("span");
  element.textContent = value || "";
  return element.innerHTML;
}

function showNotice(message, isError = false) {
  notice.textContent = message;
  notice.classList.toggle("error", isError);
  notice.hidden = !message;
}

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...options, headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) } });
  if (response.status === 401) {
    window.location.assign("/login/?next=%2Fservices%2F");
    throw new Error("Connexion Discord requise.");
  }
  const data = await response.json().catch(() => ({}));
  const errors = {
    employee_access_required: "Ton compte Discord n’est pas encore associé à une fiche employé. Demande à la direction d’ajouter ton ID Discord.",
    member_required: "Saisis le prénom et le nom du membre pris en charge.",
    member_not_authorized: "Ce membre n’est pas autorisé par le contrat.",
    service_not_allowed: "Cette prestation n’est pas comprise dans le contrat.",
    invalid_usage: "La prestation n’a pas pu être enregistrée.",
    storage_unavailable: "Le stockage est momentanément indisponible.",
  };
  if (!response.ok) throw new Error(errors[data.error] || "Une erreur est survenue. Réessaie.");
  return data;
}

function renderResults(results) {
  lastResults = results;
  if (!results.length) {
    resultsElement.innerHTML = '<div class="empty-row">Aucun contrat ou membre correspondant. Essaie un autre nom.</div>';
    return;
  }
  resultsElement.innerHTML = results.map((result, index) => {
    const services = (result.services || []).filter((service) => SERVICE_LABELS[service]);
    const pills = services.map((service) => '<span class="service-pill">' + safe(SERVICE_LABELS[service]) + '</span>').join("");
    const counters = services.map((service) => '<div class="usage-counter"><small>' + safe(SERVICE_LABELS[service]) + '</small><strong>' + Number(result.counts?.[service] || 0) + '</strong></div>').join("");
    const target = result.restricted ? '<div class="usage-target restricted-target"><span>Membre autorisé</span><strong>' + safe(result.memberName) + '</strong></div>' : result.requiresPersonSearch ? '<p class="restricted-message">Ce contrat est nominatif. Recherche le prénom et le nom du membre pour confirmer son accès.</p>' : '<div class="usage-member-inputs"><label>Prénom du membre<input name="memberFirstName" maxlength="60" placeholder="Prénom" required></label><label>Nom du membre<input name="memberLastName" maxlength="60" placeholder="Nom" required></label></div>';
    const actions = result.requiresPersonSearch ? "" : services.map((service) => '<button class="button usage-add" type="button" data-service="' + service + '" data-result-index="' + index + '">+ ' + safe(SERVICE_LABELS[service]) + '</button>').join("");
    const recent = (result.recent || []).length ? '<div class="usage-history"><h3>Enregistré cette semaine</h3><ul>' + result.recent.map((event) => '<li><strong>' + safe(event.memberName) + '</strong><span>' + safe(result.name) + ' · ' + safe(SERVICE_LABELS[event.service] || event.service) + '</span><small>' + safe(new Date(event.createdAt).toLocaleString("fr-FR")) + ' · saisi par ' + safe(event.actorName) + '</small></li>').join("") + '</ul></div>' : '';
    const searchName = result.restricted ? result.memberName + ' · ' + result.name : result.name;
    return '<article class="service-result-card" data-contract-id="' + safe(result.id) + '"><div class="service-result-heading"><div><div class="contract-kind">' + safe(result.category === "entreprise" ? "Entreprise" : "Famille / Groupe") + '</div><h3>' + safe(searchName) + '</h3></div><span class="usage-week-tag">' + safe(document.querySelector("#usage-week").textContent) + '</span></div><div class="contract-services">' + pills + '</div><p class="service-result-intro">Prestations prévues au contrat</p>' + target + '<div class="usage-counters">' + counters + '</div><div class="usage-actions">' + actions + '</div>' + recent + '</article>';
  }).join("");
}

async function searchPartners() {
  const query = document.querySelector("#service-search").value.trim();
  if (query.length < 2) {
    renderResults([]);
    resultsElement.innerHTML = '<div class="empty-row">Saisis au moins deux caractères pour rechercher un partenaire.</div>';
    return;
  }
  resultsElement.innerHTML = '<div class="loading">Recherche des contrats…</div>';
  try {
    const data = await api("/api/management/employees?resource=usage&q=" + encodeURIComponent(query));
    document.querySelector("#garage-employee-name").textContent = data.employee.firstName + " " + data.employee.lastName;
    document.querySelector("#usage-week").textContent = data.week;
    renderResults(data.results);
    showNotice("");
  } catch (error) {
    resultsElement.innerHTML = '<div class="empty-row">' + safe(error.message) + '</div>';
    showNotice(error.message, true);
  }
}

document.querySelector("#service-search-form").addEventListener("submit", (event) => { event.preventDefault(); clearTimeout(searchTimer); searchPartners(); });
document.querySelector("#service-search").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = window.setTimeout(searchPartners, 300); });
resultsElement.addEventListener("click", async (event) => {
  const button = event.target.closest(".usage-add");
  if (!button) return;
  const result = lastResults[Number(button.dataset.resultIndex)];
  if (!result) return;
  const card = button.closest(".service-result-card");
  const memberFirstName = result.restricted ? result.memberFirstName : card.querySelector('[name="memberFirstName"]')?.value.trim();
  const memberLastName = result.restricted ? result.memberLastName : card.querySelector('[name="memberLastName"]')?.value.trim();
  if (!memberFirstName || !memberLastName) { showNotice("Saisis le prénom et le nom du membre pris en charge.", true); return; }
  button.disabled = true;
  try {
    await api("/api/management/employees?resource=usage", { method: "POST", body: JSON.stringify({ contractId: result.id, service: button.dataset.service, memberFirstName, memberLastName }) });
    showNotice(SERVICE_LABELS[button.dataset.service] + " enregistrée pour " + memberFirstName + " " + memberLastName + " · " + result.name + ".");
    await searchPartners();
  } catch (error) { showNotice(error.message, true); }
  finally { button.disabled = false; }
});

searchPartners();
