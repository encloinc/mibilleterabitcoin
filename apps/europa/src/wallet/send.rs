use maud::{Markup, html};

use crate::config::BitcoinNetwork;
use crate::onboard::components::input_field;

pub fn render(required_confirmations: u32, network: BitcoinNetwork) -> Markup {
    html! {
        section id="wallet-send-screen" class="screen card card-compact wallet-send-screen hidden" {
            div class="wallet-subpage-header" {
                button type="button" class="back-arrow" data-back="menu-screen" aria-label="Regresar" {
                    img class="back-arrow-icon" src="/assets/svgs/back.svg" alt="";
                }

                div class="wallet-send-copy" {
                    h2 class="wallet-send-title" { "Enviar Bitcoin" }
                }
            }

            form id="wallet-send-form" class="stack wallet-send-form" autocomplete="off" {
                (input_field(
                    Some(html! { label class="input-label" for="wallet-send-address-input" { "Dirección de Bitcoin:" } }),
                    html! {
                        input
                            class="input-control"
                            id="wallet-send-address-input"
                            type="text"
                            inputmode="text"
                            spellcheck="false"
                            autocapitalize="off"
                            autocomplete="off"
                            required;
                    },
                    None,
                    None,
                ))

                div class="wallet-send-amount-block" {
                    p class="input-label" { "Monto:" }

                    div class="wallet-send-amount-inputs" {
                        (input_field(
                            None,
                            html! {
                                input
                                    class="input-control"
                                    id="wallet-send-btc-input"
                                    type="text"
                                    inputmode="decimal"
                                    placeholder="0"
                                    autocomplete="off"
                                    required;
                            },
                            None,
                            Some(html! {
                                img class="wallet-send-input-icon" src=(network.bitcoin_icon_src()) alt="";
                            }),
                        ))

                        (input_field(
                            None,
                            html! {
                                input
                                    class="input-control"
                                    id="wallet-send-mxn-input"
                                    type="text"
                                    inputmode="decimal"
                                    placeholder="0"
                                    autocomplete="off";
                            },
                            None,
                            Some(html! {
                                span class="wallet-send-input-suffix" { "MXN" }
                            }),
                        ))
                    }

                    p class="wallet-send-available" {
                        "Disponibles: "
                        span id="wallet-send-available-btc" { "-- " (network.bitcoin_symbol()) }
                        img class="wallet-send-available-icon" src=(network.bitcoin_icon_src()) alt="";
                    }
                }

                div class="wallet-send-fees" {
                    p class="input-label" { "Tarifa:" }

                    div class="wallet-send-fee-options" role="radiogroup" aria-label="Selecciona una tarifa" {
                        (render_fee_option("slow", "Lento", "/assets/svgs/slow.svg", false))
                        (render_fee_option("medium", "Mediano", "/assets/svgs/medium.svg", true))
                        (render_fee_option("fast", "Rapido", "/assets/svgs/rapido.svg", false))
                    }
                }

                div class="wallet-send-footer" {
                    img class="wallet-send-footer-icon" src=(network.bitcoin_triple_icon_src()) alt="";
                    p class="wallet-send-footer-copy" {
                        "Los envíos necesitan "
                        span class="wallet-send-footer-emphasis" { (required_confirmations) " confirmaciones" }
                        " en la blockchain para aparecer en tu billetera. Puedes revisar el estado de tu transacción en el menú principal."
                    }
                }

                div class="actions wallet-send-actions" {
                    button type="submit" class="screen-submit wallet-send-submit" id="wallet-send-submit" disabled {
                        span { "Enviar" }
                        img class="wallet-send-submit-icon" src="/assets/svgs/plane-dark.svg" alt="";
                    }
                }
            }
        }
    }
}

fn render_fee_option(value: &str, title: &str, icon_src: &str, selected: bool) -> Markup {
    html! {
        button
            type="button"
            class="wallet-send-fee-option"
            data-send-fee=(value)
            data-selected=(if selected { "true" } else { "false" })
            role="radio"
            aria-checked=(if selected { "true" } else { "false" }) {
            div class="wallet-send-fee-leading" {
                img class="wallet-send-fee-icon" src=(icon_src) alt="";
                div class="wallet-send-fee-copy" {
                    p class="wallet-send-fee-title" { (title) }
                    p class="wallet-send-fee-eta" data-send-fee-eta=(value) { "--" }
                }
            }

            div class="wallet-send-fee-values" {
                p class="wallet-send-fee-btc" data-send-fee-btc=(value) { "-- sats/vbyte" }
                p class="wallet-send-fee-mxn" data-send-fee-mxn=(value) { "-- MXN" }
            }
        }
    }
}
