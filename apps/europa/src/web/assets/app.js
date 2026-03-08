import init, { createWallet, importWallet, init as initWallet, isMnemonicWord } from "/assets/pkg/mibilleterabitcoin_common.js";

const STORAGE_VERSION = 1;
const KDF_ITERATIONS = 250000;
const STORAGE_KEY = window.APP_CONFIG.storage_key;

const ROUTES = {
  landing: "/",
  createWallet: "/create-wallet",
  importWallet: "/import-wallet",
  unlockWallet: "/unlock-wallet",
  wallet: "/wallet",
};

const CREATE_WALLET_STEPS = {
  defaultHash: "#choose-password",
  screens: ["create-screen", "backup-screen", "verify-screen"],
  hashToScreen: {
    "#choose-password": "create-screen",
    "#backup": "backup-screen",
    "#confirm-backup": "verify-screen",
  },
};

const IMPORT_WALLET_STEPS = {
  defaultHash: "#provide-phrase",
  screens: ["import-phrase-screen", "import-password-screen"],
  hashToScreen: {
    "#provide-phrase": "import-phrase-screen",
    "#choose-password": "import-password-screen",
  },
};

const state = {
  pendingWallet: null,
  pendingPassword: "",
  pendingImportMnemonic: "",
  importAutoAdvanceFurthestIndex: -1,
  activeWallet: null,
  verificationIndices: [],
  walletReady: false,
};

const ALL_SCREEN_IDS = [
  "landing-screen",
  "create-screen",
  "backup-screen",
  "verify-screen",
  "import-phrase-screen",
  "import-password-screen",
  "unlock-screen",
  "menu-screen",
];

const flash = document.getElementById("flash");
const mnemonicSlots = [...document.querySelectorAll("[data-word-slot]")];
const verifyLabels = [...document.querySelectorAll("[data-verify-label]")];
const verifyInputs = [...document.querySelectorAll("[data-verify-input]")];
const importInputs = [...document.querySelectorAll("[data-import-word]")];
const walletAddress = document.getElementById("wallet-address");
const createForm = document.getElementById("create-form");
const importPhraseForm = document.getElementById("import-phrase-form");
const importPasswordForm = document.getElementById("import-password-form");
const unlockForm = document.getElementById("unlock-form");
const verifyForm = document.getElementById("verify-form");
const trackedForms = [createForm, importPhraseForm, importPasswordForm, unlockForm, verifyForm].filter(Boolean);
const passwordToggles = [...document.querySelectorAll("[data-password-toggle]")];
const passwordStrengthIndicators = [...document.querySelectorAll("[data-password-strength]")];
const routeLinks = [...document.querySelectorAll("[data-route-link]")];
const submitLinks = [...document.querySelectorAll("[data-submit-form]")];
const scrollFadeTargets = [...document.querySelectorAll("[data-scroll-fade-target]")];
const dragScrollAreas = [...document.querySelectorAll("[data-drag-scroll-area]")];

bindEventHandlers();
boot();

