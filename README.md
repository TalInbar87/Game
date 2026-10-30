# ✊✋✌️ RPS Arcade

Rock Paper Scissors with an 80s arcade look — neon, CRT scanlines, chiptune sound.

**Play:** https://talinbar87.github.io/Game/

## Modes
- **1P VS CPU** — three levels:
  - **EASY**: pure random.
  - **NORMAL**: sometimes counters your most-used move.
  - **HARD**: learns your patterns (what you tend to play after your last one or two moves) and counters them.
- **2P ONLINE** — one player creates a room and shares the 5-character code (or the invite link); the other joins. Peer-to-peer over WebRTC via [PeerJS](https://peerjs.com/), so no backend is needed.

## Settings (title screen)
- **FIRST TO** 1 / 3 / 5 / 7 wins.
- **GAME**: CLASSIC or **LIZARD SPOCK** (5 moves: ✊ ✋ ✌️ 🦎 🖖).
- **CPU LEVEL**: EASY / NORMAL / HARD.

In online mode the host's FIRST TO and GAME settings apply to both players.

## Battle
On every reveal the winning hand attacks: rock *crushes*, paper *covers*, scissors *cut*, lizard *poisons*, Spock *vaporizes*…

## Fair play
Online picks use commit–reveal: each player first sends a SHA-256 hash of `round:move:nonce`, and moves are revealed only once both hashes have arrived, so nobody can peek at the other's move in DevTools.

## Controls
`1`–`5` or `R` / `P` / `S` / `L` / `V` to pick · `M` mute · `Esc` back to menu. Touch works too.

## Stack
Plain HTML/CSS/JS, no build step — served straight from GitHub Pages.
