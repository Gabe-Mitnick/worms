/* TODO
make more things be variants
set up this option for background color
	if colorHexagon, choose primary, secondary, or average
	else, choose a unique color or one of the normal colors
make options be on screen
square and hex grid versions
make separate css stylesheet
new colormodes: rainbow, grayscale, opacity
shape options: circle, triangle, square
motion only on square or triangular or hexagonal grid
*/

// using var instead of const so I can change it during runtime in devtools
var WIDTH = window.screen.width;
var HEIGHT = window.screen.height;
var numGuys = 200;

// fps metering
var FRAME_RATE_FACTOR = 1 / 120,
	SAMPLING_PERIOD = 10,
	startTime = 0,
	frameCount = SAMPLING_PERIOD,
	slowness = 1;

var sizePrefs = {
	typical: 12,
	changeRate: 3,
	moderation: 0.06,
	startAtRandom: false,
};
var speedPrefs = {
	typical: 4,
	changeRate: 0.5,
	moderation: 0.1,
	startAtRandom: false,
};
var dirPrefs = {
	min: 0,
	max: 2 * Math.PI,
	// radians / frame
	changeRate: 0.3,
	restrict: false,
	startAtRandom: true,
};

var Shapes = Object.freeze({
	freeCircles: 0,
	connectedCircles: 1,
	square: 2,
	line: 3,
});
var wormShape;
// butt, round, or square line cap
var lineType;

var numColors = 6;
// fake enum for color modes
var Modes = Object.freeze({
	grayscale: 0,
	random: 1,
	rainbow: 2,
	hexagon: 3,
});
var colorMode = Modes.hexagon;
// should no worms be the same color as the background?
var uniqueBg = false;
// e.g. if fade is 0.01, old trails will fade by 1% each frame
var fade = 0;
// clear background on reset
var clearBg = true;

let colorList, bgColor;
let canvas, ctx;

// utility function for a random float on range [min, max)
function rand(min, max) {
	return Math.random() * (max - min) + min;
}

function rand255() {
	return Math.random() * 255;
}

function genColors() {
	colorList = new Array(numColors);
	switch (colorMode) {
		// curlies below to keep variables to itself
		case Modes.hexagon: {
			// partly random color palette
			// contains array of r values, array of g values, and array of b values
			let colorNums = new Array(3);
			// repeat for r's, g's, and b's
			for (let i = 0; i < 3; i++) {
				colorNums[i] = new Array(6);
				// primary colors
				for (let j = 0; j < 3; j++) {
					colorNums[i][j] = rand255();
				}
				// secondary colors
				for (let j = 0; j < 3; j++) {
					colorNums[i][3 + j] = (colorNums[i][j] + colorNums[i][(j + 1) % 3]) / 2;
				}
			}
			colorList = new Array(6);
			// repeat for each color
			for (let i = 0; i < 6; i++) {
				colorList[i] = `rgb(${colorNums[0][i]}, ${colorNums[1][i]}, ${colorNums[2][i]})`;
			}
			break;
		}
		case Modes.rainbow: {
			let increment = 360 / numColors;
			let h = rand(0, 360);
			let temp = rand(0, 8);
			let s = 100 - temp * temp;
			let l = rand(50, 80);
			for (let i = 0; i < colorList.length; i++) {
				colorList[i] = `hsl(${h}, ${s}%, ${l}%)`;
				h = (h + increment) % 360;
			}
			break;
		}
		case Modes.grayscale: {
			let increment = 255 / numColors;
			let val = rand(0, 255);
			for (let i = 0; i < colorList.length; i++) {
				colorList[i] = `rgb(${val}, ${val}, ${val})`;
				val = (val + increment) % 255;
			}
			break;
		}
		default: {
			// random
			for (let i = 0; i < colorList.length; i++) {
				colorList[i] = `rgb(${rand255()}, ${rand255()}, ${rand255()})`;
			}
		}
	}
	bgColor = colorList[0];
	// bgColor = 'black';
	if (uniqueBg) {
		colorList.shift();
	}
}

function makeInitial(prefs) {
	if (prefs.startAtRandom) {
		let factor = Math.random() + Math.random();
		return prefs.typical * factor * factor;
	} else {
		return 0;
	}
}

function varyRelative(val, prefs) {
	// keep attribute the same if it's stable
	if (prefs.changeRate === 0) return val;

	// modify val
	val += rand(-prefs.changeRate, prefs.changeRate);
	// pull it toward typical
	val += (prefs.typical - val) * prefs.moderation;
	// ensure positive
	if (val < 0) val *= -1;

	return val;
}

function restrictRange(val, prefs) {
	if (val > prefs.max) {
		return prefs.max;
	} else if (val < prefs.min) {
		return prefs.min;
	} else {
		return val;
	}
}

