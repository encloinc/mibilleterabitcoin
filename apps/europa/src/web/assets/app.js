import init, {
  createWallet,
  deriveWalletAccount,
  importWallet,
  init as initWallet,
  isMnemonicWord,
  prepareSendTx,
  validateBitcoinAddress,
} from "/assets/pkg/mibilleterabitcoin_common.js";

window.APP_CONFIG.network = normalizeNetworkName(window.APP_CONFIG.network);

const STORAGE_VERSION = 1;
const ACCOUNT_SETTINGS_VERSION = 1;
const KDF_ITERATIONS = 250000;
const STORAGE_KEY = window.APP_CONFIG.storage_key;
const ACCOUNT_STORAGE_KEY = `${STORAGE_KEY}.accounts`;
const REQUIRED_CONFIRMATIONS = Number(window.APP_CONFIG.required_confirmations) > 0
  ? Number(window.APP_CONFIG.required_confirmations)
  : 3;
const TX_REFRESH_PAGES_MAX = Number(window.APP_CONFIG.tx_refresh_pages_max) > 0
  ? Number(window.APP_CONFIG.tx_refresh_pages_max)
  : 3;
const BTC_TO_MXN_RATE =
  typeof window.BTC_TO_MXN_RATE === "number" && Number.isFinite(window.BTC_TO_MXN_RATE) ? window.BTC_TO_MXN_RATE : null;
const ESPLORA_PAGE_SIZE = 25;
const WALLET_TX_REFRESH_INTERVAL_MS = 60_000;
const NETWORK_BITCOIN_SYMBOL = getNetworkBitcoinSymbol(window.APP_CONFIG.network);
const NETWORK_BITCOIN_ICON_SRC = getNetworkBitcoinIconSrc(window.APP_CONFIG.network);

const ROUTES = {
  landing: "/",
  createWallet: "/create-wallet",
  importWallet: "/import-wallet",
  unlockWallet: "/unlock-wallet",
  unlockWalletDelete: "/unlock-wallet/delete",
  wallet: "/wallet",
  walletBackup: "/wallet/backup",
  walletBackupReveal: "/wallet/backup/reveal",
  walletReceive: "/wallet/receive",
  walletSend: "/wallet/send",
  walletSendScan: "/wallet/send/scan",
  walletSendSuccess: "/wallet/send/success",
  walletSendError: "/wallet/send/error",
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

class ElectrsEsploraClass {
  constructor(baseUrl, explorerBaseUrl) {
    this.baseUrl = normalizeServiceBaseUrl(baseUrl);
    this.explorerBaseUrl = normalizeServiceBaseUrl(explorerBaseUrl);
  }

  async getTxs(options = {}) {
    const { address, scriptHash, lastSeenTxId } = options;
    let path = `${this.buildChainPath({ address, scriptHash })}/txs`;
    if (lastSeenTxId) {
      path += `/chain/${encodeURIComponent(lastSeenTxId)}`;
    }

    return this.getJson(path);
  }

  async getUtxos(options = {}) {
    const { address, scriptHash } = options;
    return this.getJson(`${this.buildChainPath({ address, scriptHash })}/utxo`);
  }

  async getFeeEstimates() {
    return this.getJson("/fee-estimates");
  }

  async getScriptpubkeyChainStats(options = {}) {
    const { address, scriptHash } = options;
    return this.getJson(this.buildChainPath({ address, scriptHash }));
  }

  async getTipHeight() {
    const response = await fetch(`${this.baseUrl}/blocks/tip/height`);
    if (!response.ok) {
      throw new Error(`No se pudo cargar la altura de la cadena (${response.status}).`);
    }

    const rawHeight = await response.text();
    const tipHeight = Number.parseInt(rawHeight, 10);
    if (!Number.isFinite(tipHeight)) {
      throw new Error("La altura de la cadena recibida desde Esplora no era valida.");
    }

    return tipHeight;
  }

  async postTx(txHex) {
    const response = await fetch(`${this.baseUrl}/tx`, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
      },
      body: txHex,
    });

    if (!response.ok) {
      const detail = (await response.text()).trim();
      throw new Error(detail || `No se pudo transmitir la transaccion (${response.status}).`);
    }

    return response.text();
  }

  getTxExplorerUrl(txid) {
    return `${this.explorerBaseUrl}/tx/${encodeURIComponent(txid)}`;
  }

  buildChainPath({ address, scriptHash }) {
    if (scriptHash) {
      return `/scripthash/${encodeURIComponent(scriptHash)}`;
    }

    if (address) {
      return `/address/${encodeURIComponent(address)}`;
    }

    throw new Error("ElectrsEsploraClass requiere address o scriptHash.");
  }

  async getJson(path) {
    const response = await fetch(`${this.baseUrl}${path}`);
    if (!response.ok) {
      throw new Error(`No se pudo cargar la informacion de Esplora (${response.status}).`);
    }

    return response.json();
  }
}

const state = {
  pendingWallet: null,
  pendingPassword: "",
  pendingImportMnemonic: "",
  importAutoAdvanceFurthestIndex: -1,
  activeWallet: null,
  accountSettings: null,
  verificationIndices: [],
  walletReady: false,
  walletChain: createEmptyWalletChainState(),
  sendFlow: createEmptySendFlowState(),
  walletBackupAuthorized: false,
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
const walletRefreshState = {
  intervalId: null,
  lastFocusReloadAt: 0,
};
const walletScanState = {
  qrScanner: null,
  starting: false,
  qrScannerModule: null,
};
const electrsEsplora = new ElectrsEsploraClass(
  window.APP_CONFIG.electrs_esplora_endpoint,
  window.APP_CONFIG.explorer_endpoint,
);

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
  "wallet-backup-password-screen",
  "wallet-backup-reveal-screen",
  "wallet-receive-screen",
  "wallet-send-screen",
  "wallet-send-scan-screen",
  "wallet-send-success-screen",
  "wallet-send-error-screen",
  "accounts-screen",
  "account-create-screen",
  "account-edit-screen",
];

