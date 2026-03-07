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

    let app = Router::new()
        .route("/", get(index))
        .nest_service("/assets", ServeDir::new("src/web/assets"))
        .with_state(AppState {
            config: Arc::clone(&config),
        });

    let listener = tokio::net::TcpListener::bind(&bind_address).await?;

    println!(
        "europa wallet listening on http://{} [{}]",
        bind_address,
        config.network.as_str()
    );

    axum::serve(listener, app).await?;

    Ok(())
}

async fn index(State(state): State<AppState>) -> Html<String> {
    Html(render_index(&state.config).into_string())
}

fn render_index(config: &AppConfig) -> Markup {
    let client_config = serde_json::to_string(&config.client_config())
        .expect("client config serialization should always succeed");

    html! {
        (DOCTYPE)
        html lang="en" {
            head {
                meta charset="utf-8";
                meta name="viewport" content="width=device-width, initial-scale=1";
                title { "Europa Wallet" }
                link rel="stylesheet" href="/assets/styles.css";
            }
            body {
                main class="shell" {
                    section class="hero" {
                        div class="hero-copy" {
                            p class="eyebrow" { "Europa" }
                            h1 { "A minimal Bitcoin wallet onboarding flow." }
                            p class="lede" {
                                "Create a 12-word wallet, verify you backed it up, or import an existing phrase. "
                                "The server only renders this page and serves the static client assets."
                            }
                        }
                        div class="network-card" {
                            span class="label" { "Network" }
                            strong id="network-badge" { (config.network.as_str()) }
                        }
                    }

                    p id="flash" class="flash hidden" role="status" aria-live="polite" {}

                    (onboard::landing::render())
                    (onboard::create::render())
                    (onboard::backup::render())
                    (onboard::verify::render())
                    (onboard::import::render())
                    (onboard::unlock::render())
                    (wallet::dashboard::render())
                }

                script {
                    (PreEscaped(format!("window.APP_CONFIG = {};", client_config)))
                }
                script type="module" src="/assets/app.js" {}
            }
        }
    }
}
