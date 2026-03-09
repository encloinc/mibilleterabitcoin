import init, {
  createWallet,
  deriveWalletAccount,
  importWallet,
  init as initWallet,
  isMnemonicWord,
} from "/assets/pkg/mibilleterabitcoin_common.js";

const STORAGE_VERSION = 1;
const ACCOUNT_SETTINGS_VERSION = 1;
const KDF_ITERATIONS = 250000;
const STORAGE_KEY = window.APP_CONFIG.storage_key;
const ACCOUNT_STORAGE_KEY = `${STORAGE_KEY}.accounts`;

const ROUTES = {
  landing: "/",
  createWallet: "/create-wallet",
  importWallet: "/import-wallet",
  unlockWallet: "/unlock-wallet",
  unlockWalletDelete: "/unlock-wallet/delete",
  wallet: "/wallet",
  walletAccounts: "/wallet/accounts",
  walletAccountsCreate: "/wallet/accounts/create",
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
  accountSettings: null,
  verificationIndices: [],
  walletReady: false,
};

const CARD_TRANSITION_DURATION = 220;
const CARD_TRANSITION_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const CARD_TRANSITION_NEUTRAL_Y = 10;
const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
const supportsNativeCardTransitions = typeof Element !== "undefined" && typeof Element.prototype.animate === "function";
const navigationState = {
  activeScreenId: null,
  historyIndex: 0,
  suppressNextHashChange: false,
  transitionToken: 0,
  transitionLayer: null,
  animatedScreen: null,
  transitionAnimation: null,
};

const ALL_SCREEN_IDS = [
  "landing-screen",
  "create-screen",
  "backup-screen",
  "verify-screen",
  "import-phrase-screen",
  "import-password-screen",
  "unlock-screen",
  "unlock-delete-screen",
  "menu-screen",
  "accounts-screen",
  "account-create-screen",
  "account-edit-screen",
];

const flash = document.getElementById("flash");
const mnemonicSlots = [...document.querySelectorAll("[data-word-slot]")];
const verifyLabels = [...document.querySelectorAll("[data-verify-label]")];
const verifyInputs = [...document.querySelectorAll("[data-verify-input]")];
const importInputs = [...document.querySelectorAll("[data-import-word]")];
const walletAccountCard = document.getElementById("wallet-account-card");
const walletAccountName = document.getElementById("wallet-account-name");
const walletAddress = document.getElementById("wallet-address");
const createForm = document.getElementById("create-form");
const importPhraseForm = document.getElementById("import-phrase-form");
const importPasswordForm = document.getElementById("import-password-form");
const unlockForm = document.getElementById("unlock-form");
const verifyForm = document.getElementById("verify-form");
const accountCreateForm = document.getElementById("account-create-form");
const accountEditForm = document.getElementById("account-edit-form");
const accountCreateNameInput = document.getElementById("account-create-name");
const accountEditNameInput = document.getElementById("account-edit-name");
const trackedForms = [
  createForm,
  importPhraseForm,
  importPasswordForm,
  unlockForm,
  verifyForm,
  accountCreateForm,
  accountEditForm,
].filter(Boolean);
const passwordToggles = [...document.querySelectorAll("[data-password-toggle]")];
const passwordStrengthIndicators = [...document.querySelectorAll("[data-password-strength]")];
const routeLinks = [...document.querySelectorAll("[data-route-link]")];
const submitLinks = [...document.querySelectorAll("[data-submit-form]")];
const scrollFadeTargets = [...document.querySelectorAll("[data-scroll-fade-target]")];
const dragScrollAreas = [...document.querySelectorAll("[data-drag-scroll-area]")];
const screenStage = document.querySelector(".screen-stage");
const walletAccountsList = document.getElementById("wallet-accounts-list");

initializeHistoryState();
bindEventHandlers();
boot();

