use maud::{Markup, html};

use super::components::{input_field, link_button, password_toggle};

pub fn render() -> Markup {
    html! {
        section id="unlock-screen" class="screen card card-compact unlock-card hidden" {
            div class="unlock-content" {
                div class="unlock-main" {
                    img class="unlock-brand-icon" src="/assets/svgs/mibilleterabitcoin-icon.svg" alt="";

                    form id="unlock-form" class="stack unlock-form" autocomplete="off" {
                        p class="unlock-label" { "Escribe tu contraseña:" }

                        div class="unlock-input-field" {
                            (input_field(
                                None,
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
                        }

                        div class="actions unlock-actions" {
                            (link_button(
                                "screen-submit",
                                "/wallet",
                                None,
                                Some("unlock-form"),
                                true,
                                html! { "Desbloquear Billetera" },
                            ))
                        }
                    }
                }

                details class="unlock-footer-wrap" {
                    summary class="unlock-footer" {
                        span { "¿Perdiste tu contraseña?" }
                        img class="unlock-footer-caret" src="/assets/svgs/caret.svg" alt="";
                    }
                    p class="unlock-about" {
                        "Si tienes tu frase de recuperación, puedes recuperar tu billetera borrando esta billetera e importándola denuevo con tu frase de recuperación."
                    }
                    (link_button(
                        "menu-button unlock-delete-link",
                        "/unlock-wallet/delete",
                        None,
                        None,
                        false,
                        html! {
                            img class="menu-button-icon" src="/assets/svgs/trash.svg" alt="";
                            span { "Borrar billetera" }
                        },
                    ))
                }
            }
        }
    }
}
