use maud::{Markup, html};

pub fn render() -> Markup {
    html! {
        section id="create-screen" class="screen card hidden" {
            h2 { "Create wallet" }
            p class="muted" { "Choose the password that will decrypt the encrypted wallet stored in this browser." }
            form id="create-form" class="stack" autocomplete="off" {
                label for="create-password" { "Password" }
                input
                    id="create-password"
                    name="password"
                    type="password"
                    minlength="8"
                    autocomplete="new-password"
                    required;

                label for="create-password-confirm" { "Confirm password" }
                input
                    id="create-password-confirm"
                    name="password_confirm"
                    type="password"
                    minlength="8"
                    autocomplete="new-password"
                    required;

                div class="actions" {
                    button type="submit" class="primary" { "Generate phrase" }
                    button type="button" class="ghost" data-back="landing-screen" { "Back" }
                }
            }
        }
    }
}
