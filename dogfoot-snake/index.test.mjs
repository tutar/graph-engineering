import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const indexUrl = new URL("./index.html", import.meta.url);

async function loadGame(randomValues = [0.55, 0.5]) {
  const html = await readFile(indexUrl, "utf8");
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/i);
  assert.ok(scriptMatch, "the game is implemented by an inline script");

  const listeners = new Map();
  const intervals = [];
  const draws = [];
  const elements = {
    game: {
      width: 400,
      height: 400,
      getContext: () => ({
        clearRect() {},
        fillRect(...args) {
          draws.push(args);
        },
        set fillStyle(value) {},
      }),
    },
    score: { textContent: "" },
    status: { textContent: "" },
    restart: {
      addEventListener(type, listener) {
        listeners.set(`restart:${type}`, listener);
      },
      focus() {},
    },
  };
  let randomIndex = 0;
  const math = Object.create(Math);
  math.random = () => randomValues[randomIndex++ % randomValues.length];

  const context = vm.createContext({
    document: {
      getElementById(id) {
        return elements[id];
      },
    },
    window: {
      addEventListener(type, listener) {
        listeners.set(`window:${type}`, listener);
      },
    },
    Math: math,
    setInterval(callback) {
      intervals.push(callback);
      return intervals.length;
    },
    clearInterval() {},
  });

  vm.runInContext(scriptMatch[1], context, { filename: "dogfoot-snake/index.html" });
  return { draws, elements, html, intervals, listeners };
}

function press(game, key) {
  let prevented = false;
  game.listeners.get("window:keydown")({
    key,
    preventDefault() {
      prevented = true;
    },
  });
  return prevented;
}

test("the game is a dependency-free page that can be opened directly", async () => {
  const { html } = await loadGame();

  assert.match(html, /<canvas[^>]+id="game"/i);
  assert.doesNotMatch(html, /<(?:script|link)[^>]+(?:src|href)=/i);
  assert.match(html, /<button[^>]+id="restart"/i);
});

test("arrow keys steer the snake and suppress page scrolling", async () => {
  const game = await loadGame([0.75, 0.75]);
  const beforeTick = game.draws.length;

  assert.equal(press(game, "ArrowDown"), true);
  game.intervals[0]();

  const tickDraws = game.draws.slice(beforeTick);
  assert.deepEqual(tickDraws[1], [200, 220, 20, 20]);
});

test("eating food grows the snake and updates the visible score", async () => {
  // Empty-cell index 210 is (11, 10), immediately right of the starting head.
  const game = await loadGame([210.5 / 399, 0.75]);
  const beforeTick = game.draws.length;

  game.intervals[0]();

  const tickDraws = game.draws.slice(beforeTick);
  assert.equal(game.elements.score.textContent, "10");
  assert.equal(tickDraws.length, 3, "food plus two snake segments are drawn");
});

test("restart restores a playable game after a collision", async () => {
  const game = await loadGame([0.75, 0.75]);

  for (let step = 0; step < 10; step += 1) game.intervals[0]();
  assert.match(game.elements.status.textContent, /game over/i);

  game.listeners.get("restart:click")();

  assert.equal(game.elements.score.textContent, "0");
  assert.equal(game.elements.status.textContent, "Use the arrow keys to move");
});

test("the snake can move into the tail cell that leaves on the same tick", async () => {
  const game = await loadGame([
    210.5 / 399, // (11, 10): grow right from the starting cell
    229.5 / 398, // (11, 11): grow down
    228.5 / 397, // (10, 11): grow left
    0.75,
  ]);

  game.intervals[0]();
  press(game, "ArrowDown");
  game.intervals[0]();
  press(game, "ArrowLeft");
  game.intervals[0]();
  press(game, "ArrowUp");
  game.intervals[0]();

  assert.equal(game.elements.status.textContent, "Use the arrow keys to move");
  assert.deepEqual(game.draws.at(-4), [200, 200, 20, 20]);
});
