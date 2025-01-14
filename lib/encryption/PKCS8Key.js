const ObjectIdentifier = require('./ObjectIdentifier');
const DerValue = require('./DerValue');
const forge = require('node-forge');

class PKCS8Key {
	/*
	 * Construct PKCS#8 subject public key from a DER value.
	 *
	 * @param plainKey the DER-encoded SubjectPublicKeyInfo value
	 */
	static parseKey(plainKey) {
		if (plainKey.tag !== DerValue.tag_Sequence) {
			throw new Error('corrupt private key');
		}

		const parsedVersion = plainKey.getBigInteger();

		if (parsedVersion !== PKCS8Key.version) {
			throw new Error('version mismatch: (supported ' + this.version + ', parsed: ' + parsedVersion);
		}

		const seq0 = plainKey.getDerValue();
		const seq1 = plainKey.getDerValue();
		const alghorithm = new ObjectIdentifier(
			seq0.data
		);

		if (
			PKCS8Key.supportedTypes['dsa'] === alghorithm.toString()
			|| PKCS8Key.supportedTypes['ec'] === alghorithm.toString()
		) {
			return PKCS8Key.format(plainKey.buffer);
		}

		try {
			const octetString = seq1.getOctetString();

			return PKCS8Key.export(octetString);
		} catch (e) {
			const error = new Error('Something went wrong with algorithm ' + alghorithm.toString() + '. For more details see \'error.context\'');
			error.context = e;

			throw error;
		}
	}

	static export(key) {
		try {
			const der = forge.util.createBuffer(key.toString('binary'));
			const asn1 = forge.asn1.fromDer(der);
			const forgePrivateKey = forge.pki.privateKeyFromAsn1(asn1);
			const rsaPrivateKey = forge.pki.privateKeyToRSAPrivateKey(forgePrivateKey);
			const wrappedKey = forge.pki.wrapRsaPrivateKey(rsaPrivateKey);
			return forge.pki.privateKeyInfoToPem(wrappedKey).replace(/\r\n/g, '\n');
		} catch (e) {
			throw new Error(e);
		}
	}

	static format(data) {
		const payload = data.toString('base64').match(/.{1,64}/g).join('\n');
		return '-----BEGIN PRIVATE KEY-----\n' +
			payload +
			'\n-----END PRIVATE KEY-----\n';
	}
}

PKCS8Key.supportedTypes = {
	'rsa': '1.2.840.113549.1.1.1',
	'rsa-pss': '1.2.840.113549.1.1.10',
	'dsa': '1.2.840.10040.4.1',
	'ec': '1.2.840.10045.2.1',
	'x25519': '1.3.101.110',
	'x448': '1.3.101.111',
	'ed25519': '1.3.101.112',
	'ed448': '1.3.101.113',
	'dh': '1.2.840.113549.1.3.1',
};
/* The version for this key */
PKCS8Key.version = 0;

module.exports = PKCS8Key;
