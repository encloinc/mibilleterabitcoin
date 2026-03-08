use std::{
    env,
    fs::File,
    io::BufReader,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result, anyhow, bail};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum BitcoinNetwork {
    #[serde(alias = "mainnet", alias = "bitcoin")]
    Bitcoin,
    Testnet,
    Signet,
    Regtest,
}

impl BitcoinNetwork {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Bitcoin => "bitcoin",
            Self::Testnet => "testnet",
            Self::Signet => "signet",
            Self::Regtest => "regtest",
        }
    }
}

#[derive(Clone, Debug)]
pub struct AppConfig {
    pub network: BitcoinNetwork,
    pub host: String,
    pub port: u16,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct RawConfig {
    network: BitcoinNetwork,
    host: String,
    port: u16,
}

#[derive(Debug, Serialize)]
pub struct ClientConfig {
    network: &'static str,
    storage_key: String,
}

impl AppConfig {
    pub fn from_args() -> Result<Self> {
        let config_path = parse_config_path()?;
        Self::from_path(&config_path)
    }

    pub fn from_path(path: &Path) -> Result<Self> {
        let file = File::open(path)
            .with_context(|| format!("failed to open config file {}", path.display()))?;
        let reader = BufReader::new(file);
        let raw: RawConfig = serde_json::from_reader(reader)
            .with_context(|| format!("failed to parse config file {}", path.display()))?;

        if raw.host.trim().is_empty() {
            bail!("config host must not be empty");
        }

        Ok(Self {
            network: raw.network,
            host: raw.host,
            port: raw.port,
        })
    }

    pub fn bind_address(&self) -> String {
        format!("{}:{}", self.host, self.port)
    }

    pub fn client_config(&self) -> ClientConfig {
        ClientConfig {
            network: self.network.as_str(),
            storage_key: format!("mibilleterabitcoin.wallet.v1.{}", self.network.as_str()),
        }
    }
}

fn parse_config_path() -> Result<PathBuf> {
    let mut args = env::args().skip(1);

    while let Some(arg) = args.next() {
        if arg == "--config" {
            let value = args
                .next()
                .ok_or_else(|| anyhow!("missing path after --config"))?;
            return Ok(PathBuf::from(value));
        }

        if let Some(value) = arg.strip_prefix("--config=") {
            return Ok(PathBuf::from(value));
        }
    }

    bail!("expected --config <path-to-config.json>");
}
