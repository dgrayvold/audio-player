export const AudioPlayer = (async function () {
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
		SAMPLE_COUNT = 500,
		REDUCED_SAMPLE_COUNT = 100,
		RESIZE_OBSERVER = window.ResizeObserver == undefined ? null : new ResizeObserver(modifyVisualizerResolution),
		NARROW_LAYOUT = window.matchMedia('(max-width: 800px)'),
		LOADED_DATA = [],
		COMPONENT_STORE = new WeakMap();
	if (RESIZE_OBSERVER == null) {
		window.addEventListener('resize', modifyVisualizerResolution);
	}
	let playbackIntervals = [],
		playerSizeStates = [];
	function buildVisualizerContent(data, reduction = false) {
		return new Promise(res => {
			let path = 'M0,50 ';
			if (reduction) {
				for (let si = 0; si < REDUCED_SAMPLE_COUNT; si++) {
					let index = si * 5,
						height = data[index] * 100,
						sampleWidth = 100 / REDUCED_SAMPLE_COUNT / 2,
						position = si == 0 ? sampleWidth : (100 / REDUCED_SAMPLE_COUNT) * si + sampleWidth;
					if (data[index] < 0.05) {
						height = 1;
					}
					path += `L${position},50 V${50 - height / 2} V${50 + height / 2} V50 `;
				}
			} else {
				data.forEach((s, si) => {
					let height = s * 100,
						sampleWidth = 100 / SAMPLE_COUNT / 2,
						position = si == 0 ? sampleWidth : (100 / SAMPLE_COUNT) * si + sampleWidth;
					if (s < 0.05) {
						height = 1;
					}
					path += `L${position},50 V${50 - height / 2} V${50 + height / 2} V50 `;
				});
			}
			res(path);
		});
	}
	function fadeVolume(source, to, time) {
		return new Promise(res => {
			let volumeStep = source.volume / 100;
			for (let i = 0; i < 100; i++) {
				setTimeout(() => {
					if (i == 99) {
						source.volume = 0;
						res();
					} else {
						source.volume -= volumeStep;
					}
				}, (time / 100) * i);
			}
		});
	}
	async function generateSampleData(buffer) {
		let context = window.AudioContext ? new window.AudioContext() : new window.webkitAudioContext(),
			data;
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
	function getAudioData(url, sampleDataUrl) {
		let loadedContent = LOADED_DATA.find(c => c.url == new URL(url, document.baseURI).href),
			contentToSave = { url: new URL(url, document.baseURI).href },
			fetchedSampleData;
		if (url == undefined) {
			return Promise.reject('Audio Player: No URL supplied for getting audio data');
		}
		if (loadedContent == null && sampleDataUrl) {
			fetchedSampleData = fetch(sampleDataUrl)
				.then(r => (r.ok ? r.json() : null))
				.catch(e => null);
		} else {
			fetchedSampleData = Promise.resolve(null);
		}
		if (url == undefined && loadedContent != null) {
			return Promise.resolve(loadedContent);
		}
		return fetch(url)
			.then(r => r.arrayBuffer())
			.then(b => {
				contentToSave.source = URL.createObjectURL(new Blob([b], { type: 'audio/mp3' }));
				if (sampleDataUrl) {
					return fetchedSampleData.then(d => (d ? d : generateSampleData(b)));
				} else {
					return generateSampleData(b);
				}
			})
			.then(d => {
				contentToSave.data = d;
				LOADED_DATA.push(contentToSave);
				return contentToSave;
			});
	}
	function getAudioPlayers() {
		return Array.from(document.querySelectorAll('audio-player'));
	}
	function getContainingAudioPlayer(event) {
		return event.composedPath().find(p => p instanceof ShadowRoot).host;
	}
	function highlightSample(e) {
		let player = getContainingAudioPlayer(e),
			components = COMPONENT_STORE.get(player),
			data = components.data,
			rect = e.currentTarget.getBoundingClientRect(),
			cursor = components.cursor,
			position,
			height,
			sampleCount = components.sampleCount;
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
					height = data[position] * 100;
				} else {
					height = data[position * 5] * 100;
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
	function keyboardControlPlayback(e) {
		let player = e.target,
			source = player.source;
		switch (e.keyCode) {
			case 27:
				document.activeElement.blur();
				break;
			case 32:
				togglePlayback(player);
				e.preventDefault();
				break;
			case 37:
				if (source.currentTime - 5 < 0) {
					source.currentTime = 0;
					source.pause();
					setPlayButtonState(e);
				} else {
					source.currentTime -= 5;
				}
				setProgressIndicatorPosition(source, player);
				e.preventDefault();
				break;
			case 39:
				if (source.currentTime + 5 > source.duration) {
					source.currentTime = source.duration;
					source.pause();
					setPlayButtonState(e);
				} else {
					source.currentTime += 5;
				}
				setProgressIndicatorPosition(source, player);
				e.preventDefault();
				break;
		}
	}
	async function modifyVisualizerResolution(input) {
		let players;
		if (input.tagName != undefined) {
			players = [input];
		} else if (input.target != undefined && input.target != window) {
			players = [input.target];
		} else {
			players = getAudioPlayers();
		}
		players.forEach(async p => {
			let rect = p.getBoundingClientRect(),
				components = COMPONENT_STORE.get(p),
				currentSampleCount = components.sampleCount,
				currentPlayerData = components.data,
				path,
				sampleCount;
			if (currentPlayerData == null) {
				return;
			} else if (rect.width < 600 && currentSampleCount == REDUCED_SAMPLE_COUNT) {
				return;
			} else if (rect.width >= 600 && currentSampleCount == SAMPLE_COUNT) {
				return;
			}
			sampleCount = rect.width < 600 ? REDUCED_SAMPLE_COUNT : SAMPLE_COUNT;
			path = await buildVisualizerContent(currentPlayerData, rect.width < 600 ? true : false);
			setCustomStyleProperty(p, '--audio-player-sample-count', sampleCount);
			setCustomStyleProperty(p, '--audio-player-stroke-width', 100 / sampleCount);
			components.waveform.setAttribute('d', path);
			components.sampleCount = sampleCount;
		});
	}
	function present(player) {
		player.removeAttribute('loading');
		return new Promise(res => setTimeout(() => res(player), 300));
	}
	function setCustomStyleProperty(player, name, value) {
		let components = COMPONENT_STORE.get(player),
			sheet = components.customPropertiesStyleSheet.sheet;
		if (sheet.cssRules.length == 0) {
			sheet.insertRule(':host {}');
		}
		sheet.cssRules[0].style.setProperty(name, value);
	}
	function setPlayButtonState(e) {
		let player = getContainingAudioPlayer(e),
			source = player.source;
		if (source.paused) {
			player.removeAttribute('playing');
		} else {
			player.setAttribute('playing', '');
		}
	}
	function setProgressIndicatorPosition(input, player) {
		let components, progressIndicator;
		if (input.type && input.type == 'ended') {
			(player = getContainingAudioPlayer(input)),
				(components = COMPONENT_STORE.get(player)),
				(progressIndicator = components.progressIndicator);
			progressIndicator.style.transform = `scaleX(1)`;
		} else {
			let currentPlaybackPosition = Math.min(100, (input.currentTime / input.duration) * 100);
			progressIndicator = COMPONENT_STORE.get(player).progressIndicator;
			if (currentPlaybackPosition > 99.9) {
				currentPlaybackPosition = 100;
			}
			progressIndicator.style.transform = `scaleX(${currentPlaybackPosition / 100})`;
		}
	}
	function setSourceTime(e) {
		let player = getContainingAudioPlayer(e),
			sourceVolume = player.source.volume,
			rect = e.currentTarget.getBoundingClientRect(),
			cursor = COMPONENT_STORE.get(player).cursor,
			sampleCount = COMPONENT_STORE.get(player).sampleCount,
			offset = player.source.duration / sampleCount / 2,
			position = Math.floor((e.clientX - rect.left) / (rect.width / sampleCount));
		if (position >= sampleCount - 1) {
			player.source.currentTime = player.source.duration;
		} else if (position <= 0) {
			player.source.currentTime = 0;
		} else {
			player.source.currentTime = (position / sampleCount) * player.source.duration + offset;
		}
		setProgressIndicatorPosition(player.source, player, true);
		highlightSample(e);
	}
	function toggleAudioLocationTracking(e) {
		let a = e.target,
			player = getContainingAudioPlayer(e),
			intervals = playbackIntervals.filter(i => i.player == player);
		if (intervals.length) {
			intervals.forEach(i => clearInterval(i.interval));
			playbackIntervals = playbackIntervals.filter(i => i.player != player);
		}
		if (e.type != 'play') {
			return;
		}
		playbackIntervals.push({ player: player, interval: setInterval(setProgressIndicatorPosition, 50, a, player) });
	}
	function togglePlayback(input) {
		let player = input.type ? getContainingAudioPlayer(input) : input;
		player.source.paused ? player.source.play() : player.source.pause();
	}
	class AudioPlayer extends HTMLElement {
		constructor() {
			super();
			const shadow = this.attachShadow({ mode: 'open' }),
				element = ELEMENT.cloneNode(true);
			shadow.appendChild(element);
			this.shadowRoot.prepend(STYLING.cloneNode(true));
			COMPONENT_STORE.set(this, {
				cursor: this.shadowRoot.querySelector('.cursor'),
				customPropertiesStyleSheet: this.shadowRoot.querySelector('#custom-properties'),
				data: null,
				playButton: this.shadowRoot.querySelector('.play-button'),
				progressIndicator: this.shadowRoot.querySelector('.progress-indicator'),
				visualizer: this.shadowRoot.querySelector('.visualizer'),
				waveform: this.shadowRoot.querySelector('.waveform'),
				preloadQueue: [],
				sampleCount: SAMPLE_COUNT,
			});
		}
		static get observedAttributes() {
			return ['loading', 'playing', 'accent', 'background', 'indicator'];
		}
		attributeChangedCallback(attr, o, n) {
			if (['accent', 'background', 'indicator'].includes(attr)) {
				if (o != n) {
					this[attr] = n;
				}
			} else if (attr == 'playing') {
				if (o == n) {
					return;
				}
				if (!this.hasAttribute('loading') && this.isConnected) {
					if (['', true].includes(n)) {
						this.setAttribute('playing', '');
						this.source.play();
					} else {
						this.removeAttribute('playing');
						this.source.pause();
					}
				} else {
					this.removeAttribute('playing');
				}
			}
		}
		connectedCallback() {
			let components = COMPONENT_STORE.get(this);
			if (components.awaitingAttributes) {
				Object.keys(components.awaitingAttributes).forEach(a => (this[a] = components.awaitingAttributes[a]));
				delete components.awaitingAttributes;
			}
			if (components.data == null) {
				this.tabIndex = 0;
				this.setAttribute('loading', '');
			}
			let fragment = document.createDocumentFragment(),
				audio = document.createElement('audio');
			fragment.appendChild(audio);
			this.shadowRoot.appendChild(audio);
			this.source = audio;
			fragment = null;
			if (components.data == null && components.preloadQueue.length > 0) {
				this.load();
			}
		}
		set accent(i) {
			let components = COMPONENT_STORE.get(this);
			this.setAttribute('accent', i);
			if (this.isConnected) {
				setCustomStyleProperty(this, '--audio-player-accent-color', i);
			} else {
				if (!components.awaitingAttributes) {
					components.awaitingAttributes = {};
				}
				components.awaitingAttributes.accent = i;
			}
		}
		set background(i) {
			let components = COMPONENT_STORE.get(this);
			this.setAttribute('background', i);
			if (this.isConnected) {
				setCustomStyleProperty(this, '--audio-player-background-color', i);
			} else {
				if (!components.awaitingAttributes) {
					components.awaitingAttributes = {};
				}
				components.awaitingAttributes.background = i;
			}
		}
		set indicator(i) {
			let components = COMPONENT_STORE.get(this);
			this.setAttribute('indicator', i);
			if (this.isConnected) {
				setCustomStyleProperty(this, '--audio-player-indicator-color', i);
			} else {
				if (!components.awaitingAttributes) {
					components.awaitingAttributes = {};
				}
				components.awaitingAttributes.indicator = i;
			}
		}
		toReplace(source) {
			return this.replace(source);
		}
		replace(source) {
			let components = COMPONENT_STORE.get(this),
				visualizer = components.visualizer,
				waveform = components.waveform,
				cursor = components.cursor,
				playButton = components.playButton,
				sampleDataUrl = source.dataset.sampleSource ? source.dataset.sampleSource : null;
			source.after(this);
			this.shadowRoot.replaceChild(source, this.source);
			this.source = source;
			this.setAttribute('aria-role', 'region');
			setCustomStyleProperty(this, '--audio-player-sample-count', SAMPLE_COUNT);
			setCustomStyleProperty(this, '--audio-player-stroke-width', 100 / SAMPLE_COUNT);
			return this.load(source.src, sampleDataUrl);
		}
		async load(url, sampleDataUrl) {
			let components = COMPONENT_STORE.get(this),
				queue = components.preloadQueue;
			if (!this.isConnected) {
				let error =
					'Audio Player: Use audio-player.preload() for audio-player elements not yet connected to the DOM';
				return Promise.reject(error);
			} else if (!url && queue.length == 0) {
				return Promise.reject(
					'Audio Player: Abandoned load due to no audio file supplied and nothing in preload queue'
				);
			}
			let currentVolume = this.source.volume,
				wasPlaying = !this.source.paused,
				data = queue.length > 0 ? queue.shift() : await getAudioData(url, sampleDataUrl);
			if (data == null) {
				return Promise.reject('Audio Player: Could not get sample data');
			}
			this.setAttribute('loading', '');
			this.setAttribute('aria-role', 'region');
			setCustomStyleProperty(this, '--audio-player-sample-count', components.sampleCount);
			setCustomStyleProperty(this, '--audio-player-stroke-width', 100 / components.sampleCount);
			['mouseleave', 'mousemove', 'touchmove', 'touchend'].forEach(e => {
				components.visualizer.addEventListener(e, highlightSample);
			});
			['click'].forEach(e => {
				components.playButton.addEventListener(e, togglePlayback);
			});
			['play', 'pause', 'ended'].forEach(e => {
				this.source.addEventListener(e, toggleAudioLocationTracking);
				this.source.addEventListener(e, setPlayButtonState);
			});
			this.addEventListener('keydown', keyboardControlPlayback);
			this.source.addEventListener('ended', setProgressIndicatorPosition);
			components.visualizer.addEventListener('click', setSourceTime);
			if (RESIZE_OBSERVER != null) {
				RESIZE_OBSERVER.observe(this);
			}
			if (this.source.src != '') {
				await fadeVolume(this.source, 0, 300);
			}
			if (!this.source.paused) {
				await new Promise(res => {
					this.source.addEventListener('pause', () => res(), { once: true });
					this.source.pause();
				});
			}
			this.source.src = data.source;
			components.data = data.data;
			return buildVisualizerContent(data.data)
				.then(p => {
					components.waveform.setAttribute('d', p);
					modifyVisualizerResolution(this.shadowRoot);
					return new Promise(res => {
						this.source.addEventListener('canplaythrough', () => res(), { once: true });
						this.source.load();
					});
				})
				.then(() => {
					this.source.volume = currentVolume;
					setProgressIndicatorPosition(this.source, this, false);
					return present(this);
				})
				.then(p => {
					if (wasPlaying) {
						this.source.play();
					}
					return p;
				});
		}
		preload(url, sampleDataUrl) {
			let components = COMPONENT_STORE.get(this),
				queue = components.preloadQueue;
			return getAudioData(url, sampleDataUrl).then(data => {
				if (!data) {
					return Promise.reject('Audio Player: could not get audio data, likely due to missing file');
				} else {
					queue.push(data);
					return this;
				}
			});
		}
		configure({ accent = null, background = null, indicator = null, compact = null } = {}) {
			if (accent != null) {
				this.setAttribute('accent', accent);
			}
			if (background != null) {
				this.setAttribute('background', background);
			}
			if (indicator != null) {
				this.setAttribute('indicator', indicator);
			}
			if (compact != null) {
				this.setAttribute('compact', compact);
			}
			return this;
		}
	}
	customElements.define('audio-player', AudioPlayer);
})();
