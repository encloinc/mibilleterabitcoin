use maud::{Markup, html};

use super::components::{flow_header, link_button};

pub fn render() -> Markup {
    html! {
        section id="backup-screen" class="screen card card-compact flow-card hidden" {
            (flow_header(
                Some("create-screen"),
                Some((2, 3)),
                "Crear Wallet",
                "Por favor escribe las siguientes 12 palabras en un papel. Sera la unica manera de poder recuperar tu bitcoin en caso de que pierdas acceso a este dispositivo.",
            ))

            div id="mnemonic-grid" class="seed-grid" {
                @for index in 0..12 {
                    div class="seed-chip" data-word-slot=(index) {
                        span class="seed-index" { (format!("{}.", index + 1)) }
                        span class="seed-text word-value" { "••••" }
                    }
                }
            }

            div class="actions flow-actions" {
                (link_button(
                    "screen-submit",
                    "/create-wallet#confirm-backup",
                    Some("continue-to-verify"),
                    None,
                    false,
                    html! { "Continuar" },
                ))
            }
        }
    }
}
