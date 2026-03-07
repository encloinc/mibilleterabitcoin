use maud::{Markup, html};

use super::components::{
    flow_header, input_field, link_button, password_strength_indicator, password_toggle,
};

pub fn render() -> Markup {
    html! {
        section id="create-screen" class="screen card card-compact flow-card hidden" {
            (flow_header(
                Some("landing-screen"),
                Some((1, 3)),
                "Configura tu Wallet",
                "Define una contraseña segura para cifrar tu wallet en este navegador.",
            ))

            form id="create-form" class="stack flow-form" autocomplete="off" {
                (input_field(
                    Some(html! { label class="input-label" for="create-password" { "Contraseña" } }),
                    html! {
                        input
                            class="input-control"
                            id="create-password"
                            name="password"
                            type="password"
                            minlength="8"
                            autocomplete="off"
                            data-1p-ignore="true"
                            data-lpignore="true"
                            required;
                    },
                    None,
                    Some(password_toggle("create-password")),
                ))

                (password_strength_indicator("create-password"))

                (input_field(
                    Some(html! { label class="input-label" for="create-password-confirm" { "Confirmar contraseña" } }),
                    html! {
                        input
                            class="input-control"
                            id="create-password-confirm"
                            name="password_confirm"
                            type="password"
                            minlength="8"
                            autocomplete="off"
                            data-1p-ignore="true"
                            data-lpignore="true"
                            data-match-id="create-password"
                            required;
                    },
                    None,
                    Some(password_toggle("create-password-confirm")),
                ))

                div class="actions flow-actions" {
                    (link_button(
                        "screen-submit",
                        "/create-wallet#backup",
                        None,
                        Some("create-form"),
                        true,
                        html! { "Continuar" },
                    ))
                }
            }
        }
    }
}