function bindEventHandlers() {
  window.addEventListener("popstate", syncRoute);
  window.addEventListener("hashchange", syncRoute);

  trackedForms.forEach((form) => {
    bindSubmitState(form);
    bindEnterToSubmit(form);
  });

  passwordToggles.forEach((toggle) => {
    togglePasswordVisibility(toggle);
  });

  passwordStrengthIndicators.forEach((indicator) => {
    bindPasswordStrengthIndicator(indicator);
  });

  routeLinks.forEach((link) => {
    bindRouteLink(link);
  });

  submitLinks.forEach((link) => {
    bindSubmitLink(link);
  });

  scrollFadeTargets.forEach((target) => {
    bindScrollFade(target);
  });

  dragScrollAreas.forEach((area) => {
    bindDragScroll(area);
  });

  bindImportWordAutoAdvance();

  document.querySelectorAll("[data-back]").forEach((button) => {
    button.addEventListener("click", () => {
      clearFlash();
      handleBackNavigation(button.closest(".screen")?.id, button.dataset.back);
    });
  });

  const continueToVerify = document.getElementById("continue-to-verify");
  continueToVerify?.addEventListener("click", (event) => {
    event.preventDefault();

    if (!state.pendingWallet || !state.pendingPassword) {
      clearCreateState();
      updateHash(CREATE_WALLET_STEPS.defaultHash, { replace: true });
      return;
    }

    prepareVerification();
    clearFlash();
    updateHash("#confirm-backup");
  });

  const lockWallet = document.getElementById("lock-wallet");
  lockWallet?.addEventListener("click", () => {
    state.activeWallet = null;
    if (walletAddress) {
      walletAddress.textContent = "";
    }

    if (loadEncryptedWallet()) {
      navigateTo(ROUTES.unlockWallet);
    } else {
      navigateTo(ROUTES.landing);
    }
  });

  document.getElementById("forget-wallet-unlock")?.addEventListener("click", forgetStoredWallet);
  document.getElementById("forget-wallet-menu")?.addEventListener("click", forgetStoredWallet);

  createForm?.addEventListener("submit", async (event) => {
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
      createForm.reset();
      resetPasswordVisibility(createForm);
      syncPasswordStrengthIndicators(createForm);
      syncFormButtonStates();
      updateHash("#backup");
    } catch (error) {
      setFlash(error.message || String(error));
    }
  });

  importPhraseForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFlash();

    if (!ensureWalletReady()) {
      return;
    }

    const mnemonic = getImportMnemonic();

    if (!isValidImportMnemonic(mnemonic)) {
      setFlash("Ingresa una frase mnemotecnica valida de 12 palabras antes de continuar.");
      return;
    }

    state.pendingImportMnemonic = mnemonic;
    updateHash("#choose-password");
  });

  importPasswordForm?.addEventListener("submit", async (event) => {
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

    if (!state.pendingImportMnemonic || !isValidImportMnemonic(state.pendingImportMnemonic)) {
      clearImportForm();
      updateHash(IMPORT_WALLET_STEPS.defaultHash, { replace: true });
      return;
    }

    try {
      const wallet = importWallet(state.pendingImportMnemonic, window.APP_CONFIG.network);
      await persistWallet(wallet, password);
      clearImportForm();
      state.activeWallet = wallet;
      navigateTo(ROUTES.wallet);
    } catch (error) {
      setFlash(error.message || String(error));
    }
  });

  unlockForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFlash();

    const payload = loadEncryptedWallet();
    const password = document.getElementById("unlock-password").value;

    if (!payload) {
      navigateTo(ROUTES.landing);
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
      unlockForm.reset();
      resetPasswordVisibility(unlockForm);
      navigateTo(ROUTES.wallet);
    } catch (error) {
      setFlash("No se pudo descifrar la billetera. Verifica la contraseña y la red.");
    }
  });

  verifyForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFlash();

    if (!state.pendingWallet || !state.pendingPassword) {
      clearCreateState();
      updateHash(CREATE_WALLET_STEPS.defaultHash, { replace: true });
      return;
    }

    if (!isVerifyFormCorrect()) {
      return;
    }

    try {
      await persistWallet(state.pendingWallet, state.pendingPassword);
      state.activeWallet = state.pendingWallet;
      clearCreateState();
      navigateTo(ROUTES.wallet);
    } catch (error) {
      setFlash(error.message || String(error));
    }
  });
}

async function boot() {
  try {
    await init();
    initWallet();
    state.walletReady = true;
  } catch (error) {
    setFlash("No se pudo cargar el motor de billeteras en el navegador.");
  }

  syncFormButtonStates();
  syncRoute();
}

