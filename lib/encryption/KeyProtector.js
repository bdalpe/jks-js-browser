const PKCS8Key = require('./PKCS8Key');
const DerValue = require('./DerValue');
const InputStream = require('../stream/InputStream');
const Buffer = require('buffer/').Buffer;
const forge = require('node-forge');

class KeyProtector {
	constructor(password) {
		this.messageDigest = forge.md.sha1.create()
	
		// The password used for protecting/recovering keys passed through this
		// key protector.
		this.passwdBytes = Buffer.alloc(password.length * 2);

		for (let i = 0, j = 0; i < password.length; i++) {
			this.passwdBytes[j++] = password[i].charCodeAt(0) >> 8;
			this.passwdBytes[j++] = password[i].charCodeAt(0);
		}
	}

	resetDigest() {
		this.messageDigest = forge.md.sha1.create()
	}

    /*
     * Recovers the plaintext version of the given key (in protected format),
     * using the password provided at construction time.
     */
	recover(encryptedPrivateKeyInfo) {
        let digest;
        let numRounds;
		let encrKeyLen; // the length of the encrypted key
		
		const algId = encryptedPrivateKeyInfo.getAlgorithm();
		if (algId !== KeyProtector.KEY_PROTECTOR_OID) {
			throw new Error("Unsupported key protection algorithm");
		}
		let protectedKey = encryptedPrivateKeyInfo.getEncryptedData();
		const salt = protectedKey.slice(0, KeyProtector.SALT_LEN);
		encrKeyLen = protectedKey.length - KeyProtector.SALT_LEN - KeyProtector.DIGEST_LEN;
		numRounds = Math.floor(encrKeyLen / KeyProtector.DIGEST_LEN);

		if ((encrKeyLen % KeyProtector.DIGEST_LEN) !== 0) {
			numRounds++;
		}

		// Get the encrypted key portion and store it in "encrKey"
        const encrKey = protectedKey.slice(
			KeyProtector.SALT_LEN,
			encrKeyLen + KeyProtector.SALT_LEN
		);

		let xorKey = Buffer.alloc(encrKey.length);

		// Compute the digests, and store them in "xorKey"
		for (
			let i = 0, xorOffset = 0, digest = salt;
			i < numRounds;
			i++, xorOffset += KeyProtector.DIGEST_LEN
		) {
			this.messageDigest.update(this.passwdBytes.toString('binary'));
			this.messageDigest.update(digest.toString('binary'));
			forge.util.binary.raw.decode(this.messageDigest.digest().getBytes(), digest);
			this.resetDigest();
			
			// Copy the digest into "xorKey"
			if (i < numRounds - 1) {
				xorKey = Buffer.concat([
					xorKey.slice(0, xorOffset),
					digest
				]);
			} else {
				xorKey = Buffer.concat([
					xorKey.slice(0, xorOffset),
					digest.slice(0, encrKey.length - xorOffset)
				]);
			}
	   }

	   // XOR "encrKey" with "xorKey", and store the result in "plainKey"
	   const plainKey = Buffer.alloc(encrKey.length);
	   for (let i = 0; i < plainKey.length; i++) {
		   plainKey[i] = encrKey[i] ^ xorKey[i];
	   }

	   /*
		* Check the integrity of the recovered key by concatenating it with
		* the password, digesting the concatenation, and comparing the
		* result of the digest operation with the digest provided at the end
		* of <code>protectedKey</code>. If the two digest values are
		* different, throw an exception.
		*/
		this.messageDigest.update(this.passwdBytes.toString('binary'));
        this.messageDigest.update(plainKey.toString('binary'));
		digest = forge.util.binary.raw.decode(this.messageDigest.digest().getBytes());
		this.resetDigest();
		
		for (let i = 0; i < digest.length; i++) {
            if (digest[i] !== protectedKey[KeyProtector.SALT_LEN + encrKeyLen + i]) {
                throw new Error("Cannot recover key");
            }
		}
		
		// The parseKey() method of PKCS8Key parses the key
        // algorithm and instantiates the appropriate key factory,
		// which in turn parses the key material.
		return PKCS8Key.parseKey(
			new DerValue(
				new InputStream(plainKey)
			)
		);
	}
}

KeyProtector.SALT_LEN = 20; // the salt length
KeyProtector.DIGEST_ALG = "sha1";
KeyProtector.DIGEST_LEN = 20;

// defined by JavaSoft
KeyProtector.KEY_PROTECTOR_OID = "1.3.6.1.4.1.42.2.17.1.1";

module.exports = KeyProtector;
