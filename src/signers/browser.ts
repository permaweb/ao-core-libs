// import { Buffer } from 'buffer/index.js'

import { getRawAndId } from 'helpers/data-item.ts';
import { CreateFn, SignerOptions, SigningFormatType } from 'helpers/types.ts';

if (!globalThis.Buffer) globalThis.Buffer = Buffer;

function createANS104Signer(arweaveWallet: any) {
	/**
	 * createDataItem can be passed here for the purposes of unit testing
	 * with a stub
	 */
	const signer = async (create: any) =>
		arweaveWallet.connect(['SIGN_TRANSACTION']).then(async () => {
			/**
			 * set passthrough in order to receive the arguements as they were passed
			 * to toDataItemSigner
			 */
			const { data, tags, target, anchor } = await create({
				alg: 'rsa-v1_5-sha256',
				passthrough: true,
			});
			/**
			 * https://github.com/wanderwallet/Wander?tab=readme-ov-file#signdataitemdataitem-promiserawdataitem
			 */
			const view = await arweaveWallet.signDataItem({ data, tags, target, anchor });

			/**
			 * Since we passthrough above, just send the precomputed
			 * shape back, which is then detected in signer wrapper
			 */
			const res = await getRawAndId(Buffer.from(view));
			return res;
		});

	return signer;
}

function createHttpSigner(arweaveWallet: any) {
	const signer = async (create: any) =>
		arweaveWallet
			.connect(['ACCESS_ADDRESS', 'ACCESS_PUBLIC_KEY', 'SIGNATURE'])
			.then(async () => {
				const [publicKey, address] = await Promise.all([
					arweaveWallet.getActivePublicKey(),
					arweaveWallet.getActiveAddress(),
				]);
				return { publicKey, address };
			})
			.then(async ({ publicKey, address }: SignerOptions) => {
				const signatureBase = await create({
					type: 1,
					publicKey,
					address,
					alg: 'rsa-pss-sha512',
				});

				const view = await arweaveWallet.signMessage(signatureBase, { hashAlgorithm: 'SHA-512' });

				return {
					signature: Buffer.from(view),
					address,
				};
			});

	return signer;
}

/**
 * A function that builds a signer using the global arweaveWallet
 * commonly used in browser-based dApps
 *
 * This is provided as a convenience for consumers of the SDK
 * to use, but consumers can also implement their own signer
 *
 * @param {Object} arweaveWallet - The window.arweaveWallet object
 * @returns {Types['signer']} - The signer function
 * @example
 * const signer = createSigner(window.arweaveWallet)
 */
export function createSigner(wallet: any) {
	const dataItemSigner = createANS104Signer(wallet);
	const httpSigner = createHttpSigner(wallet);

	const signer = (create: CreateFn, kind: SigningFormatType) => {
		if (kind === SigningFormatType.ANS_104) return dataItemSigner(create);
		if (kind === SigningFormatType.HTTP_SIG) return httpSigner(create);
		throw new Error(`signer kind unknown "${kind}"`);
	};

	return signer;
}
