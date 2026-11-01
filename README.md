# @permaweb/ao-core-libs

This SDK provides a JavaScript interface for communicating with AO-Core.

AO-Core is a protocol and standard for distributed computation that forms the foundation of the [AO Computer](https://ao.arweave.net). Inspired by and built upon concepts from the Erlang language, AO-Core embraces the actor model for concurrent, distributed systems. It defines a minimal, generalized model for decentralized computation built around standard web technologies like HTTP.

For a full breakdown of AO-Core, see the [documentation](https://hyperbeam.arweave.net/build/introduction/what-is-ao-core.html).

## Prerequisites

- `node >= v18.0`
- `npm` or `yarn`

## Installation

```bash
npm install @permaweb/ao-core-libs
```

or

```bash
yarn add @permaweb/ao-core-libs
```

## Initialization

The SDK can be initialized with either a JWK or a Signer. If a JWK is provided, then the default AO-Core Signer will be created and used on intilization. If both a JWK and Signer are provided, the Signer will be used.

```typescript
import AOCore from '@permaweb/ao-core-libs';

// NodeJS Usage
const jwk = JSON.parse(readFileSync(process.env.PATH_TO_WALLET, 'utf-8'));
const aoCore = AOCore.init({ jwk });

// Or
import { createSigner } from '@permaweb/ao-core-libs'; // Or your own custom signer
const aoCore = AOCore.init({ signer: createSigner(jwk) });

// Browser Usage
import { createSigner } from '@permaweb/ao-core-libs';
const aoCore = AOCore.init({ signer: createSigner(window.arweaveWallet) });
```

## Usage

This SDK exposes `request` for communicating with AO Core, plus focused clients for preloaded devices such as `rng`.

- `path` – The endpoint path (no leading slash)
- `method` – (optional - defaults to `GET`) HTTP Request Method (`GET` or `POST`)
- `signing-format` – (optional - defaults to `httpsig`) Signing Format (`ans104` or `httpsig`)
- _Any additional fields_ – All other fields passed in will be included as part of the request payload (e.g. custom headers, tags, or data fields depending on the signing format)

### Example

```typescript
const response = await aoCore.request({
	method: 'POST',
	path: 'JC0_BVWWf7xbmXUeKskDBRQ5fJo8fWgPtaEYMOf-Vbk~process@1.0/compute/at-slot',
	'signing-format': 'httpsig',
	'my-custom-field': '1234',
});
```

### Verifiable randomness

`rng.verifyRound` verifies a BLS12-381 randomness-beacon signature through HyperBEAM's preloaded `~rng@1.0` device. It constructs the versioned HyperBEAM RNG signing message from the beacon id and round so callers cannot accidentally omit domain separation. `rng.derive` expands seed material into deterministic bytes. RNG Labs, a CipherPlay Inc. product, maintains the protocol and reference network; this adapter is distributed under this repository's license. Both methods return the standard `Response`, encoded as JSON.

```typescript
const verified = await aoCore.rng.verifyRound({
	publicKey: GROUP_PUBLIC_KEY_HEX,
	beacon: BEACON_PROCESS_ID,
	round,
	signature: GROUP_SIGNATURE_HEX,
});
const verification = await verified.json();

const derived = await aoCore.rng.derive({
	seed: verification.value,
	counter: 0,
	bytes: 32,
});
const randomBytes = await derived.json();

const group = await aoCore.rng.generator().then((response) => response.json());
const reveal = await aoCore.rng.verifyReveal({ c, alpha, h: BEACON_H });
const crack = await aoCore.rng.verifyCrack({ x: c, t, y, proof });
```

`generator`, `verifyReveal`, and `verifyCrack` expose the Any-Honest time-lock
checks under the same `~rng@1.0` namespace. They verify published material;
clients do not need the validator's secret or a trusted verifier.

## Testing

To run the `@permaweb/ao-core-libs` tests:

- `cd tests`
- `npm test`

This will install all dependencies into and build the SDK, and then install it locally into a client test project (`tests/index.js`).

## Resources

- [AO-Core](https://cookbook_ao.arweave.net/welcome/ao-core-introduction.html)
- [HyperBEAM](https://hyperbeam.arweave.net/)