function syncRoute() {
  switch (getCurrentPath()) {
    case ROUTES.landing:
      if (loadEncryptedWallet()) {
        navigateTo(ROUTES.unlockWallet);
        return;
      }
      showScreen("landing-screen");
      break;
    case ROUTES.createWallet:
      syncCreateWalletRoute();
      break;
    case ROUTES.importWallet:
      syncImportWalletRoute();
      break;
    case ROUTES.unlockWallet:
      if (!loadEncryptedWallet()) {
        navigateTo(ROUTES.landing);
        return;
      }
      showScreen("unlock-screen");
      break;
    case ROUTES.wallet:
      syncWalletRoute();
      break;
    default:
      navigateTo(ROUTES.landing);
  }
}

function syncCreateWalletRoute() {
  let hash = normalizeHash(window.location.hash, CREATE_WALLET_STEPS.defaultHash, CREATE_WALLET_STEPS.hashToScreen);

  if ((hash === "#backup" || hash === "#confirm-backup") && (!state.pendingWallet || !state.pendingPassword)) {
    clearCreateState();
    updateHash(CREATE_WALLET_STEPS.defaultHash, { replace: true });
    return;
  }

  if (hash === "#backup" && state.pendingWallet) {
    fillMnemonicGrid(state.pendingWallet.mnemonic);
  }

  if (hash === "#confirm-backup") {
    if (state.verificationIndices.length === 0) {
      prepareVerification();
    }
  }

  showScreen(CREATE_WALLET_STEPS.hashToScreen[hash]);
  syncFormButtonStates();
}

function syncImportWalletRoute() {
  let hash = normalizeHash(window.location.hash, IMPORT_WALLET_STEPS.defaultHash, IMPORT_WALLET_STEPS.hashToScreen);

  if (hash === "#choose-password" && !state.pendingImportMnemonic) {
    updateHash(IMPORT_WALLET_STEPS.defaultHash, { replace: true });
    return;
  }

  showScreen(IMPORT_WALLET_STEPS.hashToScreen[hash]);
  syncFormButtonStates();
}

function syncWalletRoute() {
  const payload = loadEncryptedWallet();
  if (!payload) {
    navigateTo(ROUTES.landing);
    return;
  }

  renderWallet(state.activeWallet || { address: payload.address || "" });
  showScreen("menu-screen");
}

function handleBackNavigation(currentScreenId, targetScreenId) {
  if (getCurrentPath() === ROUTES.createWallet) {
    if (targetScreenId === "landing-screen") {
      clearCreateState();
      navigateTo(ROUTES.landing);
      return;
    }

    if (targetScreenId === "create-screen") {
      clearCreateState();
      updateHash(CREATE_WALLET_STEPS.defaultHash);
      return;
    }

    if (targetScreenId === "backup-screen") {
      updateHash("#backup");
      return;
    }
  }

  if (getCurrentPath() === ROUTES.importWallet) {
    if (targetScreenId === "landing-screen") {
      clearImportForm();
      navigateTo(ROUTES.landing);
      return;
    }

    if (targetScreenId === "import-phrase-screen") {
      updateHash(IMPORT_WALLET_STEPS.defaultHash);
      return;
    }
  }

  if (currentScreenId === "unlock-screen" && targetScreenId === "landing-screen") {
    navigateTo(ROUTES.landing);
    return;
  }

  navigateTo(ROUTES.landing);
}

function showScreen(activeScreenId) {
  ALL_SCREEN_IDS.forEach((screenId) => {
    const screen = document.getElementById(screenId);
    if (!screen) {
      return;
    }

    screen.classList.toggle("hidden", screenId !== activeScreenId);
  });

  syncScrollFadeTargets();
}

function navigateTo(path, hash = "") {
  const nextUrl = `${path}${hash}`;
  const currentUrl = `${getCurrentPath()}${window.location.hash}`;
  if (nextUrl !== currentUrl) {
    history.pushState(null, "", nextUrl);
  }
  syncRoute();
}

