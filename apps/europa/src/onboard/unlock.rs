use maud::{Markup, html};

pub fn render() -> Markup {
    html! {
        section id="unlock-screen" class="screen card hidden" {
            h2 { "Unlock wallet" }
            p class="muted" { "Decrypt the wallet stored in this browser." }
            form id="unlock-form" class="stack" autocomplete="off" {
                label for="unlock-password" { "Password" }
                input
                    id="unlock-password"
                    type="password"
                    autocomplete="current-password"
                    required;

                div class="actions" {
                    button type="submit" class="primary" { "Unlock" }
                    button type="button" class="ghost" id="forget-wallet-unlock" { "Forget stored wallet" }
                }
            }
        }
    }
}
