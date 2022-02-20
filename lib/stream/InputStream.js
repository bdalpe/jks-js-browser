const Buffer = require('buffer/').Buffer;

class InputStream {
	constructor(buffer) {
		this.buffer = Buffer.from(buffer);
		this.offset = 0;
	}

	readInt() {
		return this.buffer.readUInt32BE(
			this.shift(4)
		);
	}

	readUTF() {
		const length = this.buffer.readUInt16BE(this.shift(2));

		return this.read(length).toString();
	}

	read(length) {
		return this.buffer.slice(
			this.offset,
			this.shift(length) + length
		);
	}

	readLong() {
		const value = this.read(8);

		if (typeof value.readBigUInt64BE === 'function') {
			return value.readBigUInt64BE();
		} else {
			const num = BigInt(value);

			return +num.toString();
		}
	}

	readByte() {
		return this.buffer.readUInt8(this.shift(1));
	}

	readShort() {
		return this.read(2).readUInt16BE();
	}

	shift(bytes) {
		const offset = this.offset;
		this.offset += bytes;
		return offset;
	}

	available() {
		return this.buffer.length - this.offset;
	}
}

module.exports = InputStream;
