# Databricks Jeopardy

A two-player Jeopardy board about Databricks, Delta Lake, and Apache Spark. The whole game is one static file (`index.html`) made to be read from a couch. Every clue has four answers, A through D, in the style of the Databricks Data Engineer Associate exam. One is right. The other three are plausible and wrong.

Scores, names, used clues, Daily Double placement, and the shuffled answer order are saved in this browser.

## How to play

1. Choose a clue on the board. The four answers are already on screen.
2. Player 1 buzzes with **A**, player 2 with **L** (or the Buzz buttons).
3. The player who buzzed presses **1** **2** **3** or **4**, or clicks an answer. 1 is A, 2 is B, 3 is C, and 4 is D. The letter keys are not used for answers, because A and L are the buzzers.
4. A right pick adds the clue value and lights the correct answer in green. The clue then closes.
5. A wrong pick subtracts the value, marks that answer, and leaves the correct one hidden. The other player may buzz and pick from what is left.
6. If both players miss, or the miss is a Daily Double, the correct answer lights up. **Esc** closes the clue.

**Daily Double** (two per game, never on the $200 row): choose who found it, wager up to that player's score or $1,000, whichever is higher, then pick. There is no steal.

**Final Jeopardy** is multiple choice too. Both players type a hidden wager (up to their score), then each locks a secret pick. Player 1 answers while player 2 looks away, then player 2 answers. The reveal lights the correct choice and applies both wagers.

**New Game** clears the board, places new Daily Doubles, and reshuffles every answer. Refreshing the page keeps the current game, including the answer order.

Click a name to edit it. **−** and **+** change a score by $200.

## Controls

| Key | Action |
| --- | --- |
| A | Player 1 buzzes |
| L | Player 2 buzzes |
| 1 2 3 4 | The buzzed player picks A B C D |
| Click an answer | Same as 1-4, after buzzing |
| Esc | Close the clue |
| F | Fullscreen |
| M | Mute or unmute the buzz sounds |

## Play on a TV

1. Open the site in the browser on the computer connected to the TV.
2. Press **F** so the board fills the screen.
3. Keep one keyboard where both players can reach **A**, **L**, and **1-4**. The answer buttons are large enough to click from a couch mouse.
4. For Final Jeopardy, one player looks away while the other picks, then they switch.
5. Press **M** if the room should stay quiet.

## Play locally

If the hosted site is down, open `index.html` in a browser. Nothing to install and no server to run. Scores stay in that browser.

## Tests

`tests/game.mjs` plays the board, a buzz, a right pick, a wrong pick and steal, a Daily Double, and Final Jeopardy in headless Chrome. It is not part of the static site.

```
npm install --no-save playwright-core
node tests/game.mjs
```