function bindEventHandlers() {
  window.addEventListener("resize", syncFlashWidth);
  window.addEventListener("popstate", handlePopState);
  window.addEventListener("hashchange", () => {
    if (navigationState.suppressNextHashChange) {
      navigationState.suppressNextHashChange = false;
      return;
    }

    syncRoute({ direction: "neutral" });
  });

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

  walletAccountCard?.addEventListener("click", () => {
    clearFlash();
    navigateTo(ROUTES.walletAccounts);
  });

  walletAccountsList?.addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-account-edit]");
    if (editButton) {
      clearFlash();
      navigateTo(`${ROUTES.walletAccounts}/edit/${editButton.dataset.accountEdit}`);
      return;
    }

    const selectButton = event.target.closest("[data-account-select]");
    if (selectButton) {
      clearFlash();
      selectWalletAccount(Number(selectButton.dataset.accountSelect));
    }
  });

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
    lockWalletSession();
  });

  document.getElementById("confirm-delete-wallet")?.addEventListener("click", forgetStoredWallet);
  document.getElementById("forget-wallet-menu")?.addEventListener("click", forgetStoredWallet);
  document.getElementById("forget-wallet-accounts")?.addEventListener("click", lockWalletSession);

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
      initializeAccountSettings({ reset: true });
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
      initializeAccountSettings({ reset: true });
      state.activeWallet = state.pendingWallet;
      clearCreateState();
      navigateTo(ROUTES.wallet);
    } catch (error) {
      setFlash(error.message || String(error));
    }
  });

  accountCreateForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    clearFlash();

    if (!ensureWalletReady()) {
      return;
    }

    if (!state.activeWallet) {
      navigateTo(ROUTES.unlockWallet);
      return;
    }

    const settings = getAccountSettings();
    const nextIndex = settings.walletIndex + 1;
    const accountName = normalizeAccountName(accountCreateNameInput?.value, nextIndex);

    try {
      deriveWalletAccount(
        state.activeWallet.mnemonic,
        state.activeWallet.network || window.APP_CONFIG.network,
        nextIndex,
      );
      saveAccountSettings({
        ...settings,
        walletIndex: nextIndex,
        activeIndex: nextIndex,
        names: {
          ...settings.names,
          [nextIndex]: accountName,
        },
      });
      accountCreateForm.reset();
      syncFormButtonStates();
      navigateTo(ROUTES.walletAccounts, "", { direction: "backward" });
    } catch (error) {
      setFlash(error.message || String(error));
    }
  });

  accountEditForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    clearFlash();

    if (!ensureWalletReady()) {
      return;
    }

    if (!state.activeWallet) {
      navigateTo(ROUTES.unlockWallet);
      return;
    }

    const editIndex = getWalletAccountEditIndex();
    const settings = getAccountSettings();
    if (editIndex === null || editIndex > settings.walletIndex) {
      navigateTo(ROUTES.walletAccounts, "", { direction: "backward" });
      return;
    }

    saveAccountSettings({
      ...settings,
      names: {
        ...settings.names,
        [editIndex]: normalizeAccountName(accountEditNameInput?.value, editIndex),
      },
    });
    accountEditForm.reset();
    syncFormButtonStates();
    navigateTo(ROUTES.walletAccounts, "", { direction: "backward" });
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
  syncRoute({ direction: "neutral", immediate: true });
}

function syncRoute(options = {}) {
  const { direction = "neutral", immediate = false } = options;
  const currentPath = getCurrentPath();

  switch (currentPath) {
    case ROUTES.landing:
      if (loadEncryptedWallet()) {
        navigateTo(ROUTES.unlockWallet, "", { direction: "neutral", immediate });
        return;
      }
      showScreen("landing-screen", { direction, immediate });
      break;
    case ROUTES.createWallet:
      syncCreateWalletRoute({ direction, immediate });
      break;
    case ROUTES.importWallet:
      syncImportWalletRoute({ direction, immediate });
      break;
    case ROUTES.unlockWallet:
    case ROUTES.unlockWalletDelete:
      if (!loadEncryptedWallet()) {
        navigateTo(ROUTES.landing, "", { direction: "neutral", immediate });
        return;
      }
      showScreen(pathToUnlockScreen(currentPath), { direction, immediate });
      break;
    default:
      if (isWalletRoute(currentPath)) {
        syncWalletRoute({ direction, immediate, path: currentPath });
        return;
      }

      navigateTo(ROUTES.landing, "", { direction: "neutral", immediate });
  }
}

