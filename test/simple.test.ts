import {describe, it, expect, vi} from 'vitest';
import {extendProviderWithAccounts} from '../src/index.js';
import type {EIP1193ProviderWithoutEvents} from 'eip-1193';

// Test private key (Hardhat/Foundry default account #0)
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const TEST_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

// Test mnemonic (Hardhat/Foundry default)
const TEST_MNEMONIC = 'test test test test test test test test test test test junk';

// Create a mock base provider
function createMockProvider(): EIP1193ProviderWithoutEvents {
	return {
		request: vi.fn(async ({method}: {method: string; params?: readonly unknown[]}) => {
			switch (method) {
				case 'eth_chainId':
					return '0x1';
				case 'eth_blockNumber':
					return '0x100';
				case 'eth_getTransactionCount':
					return '0x0';
				case 'eth_estimateGas':
					return '0x5208';
				case 'eth_gasPrice':
					return '0x3b9aca00';
				case 'eth_getBlockByNumber':
					return {
						baseFeePerGas: '0x3b9aca00',
					};
				case 'eth_maxPriorityFeePerGas':
					return '0x3b9aca00';
				default:
					return null;
			}
		}),
	} as unknown as EIP1193ProviderWithoutEvents;
}

describe('extendProviderWithAccounts', () => {
	describe('eth_accounts', () => {
		it('returns empty array when no accounts configured', async () => {
			const baseProvider = createMockProvider();
			const provider = extendProviderWithAccounts(baseProvider);

			const accounts = await provider.request({method: 'eth_accounts'});
			expect(accounts).toEqual([]);
		});

		it('returns accounts from private keys', async () => {
			const baseProvider = createMockProvider();
			const provider = extendProviderWithAccounts(baseProvider, {
				accounts: {
					privateKeys: [TEST_PRIVATE_KEY],
				},
			});

			const accounts = await provider.request({method: 'eth_accounts'});
			expect(accounts).toHaveLength(1);
			expect(accounts[0].toLowerCase()).toBe(TEST_ADDRESS.toLowerCase());
		});

		it('returns accounts from mnemonic', async () => {
			const baseProvider = createMockProvider();
			const provider = extendProviderWithAccounts(baseProvider, {
				accounts: {
					mnemonic: TEST_MNEMONIC,
					numAccounts: 3,
				},
			});

			const accounts = await provider.request({method: 'eth_accounts'});
			expect(accounts).toHaveLength(3);
			// First account from this mnemonic should be the same as TEST_ADDRESS
			expect(accounts[0].toLowerCase()).toBe(TEST_ADDRESS.toLowerCase());
		});

		it('defaults to 10 accounts from mnemonic when numAccounts not specified', async () => {
			const baseProvider = createMockProvider();
			const provider = extendProviderWithAccounts(baseProvider, {
				accounts: {
					mnemonic: TEST_MNEMONIC,
				},
			});

			const accounts = await provider.request({method: 'eth_accounts'});
			expect(accounts).toHaveLength(10);
		});
	});

	describe('eth_requestAccounts', () => {
		it('returns the same accounts as eth_accounts', async () => {
			const baseProvider = createMockProvider();
			const provider = extendProviderWithAccounts(baseProvider, {
				accounts: {
					privateKeys: [TEST_PRIVATE_KEY],
				},
			});

			const accounts = await provider.request({method: 'eth_accounts'});
			const requestedAccounts = await provider.request({method: 'eth_requestAccounts'});
			expect(requestedAccounts).toEqual(accounts);
		});
	});

	describe('eth_sign', () => {
		it('signs a message', async () => {
			const baseProvider = createMockProvider();
			const provider = extendProviderWithAccounts(baseProvider, {
				accounts: {
					privateKeys: [TEST_PRIVATE_KEY],
				},
			});

			const message = 'Hello, World!';
			const signature = await provider.request({
				method: 'eth_sign',
				params: [TEST_ADDRESS, message],
			} as any);

			expect(signature).toBeDefined();
			expect(signature).toMatch(/^0x[a-fA-F0-9]+$/);
		});

		it('throws error for unknown account', async () => {
			const baseProvider = createMockProvider();
			const provider = extendProviderWithAccounts(baseProvider, {
				accounts: {
					privateKeys: [TEST_PRIVATE_KEY],
				},
			});

			const unknownAddress = '0x0000000000000000000000000000000000000001';
			await expect(
				provider.request({
					method: 'eth_sign',
					params: [unknownAddress, 'test'],
				} as any),
			).rejects.toThrow('Account not available for signing');
		});
	});

	describe('personal_sign', () => {
		it('signs a message with personal prefix', async () => {
			const baseProvider = createMockProvider();
			const provider = extendProviderWithAccounts(baseProvider, {
				accounts: {
					privateKeys: [TEST_PRIVATE_KEY],
				},
			});

			const message = 'Hello, World!';
			const signature = await provider.request({
				method: 'personal_sign',
				params: [message, TEST_ADDRESS],
			} as any);

			expect(signature).toBeDefined();
			expect(signature).toMatch(/^0x[a-fA-F0-9]+$/);
		});

		it('throws error for unknown account', async () => {
			const baseProvider = createMockProvider();
			const provider = extendProviderWithAccounts(baseProvider, {
				accounts: {
					privateKeys: [TEST_PRIVATE_KEY],
				},
			});

			const unknownAddress = '0x0000000000000000000000000000000000000001';
			await expect(
				provider.request({
					method: 'personal_sign',
					params: ['test', unknownAddress],
				} as any),
			).rejects.toThrow('Account not available for signing');
		});
	});

	describe('eth_signTypedData', () => {
		const typedData = {
			types: {
				Person: [
					{name: 'name', type: 'string'},
					{name: 'wallet', type: 'address'},
				],
			},
			primaryType: 'Person',
			domain: {
				name: 'Test',
				version: '1',
				chainId: 1,
			},
			message: {
				name: 'Bob',
				wallet: TEST_ADDRESS,
			},
		};

		it('signs typed data', async () => {
			const baseProvider = createMockProvider();
			const provider = extendProviderWithAccounts(baseProvider, {
				accounts: {
					privateKeys: [TEST_PRIVATE_KEY],
				},
			});

			const signature = await provider.request({
				method: 'eth_signTypedData',
				params: [TEST_ADDRESS, typedData],
			} as any);

			expect(signature).toBeDefined();
			expect(signature).toMatch(/^0x[a-fA-F0-9]+$/);
		});

		it('throws error for unknown account', async () => {
			const baseProvider = createMockProvider();
			const provider = extendProviderWithAccounts(baseProvider, {
				accounts: {
					privateKeys: [TEST_PRIVATE_KEY],
				},
			});

			const unknownAddress = '0x0000000000000000000000000000000000000001';
			await expect(
				provider.request({
					method: 'eth_signTypedData',
					params: [unknownAddress, typedData],
				} as any),
			).rejects.toThrow('Account not available for signing');
		});
	});

	describe('eth_signTypedData_v4', () => {
		const typedData = {
			types: {
				Person: [
					{name: 'name', type: 'string'},
					{name: 'wallet', type: 'address'},
				],
			},
			primaryType: 'Person',
			domain: {
				name: 'Test',
				version: '1',
				chainId: 1,
			},
			message: {
				name: 'Bob',
				wallet: TEST_ADDRESS,
			},
		};

		it('signs typed data v4', async () => {
			const baseProvider = createMockProvider();
			const provider = extendProviderWithAccounts(baseProvider, {
				accounts: {
					privateKeys: [TEST_PRIVATE_KEY],
				},
			});

			const signature = await provider.request({
				method: 'eth_signTypedData_v4',
				params: [TEST_ADDRESS, typedData],
			} as any);

			expect(signature).toBeDefined();
			expect(signature).toMatch(/^0x[a-fA-F0-9]+$/);
		});
	});

	describe('eth_signTransaction', () => {
		it('throws not implemented error', async () => {
			const baseProvider = createMockProvider();
			const provider = extendProviderWithAccounts(baseProvider, {
				accounts: {
					privateKeys: [TEST_PRIVATE_KEY],
				},
			});

			await expect(
				provider.request({
					method: 'eth_signTransaction',
					params: [{from: TEST_ADDRESS, to: TEST_ADDRESS, value: '0x0'}],
				}),
			).rejects.toThrow('eth_signTransaction not implemented');
		});
	});

	describe('passthrough to base provider', () => {
		it('passes through unhandled methods to base provider', async () => {
			const baseProvider = createMockProvider();
			const provider = extendProviderWithAccounts(baseProvider, {
				accounts: {
					privateKeys: [TEST_PRIVATE_KEY],
				},
			});

			const blockNumber = await provider.request({method: 'eth_blockNumber'});
			expect(blockNumber).toBe('0x100');
			expect(baseProvider.request).toHaveBeenCalledWith({
				method: 'eth_blockNumber',
				params: undefined,
			});
		});
	});

	describe('custom handlers', () => {
		it('allows overriding methods with custom handlers', async () => {
			const baseProvider = createMockProvider();
			const customBlockNumber = '0x999';
			const provider = extendProviderWithAccounts(baseProvider, {
				handlers: {
					eth_blockNumber: async () => customBlockNumber,
				},
			});

			const blockNumber = await provider.request({method: 'eth_blockNumber'});
			expect(blockNumber).toBe(customBlockNumber);
		});

		it('custom handlers override account handlers', async () => {
			const baseProvider = createMockProvider();
			const customAccounts = ['0x1234567890123456789012345678901234567890'];
			const provider = extendProviderWithAccounts(baseProvider, {
				accounts: {
					privateKeys: [TEST_PRIVATE_KEY],
				},
				handlers: {
					eth_accounts: async () => customAccounts,
				},
			});

			const accounts = await provider.request({method: 'eth_accounts'});
			expect(accounts).toEqual(customAccounts);
		});
	});

	describe('multiple private keys', () => {
		it('handles multiple private keys', async () => {
			const baseProvider = createMockProvider();
			// Second Hardhat/Foundry default account
			const secondPrivateKey = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

			const provider = extendProviderWithAccounts(baseProvider, {
				accounts: {
					privateKeys: [TEST_PRIVATE_KEY, secondPrivateKey],
				},
			});

			const accounts = await provider.request({method: 'eth_accounts'});
			expect(accounts).toHaveLength(2);
		});
	});

	describe('impersonation', () => {
		const IMPERSONATE_ADDRESS = '0x1234567890123456789012345678901234567890' as `0x${string}`;

		describe('list mode', () => {
			it('includes successfully impersonated addresses in eth_accounts', async () => {
				const baseProvider = createMockProvider();
				const impersonateAccount = vi.fn().mockResolvedValue(undefined);

				const provider = extendProviderWithAccounts(baseProvider, {
					impersonate: {
						impersonator: {impersonateAccount},
						mode: 'list',
						list: [IMPERSONATE_ADDRESS],
					},
				});

				const accounts = await provider.request({method: 'eth_accounts'});
				expect(accounts).toContain(IMPERSONATE_ADDRESS);
				expect(impersonateAccount).toHaveBeenCalledWith({address: IMPERSONATE_ADDRESS});
			});

			it('excludes failed impersonation addresses from eth_accounts', async () => {
				const baseProvider = createMockProvider();
				const impersonateAccount = vi.fn().mockRejectedValue(new Error('Impersonation failed'));

				const provider = extendProviderWithAccounts(baseProvider, {
					impersonate: {
						impersonator: {impersonateAccount},
						mode: 'list',
						list: [IMPERSONATE_ADDRESS],
					},
				});

				const accounts = await provider.request({method: 'eth_accounts'});
				expect(accounts).not.toContain(IMPERSONATE_ADDRESS);
				expect(impersonateAccount).toHaveBeenCalledWith({address: IMPERSONATE_ADDRESS});
			});

			it('caches impersonation - only calls impersonateAccount once per address', async () => {
				const baseProvider = createMockProvider();
				const impersonateAccount = vi.fn().mockResolvedValue(undefined);

				const provider = extendProviderWithAccounts(baseProvider, {
					impersonate: {
						impersonator: {impersonateAccount},
						mode: 'list',
						list: [IMPERSONATE_ADDRESS],
					},
				});

				// First call triggers initialization
				await provider.request({method: 'eth_accounts'});
				expect(impersonateAccount).toHaveBeenCalledTimes(1);

				// Second call should use cache
				await provider.request({method: 'eth_accounts'});
				expect(impersonateAccount).toHaveBeenCalledTimes(1);

				// Third call should still use cache
				await provider.request({method: 'eth_requestAccounts'});
				expect(impersonateAccount).toHaveBeenCalledTimes(1);
			});

			it('combines local accounts and impersonated addresses', async () => {
				const baseProvider = createMockProvider();
				const impersonateAccount = vi.fn().mockResolvedValue(undefined);

				const provider = extendProviderWithAccounts(baseProvider, {
					accounts: {
						privateKeys: [TEST_PRIVATE_KEY],
					},
					impersonate: {
						impersonator: {impersonateAccount},
						mode: 'list',
						list: [IMPERSONATE_ADDRESS],
					},
				});

				const accounts = await provider.request({method: 'eth_accounts'});
				expect(accounts).toHaveLength(2);
				expect(accounts).toContain(TEST_ADDRESS);
				expect(accounts).toContain(IMPERSONATE_ADDRESS);
			});
		});

		describe('unknown mode', () => {
			it('impersonates unknown addresses on-demand for eth_sendTransaction', async () => {
				const baseProvider = createMockProvider();
				const impersonateAccount = vi.fn().mockResolvedValue(undefined);
				(baseProvider.request as any).mockImplementation(async ({method}: {method: string}) => {
					switch (method) {
						case 'eth_chainId':
							return '0x1';
						case 'eth_sendTransaction':
							return '0xtxhash';
						default:
							return null;
					}
				});

				const provider = extendProviderWithAccounts(baseProvider, {
					impersonate: {
						impersonator: {impersonateAccount},
						mode: 'unknown',
					},
				});

				// eth_accounts should be empty (no local accounts, no pre-impersonated addresses in unknown mode)
				const accounts = await provider.request({method: 'eth_accounts'});
				expect(accounts).toEqual([]);

				// Sending transaction from unknown address should trigger impersonation
				await provider.request({
					method: 'eth_sendTransaction',
					params: [{from: IMPERSONATE_ADDRESS, to: TEST_ADDRESS, value: '0x0'}],
				});

				expect(impersonateAccount).toHaveBeenCalledWith({address: IMPERSONATE_ADDRESS});
			});

			it('does not impersonate local accounts', async () => {
				const baseProvider = createMockProvider();
				const impersonateAccount = vi.fn().mockResolvedValue(undefined);

				const provider = extendProviderWithAccounts(baseProvider, {
					accounts: {
						privateKeys: [TEST_PRIVATE_KEY],
					},
					impersonate: {
						impersonator: {impersonateAccount},
						mode: 'unknown',
					},
				});

				const accounts = await provider.request({method: 'eth_accounts'});
				expect(accounts).toContain(TEST_ADDRESS);
				// Local account should not trigger impersonation
				expect(impersonateAccount).not.toHaveBeenCalled();
			});
		});

		describe('always mode', () => {
			it('impersonates all accounts including local ones', async () => {
				const baseProvider = createMockProvider();
				const impersonateAccount = vi.fn().mockResolvedValue(undefined);

				const provider = extendProviderWithAccounts(baseProvider, {
					accounts: {
						privateKeys: [TEST_PRIVATE_KEY],
					},
					impersonate: {
						impersonator: {impersonateAccount},
						mode: 'always',
					},
				});

				const accounts = await provider.request({method: 'eth_accounts'});
				// In 'always' mode, only successfully impersonated accounts are returned
				expect(accounts).toContain(TEST_ADDRESS);
				expect(impersonateAccount).toHaveBeenCalledWith({address: TEST_ADDRESS});
			});
		});

		describe('signing with impersonated accounts', () => {
			it('personal_sign forwards to underlying provider for impersonated account', async () => {
				const baseProvider = createMockProvider();
				const mockSignature = '0xmocksignature';
				(baseProvider.request as any).mockImplementation(async ({method}: {method: string}) => {
					switch (method) {
						case 'eth_chainId':
							return '0x1';
						case 'personal_sign':
							return mockSignature;
						default:
							return null;
					}
				});
				const impersonateAccount = vi.fn().mockResolvedValue(undefined);

				const provider = extendProviderWithAccounts(baseProvider, {
					impersonate: {
						impersonator: {impersonateAccount},
						mode: 'list',
						list: [IMPERSONATE_ADDRESS],
					},
				});

				const signature = await provider.request({
					method: 'personal_sign',
					params: ['Hello', IMPERSONATE_ADDRESS],
				} as any);

				expect(signature).toBe(mockSignature);
				expect(baseProvider.request).toHaveBeenCalledWith({
					method: 'personal_sign',
					params: ['Hello', IMPERSONATE_ADDRESS],
				});
			});

			it('eth_sign forwards to underlying provider for impersonated account', async () => {
				const baseProvider = createMockProvider();
				const mockSignature = '0xmocksignature';
				(baseProvider.request as any).mockImplementation(async ({method}: {method: string}) => {
					switch (method) {
						case 'eth_chainId':
							return '0x1';
						case 'eth_sign':
							return mockSignature;
						default:
							return null;
					}
				});
				const impersonateAccount = vi.fn().mockResolvedValue(undefined);

				const provider = extendProviderWithAccounts(baseProvider, {
					impersonate: {
						impersonator: {impersonateAccount},
						mode: 'list',
						list: [IMPERSONATE_ADDRESS],
					},
				});

				const signature = await provider.request({
					method: 'eth_sign',
					params: [IMPERSONATE_ADDRESS, 'Hello'],
				} as any);

				expect(signature).toBe(mockSignature);
				expect(baseProvider.request).toHaveBeenCalledWith({
					method: 'eth_sign',
					params: [IMPERSONATE_ADDRESS, 'Hello'],
				});
			});

			it('eth_signTypedData forwards to underlying provider for impersonated account', async () => {
				const baseProvider = createMockProvider();
				const mockSignature = '0xmocksignature';
				const typedData = {
					types: {Person: [{name: 'name', type: 'string'}]},
					primaryType: 'Person',
					domain: {name: 'Test'},
					message: {name: 'Bob'},
				};
				(baseProvider.request as any).mockImplementation(async ({method}: {method: string}) => {
					switch (method) {
						case 'eth_chainId':
							return '0x1';
						case 'eth_signTypedData':
							return mockSignature;
						default:
							return null;
					}
				});
				const impersonateAccount = vi.fn().mockResolvedValue(undefined);

				const provider = extendProviderWithAccounts(baseProvider, {
					impersonate: {
						impersonator: {impersonateAccount},
						mode: 'list',
						list: [IMPERSONATE_ADDRESS],
					},
				});

				const signature = await provider.request({
					method: 'eth_signTypedData',
					params: [IMPERSONATE_ADDRESS, typedData],
				} as any);

				expect(signature).toBe(mockSignature);
				expect(baseProvider.request).toHaveBeenCalledWith({
					method: 'eth_signTypedData',
					params: [IMPERSONATE_ADDRESS, typedData],
				});
			});

			it('eth_signTypedData_v4 forwards to underlying provider for impersonated account', async () => {
				const baseProvider = createMockProvider();
				const mockSignature = '0xmocksignature';
				const typedData = {
					types: {Person: [{name: 'name', type: 'string'}]},
					primaryType: 'Person',
					domain: {name: 'Test'},
					message: {name: 'Bob'},
				};
				(baseProvider.request as any).mockImplementation(async ({method}: {method: string}) => {
					switch (method) {
						case 'eth_chainId':
							return '0x1';
						case 'eth_signTypedData_v4':
							return mockSignature;
						default:
							return null;
					}
				});
				const impersonateAccount = vi.fn().mockResolvedValue(undefined);

				const provider = extendProviderWithAccounts(baseProvider, {
					impersonate: {
						impersonator: {impersonateAccount},
						mode: 'list',
						list: [IMPERSONATE_ADDRESS],
					},
				});

				const signature = await provider.request({
					method: 'eth_signTypedData_v4',
					params: [IMPERSONATE_ADDRESS, typedData],
				} as any);

				expect(signature).toBe(mockSignature);
				expect(baseProvider.request).toHaveBeenCalledWith({
					method: 'eth_signTypedData_v4',
					params: [IMPERSONATE_ADDRESS, typedData],
				});
			});

			it('signing fails for impersonated account that failed impersonation', async () => {
				const baseProvider = createMockProvider();
				const impersonateAccount = vi.fn().mockRejectedValue(new Error('Impersonation failed'));

				const provider = extendProviderWithAccounts(baseProvider, {
					impersonate: {
						impersonator: {impersonateAccount},
						mode: 'list',
						list: [IMPERSONATE_ADDRESS],
					},
				});

				await expect(
					provider.request({
						method: 'personal_sign',
						params: ['Hello', IMPERSONATE_ADDRESS],
					} as any),
				).rejects.toThrow('Account not available for signing');
			});
		});

		describe('eth_sendTransaction with impersonation', () => {
			it('forwards transaction to underlying provider for impersonated account', async () => {
				const baseProvider = createMockProvider();
				const mockTxHash = '0xtxhash123';
				(baseProvider.request as any).mockImplementation(async ({method}: {method: string}) => {
					switch (method) {
						case 'eth_chainId':
							return '0x1';
						case 'eth_sendTransaction':
							return mockTxHash;
						default:
							return null;
					}
				});
				const impersonateAccount = vi.fn().mockResolvedValue(undefined);

				const provider = extendProviderWithAccounts(baseProvider, {
					impersonate: {
						impersonator: {impersonateAccount},
						mode: 'list',
						list: [IMPERSONATE_ADDRESS],
					},
				});

				const txHash = await provider.request({
					method: 'eth_sendTransaction',
					params: [{from: IMPERSONATE_ADDRESS, to: TEST_ADDRESS, value: '0x0'}],
				});

				expect(txHash).toBe(mockTxHash);
				expect(impersonateAccount).toHaveBeenCalledWith({address: IMPERSONATE_ADDRESS});
			});

			it('fails transaction for impersonated account that failed impersonation', async () => {
				const baseProvider = createMockProvider();
				const impersonateAccount = vi.fn().mockRejectedValue(new Error('Impersonation failed'));

				const provider = extendProviderWithAccounts(baseProvider, {
					impersonate: {
						impersonator: {impersonateAccount},
						mode: 'list',
						list: [IMPERSONATE_ADDRESS],
					},
				});

				await expect(
					provider.request({
						method: 'eth_sendTransaction',
						params: [{from: IMPERSONATE_ADDRESS, to: TEST_ADDRESS, value: '0x0'}],
					}),
				).rejects.toThrow('Account not available');
			});

			it('uses cached impersonation for subsequent transactions', async () => {
				const baseProvider = createMockProvider();
				const mockTxHash = '0xtxhash123';
				(baseProvider.request as any).mockImplementation(async ({method}: {method: string}) => {
					switch (method) {
						case 'eth_chainId':
							return '0x1';
						case 'eth_sendTransaction':
							return mockTxHash;
						default:
							return null;
					}
				});
				const impersonateAccount = vi.fn().mockResolvedValue(undefined);

				const provider = extendProviderWithAccounts(baseProvider, {
					impersonate: {
						impersonator: {impersonateAccount},
						mode: 'list',
						list: [IMPERSONATE_ADDRESS],
					},
				});

				// First transaction
				await provider.request({
					method: 'eth_sendTransaction',
					params: [{from: IMPERSONATE_ADDRESS, to: TEST_ADDRESS, value: '0x0'}],
				});

				// Second transaction from same address
				await provider.request({
					method: 'eth_sendTransaction',
					params: [{from: IMPERSONATE_ADDRESS, to: TEST_ADDRESS, value: '0x1'}],
				});

				// impersonateAccount should only be called once (cached)
				expect(impersonateAccount).toHaveBeenCalledTimes(1);
			});
		});
	});
});
