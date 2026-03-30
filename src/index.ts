import {privateKeyToAccount, mnemonicToAccount, LocalAccount} from 'viem/accounts';

import type {EIP1193ProviderWithoutEvents, EIP1193TransactionData, EIP1193TransactionDataOfType2} from 'eip-1193';
import {
	Chain,
	createPublicClient,
	createWalletClient,
	custom,
	defineChain,
	PublicClient,
	SendTransactionParameters,
	Transport,
	WalletClient,
} from 'viem';

export type {EIP1193ProviderWithoutEvents};

export {generateMnemonic, generatePrivateKey} from 'viem/accounts';

export interface ProviderOptions {
	accounts?:
		| {
				privateKeys?: `0x${string}`[];
		  }
		| {mnemonic?: string; numAccounts?: number};
	impersonate?: {
		impersonator: {
			impersonateAccount: (params: {address: `0x${string}`}) => Promise<void>;
		};
	} & (
		| {
				mode: 'always' | 'unknown';
		  }
		| {
				mode: 'list';
				list: `0x${string}`[];
		  }
	);
	doNotFillMissingFields?: boolean;
	handlers?: Record<string, (params?: any[]) => Promise<any>>;
}

export function extendProviderWithAccounts(
	providerToExtend: EIP1193ProviderWithoutEvents,
	options?: ProviderOptions,
): EIP1193ProviderWithoutEvents {
	let clients: {wallet: WalletClient<Transport, Chain>; public: PublicClient<Transport, Chain>} | undefined;

	// Impersonation cache: address (lowercase) -> success/failure
	const impersonationCache = new Map<string, boolean>();

	// Track addresses that need impersonation based on mode
	const addressesToImpersonate: `0x${string}`[] = [];

	// Initialization promise to prevent duplicate initialization
	let initPromise: Promise<void> | undefined;

	// Local accounts from private keys or mnemonic
	const accounts: LocalAccount[] = [];
	if (options?.accounts) {
		const accountsProvided = options.accounts;
		if ('privateKeys' in accountsProvided && accountsProvided.privateKeys) {
			for (const pk of accountsProvided.privateKeys) {
				const account = privateKeyToAccount(pk);
				accounts.push(account);
			}
		} else if ('mnemonic' in accountsProvided && accountsProvided.mnemonic) {
			const num = accountsProvided.numAccounts || 10;
			for (let i = 0; i < num; i++) {
				const account = mnemonicToAccount(accountsProvided.mnemonic, {
					accountIndex: i,
				});
				accounts.push(account);
			}
		}
	}

	// Initialize impersonation for configured addresses
	async function initialize(): Promise<void> {
		if (initPromise) return initPromise;

		initPromise = (async () => {
			// Determine addresses to impersonate based on mode
			if (options?.impersonate?.mode === 'list') {
				addressesToImpersonate.push(...options.impersonate.list);
			} else if (options?.impersonate?.mode === 'always') {
				// All accounts including LocalAccounts will use impersonation
				addressesToImpersonate.push(...accounts.map((a) => a.address));
			}
			// For 'unknown' mode, we impersonate on-demand for non-local accounts

			// Pre-impersonate known addresses
			for (const address of addressesToImpersonate) {
				await attemptImpersonation(address);
			}
		})();

		return initPromise;
	}

	// Attempt impersonation for an address, caching the result
	async function attemptImpersonation(address: `0x${string}`): Promise<boolean> {
		const normalizedAddress = address.toLowerCase();

		// Check cache first
		const cached = impersonationCache.get(normalizedAddress);
		if (cached !== undefined) {
			return cached;
		}

		// Attempt impersonation
		if (!options?.impersonate) {
			impersonationCache.set(normalizedAddress, false);
			return false;
		}

		try {
			await options.impersonate.impersonator.impersonateAccount({address});
			impersonationCache.set(normalizedAddress, true);
			return true;
		} catch (error) {
			impersonationCache.set(normalizedAddress, false);
			return false;
		}
	}

	// Get list of available accounts (local + successfully impersonated)
	function getAvailableAccounts(): `0x${string}`[] {
		const available: `0x${string}`[] = [];

		// Local accounts are always available (unless mode is 'always')
		if (options?.impersonate?.mode !== 'always') {
			for (const account of accounts) {
				available.push(account.address);
			}
		}

		// Add successfully impersonated addresses
		for (const address of addressesToImpersonate) {
			const normalized = address.toLowerCase();
			if (impersonationCache.get(normalized) === true) {
				// Avoid duplicates
				if (!available.some((a) => a.toLowerCase() === normalized)) {
					available.push(address);
				}
			}
		}

		return available;
	}

	// Check if an address should use impersonation
	function shouldImpersonate(address: string): boolean {
		if (options?.impersonate?.mode === 'always') {
			return true;
		} else if (options?.impersonate?.mode === 'unknown') {
			return !accounts.some((a) => a.address.toLowerCase() === address.toLowerCase());
		} else if (options?.impersonate?.mode === 'list') {
			return options.impersonate.list.some((a) => a.toLowerCase() === address.toLowerCase());
		}
		return false;
	}

	const accountHandlers: Record<string, (params: any[]) => Promise<any>> = {
		eth_sendTransaction: async (params) => {
			const tx: EIP1193TransactionData = params[0];
			if (options?.doNotFillMissingFields) {
				validateTransaction(tx);
			}
			await initialize();

			const viemTx = toViemTransaction(tx);
			const account = accounts.find((a) => a.address.toLowerCase() === tx.from.toLowerCase());
			const impersonate = options?.impersonate;

			// Use local account if available and not in 'always' mode
			if (impersonate?.mode !== 'always' && account) {
				const clients = await getClients();
				return clients.wallet.sendTransaction({
					...viemTx,
					account,
				} as any);
			}

			// Check if impersonation is allowed and successful
			if (shouldImpersonate(tx.from)) {
				const success = await attemptImpersonation(tx.from as `0x${string}`);
				if (success) {
					return await providerToExtend.request({
						method: 'eth_sendTransaction',
						params: [tx],
					});
				}
			}

			throw new Error('Account not available');
		},

		eth_accounts: async () => {
			await initialize();
			return getAvailableAccounts();
		},

		eth_requestAccounts: async () => {
			await initialize();
			return getAvailableAccounts();
		},

		personal_sign: async (params) => {
			const [message, address] = params;
			await initialize();

			// Try local account first (unless mode is 'always')
			const account = accounts.find((a) => a.address.toLowerCase() === address.toLowerCase());
			if (account && options?.impersonate?.mode !== 'always') {
				const prefixedMessage = `\x19Ethereum Signed Message:\n${message.length}${message}`;
				return account.signMessage({message: prefixedMessage});
			}

			// Try impersonation
			if (shouldImpersonate(address)) {
				const success = await attemptImpersonation(address as `0x${string}`);
				if (success) {
					// Forward to underlying provider for impersonated signing
					return providerToExtend.request({
						method: 'personal_sign',
						params: [message, address],
					});
				}
			}

			throw new Error('Account not available for signing');
		},

		eth_sign: async (params) => {
			const [address, message] = params;
			await initialize();

			// Try local account first (unless mode is 'always')
			const account = accounts.find((a) => a.address.toLowerCase() === address.toLowerCase());
			if (account && options?.impersonate?.mode !== 'always') {
				return account.signMessage({message});
			}

			// Try impersonation
			if (shouldImpersonate(address)) {
				const success = await attemptImpersonation(address as `0x${string}`);
				if (success) {
					// Forward to underlying provider for impersonated signing
					return providerToExtend.request({
						method: 'eth_sign',
						params: [address, message],
					});
				}
			}

			throw new Error('Account not available for signing');
		},

		eth_signTransaction: async (params) => {
			throw new Error('eth_signTransaction not implemented');
			// const tx = params[0];
			// const account = accounts.find((a) => a.address === tx.from);
			// if (!account) {
			// 	throw new Error('Account not available for signing');
			// }
			// return account.signTransaction(signTxParams);
		},

		eth_signTypedData: async (params) => {
			const [address, typedData] = params;
			await initialize();

			// Try local account first (unless mode is 'always')
			const account = accounts.find((a) => a.address.toLowerCase() === address.toLowerCase());
			if (account && options?.impersonate?.mode !== 'always') {
				return account.signTypedData(typedData);
			}

			// Try impersonation
			if (shouldImpersonate(address)) {
				const success = await attemptImpersonation(address as `0x${string}`);
				if (success) {
					// Forward to underlying provider for impersonated signing
					return providerToExtend.request({
						method: 'eth_signTypedData',
						params: [address, typedData],
					});
				}
			}

			throw new Error('Account not available for signing');
		},

		eth_signTypedData_v4: async (params) => {
			const [address, typedData] = params;
			await initialize();

			// Try local account first (unless mode is 'always')
			const account = accounts.find((a) => a.address.toLowerCase() === address.toLowerCase());
			if (account && options?.impersonate?.mode !== 'always') {
				return account.signTypedData(typedData);
			}

			// Try impersonation
			if (shouldImpersonate(address)) {
				const success = await attemptImpersonation(address as `0x${string}`);
				if (success) {
					// Forward to underlying provider for impersonated signing
					return providerToExtend.request({
						method: 'eth_signTypedData_v4',
						params: [address, typedData],
					});
				}
			}

			throw new Error('Account not available for signing');
		},
	};

	const handlers: Record<string, (params: any[]) => Promise<any>> = {
		...accountHandlers,
		...options?.handlers,
	};

	const provider = {
		request: async (args: {method: string; params?: any[]}) => {
			const {method, params = []} = args;
			const handler = handlers[method];
			if (!handler) {
				return providerToExtend.request({
					method: args.method,
					params: args.params,
				} as any);
			}
			return handler(params);
		},
	} as EIP1193ProviderWithoutEvents;

	async function getClients() {
		if (clients) {
			return clients;
		}
		const chainId = await provider.request({method: 'eth_chainId'});

		const chain = defineChain({
			id: Number(chainId),
			name: 'unknown',
			nativeCurrency: {symbol: 'ETH', decimals: 18, name: 'ETH'},
			rpcUrls: {
				default: {
					http: [],
				},
			},
		});
		const walletClient = createWalletClient({
			transport: custom(provider),
			chain,
		});
		const publicClient = createPublicClient({
			transport: custom(provider),
			chain,
		});
		clients = {
			wallet: walletClient,
			public: publicClient,
		};
		return clients;
	}

	function validateTransaction(tx: EIP1193TransactionData) {
		const errors: string[] = [];
		if (!tx.from) errors.push('from');
		if (!tx.gas) errors.push('gas');
		if (!tx.nonce) errors.push('nonce');
		const txAny = tx as any;
		const hasGasPrice = txAny.gasPrice !== undefined;
		const hasMaxFee = txAny.maxFeePerGas !== undefined;
		const hasMaxPriority = txAny.maxPriorityFeePerGas !== undefined;
		if (tx.type === '0x2') {
			if (!hasMaxFee) errors.push('maxFeePerGas');
			if (!hasMaxPriority) errors.push('maxPriorityFeePerGas');
		} else {
			if (!hasGasPrice) errors.push('gasPrice');
		}
		if (errors.length > 0) {
			throw new Error(`Missing mandatory fields: ${errors.join(', ')}`);
		}
	}

	function toViemTransaction(tx: EIP1193TransactionData): Omit<SendTransactionParameters, 'account' | 'chain'> {
		if (tx?.type === '0x1') {
			return {
				type: 'eip2930',
				to: tx.to,
				nonce: tx.nonce ? Number(tx.nonce) : undefined,
				gas: tx.gas ? BigInt(tx.gas) : undefined,
				gasPrice: tx.gasPrice ? BigInt(tx.gasPrice) : undefined,
				data: tx.data,
				accessList: tx.accessList,
				value: tx.value ? BigInt(tx.value) : undefined,
			};
		} else if ((!tx.type && tx.gasPrice == undefined) || tx?.type === '0x2') {
			const txOfType2 = tx as EIP1193TransactionDataOfType2; // we coerce here as we allow to make a type 2 tx when type is not defined
			return {
				type: 'eip1559',
				to: txOfType2.to,
				nonce: txOfType2.nonce ? Number(tx.nonce) : undefined,
				gas: txOfType2.gas ? BigInt(txOfType2.gas) : undefined,
				maxFeePerGas: txOfType2.maxFeePerGas ? BigInt(txOfType2.maxFeePerGas) : undefined,
				maxPriorityFeePerGas: txOfType2.maxPriorityFeePerGas ? BigInt(txOfType2.maxPriorityFeePerGas) : undefined,
				data: txOfType2.data,
				accessList: txOfType2.accessList,
				value: txOfType2.value ? BigInt(txOfType2.value) : undefined,
				// sidecars
				// maxFeePerBlobGas
				// kzg
				// authorizationList
				// blobs
				// blobVersionedHashes
			};
		} else if (!tx.type || tx.type === '0x0') {
			return {
				type: 'legacy',
				to: tx.to,
				nonce: tx.nonce ? Number(tx.nonce) : undefined,
				gas: tx.gas ? BigInt(tx.gas) : undefined,
				gasPrice: tx.gasPrice ? BigInt(tx.gasPrice) : undefined,
				data: tx.data,
				value: tx.value ? BigInt(tx.value) : undefined,
			};
		} else {
			throw new Error(`tx type ${tx.type} not implemented`);
		}
	}

	return provider;
}
