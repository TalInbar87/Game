# ✊✋✌️ RPS Arcade

Rock Paper Scissors with an 80s arcade look — neon, CRT scanlines, chiptune sound.

**Play:** https://talinbar87.github.io/game/

## Modes
- **1P VS CPU** — the CPU is mostly random, but sometimes counters your favourite move.
- **2P ONLINE** — one player creates a room and shares the 5-character code (or the invite link); the other joins. Peer-to-peer over WebRTC via [PeerJS](https://peerjs.com/), so no backend is needed.

Choose **first to 1 / 3 / 5 / 7** on the title screen (in online mode the host's setting applies).

## Fair play
Online picks use commit–reveal: each player first sends a SHA-256 hash of `round:move:nonce`, and moves are revealed only once both hashes have arrived, so nobody can peek at the other's move in DevTools.

## Controls
`1` / `2` / `3` or `R` / `P` / `S` to pick · `M` mute · `Esc` back to menu. Touch works too.

## Stack
Plain HTML/CSS/JS, no build step — served straight from GitHub Pages.
