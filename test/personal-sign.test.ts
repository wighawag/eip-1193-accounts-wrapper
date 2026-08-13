import {describe, it, expect, vi} from 'vitest';
import {recoverMessageAddress, stringToHex, getAddress} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {extendProviderWithAccounts} from '../src/index.js';
import type {EIP1193ProviderWithoutEvents} from 'eip-1193';

// Hardhat/Foundry default account #0
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const TEST_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

function createMockProvider(): EIP1193ProviderWithoutEvents {
	return {
		request: vi.fn(async ({method}: {method: string; params?: readonly unknown[]}) => {
			switch (method) {
				case 'eth_chainId':
					return '0x1';
				default:
					return null;
			}
		}),
	} as unknown as EIP1193ProviderWithoutEvents;
}

function createProvider() {
	return extendProviderWithAccounts(createMockProvider(), {
		accounts: {privateKeys: [TEST_PRIVATE_KEY]},
	});
}

function byteLength(message: string): number {
	return new TextEncoder().encode(message).length;
}

/** Sign `message` by passing it over the wire the way a dapp does: hex-encoded bytes. */
async function signAsHex(message: string): Promise<`0x${string}`> {
	const provider = createProvider();
	return (await provider.request({
		method: 'personal_sign',
		params: [stringToHex(message), TEST_ADDRESS],
	} as any)) as `0x${string}`;
}

/** Sign `message` by passing it as a plain (non-hex) string, which some dapps still do. */
async function signAsPlainString(message: string): Promise<`0x${string}`> {
	const provider = createProvider();
	return (await provider.request({
		method: 'personal_sign',
		params: [message, TEST_ADDRESS],
	} as any)) as `0x${string}`;
}

