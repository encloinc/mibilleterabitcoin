use maud::{Markup, html};

pub fn breadcrumbs(current_step: usize, total_steps: usize) -> Markup {
    html! {
        div class="breadcrumbs" aria-label=(format!("Step {current_step} of {total_steps}")) {
            @for step in 1..=total_steps {
                @let class_name = if step == current_step {
                    "breadcrumb-dot active"
                } else {
                    "breadcrumb-dot"
                };
                span class=(class_name) {}
            }
        }
    }
}

pub fn flow_header(
    back_target: Option<&str>,
    step: Option<(usize, usize)>,
    title: &str,
    description: &str,
) -> Markup {
    html! {
        div class="flow-header" {
            div class="flow-topbar" {
                @if let Some(target) = back_target {
                    button type="button" class="back-arrow" data-back=(target) aria-label="Regresar" {
                        img class="back-arrow-icon" src="/assets/svgs/back.svg" alt="";
                    }
                } @else {
                    span class="topbar-control-placeholder" aria-hidden="true" {}
                }

                div class="topbar-center" {
                    @if let Some((current_step, total_steps)) = step {
                        (breadcrumbs(current_step, total_steps))
                    }
                }

                span class="topbar-control-placeholder" aria-hidden="true" {}
            }

            div class="screen-copy flow-copy" {
                h2 class="screen-title flow-title" { (title) }
                @if !description.is_empty() {
                    p class="flow-description" { (description) }
                }
            }
        }
    }
}

pub fn input_field(
    label: Option<Markup>,
    input: Markup,
    left: Option<Markup>,
    right: Option<Markup>,
) -> Markup {
    html! {
        div class="input-field" {
            @if let Some(label_markup) = label {
                (label_markup)
            }

            div class="input-shell" {
                @if let Some(left_markup) = left {
                    span class="input-side" { (left_markup) }
                }

                (input)

                @if let Some(right_markup) = right {
                    span class="input-side" { (right_markup) }
                }
            }
        }
    }
}

pub fn password_toggle(input_id: &str) -> Markup {
    html! {
        button
            type="button"
            class="input-icon-button"
            data-password-toggle=(input_id)
            aria-label="Mostrar contraseña" {
            img
                class="input-icon"
                data-password-toggle-icon
                src="/assets/svgs/eye-closed-bold.svg"
                alt="";
        }
    }
}

pub fn password_strength_indicator(input_id: &str) -> Markup {
    html! {
        div class="password-strength" data-password-strength=(input_id) data-strength-level="0" data-has-value="false" aria-live="polite" {
            div class="password-strength-bars" aria-hidden="true" {
                @for index in 0..4 {
                    span class="password-strength-bar" data-strength-bar=(index) {}
                }
            }
        }
    }
}

pub fn link_button(
    class_name: &str,
    href: &str,
    element_id: Option<&str>,
    submit_form_id: Option<&str>,
    disabled: bool,
    content: Markup,
) -> Markup {
    html! {
        a
            id=[element_id]
            class=(class_name)
            href=(href)
            data-route-link?[submit_form_id.is_none()]
            data-submit-form=[submit_form_id]
            aria-disabled=(if disabled { "true" } else { "false" })
            role="button" {
            (content)
        }
    }
}
