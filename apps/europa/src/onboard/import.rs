use maud::{Markup, html};

pub fn render() -> Markup {
    html! {
        section id="import-screen" class="screen card hidden" {
            h2 { "Import wallet" }
            p class="muted" { "Enter the 12-word phrase and choose the password used to protect it in this browser." }
            form id="import-form" class="stack" autocomplete="off" {
                div class="word-grid import-grid" {
                    @for index in 0..12 {
                        label class="import-field" {
                            span { (format!("Word {}", index + 1)) }
                            input
                                type="text"
                                data-import-word=(index)
                                spellcheck="false"
                                autocapitalize="off"
                                autocomplete="off"
                                required;
                        }
                    }
                }

                label for="import-password" { "Password" }
                input
                    id="import-password"
                    type="password"
                    minlength="8"
                    autocomplete="new-password"
                    required;

                label for="import-password-confirm" { "Confirm password" }
                input
                    id="import-password-confirm"
                    type="password"
                    minlength="8"
                    autocomplete="new-password"
                    required;

                div class="actions" {
                    button type="submit" class="primary" { "Import wallet" }
                    button type="button" class="ghost" data-back="landing-screen" { "Back" }
                }
            }
        }
    }
}
