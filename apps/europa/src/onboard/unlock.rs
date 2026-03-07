use maud::{Markup, html};

use super::components::{input_field, link_button, password_toggle};

pub fn render() -> Markup {
    html! {
        section id="unlock-screen" class="screen card card-compact flow-card hidden" {
            div class="screen-copy flow-copy" {
                h2 class="screen-title flow-title" { "Desbloquear Wallet" }
                p class="flow-description" { "Descifra la wallet almacenada en este navegador." }
            }
            form id="unlock-form" class="stack flow-form" autocomplete="off" {
                (input_field(
                    Some(html! { label class="input-label" for="unlock-password" { "Contraseña" } }),
                    html! {
                        input
                            class="input-control"
                            id="unlock-password"
                            type="password"
                            autocomplete="off"
                            data-1p-ignore="true"
                            data-lpignore="true"
                            required;
                    },
                    None,
                    Some(password_toggle("unlock-password")),
                ))

                div class="actions flow-actions" {
                    (link_button(
                        "screen-submit",
                        "/wallet",
                        None,
                        Some("unlock-form"),
                        true,
                        html! { "Desbloquear" },
                    ))
                    button type="button" class="ghost" id="forget-wallet-unlock" { "Olvidar wallet guardada" }
                }
            }
        }
    }
}