function syncCreateWalletRoute(options = {}) {
  const { direction = "neutral", immediate = false } = options;
  let hash = normalizeHash(window.location.hash, CREATE_WALLET_STEPS.defaultHash, CREATE_WALLET_STEPS.hashToScreen, {
    direction,
    immediate,
  });

  if ((hash === "#backup" || hash === "#confirm-backup") && (!state.pendingWallet || !state.pendingPassword)) {
    clearCreateState();
    updateHash(CREATE_WALLET_STEPS.defaultHash, { replace: true, direction: "backward", immediate });
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

  showScreen(CREATE_WALLET_STEPS.hashToScreen[hash], { direction, immediate });
  syncFormButtonStates();
}

function syncImportWalletRoute(options = {}) {
  const { direction = "neutral", immediate = false } = options;
  let hash = normalizeHash(window.location.hash, IMPORT_WALLET_STEPS.defaultHash, IMPORT_WALLET_STEPS.hashToScreen, {
    direction,
    immediate,
  });

  if (hash === "#choose-password" && !state.pendingImportMnemonic) {
    updateHash(IMPORT_WALLET_STEPS.defaultHash, { replace: true, direction: "backward", immediate });
    return;
  }

  showScreen(IMPORT_WALLET_STEPS.hashToScreen[hash], { direction, immediate });
  syncFormButtonStates();
}

function syncWalletRoute(options = {}) {
  const { direction = "neutral", immediate = false, path = getCurrentPath() } = options;
  const payload = loadEncryptedWallet();
  if (!payload) {
    navigateTo(ROUTES.landing, "", { direction: "backward", immediate });
    return;
  }

  if (!state.activeWallet) {
    navigateTo(ROUTES.unlockWallet, "", { direction: "backward", immediate });
    return;
  }

  initializeAccountSettings();

  if (path === ROUTES.wallet) {
    renderWallet();
    showScreen("menu-screen", { direction, immediate });
    return;
  }

  if (path === ROUTES.walletAccounts) {
    renderAccountsList();
    showScreen("accounts-screen", { direction, immediate });
    return;
  }

  if (path === ROUTES.walletAccountsCreate) {
    prepareAccountCreateForm();
    showScreen("account-create-screen", { direction, immediate });
    return;
  }

  const editIndex = getWalletAccountEditIndex(path);
  if (editIndex === null || !prepareAccountEditForm(editIndex)) {
    navigateTo(ROUTES.walletAccounts, "", { direction: "backward", immediate });
    return;
  }

  showScreen("account-edit-screen", { direction, immediate });
}

function handleBackNavigation(currentScreenId, targetScreenId) {
  const currentPath = getCurrentPath();

  if (currentPath === ROUTES.createWallet) {
    if (targetScreenId === "landing-screen") {
      clearCreateState();
      navigateTo(ROUTES.landing, "", { direction: "backward" });
      return;
    }

    if (targetScreenId === "create-screen") {
      clearCreateState();
      updateHash(CREATE_WALLET_STEPS.defaultHash, { direction: "backward" });
      return;
    }

    if (targetScreenId === "backup-screen") {
      updateHash("#backup", { direction: "backward" });
      return;
    }
  }

  if (currentPath === ROUTES.importWallet) {
    if (targetScreenId === "landing-screen") {
      clearImportForm();
      navigateTo(ROUTES.landing, "", { direction: "backward" });
      return;
    }

    if (targetScreenId === "import-phrase-screen") {
      updateHash(IMPORT_WALLET_STEPS.defaultHash, { direction: "backward" });
      return;
    }
  }

  if (currentPath === ROUTES.walletAccounts && targetScreenId === "menu-screen") {
    navigateTo(ROUTES.wallet, "", { direction: "backward" });
    return;
  }

  if (
    (currentPath === ROUTES.walletAccountsCreate || getWalletAccountEditIndex(currentPath) !== null) &&
    targetScreenId === "accounts-screen"
  ) {
    navigateTo(ROUTES.walletAccounts, "", { direction: "backward" });
    return;
  }

  if (currentPath === ROUTES.unlockWalletDelete && targetScreenId === "unlock-screen") {
    navigateTo(ROUTES.unlockWallet, "", { direction: "backward" });
    return;
  }

  if (currentScreenId === "unlock-screen" && targetScreenId === "landing-screen") {
    navigateTo(ROUTES.landing, "", { direction: "backward" });
    return;
  }

  navigateTo(ROUTES.landing, "", { direction: "backward" });
}

function showScreen(activeScreenId, options = {}) {
  const { direction = "neutral", immediate = false } = options;
  const nextScreen = document.getElementById(activeScreenId);
  if (!nextScreen) {
    return;
  }

  const currentScreen = navigationState.activeScreenId
    ? document.getElementById(navigationState.activeScreenId)
    : getVisibleScreen();

  if (
    !currentScreen ||
    currentScreen.id === activeScreenId ||
    immediate ||
    prefersReducedMotion ||
    !screenStage ||
    !supportsNativeCardTransitions
  ) {
    cleanupCardTransition();
    setVisibleScreen(activeScreenId);
    navigationState.activeScreenId = activeScreenId;
    syncFlashWidth(nextScreen);
    syncScrollFadeTargets();
    return;
  }

  animateCardTransition(currentScreen, nextScreen, activeScreenId, direction);
}

function navigateTo(path, hash = "", options = {}) {
  const { direction = normalizePath(path) === getCurrentPath() ? "forward" : "neutral", immediate = false } = options;
  const nextUrl = `${path}${hash}`;
  const currentUrl = `${getCurrentPath()}${window.location.hash}`;
  if (nextUrl !== currentUrl) {
    const nextIndex = navigationState.historyIndex + 1;
    history.pushState({ navIndex: nextIndex }, "", nextUrl);
    navigationState.historyIndex = nextIndex;
  }
  syncRoute({ direction, immediate });
}

function updateHash(hash, options = {}) {
  const { replace = false, direction = "forward", immediate = false } = options;
  const method = replace ? "replaceState" : "pushState";
  const nextIndex = replace ? navigationState.historyIndex : navigationState.historyIndex + 1;
  history[method]({ navIndex: nextIndex }, "", `${getCurrentPath()}${hash}`);
  navigationState.historyIndex = nextIndex;
  syncRoute({ direction, immediate });
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

function isWalletRoute(pathname = getCurrentPath()) {
  const path = normalizePath(pathname);
  return (
    path === ROUTES.wallet ||
    path === ROUTES.walletAccounts ||
    path === ROUTES.walletAccountsCreate ||
    path.startsWith(`${ROUTES.walletAccounts}/edit/`) ||
    getWalletAccountEditIndex(path) !== null
  );
}

function pathToUnlockScreen(pathname = getCurrentPath()) {
  return normalizePath(pathname) === ROUTES.unlockWalletDelete ? "unlock-delete-screen" : "unlock-screen";
}

function getWalletAccountEditIndex(pathname = getCurrentPath()) {
  const match = normalizePath(pathname).match(/^\/wallet\/accounts\/edit\/(\d+)$/);
  if (!match) {
    return null;
  }

  const index = Number(match[1]);
  return Number.isInteger(index) && index >= 0 ? index : null;
}

function normalizeHash(hash, defaultHash, hashToScreen, options = {}) {
  if (!hash || !(hash in hashToScreen)) {
    updateHash(defaultHash, { replace: true, ...options });
    return defaultHash;
  }

  return hash;
}

function initializeHistoryState() {
  const historyIndex = getHistoryIndex(history.state);
  if (historyIndex === null) {
    history.replaceState({ navIndex: 0 }, "", `${getCurrentPath()}${window.location.hash}`);
    navigationState.historyIndex = 0;
    return;
  }

  navigationState.historyIndex = historyIndex;
}

function handlePopState(event) {
  const nextHistoryIndex = getHistoryIndex(event.state);
  const direction =
    nextHistoryIndex !== null && nextHistoryIndex < navigationState.historyIndex ? "backward" : "forward";

  navigationState.suppressNextHashChange = true;

  if (nextHistoryIndex !== null) {
    navigationState.historyIndex = nextHistoryIndex;
  }

  syncRoute({ direction });
}

function getHistoryIndex(historyState) {
  return typeof historyState?.navIndex === "number" ? historyState.navIndex : null;
}

function getVisibleScreen() {
  return ALL_SCREEN_IDS.map((screenId) => document.getElementById(screenId)).find(
    (screen) => screen && !screen.classList.contains("hidden"),
  );
}

function setVisibleScreen(activeScreenId) {
  ALL_SCREEN_IDS.forEach((screenId) => {
    const screen = document.getElementById(screenId);
    if (!screen) {
      return;
    }

    screen.classList.toggle("hidden", screenId !== activeScreenId);
    screen.style.visibility = "";

    if (screenId !== activeScreenId) {
      collapseScreenDisclosures(screen);
    }
  });

  syncFlashWidth(document.getElementById(activeScreenId));
}

function collapseScreenDisclosures(screen) {
  screen.querySelectorAll("details[open]").forEach((element) => {
    element.open = false;
  });
}

function syncFlashWidth(screen = getVisibleScreen()) {
  if (!flash || !screen) {
    return;
  }

  const width = Math.round(screen.getBoundingClientRect().width);
  if (width > 0) {
    flash.style.setProperty("--flash-width", `${width}px`);
  }
}

function animateCardTransition(currentScreen, nextScreen, activeScreenId, direction) {
  cleanupCardTransition();

  const transitionToken = ++navigationState.transitionToken;
  setGlobalTransitionLock(true);
  const stageRect = screenStage.getBoundingClientRect();
  const currentRect = currentScreen.getBoundingClientRect();
  const nextRect = measureScreenRect(nextScreen);
  const layer = createTransitionLayer();
  const incomingClone = createTransitionClone(nextScreen);
  layer.append(incomingClone);
  screenStage.append(layer);

  setTransitionLayerFrame(layer, nextRect, stageRect);
  navigationState.transitionLayer = layer;
  navigationState.animatedScreen = currentScreen;

  const incoming = getCardTransitionSteps(direction);
  const currentHeight = Math.round(currentRect.height);
  const nextHeight = Math.round(nextRect.height);

  screenStage.style.height = `${currentHeight}px`;

  const animationOptions = {
    autoplay: false,
    onComplete: () => {
      if (transitionToken !== navigationState.transitionToken) {
        return;
      }

      setVisibleScreen(activeScreenId);
      cleanupCardTransition();
      navigationState.activeScreenId = activeScreenId;
      syncFlashWidth(nextScreen);
      syncScrollFadeTargets();
    },
  };

  currentScreen.style.pointerEvents = "none";
  const nativeAnimationOptions = {
    duration: CARD_TRANSITION_DURATION,
    easing: CARD_TRANSITION_EASING,
    fill: "forwards",
  };
  const animations = [
    currentScreen.animate([{ opacity: 1 }, { opacity: 0 }], nativeAnimationOptions),
    incomingClone.animate(
      [
        {
          opacity: 0,
          transform: `translateY(${CARD_TRANSITION_NEUTRAL_Y}px) scale(0.992)`,
        },
        {
          opacity: 1,
          transform: "translateY(0) scale(1)",
        },
      ],
      nativeAnimationOptions,
    ),
    screenStage.animate(
      [{ height: `${currentHeight}px` }, { height: `${nextHeight}px` }],
      nativeAnimationOptions,
    ),
  ];

  navigationState.transitionAnimation = { token: transitionToken, animations };
  Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
    if (!navigationState.transitionAnimation || navigationState.transitionAnimation.token !== transitionToken) {
      return;
    }

    animationOptions.onComplete();
  });
}

