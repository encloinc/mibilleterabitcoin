use maud::{Markup, html};

pub fn render() -> Markup {
    html! {
        section id="backup-screen" class="screen card hidden" {
            h2 { "Write down your 12 words" }
            p class="muted" {
                "Store them offline in the exact order shown below. You will need to confirm four random words next."
            }
            div id="mnemonic-grid" class="word-grid" {
                @for index in 0..12 {
                    div class="word-chip" data-word-slot=(index) {
                        span class="word-index" { (index + 1) }
                        span class="word-value" { "••••" }
                    }
                }
            }
            div class="actions" {
                button type="button" class="primary" id="continue-to-verify" { "I saved the phrase" }
                button type="button" class="ghost" id="cancel-create" { "Cancel" }
            }
        }
    }
}
