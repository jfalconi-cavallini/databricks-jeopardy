# Databricks Jeopardy

A two-player Jeopardy board for the Databricks Certified Data Engineer Associate exam (May 2026 guide, updated August 2026). The whole game is one static file (`index.html`). Every clue is an exam-style item with four answers, A through D. One is right.

The seven columns are the exam sections: Platform, Ingestion, Transformation, Lakeflow Jobs, CI/CD, Troubleshooting, and Governance. Each column has five dollar values. Each value has a pool of four clues. A game deals one clue per cell. Clue ids that have already been dealt are stored in this browser and are skipped until that cell's pool is used up. Scores, names, the current deal, Daily Double placement, and the shuffled answer order are saved too.

## How to play

1. Choose a clue on the board. The exam domain is the gold pill above the clue. The four answers are already on screen, with both players' keys beside them.
2. There is no separate buzzer. The first player to press one of their keys locks in as the answerer with that choice.
   Player 1 uses the number row: **1 2 3 4** for A B C D.
   Player 2 uses the number row: **7 8 9 0** for A B C D.
   The same keys are buttons on each answer if you are using a mouse.
3. A right pick adds the clue value and lights the correct answer in green. The domain stays on the card and in the result line. The clue then closes.
4. A wrong pick subtracts the value and marks that answer. Only the other player's keys can steal from what is left.
5. If both players miss, or the miss is a Daily Double, the correct answer lights up. **Esc** closes the clue.

**Daily Double** (two per game, never on the $200 row): choose who found it, wager up to that player's score or $1,000, whichever is higher, then answer. Only that player's keys count. There is no steal.

**Final Jeopardy** is multiple choice too. The domain pill is up while you wager. Both players type a hidden wager (up to their score). Player 1 then locks a secret pick with **1 2 3 4** while player 2 looks away. Player 2 locks a secret pick with **7 8 9 0**. The reveal lights the correct choice, keeps the domain pill, and applies both wagers.

**New Game** deals a new board and skips clue ids this browser has already seen. When a cell's four clues have all been used, that cell's pool starts over. Refreshing the page keeps the current game, including which clues were dealt and the answer order.

Click a name to edit it. **−** and **+** change a score by $200.

## Controls

| Key | Action |
| --- | --- |
| 1 2 3 4 | Player 1 answers A B C D. The first of these keys locks player 1 in with that choice. |
| 7 8 9 0 | Player 2 answers A B C D. The first of these keys locks player 2 in with that choice. |
| Esc | Close the clue |
| F | Fullscreen |
| M | Mute or unmute the answer sounds |

On a steal, only the player who has not answered yet can score, and only with their own keys. On a Daily Double, only the player who wagered can score. In Final Jeopardy, player 1's keys work on the first secret pick and player 2's keys work on the second.

## Play on a TV

1. Open the site in the browser on the computer connected to the TV.
2. Press **F** so the board fills the screen.
3. Keep one keyboard where player 1 can reach **1-4** and player 2 can reach **7, 8, 9, and 0**. Each answer also has a P1 key and a P2 key you can click.
4. For Final Jeopardy, one player looks away while the other locks a pick, then they switch.
5. Press **M** if the room should stay quiet.

## Question pool

Each of the 35 board cells draws from four clues (140 clues). Final Jeopardy draws from four more. The gold pill on the clue is the exam domain, and that same domain is repeated in the result line when the answer is revealed.

| Category | Domain | $200 | $400 | $600 | $800 | $1000 | Clues |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Platform | Platform | 4 | 4 | 4 | 4 | 4 | 20 |
| Ingestion | Ingestion | 4 | 4 | 4 | 4 | 4 | 20 |
| Transformation | Transformation | 4 | 4 | 4 | 4 | 4 | 20 |
| Lakeflow Jobs | Lakeflow Jobs | 4 | 4 | 4 | 4 | 4 | 20 |
| CI/CD | CI/CD | 4 | 4 | 4 | 4 | 4 | 20 |
| Troubleshooting | Troubleshooting | 4 | 4 | 4 | 4 | 4 | 20 |
| Governance | Governance | 4 | 4 | 4 | 4 | 4 | 20 |
| Final Jeopardy | Platform, Ingestion, CI/CD, Governance |  |  |  |  |  | 4 |

## Play locally

If the hosted site is down, open `index.html` in a browser. Nothing to install and no server to run. Scores and seen clue ids stay in that browser under the `dbjeopardy` localStorage key.

## Tests

`tests/game.mjs` plays a right answer, a steal, a Daily Double, and Final Jeopardy in headless Chrome, and checks the key map, the expectations clue, domains, and that new games do not repeat clues. It is not part of the static site.

```
npm install --no-save playwright-core
node tests/game.mjs
```
