use maud::{Markup, html};

pub fn render() -> Markup {
    html! {
        section id="wallet-send-error-screen" class="screen card card-compact wallet-send-result-screen hidden" {
            div class="wallet-send-result-copy wallet-send-result-copy-error" {
                img class="wallet-send-result-icon" src="/assets/svgs/x-circle.svg" alt="";
                h2 class="wallet-send-result-title" { "No se pudo enviar" }
                p id="wallet-send-error-detail" class="wallet-send-error-detail" { "No se pudo generar o transmitir la transacción." }
                p id="wallet-send-error-size" class="wallet-send-error-size hidden" { "" }
            }

            div class="actions wallet-send-result-actions" {
                button type="button" class="screen-submit" id="wallet-send-error-back" {
                    "Volver"
                }
            }
        }
    }
}