function updateHash(hash, options = {}) {
  const { replace = false } = options;
  const method = replace ? "replaceState" : "pushState";
  history[method](null, "", `${getCurrentPath()}${hash}`);
  syncRoute();
}

function getCurrentPath() {
  return normalizePath(window.location.pathname);
}

function normalizePath(pathname) {
  if (!pathname || pathname === "/") {
    return "/";
  }

  return pathname.replace(/\/+$/, "");
}

function normalizeHash(hash, defaultHash, hashToScreen) {
  if (!hash || !(hash in hashToScreen)) {
    updateHash(defaultHash, { replace: true });
    return defaultHash;
  }

  return hash;
}

function ensureWalletReady() {
  if (!state.walletReady) {
    setFlash("El motor de billeteras aun se esta cargando.");
    return false;
  }

  return true;
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
    input.setCustomValidity("");
  });

  verifyLabels.forEach((label, slot) => {
    const index = state.verificationIndices[slot];
    label.textContent = `Palabra ${index + 1}`;
  });

  syncFormButtonStates();
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
    setFlash("Elige una contraseña de al menos 8 caracteres.");
    return false;
  }

  if (getPasswordStrength(password).level < 4) {
    setFlash("Elige una contraseña mas fuerte para continuar.");
    return false;
  }

  if (password !== confirmation) {
    setFlash("La confirmacion de la contraseña no coincide.");
    return false;
  }

  return true;
}

function isVerifyFormCorrect() {
  if (!state.pendingWallet) {
    return false;
  }

  const words = state.pendingWallet.mnemonic.split(" ");
  return state.verificationIndices.every((index, slot) => words[index] === verifyInputs[slot].value.trim().toLowerCase());
}

function renderWallet(wallet) {
  if (walletAddress) {
    walletAddress.textContent = formatWalletAddress(wallet.address || "");
  }
}

function formatWalletAddress(address) {
  if (!address) {
    return "";
  }

  if (address.length <= 19) {
    return address;
  }

  return `${address.slice(0, 8)}...${address.slice(-8)}`;
}

async function persistWallet(wallet, password) {
  const payload = await encryptWallet(wallet, password);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...payload, address: wallet.address }));
}

function loadEncryptedWallet() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const payload = JSON.parse(raw);
    if (payload.version !== STORAGE_VERSION) {
      throw new Error("Version de billetera no soportada");
    }
    return payload;
  } catch (error) {
    localStorage.removeItem(STORAGE_KEY);
    setFlash("Los datos almacenados de la billetera eran invalidos y se borraron.");
    return null;
  }
}

function forgetStoredWallet() {
  localStorage.removeItem(STORAGE_KEY);
  state.activeWallet = null;
  clearCreateState();
  clearImportForm();
  if (walletAddress) {
    walletAddress.textContent = "";
  }
  clearFlash();
  navigateTo(ROUTES.landing);
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
  if (!flash) {
    return;
  }

  flash.textContent = message;
  flash.classList.remove("hidden");
}

function clearFlash() {
  if (!flash) {
    return;
  }

  flash.textContent = "";
  flash.classList.add("hidden");
}

function clearCreateState() {
  state.pendingWallet = null;
  state.pendingPassword = "";
  state.verificationIndices = [];
  createForm?.reset();
  verifyForm?.reset();
  resetPasswordVisibility(createForm);

  verifyInputs.forEach((input) => {
    input.setCustomValidity("");
  });

  verifyLabels.forEach((label, index) => {
    label.textContent = `Palabra ${index + 1}`;
  });

  mnemonicSlots.forEach((slot) => {
    slot.querySelector(".word-value").textContent = "••••";
  });

  syncPasswordStrengthIndicators(createForm);
  syncFormButtonStates();
}

