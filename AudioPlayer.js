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
		SAMPLE_COUNTS = new Proxy(
			{ REGULAR: 500, REDUCED: 100 },
			{
				get(target, property) {
					if (property in target) {
						return target[property];
					} else {
						throw new Error(`SAMPLE_COUNTS ENUM: '${property}' is not defined`);
					}
				},
			}
		),
		RESIZE_OBSERVER = window.ResizeObserver == undefined ? null : new ResizeObserver(modifyVisualizerResolution),
		NARROW_LAYOUT = window.matchMedia('(max-width: 800px)'),
		LOADED_DATA = [],
		PLAYBACK_INTERVALS = [],
		COMPONENT_STORE = new WeakMap(),
		SOURCE_STATES = new Proxy(
			{ QUEUED: 'queued', LOADED: 'loaded', ACTIVE: 'active' },
			{
				get(target, property) {
					if (property in target) {
						return target[property];
					} else {
						throw new Error(`SOURCE_STATES ENUM: '${property}' is not defined`);
					}
				},
			}
		),
		UTILITY_FUNCTIONS = {
			calculateGrayLuminance: color => {
				let luminances = { r: (76.5 * color.r) / 255, g: (150.45 * color.g) / 255, b: (28.05 * color.b) / 255 };
				return luminances.r + luminances.g + luminances.b;
			},
			getColorAsRgba: color => {
				let c = document.createElement('canvas'),
					ctx = c.getContext('2d'),
					data;
				c.height = 1;
				c.width = 1;
				ctx.fillStyle = color;
				ctx.fillRect(0, 0, 1, 1);
				data = ctx.getImageData(0, 0, 1, 1).data;
				return { r: data[0], g: data[1], b: data[2], a: data[3] / 255 };
			},
		};
	if (RESIZE_OBSERVER == null) {
		window.addEventListener('resize', modifyVisualizerResolution);
	}
	function buildPlaylistContent(player) {
		let components = COMPONENT_STORE.get(player),
			playlist = components.playlist,
			queue = components.queue;
		if (queue.length == 1 && [false, 'auto'].includes(components.showPlaylist)) {
			playlist.classList.remove('active');
		} else if (components.showPlaylist !== false) {
			let fragment = document.createDocumentFragment();
			playlist.classList.add('active');
			queue.forEach(s => {
				let source = document.createElement('li'),
					creatorText = document.createElement('span');
				creatorText.classList.add('creator');
				source.classList.add('source');
				source.addEventListener('click', pointerControlPlayer);
				source.dataset.url = s.url;
				source.textContent = s.title;
				creatorText.textContent = s.creator ? s.creator : '';
				if (s.state == SOURCE_STATES.ACTIVE) {
					source.classList.add('active');
				}
				source.appendChild(creatorText);
				fragment.append(source);
			});
			playlist.innerHTML = '';
			playlist.append(fragment);
		} else {
			playlist.classList.remove('active');
		}
		return Promise.resolve(player);
	}
	function buildVisualizerContent(data, reduction = false) {
		return new Promise(res => {
			let path = 'M0,50 ';
			if (reduction) {
				for (let si = 0; si < SAMPLE_COUNTS.REDUCED; si++) {
					let index = si * 5,
						height = data[index] * 100,
						sampleWidth = 100 / SAMPLE_COUNTS.REDUCED / 2,
						position = si == 0 ? sampleWidth : (100 / SAMPLE_COUNTS.REDUCED) * si + sampleWidth;
					if (data[index] < 0.05) {
						height = 1;
					}
					path += `L${position},50 V${50 - height / 2} V${50 + height / 2} V50 `;
				}
			} else {
				data.forEach((s, si) => {
					let height = s * 100,
						sampleWidth = 100 / SAMPLE_COUNTS.REGULAR / 2,
						position = si == 0 ? sampleWidth : (100 / SAMPLE_COUNTS.REGULAR) * si + sampleWidth;
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
	function generateIndicatorColor(color) {
		let rgbaColor = UTILITY_FUNCTIONS.getColorAsRgba(color),
			colorLuminance = UTILITY_FUNCTIONS.calculateGrayLuminance(rgbaColor),
			newColor;
		if (rgbaColor.a == 1) {
			let opacity = colorLuminance < 128 ? 0.5 : 0.25;
			newColor = { r: rgbaColor.r, g: rgbaColor.g, b: rgbaColor.b, a: opacity };
		} else if (colorLuminance < 64) {
			newColor = {
				r: Math.min(rgbaColor.r + 150, 255),
				g: Math.min(rgbaColor.g + 150, 255),
				b: Math.min(rgbaColor.b + 150, 255),
				a: rgbaColor.a,
			};
		} else if (colorLuminance < 128) {
			newColor = {
				r: Math.min(rgbaColor.r + 100, 255),
				g: Math.min(rgbaColor.g + 100, 255),
				b: Math.min(rgbaColor.b + 100, 255),
				a: rgbaColor.a,
			};
		} else if (colorLuminance < 192) {
			newColor = {
				r: Math.max(rgbaColor.r - 100, 0),
				g: Math.max(rgbaColor.g - 100, 0),
				b: Math.max(rgbaColor.b - 100, 0),
				a: rgbaColor.a,
			};
		} else {
			newColor = {
				r: Math.max(rgbaColor.r - 200, 0),
				g: Math.max(rgbaColor.g - 200, 0),
				b: Math.max(rgbaColor.b - 200, 0),
				a: rgbaColor.a / 255,
			};
		}
		return `rgba(${newColor.r},${newColor.g},${newColor.b},${newColor.a})`;
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
			blockSize = Math.floor(d.length / SAMPLE_COUNTS.REGULAR),
			samples = new Array(SAMPLE_COUNTS.REGULAR).fill(null).map((s, si) => {
				return Math.abs(
					d.slice(si * blockSize, (si + 1) * blockSize).reduce((a, c) => a + Math.abs(c)) /
						SAMPLE_COUNTS.REGULAR
				);
			}),
			sampleMultiplier = Math.pow(Math.max(...samples), -1),
			normalizedSamples = samples.map(s => s * sampleMultiplier);
		return normalizedSamples;
	}
	function generateSourceMetadata({ metadata = null, url = null } = {}) {
		let sourceMetadata = { title: null, creator: null },
			absoluteUrl = new URL(url, document.baseURI).href;
		if (metadata) {
			sourceMetadata.creator = metadata.creator;
			if (metadata.title) {
				sourceMetadata.title = metadata.title;
			} else {
				let file = decodeURI(absoluteUrl).split('/').pop(),
					basename = file.substring(0, file.lastIndexOf('.'));
				if (basename == '') {
					sourceMetadata.title = file;
				} else {
					sourceMetadata.title = basename
						.split(/[\s_]/g)
						.map(w => w[0].toUpperCase() + w.substr(1))
						.join(' ');
				}
			}
		} else if (url) {
			let file = decodeURI(absoluteUrl).split('/').pop(),
				basename = file.substring(0, file.lastIndexOf('.'));
			if (basename == '') {
				sourceMetadata.title = file;
			} else {
				sourceMetadata.title = basename
					.split(/[\s_]/g)
					.map(w => w[0].toUpperCase() + w.substr(1))
					.join(' ');
			}
			sourceMetadata.creator = '';
		}
		return sourceMetadata;
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
				contentToSave.state = SOURCE_STATES.LOADED;
				if (sampleDataUrl && fetchedSampleData) {
					contentToSave.sampleDataUrl = new URL(sampleDataUrl, document.baseURI).href;
				}
				LOADED_DATA.push(contentToSave);
				return contentToSave;
			});
	}
	function getContainingAudioPlayer(e) {
		let path = e.composedPath();
		if (path[0].tagName && path[0].tagName == 'AUDIO-PLAYER') {
			return path[0];
		} else {
			return path.find(p => p.tagName == 'AUDIO-PLAYER' || p instanceof ShadowRoot).host;
		}
	}
	function handleAutoLoading(e) {
		let source = e.target;
		if (source.duration - source.currentTime < 15 || source.duration < 15) {
			let player = getContainingAudioPlayer(e),
				queue = COMPONENT_STORE.get(player).queue,
				currentSourceIndex = queue.findIndex(s => s.state == SOURCE_STATES.ACTIVE),
				nextSource = queue.find((s, si) => si > currentSourceIndex && s.state == SOURCE_STATES.QUEUED);
			if (nextSource) {
				player.preload();
			}
			source.removeEventListener('timeupdate', handleAutoLoading);
		}
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
				if (position > sampleCount - 1 || position < 0) {
					return;
				}
				if (sampleCount == SAMPLE_COUNTS.REGULAR) {
					height = data[position] * 100;
				} else {
					height = data[position * 5] * 100;
				}
				if (height < 0.05) {
					height = 1;
				} else if (Object.is(height, NaN)) {
					height = 50;
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
	function keyboardControlPlayer(e) {
		let player = e.target,
			source = player.source,
			queue = COMPONENT_STORE.get(player).queue,
			playlist,
			sources,
			matchingSource,
			label;
		switch (e.keyCode) {
			case 13:
				e.preventDefault();
				if (queue.length == 1) {
					return;
				}
				let highlightedSource = COMPONENT_STORE.get(player).playlist.querySelector('.highlighted');
				if (!highlightedSource || highlightedSource.classList.contains('active')) {
					return;
				}
				player.load({ url: highlightedSource.dataset.url });
				break;
			case 27:
				document.activeElement.blur();
				COMPONENT_STORE.get(player)
					.playlist.querySelectorAll('.highlighted')
					.forEach(s => s.classList.remove('highlighted'));
				break;
			case 32:
				if (e.metaKey || e.shiftKey || e.altKey || e.ctrlKey) {
					return;
				}
				togglePlayback(player);
				e.preventDefault();
				break;
			case 37:
				if (source.currentTime - 5 < 0) {
					source.currentTime = 0;
					source.pause();
					setPlayState(e);
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
					setPlayState(e);
				} else {
					source.currentTime += 5;
				}
				setProgressIndicatorPosition(source, player);
				e.preventDefault();
				break;
			case 38:
			case 40:
				e.preventDefault();
				if (queue.length == 1 || COMPONENT_STORE.get(player).showPlaylist === false) {
					return;
				}
				playlist = COMPONENT_STORE.get(player).playlist;
				sources = Array.from(playlist.querySelectorAll('.source'));
				matchingSource = sources.find(s => s.classList.contains('highlighted'));
				if (matchingSource == null) {
					removePlaylistHighlighting(e);
					sources[0].classList.add('highlighted');
					setPlayerDescription(player);
					return;
				}
				if (e.keyCode == 38) {
					if (matchingSource == sources[0]) {
						return;
					} else {
						removePlaylistHighlighting(e);
						sources[sources.indexOf(matchingSource) - 1].classList.add('highlighted');
					}
				} else {
					if (sources.indexOf(matchingSource) == sources.length - 1) {
						return;
					} else {
						removePlaylistHighlighting(e);
						sources[sources.indexOf(matchingSource) + 1].classList.add('highlighted');
					}
				}
				setPlayerDescription(player);
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
			players = Array.from(document.querySelectorAll('audio-player'));
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
			} else if (rect.width < 600 && currentSampleCount == SAMPLE_COUNTS.REDUCED) {
				return;
			} else if (rect.width >= 600 && currentSampleCount == SAMPLE_COUNTS.REGULAR) {
				return;
			}
			sampleCount = rect.width < 600 ? SAMPLE_COUNTS.REDUCED : SAMPLE_COUNTS.REGULAR;
			path = await buildVisualizerContent(currentPlayerData, rect.width < 600 ? true : false);
			setCustomStyleProperty(p, '--audio-player-sample-count', sampleCount);
			setCustomStyleProperty(p, '--audio-player-stroke-width', 100 / sampleCount);
			components.waveform.setAttribute('d', path);
			components.sampleCount = sampleCount;
		});
	}
	function pointerControlPlayer(e) {
		if (e.currentTarget.classList.contains('source')) {
			let playlist = e.target.parentElement,
				selectedSource = Array.from(playlist.querySelectorAll('.source')).find(s => s.contains(e.target));
			if (selectedSource == null || selectedSource.classList.contains('active')) {
				return;
			}
			getContainingAudioPlayer(e).load({ url: selectedSource.dataset.url });
		} else if (e.currentTarget.classList.contains('visualizer')) {
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
			setProgressIndicatorPosition(player.source, player);
			highlightSample(e);
		}
	}
	function present(player) {
		player.removeAttribute('loading');
		setPlayerDescription(player);
		return new Promise(res => setTimeout(() => res(player), 300));
	}
	function removePlaylistHighlighting(e) {
		let sources = COMPONENT_STORE.get(e.target).playlist.querySelectorAll('.highlighted');
		sources.forEach(h => {
			h.classList.remove('highlighted');
		});
		setPlayerDescription(e.target);
		return new Promise(res => setTimeout(res), sources.length > 0 ? 300 : 0);
	}
	function setCustomStyleProperty(player, name, value) {
		let components = COMPONENT_STORE.get(player),
			sheet = components.customPropertiesStyleSheet.sheet;
		if (sheet.cssRules.length == 0) {
			sheet.insertRule(':host {}');
		}
		sheet.cssRules[0].style.setProperty(name, value);
	}
	function setPlayerDescription(player) {
		let components = COMPONENT_STORE.get(player),
			queue = components.queue,
			description = components.description,
			text = '',
			activeSource = queue.find(s => s.state == SOURCE_STATES.ACTIVE),
			highlightedSource = components.playlist.querySelector('.highlighted');
		if (player.hasAttribute('loading')) {
			description.textContent = 'Loading source';
			return;
		}
		if (highlightedSource) {
			text += 'Highlighted source: ';
			text += ' by ' + highlightedSource.textContent;
			text += '. ';
		}
		if (activeSource) {
			text += 'Active source: ';
			text += activeSource.title + (activeSource.creator ? ' by ' + activeSource.creator : '');
			text += '. ';
		}
		if (queue.length > 1 && components.showPlaylist !== false) {
			text += `${queue.length} sources available. `;
		}
		if (description.textContent != text) {
			description.textContent = text;
		}
		text += 'Use space to toggle playback';
		if (queue.length == 1 || components.showPlaylist === false) {
			text += ' and left and right arrow keys to seek active source.';
		} else {
			text +=
				', left and right arrow keys to seek active source, up and down arrow keys to ' +
				'move between available sources, and enter to choose new source';
		}
		text = 'Audio Player. ' + text;
		if (player.getAttribute('aria-label') != text) {
			player.setAttribute('aria-label', text);
		}
		return Promise.resolve(player);
	}
	function setPlayState(e) {
		let player = getContainingAudioPlayer(e),
			components = COMPONENT_STORE.get(player),
			playButton = components.playButton,
			source = player.source;
		if (source.paused) {
			player.removeAttribute('playing');
			playButton.setAttribute('aria-label', 'Pause');
		} else {
			player.setAttribute('playing', '');
			playButton.setAttribute('aria-label', 'Play');
		}
		if (e.type == 'ended' && components.autoAdvance && components.queue.length > 1) {
			let currentSourceIndex = components.queue.findIndex(s => s.source == source.src);
			if (currentSourceIndex != components.queue.length - 1) {
				player.load().then(() => player.source.play());
			}
		}
	}
	function setProgressIndicatorPosition(input, player) {
		let progressIndicator;
		if (input.type && input.type == 'ended') {
			player = getContainingAudioPlayer(input);
			progressIndicator = COMPONENT_STORE.get(player).progressIndicator;
			progressIndicator.style.transform = `scaleX(1)`;
		} else {
			let currentPlaybackPosition = Math.min(100, (input.currentTime / input.duration) * 100),
				components = COMPONENT_STORE.get(player);
			progressIndicator = components.progressIndicator;
			components.visualizer.setAttribute('aria-valuemin', 0);
			components.visualizer.setAttribute('aria-valuemax', input.duration);
			components.visualizer.setAttribute('aria-valuenow', input.currentTime);
			progressIndicator = COMPONENT_STORE.get(player).progressIndicator;
			if (currentPlaybackPosition > 99.9) {
				currentPlaybackPosition = 100;
			}
			progressIndicator.style.transform = `scaleX(${currentPlaybackPosition / 100})`;
		}
	}
	function toggleAudioLocationTracking(e) {
		let a = e.target,
			player = getContainingAudioPlayer(e),
			intervals = PLAYBACK_INTERVALS.filter(i => i.player == player);
		if (intervals.length) {
			intervals.forEach(i => clearInterval(i.interval));
			PLAYBACK_INTERVALS.forEach((i, ii) => {
				if (intervals.includes(i)) {
					PLAYBACK_INTERVALS.splice(ii, 1);
				}
			});
		}
		if (e.type != 'play') {
			return;
		}
		PLAYBACK_INTERVALS.push({ player: player, interval: setInterval(setProgressIndicatorPosition, 50, a, player) });
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
				playlist: this.shadowRoot.querySelector('.playlist'),
				progressIndicator: this.shadowRoot.querySelector('.progress-indicator'),
				visualizer: this.shadowRoot.querySelector('.visualizer'),
				waveform: this.shadowRoot.querySelector('.waveform'),
				description: this.shadowRoot.querySelector('#audio-player-description'),
				customStyling: { accent: null, background: null, indicator: null, cursor: null },
				queue: [],
				sampleCount: SAMPLE_COUNTS.REGULAR,
				autoAdvance: true,
				autoLoad: true,
				showPlaylist: 'auto',
			});
		}
		static get observedAttributes() {
			return ['loading', 'playing'];
		}
		attributeChangedCallback(attr, o, n) {
			if (attr == 'playing') {
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
			this.setAttribute('role', 'region');
			this.setAttribute('aria-label', 'Audio Player');
			setCustomStyleProperty(this, '--audio-player-sample-count', components.sampleCount);
			setCustomStyleProperty(this, '--audio-player-stroke-width', 100 / components.sampleCount);
			['mouseleave', 'mousemove', 'touchmove', 'touchend'].forEach(e => {
				components.visualizer.addEventListener(e, highlightSample);
			});
			['play', 'pause', 'ended'].forEach(e => {
				this.source.addEventListener(e, toggleAudioLocationTracking);
				this.source.addEventListener(e, setPlayState);
			});
			this.addEventListener('blur', removePlaylistHighlighting);
			this.addEventListener('keydown', keyboardControlPlayer);
			this.source.addEventListener('ended', setProgressIndicatorPosition);
			components.playButton.addEventListener('click', togglePlayback);
			components.visualizer.addEventListener('click', pointerControlPlayer);
			if (RESIZE_OBSERVER != null) {
				RESIZE_OBSERVER.observe(this);
			}
			setPlayerDescription(this);
			if (components.data == null && components.queue.length > 0) {
				this.load();
			}
		}
		get accent() {
			return COMPONENT_STORE.get(this).customStyling.accent;
		}
		get background() {
			return COMPONENT_STORE.get(this).customStyling.background;
		}
		get indicator() {
			return COMPONENT_STORE.get(this).customStyling.indicator;
		}
		get configuration() {
			let components = COMPONENT_STORE.get(this);
			return {
				autoAdvance: components.autoAdvance,
				autoLoad: components.autoLoad,
				showPlaylist: components.showPlaylist,
				customStyling: {
					accent: components.customStyling.accent,
					background: components.customStyling.background,
					indicator: components.customStyling.indicator,
					compact: this.getAttribute('compact') == 'true',
				},
			};
		}
		set accent(i) {
			let components = COMPONENT_STORE.get(this),
				indicatorColor = components.customStyling.indicator,
				rgbaColor = UTILITY_FUNCTIONS.getColorAsRgba(i),
				luminance = UTILITY_FUNCTIONS.calculateGrayLuminance(rgbaColor),
				cursorColor = luminance > 128 ? 'black' : 'white';
			components.customStyling.accent = i;
			components.customStyling.cursor = cursorColor;
			if (this.isConnected) {
				setCustomStyleProperty(this, '--audio-player-accent-color', i);
				setCustomStyleProperty(this, '--audio-player-cursor-color', cursorColor);
				if (indicatorColor == null) {
					setCustomStyleProperty(this, '--audio-player-indicator-color', generateIndicatorColor(i));
				}
			} else {
				if (!components.awaitingAttributes) {
					components.awaitingAttributes = {};
				}
				components.awaitingAttributes.accent = i;
			}
		}
		set background(i) {
			let components = COMPONENT_STORE.get(this),
				rgbaColor = UTILITY_FUNCTIONS.getColorAsRgba(i),
				luminance = UTILITY_FUNCTIONS.calculateGrayLuminance(rgbaColor),
				contrastColor = luminance > 128 ? 'black' : 'white',
				shadeColor = luminance > 128 ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.3)';
			components.customStyling.background = i;
			if (this.isConnected) {
				if (rgbaColor.a == 0 || i == 'none') {
					setCustomStyleProperty(this, '--audio-player-background-color', i);
					setCustomStyleProperty(this, '--audio-player-background-contrast-color', 'white');
					setCustomStyleProperty(this, '--audio-player-background-shade-color', 'rgb(85,85,85,0.4)');
				} else {
					setCustomStyleProperty(this, '--audio-player-background-color', i);
					setCustomStyleProperty(this, '--audio-player-background-contrast-color', contrastColor);
					setCustomStyleProperty(this, '--audio-player-background-shade-color', shadeColor);
				}
			} else {
				if (!components.awaitingAttributes) {
					components.awaitingAttributes = {};
				}
				components.awaitingAttributes.background = i;
			}
		}
		set indicator(i) {
			let components = COMPONENT_STORE.get(this);
			components.customStyling.indicator = i;
			if (this.isConnected) {
				setCustomStyleProperty(this, '--audio-player-indicator-color', i);
			} else {
				if (!components.awaitingAttributes) {
					components.awaitingAttributes = {};
				}
				components.awaitingAttributes.indicator = i;
			}
		}
		toReplace(audioElements) {
			return this.replace(audioElements);
		}
		replace(audioElements) {
			if (COMPONENT_STORE.get(this).queue.length > 0) {
				return Promise.reject('Audio Player: replace() can only initialize audio player');
			}
			if (NodeList.prototype.isPrototypeOf(audioElements)) {
				audioElements = Array.from(audioElements);
			} else if (!Array.isArray(audioElements)) {
				audioElements = [audioElements];
			}
			let playlist = [],
				firstSource;
			audioElements.forEach((source, sourceIndex) => {
				let sourceToAdd = {
					url: new URL(source.src, document.baseURI).href,
					sampleDataUrl: source.dataset.sampleSource ? source.dataset.sampleSource : null,
				};
				if (source.dataset.title) {
					sourceToAdd.metadata = { title: source.dataset.title, creator: source.dataset.creator };
				} else {
					sourceToAdd.metadata = null;
				}
				playlist.push(sourceToAdd);
				if (sourceIndex != 0) {
					source.parentElement.removeChild(source);
				}
			});
			audioElements[0].after(this);
			audioElements[0].parentElement.removeChild(audioElements[0]);
			return this.queue(playlist).then(() => this.load());
		}
		async load({ url = null, sampleDataUrl = null, metadata } = {}) {
			if (!this.isConnected) {
				let error =
					'Audio Player: Use audio-player.preload() for audio-player elements not yet connected to the DOM';
				return Promise.reject(error);
			}
			let components = COMPONENT_STORE.get(this),
				queue = components.queue,
				currentVolume = this.source.volume,
				wasPlaying = !this.source.paused;
			this.setAttribute('loading', '');
			setPlayerDescription(this);
			if (this.source.src != '') {
				await fadeVolume(this.source, 0, 300);
			}
			if (!this.source.paused) {
				await new Promise(res => {
					this.source.addEventListener('pause', () => res(), { once: true });
					this.source.pause();
				});
			}
			let absoluteUrl = url ? new URL(url, document.baseURI).href : null,
				matchingSource = queue.length == 0 ? null : queue.find(s => s.url == absoluteUrl),
				data,
				sourceMetadata = generateSourceMetadata({ metadata: metadata, url: absoluteUrl });
			if (url && matchingSource) {
				if (queue.length > 1) {
					queue.find(s => s.state == SOURCE_STATES.ACTIVE).state = SOURCE_STATES.LOADED;
				}
				if (matchingSource.state == SOURCE_STATES.QUEUED) {
					data = await getAudioData(matchingSource.url, matchingSource.sampleDataUrl);
					if (data == null) {
						this.removeAttribute('loading');
						setPlayerDescription(this);
						return Promise.reject('Audio Player: could not get audio data');
					}
					data.state = SOURCE_STATES.ACTIVE;
					data.title = matchingSource.title;
					data.creator = matchingSource.creator;
					queue[queue.indexOf(matchingSource)] = data;
				} else {
					matchingSource.state = SOURCE_STATES.ACTIVE;
					data = matchingSource;
				}
			} else if (url) {
				data = await getAudioData(url, sampleDataUrl);
				if (data == null) {
					this.removeAttribute('loading');
					setPlayerDescription(this);
					return Promise.reject('Audio Player: could not get audio data');
				}
				data.state = SOURCE_STATES.ACTIVE;
				data.title = sourceMetadata.title;
				data.creator = sourceMetadata.creator;
				if (queue.length > 0) {
					queue.forEach(s => (s.state = s.state == SOURCE_STATES.ACTIVE ? SOURCE_STATES.LOADED : s.state));
				}
				queue.unshift(data);
			} else {
				if (queue.length == 0) {
					let error = 'Audio Player: Abandoned load due to no audio file supplied and nothing in queue';
					this.removeAttribute('loading');
					setPlayerDescription(this);
					return Promise.reject(error);
				}
				if (queue.length == 1) {
					if (queue[0].state == SOURCE_STATES.ACTIVE) {
						return Promise.resolve();
					} else {
						let currentSource = queue[0];
						if (currentSource.state == SOURCE_STATES.QUEUED) {
							data = await getAudioData(currentSource.url, currentSource.sampleDataUrl);
							if (data == null) {
								this.removeAttribute('loading');
								setPlayerDescription(this);
								return Promise.reject('Audio Player: could not get audio data');
							}
							data.state = SOURCE_STATES.ACTIVE;
							data.title = currentSource.title ? currentSource.title : sourceMetadata.title;
							data.creator = currentSource.creator ? currentSource.creator : sourceMetadata.creator;
							queue.splice(0, 1, data);
						} else {
							data = queue[0];
							data.state = SOURCE_STATES.ACTIVE;
						}
					}
				} else {
					let currentSource = queue.find(s => s.state == SOURCE_STATES.ACTIVE),
						currentSourceIndex = currentSource ? queue.indexOf(currentSource) : null;
					queue.forEach(s => (s.state = s.state == SOURCE_STATES.ACTIVE ? SOURCE_STATES.LOADED : s.state));
					if (currentSource == undefined) {
						currentSource = queue[0];
						if (currentSource.state == SOURCE_STATES.QUEUED) {
							data = await getAudioData(currentSource.url, currentSource.sampleDataUrl);
							if (data == null) {
								this.removeAttribute('loading');
								setPlayerDescription(this);
								return Promise.reject('Audio Player: could not get audio data');
							}
							data.state = SOURCE_STATES.ACTIVE;
							data.title = currentSource.title ? currentSource.title : sourceMetadata.title;
							data.creator = currentSource.creator ? currentSource.creator : sourceMetadata.creator;
							queue.splice(0, 1, data);
						} else {
							data = queue[0];
							data.state = SOURCE_STATES.ACTIVE;
						}
					} else if (currentSourceIndex == queue.length - 1) {
						let error = 'Audio Player: No more sources available';
						this.removeAttribute('loading');
						setPlayerDescription(this);
						return Promise.reject(error);
					} else {
						let nextSource = queue[currentSourceIndex + 1];
						if (nextSource.state == SOURCE_STATES.QUEUED) {
							data = await getAudioData(nextSource.url, nextSource.sampleDataUrl);
							if (data == null) {
								this.removeAttribute('loading');
								setPlayerDescription(this);
								return Promise.reject('Audio Player: could not get audio data');
							}
							data.title = nextSource.title;
							data.creator = nextSource.creator;
							data.state = SOURCE_STATES.ACTIVE;
							queue.splice(currentSourceIndex + 1, 1, data);
						} else {
							data = nextSource;
							data.state = SOURCE_STATES.ACTIVE;
						}
					}
				}
			}
			if (data == null) {
				this.removeAttribute('loading');
				setPlayerDescription(this);
				return Promise.reject('Audio Player: Could not get sample data');
			}
			setPlayerDescription(this);
			if (components.autoLoad) {
				this.source.addEventListener('timeupdate', handleAutoLoading);
			}
			this.source.src = data.source;
			components.data = data.data;
			buildPlaylistContent(this);
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
					setProgressIndicatorPosition(this.source, this);
					if (wasPlaying) {
						this.source.play();
					}
					return present(this);
				});
		}
		preload({ url, sampleDataUrl, metadata } = {}) {
			let absoluteUrl = url ? new URL(url, document.baseURI).href : null,
				components = COMPONENT_STORE.get(this),
				queue = components.queue;
			if (url == undefined) {
				if (queue.length == 0) {
					return Promise.reject('Audio Player: No preload URL set and nothing in queue');
				}
				let currentSourceIndex = queue.findIndex(s => s.state == SOURCE_STATES.ACTIVE),
					nextSource = queue.find((s, si) => {
						return si > currentSourceIndex && s.state == SOURCE_STATES.QUEUED;
					}),
					nextSourceIndex = queue.indexOf(nextSource);
				if (nextSource == null) {
					return Promise.reject('Audio Player: No preload URL set and no later sources available to preload');
				}
				getAudioData(nextSource.url, nextSource.sampleDataUrl).then(data => {
					if (data == null) {
						return Promise.reject('Audio Player: could not get audio data');
					}
					data.title = nextSource.title;
					data.creator = nextSource.creator;
					queue.splice(nextSourceIndex, 1, data);
					return this;
				});
			} else {
				let sourceMetadata = {};
				if (metadata) {
					sourceMetadata.creator = metadata.creator;
					if (metadata.title) {
						sourceMetadata.title = metadata.title;
					} else {
						let file = decodeURI(absoluteUrl).split('/').pop(),
							basename = file.substring(0, file.lastIndexOf('.'));
						if (basename == '') {
							sourceMetadata.title = file;
						} else {
							sourceMetadata.title = basename
								.split(/[\s_]/g)
								.map(w => w[0].toUpperCase() + w.substr(1))
								.join(' ');
						}
					}
				} else {
					let file = decodeURI(absoluteUrl).split('/').pop(),
						basename = file.substring(0, file.lastIndexOf('.'));
					if (basename == '') {
						sourceMetadata.title = file;
					} else {
						sourceMetadata.title = basename
							.split(/[\s_]/g)
							.map(w => w[0].toUpperCase() + w.substr(1))
							.join(' ');
					}
					sourceMetadata.creator = '';
				}
				return getAudioData(url, sampleDataUrl).then(data => {
					if (!data) {
						return Promise.reject('Audio Player: could not get audio data, likely due to missing file');
					}
					data.title = sourceMetadata.title;
					data.creator = sourceMetadata.creator;
					queue.push(data);
					return buildPlaylistContent(this);
				});
			}
		}
		queue(sources) {
			if (sources == undefined) {
				return Promise.reject('Audio Player: One or more sources must be passed');
			}
			if (!Array.isArray(sources)) {
				sources = [sources];
			}
			let queue = COMPONENT_STORE.get(this).queue,
				error = null;
			for (let source of sources) {
				if (!source.url) {
					error = 'Audio Player: every source must have a URL';
					break;
				}
				let absoluteUrl = new URL(source.url, document.baseURI).href,
					sourceMetadata = generateSourceMetadata({ metadata: source.metadata, url: absoluteUrl });
				if (queue.find(s => s.url == absoluteUrl)) {
					error = 'Audio Player: Source already within queue';
					break;
				}
				if (typeof sourceMetadata == 'string') {
					error = sourceMetadata;
					break;
				}
				queue.push({
					url: absoluteUrl,
					sampleDataUrl: source.sampleDataUrl,
					state: SOURCE_STATES.QUEUED,
					title: sourceMetadata.title,
					creator: sourceMetadata.creator,
				});
			}
			if (error) {
				return Promise.reject(error);
			}
			return buildPlaylistContent(this).then(setPlayerDescription);
		}
		dequeue(url) {
			if (url == undefined) {
				return Promise.reject('Audio Player: source URL to dequeue must be defined');
			}
			let absoluteUrl = new URL(url, document.baseURI).href,
				queue = COMPONENT_STORE.get(this).queue,
				source = queue.find(s => s.url == absoluteUrl);
			if (source == undefined) {
				return Promise.reject('Audio Player: no matching source in queue');
			} else if (source.state == SOURCE_STATES.ACTIVE) {
				return Promise.reject('Audio Player: cannot dequeue an active source');
			}
			queue.splice(queue.indexOf(source), 1);
			return buildPlaylistContent(this).then(() => {
				setPlayerDescription(this);
				return this;
			});
		}
		getPlaylist() {
			let queue = COMPONENT_STORE.get(this).queue;
			return queue.map(s => {
				return { url: s.url, sampleDataUrl: s.sampleDataUrl, state: s.state };
			});
		}
		async setPlaylist(queue) {
			if (!Array.isArray(queue)) {
				return Promise.reject('Audio Player: Passed playlist must be an array');
			} else if (queue.length < 1) {
				return Promise.reject('Audio Player: Playlist cannot be empty');
			}
			let components = COMPONENT_STORE.get(this),
				currentQueue = components.queue,
				activeSource = currentQueue.find(s => (s.state = SOURCE_STATES.ACTIVE)),
				newQueueActiveSource = queue.find(s => s.state == SOURCE_STATES.ACTIVE);
			if (queue.find(s => s.url == undefined)) {
				return Promise.reject('Audio Player: Every source must have a URL');
			}
			if (activeSource != undefined && newQueueActiveSource == undefined) {
				return Promise.reject('Audio Player: Active source must not be changed in setPlaylist');
			} else if (activeSource == undefined && newQueueActiveSource != undefined) {
				return Promise.reject('Audio Player: Active source must not be set in setPlaylist. Use load()');
			}
			queue = queue.map(async s => {
				let absoluteUrl = new URL(s.url, document.baseURI).href,
					absoluteSampleDataUrl = s.sampleDataUrl ? new URL(s.sampleDataUrl, document.baseURI).href : null,
					matchingSource = currentQueue.find(c => c.url == absoluteUrl);
				if (!matchingSource) {
					let sourceMetadata = {};
					if (!s.state) {
						s.state = SOURCE_STATES.QUEUED;
					}
					if (s.title) {
						sourceMetadata.creator = s.creator.toString();
						if (s.title) {
							sourceMetadata.title = s.title;
						} else {
							let file = decodeURI(absoluteUrl).split('/').pop(),
								basename = file.substring(0, file.lastIndexOf('.'));
							if (basename == '') {
								sourceMetadata.title = file;
							} else {
								sourceMetadata.title = basename
									.split(/[\s_]/g)
									.map(w => w[0].toUpperCase() + w.substr(1))
									.join(' ');
							}
						}
					} else {
						let file = decodeURI(absoluteUrl).split('/').pop(),
							basename = file.substring(0, file.lastIndexOf('.'));
						if (basename == '') {
							sourceMetadata.title = file;
						} else {
							sourceMetadata.title = basename
								.split(/[\s_]/g)
								.map(w => w[0].toUpperCase() + w.substr(1))
								.join(' ');
						}
						sourceMetadata.creator = '';
					}
					let source = {
						url: absoluteUrl,
						sampleDataUrl: absoluteSampleDataUrl,
						state: s.state,
						title: sourceMetadata.title,
						creator: sourceMetadata.creator,
					};
					if (source.state && source.state == SOURCE_STATES.LOADED) {
						return getAudioData(source.url, source.sampleDataUrl);
					} else {
						return Promise.resolve(source);
					}
				} else {
					if (!s.state) {
						s.state = SOURCE_STATES.QUEUED;
					}
					if (s.state == SOURCE_STATES.LOADED && matchingSource.state == SOURCE_STATES.QUEUED) {
						let data = await getAudioData(absoluteUrl, absoluteSampleDataUrl);
						if (data == null) {
							return Promise.reject('Audio Player: Could not get audio data');
						}
						data.title = matchingSource.title;
						data.creator = matchingSource.creator;
						return Promise.resolve(data);
					}
					return Promise.resolve(matchingSource);
				}
			});
			queue = await Promise.all(queue);
			if (typeof queue == 'string') {
				return Promise.reject('Audio Player: Loading for one or more sources failed');
			}
			if (new Set(queue.map(s => s.url)).size < queue.length) {
				return Promise.reject('Audio Player: No source can be duplicated');
			}
			components.queue = queue;
			return buildPlaylistContent(this);
		}
		configure(options) {
			let components = COMPONENT_STORE.get(this);
			if (options.showPlaylist != null) {
				switch (options.showPlaylist) {
					case 'true':
					case true:
						components.showPlaylist = true;
						break;
					case 'false':
					case false:
						components.showPlaylist = false;
						break;
					default:
						components.showPlaylist = 'auto';
						break;
				}
				if (this.isConnected) {
					buildPlaylistContent(this).then(setPlayerDescription);
				}
			}
			if (options.autoAdvance != null) {
				components.autoAdvance = options.autoAdvance == true;
			}
			if (options.background != null) {
				this.background = options.background;
			}
			if (options.indicator != null) {
				this.indicator = options.indicator;
			}
			if (options.autoLoad != null) {
				components.get(this).autoLoad = options.autoLoad == true;
			}
			if (options.compact != null) {
				this.setAttribute('compact', options.compact == true);
			}
			if (options.accent != null) {
				this.accent = options.accent;
			}
			return this;
		}
	}
	customElements.define('audio-player', AudioPlayer);
})();
