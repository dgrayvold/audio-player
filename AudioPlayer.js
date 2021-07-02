//TODO: Make sure all functionality still works with fallback element after finishing component development
//TODO: Add fallback code (especially for replace and toReplace functions)
//TODO: Allow for loading pregenerated sample data, either from JSON or a pregenerated SVG file

//FUTURE: Think about adding a playlist feature to load in different sources for the same player

//DOCUMENT: Audio elements potentially replaced should have preload="none"

export const AP = (async function () {
	const COMPONENT_PATH = import.meta.url.match(/(^.+\/)[^/]+$/)[1];
	const PARSER = new DOMParser(),
		STYLING = await fetch(COMPONENT_PATH + 'AudioPlayer.css')
			.then(r => r.text())
			.then(t => {
				let styleElement = document.createElement('style');

				styleElement.id = 'AudioPlayerStyles';
				styleElement.innerHTML = t;

				return styleElement;
			}),
		TEMPLATES = await fetch(COMPONENT_PATH + 'AudioPlayer.inc')
			.then(r => r.text())
			.then(t => {
				return PARSER.parseFromString(t, 'text/html');
			}),
		ELEMENT = TEMPLATES.querySelector('#audio-player').content,
		CUSTOM_ELEMENT = TEMPLATES.querySelector('#custom-audio-player').content,
		SAMPLE_COUNT = 500,
		REDUCED_SAMPLE_COUNT = 100,
		RESIZE_OBSERVER = window.ResizeObserver == undefined ? null : new ResizeObserver(modifyVisualizerResolution),
		NARROW_LAYOUT = window.matchMedia('(max-width: 800px)');

	if (RESIZE_OBSERVER == null) {
		window.addEventListener('resize', modifyVisualizerResolution);
	}

	let playbackIntervals = [],
		playerSizeStates = [];

	class AudioPlayer extends HTMLElement {
		constructor() {
			super();

			const shadow = this.attachShadow({ mode: 'open' }),
				element = CUSTOM_ELEMENT.cloneNode(true);

			shadow.appendChild(element);
			this.shadowRoot.prepend(STYLING.cloneNode(true));
		}

		//DOCUMENT: Allows more readable code by entering document.createElement("audio-player").from([audio source]).then([append procedure])
		from(url) {
			let host = document.createElement('section'),
				element = host.appendChild(document.createElement('audio'));

			host.setAttribute('style', 'position: absolute; opacity: 0; pointer-events: none;');
			document.body.appendChild(host);

			element.src = url;

			return this.replace(element).then(e => {
				document.body.removeChild(host);
				return e;
			});
		}

		//DOCUMENT: Allows more readable code by entering document.createElement("audio-player").toReplace([audio source])
		toReplace(source) {
			return this.replace(source);
		}
		replace(source) {
			let player = this,
				visualizer = this.shadowRoot.querySelector('.visualizer'),
				waveform = visualizer.querySelector('.waveform'),
				cursor = visualizer.querySelector('.cursor'),
				visualizerPlayButton = this.shadowRoot.querySelector('.play-button');

			source.after(this);
			this.shadowRoot.prepend(source);
			this.source = source;
			this.cursor = cursor;
			this.setAttribute('aria-role', 'region');

			setCustomStyleProperty(this.shadowRoot, '--audio-player-sample-count', SAMPLE_COUNT);
			setCustomStyleProperty(this.shadowRoot, '--audio-player-stroke-width', 100 / SAMPLE_COUNT);

			//Set event listeners, display element, and begin observing resizes,
			['mouseleave', 'mousemove', 'touchmove', 'touchend'].forEach(e => {
				visualizer.addEventListener(e, highlightSample);
			});
			['click'].forEach(e => {
				visualizerPlayButton.addEventListener(e, togglePlayback);
			});
			['play', 'pause'].forEach(e => {
				source.addEventListener(e, toggleAudioLocationTracking);
				source.addEventListener(e, setPlayButtonState);
			});

			player.addEventListener('keydown', keyboardControlPlayback);
			visualizer.addEventListener('click', setSourceTime);
			if (RESIZE_OBSERVER != null) {
				RESIZE_OBSERVER.observe(player);
			} else {
				window.addEventListener('resize', modifyVisualizerResolution);
			} // TODO: Test

			return this.load(source.src);
		}

		async load(url) {
			let currentVolume = this.source.volume;

			this.setAttribute('loading', '');

			//Fade out and pause current source if playing
			if (!this.source.paused) {
				let volumeStep = this.source.volume / 100;

				if (this.source.volume != 0) {
					await new Promise(res => {
						for (let i = 0; i < 100; i++) {
							setTimeout(() => {
								if (i == 99) {
									this.source.volume = 0;
									res();
								} else {
									this.source.volume -= volumeStep;
								}
							}, 3 * i);
						}
					});
				}

				this.source.pause();
			}

			return (
				fetch(url)
					.then(r => r.arrayBuffer())
					//Set source and generate sample data
					.then(b => {
						this.source.src = URL.createObjectURL(new Blob([b], { type: 'audio/mp3' }));
						return generateSampleData(b);
					})
					.then(d => {
						this.data = d;
						return buildVisualizerContent(d);
					})
					//Move generated sample data to element and set waveform resolution
					.then(p => {
						this.shadowRoot.querySelector('.waveform').setAttribute('d', p);
						modifyVisualizerResolution(this.shadowRoot); //TODO: try to make this so it's not calculated twice

						//Wrapper for audio element load
						return new Promise(res => {
							this.source.addEventListener('canplaythrough', function progress(e) {
								this.removeEventListener('canplaythrough', progress);
								res();
							});

							this.source.load();
						});
					})
					//Load source
					.then(() => {
						this.source.volume = currentVolume;
						trackAudioLocation(this.source, this, false);
						return this;
					})
					.then(presentPlayer)
					.then(() => this)
			);
		}

		static get observedAttributes() {
			return ['loading', 'accent', 'background', 'indicator'];
		}

		attributeChangedCallback(attr, o, n) {
			if (['accent', 'background', 'indicator'].includes(attr)) {
				if (o != n) {
					this[attr] = n;
				}
			}
		}

		connectedCallback() {
			//Set any attributes that have been set through this.color() before placing element
			if (this.awaitingAttributes) {
				Object.keys(this.awaitingAttributes).forEach(a => (this[a] = this.awaitingAttributes[a]));
				delete this.awaitingAttributes;
			}

			if (this.data == null) {
				this.tabIndex = 0;
				this.setAttribute('loading', '');
			}
		}

		set accent(i) {
			this.setAttribute('accent', i);
			if (this.isConnected) {
				setCustomStyleProperty(this.shadowRoot, '--audio-player-accent-color', i);
			} else {
				if (!this.awaitingAttributes) {
					this.awaitingAttributes = {};
				}
				this.awaitingAttributes.accent = i;
			}
		}
		set background(i) {
			this.setAttribute('background', i);
			if (this.isConnected) {
				setCustomStyleProperty(this.shadowRoot, '--audio-player-background-color', i);
			} else {
				if (!this.awaitingAttributes) {
					this.awaitingAttributes = {};
				}
				this.awaitingAttributes.background = i;
			}
		}
		set indicator(i) {
			this.setAttribute('indicator', i);
			if (this.isConnected) {
				setCustomStyleProperty(this.shadowRoot, '--audio-player-indicator-color', i);
			} else {
				if (!this.awaitingAttributes) {
					this.awaitingAttributes = {};
				}
				this.awaitingAttributes.indicator = i;
			}
		}

		//DOCUMENT: Chaining method to set various colors
		color({ accent = null, background = null, indicator = null } = {}) {
			if (accent != null) {
				this.setAttribute('accent', accent);
			}
			if (background != null) {
				this.setAttribute('background', background);
			}
			if (indicator != null) {
				this.setAttribute('indicator', indicator);
			}

			return this;
		}
	}

	customElements.define('audio-player', AudioPlayer);

	//DOCUMENT: reduction is used by modifyPlayerResolution to allow for reduced sample counts
	function buildVisualizerContent(data, reduction = false) {
		return new Promise(res => {
			let path = 'M0,50 ';

			if (reduction) {
				for (let si = 0; si < REDUCED_SAMPLE_COUNT; si++) {
					let index = si * 5,
						height = data[index] * 100;

					if (data[index] < 0.05) {
						height = 1;
					}
					let position =
						si == 0
							? 100 / REDUCED_SAMPLE_COUNT / 2
							: (100 / REDUCED_SAMPLE_COUNT) * si + 100 / REDUCED_SAMPLE_COUNT / 2;
					path += `L${position},50 V${50 - height / 2} V${50 + height / 2} V50 `;
				}
			} else {
				data.forEach((s, si) => {
					let height = s * 100;

					if (s < 0.05) {
						height = 1;
					}
					let position =
						si == 0 ? 100 / SAMPLE_COUNT / 2 : (100 / SAMPLE_COUNT) * si + 100 / SAMPLE_COUNT / 2;

					path += `L${position},50 V${50 - height / 2} V${50 + height / 2} V50 `;
				});
			}

			res(path);
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
	 * Display the currently selected sample in the visualizer
	 *
	 * @param {Event} e The triggering event
	 */
	function highlightSample(e) {
		let player = getContainingAudioPlayer(e),
			rect = e.currentTarget.getBoundingClientRect(),
			cursor = player.cursor,
			position,
			height,
			sizeStateInformation = playerSizeStates.find(
				s => s.element == (player.tagName == 'AUDIO-PLAYER' ? player.shadowRoot : player)
			),
			sampleCount = sizeStateInformation.sampleCount;

		switch (e.type) {
			case 'mouseleave':
				cursor.classList.remove('active');
				break;
			case 'click':
			case 'mousemove':
				position = Math.floor((e.clientX - rect.left) / (rect.width / sampleCount));
				if (position > sampleCount - 1) {
					return;
				}

				if (sampleCount == SAMPLE_COUNT) {
					height = player.data[position] * 100;
				} else {
					height = player.data[position * 5] * 100;
				}

				if (height < 0.05) {
					height = 1;
				}

				cursor.setAttribute('x1', position * (100 / sampleCount) + 100 / sampleCount / 2);
				cursor.setAttribute('x2', position * (100 / sampleCount) + 100 / sampleCount / 2);
				cursor.setAttribute('y1', 50 - height / 2);
				cursor.setAttribute('y2', 50 + height / 2);
				cursor.classList.add('active');

				if (e.type == 'click') {
					setTimeout(() => cursor.classList.remove('active'), 100);
				}

				break;
		}
	}

	async function modifyVisualizerResolution(input) {
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

		players.forEach(async p => {
			let rect = p.getBoundingClientRect(),
				element = p.tagName == 'AUDIO-PLAYER' ? p.shadowRoot : p,
				sizeStateInformation = playerSizeStates.find(s => s.element == element);

			if (p.data == null) {
				return;
			}

			if (!sizeStateInformation) {
				sizeStateInformation = { element: element, sampleCount: SAMPLE_COUNT };
				playerSizeStates.push(sizeStateInformation);
			}

			if (rect.width < 600 && sizeStateInformation.sampleCount != REDUCED_SAMPLE_COUNT) {
				let path = await buildVisualizerContent(p.data, true);

				setCustomStyleProperty(element, '--audio-player-sample-count', REDUCED_SAMPLE_COUNT);
				setCustomStyleProperty(element, '--audio-player-stroke-width', 100 / REDUCED_SAMPLE_COUNT);
				element.querySelector('.waveform').setAttribute('d', path);
				sizeStateInformation.sampleCount = REDUCED_SAMPLE_COUNT;
			} else if (rect.width >= 600 && sizeStateInformation.sampleCount != SAMPLE_COUNT) {
				let path = await buildVisualizerContent(p.data);

				setCustomStyleProperty(element, '--audio-player-sample-count', SAMPLE_COUNT);
				setCustomStyleProperty(element, '--audio-player-stroke-width', 100 / SAMPLE_COUNT);
				element.querySelector('.waveform').setAttribute('d', path);
				sizeStateInformation.sampleCount = SAMPLE_COUNT;
			}
		});
	}

	function presentPlayer(player) {
		if (player.tagName == 'AUDIO-PLAYER') {
			player.removeAttribute('loading');
		} else {
			player.classList.remove('loading');
		}

		return Promise.resolve();

		//TODO: Animate the player presentation, possibly through waveform's stroke-dasharray?
	}

	function setCustomStyleProperty(source, name, value) {
		let sheet = source.querySelector('#custom-properties').sheet;

		if (sheet.cssRules.length == 0) {
			sheet.insertRule(':host {}');
		}

		sheet.cssRules[0].style.setProperty(name, value);
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
			sourceVolume = player.source.volume,
			rect = e.currentTarget.getBoundingClientRect(),
			cursor = player.cursor,
			sizeStateInformation = playerSizeStates.find(
				s => s.element == (player.tagName == 'AUDIO-PLAYER' ? player.shadowRoot : player)
			),
			sampleCount = sizeStateInformation.sampleCount,
			offset = player.source.duration / sampleCount / 2,
			position = Math.floor((e.clientX - rect.left) / (rect.width / sampleCount));

		//TODO: Make sure this actually prevents pops when seeking while playing
		if (!player.source.paused) {
			player.source.volume = 0;
		}

		if (position >= sampleCount - 1) {
			player.source.currentTime = player.source.duration;
		} else if (position <= 0) {
			player.source.currentTime = 0;
		} else {
			player.source.currentTime = (position / sampleCount) * player.source.duration + offset;
		}

		if (!player.source.paused) {
			player.source.volume = sourceVolume;
		}

		trackAudioLocation(player.source, player, true);
		highlightSample(e);
	}

	function toggleAudioLocationTracking(e) {
		let a = e.target,
			player = getContainingAudioPlayer(e),
			intervals = playbackIntervals.filter(i => i.player == player);

		//Clear any exiting
		if (intervals.length) {
			intervals.forEach(i => clearInterval(i.interval));
			playbackIntervals = playbackIntervals.filter(i => i.player != player);
		}

		if (e.type == 'play') {
			playbackIntervals.push({
				player: player,
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

	function trackAudioLocation(source, player) {
		let currentPlaybackPosition = Math.min(100, (source.currentTime / source.duration) * 100),
			progressIndicator;

		if (player.tagName == 'AUDIO-PLAYER') {
			progressIndicator = player.shadowRoot.querySelector('.progress-indicator');
		} else {
			progressIndicator = player.querySelector('.progress-indicator');
		}

		progressIndicator.setAttribute('width', currentPlaybackPosition);
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
						source.src = URL.createObjectURL(new Blob([b], { type: 'audio/mp3' }));
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
