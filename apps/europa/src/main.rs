mod config;
mod onboard;
mod wallet;

use std::sync::Arc;

use axum::{Router, extract::State, response::Html, routing::get};
use config::AppConfig;
use maud::{DOCTYPE, Markup, PreEscaped, html};
use tower_http::services::ServeDir;

#[derive(Clone)]
struct AppState {
    config: Arc<AppConfig>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config = Arc::new(AppConfig::from_args()?);
    let bind_address = config.bind_address();
    let web_root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src/web");

    let app = Router::new()
        .route("/", get(app))
        .route("/create-wallet", get(app))
        .route("/import-wallet", get(app))
        .route("/unlock-wallet", get(app))
        .route("/unlock-wallet/delete", get(app))
        .route("/wallet", get(app))
        .route("/wallet/accounts", get(app))
        .route("/wallet/accounts/create", get(app))
        .route("/wallet/accounts/edit/{idx}", get(app))
        .nest_service("/assets/svgs", ServeDir::new(web_root.join("svgs")))
        .nest_service("/assets", ServeDir::new(web_root.join("assets")))
        .with_state(AppState {
            config: Arc::clone(&config),
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
    Html(render_app(&state.config).into_string())
}

fn render_app(config: &AppConfig) -> Markup {
    let client_config = serde_json::to_string(&config.client_config())
        .expect("client config serialization should always succeed");

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
                script type="module" src="/assets/app.js" {}
            }
        }
    }
}