function clearImportForm() {
  state.pendingImportMnemonic = "";
  state.importAutoAdvanceFurthestIndex = -1;
  importPhraseForm?.reset();
  importPasswordForm?.reset();
  resetPasswordVisibility(importPasswordForm);
  syncPasswordStrengthIndicators(importPasswordForm);
  syncFormButtonStates();
}

function bindSubmitState(form) {
  const submitControls = [...document.querySelectorAll(`[data-submit-form="${form.id}"]`)];
  const sync = () => {
    applyMatchValidity(form);
    applyFormSpecificValidity(form);
    const isValid = form.checkValidity();

    submitControls.forEach((control) => {
      control.setAttribute("aria-disabled", String(!isValid));
      control.tabIndex = isValid ? 0 : -1;
    });
  };

  form.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", sync);
    input.addEventListener("change", sync);
  });

  form.__syncSubmitState = sync;
  sync();
}

function bindEnterToSubmit(form) {
  const inputs = [...form.querySelectorAll("input")];
  const lastInput = inputs.at(-1);
  if (!lastInput) {
    return;
  }

  lastInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    event.preventDefault();

    if (!form.checkValidity()) {
      return;
    }

    form.requestSubmit();
  });
}

function bindRouteLink(link) {
  link.addEventListener("click", (event) => {
    if (!shouldHandleClientClick(event)) {
      return;
    }

    event.preventDefault();
    clearFlash();

    const url = new URL(link.href, window.location.origin);
    const currentPath = getCurrentPath();

    if (url.pathname === ROUTES.createWallet && currentPath !== ROUTES.createWallet) {
      clearCreateState();
    }

    if (url.pathname === ROUTES.importWallet && currentPath !== ROUTES.importWallet) {
      clearImportForm();
    }

    navigateTo(normalizePath(url.pathname), url.hash);
  });
}

function bindSubmitLink(link) {
  link.addEventListener("click", (event) => {
    event.preventDefault();

    if (link.getAttribute("aria-disabled") === "true") {
      return;
    }

    const form = document.getElementById(link.dataset.submitForm);
    form?.requestSubmit();
  });
}

function bindScrollFade(target) {
  const shell = target.closest("[data-scroll-fade-shell]");
  if (!shell) {
    return;
  }

  const sync = () => {
    const maxScrollTop = target.scrollHeight - target.clientHeight;
    const hasOverflow = maxScrollTop > 1;
    const atBottom = !hasOverflow || target.scrollTop >= maxScrollTop - 1;
    shell.dataset.hasOverflow = String(hasOverflow);
    shell.dataset.atBottom = String(atBottom);
  };

  target.addEventListener("scroll", sync, { passive: true });
  window.addEventListener("resize", sync);
  target.__syncScrollFade = sync;
  sync();
}

function syncScrollFadeTargets() {
  scrollFadeTargets.forEach((target) => {
    target.__syncScrollFade?.();
  });
}

