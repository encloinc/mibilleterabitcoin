# mibilleterabitcoin

Bitcoin wallet onboarding monorepo with Turborepo, a Rust SSR app, and a separate WASM crate for browser-side wallet logic.

## Layout

- `apps/europa`: the SSR MAUD app and static web assets under `src/web/assets`
- `crates/mibilleterabitcoin-common`: the separate WASM crate that handles mnemonic generation, import validation, and address derivation in the browser

The server only serves the SSR page and static assets. Mnemonic generation, mnemonic import validation, HD derivation, and encrypted local storage all happen in the browser through the `mibilleterabitcoin-common` WASM package emitted into `apps/europa/src/web/assets/pkg`.

## Run

```bash
npm install
npm run dev:mibilleterabitcoin
```

## Config

Pass a JSON file through `--config`:

```json
{
  "network": "testnet",
  "host": "127.0.0.1",
  "port": 3000
}
```

Supported `network` values are `bitcoin`, `testnet`, `signet`, and `regtest`.

## Rebuild Browser Wallet

If you change `crates/mibilleterabitcoin-common/src/lib.rs`, rebuild it with:

```bash
npm run build:wasm
```

## Direct Rust Run

If you want to bypass Turbo and run the Rust app directly:

```bash
./run.sh
```
