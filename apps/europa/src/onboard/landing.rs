use maud::{Markup, html};

use super::components::link_button;

pub fn render() -> Markup {
    html! {
        section id="landing-screen" class="screen card card-compact landing-card" {
            div class="landing-content" {
                div class="landing-hero" {
                    img class="landing-hola" src="/assets/svgs/hola.svg" alt="hola!";
                    p class="landing-subtitle" { "¿Listo para sentir la libertad financiera?" }
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
                            span { "Crear Billetera" }
                        },
                    ))

                    div class="menu-divider" {
                        span class="menu-divider-line" {}
                        span class="menu-divider-copy" { "O ya tienes una billetera?" }
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
                            span { "Importar Billetera" }
                        },
                    ))
                }
            }

            details class="landing-footer-wrap" {
                summary class="landing-footer" {
                    span class="landing-footer-label" {
                        span { "¿Qué es" }
                        span class="landing-footer-bitcoin" {
                            img class="landing-footer-icon" src="/assets/svgs/bitcoin.svg" alt="";
                            span { "Bitcoin?" }
                        }
                    }
                    img class="landing-footer-caret" src="/assets/svgs/caret.svg" alt="";
                }
                p class="landing-about" {
                    "Bitcoin es un sistema de dinero digital descentralizado que permite enviar y recibir dinero por internet sin intermediarios."
                }
                a
                    class="menu-button landing-video-button"
                    href="https://www.youtube.com/watch?v=rpvBYASClQA"
                    target="_blank"
                    rel="noreferrer noopener" {
                    img class="menu-button-icon" src="/assets/svgs/youtube.svg" alt="";
                    span { "Ver video explicativo" }
                }
            }
        }
    }
}
