# @permaweb/ao-core-libs

This SDK provides a JavaScript interface for communicating with AO-Core.

AO-Core is a protocol and standard for distributed computation that forms the foundation of the AO computer. Inspired by and built upon concepts from the Erlang language, AO-Core embraces the actor model for concurrent, distributed systems. Unlike traditional blockchain systems, AO-Core defines a flexible, powerful computation protocol that enables a wide range of applications beyond just running Lua programs.

For a full breakdown of AO-Core, please see the [documentation](https://hyperbeam.arweave.net/build/introduction/what-is-ao-core.html).

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

```typescript
import AOCore from '@permaweb/ao-core-libs';

// NodeJS Usage
const jwk = JSON.parse(readFileSync(process.env.PATH_TO_WALLET, 'utf-8'));

const aoCore = AOCore.init({ jwk });
```

## Usage

This SDK exposes a single function, `request`, for communicating with AO Core, which accepts these arguments:

- `url` (optional) – your API endpoint (defaults to https://forward.computer)
- `method` – HTTP Request Method (`GET` or `POST`)
- `format` – Signing Format (`ANS-104` or `HTTP-SIG`)
- `process` (optional) – Arweave process ID to include in the path
- `device` (optional) – Device identifier (defaults to `process@1.0` if a `process` is passed with no `device`)
- `path` – The endpoint path under the process (no leading slash)
- `fields` – A map of key/value pairs that will be serialized and signed

### Example

```typescript
const response = await aoCore.request({
	url: 'https://forward.computer',
	method: 'POST',
	format: 'ANS-104',
	path: 'router~node-process@1.0/now/routes/serialize~json@1.0',
	fields: {
		target: 'uf_FqRvLqjnFMc8ZzGkF4qWKuNmUIQcYP0tPlCGORQk',
		test: '1234',
		data: '1234',
	},
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
