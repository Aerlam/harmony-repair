const statusPanel = document.querySelector("#auth-status");
const signInButton = document.querySelector("#discord-signin");
const signedInPanel = document.querySelector("#signed-in");
const signOutForm = document.querySelector("#signout-form");

function showStatus(message, state = "info") {
  statusPanel.textContent = message;
  statusPanel.dataset.state = state;
  statusPanel.hidden = !message;
}

async function getJson(url) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("request_failed");
  return response.json();
}

async function loadLoginState() {
  try {
    const { configured } = await getJson("/api/auth/status");
    if (!configured) {
      signInButton.disabled = true;
      showStatus("La connexion Discord est en cours de configuration.");
      return;
    }

    const session = await getJson("/api/auth/session");
    const csrf = await getJson("/api/auth/csrf");
    document.querySelector("#signin-csrf-token").value = csrf.csrfToken;
    document.querySelector("#csrf-token").value = csrf.csrfToken;
    const user = session?.user;
    if (user) {
      signInButton.hidden = true;
      signedInPanel.hidden = false;
      document.querySelector("#user-name").textContent = user.name || "Compte Discord";
      const avatar = document.querySelector("#user-avatar");
      if (user.image) {
        avatar.src = user.image;
      } else {
        avatar.hidden = true;
      }

      showStatus("");
      return;
    }

    signInButton.disabled = false;
    const params = new URLSearchParams(window.location.search);
    if (params.has("error")) {
      showStatus("La connexion n’a pas abouti. Vous pouvez réessayer.", "error");
    } else {
      showStatus("");
    }
  } catch {
    signInButton.disabled = true;
    showStatus("La connexion est momentanément indisponible. Réessayez un peu plus tard.", "error");
  }
}

signOutForm.addEventListener("submit", (event) => {
  if (!document.querySelector("#csrf-token").value) {
    event.preventDefault();
    showStatus("La session de sécurité a expiré. Rechargez la page puis réessayez.", "error");
  }
});

loadLoginState();