const flash = document.getElementById("flash");
const mnemonicSlots = [...document.querySelectorAll("[data-word-slot]")];
const verifyLabels = [...document.querySelectorAll("[data-verify-label]")];
const verifyInputs = [...document.querySelectorAll("[data-verify-input]")];
const importInputs = [...document.querySelectorAll("[data-import-word]")];
const walletCardScroll = document.getElementById("wallet-card-scroll");
const walletAccountCard = document.getElementById("wallet-account-card");
const walletSendAction = document.getElementById("wallet-send-action");
const walletReceiveAction = document.getElementById("wallet-receive-action");
const walletBackupAction = document.getElementById("wallet-backup-action");
const walletBackupMnemonicSlots = [...document.querySelectorAll("[data-wallet-backup-word-slot]")];
const walletAccountName = document.getElementById("wallet-account-name");
const walletAddress = document.getElementById("wallet-address");
const walletBalancePrimary = document.getElementById("wallet-balance-primary");
const walletBalanceFiat = document.getElementById("wallet-balance-fiat");
const walletTransactionsSection = document.getElementById("wallet-transactions-section");
const walletTransactionsList = document.getElementById("wallet-transactions-list");
const walletEmptyState = document.getElementById("wallet-empty-state");
const walletReceiveAddress = document.getElementById("wallet-receive-address");
const walletReceiveQr = document.getElementById("wallet-receive-qr");
const walletSendForm = document.getElementById("wallet-send-form");
const walletSendAddressInput = document.getElementById("wallet-send-address-input");
const walletSendScanTrigger = document.getElementById("wallet-send-scan-trigger");
const walletSendBtcInput = document.getElementById("wallet-send-btc-input");
const walletSendMxnInput = document.getElementById("wallet-send-mxn-input");
const walletSendAvailableBtc = document.getElementById("wallet-send-available-btc");
const walletSendSubmit = document.getElementById("wallet-send-submit");
const walletSendFeeOptions = [...document.querySelectorAll("[data-send-fee]")];
const walletSendScanShell = document.getElementById("wallet-send-scan-shell");
const walletSendScanVideo = document.getElementById("wallet-send-scan-video");
const walletSendSuccessLink = document.getElementById("wallet-send-success-link");
const walletSendSuccessBack = document.getElementById("wallet-send-success-back");
const walletSendErrorBack = document.getElementById("wallet-send-error-back");
const walletSendErrorDetail = document.getElementById("wallet-send-error-detail");
const walletSendErrorSize = document.getElementById("wallet-send-error-size");
const createForm = document.getElementById("create-form");
const importPhraseForm = document.getElementById("import-phrase-form");
const importPasswordForm = document.getElementById("import-password-form");
const unlockForm = document.getElementById("unlock-form");
const verifyForm = document.getElementById("verify-form");
const walletBackupForm = document.getElementById("wallet-backup-form");
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
  walletBackupForm,
  walletSendForm,
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
  window.addEventListener("resize", () => {
    syncFlashWidth();
  });
  window.addEventListener("popstate", handlePopState);
  window.addEventListener("focus", handleWalletWindowFocus);
  document.addEventListener("visibilitychange", handleWalletVisibilityChange);
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

  walletCardScroll?.addEventListener("scroll", handleWalletMenuScroll, { passive: true });

  bindImportWordAutoAdvance();
  bindSendForm();

  walletAccountCard?.addEventListener("click", () => {
    clearFlash();
    navigateTo(ROUTES.walletAccounts);
  });

  walletSendAction?.addEventListener("click", () => {
    clearFlash();
    navigateTo(ROUTES.walletSend);
  });

  walletReceiveAction?.addEventListener("click", () => {
    clearFlash();
    navigateTo(ROUTES.walletReceive);
  });

  walletSendScanTrigger?.addEventListener("click", () => {
    clearFlash();
    navigateTo(ROUTES.walletSendScan);
  });

  walletBackupAction?.addEventListener("click", () => {
    clearFlash();
    navigateTo(ROUTES.walletBackup);
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
  walletSendFeeOptions.forEach((option) => {
    option.addEventListener("click", () => {
      selectSendFeeOption(option.dataset.sendFee);
    });
  });
  walletSendSuccessBack?.addEventListener("click", () => {
    resetSendResultState();
    invalidateWalletChainState();
    navigateTo(ROUTES.wallet, "", { direction: "backward" });
  });
  walletSendErrorBack?.addEventListener("click", () => {
    resetSendResultState();
    navigateTo(ROUTES.walletSend, "", { direction: "backward" });
  });

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
      const wallet = normalizeWalletRecord(createWallet(window.APP_CONFIG.network));
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
      const wallet = normalizeWalletRecord(importWallet(state.pendingImportMnemonic, window.APP_CONFIG.network));
      await persistWallet(wallet, password);
      initializeAccountSettings({ reset: true });
      clearImportForm();
      state.activeWallet = wallet;
      invalidateWalletChainState();
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
      const wallet = normalizeWalletRecord(await decryptWallet(payload, password));

      if (normalizeNetworkName(wallet.network) !== window.APP_CONFIG.network) {
        throw new Error(
          `Stored wallet network ${wallet.network} does not match configured network ${window.APP_CONFIG.network}.`,
        );
      }

      state.activeWallet = wallet;
      invalidateWalletChainState();
      unlockForm.reset();
      resetPasswordVisibility(unlockForm);
      navigateTo(ROUTES.wallet);
    } catch (error) {
      setFlash("No se pudo descifrar la billetera. Verifica la contraseña y la red.");
    }
  });

  walletBackupForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFlash();

    if (!ensureWalletReady()) {
      return;
    }

    const payload = loadEncryptedWallet();
    const password = document.getElementById("wallet-backup-password")?.value ?? "";

    if (!payload || !state.activeWallet) {
      navigateTo(ROUTES.unlockWallet);
      return;
    }

    try {
      const wallet = normalizeWalletRecord(await decryptWallet(payload, password));

      if (normalizeNetworkName(wallet.network) !== window.APP_CONFIG.network) {
        throw new Error(
          `Stored wallet network ${wallet.network} does not match configured network ${window.APP_CONFIG.network}.`,
        );
      }

      if (wallet.mnemonic !== state.activeWallet.mnemonic) {
        throw new Error("La contraseña no corresponde a la billetera activa.");
      }

      state.walletBackupAuthorized = true;
      fillWalletBackupMnemonicGrid(state.activeWallet.mnemonic);
      walletBackupForm.reset();
      resetPasswordVisibility(walletBackupForm);
      syncFormButtonStates();
      navigateTo(ROUTES.walletBackupReveal);
    } catch (_error) {
      state.walletBackupAuthorized = false;
      setFlash("No se pudo verificar la contraseña de la billetera.");
    }
  });

  walletSendForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFlash();

    if (!ensureWalletReady()) {
      return;
    }

    const preparedTx = state.sendFlow.preparedTx;
    if (!preparedTx?.ready) {
      return;
    }

    state.sendFlow.submitting = true;
    syncSendSubmitState();

    try {
      const txid = await electrsEsplora.postTx(preparedTx.tx_hex);
      state.sendFlow.result = {
        status: "success",
        txid: String(txid).trim() || preparedTx.txid,
      };
      navigateTo(ROUTES.walletSendSuccess);
    } catch (error) {
      state.sendFlow.result = {
        status: "error",
        detail: error.message || String(error),
        txVbytes: preparedTx.tx_vbytes,
      };
      navigateTo(ROUTES.walletSendError);
    } finally {
      state.sendFlow.submitting = false;
      syncSendSubmitState();
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
      invalidateWalletChainState();
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
        getWalletNetwork(state.activeWallet),
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
      invalidateWalletChainState();
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
    const walletEngineResponse = await fetch("/assets/pkg/mibilleterabitcoin_common_bg.wasm");
    if (!walletEngineResponse.ok) {
      throw new Error(
        `No se pudo descargar el motor de billeteras (${walletEngineResponse.status}).`,
      );
    }

    await init({ module_or_path: walletEngineResponse });
    initWallet();
    state.walletReady = true;
  } catch (error) {
    console.error("wallet engine init failed:", error);
    setFlash("No se pudo cargar el motor de billeteras en el navegador.");
  }

  syncFormButtonStates();
  syncRoute({ direction: "neutral", immediate: true });
  runInitialAppReveal();
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
    clearWalletBackupFlow();
    renderWallet();
    showScreen("menu-screen", { direction, immediate });
    return;
  }

  if (path === ROUTES.walletBackup) {
    clearWalletBackupFlow();
    prepareWalletBackupForm();
    showScreen("wallet-backup-password-screen", { direction, immediate });
    return;
  }

  if (path === ROUTES.walletBackupReveal) {
    if (!state.walletBackupAuthorized || !state.activeWallet) {
      navigateTo(ROUTES.walletBackup, "", { direction: "backward", immediate });
      return;
    }

    fillWalletBackupMnemonicGrid(state.activeWallet.mnemonic);
    showScreen("wallet-backup-reveal-screen", { direction, immediate });
    return;
  }

  if (path === ROUTES.walletReceive) {
    clearWalletBackupFlow();
    renderWalletReceive();
    showScreen("wallet-receive-screen", { direction, immediate });
    return;
  }

  if (path === ROUTES.walletSend) {
    clearWalletBackupFlow();
    renderWalletSend();
    showScreen("wallet-send-screen", { direction, immediate });
    return;
  }

  if (path === ROUTES.walletSendScan) {
    clearWalletBackupFlow();
    showScreen("wallet-send-scan-screen", { direction, immediate });
    return;
  }

  if (path === ROUTES.walletSendSuccess) {
    clearWalletBackupFlow();
    if (!state.sendFlow.result || state.sendFlow.result.status !== "success") {
      navigateTo(ROUTES.walletSend, "", { direction: "backward", immediate });
      return;
    }

    renderWalletSendSuccess();
    showScreen("wallet-send-success-screen", { direction, immediate });
    return;
  }

  if (path === ROUTES.walletSendError) {
    clearWalletBackupFlow();
    if (!state.sendFlow.result || state.sendFlow.result.status !== "error") {
      navigateTo(ROUTES.walletSend, "", { direction: "backward", immediate });
      return;
    }

    renderWalletSendError();
    showScreen("wallet-send-error-screen", { direction, immediate });
    return;
  }

  if (path === ROUTES.walletAccounts) {
    clearWalletBackupFlow();
    renderAccountsList();
    showScreen("accounts-screen", { direction, immediate });
    return;
  }

  if (path === ROUTES.walletAccountsCreate) {
    clearWalletBackupFlow();
    prepareAccountCreateForm();
    showScreen("account-create-screen", { direction, immediate });
    return;
  }

  const editIndex = getWalletAccountEditIndex(path);
  if (editIndex === null || !prepareAccountEditForm(editIndex)) {
    navigateTo(ROUTES.walletAccounts, "", { direction: "backward", immediate });
    return;
  }

  clearWalletBackupFlow();
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

  if (currentPath === ROUTES.walletBackup && targetScreenId === "menu-screen") {
    navigateTo(ROUTES.wallet, "", { direction: "backward" });
    return;
  }

  if (currentPath === ROUTES.walletBackupReveal && targetScreenId === "wallet-backup-password-screen") {
    navigateTo(ROUTES.walletBackup, "", { direction: "backward" });
    return;
  }

  if (currentPath === ROUTES.walletReceive && targetScreenId === "menu-screen") {
    navigateTo(ROUTES.wallet, "", { direction: "backward" });
    return;
  }

  if (currentPath === ROUTES.walletSend && targetScreenId === "menu-screen") {
    navigateTo(ROUTES.wallet, "", { direction: "backward" });
    return;
  }

  if (currentPath === ROUTES.walletSendScan && targetScreenId === "wallet-send-screen") {
    navigateTo(ROUTES.walletSend, "", { direction: "backward" });
    return;
  }

  if (currentPath === ROUTES.walletSendSuccess && targetScreenId === "wallet-send-screen") {
    navigateTo(ROUTES.walletSend, "", { direction: "backward" });
    return;
  }

  if (currentPath === ROUTES.walletSendError && targetScreenId === "wallet-send-screen") {
    navigateTo(ROUTES.walletSend, "", { direction: "backward" });
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
    syncWalletRefreshLifecycle(activeScreenId);
    syncWalletScanLifecycle(activeScreenId);
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
    path === ROUTES.walletBackup ||
    path === ROUTES.walletBackupReveal ||
    path === ROUTES.walletReceive ||
    path === ROUTES.walletSend ||
    path === ROUTES.walletSendScan ||
    path === ROUTES.walletSendSuccess ||
    path === ROUTES.walletSendError ||
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
  const resolvedScreen =
    screen && typeof screen.getBoundingClientRect === "function"
      ? screen
      : getVisibleScreen();

  if (!flash || !resolvedScreen) {
    return;
  }

  const width = Math.round(resolvedScreen.getBoundingClientRect().width);
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
      syncWalletRefreshLifecycle(activeScreenId);
      syncWalletScanLifecycle(activeScreenId);
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

function runInitialAppReveal() {
  const appShell = document.querySelector(".app-shell");
  const loader = document.querySelector(".app-loader");
  const nextScreen = navigationState.activeScreenId
    ? document.getElementById(navigationState.activeScreenId)
    : getVisibleScreen();

  if (!appShell || !appShell.classList.contains("app-loading") || !loader || !nextScreen) {
    appShell?.classList.remove("app-loading");
    return;
  }

  if (prefersReducedMotion || !supportsNativeCardTransitions) {
    appShell.classList.remove("app-loading");
    nextScreen.style.visibility = "";
    nextScreen.style.opacity = "";
    nextScreen.style.transform = "";
    return;
  }

  nextScreen.style.visibility = "visible";
  nextScreen.style.opacity = "0";
  nextScreen.style.transform = `translateY(${CARD_TRANSITION_NEUTRAL_Y}px) scale(0.992)`;

  const nativeAnimationOptions = {
    duration: CARD_TRANSITION_DURATION,
    easing: CARD_TRANSITION_EASING,
    fill: "forwards",
  };

  const animations = [
    loader.animate([{ opacity: 1 }, { opacity: 0 }], nativeAnimationOptions),
    nextScreen.animate(
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
  ];

  Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
    appShell.classList.remove("app-loading");
    loader.style.opacity = "";
    nextScreen.style.visibility = "";
    nextScreen.style.opacity = "";
    nextScreen.style.transform = "";
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

function fillWalletBackupMnemonicGrid(mnemonic) {
  const words = mnemonic.split(" ");
  walletBackupMnemonicSlots.forEach((slot, index) => {
    slot.querySelector(".word-value").textContent = words[index] || "••••";
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

  const displayAddress = getEffectiveWalletAddress(account);

  if (walletAccountName) {
    walletAccountName.textContent = account.name;
  }

  if (walletAddress) {
    walletAddress.textContent = formatWalletAddress(displayAddress);
  }

  void ensureWalletChainData();
  ensureWalletRefreshInterval();
}

function renderWalletReceive() {
  const account = getActiveWalletAccount();
  if (!account) {
    clearWalletReceive();
    return;
  }

  const displayAddress = getEffectiveWalletAddress(account);

  if (walletReceiveAddress) {
    walletReceiveAddress.textContent = displayAddress;
  }

  renderWalletReceiveQr(displayAddress);
}

function renderWalletReceiveQr(address) {
  if (!walletReceiveQr) {
    return;
  }

  const shell = walletReceiveQr.closest(".wallet-receive-qr-shell");
  shell?.setAttribute("data-qr-ready", "false");
  walletReceiveQr.replaceChildren();

  if (!address) {
    return;
  }

  if (typeof QRCode === "undefined") {
    setFlash("No se pudo cargar el generador de codigo QR en el navegador.");
    return;
  }

  new QRCode(walletReceiveQr, {
    text: address,
    width: 164,
    height: 164,
    colorDark: "#000000",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H,
  });
  shell?.setAttribute("data-qr-ready", "true");
}

function clearWalletReceive() {
  if (walletReceiveAddress) {
    walletReceiveAddress.textContent = "";
  }

  walletReceiveQr?.closest(".wallet-receive-qr-shell")?.setAttribute("data-qr-ready", "false");
  walletReceiveQr?.replaceChildren();
}

function renderWalletSend() {
  const account = getActiveWalletAccount();
  if (!account) {
    clearWalletSend();
    return;
  }

  const spendAddress = account.address;
  const nextKey = buildWalletChainKey(`send:${spendAddress}`);
  if (state.sendFlow.key !== nextKey) {
    walletSendForm?.reset();
    resetSendFlowState();
    state.sendFlow.key = nextKey;
    state.sendFlow.address = spendAddress;
  }

  renderSendFeeOptions();
  syncSendAvailableBalance();
  syncSendSubmitState();
  void ensureSendFlowData();
}

function renderWalletSendSuccess() {
  if (!walletSendSuccessLink) {
    return;
  }

  const txid = state.sendFlow.result?.txid || "#";
  walletSendSuccessLink.href = txid === "#" ? "#" : electrsEsplora.getTxExplorerUrl(txid);
  const label = walletSendSuccessLink.querySelector("span");
  if (label) {
    label.textContent = "Ver transacción en explorador";
  }
}

function renderWalletSendError() {
  if (walletSendErrorDetail) {
    walletSendErrorDetail.textContent =
      state.sendFlow.result?.detail || "No se pudo generar o transmitir la transacción.";
  }

  if (walletSendErrorSize) {
    const txVbytes = Number(state.sendFlow.result?.txVbytes);
    const hasTxSize = Number.isFinite(txVbytes) && txVbytes > 0;
    walletSendErrorSize.textContent = hasTxSize ? `Tamaño estimado: ${txVbytes} vB` : "";
    walletSendErrorSize.classList.toggle("hidden", !hasTxSize);
  }
}

function clearWalletSend() {
  walletSendForm?.reset();
  resetSendFlowState();
  renderSendFeeOptions();
  syncSendAvailableBalance();
  syncSendSubmitState();
}

async function ensureSendFlowData() {
  if (!state.activeWallet || !state.sendFlow.address) {
    return;
  }

  if (state.sendFlow.loadedOnce || state.sendFlow.loading) {
    renderSendFeeOptions();
    syncSendAvailableBalance();
    return;
  }

  state.sendFlow.loading = true;
  renderSendFeeOptions();
  syncSendAvailableBalance();
  syncSendSubmitState();

  try {
    const [utxos, feeEstimates] = await Promise.all([
      electrsEsplora.getUtxos({ address: state.sendFlow.address }),
      electrsEsplora.getFeeEstimates(),
    ]);

    if (!state.sendFlow.address) {
      return;
    }

    state.sendFlow.spendableUtxos = Array.isArray(utxos) ? utxos : [];
    state.sendFlow.spendableBalanceSats = state.sendFlow.spendableUtxos.reduce(
      (total, utxo) => total + Number(utxo?.value ?? 0),
      0,
    );
    const resolvedFees = resolveSendFeeRates(feeEstimates);
    state.sendFlow.feeRates = resolvedFees.feeRates;
    state.sendFlow.feeMeta = resolvedFees.feeMeta;
    state.sendFlow.loadedOnce = true;
  } catch (error) {
    state.sendFlow.feeError = error.message || String(error);
    setFlash("No se pudo cargar la información necesaria para enviar bitcoin.");
  } finally {
    state.sendFlow.loading = false;
    renderSendFeeOptions();
    syncSendAvailableBalance();
    await refreshSendPreview();
  }
}

async function ensureWalletChainData() {
  const account = getActiveWalletAccount();
  if (!account) {
    clearWalletChainView();
    return;
  }

  const address = getEffectiveWalletAddress(account);
  const key = buildWalletChainKey(address);

  if (state.walletChain.key !== key) {
    state.walletChain = createEmptyWalletChainState(state.walletChain.requestToken + 1);
    state.walletChain.key = key;
    state.walletChain.address = address;
    walletCardScroll?.scrollTo({ top: 0 });
    renderWalletChainState();
  }

  if (state.walletChain.loadedOnce || state.walletChain.loadingInitial) {
    renderWalletChainState();
    return;
  }

  const requestToken = state.walletChain.requestToken + 1;
  state.walletChain.requestToken = requestToken;
  state.walletChain.loadingInitial = true;
  state.walletChain.error = null;
  renderWalletChainState();

  try {
    const [tipHeight, addressStats, txs] = await Promise.all([
      electrsEsplora.getTipHeight(),
      electrsEsplora.getScriptpubkeyChainStats({ address }),
      electrsEsplora.getTxs({ address }),
    ]);

    if (!isWalletChainRequestCurrent(key, requestToken)) {
      return;
    }

    const normalizedTxs = Array.isArray(txs) ? txs : [];
    state.walletChain.tipHeight = tipHeight;
    state.walletChain.balanceSats = calculateWalletBalanceSats(addressStats);
    state.walletChain.txs = normalizedTxs;
    state.walletChain.lastSeenTxId = normalizedTxs.at(-1)?.txid ?? null;
    state.walletChain.hasMoreTxs = normalizedTxs.length >= ESPLORA_PAGE_SIZE;
    state.walletChain.loadedPageCount = normalizedTxs.length > 0 ? 1 : 0;
    state.walletChain.loadedOnce = true;
  } catch (error) {
    if (!isWalletChainRequestCurrent(key, requestToken)) {
      return;
    }

    state.walletChain.error = error.message || String(error);
    state.walletChain.loadedOnce = true;
    state.walletChain.hasMoreTxs = false;
    setFlash("No se pudo cargar la informacion on-chain de esta billetera.");
  } finally {
    if (!isWalletChainRequestCurrent(key, requestToken)) {
      return;
    }

    state.walletChain.loadingInitial = false;
    renderWalletChainState();
  }
}

async function loadMoreWalletTransactions() {
  if (
    getCurrentPath() !== ROUTES.wallet ||
    !state.walletChain.address ||
    !state.walletChain.loadedOnce ||
    state.walletChain.loadingInitial ||
    state.walletChain.loadingMore ||
    !state.walletChain.hasMoreTxs ||
    !state.walletChain.lastSeenTxId
  ) {
    return;
  }

  const key = state.walletChain.key;
  const requestToken = state.walletChain.requestToken;
  state.walletChain.loadingMore = true;

  try {
    const nextTxs = await electrsEsplora.getTxs({
      address: state.walletChain.address,
      lastSeenTxId: state.walletChain.lastSeenTxId,
    });

    if (!isWalletChainRequestCurrent(key, requestToken)) {
      return;
    }

    const normalizedTxs = Array.isArray(nextTxs) ? nextTxs : [];
    state.walletChain.txs = appendUniqueTransactions(state.walletChain.txs, normalizedTxs);
    state.walletChain.lastSeenTxId = normalizedTxs.at(-1)?.txid ?? state.walletChain.lastSeenTxId;
    state.walletChain.hasMoreTxs = normalizedTxs.length >= ESPLORA_PAGE_SIZE;
    if (normalizedTxs.length > 0) {
      state.walletChain.loadedPageCount += 1;
    }
  } catch (error) {
    if (!isWalletChainRequestCurrent(key, requestToken)) {
      return;
    }

    state.walletChain.hasMoreTxs = false;
    setFlash("No se pudieron cargar mas transacciones para esta billetera.");
  } finally {
    if (!isWalletChainRequestCurrent(key, requestToken)) {
      return;
    }

    state.walletChain.loadingMore = false;
    renderWalletChainState();
  }
}

async function refreshWalletChainData(options = {}) {
  const { resetPages = false } = options;

  if (
    getCurrentPath() !== ROUTES.wallet ||
    !state.activeWallet ||
    !state.walletChain.address ||
    state.walletChain.loadingInitial ||
    state.walletChain.loadingMore
  ) {
    return;
  }

  const account = getActiveWalletAccount();
  if (!account) {
    return;
  }

  const address = getEffectiveWalletAddress(account);
  const key = buildWalletChainKey(address);
  if (state.walletChain.key !== key) {
    await ensureWalletChainData();
    return;
  }

  const refreshPageCount = resetPages
    ? 1
    : Math.max(1, Math.min(state.walletChain.loadedPageCount || 1, TX_REFRESH_PAGES_MAX));
  const previousLoadedPageCount = state.walletChain.loadedPageCount || 0;
  const requestToken = state.walletChain.requestToken + 1;
  state.walletChain.requestToken = requestToken;
  state.walletChain.loadingInitial = resetPages;
  state.walletChain.error = null;
  if (resetPages) {
    state.walletChain.txs = [];
    state.walletChain.lastSeenTxId = null;
    state.walletChain.hasMoreTxs = false;
    state.walletChain.loadedPageCount = 0;
    state.walletChain.loadedOnce = false;
  }
  renderWalletChainState();

  try {
    const [tipHeight, addressStats, refreshedTxs] = await Promise.all([
      electrsEsplora.getTipHeight(),
      electrsEsplora.getScriptpubkeyChainStats({ address }),
      fetchWalletTransactionPages(address, refreshPageCount),
    ]);

    if (!isWalletChainRequestCurrent(key, requestToken)) {
      return;
    }

    const refreshedPages = refreshedTxs.pages;
    const normalizedRefreshedTxs = refreshedTxs.txs;
    const staleTail = resetPages
      ? []
      : state.walletChain.txs.slice(refreshedPages * ESPLORA_PAGE_SIZE);

    state.walletChain.tipHeight = tipHeight;
    state.walletChain.balanceSats = calculateWalletBalanceSats(addressStats);
    state.walletChain.txs = appendUniqueTransactions(normalizedRefreshedTxs, staleTail);
    state.walletChain.lastSeenTxId = state.walletChain.txs.at(-1)?.txid ?? null;
    state.walletChain.hasMoreTxs = refreshedTxs.lastPageLength >= ESPLORA_PAGE_SIZE || staleTail.length > 0;
    state.walletChain.loadedPageCount = resetPages
      ? refreshedPages
      : Math.max(previousLoadedPageCount, refreshedPages);
    state.walletChain.loadedOnce = true;
  } catch (error) {
    if (!isWalletChainRequestCurrent(key, requestToken)) {
      return;
    }

    state.walletChain.error = error.message || String(error);
  } finally {
    if (!isWalletChainRequestCurrent(key, requestToken)) {
      return;
    }

    state.walletChain.loadingInitial = false;
    renderWalletChainState();
  }
}

async function fetchWalletTransactionPages(address, pageCount) {
  let lastSeenTxId = null;
  let fetchedPages = 0;
  let lastPageLength = 0;
  const txs = [];

  while (fetchedPages < pageCount) {
    const pageTxs = await electrsEsplora.getTxs({
      address,
      lastSeenTxId,
    });
    const normalizedPageTxs = Array.isArray(pageTxs) ? pageTxs : [];
    txs.push(...normalizedPageTxs);
    fetchedPages += 1;
    lastPageLength = normalizedPageTxs.length;

    if (normalizedPageTxs.length < ESPLORA_PAGE_SIZE) {
      break;
    }

    lastSeenTxId = normalizedPageTxs.at(-1)?.txid ?? null;
    if (!lastSeenTxId) {
      break;
    }
  }

  return {
    txs,
    pages: fetchedPages,
    lastPageLength,
  };
}

function renderWalletChainState() {
  renderWalletBalance();
  renderWalletTransactions();
  walletTransactionsSection?.__syncDragEnabled?.();
  syncScrollFadeTargets();
  handleWalletMenuScroll();
}

function renderWalletBalance() {
  if (walletBalancePrimary) {
    walletBalancePrimary.textContent = formatBtcAmount(state.walletChain.balanceSats);
  }

  if (walletBalanceFiat) {
    walletBalanceFiat.textContent = formatMxnApprox(state.walletChain.balanceSats);
  }
}

function renderWalletTransactions() {
  const hasError = Boolean(state.walletChain.error);
  const isLoadingInitial = state.walletChain.loadingInitial && !state.walletChain.loadedOnce;
  const isLoadingMore = state.walletChain.loadingMore;
  const hasTransactions = !hasError && state.walletChain.txs.length > 0;
  const showEmptyState =
    !hasError && state.walletChain.loadedOnce && !state.walletChain.loadingInitial && state.walletChain.txs.length === 0;
  const showTransactionsSection = isLoadingInitial || hasTransactions;

  if (walletTransactionsSection) {
    walletTransactionsSection.classList.toggle("hidden", !showTransactionsSection);
    walletTransactionsSection.hidden = !showTransactionsSection;
  }

  if (walletEmptyState) {
    walletEmptyState.classList.toggle("hidden", !showEmptyState);
    walletEmptyState.hidden = !showEmptyState;
  }

  if (!walletTransactionsList) {
    return;
  }

  if (isLoadingInitial) {
    walletTransactionsList.replaceChildren(
      createWalletTransactionSkeleton(),
      createWalletTransactionSkeleton(),
      createWalletTransactionSkeleton(),
    );
    return;
  }

  if (!hasTransactions) {
    walletTransactionsList.replaceChildren();
    return;
  }

  const sortedTxs = prioritizeWalletTransactions(state.walletChain.txs, state.walletChain.address);
  const items = sortedTxs.map((tx) =>
    createWalletTransactionCard(tx, state.walletChain.address, state.walletChain.tipHeight),
  );

  if (isLoadingMore) {
    items.push(createWalletTransactionSkeleton(), createWalletTransactionSkeleton(), createWalletTransactionSkeleton());
  }

  walletTransactionsList.replaceChildren(...items);
}

function createWalletTransactionCard(tx, ownedAddress, tipHeight) {
  const isSending = isOutgoingTransaction(tx, ownedAddress);
  const confirmations = getTransactionConfirmations(tx, tipHeight);
  const addressLabel = isSending ? "A:" : "De:";
  const addressValue = formatWalletAddress(getTransactionCounterpartyAddress(tx, ownedAddress, isSending));
  const amountValue = formatBtcAmount(getTransactionWalletAmount(tx, ownedAddress, isSending));
  const statusIcon = getTransactionStatusIcon(isSending, confirmations);

  const card = document.createElement("article");
  card.className = "wallet-transaction-card";

  const media = document.createElement("div");
  media.className = "wallet-transaction-media";

  const bitcoinIcon = document.createElement("img");
  bitcoinIcon.className = "wallet-transaction-bitcoin-icon";
  bitcoinIcon.src = NETWORK_BITCOIN_ICON_SRC;
  bitcoinIcon.alt = "";

  const statusBadge = document.createElement("span");
  statusBadge.className = "wallet-transaction-status-badge";

  const statusBadgeIcon = document.createElement("img");
  statusBadgeIcon.className = "wallet-transaction-status-icon";
  statusBadgeIcon.src = statusIcon.src;
  statusBadgeIcon.alt = "";
  if (statusIcon.isLoading) {
    statusBadgeIcon.classList.add("wallet-transaction-status-icon-loading");
  }

  statusBadge.append(statusBadgeIcon);
  media.append(bitcoinIcon, statusBadge);

  const copy = document.createElement("div");
  copy.className = "wallet-transaction-copy";

  const header = document.createElement("div");
  header.className = "wallet-transaction-header";

  const title = document.createElement("p");
  title.className = "wallet-transaction-title";
  title.textContent = getTransactionTitle(isSending, confirmations);

  const explorerLink = document.createElement("a");
  explorerLink.className = "wallet-transaction-explorer";
  explorerLink.href = electrsEsplora.getTxExplorerUrl(tx.txid);
  explorerLink.target = "_blank";
  explorerLink.rel = "noreferrer noopener";
  explorerLink.setAttribute("aria-label", "Ver transaccion en el explorador");

  const explorerIcon = document.createElement("img");
  explorerIcon.className = "wallet-transaction-explorer-icon";
  explorerIcon.src = "/assets/svgs/arrow-up-right.svg";
  explorerIcon.alt = "";
  explorerLink.append(explorerIcon);

  const subtitle = document.createElement("p");
  subtitle.className = "wallet-transaction-subtitle";

  const subtitleLabel = document.createElement("span");
  subtitleLabel.className = "wallet-transaction-subtitle-label";
  subtitleLabel.textContent = `${addressLabel} `;

  const subtitleValue = document.createElement("span");
  subtitleValue.className = "wallet-transaction-subtitle-value";
  subtitleValue.textContent = addressValue;

  const amount = document.createElement("span");
  amount.className = "wallet-transaction-amount";
  amount.textContent = amountValue;

  header.append(title, explorerLink);
  subtitle.append(subtitleLabel, subtitleValue, amount);
  copy.append(header, subtitle);
  card.append(media, copy);

  return card;
}

function createWalletTransactionSkeleton() {
  const skeleton = document.createElement("div");
  skeleton.className = "wallet-transaction-card wallet-transaction-card-skeleton";
  skeleton.setAttribute("aria-hidden", "true");
  return skeleton;
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

  clearWalletChainView();
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
        getWalletNetwork(state.activeWallet),
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
      getWalletNetwork(state.activeWallet),
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
  invalidateWalletChainState();
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
    invalidateWalletChainState();
    setFlash("Los datos almacenados de la billetera eran invalidos y se borraron.");
    return null;
  }
}

function forgetStoredWallet() {
  localStorage.removeItem(STORAGE_KEY);
  clearAccountSettingsStorage();
  state.activeWallet = null;
  invalidateWalletChainState();
  resetSendResultState();
  clearCreateState();
  clearImportForm();
  clearRenderedWalletAccount();
  clearWalletBackupFlow();
  clearWalletReceive();
  clearWalletSend();
  clearFlash();
  navigateTo(ROUTES.landing);
}

function lockWalletSession() {
  state.activeWallet = null;
  invalidateWalletChainState();
  resetSendResultState();
  clearRenderedWalletAccount();
  clearWalletBackupFlow();
  clearWalletReceive();
  clearWalletSend();
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

function createEmptyWalletChainState(requestToken = 0) {
  return {
    key: "",
    address: "",
    balanceSats: null,
    tipHeight: null,
    txs: [],
    lastSeenTxId: null,
    hasMoreTxs: false,
    loadedPageCount: 0,
    loadingInitial: false,
    loadingMore: false,
    loadedOnce: false,
    error: null,
    requestToken,
  };
}

function createEmptySendFlowState() {
  return {
    key: "",
    address: "",
    feeOption: "medium",
    feeRates: {
      slow: 1,
      medium: 1,
      fast: 1,
    },
    feeMeta: {
      slow: { feeRateSatVb: 1, targetBlocks: 6 },
      medium: { feeRateSatVb: 1, targetBlocks: 3 },
      fast: { feeRateSatVb: 1, targetBlocks: 1 },
    },
    spendableBalanceSats: null,
    spendableUtxos: [],
    loadedOnce: false,
    loading: false,
    feeError: null,
    preparing: false,
    previewToken: 0,
    preparedTx: null,
    result: null,
    submitting: false,
    syncingAmounts: false,
    lastAmountEdited: "btc",
  };
}

function invalidateWalletChainState() {
  const nextToken = state.walletChain.requestToken + 1;
  state.walletChain = createEmptyWalletChainState(nextToken);
  resetSendFlowState();
  clearWalletChainView();
}

function resetSendFlowState() {
  state.sendFlow = createEmptySendFlowState();
}

function resetSendResultState() {
  state.sendFlow.result = null;
}

function clearWalletChainView() {
  if (walletBalancePrimary) {
    walletBalancePrimary.textContent = `-- ${NETWORK_BITCOIN_SYMBOL}`;
  }

  if (walletBalanceFiat) {
    walletBalanceFiat.textContent = "≈ -- MXN";
  }

  walletTransactionsList?.replaceChildren();
  walletTransactionsSection?.classList.add("hidden");
  walletEmptyState?.classList.add("hidden");
  walletTransactionsSection?.__syncDragEnabled?.();
  syncScrollFadeTargets();
}

function ensureWalletRefreshInterval() {
  if (walletRefreshState.intervalId !== null) {
    return;
  }

  walletRefreshState.intervalId = window.setInterval(() => {
    void refreshWalletChainData();
  }, WALLET_TX_REFRESH_INTERVAL_MS);
}

function clearWalletRefreshInterval() {
  if (walletRefreshState.intervalId === null) {
    return;
  }

  window.clearInterval(walletRefreshState.intervalId);
  walletRefreshState.intervalId = null;
}

function syncWalletRefreshLifecycle(activeScreenId = navigationState.activeScreenId) {
  if (activeScreenId === "menu-screen" && document.visibilityState === "visible") {
    ensureWalletRefreshInterval();
    return;
  }

  clearWalletRefreshInterval();
}

function syncWalletScanLifecycle(activeScreenId = navigationState.activeScreenId) {
  if (activeScreenId === "wallet-send-scan-screen" && document.visibilityState === "visible") {
    void ensureWalletSendScanner();
    return;
  }

  destroyWalletSendScanner();
}

function handleWalletVisibilityChange() {
  if (document.visibilityState !== "visible") {
    clearWalletRefreshInterval();
    destroyWalletSendScanner();
    return;
  }

  syncWalletRefreshLifecycle();
  syncWalletScanLifecycle();
  handleWalletFocusRefresh();
}

function handleWalletWindowFocus() {
  handleWalletFocusRefresh();
}

async function ensureWalletSendScanner() {
  if (walletScanState.starting || walletScanState.qrScanner || !walletSendScanVideo || !walletSendScanShell) {
    return;
  }

  walletScanState.starting = true;
  setWalletSendScanReady(false);

  try {
    const QrScanner = await loadQrScannerModule();
    const canUseScanner = await canUseWalletSendScanner(QrScanner);
    if (!canUseScanner) {
      return;
    }

    const hasCamera = await QrScanner.hasCamera();
    if (!hasCamera) {
      console.warn("wallet send scanner unavailable: no camera device was reported by the browser");
      return;
    }

    const qrScanner = new QrScanner(
      walletSendScanVideo,
      (result) => {
        handleWalletSendScanResult(typeof result === "string" ? result : result?.data ?? "");
      },
      {
        preferredCamera: "environment",
        returnDetailedScanResult: true,
        highlightScanRegion: true,
      },
    );

    await qrScanner.start();
    walletScanState.qrScanner = qrScanner;
    setWalletSendScanReady(true);
  } catch (error) {
    walletScanState.qrScanner = null;
    console.warn("wallet send scanner unavailable:", error);
    setWalletSendScanReady(false);
  } finally {
    walletScanState.starting = false;
  }
}

function destroyWalletSendScanner() {
  walletScanState.starting = false;
  walletScanState.qrScanner?.destroy();
  walletScanState.qrScanner = null;
  setWalletSendScanReady(false);
}

async function loadQrScannerModule() {
  if (!walletScanState.qrScannerModule) {
    walletScanState.qrScannerModule = import("/assets/scripts/qr-scanner.min.js").then((module) => module.default);
  }

  return walletScanState.qrScannerModule;
}

async function canUseWalletSendScanner(QrScanner) {
  const isLocalHttp =
    window.location.protocol === "http:" &&
    /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
  if (!window.isSecureContext && !isLocalHttp) {
    console.warn("wallet send scanner unavailable: camera access requires https outside localhost");
    return false;
  }

  return true;
}

function setWalletSendScanReady(isReady) {
  walletSendScanShell?.setAttribute("data-camera-ready", String(isReady));
}

function handleWalletSendScanResult(rawValue) {
  const address = extractBitcoinAddressFromScan(rawValue);
  if (!address || !validateBitcoinAddress(address, window.APP_CONFIG.network)) {
    return;
  }

  destroyWalletSendScanner();
  if (walletSendAddressInput) {
    walletSendAddressInput.value = address;
  }
  void refreshSendPreview();
  navigateTo(ROUTES.walletSend, "", { direction: "backward" });
}

function extractBitcoinAddressFromScan(rawValue) {
  const normalized = String(rawValue ?? "").trim();
  if (!normalized) {
    return "";
  }

  if (/^bitcoin:/i.test(normalized)) {
    const withoutScheme = normalized.slice("bitcoin:".length);
    return withoutScheme.split("?")[0].trim();
  }

  return normalized;
}

function handleWalletFocusRefresh() {
  if (getCurrentPath() !== ROUTES.wallet || document.visibilityState === "hidden") {
    return;
  }

  const now = Date.now();
  if (now - walletRefreshState.lastFocusReloadAt < 750) {
    return;
  }

  walletRefreshState.lastFocusReloadAt = now;
  void refreshWalletChainData({ resetPages: true });
}

function buildWalletChainKey(address) {
  return `${window.APP_CONFIG.network}:${address}`;
}

function isWalletChainRequestCurrent(key, requestToken) {
  return state.walletChain.key === key && state.walletChain.requestToken === requestToken;
}

function getWalletNetwork(wallet) {
  return normalizeNetworkName(wallet?.network || window.APP_CONFIG.network);
}

function normalizeWalletRecord(wallet) {
  if (!wallet || typeof wallet !== "object") {
    return wallet;
  }

  return {
    ...wallet,
    network: getWalletNetwork(wallet),
  };
}

function normalizeNetworkName(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  switch (normalized) {
    case "bitcoin":
    case "mainnet":
      return "mainnet";
    case "testnet":
    case "testnet3":
      return "testnet3";
    case "testnet4":
      return "testnet4";
    case "signet":
      return "signet";
    case "regtest":
      return "regtest";
    default:
      return normalized;
  }
}

function normalizeServiceBaseUrl(value) {
  return String(value ?? "").replace(/\/+$/, "");
}

function getNetworkBitcoinSymbol(network) {
  switch (normalizeNetworkName(network)) {
    case "testnet3":
    case "testnet4":
      return "tBTC";
    case "signet":
      return "sBTC";
    case "regtest":
      return "rBTC";
    default:
      return "BTC";
  }
}

function getNetworkBitcoinIconSrc(network) {
  switch (normalizeNetworkName(network)) {
    case "testnet3":
    case "testnet4":
    case "regtest":
      return "/assets/svgs/bitcoin-green.svg";
    case "signet":
      return "/assets/svgs/bitcoin-pink.svg";
    default:
      return "/assets/svgs/bitcoin.svg";
  }
}

function getEffectiveWalletAddress(account) {
  return window.APP_CONFIG.test_mode_address || account?.address || "";
}

function calculateWalletBalanceSats(stats) {
  return Math.max(0, getNetStatsBalance(stats?.chain_stats) + getNetStatsBalance(stats?.mempool_stats));
}

function getNetStatsBalance(stats) {
  const funded = Number(stats?.funded_txo_sum ?? 0);
  const spent = Number(stats?.spent_txo_sum ?? 0);
  return funded - spent;
}

function formatBtcAmount(balanceSats) {
  if (!Number.isFinite(balanceSats)) {
    return `-- ${NETWORK_BITCOIN_SYMBOL}`;
  }

  const btc = (balanceSats / 100_000_000).toFixed(8).replace(/\.?0+$/, "");
  return `${btc || "0"} ${NETWORK_BITCOIN_SYMBOL}`;
}

function formatMxnApprox(balanceSats) {
  if (!Number.isFinite(balanceSats) || !Number.isFinite(BTC_TO_MXN_RATE)) {
    return "≈ -- MXN";
  }

  const mxnValue = balanceSats / 100_000_000 * BTC_TO_MXN_RATE;
  const minimumFractionDigits = mxnValue > 0 && mxnValue < 100 ? 2 : 0;
  const formatter = new Intl.NumberFormat("es-MX", {
    minimumFractionDigits,
    maximumFractionDigits: 2,
  });

  return `≈ ${formatter.format(mxnValue)} MXN`;
}

function appendUniqueTransactions(existingTxs, nextTxs) {
  const seen = new Set(existingTxs.map((tx) => tx.txid));
  const appended = [...existingTxs];

  nextTxs.forEach((tx) => {
    if (!tx?.txid || seen.has(tx.txid)) {
      return;
    }

    seen.add(tx.txid);
    appended.push(tx);
  });

  return appended;
}

function isOutgoingTransaction(tx, ownedAddress) {
  return (tx?.vin ?? []).some((input) => input?.prevout?.scriptpubkey_address === ownedAddress);
}

function getTransactionConfirmations(tx, tipHeight) {
  if (!tx?.status?.confirmed || !Number.isFinite(tipHeight) || !Number.isFinite(tx?.status?.block_height)) {
    return 0;
  }

  return Math.max(0, tipHeight - tx.status.block_height + 1);
}

function getTransactionTitle(isSending, confirmations) {
  if (isSending) {
    return confirmations >= REQUIRED_CONFIRMATIONS ? "Enviado" : "Enviando";
  }

  return confirmations >= REQUIRED_CONFIRMATIONS ? "Recibido" : "Recibiendo";
}

function getTransactionCounterpartyAddress(tx, ownedAddress, isSending) {
  if (isSending) {
    const recipientOutput = getFirstExternalOutput(tx, ownedAddress);
    if (!recipientOutput) {
      return "tú";
    }
    return recipientOutput?.scriptpubkey_address || recipientOutput?.scriptpubkey || "Direccion no disponible";
  }

  return tx?.vout?.[0]?.scriptpubkey_address || tx?.vout?.[0]?.scriptpubkey || "Direccion no disponible";
}

function getTransactionWalletAmount(tx, ownedAddress, isSending) {
  if (!ownedAddress) {
    return null;
  }

  if (isSending) {
    return (tx?.vout ?? []).reduce((total, output) => {
      if (output?.scriptpubkey_address === ownedAddress) {
        return total;
      }

      return total + Number(output?.value ?? 0);
    }, 0);
  }

  return (tx?.vout ?? []).reduce((total, output) => {
    if (output?.scriptpubkey_address !== ownedAddress) {
      return total;
    }

    return total + Number(output?.value ?? 0);
  }, 0);
}

function getFirstExternalOutput(tx, ownedAddress) {
  return (tx?.vout ?? []).find((output) => output?.scriptpubkey_address !== ownedAddress) ?? null;
}

function prioritizeWalletTransactions(txs, ownedAddress) {
  return [...txs]
    .map((tx, index) => ({
      tx,
      index,
      isSending: isOutgoingTransaction(tx, ownedAddress),
    }))
    .sort((left, right) => {
      if (left.isSending !== right.isSending) {
        return left.isSending ? -1 : 1;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.tx);
}

function getTransactionStatusIcon(isSending, confirmations) {
  if (confirmations < REQUIRED_CONFIRMATIONS) {
    return {
      src: "/assets/svgs/loader-circle-grey.svg",
      isLoading: true,
    };
  }

  return {
    src: isSending ? "/assets/svgs/arrow-right-red-circle.svg" : "/assets/svgs/arrow-circle-up-green.svg",
    isLoading: false,
  };
}

function handleWalletMenuScroll() {
  if (!walletCardScroll || getCurrentPath() !== ROUTES.wallet) {
    return;
  }

  const remaining = walletCardScroll.scrollHeight - walletCardScroll.clientHeight - walletCardScroll.scrollTop;
  if (remaining <= 160) {
    void loadMoreWalletTransactions();
  }
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

function prepareWalletBackupForm() {
  walletBackupForm?.reset();
  resetPasswordVisibility(walletBackupForm);
  syncFormButtonStates();
}

function clearWalletBackupFlow() {
  state.walletBackupAuthorized = false;
  prepareWalletBackupForm();
  walletBackupMnemonicSlots.forEach((slot) => {
    const value = slot.querySelector(".word-value");
    if (value) {
      value.textContent = "••••";
    }
  });
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

  const syncDragEnabled = () => {
    const hasItems = area.querySelector(".wallet-transaction-card") !== null;
    area.dataset.dragEnabled = String(hasItems);
    return hasItems;
  };

  area.__syncDragEnabled = syncDragEnabled;
  syncDragEnabled();

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

    if (!syncDragEnabled()) {
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

function bindSendForm() {
  if (!walletSendForm || !walletSendAddressInput || !walletSendBtcInput || !walletSendMxnInput) {
    return;
  }

  walletSendAddressInput.addEventListener("input", () => {
    walletSendAddressInput.value = sanitizeFreeformInput(walletSendAddressInput.value);
    void refreshSendPreview();
  });

  walletSendBtcInput.addEventListener("input", () => {
    if (state.sendFlow.syncingAmounts) {
      return;
    }

    walletSendBtcInput.value = sanitizeDecimalInput(walletSendBtcInput.value, 8);
    state.sendFlow.lastAmountEdited = "btc";
    syncSendCounterAmount("btc");
    void refreshSendPreview();
  });

  walletSendMxnInput.addEventListener("input", () => {
    if (state.sendFlow.syncingAmounts) {
      return;
    }

    walletSendMxnInput.value = sanitizeDecimalInput(walletSendMxnInput.value, 2);
    state.sendFlow.lastAmountEdited = "mxn";
    syncSendCounterAmount("mxn");
    void refreshSendPreview();
  });
}

function selectSendFeeOption(feeKey) {
  if (!feeKey || !state.sendFlow.feeRates[feeKey]) {
    return;
  }

  state.sendFlow.feeOption = feeKey;
  renderSendFeeOptions();
  void refreshSendPreview();
}

function renderSendFeeOptions() {
  walletSendFeeOptions.forEach((option) => {
    const feeKey = option.dataset.sendFee;
    const isSelected = feeKey === state.sendFlow.feeOption;
    option.dataset.selected = String(isSelected);
    option.setAttribute("aria-checked", String(isSelected));

    const feeEta = option.querySelector(`[data-send-fee-eta="${feeKey}"]`);
    const feeBtc = option.querySelector(`[data-send-fee-btc="${feeKey}"]`);
    const feeMxn = option.querySelector(`[data-send-fee-mxn="${feeKey}"]`);
    const estimatedFeeSats = estimateDisplayedSendFeeSats(feeKey);
    const feeMeta = state.sendFlow.feeMeta[feeKey];

    if (feeEta) {
      feeEta.textContent = formatSendFeeEta(feeMeta?.targetBlocks);
    }

    if (feeBtc) {
      feeBtc.textContent = formatSendFeeRate(feeMeta?.feeRateSatVb);
    }

    if (feeMxn) {
      feeMxn.textContent = estimatedFeeSats === null ? "-- MXN" : formatMxnValue(estimatedFeeSats);
    }
  });
}

function formatSendFeeRate(feeRateSatVb) {
  const rate = Number(feeRateSatVb);
  if (!Number.isFinite(rate) || rate <= 0) {
    return "-- sats/vbyte";
  }

  if (rate < 1) {
    return "1 sat/byte";
  }

  return `${trimTrailingZeros(rate.toFixed(2))} sats/vbyte`;
}

function syncSendAvailableBalance() {
  if (!walletSendAvailableBtc) {
    return;
  }

  walletSendAvailableBtc.textContent = formatBtcAmount(state.sendFlow.spendableBalanceSats);
}

async function refreshSendPreview() {
  if (!walletSendForm || !walletSendAddressInput || !walletSendBtcInput) {
    return;
  }

  walletSendAddressInput.setCustomValidity("");
  walletSendBtcInput.setCustomValidity("");
  state.sendFlow.preparedTx = null;

  const account = getActiveWalletAccount();
  if (!account || !state.activeWallet) {
    syncSendSubmitState();
    return;
  }

  const recipientAddress = walletSendAddressInput.value.trim();
  const amountSats = parseBtcInputToSats(walletSendBtcInput.value);
  const feeRateSatVb = state.sendFlow.feeRates[state.sendFlow.feeOption];

  if (recipientAddress && !validateBitcoinAddress(recipientAddress, window.APP_CONFIG.network)) {
    walletSendAddressInput.setCustomValidity("Ingresa una dirección de Bitcoin válida.");
  }

  if (walletSendBtcInput.value.trim() && amountSats === null) {
    walletSendBtcInput.setCustomValidity("Ingresa un monto válido.");
  }

  if (!recipientAddress || amountSats === null || amountSats <= 0 || !Number.isFinite(feeRateSatVb)) {
    syncSendSubmitState();
    return;
  }

  if (state.sendFlow.loading) {
    syncSendSubmitState();
    return;
  }

  const previewToken = state.sendFlow.previewToken + 1;
  state.sendFlow.previewToken = previewToken;
  state.sendFlow.preparing = true;
  syncSendSubmitState();

  try {
    const preparedTx = prepareSendTx(
      state.activeWallet.mnemonic,
      getWalletNetwork(state.activeWallet),
      getAccountSettings().activeIndex,
      recipientAddress,
      BigInt(amountSats),
      feeRateSatVb,
      state.sendFlow.spendableUtxos,
    );

    if (previewToken !== state.sendFlow.previewToken) {
      return;
    }

    state.sendFlow.preparedTx = preparedTx;
  } catch (error) {
    if (previewToken !== state.sendFlow.previewToken) {
      return;
    }

    console.error("prepareSendTx failed:", error);
    walletSendBtcInput.setCustomValidity(error.message || String(error));
  } finally {
    if (previewToken !== state.sendFlow.previewToken) {
      return;
    }

    state.sendFlow.preparing = false;
    renderSendFeeOptions();
    syncSendSubmitState();
  }
}

function syncSendCounterAmount(source) {
  if (source === "btc") {
    const amountSats = parseBtcInputToSats(walletSendBtcInput.value);
    withSendAmountSync(() => {
      walletSendMxnInput.value = amountSats === null ? "" : formatMxnInputValue(amountSats);
    });
    return;
  }

  const amountSats = parseMxnInputToSats(walletSendMxnInput.value);
  withSendAmountSync(() => {
    walletSendBtcInput.value = amountSats === null ? "" : formatBtcInputValue(amountSats);
  });
}

function withSendAmountSync(callback) {
  state.sendFlow.syncingAmounts = true;
  try {
    callback();
  } finally {
    state.sendFlow.syncingAmounts = false;
  }
}

function syncSendSubmitState() {
  if (!walletSendSubmit || !walletSendForm) {
    return;
  }

  const isReady =
    !state.sendFlow.loading &&
    !state.sendFlow.preparing &&
    !state.sendFlow.submitting &&
    walletSendForm.checkValidity() &&
    Boolean(state.sendFlow.preparedTx?.ready);

  walletSendSubmit.disabled = !isReady;
  walletSendSubmit.setAttribute("aria-disabled", String(!isReady));
}

function estimateDisplayedSendFeeSats(feeKey) {
  const feeRateSatVb = state.sendFlow.feeRates[feeKey];
  if (!Number.isFinite(feeRateSatVb)) {
    return null;
  }

  if (state.sendFlow.preparedTx?.ready) {
    return Math.max(1, Math.ceil(state.sendFlow.preparedTx.tx_vbytes * feeRateSatVb));
  }

  return Math.max(1, Math.ceil((10.5 + 68 * 1 + 31 * 2) * feeRateSatVb));
}

function resolveSendFeeRates(feeEstimates) {
  if (window.APP_CONFIG.network !== "mainnet") {
    return {
      feeRates: {
        slow: 1,
        medium: 4,
        fast: 10,
      },
      feeMeta: {
        slow: { feeRateSatVb: 1, targetBlocks: 6 },
        medium: { feeRateSatVb: 4, targetBlocks: 3 },
        fast: { feeRateSatVb: 10, targetBlocks: 1 },
      },
    };
  }

  const resolve = (targets) => {
    for (const target of targets) {
      const value = Number(feeEstimates?.[target]);
      if (Number.isFinite(value) && value > 0) {
        return {
          feeRateSatVb: value,
          targetBlocks: Number(target),
        };
      }
    }

    return {
      feeRateSatVb: 1,
      targetBlocks: Number(targets[0]) || 1,
    };
  };

  const resolved = {
    slow: resolve(["6", "8", "10"]),
    medium: resolve(["3", "2", "4", "1"]),
    fast: resolve(["1", "2", "3"]),
  };

  return {
    feeRates: {
      slow: resolved.slow.feeRateSatVb,
      medium: resolved.medium.feeRateSatVb,
      fast: resolved.fast.feeRateSatVb,
    },
    feeMeta: resolved,
  };
}

function formatSendFeeEta(targetBlocks) {
  if (!Number.isFinite(targetBlocks) || targetBlocks <= 0) {
    return "--";
  }

  const lowerMinutes = Math.max(10, Math.round(targetBlocks * 10));
  const upperMinutes = Math.max(lowerMinutes, Math.round((targetBlocks + 1) * 10));

  if (upperMinutes < 60) {
    return `≈${lowerMinutes}-${upperMinutes} min`;
  }

  const lowerHours = lowerMinutes / 60;
  const upperHours = upperMinutes / 60;
  const formatHours = (hours) => Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace(/\.0$/, "");

  return `≈${formatHours(lowerHours)}-${formatHours(upperHours)} h`;
}

function sanitizeFreeformInput(value) {
  return String(value ?? "").replace(/\s+/g, "");
}

function sanitizeDecimalInput(value, maxDecimals) {
  const sanitized = String(value ?? "")
    .replace(/,/g, ".")
    .replace(/[^\d.]/g, "");
  const [whole = "", ...fractionParts] = sanitized.split(".");
  const fraction = fractionParts.join("").slice(0, maxDecimals);
  return fractionParts.length > 0 ? `${whole}.${fraction}` : whole;
}

function parseBtcInputToSats(value) {
  const normalized = sanitizeDecimalInput(value, 8);
  if (!normalized) {
    return null;
  }

  if (!/^\d+(\.\d{0,8})?$/.test(normalized)) {
    return null;
  }

  const [wholePart, fractionPart = ""] = normalized.split(".");
  const wholeSats = BigInt(wholePart || "0") * 100_000_000n;
  const fractionalSats = BigInt((fractionPart + "00000000").slice(0, 8));
  const totalSats = wholeSats + fractionalSats;
  if (totalSats > BigInt(Number.MAX_SAFE_INTEGER)) {
    return null;
  }

  return Number(totalSats);
}

function parseMxnInputToSats(value) {
  const normalized = sanitizeDecimalInput(value, 2);
  if (!normalized || !Number.isFinite(BTC_TO_MXN_RATE) || BTC_TO_MXN_RATE <= 0) {
    return null;
  }

  const mxnValue = Number(normalized);
  if (!Number.isFinite(mxnValue) || mxnValue <= 0) {
    return null;
  }

  return Math.round(mxnValue / BTC_TO_MXN_RATE * 100_000_000);
}

function formatBtcInputValue(amountSats) {
  if (!Number.isFinite(amountSats)) {
    return "";
  }

  return trimTrailingZeros((amountSats / 100_000_000).toFixed(8));
}

function formatMxnInputValue(amountSats) {
  if (!Number.isFinite(amountSats) || !Number.isFinite(BTC_TO_MXN_RATE) || BTC_TO_MXN_RATE <= 0) {
    return "";
  }

  return trimTrailingZeros((amountSats / 100_000_000 * BTC_TO_MXN_RATE).toFixed(2));
}

function formatMxnValue(amountSats) {
  if (!Number.isFinite(amountSats) || !Number.isFinite(BTC_TO_MXN_RATE) || BTC_TO_MXN_RATE <= 0) {
    return "-- MXN";
  }

  const mxnValue = amountSats / 100_000_000 * BTC_TO_MXN_RATE;
  return `${trimTrailingZeros(mxnValue.toFixed(2))} MXN`;
}

function trimTrailingZeros(value) {
  return String(value).replace(/(\.\d*?[1-9])0+$/u, "$1").replace(/\.0+$/u, "").replace(/\.$/u, "");
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
