
<img width="1509" height="440" alt="logogit" src="https://github.com/user-attachments/assets/3b872cf6-1de9-4a30-83db-234ac4ee1105" />

---

# Mi Billetera Bitcoin

Video: ...
Sitio web: [https://mibilleterabitcoin.com](https://mibilleterabitcoin.com)

Una billetera que cualquier mexicano con un navegador puede usar para empezar a ahorrar bitcoin de forma **autocustodia**.

---

## Stack

Este repositorio es un **monorepo manejado por Turborepo** con dos *crates*:

* **`mibilleterabitcoin-common`**: contiene los *wasm bindgens* que utiliza el cliente presentado al usuario (el cual es renderizado en SSR por **MAUD**).

---

## Estructura

* `apps/europa`: la aplicación SSR en MAUD y los recursos estáticos del sitio ubicados en `src/web/assets`
* `crates/mibilleterabitcoin-common`: el crate WASM separado que maneja la generación de mnemónicos, validación de importación de frases de recuperación y derivación de direcciones en el navegador

El servidor **solo sirve la página SSR y los recursos estáticos**.

La generación del mnemónico, validación de la frase de recuperación, derivación HD y almacenamiento local cifrado ocurren **directamente en el navegador** a través del paquete WASM `mibilleterabitcoin-common`, generado dentro de `apps/europa/src/web/assets/pkg`.

---

## Ejecutar

```bash
npm install
npm run dev
```

---

## Configuración

Pasa un archivo JSON mediante `--config`:

```json
{
  "network": "mainnet",
  "host": "127.0.0.1",
  "port": 3000,
  "required_confirmations": 1,
  "tx_refresh_pages_max": 3,
  "electrs_esplora_endpoints": {
    "mainnet": "https://mempool.space/api",
    "testnet3": "https://mempool.space/testnet/api",
    "testnet4": "https://mempool.space/testnet4/api",
    "signet": "https://mempool.space/signet/api",
    "regtest": "http://127.0.0.1:3002"
  },
  "explorer_endpoints": {
    "mainnet": "https://mempool.space",
    "testnet3": "https://mempool.space/testnet",
    "testnet4": "https://mempool.space/testnet4",
    "signet": "https://mempool.space/signet",
    "regtest": "http://127.0.0.1:3002"
  },
  "btc_mxn_endpoint": "https://api.coinbase.com/v2/prices/BTC-MXN/spot"
}

```

Los valores soportados para `network` son:

* `bitcoin`
* `testnet3`
* `testnet4`
* `signet`
* `regtest`

