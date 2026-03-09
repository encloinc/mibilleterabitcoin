use maud::{Markup, html};

pub fn render() -> Markup {
    html! {
        section id="wallet-send-success-screen" class="screen card card-compact wallet-send-result-screen hidden" {
            div class="wallet-send-result-copy wallet-send-result-copy-success" {
                img class="wallet-send-result-icon" src="/assets/svgs/check-circle.svg" alt="";
                h2 class="wallet-send-result-title" { "Transaccion exitosa!" }
                a
                    id="wallet-send-success-link"
                    class="wallet-send-result-link"
                    href="#"
                    target="_blank"
                    rel="noreferrer noopener" {
                    span { "Ver transacción" }
                    img class="wallet-send-result-link-icon" src="/assets/svgs/arrow-up-right.svg" alt="";
                }
            }

            div class="actions wallet-send-result-actions" {
                button type="button" class="screen-submit" id="wallet-send-success-back" {
                    "Volver"
                }
            }
        }
    }
}
