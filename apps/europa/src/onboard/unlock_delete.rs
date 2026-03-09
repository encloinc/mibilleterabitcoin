use maud::{Markup, html};

pub fn render() -> Markup {
    html! {
        section id="unlock-delete-screen" class="screen card card-compact unlock-delete-screen hidden" {
            div class="unlock-delete-topbar" {
                button type="button" class="back-arrow" data-back="unlock-screen" aria-label="Regresar" {
                    img class="back-arrow-icon" src="/assets/svgs/back.svg" alt="";
                }
            }

            div class="unlock-delete-copy" {
                span class="unlock-delete-warning-icon" aria-hidden="true" {}
                h2 class="screen-title flow-title unlock-delete-title" { "¿Estas seguro?" }
                p class="unlock-delete-description" {
                    "Recuerda que si no tienes tu frase de recuperacion, no podras recuperar tu billetera y tus bitcoins."
                }
            }

            div class="actions unlock-delete-actions" {
                button type="button" class="screen-submit unlock-delete-submit" id="confirm-delete-wallet" {
                    img class="unlock-delete-submit-icon" src="/assets/svgs/trash.svg" alt="";
                    span { "Borrar billetera" }
                }
            }
        }
    }
}
