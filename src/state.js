/***********************************************************************************************************************
 *
 * state.js
 *
 * Copyright © 2013–2016 Thomas Michael Edwards <tmedwards@motoslave.net>. All rights reserved.
 * Use of this source code is governed by a Simplified BSD License which can be found in the LICENSE file.
 *
 **********************************************************************************************************************/
/* global Config, Engine, PRNGWrapper, Util, clone, session */

var State = (() => { // eslint-disable-line no-unused-vars, no-var
	'use strict';

	let
		// History moment stack.
		_history = [],

		// Currently active/played moment.
		_active = momentCreate(),

		// Currently active/played moment index.
		_activeIndex = -1,

		// Titles of all moments which have expired (i.e. fallen off the bottom of the stack).
		_expired = [],

		// (optional) Seedable PRNG object.
		_prng = null;


	/*******************************************************************************************************************
	 * State Functions.
	 ******************************************************************************************************************/
	/**
		Resets the story state.
	**/
	function stateReset() { // eslint-disable-line no-unused-vars
		if (DEBUG) { console.log('[State/stateReset()]'); }

		/*
			Delete the active session.
		*/
		session.delete('state');

		/*
			Reset the properties.
		*/
		_history     = [];
		_active      = momentCreate();
		_activeIndex = -1;
		_expired     = [];
		_prng        = _prng === null ? null : new PRNGWrapper(_prng.seed, false);
	}

	/**
		Restores the story state from the active session.
	**/
	function stateRestore() {
		if (DEBUG) { console.log('[State/stateRestore()]'); }

		/*
			Attempt to restore an active session.
		*/
		if (session.has('state')) {
			/*
				Retrieve the session.
			*/
			const stateObj = session.get('state');

			if (DEBUG) { console.log('\tsession state:', stateObj); }

			if (stateObj == null) { // lazy equality for null
				return false;
			}

			/*
				Restore the session.
			*/
			stateUnmarshal(stateObj);
			return true;
		}

		return false;
	}

	/**
		Returns the current story state marshaled into a serializable object.
	**/
	function stateMarshal(noDelta) {
		/*
			Gather the properties.
		*/
		const stateObj = {
			index : _activeIndex
		};

		if (noDelta) {
			stateObj.history = clone(_history);
		}
		else {
			stateObj.delta = historyDeltaEncode(_history);
		}

		if (_expired.length > 0) {
			stateObj.expired = [..._expired];
		}

		if (_prng !== null) {
			stateObj.seed = _prng.seed;
		}

		return stateObj;
	}

	/**
		Restores the story state from a marshaled story state serialization object.
	**/
	function stateUnmarshal(stateObj, noDelta) {
		if (stateObj == null) { // lazy equality for null
			throw new Error('state object is null or undefined');
		}

		if (
			   !stateObj.hasOwnProperty(noDelta ? 'history' : 'delta')
			|| stateObj[noDelta ? 'history' : 'delta'].length === 0
		) {
			throw new Error('state object has no history or history is empty');
		}

		if (!stateObj.hasOwnProperty('index')) {
			throw new Error('state object has no index');
		}

		if (_prng !== null && !stateObj.hasOwnProperty('seed')) {
			throw new Error('state object has no seed, but PRNG is enabled');
		}

		if (_prng === null && stateObj.hasOwnProperty('seed')) {
			throw new Error('state object has seed, but PRNG is disabled');
		}

		/*
			Restore the properties.
		*/
		_history     = noDelta ? clone(stateObj.history) : historyDeltaDecode(stateObj.delta);
		_activeIndex = stateObj.index;
		_expired     = stateObj.hasOwnProperty('expired') ? [...stateObj.expired] : [];

		if (stateObj.hasOwnProperty('seed')) {
			/*
				We only need to restore the PRNG's seed here as `momentActivate()` will handle
				fully restoring the PRNG to its proper state.
			*/
			_prng.seed = stateObj.seed;
		}

		/*
			Activate the current moment (do this only after all properties have been restored).
		*/
		momentActivate(_activeIndex);
	}

	/**
		Returns the current story state marshaled into a save-compatible serializable object.
	**/
	function stateMarshalForSave() {
		return stateMarshal(true);
	}

	/**
		Restores the story state from a marshaled save-compatible story state serialization object.
	**/
	function stateUnmarshalForSave(stateObj) {
		return stateUnmarshal(stateObj, true);
	}

	/**
		Returns the titles of expired moments.
	**/
	function stateExpired() {
		return _expired;
	}

	/**
		Returns the total number of played moments (expired + in-play history moments).
	**/
	function stateTurns() {
		return _expired.length + historyLength();
	}

	/**
		Returns the passage titles of all played moments (expired + in-play history moments).
	**/
	function stateTitles() {
		return _expired.concat(_history.slice(0, historyLength()).map(m => m.title));
	}

	/**
		Returns whether a passage with the given title has been played (expired + in-play history moments).
	**/
	function stateHasPlayed(title) {
		if (title == null || title === '') { // lazy equality for null
			return false;
		}

		if (_expired.includes(title)) {
			return true;
		}
		else if (_history.slice(0, historyLength()).some(m => m.title === title)) {
			return true;
		}

		return false;
	}


	/*******************************************************************************************************************
	 * Moment Functions.
	 ******************************************************************************************************************/
	/**
		Returns a new moment object created from the given passage title and variables object.
	**/
	function momentCreate(title, variables) {
		return {
			title     : title == null ? '' : String(title),       // lazy equality for null
			variables : variables == null ? {} : clone(variables) // lazy equality for null
		};
	}

	/**
		Returns the active (present) moment.
	**/
	function momentActive() {
		return _active;
	}

	/**
		Returns the index within the history of the active (present) moment.
	**/
	function momentActiveIndex() {
		return _activeIndex;
	}

	/**
		Returns the title from the active (present) moment.
	**/
	function momentActiveTitle() {
		return _active.title;
	}

	/**
		Returns the variables from the active (present) moment.
	**/
	function momentActiveVariables() {
		return _active.variables;
	}

	/**
		Returns the active (present) moment after setting it to either the given moment object
		or the moment object at the given history index.  Additionally, updates the active session
		and triggers a history update event.
	**/
	function momentActivate(moment) {
		if (moment == null) { // lazy equality for null
			throw new Error('moment activation attempted with null or undefined');
		}

		/*
			Set the active moment.
		*/
		switch (typeof moment) {
		case 'object':
			_active = clone(moment);
			break;

		case 'number':
			if (historyIsEmpty()) {
				throw new Error('moment activation attempted with index on empty history');
			}

			if (moment < 0 || moment >= historySize()) {
				throw new RangeError('moment activation attempted with out-of-bounds index;'
					+ ` need [0, ${historySize() - 1}], got ${moment}`);
			}

			_active = clone(_history[moment]);
			break;

		default:
			throw new TypeError(`moment activation attempted with a "${typeof moment}";`
				+ ' must be an object or valid history stack index');
		}

		/*
			Restore the seedable PRNG.

			NOTE: We cannot simply set `_prng.pull` to `_active.pull` as that would not
			      properly mutate the PRNG's internal state.
		*/
		if (_prng !== null) {
			_prng = PRNGWrapper.unmarshal({
				seed : _prng.seed,
				pull : _active.pull
			});
		}

		/*
			Update the active session.
		*/
		session.set('state', stateMarshal());

		/*
			Trigger a global `tw:historyupdate` event.

			NOTE: We do this here because setting a new active moment is a core component of,
			      virtually, all history updates.
		*/
		jQuery.event.trigger('tw:historyupdate');

		return _active;
	}


	/*******************************************************************************************************************
	 * History Functions.
	 ******************************************************************************************************************/
	/**
		Returns the moment history.
	**/
	function historyGet() {
		return _history;
	}

	/**
		Returns the number of active history moments (past only).
	**/
	function historyLength() {
		return _activeIndex + 1;
	}

	/**
		Returns the total number of history moments (past + future).
	**/
	function historySize() {
		return _history.length;
	}

	/**
		Returns whether the history is empty.
	**/
	function historyIsEmpty() {
		return _history.length === 0;
	}

	/**
		Returns the current (pre-play version of the active) moment within the history.
	**/
	function historyCurrent() {
		return _history.length > 0 ? _history[_activeIndex] : null;
	}


	/**
		Returns the topmost (most recent) moment within the history.
	**/
	function historyTop() {
		return _history.length > 0 ? _history[_history.length - 1] : null;
	}

	/**
		Returns the bottommost (least recent) moment within the history.
	**/
	function historyBottom() {
		return _history.length > 0 ? _history[0] : null;
	}

	/**
		Returns the moment at the given index within the history.
	**/
	function historyIndex(index) {
		if (historyIsEmpty() || index < 0 || index > _activeIndex) {
			return null;
		}

		return _history[index];
	}

	/**
		Returns the moment at the given offset from the active moment within the history.
	**/
	function historyPeek(offset) {
		if (historyIsEmpty()) {
			return null;
		}

		const lengthOffset = 1 + (offset ? Math.abs(offset) : 0);

		if (lengthOffset > historyLength()) {
			return null;
		}

		return _history[historyLength() - lengthOffset];
	}

	/**
		Returns whether a moment with the given title exists within the history.
	**/
	function historyHas(title) {
		if (historyIsEmpty() || title == null || title === '') { // lazy equality for null
			return false;
		}

		for (let i = _activeIndex; i >= 0; --i) {
			if (_history[i].title === title) {
				return true;
			}
		}

		return false;
	}

	/**
		Creates a new moment and pushes it onto the history, discarding future moments if necessary.
	**/
	function historyCreate(title) {
		if (DEBUG) { console.log(`[State/historyCreate(title: "${title}")]`); }

		/*
			TODO: It might be good to have some assertions about the passage title here.
		*/

		/*
			If we're not at the top of the stack, discard the future moments.
		*/
		if (historyLength() < historySize()) {
			if (DEBUG) { console.log(`\tnon-top push; discarding ${historySize() - historyLength()} future moments`); }

			_history.splice(historyLength(), historySize() - historyLength());
		}

		/*
			Push the new moment onto the history stack.
		*/
		_history.push(momentCreate(title, _active.variables));

		if (_prng) {
			historyTop().pull = _prng.pull;
		}

		/*
			Truncate the history, if necessary, by discarding moments from the bottom.
		*/
		if (Config.history.maxStates > 0) {
			while (historySize() > Config.history.maxStates) {
				_expired.push(_history.shift().title);
			}
		}

		/*
			Activate the new top moment.
		*/
		_activeIndex = historySize() - 1;
		momentActivate(_activeIndex);

		return historyLength();
	}

	/**
		Activate the moment at the given index within the history.
	**/
	function historyGoTo(index) {
		if (DEBUG) { console.log(`[State/historyGoTo(index: ${index})]`); }

		if (
			   index == null /* lazy equality for null */
			|| index < 0
			|| index >= historySize()
			|| index === _activeIndex
		) {
			return false;
		}

		_activeIndex = index;
		momentActivate(_activeIndex);

		return true;
	}

	/**
		Activate the moment at the given offset from the active moment within the history.
	**/
	function historyGo(offset) {
		if (DEBUG) { console.log(`[State/historyGo(offset: ${offset})]`); }

		if (offset == null || offset === 0) { // lazy equality for null
			return false;
		}

		return historyGoTo(_activeIndex + offset);
	}

	/**
		Returns the delta encoded form of the given history array.
	**/
	function historyDeltaEncode(historyArr) {
		if (!Array.isArray(historyArr)) {
			return null;
		}

		if (historyArr.length === 0) {
			return [];
		}

		const delta = [clone(historyArr[0])];

		for (let i = 1, iend = historyArr.length; i < iend; ++i) {
			delta.push(Util.diff(historyArr[i - 1], historyArr[i]));
		}

		return delta;
	}

	/**
		Returns a history array from the given delta encoded history array.
	**/
	function historyDeltaDecode(delta) {
		if (!Array.isArray(delta)) {
			return null;
		}

		if (delta.length === 0) {
			return [];
		}

		const historyArr = [clone(delta[0])];

		for (let i = 1, iend = delta.length; i < iend; ++i) {
			historyArr.push(Util.patch(historyArr[i - 1], delta[i]));
		}

		return historyArr;
	}


	/*******************************************************************************************************************
	 * PRNG Functions.
	 ******************************************************************************************************************/
	function prngInit(seed, useEntropy) {
		if (DEBUG) { console.log(`[State/prngInit(seed: ${seed}, useEntropy: ${useEntropy})]`); }

		if (!historyIsEmpty()) {
			let scriptSection;

			if (TWINE1) { // for Twine 1
				scriptSection = 'a script-tagged passage';
			}
			else { // for Twine 2
				scriptSection = 'the Story JavaScript';
			}

			throw new Error('State.initPRNG must be called during initialization,'
				+ ` within either ${scriptSection} or the StoryInit special passage`);
		}

		_prng = new PRNGWrapper(seed, useEntropy);
		_active.pull = _prng.pull;
	}

	function prngRandom() {
		if (DEBUG) { console.log('[State/prngRandom()]'); }

		return _prng ? _prng.random() : Math.random();
	}


	/*******************************************************************************************************************
	 * Module Exports.
	 ******************************************************************************************************************/
	return Object.freeze(Object.defineProperties({}, {
		/*
			State Functions.
		*/
		reset            : { value : stateReset },
		restore          : { value : stateRestore },
		marshalForSave   : { value : stateMarshalForSave },
		unmarshalForSave : { value : stateUnmarshalForSave },
		expired          : { get : stateExpired },
		turns            : { get : stateTurns },
		passages         : { get : stateTitles },
		hasPlayed        : { value : stateHasPlayed },

		/*
			Moment Functions.
		*/
		active      : { get : momentActive },
		activeIndex : { get : momentActiveIndex },
		passage     : { get : momentActiveTitle },     // shortcut for `State.active.title`
		variables   : { get : momentActiveVariables }, // shortcut for `State.active.variables`

		/*
			History Functions.
		*/
		history     : { get : historyGet },
		length      : { get : historyLength },
		size        : { get : historySize },
		isEmpty     : { value : historyIsEmpty },
		current     : { get : historyCurrent },
		top         : { get : historyTop },
		bottom      : { get : historyBottom },
		index       : { value : historyIndex },
		peek        : { value : historyPeek },
		has         : { value : historyHas },
		create      : { value : historyCreate },
		goTo        : { value : historyGoTo },
		go          : { value : historyGo },
		deltaEncode : { value : historyDeltaEncode },
		deltaDecode : { value : historyDeltaDecode },

		/*
			PRNG Functions.
		*/
		initPRNG : { value : prngInit },
		random   : { value : prngRandom },

		/*
			Legacy Aliases.
		*/
		restart  : { value : () => Engine.restart() },
		backward : { value : () => Engine.backward() },
		forward  : { value : () => Engine.forward() },
		display  : { value : (...args) => Engine.display(...args) },
		show     : { value : (...args) => Engine.show(...args) },
		play     : { value : (...args) => Engine.play(...args) }
	}));
})();
