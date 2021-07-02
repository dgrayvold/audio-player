//TODO: Allow for dynamic changing of amount of samples so that they aren't too small on narrow screens
//TODO: Think about adding a playlist feature to load in different sources for the same player
//TODO: Make sure all functionality still works with fallback element after finishing component development
//TODO: Figure out how to make sure element contrasts even with light mode background and accent
//TODO: Add fallback code (especially for replace and toReplace functions)
//TODO: Set sample count based on performance of the browser. See https://stackoverflow.com/questions/28729514/detect-browser-graphics-performance
//TODO: Allow for the creation of the player without an audio element by calling something like createElement("audio-player").from("/media/example.mp3")

//DOCUMENT: Audio elements potentially replaced should have preload="none"

export const AP = (async function () {
	const PARSER = new DOMParser(),
		STYLING = await fetch('./AudioPlayer.css')
			.then(r => r.text())
			.then(t => {
				let styleElement = document.createElement('style');

				styleElement.id = 'AudioPlayerStyles';
				styleElement.innerHTML = t;

				return styleElement;
			}),
		TEMPLATES = await fetch('./AudioPlayer.inc')
			.then(r => r.text())
			.then(t => PARSER.parseFromString(t, 'text/html')),
		ELEMENT = TEMPLATES.querySelector('#audio-player').content,
		CUSTOM_ELEMENT = TEMPLATES.querySelector('#custom-audio-player').content,
		SAMPLE_COUNT = 500,
		RESIZE_OBSERVER = window.ResizeObserver == undefined ? null : new ResizeObserver(modifyVisualizerResolution),
		NARROW_LAYOUT = window.matchMedia('(max-width: 800px)');

	let x = ['something', 'else', 'more', 'stuff', 'here'];

	if (RESIZE_OBSERVER == null) {
		window.addEventListener('resize', modifyVisualizerResolution);
	}

	let playbackIntervals = [];

	class AudioPlayer extends HTMLElement {
		constructor() {
			super();

			const shadow = this.attachShadow({
					mode: 'open',
				}),
				element = CUSTOM_ELEMENT.cloneNode(true);

			shadow.appendChild(STYLING.cloneNode(true)), shadow.appendChild(element);
		}

		toReplace(source) {
			return this.replace(source);
		}

		replace(source) {
			let player = this,
				visualizer = this.shadowRoot.querySelector('.visualizer'),
				visualizerPlayButton = this.shadowRoot.querySelector('.play-button'),
				visualizerSampleList = this.shadowRoot.querySelector('.visualizer-samples');

			source.after(this);
			this.shadowRoot.prepend(source);
			this.setAttribute('aria-role', 'region');

			return (
				fetch(source.src)
					.then(r => r.arrayBuffer())
					//Set source and generate sample data
					.then(b => {
						source.src = URL.createObjectURL(
							new Blob([b], {
								type: 'audio/mp3',
							})
						);
						return buildVisualizerContent(b);
					})
					//Move generated sample data to element and determine visibility
					.then(c => {
						visualizer.querySelector('.visualizer-samples').appendChild(c);
						modifyVisualizerResolution(player);
					})
					//Set event listeners, display element, begin observing resizes, and load source
					.then(() => {
						['mouseleave', 'mousemove', 'touchmove', 'touchend'].forEach(e => {
							visualizerSampleList.addEventListener(e, highlightSample);
						});
						['click'].forEach(e => {
							visualizerPlayButton.addEventListener(e, togglePlayback);
						});
						['play', 'pause'].forEach(e => {
							source.addEventListener(e, toggleAudioLocationTracking);
							source.addEventListener(e, setPlayButtonState);
						});

						player.addEventListener('keydown', keyboardControlPlayback);
						visualizerSampleList.addEventListener('click', setSourceTime);
						if (RESIZE_OBSERVER != null) {
							RESIZE_OBSERVER.observe(player);
						}
						source.load();

						return player;
					})
					.then(presentPlayer)
					.then(() => player)
			);
		}

		static get observedAttributes() {
			return ['loading', 'accent', 'background'];
		}

		attributeChangedCallback(attr, o, n) {
			if (['accent', 'background'].includes(attr)) {
				if (o != n) {
					this[attr] = n;
				}
			}
		}

		connectedCallback() {
			this.tabIndex = 0;
			this.setAttribute('loading', '');
		}

		set accent(i) {
			this.setAttribute('accent', i);

			let sheet = getNamedStyleSheet(this.shadowRoot, 'accent');

			sheet.deleteRule(0);
			sheet.insertRule(`:host {--audio-player-accent-color: ${i}; }`);
		}
		set background(i) {
			this.setAttribute('background', i);

			let sheet = getNamedStyleSheet(this.shadowRoot, 'background');

			sheet.deleteRule(0);
			sheet.insertRule(`:host {--audio-player-background-color: ${i}; }`);
		}
	}

	customElements.define('audio-player', AudioPlayer);

	function buildVisualizerContent(buffer) {
		return generateSampleData(buffer).then(data => {
			let sampleElements = document.createDocumentFragment();

			data.forEach((s, si) => {
				let sample = document.createElement('data');

				sample.style.height = s < 0.05 ? '1%' : s * 100 + '%';
				sample.classList.add('hidden');

				sampleElements.appendChild(sample);
			});

			return sampleElements;
		});
	}

	function keyboardControlPlayback(e) {
		let player = e.target,
			source;
		if (player.tagName == 'AUDIO-PLAYER') {
			source = player.shadowRoot.querySelector('audio');
		} else {
			source = player.querySelector('audio');
		}

		switch (e.keyCode) {
			case 27:
				document.activeElement.blur();
				break;
			case 32: //Space
				togglePlayback(e);
				break;
			case 37: //Left key
				if (source.currentTime - 5 < 0) {
					source.currentTime = 0;
					source.pause();
					setPlayButtonState(e);
				} else {
					source.currentTime -= 5;
				}

				trackAudioLocation(source, player);

				break;
			case 39: //Right key
				if (source.currentTime + 5 > source.duration) {
					source.currentTime = source.duration;
					source.pause();
					setPlayButtonState(e);
				} else {
					source.currentTime += 5;
				}

				trackAudioLocation(source, player);

				break;
			default:
				return;
				break;
		}
	}

	async function generateSampleData(buffer) {
		let context = window.AudioContext ? new window.AudioContext() : new window.webkitAudioContext(),
			data;

		//Crutch for old Webkit version
		if (window.webkitAudioContext) {
			data = await new Promise(res => {
				context.decodeAudioData(buffer, function (data) {
					res(data);
				});
			});
		} else {
			data = await context.decodeAudioData(buffer);
		}

		let d = data.getChannelData(0),
			blockSize = Math.floor(d.length / SAMPLE_COUNT),
			samples = new Array(SAMPLE_COUNT).fill(null).map((s, si) => {
				return Math.abs(
					d.slice(si * blockSize, (si + 1) * blockSize).reduce((a, c) => a + Math.abs(c)) / SAMPLE_COUNT
				);
			}),
			sampleMultiplier = Math.pow(Math.max(...samples), -1),
			normalizedSamples = samples.map(s => s * sampleMultiplier);

		return normalizedSamples;
	}

	function getAudioPlayers() {
		return Array.from(document.querySelectorAll('audio-player, .audio-player'));
	}

	function getContainingAudioPlayer(e) {
		let players = Array.from(document.querySelectorAll('audio-player, .audio-player'));

		return players.find(p => {
			if (p.tagName == 'AUDIO-PLAYER' && p.shadowRoot.contains(e.target)) {
				return true;
			} else if (p.contains(e.target)) {
				return true;
			} else {
				return false;
			}
		});
	}

	/**
	 * Get a style sheet identified by its owner style node's id attribute. If a matching sheet
	 * cannot be found, create one with a single empty rule and return that
	 *
	 * @param   {HTMLDocument|ShadowRoot} source   The source node whose sheets should be checked
	 * @param   {string}                  property The property to find a sheet for
	 *
	 * @returns {CSSStyleSheet}           The matching or newly created style sheet
	 */
	function getNamedStyleSheet(source, property) {
		let styleSheet = Array.from(source.styleSheets).find(s => s.ownerNode.id == property);

		if (!styleSheet) {
			styleSheet = document.createElement('style');

			styleSheet.id = property;
			source.appendChild(styleSheet);

			styleSheet = Array.from(source.styleSheets).find(s => s.ownerNode.id == property);
			styleSheet.insertRule(':root {}');
		}

		return styleSheet;
	}

	/**
	 * Display the currently selected sample in the visualizer
	 *
	 * @param {Event} e The triggering event
	 */
	function highlightSample(e) {
		let player = getContainingAudioPlayer(e),
			visualizerSampleList = e.target,
			samples = visualizerSampleList.querySelectorAll('data:not(.removed)'),
			highlightedSamples = Array.from(samples).filter(s => s.classList.contains('highlighted')),
			sampleCount = samples.length,
			a =
				player.tagName == 'AUDIO-PLAYER'
					? player.shadowRoot.querySelector('audio')
					: player.querySelector('audio');

		let rect = visualizerSampleList.getBoundingClientRect(),
			position;

		switch (e.type) {
			case 'mouseleave':
			case 'click':
				if (e.type == 'click' && window.TouchEvent == undefined) {
					return;
				}
				for (let x of highlightedSamples) {
					x.removeAttribute('class');
				}
				break;
			case 'mousemove':
				position = Math.round((e.clientX - rect.left) / (rect.width / sampleCount));
				if (position > samples.length - 1) {
					return;
				}

				if (highlightedSamples[0] == samples[position]) {
					return;
				} else {
					for (let x of highlightedSamples) {
						x.removeAttribute('class');
					}
					samples[position].classList.add('highlighted');
				}

				break;
		}
	}

	function modifyVisualizerResolution(input) {
		let players;

		if (input.tagName != undefined) {
			players = [input];
		} //Manual calling
		else if (input.target != undefined) {
			players = [input.target];
		} //From ResizeObserver
		else {
			players = getAudioPlayers();
		} //From resize event

		players.forEach(p => {
			let rect = p.getBoundingClientRect();

			if (rect.width < 600) {
				if (p.tagName == 'AUDIO-PLAYER') {
					p.setAttribute('narrow', '');
				} else {
					p.classList.add('narrow');
				}
			} else {
				if (p.tagName == 'AUDIO-PLAYER') {
					p.removeAttribute('narrow');
				} else {
					p.classList.remove('narrow');
				}
			}
		});
	}

	function presentPlayer(player) {
		let samples;

		if (player.tagName == 'AUDIO-PLAYER') {
			samples = player.shadowRoot.querySelectorAll('.visualizer-samples data');
			player.removeAttribute('loading');
		} else {
			samples = player.querySelectorAll('.visualizer-samples data');
			player.classList.remove('loading');
		}

		return new Promise(res => {
			samples.forEach((s, si) => {
				setTimeout(() => s.removeAttribute('class'), 20 + si * 2);
				if (si == samples.length - 1) {
					setTimeout(res, 20 + si * 2);
				}
			});
		});
	}

	function setPlayButtonState(e) {
		let player = getContainingAudioPlayer(e),
			source;

		if (player.tagName == 'AUDIO-PLAYER') {
			source = player.shadowRoot.querySelector('audio');

			if (source.paused) {
				player.removeAttribute('playing');
			} else {
				player.setAttribute('playing', '');
			}
		} else {
			source = player.querySelector('audio');

			if (source.paused) {
				player.classList.remove('playing');
			} else {
				player.classList.add('playing');
			}
		}
	}

	function setSourceTime(e) {
		let player = getContainingAudioPlayer(e),
			rect = e.target.getBoundingClientRect(),
			position = (e.clientX - rect.left) / rect.width,
			source =
				player.tagName == 'AUDIO-PLAYER'
					? player.shadowRoot.querySelector('audio')
					: player.querySelector('audio');

		e.preventDefault();

		source.currentTime = source.duration * position;
		trackAudioLocation(source, player, true);
		highlightSample(e);
	}

	function toggleAudioLocationTracking(e) {
		let a = e.target,
			player = getContainingAudioPlayer(e),
			interval = a.dataset.playbackInterval;

		if (interval != undefined) {
			let matchingInterval = playbackIntervals.find(i => i.id == interval);

			if ((matchingInterval = clearInterval(matchingInterval.interval))) {
				playbackIntervals.splice(playbackIntervals.indexOf(matchingInterval), 1);
			}
		}

		if (e.type == 'play') {
			let id = Math.floor(Math.random() * (100 * 1000 * 1000));

			while (playbackIntervals.find(i => i.id == id) != undefined) {
				id = Math.floor(Math.random() * (100 * 1000 * 1000));
			}

			playbackIntervals.push({
				id: id,
				interval: setInterval(trackAudioLocation, 50, a, player),
			});
		}
	}

	function togglePlayback(e) {
		let player = getContainingAudioPlayer(e),
			source;

		if (player.tagName == 'AUDIO-PLAYER') {
			source = player.shadowRoot.querySelector('audio');
		} else {
			source = getAudioPlayers()
				.find(p => p == e.target || p.contains(e.target))
				.querySelector('audio');
		}

		if (source.paused) {
			e.target.classList.add('playing');
			source.play();
		} else {
			e.target.classList.remove('playing');
			source.pause();
		}
	}

	function trackAudioLocation(source, player, wasSeeked) {
		let offset = wasSeeked ? 0 : 0.1;

		let currentPlaybackPosition = Math.min(100, ((source.currentTime + offset) / source.duration) * 100),
			progressIndicator;

		if (player.tagName == 'AUDIO-PLAYER') {
			progressIndicator = player.shadowRoot.querySelector('.visualizer-progress-indicator');
		} else {
			progressIndicator = player.querySelector('.visualizer-progress-indicator');
		}

		progressIndicator.style.width = `${currentPlaybackPosition}%`;
	}

	return {
		toReplace: function (source) {
			return this.replace(source);
		},
		replace: function (source) {
			if (document.head.querySelector('#AudioPlayerStyles') == null) {
				document.head.appendChild(STYLING);
			}

			let content = ELEMENT.cloneNode(true),
				player = content.querySelector('.audio-player'),
				visualizer = content.querySelector('figure'),
				visualizerPlayButton = visualizer.querySelector('.play-button'),
				visualizerSampleList = visualizer.querySelector('.visualizer-samples');

			source.style.display = 'none';
			source.after(content);
			player.prepend(source);

			return (
				fetch(source.src)
					.then(r => r.arrayBuffer())
					//Set source and generate sample data
					.then(b => {
						source.src = URL.createObjectURL(
							new Blob([b], {
								type: 'audio/mp3',
							})
						);
						return buildVisualizerContent(b);
					})
					//Move generated sample data to element and determine visibility
					.then(c => {
						visualizer.querySelector('.visualizer-samples').appendChild(c);
						modifyVisualizerResolution(player);
					})
					//Set event listeners, display element, begin observing resizes, and load source
					.then(() => {
						['mouseleave', 'mousemove', 'touchmove', 'touchend'].forEach(e => {
							visualizerSampleList.addEventListener(e, highlightSample);
						});
						['click'].forEach(e => {
							visualizerPlayButton.addEventListener(e, togglePlayback);
						});
						['play', 'pause'].forEach(e => {
							source.addEventListener(e, toggleAudioLocationTracking);
							source.addEventListener(e, setPlayButtonState);
						});

						player.addEventListener('keydown', keyboardControlPlayback);
						visualizerSampleList.addEventListener('click', setSourceTime);

						if (RESIZE_OBSERVER != null) {
							RESIZE_OBSERVER.observe(player);
						}
						source.load();

						return player;
					})
					.then(presentPlayer)
					.then(() => player)
			);
		},
	};
})();