function cleanupCardTransition() {
  if (navigationState.transitionAnimation) {
    navigationState.transitionAnimation.animations.forEach((animation) => {
      animation.cancel();
    });
    navigationState.transitionAnimation = null;
  }

  if (navigationState.animatedScreen) {
    navigationState.animatedScreen.style.pointerEvents = "";
    navigationState.animatedScreen.style.opacity = "";
    navigationState.animatedScreen.style.transform = "";
    navigationState.animatedScreen = null;
  }

  screenStage.style.height = "";
  setGlobalTransitionLock(false);
  navigationState.transitionLayer?.remove();
  navigationState.transitionLayer = null;
}

function createTransitionLayer() {
  const layer = document.createElement("div");
  layer.className = "screen-transition-layer";
  return layer;
}

function createTransitionClone(screen) {
  const clone = screen.cloneNode(true);
  stripCloneIds(clone);
  clone.classList.remove("hidden");
  clone.classList.add("screen-transition-card");
  return clone;
}

function measureScreenRect(screen) {
  const wasHidden = screen.classList.contains("hidden");
  const previousInlineStyles = {
    position: screen.style.position,
    left: screen.style.left,
    top: screen.style.top,
    transform: screen.style.transform,
    visibility: screen.style.visibility,
    pointerEvents: screen.style.pointerEvents,
    zIndex: screen.style.zIndex,
  };

  if (wasHidden) {
    screen.classList.remove("hidden");
  }

  screen.style.position = "absolute";
  screen.style.left = "50%";
  screen.style.top = "0";
  screen.style.transform = "translateX(-50%)";
  screen.style.visibility = "hidden";
  screen.style.pointerEvents = "none";
  screen.style.zIndex = "-1";

  const rect = screen.getBoundingClientRect();

  screen.style.position = previousInlineStyles.position;
  screen.style.left = previousInlineStyles.left;
  screen.style.top = previousInlineStyles.top;
  screen.style.transform = previousInlineStyles.transform;
  screen.style.visibility = previousInlineStyles.visibility;
  screen.style.pointerEvents = previousInlineStyles.pointerEvents;
  screen.style.zIndex = previousInlineStyles.zIndex;

  if (wasHidden) {
    screen.classList.add("hidden");
  }

  return rect;
}

