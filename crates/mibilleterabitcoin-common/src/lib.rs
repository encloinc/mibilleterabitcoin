use std::str::FromStr;

use anyhow::{Result, anyhow, bail};
use bip39::{Language, Mnemonic};
use bitcoin::{
    Address, Amount, OutPoint, ScriptBuf, Sequence, Transaction, TxIn, TxOut, Witness,
    bip32::{DerivationPath, Xpriv},
    consensus::encode,
    key::{CompressedPublicKey, PrivateKey},
    locktime::absolute,
    secp256k1::Message,
    secp256k1::Secp256k1,
    sighash::{EcdsaSighashType, SighashCache},
    transaction,
};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ClientNetwork {
    Mainnet,
    Testnet3,
    Testnet4,
    Signet,
    Regtest,
}

impl ClientNetwork {
    fn as_str(self) -> &'static str {
        match self {
            Self::Mainnet => "mainnet",
            Self::Testnet3 => "testnet3",
            Self::Testnet4 => "testnet4",
            Self::Signet => "signet",
            Self::Regtest => "regtest",
        }
    }

    fn into_bitcoin(self) -> bitcoin::Network {
        match self {
            Self::Mainnet => bitcoin::Network::Bitcoin,
            Self::Testnet3 => bitcoin::Network::Testnet,
            Self::Testnet4 => bitcoin::Network::Testnet4,
            Self::Signet => bitcoin::Network::Signet,
            Self::Regtest => bitcoin::Network::Regtest,
        }
    }
}

