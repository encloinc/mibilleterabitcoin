use maud::{Markup, html};

pub fn render() -> Markup {
    html! {
        section id="landing-screen" class="screen card" {
            h2 { "Choose a wallet action" }
            p class="muted" { "Mnemonic generation, validation, derivation, and encryption happen inside the browser." }
            div class="actions" {
                button type="button" class="primary" id="show-create" { "Create wallet" }
                button type="button" class="secondary" id="show-import" { "Import wallet" }
            }
        }
    }
}
