use maud::{Markup, html};

use super::components::link_button;

pub fn render() -> Markup {
    html! {
        section id="landing-screen" class="screen card card-compact landing-card" {
            div class="landing-content" {
                div class="landing-hero" {
                    img class="landing-hola" src="/assets/svgs/hola.svg" alt="hola!";
                    p class="landing-subtitle" { "Bienvenido a Europa" }
                }

                div class="landing-actions" {
                    (link_button(
                        "menu-button",
                        "/create-wallet#choose-password",
                        None,
                        None,
                        false,
                        html! {
                            img class="menu-button-icon" src="/assets/svgs/plus-wallet.svg" alt="";
                            span { "Crear Wallet" }
                        },
                    ))

                    div class="menu-divider" {
                        span class="menu-divider-line" {}
                        span class="menu-divider-copy" { "O ya tienes una wallet?" }
                        span class="menu-divider-line" {}
                    }

                    (link_button(
                        "menu-button",
                        "/import-wallet#provide-phrase",
                        None,
                        None,
                        false,
                        html! {
                            img class="menu-button-icon" src="/assets/svgs/up-wallet.svg" alt="";
                            span { "Importar Wallet" }
                        },
                    ))
                }
            }

            details class="landing-footer-wrap" {
                summary class="landing-footer" {
                    span { "Que es Europa?" }
                    img class="landing-footer-caret" src="/assets/svgs/caret.svg" alt="";
                }
                p class="landing-about" {
                    "Europa es un sistema de ECASH para Bitcoin con settlements en L1, creado por mork1e en X para el hackathon educativo de Aureo. Permite transacciones instantaneas entre usuarios."
                }
            }
        }
    }
}