impl FromStr for ClientNetwork {
    type Err = anyhow::Error;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value.trim().to_ascii_lowercase().as_str() {
            "bitcoin" | "mainnet" => Ok(Self::Mainnet),
            "testnet" | "testnet3" => Ok(Self::Testnet3),
            "testnet4" => Ok(Self::Testnet4),
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

#[derive(Debug, Deserialize, Serialize, Clone)]
struct WalletUtxo {
    txid: String,
    vout: u32,
    value: u64,
}

#[derive(Debug, Serialize)]
struct PreparedSendTx {
    ready: bool,
    tx_hex: String,
    txid: String,
    fee_sats: u64,
    fee_rate_sat_vb: f64,
    tx_vbytes: u64,
    input_count: usize,
    output_count: usize,
    change_sats: u64,
    amount_sats: u64,
    total_input_sats: u64,
}

#[derive(Debug)]
struct AccountSigningMaterial {
    secret_key: bitcoin::secp256k1::SecretKey,
    public_key: bitcoin::secp256k1::PublicKey,
    address: Address,
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

#[wasm_bindgen(js_name = validateBitcoinAddress)]
pub fn validate_bitcoin_address(address: &str, network: &str) -> bool {
    validate_bitcoin_address_inner(address, network).is_ok()
}

#[wasm_bindgen(js_name = prepareSendTx)]
pub fn prepare_send_tx(
    mnemonic: &str,
    network: &str,
    account_index: u32,
    recipient_address: &str,
    amount_sats: u64,
    fee_rate_sat_vb: f64,
    utxos: JsValue,
) -> Result<JsValue, JsValue> {
    prepare_send_tx_inner(
        mnemonic,
        network,
        account_index,
        recipient_address,
        amount_sats,
        fee_rate_sat_vb,
        utxos,
    )
    .and_then(to_js_value)
    .map_err(js_error)
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
    let signing_material = derive_account_signing_material(mnemonic, network, derivation_path)?;
    Ok(signing_material.address.to_string())
}

fn derive_account_signing_material(
    mnemonic: &Mnemonic,
    network: ClientNetwork,
    derivation_path: &str,
) -> Result<AccountSigningMaterial> {
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
    let secp_public_key = child_key.private_key.public_key(&secp);

    Ok(AccountSigningMaterial {
        secret_key: child_key.private_key,
        public_key: secp_public_key,
        address,
    })
}

fn standard_derivation_path(network: ClientNetwork, account_index: u32) -> String {
    let coin_type = match network {
        ClientNetwork::Mainnet => 0,
        ClientNetwork::Testnet3
        | ClientNetwork::Testnet4
        | ClientNetwork::Signet
        | ClientNetwork::Regtest => 1,
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

fn validate_bitcoin_address_inner(address: &str, network: &str) -> Result<()> {
    let network = ClientNetwork::from_str(network)?;
    let parsed = Address::from_str(address.trim())?;

    if !parsed.is_valid_for_network(network.into_bitcoin()) {
        bail!("address is not valid for {}", network.as_str());
    }

    Ok(())
}

fn prepare_send_tx_inner(
    mnemonic: &str,
    network: &str,
    account_index: u32,
    recipient_address: &str,
    amount_sats: u64,
    fee_rate_sat_vb: f64,
    utxos_value: JsValue,
) -> Result<PreparedSendTx> {
    let utxos: Vec<WalletUtxo> = serde_wasm_bindgen::from_value(utxos_value)?;
    prepare_send_tx_from_utxos(
        mnemonic,
        network,
        account_index,
        recipient_address,
        amount_sats,
        fee_rate_sat_vb,
        utxos,
    )
}

fn prepare_send_tx_from_utxos(
    mnemonic: &str,
    network: &str,
    account_index: u32,
    recipient_address: &str,
    amount_sats: u64,
    fee_rate_sat_vb: f64,
    utxos: Vec<WalletUtxo>,
) -> Result<PreparedSendTx> {
    let network = ClientNetwork::from_str(network)?;
    let mnemonic = parse_mnemonic(mnemonic)?;
    let derivation_path = standard_derivation_path(network, account_index);
    let signing_material = derive_account_signing_material(&mnemonic, network, &derivation_path)?;

    if amount_sats == 0 {
        bail!("amount must be greater than zero");
    }
    if !fee_rate_sat_vb.is_finite() || fee_rate_sat_vb <= 0.0 {
        bail!("fee rate must be a positive finite number");
    }
    if utxos.is_empty() {
        bail!("wallet has no spendable UTXOs");
    }

    let recipient_address_unchecked = Address::from_str(recipient_address.trim())?;
    let recipient_address = recipient_address_unchecked.require_network(network.into_bitcoin())?;
    let recipient_script_pubkey = recipient_address.script_pubkey();
    let recipient_dust_limit = recipient_script_pubkey.minimal_non_dust().to_sat();
    if amount_sats < recipient_dust_limit {
        bail!("amount is below the dust limit");
    }

    let sender_script_pubkey = signing_material.address.script_pubkey();
    let change_dust_limit = sender_script_pubkey.minimal_non_dust().to_sat();
    let selected_utxos = select_utxos(&utxos, amount_sats, fee_rate_sat_vb)?;
    let total_input_sats = selected_utxos.iter().map(|utxo| utxo.value).sum::<u64>();

    let mut estimated_fee_sats = estimate_fee_sats(selected_utxos.len(), 2, fee_rate_sat_vb)?;
    if total_input_sats < amount_sats + estimated_fee_sats {
        bail!("insufficient funds to cover the amount and fee");
    }

    let mut change_sats = total_input_sats - amount_sats - estimated_fee_sats;
    let use_change_output = if change_sats >= change_dust_limit {
        true
    } else {
        estimated_fee_sats = estimate_fee_sats(selected_utxos.len(), 1, fee_rate_sat_vb)?;
        if total_input_sats < amount_sats + estimated_fee_sats {
            bail!("insufficient funds to cover the amount and fee");
        }
        change_sats = 0;
        false
    };

    let mut outputs = vec![TxOut {
        value: Amount::from_sat(amount_sats),
        script_pubkey: recipient_script_pubkey,
    }];

    if use_change_output {
        outputs.push(TxOut {
            value: Amount::from_sat(change_sats),
            script_pubkey: sender_script_pubkey.clone(),
        });
    }

    let mut tx = Transaction {
        version: transaction::Version::TWO,
        lock_time: absolute::LockTime::ZERO,
        input: selected_utxos
            .iter()
            .map(|utxo| -> Result<TxIn> {
                Ok(TxIn {
                    previous_output: OutPoint::new(bitcoin::Txid::from_str(&utxo.txid)?, utxo.vout),
                    script_sig: ScriptBuf::new(),
                    sequence: Sequence::ENABLE_RBF_NO_LOCKTIME,
                    witness: Witness::default(),
                })
            })
            .collect::<Result<Vec<_>>>()?,
        output: outputs,
    };

    let secp = Secp256k1::new();
    let sighash_type = EcdsaSighashType::All;
    let mut sighasher = SighashCache::new(&mut tx);
    for (index, utxo) in selected_utxos.iter().enumerate() {
        let sighash = sighasher.p2wpkh_signature_hash(
            index,
            &sender_script_pubkey,
            Amount::from_sat(utxo.value),
            sighash_type,
        )?;
        let message = Message::from(sighash);
        let signature = secp.sign_ecdsa(&message, &signing_material.secret_key);
        let signature = bitcoin::ecdsa::Signature {
            signature,
            sighash_type,
        };
        *sighasher
            .witness_mut(index)
            .ok_or_else(|| anyhow!("missing witness slot for input {index}"))? =
            Witness::p2wpkh(&signature, &signing_material.public_key);
    }

    let tx = sighasher.into_transaction();
    let tx_vbytes = tx.vsize() as u64;
    let output_sum_sats = tx
        .output
        .iter()
        .map(|output| output.value.to_sat())
        .sum::<u64>();
    let fee_sats = total_input_sats
        .checked_sub(output_sum_sats)
        .ok_or_else(|| anyhow!("transaction outputs exceed selected inputs"))?;
    let effective_fee_rate = fee_sats as f64 / tx_vbytes as f64;

    Ok(PreparedSendTx {
        ready: true,
        tx_hex: encode::serialize_hex(&tx),
        txid: tx.compute_txid().to_string(),
        fee_sats,
        fee_rate_sat_vb: effective_fee_rate,
        tx_vbytes,
        input_count: tx.input.len(),
        output_count: tx.output.len(),
        change_sats: tx
            .output
            .iter()
            .skip(1)
            .map(|output| output.value.to_sat())
            .sum::<u64>(),
        amount_sats,
        total_input_sats,
    })
}

fn select_utxos(
    utxos: &[WalletUtxo],
    amount_sats: u64,
    fee_rate_sat_vb: f64,
) -> Result<Vec<WalletUtxo>> {
    let mut ordered = utxos
        .iter()
        .filter(|utxo| utxo.value > 0)
        .cloned()
        .collect::<Vec<_>>();
    ordered.sort_by(|left, right| right.value.cmp(&left.value));

    let mut selected = Vec::new();
    let mut total_input_sats = 0_u64;

    for utxo in ordered {
        total_input_sats = total_input_sats.saturating_add(utxo.value);
        selected.push(utxo);

        let estimated_fee_sats = estimate_fee_sats(selected.len(), 2, fee_rate_sat_vb)?;
        if total_input_sats >= amount_sats + estimated_fee_sats {
            return Ok(selected);
        }
    }

    bail!("insufficient funds to cover the amount and fee")
}

fn estimate_fee_sats(input_count: usize, output_count: usize, fee_rate_sat_vb: f64) -> Result<u64> {
    if input_count == 0 || output_count == 0 {
        bail!("transaction must have at least one input and one output");
    }

    if !fee_rate_sat_vb.is_finite() || fee_rate_sat_vb <= 0.0 {
        bail!("fee rate must be a positive finite number");
    }

    let estimated_vbytes = 10.5 + (input_count as f64 * 68.0) + (output_count as f64 * 31.0);
    Ok((estimated_vbytes * fee_rate_sat_vb).ceil() as u64)
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
            standard_derivation_path(ClientNetwork::Testnet4, 0),
            "m/84'/1'/0'/0/0"
        );
    }

    #[test]
    fn derivation_path_uses_account_index() {
        assert_eq!(
            standard_derivation_path(ClientNetwork::Mainnet, 3),
            "m/84'/0'/3'/0/0"
        );
    }

    #[test]
    fn validates_signet_style_address_for_signet() {
        assert!(
            validate_bitcoin_address_inner("tb1qz9xr6myl7qhrnkhl7ecd2dh3ykjal4yf2ekxtg", "signet")
                .is_ok()
        );
    }

    #[test]
    fn prepare_send_tx_rejects_insufficient_funds() {
        let mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
        let utxos = vec![WalletUtxo {
            txid: "0000000000000000000000000000000000000000000000000000000000000001".to_owned(),
            vout: 0,
            value: 1_000,
        }];

        let result = prepare_send_tx_from_utxos(
            mnemonic,
            "signet",
            0,
            "tb1qz9xr6myl7qhrnkhl7ecd2dh3ykjal4yf2ekxtg",
            50_000,
            1.0,
            utxos,
        );

        assert!(result.is_err());
    }

    #[test]
    fn prepare_send_tx_builds_signed_transaction() {
        let mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
        let wallet = import_wallet_inner(mnemonic, "signet").unwrap();
        let utxos = vec![WalletUtxo {
            txid: "1111111111111111111111111111111111111111111111111111111111111111".to_owned(),
            vout: 0,
            value: 150_000,
        }];

        let prepared =
            prepare_send_tx_from_utxos(mnemonic, "signet", 0, &wallet.address, 25_000, 2.0, utxos)
                .unwrap();

        assert!(prepared.ready);
        assert!(!prepared.tx_hex.is_empty());
        assert!(prepared.fee_sats > 0);
        assert!(prepared.tx_vbytes > 0);
    }
}
