/**
 * Type tests. The assertions are checked by `tsc -p tsconfig-check.json` (the `typecheck` script,
 * which CI runs before the tests); vitest only runs the file so it is not silently skipped. Values
 * are `undefined as unknown as T` placeholders: a `declare const` would throw a ReferenceError when
 * vitest executes the file. No request is ever sent: every call sits in a function that is never
 * invoked.
 */
import {describe, expect, it} from 'vitest';
import type {
	EIP1193CoreProvider,
	EIP1193HttpNodeProvider,
	EIP1193NodeProvider,
	EIP1193WalletProvider,
	EIP1193WindowWalletProvider,
	NodeMethods,
} from 'eip-1193';
import {extendProviderWithAccounts, type EIP1193AccountsProvider} from '../src/index.js';

// Hoisted so each call fits on the one line a `@ts-expect-error` covers, whatever prettier does.
const switchChain = {method: 'wallet_switchEthereumChain', params: [{chainId: '0x1'}]} as const;
const subscribeHeads = {method: 'eth_subscribe', params: ['newHeads']} as const;

describe('extendProviderWithAccounts types', () => {
	it('accepts every kind of provider', () => {
		const _neverCalled = () => {
			extendProviderWithAccounts(undefined as unknown as EIP1193WalletProvider);
			extendProviderWithAccounts(undefined as unknown as EIP1193WindowWalletProvider);
			extendProviderWithAccounts(undefined as unknown as EIP1193NodeProvider);
			extendProviderWithAccounts(undefined as unknown as EIP1193HttpNodeProvider);
			extendProviderWithAccounts(undefined as unknown as EIP1193CoreProvider);
		};
		expect(_neverCalled).toBeTypeOf('function');
	});

	it('returns the core surface plus eth_requestAccounts by default', () => {
		const _neverCalled = async () => {
			const extended = extendProviderWithAccounts(undefined as unknown as EIP1193NodeProvider);
			const asAccounts: EIP1193AccountsProvider = extended;
			// it goes straight into a slot typed as the core provider
			const asCore: EIP1193CoreProvider = extended;
			const _accounts: `0x${string}`[] = await extended.request({method: 'eth_requestAccounts'});
			await extended.request({method: 'eth_accounts'});
			await extended.request({method: 'eth_chainId'});
			// @ts-expect-error the wrapped provider may be a node, which serves no wallet_*
			await extended.request(switchChain);
			// @ts-expect-error subscriptions are not core
			await extended.request(subscribeHeads);
			// @ts-expect-error node introspection is not core
			await extended.request({method: 'net_listening'});
			return [asAccounts, asCore];
		};
		expect(_neverCalled).toBeTypeOf('function');
	});

	it('offers a wider table when the caller names it', () => {
		const _neverCalled = async () => {
			const node = extendProviderWithAccounts<NodeMethods>(undefined as unknown as EIP1193NodeProvider);
			await node.request({method: 'net_listening'});
			await node.request({method: 'eth_requestAccounts'});
			const asCore: EIP1193CoreProvider = node;
			return asCore;
		};
		expect(_neverCalled).toBeTypeOf('function');
	});
});
