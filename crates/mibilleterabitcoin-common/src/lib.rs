use std::str::FromStr;

use anyhow::{Result, anyhow, bail};
use bip39::{Language, Mnemonic};
use bitcoin::{
    Address,
    bip32::{DerivationPath, Xpriv},
    key::{CompressedPublicKey, PrivateKey},
    secp256k1::Secp256k1,
};
use serde::Serialize;
use wasm_bindgen::prelude::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ClientNetwork {
    Bitcoin,
    Testnet,
    Signet,
    Regtest,
}

impl ClientNetwork {
    fn as_str(self) -> &'static str {
        match self {
            Self::Bitcoin => "bitcoin",
            Self::Testnet => "testnet",
            Self::Signet => "signet",
            Self::Regtest => "regtest",
        }
    }

    fn into_bitcoin(self) -> bitcoin::Network {
        match self {
            Self::Bitcoin => bitcoin::Network::Bitcoin,
            Self::Testnet => bitcoin::Network::Testnet,
            Self::Signet => bitcoin::Network::Signet,
            Self::Regtest => bitcoin::Network::Regtest,
        }
    }
}

impl FromStr for ClientNetwork {
    type Err = anyhow::Error;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value.trim().to_ascii_lowercase().as_str() {
            "bitcoin" | "mainnet" => Ok(Self::Bitcoin),
            "testnet" => Ok(Self::Testnet),
            "signet" => Ok(Self::Signet),
            "regtest" => Ok(Self::Regtest),
            other => bail!("unsupported bitcoin network: {other}"),
        }
    }
}

#[derive(Debug, Serialize)]
struct WalletPreview {
    mnemonic: String,
    address: String,
    network: String,
    derivation_path: String,
}

#[derive(Debug, Serialize)]
struct WalletAccountPreview {
    index: u32,
    address: String,
    network: String,
    derivation_path: String,
}

#[wasm_bindgen]
pub fn init() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen(js_name = createWallet)]
pub fn create_wallet(network: &str) -> Result<JsValue, JsValue> {
    create_wallet_inner(network)
        .and_then(to_js_value)
        .map_err(js_error)
}

#[wasm_bindgen(js_name = importWallet)]
pub fn import_wallet(mnemonic: &str, network: &str) -> Result<JsValue, JsValue> {
    import_wallet_inner(mnemonic, network)
        .and_then(to_js_value)
        .map_err(js_error)
}

#[wasm_bindgen(js_name = deriveWalletAccount)]
pub fn derive_wallet_account(
    mnemonic: &str,
    network: &str,
    account_index: u32,
) -> Result<JsValue, JsValue> {
    derive_wallet_account_inner(mnemonic, network, account_index)
        .and_then(to_js_value)
        .map_err(js_error)
}

#[wasm_bindgen(js_name = isMnemonicWord)]
pub fn is_mnemonic_word(word: &str) -> bool {
    let normalized = word.trim().to_lowercase();
    !normalized.is_empty() && Language::English.find_word(&normalized).is_some()
}

fn create_wallet_inner(network: &str) -> Result<WalletPreview> {
    let network = ClientNetwork::from_str(network)?;
    let mnemonic = Mnemonic::generate_in(Language::English, 12)?;
    preview_from_mnemonic(mnemonic, network, 0)
}

fn import_wallet_inner(mnemonic: &str, network: &str) -> Result<WalletPreview> {
    let network = ClientNetwork::from_str(network)?;
    let mnemonic = parse_mnemonic(mnemonic)?;
    preview_from_mnemonic(mnemonic, network, 0)
}

fn derive_wallet_account_inner(
    mnemonic: &str,
    network: &str,
    account_index: u32,
) -> Result<WalletAccountPreview> {
    let network = ClientNetwork::from_str(network)?;
    let mnemonic = parse_mnemonic(mnemonic)?;
    account_preview_from_mnemonic(&mnemonic, network, account_index)
}

fn preview_from_mnemonic(
    mnemonic: Mnemonic,
    network: ClientNetwork,
    account_index: u32,
) -> Result<WalletPreview> {
    let account = account_preview_from_mnemonic(&mnemonic, network, account_index)?;

    Ok(WalletPreview {
        mnemonic: mnemonic.to_string(),
        address: account.address,
        network: account.network,
        derivation_path: account.derivation_path,
    })
}

fn account_preview_from_mnemonic(
    mnemonic: &Mnemonic,
    network: ClientNetwork,
    account_index: u32,
) -> Result<WalletAccountPreview> {
    let derivation_path = standard_derivation_path(network, account_index);
    let address = derive_account_address(mnemonic, network, &derivation_path)?;

    Ok(WalletAccountPreview {
        index: account_index,
        address,
        network: network.as_str().to_owned(),
        derivation_path,
    })
}

fn derive_account_address(
    mnemonic: &Mnemonic,
    network: ClientNetwork,
    derivation_path: &str,
) -> Result<String> {
    let secp = Secp256k1::new();
    let seed = mnemonic.to_seed("");
    let bitcoin_network = network.into_bitcoin();
    let master_key = Xpriv::new_master(bitcoin_network, &seed)?;
    let path = DerivationPath::from_str(derivation_path)?;
    let child_key = master_key.derive_priv(&secp, &path)?;
    let private_key = PrivateKey::new(child_key.private_key, bitcoin_network);
    let public_key = CompressedPublicKey::from_private_key(&secp, &private_key)
        .map_err(|error| anyhow!("failed to derive compressed public key: {error}"))?;
    let address = Address::p2wpkh(&public_key, bitcoin_network);

    Ok(address.to_string())
}

fn standard_derivation_path(network: ClientNetwork, account_index: u32) -> String {
    let coin_type = match network {
        ClientNetwork::Bitcoin => 0,
        ClientNetwork::Testnet | ClientNetwork::Signet | ClientNetwork::Regtest => 1,
    };

    format!("m/84'/{coin_type}'/{account_index}'/0/0")
}

fn parse_mnemonic(phrase: &str) -> Result<Mnemonic> {
    let normalized = normalize_mnemonic(phrase);

    if normalized.split_whitespace().count() != 12 {
        bail!("mnemonic must contain exactly 12 words");
    }

    Mnemonic::parse_in(Language::English, &normalized).map_err(Into::into)
}

fn normalize_mnemonic(phrase: &str) -> String {
    phrase
        .split_whitespace()
        .map(|word| word.trim().to_lowercase())
        .collect::<Vec<_>>()
        .join(" ")
}

fn to_js_value<T: Serialize>(value: T) -> Result<JsValue> {
    serde_wasm_bindgen::to_value(&value).map_err(Into::into)
}

fn js_error(error: anyhow::Error) -> JsValue {
    JsValue::from_str(&error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_wrong_word_count() {
        let result = import_wallet_inner("abandon abandon abandon", "testnet");
        assert!(result.is_err());
    }

    #[test]
    fn derivation_path_uses_test_coin_type() {
        assert_eq!(
            standard_derivation_path(ClientNetwork::Signet, 0),
            "m/84'/1'/0'/0/0"
        );
    }

    #[test]
    fn derivation_path_uses_account_index() {
        assert_eq!(
            standard_derivation_path(ClientNetwork::Bitcoin, 3),
            "m/84'/0'/3'/0/0"
        );
    }
}
