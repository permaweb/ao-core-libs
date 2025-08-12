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

This SDK exposes a single function, `request`, for communicating with AO Core, which accepts these arguments:

- `path` – The endpoint path (no leading slash)
- `method` – (optional - defaults to `GET`) HTTP Request Method (`GET` or `POST`)
- `signing-format` – (optional - defaults to `httpsig`) Signing Format (`ans104` or `httpsig`)
- _Any additional fields_ – All other fields passed in will be included as part of the request payload (e.g. custom headers, tags, or data fields depending on the signing format)

### Example

```typescript
const response = await aoCore.request({
	method: 'POST',
	'signing-format': 'httpsig',
	path: 'JC0_BVWWf7xbmXUeKskDBRQ5fJo8fWgPtaEYMOf-Vbk~process@1.0/compute/at-slot',
	myCustomField: '1234',
});
```

## Testing

To run the `@permaweb/ao-core-libs` tests:

- `cd tests`
- `npm test`

This will install all dependencies into and build the SDK, and then install it locally into a client test project (`tests/index.js`).

## Resources

- [AO-Core](https://cookbook_ao.arweave.net/welcome/ao-core-introduction.html)
- [HyperBEAM](https://hyperbeam.arweave.net/)
