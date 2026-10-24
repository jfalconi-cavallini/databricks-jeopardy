# Databricks Jeopardy

A two-player Jeopardy board about Databricks, Delta Lake, and Apache Spark. The whole game is one static file (`index.html`) made to be read from a couch: big type, a fullscreen board, and both buzzers on a single keyboard. Scores, names, used clues, and Daily Double placement are saved in the browser.

## Controls

| Key | Action |
| --- | --- |
| A | Player 1 buzzes |
| L | Player 2 buzzes |
| Space or Enter | Reveal the answer |
| C | Mark the buzzed player correct |
| W | Mark the buzzed player wrong |
| Esc | Close the clue |
| F | Fullscreen |
| M | Mute or unmute the buzz sounds |

The on-screen **Buzz**, **Correct**, **Wrong**, and **Close** buttons do the same things. **−** and **+** change a score by $200. Click a name to edit it. **New Game** clears the board and places two new Daily Doubles (never on the $200 row).

A wrong answer subtracts the clue value and lets the other player buzz. A Daily Double is answered only by the player who picked it, after they wager up to their score or $1,000, whichever is higher. **Final Jeopardy** asks both players for a hidden wager, then you mark each answer right or wrong.

## Play on a TV

1. Open the site in the browser on the computer connected to the TV.
2. Press **F** so the board fills the screen.
3. Keep the keyboard where both players can reach **A** and **L**, or use the Buzz buttons.
4. Press **M** if the room should stay quiet.

## Play locally

If the hosted site is down, open `index.html` in a browser. Nothing to install and no server to run. Scores stay in that browser.

The hosted game is [databricks-jeopardy.vercel.app](https://databricks-jeopardy.vercel.app).
