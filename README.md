# eip-1193-accounts-wrapper

Extends EIP-1193 providers with local account handling for signing transactions and messages.

[![npm version](https://img.shields.io/npm/v/eip-1193-accounts-wrapper)](https://www.npmjs.com/package/eip-1193-accounts-wrapper)

## About

When working with EIP-1193 providers (like those from browser wallets), you sometimes need to add local account capabilities for development, testing, or backend signing. This library wraps any EIP-1193 provider and adds account-related methods using local private keys or mnemonics, powered by [viem](https://viem.sh/).

## Features

- **Private key accounts** – Load accounts from hex-encoded private keys
- **Mnemonic accounts** – Derive multiple accounts from a BIP-39 mnemonic phrase
- **Transaction signing** – Signs and sends transactions via `eth_sendTransaction`
- **Message signing** – Supports `personal_sign`, `eth_sign`, `eth_signTypedData`, and `eth_signTypedData_v4`
- **Account impersonation** – Impersonate addresses for testing (requires compatible backend like Anvil)
- **Custom handlers** – Override any RPC method with your own implementation

## Installation

```bash
npm install eip-1193-accounts-wrapper
```

```bash
pnpm add eip-1193-accounts-wrapper
```

```bash
yarn add eip-1193-accounts-wrapper
```

## Usage

### Basic usage with private keys

```typescript
import { extendProviderWithAccounts } from 'eip-1193-accounts-wrapper';

// Your existing EIP-1193 provider (e.g., from a JSON-RPC endpoint)
const baseProvider = {
  request: async ({ method, params }) => {
    // Your provider implementation
  }
};

const provider = extendProviderWithAccounts(baseProvider, {
  accounts: {
    privateKeys: [
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    ],
  },
});

// Now you can use account methods
const accounts = await provider.request({ method: 'eth_accounts' });
console.log(accounts); // ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266']
```

### Using a mnemonic phrase

```typescript
const provider = extendProviderWithAccounts(baseProvider, {
  accounts: {
    mnemonic: 'test test test test test test test test test test test junk',
    numAccounts: 5, // optional, defaults to 10
  },
});
```

### Account impersonation

For testing with tools like Anvil that support account impersonation:

```typescript
import { createTestClient, http } from 'viem';
import { foundry } from 'viem/chains';

const testClient = createTestClient({
  mode: 'anvil',
  chain: foundry,
  transport: http(),
});

const provider = extendProviderWithAccounts(baseProvider, {
  impersonate: {
    impersonator: testClient,
    mode: 'unknown', // 'always' | 'unknown' | 'list'
  },
});
```

Impersonation modes:
- `always` – Always impersonate, even for known accounts
- `unknown` – Only impersonate addresses not in the local accounts list
- `list` – Only impersonate specific addresses provided in the `list` array

### Custom RPC handlers

```typescript
const provider = extendProviderWithAccounts(baseProvider, {
  handlers: {
    eth_blockNumber: async () => '0x1',
  },
});
```

## API

### `extendProviderWithAccounts(provider, options?)`

Wraps an EIP-1193 provider with local account capabilities.

#### Parameters

- `provider` – An EIP-1193 compatible provider object
- `options` – Optional configuration object:
  - `accounts.privateKeys` – Array of hex-encoded private keys
  - `accounts.mnemonic` – BIP-39 mnemonic phrase
  - `accounts.numAccounts` – Number of accounts to derive from mnemonic (default: 10)
  - `impersonate` – Impersonation configuration for testing
  - `doNotFillMissingFields` – If `true`, requires all transaction fields (gas, nonce, etc.)
  - `handlers` – Custom RPC method handlers

#### Returns

An EIP-1193 provider with account methods added.

## Supported Methods

The following methods are handled locally when accounts are configured:

| Method | Description |
|--------|-------------|
| `eth_accounts` | Returns configured account addresses |
| `eth_requestAccounts` | Returns configured account addresses |
| `eth_sendTransaction` | Signs and sends transactions |
| `personal_sign` | Signs messages with personal prefix |
| `eth_sign` | Signs raw messages |
| `eth_signTypedData` | Signs typed data (EIP-712) |
| `eth_signTypedData_v4` | Signs typed data v4 (EIP-712) |

All other methods are passed through to the underlying provider.

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run tests
pnpm test

# Development mode (watch)
pnpm dev
```

## License

See the [`LICENSE`](LICENSE) file for details.
