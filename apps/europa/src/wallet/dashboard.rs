use maud::{Markup, html};

pub fn render() -> Markup {
    html! {
        section id="menu-screen" class="screen card hidden" {
            h2 { "Wallet" }
            p class="muted" { "First derived address for this wallet on the selected network." }
            div class="address-box" {
                span class="label" { "Address" }
                code id="wallet-address" { "" }
            }
            div class="actions" {
                button type="button" class="primary" id="lock-wallet" { "Lock" }
                button type="button" class="ghost" id="forget-wallet-menu" { "Forget stored wallet" }
            }
        }
    }
}
