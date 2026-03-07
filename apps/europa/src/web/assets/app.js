import init, { createWallet, importWallet, init as initWallet } from "/assets/pkg/europa_common.js";

const STORAGE_VERSION = 1;
const KDF_ITERATIONS = 250000;
const STORAGE_KEY = window.APP_CONFIG.storage_key;

const state = {
  pendingWallet: null,
  pendingPassword: "",
  activeWallet: null,
  verificationIndices: [],
  walletReady: false,
};

const flash = document.getElementById("flash");
const screenIds = [
  "landing-screen",
  "create-screen",
  "backup-screen",
  "verify-screen",
  "import-screen",
  "unlock-screen",
  "menu-screen",
];

const mnemonicSlots = [...document.querySelectorAll("[data-word-slot]")];
const verifyLabels = [...document.querySelectorAll("[data-verify-label]")];
const verifyInputs = [...document.querySelectorAll("[data-verify-input]")];
const importInputs = [...document.querySelectorAll("[data-import-word]")];
const walletAddress = document.getElementById("wallet-address");
const createForm = document.getElementById("create-form");
const importForm = document.getElementById("import-form");
const unlockForm = document.getElementById("unlock-form");
const verifyForm = document.getElementById("verify-form");

document.getElementById("show-create").addEventListener("click", () => {
  clearCreateState();
  clearFlash();
  showScreen("create-screen");
});

document.getElementById("show-import").addEventListener("click", () => {
  clearImportForm();
  clearFlash();
  showScreen("import-screen");
});

document.querySelectorAll("[data-back]").forEach((button) => {
  button.addEventListener("click", () => {
    clearFlash();
    showScreen(button.dataset.back);
  });
});

document.getElementById("cancel-create").addEventListener("click", () => {
  clearCreateState();
  clearFlash();
  showScreen("landing-screen");
});

document.getElementById("continue-to-verify").addEventListener("click", () => {
  if (!state.pendingWallet) {
    setFlash("No generated wallet is available to verify.");
    showScreen("create-screen");
    return;
  }

  prepareVerification();
  clearFlash();
  showScreen("verify-screen");
});

document.getElementById("back-to-backup").addEventListener("click", () => {
  clearFlash();
  showScreen("backup-screen");
});

document.getElementById("lock-wallet").addEventListener("click", () => {
  state.activeWallet = null;
  walletAddress.textContent = "";
  clearFlash();
  showInitialScreen();
});

document.getElementById("forget-wallet-unlock").addEventListener("click", forgetStoredWallet);
document.getElementById("forget-wallet-menu").addEventListener("click", forgetStoredWallet);

createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearFlash();

  if (!ensureWalletReady()) {
    return;
  }

  const password = document.getElementById("create-password").value;
  const passwordConfirm = document.getElementById("create-password-confirm").value;

  if (!validatePassword(password, passwordConfirm)) {
    return;
  }

  try {
    const wallet = createWallet(window.APP_CONFIG.network);
    state.pendingWallet = wallet;
    state.pendingPassword = password;
    fillMnemonicGrid(wallet.mnemonic);
    showScreen("backup-screen");
    createForm.reset();
  } catch (error) {
    setFlash(error.message || String(error));
  }
});

importForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearFlash();

  if (!ensureWalletReady()) {
    return;
  }

  const password = document.getElementById("import-password").value;
  const passwordConfirm = document.getElementById("import-password-confirm").value;

  if (!validatePassword(password, passwordConfirm)) {
    return;
  }

  const mnemonic = importInputs
    .map((input) => input.value.trim().toLowerCase())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (mnemonic.split(" ").length !== 12 || mnemonic.includes("  ")) {
    setFlash("Enter all 12 mnemonic words before importing.");
    return;
  }

  try {
    const wallet = importWallet(mnemonic, window.APP_CONFIG.network);
    await persistWallet(wallet, password);
    clearImportForm();
    state.activeWallet = wallet;
    renderWallet(wallet);
    showScreen("menu-screen");
  } catch (error) {
    setFlash(error.message || String(error));
  }
});

unlockForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearFlash();

  const payload = loadEncryptedWallet();
  const password = document.getElementById("unlock-password").value;

  if (!payload) {
    showInitialScreen();
    return;
  }

  try {
    const wallet = await decryptWallet(payload, password);

    if (wallet.network !== window.APP_CONFIG.network) {
      throw new Error(
        `Stored wallet network ${wallet.network} does not match configured network ${window.APP_CONFIG.network}.`,
      );
    }

    state.activeWallet = wallet;
    renderWallet(wallet);
    unlockForm.reset();
    showScreen("menu-screen");
  } catch (error) {
    setFlash("Unable to decrypt wallet. Check the password and network.");
  }
});

verifyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearFlash();

  if (!state.pendingWallet || !state.pendingPassword) {
    setFlash("Generated wallet state is missing. Start again.");
    showScreen("create-screen");
    return;
  }

  const words = state.pendingWallet.mnemonic.split(" ");
  const valid = state.verificationIndices.every((index, slot) => {
    return words[index] === verifyInputs[slot].value.trim().toLowerCase();
  });

  if (!valid) {
    setFlash("One or more verification words do not match the saved phrase.");
    return;
  }

  try {
    await persistWallet(state.pendingWallet, state.pendingPassword);
    state.activeWallet = state.pendingWallet;
    renderWallet(state.pendingWallet);
    clearCreateState();
    showScreen("menu-screen");
  } catch (error) {
    setFlash(error.message || String(error));
  }
});

boot();

async function boot() {
  try {
    await init();
    initWallet();
    state.walletReady = true;
  } catch (error) {
    setFlash("Failed to load the in-browser wallet engine.");
    return;
  }

  showInitialScreen();
}

function ensureWalletReady() {
  if (!state.walletReady) {
    setFlash("Wallet engine is still loading.");
    return false;
  }

  return true;
}

function showInitialScreen() {
  unlockForm.reset();
  clearFlash();
  if (loadEncryptedWallet()) {
    showScreen("unlock-screen");
  } else {
    showScreen("landing-screen");
  }
}

function showScreen(id) {
  screenIds.forEach((screenId) => {
    document.getElementById(screenId).classList.toggle("hidden", screenId !== id);
  });
}

function fillMnemonicGrid(mnemonic) {
  const words = mnemonic.split(" ");
  mnemonicSlots.forEach((slot, index) => {
    slot.querySelector(".word-value").textContent = words[index] || "----";
  });
}

function prepareVerification() {
  const words = state.pendingWallet.mnemonic.split(" ");
  state.verificationIndices = pickUniqueIndices(words.length, 4);
  verifyInputs.forEach((input) => {
    input.value = "";
  });
  verifyLabels.forEach((label, slot) => {
    const index = state.verificationIndices[slot];
    label.textContent = `Word ${index + 1}`;
  });
}

function pickUniqueIndices(max, count) {
  const available = Array.from({ length: max }, (_, index) => index);
  const picked = [];

  while (picked.length < count && available.length > 0) {
    const randomBytes = new Uint32Array(1);
    crypto.getRandomValues(randomBytes);
    const choice = randomBytes[0] % available.length;
    picked.push(available.splice(choice, 1)[0]);
  }

  return picked;
}

function validatePassword(password, confirmation) {
  if (password.length < 8) {
    setFlash("Choose a password with at least 8 characters.");
    return false;
  }

  if (password !== confirmation) {
    setFlash("Password confirmation does not match.");
    return false;
  }

  return true;
}

function renderWallet(wallet) {
  walletAddress.textContent = wallet.address;
}

async function persistWallet(wallet, password) {
  const payload = await encryptWallet(wallet, password);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function loadEncryptedWallet() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const payload = JSON.parse(raw);
    if (payload.version !== STORAGE_VERSION) {
      throw new Error("Unsupported wallet version");
    }
    return payload;
  } catch (error) {
    localStorage.removeItem(STORAGE_KEY);
    setFlash("Stored wallet data was invalid and has been cleared.");
    return null;
  }
}

function forgetStoredWallet() {
  localStorage.removeItem(STORAGE_KEY);
  state.activeWallet = null;
  clearCreateState();
  clearImportForm();
  walletAddress.textContent = "";
  clearFlash();
  showScreen("landing-screen");
}

async function encryptWallet(wallet, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(wallet));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext),
  );

  return {
    version: STORAGE_VERSION,
    network: window.APP_CONFIG.network,
    kdf: {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: KDF_ITERATIONS,
      salt: toBase64(salt),
    },
    cipher: {
      name: "AES-GCM",
      iv: toBase64(iv),
      data: toBase64(ciphertext),
    },
  };
}

async function decryptWallet(payload, password) {
  const salt = fromBase64(payload.kdf.salt);
  const iv = fromBase64(payload.cipher.iv);
  const ciphertext = fromBase64(payload.cipher.data);
  const key = await deriveKey(password, salt, payload.kdf.iterations);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext));
}

async function deriveKey(password, salt, iterations = KDF_ITERATIONS) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations,
    },
    keyMaterial,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"],
  );
}

function setFlash(message) {
  flash.textContent = message;
  flash.classList.remove("hidden");
}

function clearFlash() {
  flash.textContent = "";
  flash.classList.add("hidden");
}

function clearCreateState() {
  state.pendingWallet = null;
  state.pendingPassword = "";
  state.verificationIndices = [];
  createForm.reset();
  verifyForm.reset();
  mnemonicSlots.forEach((slot) => {
    slot.querySelector(".word-value").textContent = "••••";
  });
}

function clearImportForm() {
  importForm.reset();
}

function toBase64(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function fromBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