// the little guys who fly around (particles)
function Guy() {
	// initialize random position
	this.x = rand(0, WIDTH);
	this.y = rand(0, HEIGHT);
	// initialize other attributes, random or not
	this.size = makeInitial(sizePrefs);
	this.speed = makeInitial(speedPrefs);
	this.dir = rand(dirPrefs.min, dirPrefs.max);
	// pick random color from the list, favoring higher numbers
	this.color = colorList[Math.floor(4 * Math.pow(Math.random(), 0.65))];
	// this.color = colorList[0];

	this.draw = function () {
		// if one of the line shapes
		if (wormShape === Shapes.line) {
			ctx.strokeStyle = this.color;
			ctx.lineWidth = this.size;
			ctx.beginPath();
			ctx.moveTo(this.x, this.y);
		} else if (wormShape === Shapes.square) {
			ctx.fillStyle = this.color;
			ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
		} else {
			ctx.fillStyle = this.color;
			ctx.beginPath();
			ctx.arc(this.x, this.y, this.size / 2, 0, 2 * Math.PI, true);
			ctx.fill();
		}

		// modify attributes
		this.size = varyRelative(this.size, sizePrefs);
		this.speed = varyRelative(this.speed, speedPrefs);
		this.dir += rand(-dirPrefs.changeRate, dirPrefs.changeRate) * slowness;
		// optionally restrict the direction to a range
		if (dirPrefs.restrict) {
			this.dir = restrictRange(this.dir, dirPrefs);
		}

		// if solidLine pref is on, make sure speed doesn't exceed size
		if (wormShape === Shapes.connectedCircles) {
			this.speed = Math.min(this.speed, this.size);
		}
		// move
		this.x += this.speed * Math.cos(this.dir) * slowness;
		this.y += this.speed * Math.sin(this.dir) * slowness;

		// again, if a line, finish stroke
		if (wormShape === Shapes.line) {
			ctx.lineTo(this.x, this.y);
			ctx.stroke();
		}

		//  wrap around when out of bounds
		if (this.x < -this.size) {
			this.x = WIDTH + this.size;
		} else if (this.x >= WIDTH + this.size) {
			this.x = -this.size;
		}
		if (this.y < -this.size) {
			this.y = HEIGHT + this.size;
		} else if (this.y >= HEIGHT + this.size) {
			this.y = -this.size;
		}
	};
}

let guyList = new Array(numGuys);

function init() {
	canvas = document.getElementById("theCanvas");
	document.body.appendChild(canvas);
	canvas.width = WIDTH * window.devicePixelRatio;
	canvas.height = HEIGHT * window.devicePixelRatio;
	canvas.style.width = WIDTH + "px";
	canvas.style.height = HEIGHT + "px";
	canvas.style.marginLeft = `-${WIDTH / 2}px`;
	canvas.style.marginTop = `-${HEIGHT / 2}px`;
	canvas.onkeydown = restart;

	ctx = canvas.getContext("2d", { alpha: false });
	ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

	window.addEventListener("keydown", this.keyHandle, false);
	window.addEventListener("mousedown", this.restart, false);
	restart();
	window.requestAnimationFrame(step);
}

function restart() {
	// randomize some settings
	// 40% chance of just round worm shape
	if (Math.random() > 0.6) {
		wormShape = Math.floor(Math.random() * 4);
	} else {
		wormShape = Shapes.connectedCircles;
	}

	linetype = choose(["butt", "round", "square", "line", "cap"]);
	colorMode = Math.floor(Math.random() * 4);

	sizePrefs.typical = 50 * Math.random();
	sizePrefs.changeRate = Math.random() * 6;
	speedPrefs.typical = Math.random() * 6 + 2;
	speedPrefs.changeRate = Math.random();
	dirPrefs.changeRate = Math.random();

	genColors();

	ctx.globalCompositeOperation = "source-over";
	if (clearBg) {
		ctx.fillStyle = bgColor;
		ctx.fillRect(0, 0, WIDTH, HEIGHT);
	}
	// 86% chance of just normal source-over composition
	if (Math.random() < 0.86) {
		// randomize fade but prefer no fade
		fade = Math.max(0, Math.random() * 0.08 - 0.03);
	} else {
		ctx.globalCompositeOperation = choose(["soft-light", "hard-light", "xor", "difference", "multiply"]);
		fade = 0;
	}

	if (wormShape === Shapes.line) {
		ctx.lineCap = lineType;
	}

	// initialize guyList
	guyList = new Array(numGuys);
	for (let i = 0; i < guyList.length; i++) {
		guyList[i] = new Guy();
	}
}

function keyHandle(event) {
	// ignore repeated events from holding down key
	if (!event.repeat) {
		// press space or enter -> restart
		if (["Space", "Enter"].includes(event.code)) {
			restart();
			// press B -> toggle background clearing and restart
		} else if (event.code == "KeyB") {
			clearBg = !clearBg;
			restart();
		}
	}
}

// choose random item from list
function choose(list) {
	return list[Math.floor(Math.random() * list.length)];
}

function step(time) {
	if (frameCount == SAMPLING_PERIOD) {
		if (startTime != 0) {
			slowness = (time - startTime) * FRAME_RATE_FACTOR;
			console.log(`slowness: ${slowness}`);
		}
		frameCount = 0;
		startTime = time;
	}
	frameCount++;

	// draw transparent bg-color rectangle across whole canvas
	if (fade > 0) {
		ctx.globalAlpha = fade;
		ctx.fillStyle = bgColor;
		ctx.fillRect(0, 0, WIDTH, HEIGHT);
		ctx.globalAlpha = 1;
	}

	guyList.forEach((g) => g.draw());
	window.requestAnimationFrame(step);
}
