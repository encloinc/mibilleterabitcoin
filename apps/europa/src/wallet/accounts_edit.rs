use maud::{Markup, html};

use crate::onboard::components::{flow_header, input_field, link_button};

pub fn render() -> Markup {
    html! {
        section id="account-edit-screen" class="screen card card-compact flow-card hidden" {
            (flow_header(
                Some("accounts-screen"),
                None,
                "Editar billetera",
                "Actualiza el nombre de esta billetera.",
            ))

            form id="account-edit-form" class="stack flow-form" autocomplete="off" {
                (input_field(
                    Some(html! { label class="input-label" for="account-edit-name" { "Nombre" } }),
                    html! {
                        input
                            class="input-control"
                            id="account-edit-name"
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
                        Some("account-edit-form"),
                        true,
                        html! { "Editar" },
                    ))
                }
            }
        }
    }
}
