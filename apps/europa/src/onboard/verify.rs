use maud::{Markup, html};

pub fn render() -> Markup {
    html! {
        section id="verify-screen" class="screen card hidden" {
            h2 { "Backup check" }
            p class="muted" { "Enter the requested words from your seed phrase." }
            form id="verify-form" class="stack" autocomplete="off" {
                @for slot in 0..4 {
                    label for=(format!("verify-word-{slot}")) class="verify-label" data-verify-label=(slot) {
                        (format!("Word {}", slot + 1))
                    }
                    input
                        id=(format!("verify-word-{slot}"))
                        class="verify-input"
                        data-verify-input=(slot)
                        type="text"
                        spellcheck="false"
                        autocapitalize="off"
                        autocomplete="off"
                        required;
                }

                div class="actions" {
                    button type="submit" class="primary" { "Save encrypted wallet" }
                    button type="button" class="ghost" id="back-to-backup" { "Back" }
                }
            }
        }
    }
}