function setTransitionLayerFrame(layer, elementRect, stageRect) {
  layer.style.left = `${elementRect.left - stageRect.left}px`;
  layer.style.top = `${elementRect.top - stageRect.top}px`;
  layer.style.width = `${elementRect.width}px`;
  layer.style.height = `${elementRect.height}px`;
}

function stripCloneIds(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  node.removeAttribute("id");
  node.querySelectorAll("[id]").forEach((element) => {
    element.removeAttribute("id");
  });
}

function getCardTransitionSteps(direction) {
  return {
    translateY: [CARD_TRANSITION_NEUTRAL_Y, 0],
    opacity: [0, 1],
    scale: [0.992, 1],
  };
}

function setGlobalTransitionLock(isLocked) {
  document.documentElement.classList.toggle("is-card-transitioning", isLocked);
  document.body.classList.toggle("is-card-transitioning", isLocked);
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

function renderWallet() {
  const account = getActiveWalletAccount();
  if (!account) {
    clearRenderedWalletAccount();
    return;
  }

  if (walletAccountName) {
    walletAccountName.textContent = account.name;
  }

  if (walletAddress) {
    walletAddress.textContent = formatWalletAddress(account.address || "");
  }
}

function renderAccountsList() {
  if (!walletAccountsList) {
    return;
  }

  const accounts = getWalletAccounts();
  const activeIndex = getAccountSettings().activeIndex;
  walletAccountsList.replaceChildren(...accounts.map((account) => createWalletAccountRow(account, activeIndex)));
}

function createWalletAccountRow(account, activeIndex) {
  const row = document.createElement("div");
  row.className = "wallet-account-list-item";
  row.setAttribute("role", "listitem");
  row.dataset.active = String(account.index === activeIndex);

  const selectButton = document.createElement("button");
  selectButton.type = "button";
  selectButton.className = "wallet-account-list-button";
  selectButton.dataset.accountSelect = String(account.index);
  selectButton.setAttribute("aria-pressed", String(account.index === activeIndex));

  const leading = document.createElement("div");
  leading.className = "wallet-account-list-leading";

  const icon = document.createElement("img");
  icon.className = "wallet-account-list-icon";
  icon.src =
    account.index === activeIndex
      ? "/assets/svgs/mibilleterabitcoin-icon-clean2.svg"
      : "/assets/svgs/mibilleterabitcoin-icon-clean.svg";
  icon.alt = "";

  const copy = document.createElement("div");
  copy.className = "wallet-account-list-copy";

  const title = document.createElement("p");
  title.className = "wallet-account-list-title";
  title.textContent = account.name;

  const address = document.createElement("p");
  address.className = "wallet-account-list-address";
  address.textContent = formatWalletAddress(account.address);

  copy.append(title, address);
  leading.append(icon, copy);
  selectButton.append(leading);

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "wallet-account-edit-button";
  editButton.dataset.accountEdit = String(account.index);
  editButton.setAttribute("aria-label", `Editar ${account.name}`);

  const editIcon = document.createElement("img");
  editIcon.className = "wallet-account-edit-icon";
  editIcon.src = "/assets/svgs/pencil.svg";
  editIcon.alt = "";
  editButton.append(editIcon);

  row.append(selectButton, editButton);
  return row;
}

function clearRenderedWalletAccount() {
  if (walletAccountName) {
    walletAccountName.textContent = "";
  }

  if (walletAddress) {
    walletAddress.textContent = "";
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

function getWalletAccounts() {
  if (!state.activeWallet) {
    return [];
  }

  const settings = getAccountSettings();
  const accounts = [];

  for (let index = 0; index <= settings.walletIndex; index += 1) {
    try {
      const account = deriveWalletAccount(
        state.activeWallet.mnemonic,
        state.activeWallet.network || window.APP_CONFIG.network,
        index,
      );
      accounts.push({
        ...account,
        name: getAccountName(index, settings),
      });
    } catch (error) {
      setFlash(error.message || String(error));
      break;
    }
  }

  return accounts;
}

function getActiveWalletAccount() {
  if (!state.activeWallet) {
    return null;
  }

  const settings = getAccountSettings();

  try {
    const account = deriveWalletAccount(
      state.activeWallet.mnemonic,
      state.activeWallet.network || window.APP_CONFIG.network,
      settings.activeIndex,
    );
    return {
      ...account,
      name: getAccountName(account.index, settings),
    };
  } catch (error) {
    setFlash(error.message || String(error));
    return null;
  }
}

function prepareAccountCreateForm() {
  if (!accountCreateForm || !accountCreateNameInput) {
    return;
  }

  const nextIndex = getAccountSettings().walletIndex + 1;
  accountCreateForm.reset();
  accountCreateNameInput.value = defaultAccountName(nextIndex);
  syncFormButtonStates();
}

function prepareAccountEditForm(index) {
  const settings = getAccountSettings();
  if (!accountEditForm || !accountEditNameInput || !Number.isInteger(index) || index < 0 || index > settings.walletIndex) {
    return false;
  }

  accountEditForm.reset();
  accountEditNameInput.value = getAccountName(index, settings);
  syncFormButtonStates();
  return true;
}

function selectWalletAccount(index) {
  const settings = getAccountSettings();
  if (!Number.isInteger(index) || index < 0 || index > settings.walletIndex) {
    return;
  }

  saveAccountSettings({
    ...settings,
    activeIndex: index,
  });
  renderWallet();
  navigateTo(ROUTES.wallet, "", { direction: "backward" });
}

function initializeAccountSettings(options = {}) {
  const { reset = false } = options;
  const settings = reset ? createDefaultAccountSettings() : loadAccountSettings();
  return saveAccountSettings(settings);
}

function getAccountSettings() {
  if (!state.accountSettings) {
    state.accountSettings = initializeAccountSettings();
  }

  return state.accountSettings;
}

function loadAccountSettings() {
  const raw = localStorage.getItem(ACCOUNT_STORAGE_KEY);
  if (!raw) {
    return createDefaultAccountSettings();
  }

  try {
    return normalizeAccountSettings(JSON.parse(raw));
  } catch (_error) {
    clearAccountSettingsStorage();
    return createDefaultAccountSettings();
  }
}

function saveAccountSettings(settings) {
  const normalized = normalizeAccountSettings(settings);
  state.accountSettings = normalized;
  localStorage.setItem(
    ACCOUNT_STORAGE_KEY,
    JSON.stringify({
      version: normalized.version,
      wallet_index: normalized.walletIndex,
      active_index: normalized.activeIndex,
      names: normalized.names,
    }),
  );
  return normalized;
}

function clearAccountSettingsStorage() {
  localStorage.removeItem(ACCOUNT_STORAGE_KEY);
  state.accountSettings = null;
}

function createDefaultAccountSettings() {
  return {
    version: ACCOUNT_SETTINGS_VERSION,
    walletIndex: 0,
    activeIndex: 0,
    names: {
      0: defaultAccountName(0),
    },
  };
}

function normalizeAccountSettings(settings) {
  const walletIndex =
    Number.isInteger(settings?.walletIndex) && settings.walletIndex >= 0
      ? settings.walletIndex
      : Number.isInteger(settings?.wallet_index) && settings.wallet_index >= 0
        ? settings.wallet_index
        : 0;
  const rawActiveIndex =
    Number.isInteger(settings?.activeIndex) && settings.activeIndex >= 0
      ? settings.activeIndex
      : Number.isInteger(settings?.active_index) && settings.active_index >= 0
        ? settings.active_index
        : 0;
  const activeIndex = Math.min(rawActiveIndex, walletIndex);
  const names = {};

  if (settings?.version === ACCOUNT_SETTINGS_VERSION && settings.names && typeof settings.names === "object") {
    Object.entries(settings.names).forEach(([rawIndex, rawName]) => {
      const index = Number(rawIndex);
      if (!Number.isInteger(index) || index < 0 || index > walletIndex || typeof rawName !== "string") {
        return;
      }

      names[index] = normalizeAccountName(rawName, index);
    });
  }

  for (let index = 0; index <= walletIndex; index += 1) {
    if (!names[index]) {
      names[index] = defaultAccountName(index);
    }
  }

  return {
    version: ACCOUNT_SETTINGS_VERSION,
    walletIndex,
    activeIndex,
    names,
  };
}

function getAccountName(index, settings = getAccountSettings()) {
  return settings.names[index] || defaultAccountName(index);
}

function normalizeAccountName(value, index) {
  const normalized = String(value ?? "").trim();
  return normalized || defaultAccountName(index);
}

function defaultAccountName(index) {
  return `Billetera #${index}`;
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
    clearAccountSettingsStorage();
    state.activeWallet = null;
    setFlash("Los datos almacenados de la billetera eran invalidos y se borraron.");
    return null;
  }
}

function forgetStoredWallet() {
  localStorage.removeItem(STORAGE_KEY);
  clearAccountSettingsStorage();
  state.activeWallet = null;
  clearCreateState();
  clearImportForm();
  clearRenderedWalletAccount();
  clearFlash();
  navigateTo(ROUTES.landing);
}

function lockWalletSession() {
  state.activeWallet = null;
  clearRenderedWalletAccount();
  clearFlash();

  if (loadEncryptedWallet()) {
    navigateTo(ROUTES.unlockWallet);
    return;
  }

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