describe('personal_sign / EIP-191', () => {
	describe('recovers the signing address', () => {
		// The core regression: the signature must be over the EIP-191 digest of the
		// *decoded message bytes*, prefixed exactly once. Anything else recovers to
		// an unrelated address and any on-chain ecrecover check rejects it.
		it('hex-encoded message recovers to the signing account', async () => {
			const message = 'Hello, World!';
			const signature = await signAsHex(message);

			const recovered = await recoverMessageAddress({message, signature});
			expect(getAddress(recovered)).toBe(getAddress(TEST_ADDRESS));
		});

		it('plain string message recovers to the signing account', async () => {
			const message = 'Hello, World!';
			const signature = await signAsPlainString(message);

			const recovered = await recoverMessageAddress({message, signature});
			expect(getAddress(recovered)).toBe(getAddress(TEST_ADDRESS));
		});

		it('hex-encoded and plain string forms produce the identical signature', async () => {
			// Both encode the same bytes, so the EIP-191 digest - and therefore the
			// signature - must be byte-identical.
			const message = 'Hello, World!';
			expect(await signAsHex(message)).toBe(await signAsPlainString(message));
		});

		it('matches a signature produced directly by viem', async () => {
			const message = 'Hello, World!';
			const account = privateKeyToAccount(TEST_PRIVATE_KEY);

			expect(await signAsHex(message)).toBe(await account.signMessage({message}));
		});
	});

	describe('multi-byte UTF-8 messages', () => {
		// EIP-191 length prefix is the BYTE length of the message. Using the
		// character count of the string (or of its hex encoding) is wrong as soon
		// as the message contains anything outside ASCII.
		const cases: {name: string; message: string}[] = [
			{name: 'accented latin (2 bytes/char)', message: 'héllo wörld'},
			{name: 'CJK (3 bytes/char)', message: '你好世界'},
			{name: 'emoji (4 bytes/char)', message: '🚢🏴‍☠️ ahoy'},
			{name: 'mixed scripts', message: 'Ω≈ç√ 日本語 🌊 café'},
		];

		for (const {name, message} of cases) {
			it(`${name} recovers to the signing account`, async () => {
				// Guard: this case is only meaningful if byte length != char length.
				expect(byteLength(message)).not.toBe(message.length);

				const signature = await signAsHex(message);
				const recovered = await recoverMessageAddress({message, signature});
				expect(getAddress(recovered)).toBe(getAddress(TEST_ADDRESS));
			});
		}

		it('a message whose byte length crosses a digit boundary its char length does not', async () => {
			// 8 ASCII chars + 1 two-byte char = 9 characters but 10 bytes.
			// A char-count prefix writes "9", the correct byte-count prefix writes "10".
			const message = 'abcdefghé';
			expect(message.length).toBe(9);
			expect(byteLength(message)).toBe(10);

			const signature = await signAsHex(message);
			const recovered = await recoverMessageAddress({message, signature});
			expect(getAddress(recovered)).toBe(getAddress(TEST_ADDRESS));
		});
	});

	describe('length-prefix digit boundaries', () => {
		// An off-by-one in the EIP-191 length prefix only shows up where the
		// decimal representation gains a digit: 9 -> 10 and 99 -> 100.
		for (const length of [8, 9, 10, 11, 98, 99, 100, 101]) {
			it(`${length}-byte message recovers to the signing account`, async () => {
				const message = 'a'.repeat(length);
				expect(byteLength(message)).toBe(length);

				const signature = await signAsHex(message);
				const recovered = await recoverMessageAddress({message, signature});
				expect(getAddress(recovered)).toBe(getAddress(TEST_ADDRESS));
			});
		}

		it('empty message recovers to the signing account', async () => {
			const signature = await signAsHex('');
			const recovered = await recoverMessageAddress({message: '', signature});
			expect(getAddress(recovered)).toBe(getAddress(TEST_ADDRESS));
		});
	});

	describe('raw byte payloads', () => {
		it('treats a hex payload as bytes, not as the literal characters "0x..."', async () => {
			// The distinction the old implementation got wrong: signing the string
			// "0x48656c6c6f" instead of the 5 bytes it encodes.
			const provider = createProvider();
			const raw = '0x48656c6c6f' as const; // "Hello"

			const signature = (await provider.request({
				method: 'personal_sign',
				params: [raw, TEST_ADDRESS],
			} as any)) as `0x${string}`;

			const recoveredAsBytes = await recoverMessageAddress({message: {raw}, signature});
			expect(getAddress(recoveredAsBytes)).toBe(getAddress(TEST_ADDRESS));

			// And it must NOT be a signature over the literal hex string.
			const recoveredAsLiteral = await recoverMessageAddress({message: raw, signature});
			expect(getAddress(recoveredAsLiteral)).not.toBe(getAddress(TEST_ADDRESS));
		});

		it('signs non-UTF-8 binary payloads', async () => {
			const provider = createProvider();
			const raw = '0xdeadbeef00ff' as const;

			const signature = (await provider.request({
				method: 'personal_sign',
				params: [raw, TEST_ADDRESS],
			} as any)) as `0x${string}`;

			const recovered = await recoverMessageAddress({message: {raw}, signature});
			expect(getAddress(recovered)).toBe(getAddress(TEST_ADDRESS));
		});

		it('treats an odd-length 0x string as a plain string, not as bytes', async () => {
			// "0xabc" is not a valid byte encoding, so it must be signed as text
			// rather than throwing or being silently truncated.
			const provider = createProvider();
			const message = '0xabc';

			const signature = (await provider.request({
				method: 'personal_sign',
				params: [message, TEST_ADDRESS],
			} as any)) as `0x${string}`;

			const recovered = await recoverMessageAddress({message, signature});
			expect(getAddress(recovered)).toBe(getAddress(TEST_ADDRESS));
		});

		it('treats a non-hex string beginning with 0x as a plain string', async () => {
			const provider = createProvider();
			const message = '0xhello world';

			const signature = (await provider.request({
				method: 'personal_sign',
				params: [message, TEST_ADDRESS],
			} as any)) as `0x${string}`;

			const recovered = await recoverMessageAddress({message, signature});
			expect(getAddress(recovered)).toBe(getAddress(TEST_ADDRESS));
		});
	});

	describe('address matching', () => {
		it('accepts a lowercased address', async () => {
			const provider = createProvider();
			const message = 'checksum independence';

			const signature = (await provider.request({
				method: 'personal_sign',
				params: [stringToHex(message), TEST_ADDRESS.toLowerCase()],
			} as any)) as `0x${string}`;

			const recovered = await recoverMessageAddress({message, signature});
			expect(getAddress(recovered)).toBe(getAddress(TEST_ADDRESS));
		});
	});
});

describe('eth_sign', () => {
	it('throws an unsupported error for a local account', async () => {
		const provider = createProvider();

		await expect(
			provider.request({
				method: 'eth_sign',
				params: [TEST_ADDRESS, '0x' + '11'.repeat(32)],
			} as any),
		).rejects.toThrow(/eth_sign is not supported/i);
	});

	it('does not silently behave like personal_sign', async () => {
		// The old implementation called signMessage(), i.e. it applied the
		// personal_sign prefix and returned a signature that looked plausible.
		const provider = createProvider();
		const message = 'Hello, World!';

		await expect(
			provider.request({
				method: 'eth_sign',
				params: [TEST_ADDRESS, message],
			} as any),
		).rejects.toThrow();
	});
});
