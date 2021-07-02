<template id="audio-player">
	<figure class="audio-player compact loading" aria-role="region" tabindex="0">
		<button class="play-button" tabindex="-1">
			<svg viewBox="0 0 24 24" class="play-button-icon">
				<path class="play" d="M4.8,4.807l14.4,7.193l-14.4,7.209l0,-14.402Z"/>
				<path class="pause" d="M19.2,4.807l0,14.402l-4.809,-0l-0,-14.402l4.809,0Zm-14.4,0l4.809,0l0,14.402l-4.809,-0l0,-14.402Z"/>
			</svg>
		</button>
		
		<svg class="load-icon" viewBox="0 0 100 100">
			<line x1="25" x2="25" y1="25" y2="75" />
			<line x1="50" x2="50" y1="17.5" y2="82.5" />
			<line x1="25" x2="25" y1="25" y2="75" />
			<line x1="50" x2="50" y1="17.5" y2="82.5" />
			<line x1="75" x2="75" y1="25" y2="75" />
			<line x1="50" x2="50" y1="17.5" y2="82.5" />
			<line x1="25" x2="25" y1="25" y2="75" />
		</svg>
		
		<figure class="visualizer">
			
			<div class="visualizer-progress-indicator"></div>
			
			<ul class="visualizer-samples">
				
			</ul>
		</figure>
	</figure>
</template>

<template id="custom-audio-player">
	<button class="play-button" tabindex="-1">
		<svg viewBox="0 0 24 24" class="play-button-icon">
			<path class="play" d="M4.8,4.807l14.4,7.193l-14.4,7.209l0,-14.402Z"/>
			<path class="pause" d="M19.2,4.807l0,14.402l-4.809,-0l-0,-14.402l4.809,0Zm-14.4,0l4.809,0l0,14.402l-4.809,-0l0,-14.402Z"/>
		</svg>
	</button>
	
	<svg class="load-icon" viewBox="0 0 300 100">
		<line x1="37.5" x2="37.5" y1="40" y2="60" />
		<line x1="75" x2="75" y1="17.5" y2="82.5" />
		<line x1="112.5" x2="112.5" y1="25" y2="75" />
		<line x1="150" x2="150" y1="17.5" y2="82.5" />
		<line x1="187.5" x2="187.5" y1="25" y2="75" />
		<line x1="225" x2="225" y1="17.5" y2="82.5" />
		<line x1="262.5" x2="262.5" y1="40" y2="60" />
	</svg>
	
	<figure class="visualizer">
		
		<svg class="visualizer-progress-indicator" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>
		
		<ul class="visualizer-samples"></ul>
	</figure>
	
	
	
</template>
