'use strict';

const EventEmitter = require('events');
const fs = require('fs');

const CONTEXT = Symbol('glowstone');

module.exports = (objOrFilename, options) => {
	if (typeof objOrFilename === 'string') {
		return load(objOrFilename, options);
	}
	return objOrFilename[CONTEXT];
};

function load(filename, {
	encoding = 'utf8',
	watch = true,
	defaultValue = {}
} = {}) {
	if (typeof defaultValue !== 'object') {
		throw new TypeError('defaultValue must be an object.');
	}

	let root;
	let writeTask = null;
	let writeRepeat = false;
	const context = new EventEmitter();
	context.write = () => {
		if (writeTask === null) {
			writeTask = write();
		}
		return writeTask;
	};

	async function write() {
		do {
			writeRepeat = false;
			await new Promise((resolve, reject) => {
				fs.writeFile(filename, JSON.stringify(root), encoding, err => {
					if (err) {
						reject(err);
					} else {
						resolve();
					}
				});
			});
		} while (writeRepeat);
		writeTask = null;
	}

	function scheduleWrite() {
		if (writeTask === null) {
			writeTask = write().catch(err => {
				context.emit('error', err);
			});
		} else {
			writeRepeat = true;
		}
	}

	function wrap(value) {
		if (watch && (typeof value === 'object' || typeof value === 'function')) {
			value = new Proxy(value, {
				get(target, name, receiver) {
					return wrap(Reflect.get(target, name, receiver));
				},
				set(target, name, value, receiver) {
					if (Reflect.set(target, name, value, receiver)) {
						scheduleWrite();
						return true;
					}
					return false;
				},
				deleteProperty(target, name) {
					if (Reflect.deleteProperty(target, name)) {
						scheduleWrite();
						return true;
					}
					return false;
				}
			});
		}
		return value;
	}

	return new Promise(resolve => {
		fs.readFile(filename, encoding, (err, json) => {
			if (err) {
				json = JSON.stringify(defaultValue);
			}
			root = JSON.parse(json);
			root[CONTEXT] = context;
			resolve(wrap(root));
		});
	});
}
