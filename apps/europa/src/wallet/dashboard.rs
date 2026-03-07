use maud::{Markup, html};

pub fn render() -> Markup {
    html! {
        section
            id="menu-screen"
            class="screen card wallet-card hidden"
            data-scroll-fade-shell
            data-scroll-fade-target
            data-at-bottom="false"
            data-has-overflow="true" {
            div class="wallet-card-body" {
                button type="button" class="wallet-account-card" {
                    div class="wallet-account-leading" {
                        img class="wallet-account-icon" src="/assets/svgs/europa-icon.svg" alt="";
                        div class="wallet-account-copy" {
                            p class="wallet-account-title" { "Mi cuenta" }
                            p id="wallet-address" class="wallet-account-address" { "tb1qvcw8t...6sm7pudqz" }
                        }
                    }
                    img class="wallet-account-chevron" src="/assets/svgs/caret.svg" alt="" aria-hidden="true";
                }

                div class="wallet-balance-block" {
                    p class="wallet-balance-main" {
                        img class="wallet-balance-icon" src="/assets/svgs/bitcoin.svg" alt="";
                        span { "0.00100045 BTC" }
                    }
                    p class="wallet-balance-fiat" { "≈ 2,550 MXN" }
                }

                div class="wallet-actions-grid" {
                    button type="button" class="wallet-action-tile" {
                        div class="wallet-action-visual" {
                            span class="wallet-action-icon-shell" {
                                img class="wallet-action-icon" src="/assets/svgs/plane.svg" alt="";
                            }
                        }
                        div class="wallet-action-copy" {
                            span class="wallet-action-label" { "Enviar" }
                        }
                    }

                    button type="button" class="wallet-action-tile" {
                        div class="wallet-action-visual" {
                            span class="wallet-action-icon-shell wallet-action-icon-shell-qr" aria-hidden="true" {
                                img class="wallet-action-icon wallet-action-icon-qr" src="/assets/svgs/qr.svg" alt="";
                            }
                        }
                        div class="wallet-action-copy" {
                            span class="wallet-action-label" { "Recibir" }
                        }
                    }
                }

                div class="wallet-transactions-section" {
                    h3 class="wallet-section-title" { "Transacciones" }

                    div class="wallet-transactions-list" {
                        @for _ in 0..9 {
                            (transaction_card())
                        }
                    }
                }
            }

            div class="wallet-scroll-fade" aria-hidden="true" {
                img class="wallet-scroll-fade-caret" src="/assets/svgs/caret.svg" alt="";
            }
        }
    }
}

fn transaction_card() -> Markup {
    html! {
        article class="wallet-transaction-card wallet-transaction-card-empty" {}
    }
}
