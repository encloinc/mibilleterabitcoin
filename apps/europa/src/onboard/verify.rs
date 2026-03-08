use maud::{Markup, html};

use super::components::{flow_header, input_field, link_button};

pub fn render() -> Markup {
    html! {
        section id="verify-screen" class="screen card card-compact flow-card hidden" {
            (flow_header(
                Some("backup-screen"),
                Some((3, 3)),
                "Confirma tu backup",
                "Escribe las palabras solicitadas para validar que guardaste la frase correctamente.",
            ))

            form id="verify-form" class="stack flow-form" autocomplete="off" {
                @for slot in 0..4 {
                    @let label_text = format!("Palabra {}", slot + 1);
                    (input_field(
                        Some(html! {
                            label
                                class="input-label verify-label"
                                for=(format!("verify-word-{slot}"))
                                data-verify-label=(slot) {
                                (label_text)
                            }
                        }),
                        html! {
                            input
                                id=(format!("verify-word-{slot}"))
                                class="input-control verify-input"
                                data-verify-input=(slot)
                                type="text"
                                spellcheck="false"
                                autocapitalize="off"
                                autocomplete="off"
                                required;
                        },
                        None,
                        None,
                    ))
                }

                div class="actions flow-actions" {
                    (link_button(
                        "screen-submit",
                        "/wallet",
                        None,
                        Some("verify-form"),
                        true,
                        html! { "Crear Billetera" },
                    ))
                }
            }
        }
    }
}
