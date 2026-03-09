use maud::{Markup, html};

use crate::onboard::components::link_button;

pub fn render() -> Markup {
    html! {
        section id="accounts-screen" class="screen card card-compact wallet-accounts-screen hidden" {
            div class="wallet-subpage-header" {
                button type="button" class="back-arrow" data-back="menu-screen" aria-label="Regresar" {
                    img class="back-arrow-icon" src="/assets/svgs/back.svg" alt="";
                }

                p class="wallet-subpage-title" { "Tus cuentas:" }
            }

            div id="wallet-accounts-list" class="wallet-accounts-list" role="list" {}

            div class="actions wallet-accounts-actions" {
                (link_button(
                    "screen-submit wallet-account-create-link",
                    "/wallet/accounts/create",
                    None,
                    None,
                    false,
                    html! {
                        img class="wallet-account-create-icon" src="/assets/svgs/plus-dark.svg" alt="";
                        span { "Crear cuenta" }
                    },
                ))
            }

            div class="wallet-accounts-footer" {
                button type="button" class="ghost wallet-session-button" id="forget-wallet-accounts" {
                    img class="wallet-session-icon" src="/assets/svgs/off.svg" alt="";
                    span { "Cerrar Sesion" }
                }
            }
        }
    }
}
