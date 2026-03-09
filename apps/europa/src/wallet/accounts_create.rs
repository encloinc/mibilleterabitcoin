use maud::{Markup, html};

use crate::onboard::components::{flow_header, input_field, link_button};

pub fn render() -> Markup {
    html! {
        section id="account-create-screen" class="screen card card-compact flow-card hidden" {
            (flow_header(
                Some("accounts-screen"),
                None,
                "Crear billetera",
                "Elige un nombre para la nueva billetera.",
            ))

            form id="account-create-form" class="stack flow-form" autocomplete="off" {
                (input_field(
                    Some(html! { label class="input-label" for="account-create-name" { "Nombre" } }),
                    html! {
                        input
                            class="input-control"
                            id="account-create-name"
                            type="text"
                            maxlength="40"
                            autocomplete="off"
                            required;
                    },
                    None,
                    None,
                ))

                div class="actions flow-actions" {
                    (link_button(
                        "screen-submit",
                        "/wallet/accounts",
                        None,
                        Some("account-create-form"),
                        true,
                        html! { "Crear" },
                    ))
                }
            }
        }
    }
}
