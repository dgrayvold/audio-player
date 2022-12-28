# Audio player web component

For when you need something a little flashier than the basic audio element. Used for my [artist portfolio](https://dgrayvold.com/portfolio)

## About

Audio Player is a custom web component providing a single autonomous element with a waveform and customizable theming. Waveforms can be generated from only an audio file or supplied through a URL during creation or loading. The player is an optional augmentation of the basic `audio` HTML element; creation allows for falling back to the `audio` element if custom HTML elements are not supported by the browser

## How to

1. Place audio elements in the HTML that should be replaced. If pre-generated sample data is available, set the file URL as the `data-sample-source` data attribute. Title and creator information can be added with `data-tile` and `data-creator` as well
2. Load the module through a dynamic import
3. Replace audio elements with `document.createElement("audio-player").replace([element(s)])`
Audio players can also be prepared before adding to DOM with:

```js
document.createElement("audio-player")
	.preload({
		url: [file URL],
		sampleDataUrl: [data file URL],
		metadata: {title: [audio title], creator: [creator name]}
	})
	.then(p => document.body.append(p));
```  

The player will automatically load the preloaded content upon being appended. To set the player's theme colors (accent, background, and indicator) or compact state, use the `configure()` function. The audio player can also manage playlists. Each `load()` or `preload()` adds a source to the queue. The playlist can be managed with `getPlaylist()` and `setPlaylist()` by passing in objects with the following shape:

```js
{
	url: [audio file URL],
	sampleDataUrl: [optional sample data JSON file URL],
	metadata: { [optional information about audio source]
		title: [title of source],
		creator: [creator of source (artist, composer, etc.)]
	},
	state: [optional "queued" or "loaded", active source can't be set/changed here]
}
```

The player will automatically remove any loaded sources other than the active one if not included within the `setPlaylist()` call, so it is essential to include the current playlist as it stands with `getPlaylist()` first

### Miscellaneous notes

- It is highly recommended to use MP3 files with a constant bit rate as the web audio engine (at least in every browser I've tested) cannot seek perfectly accurately and the visualizer will end up going out of sync when using a variable bit rate
- Audio elements to be replaced should have their preload attribute set to none. This prevents the file from being fetched twice
- To generate a sample data file, generate a JSON file containing only a single array of 500 values calculated as the averages of 500 sections making up the assocated audio file. This data can be fetched from an audio-player by accessing the data property and running it through `JSON.stringify()`. I might whip up a generator at some point that'll do this for you
- The `load()` function cannot be used until the element has been connected to the DOM. Use `preload()` or `queue()` to prepare the player for the content; preloaded content will automatically be loaded upon being connected to the DOM
- The font family of the playlist is not set so as to allow for better adaptation to the page. Use a sans-serif or monospace font that has good small capitals and old-style numerals
- The player attempts to adapt to custom color choices to provide adequate contrast; it is best used with solid, bright, saturated accents on dark backgrounds
- The `autoAdvance` configuration option takes effect with the next source's load
- The audio element is exposed through `element.source` to allow for event listening and external playback toggling

## Changes

### v2.0

- Audio player now supports playlists. Multiple sources can be loaded in to play automatically one after another
- Sources can now be queued, meaning that they are added to the queue but not yet loaded
- Sources can be auto-loaded as the current active source nears the end of its playback
- New configuration options: `autoAdvance`, `autoLoad`, `showPlaylist` ( one of `true`, `"auto"`, `false`)
- Integrated a color generator to automatically provide an indicator color that matches with the accent color when no indicator color is provided
- Improved accessibility with inclusion of aria-label, aria-live description element that announces changes in source, and `progressbar` role for visualizer to indicate current source time
- `accent`, `background`, and `indicator` object properties are no longer reflected as attributes for a cleaner result
- Bugfix for seeking past end of audio with keyboard
	
### v1.0.1

- Bugfix for Chrome throwing errors due to negative sample index on `highlightSample`
- Bugfix replacing progress indicator's transform percentage with unitless value

### v1.0

- Initial version
  
