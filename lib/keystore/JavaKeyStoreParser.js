const PasswordDigest = require('../encryption/PasswordDigest');
const DigestInputStream = require('../stream/DigestInputStream');
const InputStream = require('../stream/InputStream');
const CertificateFactory = require('../certs/CertificateFactory');
const KeyEntry = require('./KeyEntry');
const TrustedKeyEntry = require('./TrustedKeyEntry');

/*
 * KEYSTORE FORMAT:
 *
 * Magic number (big-endian integer),
 * Version of this file format (big-endian integer),
 *
 * Count (big-endian integer),
 * followed by "count" instances of either:
 *
 *     {
 *      tag=1 (big-endian integer),
 *      alias (UTF string)
 *      timestamp
 *      encrypted private-key info according to PKCS #8
 *          (integer length followed by encoding)
 *      cert chain (integer count, then certs; for each cert,
 *          integer length followed by encoding)
 *     }
 *
 * or:
 *
 *     {
 *      tag=2 (big-endian integer)
 *      alias (UTF string)
 *      timestamp
 *      cert (integer length followed by encoding)
 *     }
 *
 * ended by a keyed SHA1 hash (bytes only) of
 *     { password + whitener + preceding body }
 */
class JavaKeyStoreParser {
	static MAGIC = 0xfeedfeed;
	static VERSION_1 = 0x01;
	static VERSION_2 = 0x02;
	static PRIVATE_KEY_TAG = 1;
	static TRUSTED_CERT_TAG = 2;

	constructor(keystore, password) {
		this.keystore = keystore;
		this.password = password;
		this.certificateFactory = new CertificateFactory();

		if (password) {
			this.messageDigest = new PasswordDigest(password); 
			this.dataInputStream = new DigestInputStream(keystore, this.messageDigest);
		} else {
			this.dataInputStream = new InputStream(keystore);
		}
	}

	assertMagic(xMagic) {
		if (xMagic !== JavaKeyStoreParser.MAGIC) {
			throw new Error('Invalid keystore format');
		}
	}

	assertVersion(xVersion) {
		if (
			xVersion !== JavaKeyStoreParser.VERSION_1
			&&
			xVersion !== JavaKeyStoreParser.VERSION_2
		) {
			throw new Error('Invalid keystore format');
		}
	}

	parse() {
		const xMagic = this.dataInputStream.readInt();
		const xVersion = this.dataInputStream.readInt();

		this.assertMagic(xMagic);
		this.assertVersion(xVersion);

		const count = this.dataInputStream.readInt();
		const certs = [];

		for (let i = 0; i < count; i++) {
			const tag = this.dataInputStream.readInt();
			const alias = this.dataInputStream.readUTF();
			const date = new Date(+this.dataInputStream.readLong().toString());

			if (tag === JavaKeyStoreParser.PRIVATE_KEY_TAG) {
				const protectedPrivateKey = this.getPrivateKeyEntry();
				const chain = this.readCertificateChain(xVersion);
				const entry = new KeyEntry({
					alias,
					date,
					chain,
					protectedPrivateKey
				});
				
				certs.push(entry);
			} else if (tag === JavaKeyStoreParser.TRUSTED_CERT_TAG) {
				const cert = this.readCert(xVersion);
				const entry = new TrustedKeyEntry({
					alias,
					date,
					cert
				});

				certs.push(entry);
			} else {
				throw new Error('Unrecognized keystore entry');
			}
		}

		this.validateChecksum();	

		return certs;
	}

	validateChecksum() {
		if (!this.password) {
			return;
		}

		const computed = this.messageDigest.digest();
		const acctual = this.dataInputStream.buffer.slice(
			this.dataInputStream.offset,
			this.dataInputStream.offset + computed.length,
		);
		const isChecksumCorrect = computed.every((byte, i) => acctual[i] === byte);

		if (!isChecksumCorrect) {
			throw new Error('Password verification failed');
		}
	}

	getPrivateKeyEntry() {
		const protectedPrivateKey = this.dataInputStream.read(
			this.dataInputStream.readInt()
		);

		return protectedPrivateKey;
	}

	readCert(xVersion) {
		let cf;

		if (xVersion === JavaKeyStoreParser.VERSION_2) {
			const certType = this.dataInputStream.readUTF();

			cf = this.certificateFactory.getInstance(certType);
		} else {
			cf = this.certificateFactory.getInstance('X.509');
		}

		const encoded = this.dataInputStream.read(
			this.dataInputStream.readInt()
		);
		
		return cf.generateCertificate(encoded);
	}

	readCertificateChain(xVersion) {
		const numOfCerts = this.dataInputStream.readInt();
		const chain = [];
	
		if (numOfCerts < 0) {
			return chain;
		}
	
		for (let i = 0; i < numOfCerts; i++) {
			chain.push(this.readCert(xVersion));
		}
	
		return chain;
	}
}

module.exports = JavaKeyStoreParser;