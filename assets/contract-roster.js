(() => {
  const list = document.querySelector("#contract-members-list");
  const emptyState = document.querySelector("#contract-members-empty");
  const pasteInput = document.querySelector("#contract-members-paste");
  const screenInput = document.querySelector("#contract-members-screens");
  const notice = document.querySelector("#contract-roster-import-notice");
  const pasteButton = document.querySelector("#contract-import-members");
  const screenButton = document.querySelector("#contract-read-screens");
  if (!list || !emptyState || !pasteInput || !screenInput || !notice || !pasteButton || !screenButton) return;

  const ID_PATTERN = /^[\p{L}\p{N}_-]{2,24}$/u;
  const MAX_MEMBERS = 5000;
  const MAX_SCREENSHOTS = 10;
  const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
  const OCR_WORKER = "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js";
  const OCR_CORE = "https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0";
  const OCR_LANG = "https://tessdata.projectnaptha.com/4.0.0";

  function showNotice(message, kind = "") {
    notice.textContent = message;
    notice.className = "contract-roster-import-notice" + (kind ? " " + kind : "");
  }

  function cleanCell(value) {
    return value.trim().replace(/^"(.*)"$/, "$1").replace(/""/g, '"').trim();
  }

  function splitLine(line) {
    const delimiter = line.includes("\t") ? "\t" : line.includes(";") ? ";" : ",";
    if (delimiter === "\t") return line.split(delimiter).map(cleanCell);
    const cells = [];
    let value = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === '"' && line[index + 1] === '"' && quoted) { value += '"'; index += 1; }
      else if (character === '"') quoted = !quoted;
      else if (character === delimiter && !quoted) { cells.push(cleanCell(value)); value = ""; }
      else value += character;
    }
    cells.push(cleanCell(value));
    return cells;
  }

  function normalizeHeader(value) {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function parsePastedRows(value) {
    const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) throw new Error("Colle au moins une ligne de membre.");
    const rows = lines.map(splitLine);
    const first = rows[0].map(normalizeHeader);
    if (first.some((cell) => cell.includes("idunique")) && first.some((cell) => cell === "nom") && first.some((cell) => cell.includes("prenom"))) rows.shift();
    if (!rows.length) throw new Error("Aucune ligne de membre après l’en-tête.");
    return rows.map((cells, index) => {
      if (cells.length !== 3) throw new Error("Ligne " + (index + 1) + " : utilise les colonnes Nom, Prénom et ID unique.");
      return { firstName: cells[1], lastName: cells[0], employeeNumber: cells[2] };
    });
  }

  function validateRows(rows) {
    if (!rows.length) throw new Error("Aucun membre reconnu. Vérifie le format de la liste ou la netteté des captures.");
    const existing = new Set([...list.querySelectorAll('[name="memberEmployeeNumber"]')].map((input) => input.value.trim().toLocaleLowerCase("fr")));
    const pasted = new Set();
    const available = MAX_MEMBERS - list.querySelectorAll(".contract-member-row").length;
    if (rows.length > available) throw new Error("La liste dépasse le maximum de " + MAX_MEMBERS + " membres par contrat.");
    for (const row of rows) {
      if (!row.firstName || row.firstName.length > 60 || !row.lastName || row.lastName.length > 60 || !ID_PATTERN.test(row.employeeNumber)) {
        throw new Error("Un nom ou un ID unique est invalide. Vérifie les lignes reconnues avant de les ajouter.");
      }
      const id = row.employeeNumber.toLocaleLowerCase("fr");
      if (existing.has(id) || pasted.has(id)) throw new Error("L’ID unique « " + row.employeeNumber + " » apparaît plusieurs fois. Retire le doublon avant d’ajouter la liste.");
      pasted.add(id);
    }
  }

  function addRows(rows) {
    validateRows(rows);
    for (const member of rows) {
      const row = document.createElement("div");
      row.className = "contract-member-row";
      const fields = [
        ["Prénom", "memberFirstName", member.firstName, "given-name"],
        ["Nom", "memberLastName", member.lastName, "family-name"],
        ["ID unique", "memberEmployeeNumber", member.employeeNumber, "off"],
      ];
      for (const [labelText, name, value, autocomplete] of fields) {
        const label = document.createElement("label");
        label.append(document.createTextNode(labelText));
        const input = document.createElement("input");
        input.name = name;
        input.maxLength = name === "memberEmployeeNumber" ? 24 : 60;
        input.required = true;
        input.autocomplete = autocomplete;
        if (name === "memberEmployeeNumber") {
          input.pattern = "[A-Za-zÀ-ž0-9_-]{2,24}";
          input.placeholder = "Ex. HR-024";
        }
        input.value = value;
        label.append(input);
        row.append(label);
      }
      const remove = document.createElement("button");
      remove.className = "icon-button";
      remove.type = "button";
      remove.dataset.action = "remove-contract-member";
      remove.setAttribute("aria-label", "Retirer ce membre");
      remove.textContent = "×";
      row.append(remove);
      list.append(row);
    }
    emptyState.hidden = list.querySelectorAll(".contract-member-row").length > 0;
    document.querySelector("#contract-form")?.dispatchEvent(new Event("change", { bubbles: true }));
  }

  pasteButton.addEventListener("click", () => {
    try {
      const rows = parsePastedRows(pasteInput.value);
      addRows(rows);
      pasteInput.value = "";
      showNotice(rows.length + " membre(s) ajouté(s). Vérifie la liste avant d’enregistrer le contrat.", "success");
    } catch (error) { showNotice(error.message, "error"); }
  });

  function rowsFromTsv(tsv) {
    const words = tsv.split(/\r?\n/).slice(1).map((line) => {
      const cells = line.split("\t");
      if (cells.length < 12 || cells[0] !== "5" || !cells[11]?.trim() || Number(cells[10]) < 20) return null;
      return { text: cells[11].trim(), left: Number(cells[6]), top: Number(cells[7]), height: Number(cells[9]) };
    }).filter(Boolean).sort((a, b) => a.top - b.top || a.left - b.left);
    const groups = [];
    for (const word of words) {
      const center = word.top + word.height / 2;
      let group = groups.find((candidate) => Math.abs(candidate.center - center) <= Math.max(9, Math.min(word.height, candidate.height) * 0.7));
      if (!group) { group = { center, height: word.height, words: [] }; groups.push(group); }
      group.words.push(word);
      group.center = group.words.reduce((sum, part) => sum + part.top + part.height / 2, 0) / group.words.length;
    }
    const rows = [];
    for (const group of groups) {
      const line = group.words.sort((a, b) => a.left - b.left).map((word) => word.text).join(" ").trim();
      if (!line || /\b(?:ID\s+)?UNIQUE\b/i.test(line) || /\bNOM\b/i.test(line) && !/\d/.test(line)) continue;
      const idWord = group.words.find((word) => /^[\dOoIl|]{2,24}$/.test(word.text));
      if (!idWord) continue;
      const employeeNumber = idWord.text.replace(/[Oo]/g, "0").replace(/[Il|]/g, "1");
      const fullName = group.words.filter((word) => word !== idWord).sort((a, b) => a.left - b.left).map((word) => word.text).join(" ").replace(/\s+/g, " ").trim();
      const parts = fullName.split(" ").filter(Boolean);
      if (parts.length < 2) continue;
      rows.push({ firstName: parts.shift(), lastName: parts.join(" "), employeeNumber });
    }
    return rows;
  }

  screenButton.addEventListener("click", async () => {
    const files = [...(screenInput.files || [])];
    if (!files.length) { showNotice("Sélectionne au moins une capture d’écran.", "error"); return; }
    if (files.length > MAX_SCREENSHOTS) { showNotice("Sélectionne au maximum " + MAX_SCREENSHOTS + " captures à la fois.", "error"); return; }
    const invalid = files.find((file) => !["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > MAX_IMAGE_BYTES);
    if (invalid) { showNotice("Chaque capture doit être en PNG, JPG ou WebP et faire au maximum 4 Mo.", "error"); return; }
    if (!window.Tesseract?.createWorker) { showNotice("La lecture d’image n’est pas disponible. Tu peux coller la liste manuellement.", "error"); return; }

    screenButton.disabled = true;
    pasteButton.disabled = true;
    let worker;
    const rows = [];
    try {
      showNotice("Préparation de la lecture des captures…");
      worker = await window.Tesseract.createWorker("eng", 1, {
        workerPath: OCR_WORKER,
        corePath: OCR_CORE,
        langPath: OCR_LANG,
        logger: (message) => {
          if (message.status === "recognizing text") showNotice("Lecture des captures : " + Math.round(message.progress * 100) + " %");
        },
        errorHandler: () => showNotice("Erreur pendant la lecture d’une capture.", "error"),
      });
      await worker.setParameters({ preserve_interword_spaces: "1" });
      for (let index = 0; index < files.length; index += 1) {
        showNotice("Lecture de la capture " + (index + 1) + " sur " + files.length + "…");
        const result = await worker.recognize(files[index], {}, { tsv: true });
        rows.push(...rowsFromTsv(result.data.tsv || ""));
      }
      addRows(rows);
      screenInput.value = "";
      showNotice(rows.length + " membre(s) reconnu(s). Vérifie les noms et ID avant d’enregistrer le contrat.", "success");
    } catch (error) { showNotice(error.message || "La lecture des captures a échoué. Tu peux coller la liste manuellement.", "error"); }
    finally {
      if (worker) await worker.terminate().catch(() => {});
      screenButton.disabled = false;
      pasteButton.disabled = false;
    }
  });
})();

