use maud::{Markup, html};

use super::components::{flow_header, link_button};

pub fn render() -> Markup {
    html! {
        section id="backup-screen" class="screen card card-compact flow-card hidden" {
            (flow_header(
                Some("create-screen"),
                Some((2, 3)),
                "Respalda tu billetera",
                "",
            ))

            p class="flow-description" {
                "Porfavor escribe las siguientes 12 palabras en un papel."
            }

            div class="backup-warning" {
                span class="backup-warning-icon" aria-hidden="true" {}
                p {
                    "En caso de perder acceso a este dispositivo, esta será la única manera de recuperar tu Bitcoin"
                }
            }

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
