/***********************************************************************************************************************

	lib/simplestore/adapters/webstorage.js

	Copyright © 2013–2017 Thomas Michael Edwards <thomasmedwards@gmail.com>. All rights reserved.
	Use of this source code is governed by a BSD 2-clause "Simplified" License, which may be found in the LICENSE file.

***********************************************************************************************************************/
/* global Has, SimpleStore */

SimpleStore.adapters.push((() => {
	'use strict';

	// Adapter readiness state.
	let _ok = false;


	/*******************************************************************************************************************
		_WebStorageAdapter Class.
	*******************************************************************************************************************/
	class _WebStorageAdapter {
		constructor(storageId, persistent) {
			const prefix = `${storageId}.`;
			let engine = null;
			let name   = null;

			if (persistent) {
				engine = window.localStorage;
				name   = 'localStorage';
			}
			else {
				engine = window.sessionStorage;
				name   = 'sessionStorage';
			}

			Object.defineProperties(this, {
				_engine : {
					value : engine
				},

				_prefix : {
					value : prefix
				},

				_prefixRe : {
					value : new RegExp(`^${RegExp.escape(prefix)}`)
				},

				name : {
					value : name
				},

				id : {
					value : storageId
				},

				persistent : {
					value : !!persistent
				}
			});
		}

		/* legacy */
		get length() {
			if (DEBUG) { console.log(`[<SimpleStore:${this.name}>.length : Number]`); }

			/*
				NOTE: DO NOT do something like `return this._engine.length;` here, as that will
				      return the length of the entire store, rather than just our prefixed keys.
			*/
			return this.keys().length;
		}
		/* /legacy */

		size() {
			if (DEBUG) { console.log(`[<SimpleStore:${this.name}>.size() : Number]`); }

			/*
				NOTE: DO NOT do something like `return this._engine.length;` here, as that will
				      return the length of the entire store, rather than just our prefixed keys.
			*/
			return this.keys().length;
		}

		keys() {
			if (DEBUG) { console.log(`[<SimpleStore:${this.name}>.keys() : String Array]`); }

			const keys = [];

			for (let i = 0; i < this._engine.length; ++i) {
				const key = this._engine.key(i);

				if (this._prefixRe.test(key)) {
					keys.push(key.replace(this._prefixRe, ''));
				}
			}

			return keys;
		}

		has(key) {
			if (DEBUG) { console.log(`[<SimpleStore:${this.name}>.has(key: "${key}") : Boolean]`); }

			if (typeof key !== 'string' || !key) {
				return false;
			}

			// // FIXME: This method should probably check for the key, rather than comparing its value.
			// return this._engine.getItem(this._prefix + key) != null; // lazy equality for null

			return this._engine.hasOwnProperty(this._prefix + key);
		}

		get(key) {
			if (DEBUG) { console.log(`[<SimpleStore:${this.name}>.get(key: "${key}") : Any]`); }

			if (typeof key !== 'string' || !key) {
				return null;
			}

			const value = this._engine.getItem(this._prefix + key);

			return value == null ? null : _WebStorageAdapter._deserialize(value); // lazy equality for null
		}

		set(key, value) {
			if (DEBUG) { console.log(`[<SimpleStore:${this.name}>.set(key: "${key}", value: \u2026) : Boolean]`); }

			if (typeof key !== 'string' || !key) {
				return false;
			}

			try {
				this._engine.setItem(this._prefix + key, _WebStorageAdapter._serialize(value));
			}
			catch (ex) {
				/*
					Massage the quota exceeded error—the most likely error—into something
					a bit nicer for the player.

					Ideally, we could simply do:
						ex.code === 22
					Or, preferably, something like:
						ex.code === DOMException.QUOTA_EXCEEDED_ERR
					However, both of those are browser convention, not part of the standard,
					and are not supported in all browsers.  So, we have to resort to pattern
					matching the damn name.  I hate the parties responsible for this snafu
					so much.
				*/
				if (/quota_?(?:exceeded|reached)/i.test(ex.name)) {
					ex.message = `${this.name} quota exceeded`;
				}

				throw ex;
			}

			return true;
		}

		delete(key) {
			if (DEBUG) { console.log(`[<SimpleStore:${this.name}>.delete(key: "${key}") : Boolean]`); }

			if (typeof key !== 'string' || !key) {
				return false;
			}

			this._engine.removeItem(this._prefix + key);

			return true;
		}

		clear() {
			if (DEBUG) { console.log(`[<SimpleStore:${this.name}>.clear() : Boolean]`); }

			const keys = this.keys();

			for (let i = 0, iend = keys.length; i < iend; ++i) {
				if (DEBUG) { console.log('\tdeleting key:', keys[i]); }

				this.delete(keys[i]);
			}

			// return this.keys().forEach(key => {
			// 	if (DEBUG) { console.log('\tdeleting key:', key); }
			//
			// 	this.delete(key);
			// });

			return true;
		}

		static _serialize(obj) {
			return LZString.compressToUTF16(JSON.stringify(obj));
		}

		static _deserialize(str) {
			return JSON.parse(LZString.decompressFromUTF16(str));
		}
	}


	/*******************************************************************************************************************
		Adapter Utility Functions.
	*******************************************************************************************************************/
	function adapterInit() {
		// FIXME: We probably could move the functionality tests here—from `lib/has.js`.
		_ok = Has.localStorage && Has.sessionStorage;

		return _ok;
	}

	function adapterCreate(storageId, persistent) {
		if (!_ok) {
			throw new Error('adapter not initialized');
		}

		return new _WebStorageAdapter(storageId, persistent);
	}


	/*******************************************************************************************************************
		Module Exports.
	*******************************************************************************************************************/
	return Object.freeze(Object.defineProperties({}, {
		init   : { value : adapterInit },
		create : { value : adapterCreate }
	}));
})());