function bindDragScroll(area) {
  const target = area.closest("[data-scroll-fade-target]");
  if (!target) {
    return;
  }

  const hasItems = area.querySelector(".wallet-transaction-card") !== null;
  area.dataset.dragEnabled = String(hasItems);
  if (!hasItems) {
    return;
  }

  const stopMomentum = () => {
    if (target.__dragMomentumFrame) {
      window.cancelAnimationFrame(target.__dragMomentumFrame);
      target.__dragMomentumFrame = null;
    }
  };

  const startMomentum = (initialVelocity) => {
    stopMomentum();

    let velocity = initialVelocity;

    const tick = () => {
      if (Math.abs(velocity) < 0.1) {
        target.__dragMomentumFrame = null;
        return;
      }

      const previousScrollTop = target.scrollTop;
      target.scrollTop -= velocity;

      if (target.scrollTop === previousScrollTop) {
        target.__dragMomentumFrame = null;
        return;
      }

      velocity *= 0.95;
      target.__dragMomentumFrame = window.requestAnimationFrame(tick);
    };

    target.__dragMomentumFrame = window.requestAnimationFrame(tick);
  };

  area.addEventListener("mousedown", (event) => {
    if (event.button !== 0) {
      return;
    }

    if (event.target.closest("button, a, input, textarea, select, label, summary")) {
      return;
    }

    const maxScrollTop = target.scrollHeight - target.clientHeight;
    if (maxScrollTop <= 1) {
      return;
    }

    stopMomentum();

    const startY = event.clientY;
    const startScrollTop = target.scrollTop;
    let lastY = startY;
    let lastTime = performance.now();
    let velocity = 0;

    area.classList.add("dragging");

    const onMouseMove = (moveEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const now = performance.now();
      const elapsed = Math.max(now - lastTime, 1);
      velocity = (moveEvent.clientY - lastY) / elapsed * 16;
      lastY = moveEvent.clientY;
      lastTime = now;
      target.scrollTop = startScrollTop - deltaY;
      moveEvent.preventDefault();
    };

    const stopDragging = () => {
      area.classList.remove("dragging");
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", stopDragging);

      if (Math.abs(velocity) > 0.5) {
        startMomentum(velocity);
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", stopDragging, { once: true });
  });
}

function bindImportWordAutoAdvance() {
  importInputs.forEach((input, index) => {
    const nextInput = importInputs[index + 1];

    const clearPendingAdvance = () => {
      if (input.__autoAdvanceTimeout) {
        window.clearTimeout(input.__autoAdvanceTimeout);
        input.__autoAdvanceTimeout = null;
      }
    };

    input.addEventListener("focus", () => {
      state.importAutoAdvanceFurthestIndex = Math.max(state.importAutoAdvanceFurthestIndex, index);
    });

    input.addEventListener("input", () => {
      clearPendingAdvance();

      const value = input.value.trim().toLowerCase();
      if (
        !nextInput ||
        nextInput.value.trim().length > 0 ||
        state.importAutoAdvanceFurthestIndex !== index ||
        !isMnemonicWord(value)
      ) {
        return;
      }

      input.__autoAdvanceTimeout = window.setTimeout(() => {
        if (document.activeElement !== input) {
          return;
        }

        nextInput.focus();
        nextInput.select();
      }, 400);
    });

    input.addEventListener("blur", clearPendingAdvance);
  });
}

function shouldHandleClientClick(event) {
  return !(event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);
}

function applyMatchValidity(form) {
  form.querySelectorAll("[data-match-id]").forEach((input) => {
    const matchedInput = document.getElementById(input.dataset.matchId);
    if (!matchedInput) {
      return;
    }

    const hasMismatch =
      input.value.length > 0 &&
      matchedInput.value.length > 0 &&
      input.value !== matchedInput.value;
    input.setCustomValidity(hasMismatch ? "Las contraseñas no coinciden." : "");
  });
}

function applyFormSpecificValidity(form) {
  if (form.id === "import-phrase-form") {
    const firstInput = importInputs[0];
    if (!firstInput) {
      return;
    }

    const mnemonic = getImportMnemonic();
    const hasAnyValue = importInputs.some((input) => input.value.trim().length > 0);
    const hasAllWords = importInputs.every((input) => input.value.trim().length > 0);
    const isValid = hasAllWords && isValidImportMnemonic(mnemonic);

    firstInput.setCustomValidity(hasAnyValue && !isValid ? "Ingresa una frase mnemotecnica valida." : "");
    return;
  }

  if (form.id === "create-form" || form.id === "import-password-form") {
    const passwordInput = form.querySelector('input[type="password"], input[type="text"]');
    if (!passwordInput) {
      return;
    }

    const password = passwordInput.value;
    const isStrongEnough = getPasswordStrength(password).level === 4;
    passwordInput.setCustomValidity(password.length > 0 && !isStrongEnough ? "La contraseña debe ser fuerte." : "");
    return;
  }

  if (form.id !== "verify-form") {
    return;
  }

  const words = state.pendingWallet?.mnemonic?.split(" ") ?? [];

  verifyInputs.forEach((input, slot) => {
    const expectedIndex = state.verificationIndices[slot];
    const expectedWord = typeof expectedIndex === "number" ? words[expectedIndex] : "";
    const value = input.value.trim().toLowerCase();
    const hasValue = value.length > 0;
    const isCorrect = hasValue && expectedWord && value === expectedWord;

    input.setCustomValidity(hasValue && !isCorrect ? "La palabra no coincide." : "");
  });
}

function syncFormButtonStates() {
  trackedForms.forEach((form) => {
    form.__syncSubmitState?.();
  });
}

function togglePasswordVisibility(toggle) {
  const input = document.getElementById(toggle.dataset.passwordToggle);
  const icon = toggle.querySelector("[data-password-toggle-icon]");
  if (!input || !icon) {
    return;
  }

  const sync = () => {
    const isVisible = input.type === "text";
    toggle.setAttribute("aria-label", isVisible ? "Ocultar contraseña" : "Mostrar contraseña");
    icon.src = isVisible ? "/assets/svgs/eye-bold.svg" : "/assets/svgs/eye-closed-bold.svg";
  };

  toggle.addEventListener("click", () => {
    input.type = input.type === "password" ? "text" : "password";
    sync();
  });

  toggle.__syncPasswordToggle = sync;
  sync();
}

function resetPasswordVisibility(form) {
  if (!form) {
    return;
  }

  form.querySelectorAll("[data-password-toggle]").forEach((toggle) => {
    const input = document.getElementById(toggle.dataset.passwordToggle);
    if (input) {
      input.type = "password";
    }
    toggle.__syncPasswordToggle?.();
  });
}

function bindPasswordStrengthIndicator(indicator) {
  const input = document.getElementById(indicator.dataset.passwordStrength);
  const bars = [...indicator.querySelectorAll("[data-strength-bar]")];
  if (!input || bars.length === 0) {
    return;
  }

  const sync = () => {
    const strength = getPasswordStrength(input.value);
    indicator.dataset.hasValue = String(input.value.trim().length > 0);
    indicator.dataset.strengthLevel = String(strength.level);
    bars.forEach((bar, index) => {
      bar.classList.toggle("active", index < strength.level);
    });
  };

  input.addEventListener("input", sync);
  input.addEventListener("change", sync);
  indicator.__syncPasswordStrength = sync;
  sync();
}

function syncPasswordStrengthIndicators(form) {
  if (!form) {
    return;
  }

  form.querySelectorAll("[data-password-strength]").forEach((indicator) => {
    indicator.__syncPasswordStrength?.();
  });
}

function getPasswordStrength(password) {
  const normalized = password.trim();
  if (normalized.length === 0) {
    return { level: 0 };
  }

  let score = 0;
  if (normalized.length >= 8) {
    score += 1;
  }
  if (normalized.length >= 12) {
    score += 1;
  }
  if (/[a-z]/.test(normalized) && /[A-Z]/.test(normalized)) {
    score += 1;
  }
  if (/\d/.test(normalized)) {
    score += 1;
  }
  if (/[^A-Za-z0-9]/.test(normalized)) {
    score += 1;
  }

  if (score <= 1) {
    return { level: 1 };
  }
  if (score === 2) {
    return { level: 2 };
  }
  if (score === 3) {
    return { level: 3 };
  }

  return { level: 4 };
}

function getImportMnemonic() {
  return importInputs
    .map((input) => input.value.trim().toLowerCase())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function isValidImportMnemonic(mnemonic) {
  if (!mnemonic || mnemonic.split(" ").length !== 12) {
    return false;
  }

  try {
    importWallet(mnemonic, window.APP_CONFIG.network);
    return true;
  } catch (_error) {
    return false;
  }
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
