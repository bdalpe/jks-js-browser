const Buffer = require('buffer/').Buffer;
const forge = require("node-forge");

class PasswordDigest {
	constructor(password) {
		this.hash = this.getPreKeyedHash(password);
		this.password = password;
	}

	update(buffer) {
		this.hash.update(buffer);
	}

	digest() {
		return Buffer.from(this.hash.digest());
	}

	getPreKeyedHash(password) {
		const hash = forge.md.sha1.create();
		const passwdBytes = Buffer.alloc(password.length * 2);
		for (let i = 0, j = 0; i < password.length; i++) {
			passwdBytes[j++] = password[i].charCodeAt(0) >> 8;
			passwdBytes[j++] = password[i].charCodeAt(0);
		}
		hash.update(passwdBytes);
		hash.update(Buffer.from('Mighty Aphrodite'));

		return hash;
	}
}

module.exports = PasswordDigest;
