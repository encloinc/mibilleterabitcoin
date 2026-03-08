use maud::{Markup, html};

use super::components::{
    flow_header, input_field, link_button, password_strength_indicator, password_toggle,
};

pub fn render() -> Markup {
    html! {
        section id="import-phrase-screen" class="screen card card-compact flow-card hidden" {
            (flow_header(
                Some("landing-screen"),
                Some((1, 2)),
                "Importar Billetera",
                "Ingresa las 12 palabras de tu frase para validar tu billetera antes de continuar.",
            ))

            form id="import-phrase-form" class="stack flow-form" autocomplete="off" {
                div class="input-grid" {
                    @for index in 0..12 {
                        (input_field(
                            None,
                            html! {
                                input
                                    class="input-control"
                                    type="text"
                                    data-import-word=(index)
                                    placeholder=(format!("Palabra #{}", index + 1))
                                    spellcheck="false"
                                    autocapitalize="off"
                                    autocomplete="off"
                                    required;
                            },
                            Some(html! { span class="input-slot-text" { (format!("{}.", index + 1)) } }),
                            None,
                        ))
                    }
                }

                div class="actions flow-actions" {
                    (link_button(
                        "screen-submit",
                        "/import-wallet#choose-password",
                        None,
                        Some("import-phrase-form"),
                        true,
                        html! { "Continuar" },
                    ))
                }
            }
        }

        section id="import-password-screen" class="screen card card-compact flow-card hidden" {
            (flow_header(
                Some("import-phrase-screen"),
                Some((2, 2)),
                "Protege tu Billetera",
                "Define una contraseña para cifrar la billetera importada en este navegador.",
            ))

            form id="import-password-form" class="stack flow-form" autocomplete="off" {
                (input_field(
                    Some(html! { label class="input-label" for="import-password" { "Contraseña" } }),
                    html! {
                        input
                            class="input-control"
                            id="import-password"
                            type="password"
                            minlength="8"
                            autocomplete="off"
                            data-1p-ignore="true"
                            data-lpignore="true"
                            required;
                    },
                    None,
                    Some(password_toggle("import-password")),
                ))

                (password_strength_indicator("import-password"))

                (input_field(
                    Some(html! { label class="input-label" for="import-password-confirm" { "Confirmar contraseña" } }),
                    html! {
                        input
                            class="input-control"
                            id="import-password-confirm"
                            type="password"
                            minlength="8"
                            autocomplete="off"
                            data-1p-ignore="true"
                            data-lpignore="true"
                            data-match-id="import-password"
                            required;
                    },
                    None,
                    Some(password_toggle("import-password-confirm")),
                ))

                div class="actions flow-actions" {
                    (link_button(
                        "screen-submit",
                        "/wallet",
                        None,
                        Some("import-password-form"),
                        true,
                        html! { "Importar Billetera" },
                    ))
                }
            }
        }
    }
}
