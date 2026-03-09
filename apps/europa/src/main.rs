mod config;
mod onboard;
mod wallet;

use std::{sync::Arc, time::Duration};

use axum::{Router, extract::State, response::Html, routing::get};
use config::AppConfig;
use maud::{DOCTYPE, Markup, PreEscaped, html};
use reqwest::Client;
use serde::Deserialize;
use tokio::sync::RwLock;
use tower_http::services::ServeDir;

#[derive(Clone)]
struct AppState {
    config: Arc<AppConfig>,
    btc_to_mxn_rate: Arc<RwLock<Option<f64>>>,
}

#[derive(Debug, Deserialize)]
struct BtcMxnResponse {
    data: BtcMxnResponseData,
}

#[derive(Debug, Deserialize)]
struct BtcMxnResponseData {
    amount: String,
    base: String,
    currency: String,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config = Arc::new(AppConfig::from_args()?);
    let bind_address = config.bind_address();
    let web_root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src/web");
    let http_client = Client::builder().build()?;
    let btc_to_mxn_rate = Arc::new(RwLock::new(None));

    refresh_btc_to_mxn_rate(&http_client, &config, &btc_to_mxn_rate).await;
    tokio::spawn(run_btc_to_mxn_refresh_loop(
        http_client.clone(),
        Arc::clone(&config),
        Arc::clone(&btc_to_mxn_rate),
    ));

    let app = Router::new()
        .route("/", get(app))
        .route("/create-wallet", get(app))
        .route("/import-wallet", get(app))
        .route("/unlock-wallet", get(app))
        .route("/unlock-wallet/delete", get(app))
        .route("/wallet", get(app))
        .route("/wallet/receive", get(app))
        .route("/wallet/send", get(app))
        .route("/wallet/send/success", get(app))
        .route("/wallet/send/error", get(app))
        .route("/wallet/accounts", get(app))
        .route("/wallet/accounts/create", get(app))
        .route("/wallet/accounts/edit/{idx}", get(app))
        .nest_service("/assets/svgs", ServeDir::new(web_root.join("svgs")))
        .nest_service("/assets", ServeDir::new(web_root.join("assets")))
        .with_state(AppState {
            config: Arc::clone(&config),
            btc_to_mxn_rate,
        });

    let listener = tokio::net::TcpListener::bind(&bind_address).await?;

    println!(
        "mibilleterabitcoin billetera listening on http://{} [{}]",
        bind_address,
        config.network.as_str()
    );

    axum::serve(listener, app).await?;

    Ok(())
}

async fn app(State(state): State<AppState>) -> Html<String> {
    let btc_to_mxn_rate = *state.btc_to_mxn_rate.read().await;
    Html(render_app(&state.config, btc_to_mxn_rate).into_string())
}

fn render_app(config: &AppConfig, btc_to_mxn_rate: Option<f64>) -> Markup {
    let client_config = serde_json::to_string(&config.client_config())
        .expect("client config serialization should always succeed");
    let btc_to_mxn_rate_js = match btc_to_mxn_rate {
        Some(rate) => rate.to_string(),
        None => "null".to_owned(),
    };

    html! {
        (DOCTYPE)
        html lang="en" {
            head {
                meta charset="utf-8";
                meta name="viewport" content="width=device-width, initial-scale=1";
                title { "mibilleterabitcoin Billetera" }
                link rel="stylesheet" href="/assets/styles.css";
            }
            body {
                main class="app-shell" {
                    header class="app-brand" {
                        img
                            class="brand-lockup"
                            src="/assets/svgs/mibilleterabitcoin-logotype.svg"
                            alt="mibilleterabitcoin";
                    }
                    p id="flash" class="flash hidden" role="status" aria-live="polite" {}

                    div class="screen-stage" {
                        (onboard::landing::render())
                        (onboard::create::render())
                        (onboard::backup::render())
                        (onboard::verify::render())
                        (onboard::import::render())
                        (onboard::unlock::render())
                        (onboard::unlock_delete::render())
                        (wallet::dashboard::render())
                        (wallet::receive::render(config.required_confirmations))
                        (wallet::send::render(config.required_confirmations))
                        (wallet::send_success::render())
                        (wallet::send_error::render())
                        (wallet::accounts::render())
                        (wallet::accounts_create::render())
                        (wallet::accounts_edit::render())
                    }

                    p class="network-note" {
                        "Network: "
                        span { (config.network.as_str()) }
                    }
                }

                script {
                    (PreEscaped(format!("window.APP_CONFIG = {};", client_config)))
                }
                script {
                    (PreEscaped(format!("window.BTC_TO_MXN_RATE = {};", btc_to_mxn_rate_js)))
                }
                script src="/assets/scripts/qrcode.min.js" {}
                script type="module" src="/assets/app.js" {}
            }
        }
    }
}

async fn run_btc_to_mxn_refresh_loop(
    http_client: Client,
    config: Arc<AppConfig>,
    btc_to_mxn_rate: Arc<RwLock<Option<f64>>>,
) {
    let mut interval = tokio::time::interval(Duration::from_secs(120));
    interval.tick().await;

    loop {
        interval.tick().await;
        refresh_btc_to_mxn_rate(&http_client, &config, &btc_to_mxn_rate).await;
    }
}

async fn refresh_btc_to_mxn_rate(
    http_client: &Client,
    config: &AppConfig,
    btc_to_mxn_rate: &Arc<RwLock<Option<f64>>>,
) {
    match fetch_btc_to_mxn_rate(http_client, &config.btc_mxn_endpoint).await {
        Ok(rate) => {
            *btc_to_mxn_rate.write().await = Some(rate);
        }
        Err(error) => {
            eprintln!(
                "failed to refresh BTC/MXN rate from {}: {error}",
                config.btc_mxn_endpoint
            );
        }
    }
}

async fn fetch_btc_to_mxn_rate(http_client: &Client, endpoint: &str) -> anyhow::Result<f64> {
    let payload: BtcMxnResponse = http_client
        .get(endpoint)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    if payload.data.base.trim() != "BTC" || payload.data.currency.trim() != "MXN" {
        anyhow::bail!(
            "unexpected BTC/MXN payload {} -> {}",
            payload.data.base,
            payload.data.currency
        );
    }

    let amount = payload
        .data
        .amount
        .trim()
        .parse::<f64>()
        .map_err(|error| anyhow::anyhow!("invalid BTC/MXN amount: {error}"))?;

    if !amount.is_finite() || amount <= 0.0 {
        anyhow::bail!("BTC/MXN amount must be a positive finite number");
    }

    Ok(amount)
}
