# Audio credits

Every audio file in `public/assets/sfx/` and `public/assets/music/` comes from a source released under
**CC0 1.0 Universal (public domain dedication)**: <https://creativecommons.org/publicdomain/zero/1.0/>.
CC0 allows commercial use, modification and redistribution without attribution. The credits below are
given voluntarily. No CC-BY, NC or SA material is used. Nothing is taken from STRAFTAT or any commercial game.

Files were trimmed, downmixed to mono (sfx), pitch/level adjusted, peak-normalised per category and encoded to
MP3 (sfx 96 kbps mono, music 96 kbps stereo, normalised to about -14 LUFS). License status of every page was checked on
the page itself on 2026-11-09.

## Sound effects (`public/assets/sfx/`)

| Source pack | Author | License | Page |
| --- | --- | --- | --- |
| The Free Firearm Sound Library | Ben Jaszczak et al. (Free Firearm Sound Library project), uploaded by bart | CC0 | <https://opengameart.org/content/the-free-firearm-sound-library> |
| Impact Sounds 1.0 | Kenney (kenney.nl) | CC0 | <https://kenney.nl/assets/impact-sounds> |
| Sci-fi Sounds | Kenney (kenney.nl) | CC0 | <https://kenney.nl/assets/sci-fi-sounds> |
| RPG Audio | Kenney (kenney.nl) | CC0 | <https://kenney.nl/assets/rpg-audio> |
| Interface Sounds | Kenney (kenney.nl) | CC0 | <https://kenney.nl/assets/interface-sounds> |
| Swishes Sound Pack | artisticdude | CC0 | <https://opengameart.org/content/swishes-sound-pack> |
| Scrapes | AntumDeluge | CC0 | <https://opengameart.org/content/scrapes> |

| Output files | Made from |
| --- | --- |
| `pistol_1-3` | Free Firearm Library: 1911 (A_34P), Walther PPQ (X_31P), Bersa (F_41P) |
| `revolver_1-3` | Free Firearm Library: Smith & Wesson 642 (V_22P, V_27P), Ruger Single Six (S_14P) |
| `heavy_1-3` | Free Firearm Library: 1917 revolver (B_16P, B_24P), Marlin 336 (I_17P) |
| `smg_1-3` | Free Firearm Library: PPSh (P_30P, P_16P, P_32P) |
| `rifle_1-3` | Free Firearm Library: AK-47 (C_27P, C_28P), AR-15 (D_24P) |
| `shotgun_1-3` | Free Firearm Library: Mossberg (N_26P), Model 12 (K_17P), Nova (O_17P) |
| `sniper_1-3` | Free Firearm Library: Mosin Nagant (M_26P), Savage 10 (T_17P), Tikka (W_24P) |
| `explosion_1-3` | Kenney Sci-fi Sounds: `explosionCrunch_001/002/004` |
| `boom_1-2` | Kenney Sci-fi Sounds: `lowFrequency_explosion_001/000` |
| `rocket_1-2` | Kenney Sci-fi Sounds: `thrusterFire_000/001` |
| `step_1-5` | Kenney Impact Sounds: `footstep_concrete_000-004` (pitched down) + `impactSoft_heavy` thud |
| `land_1-3` | Kenney Impact Sounds: `impactSoft_heavy_000-002` + `footstep_concrete_000-002` |
| `jump_1-3` | Kenney RPG Audio: `cloth2/3/4` |
| `slide_1-3` | AntumDeluge Scrapes: `scrape-2/5/7` |
| `whoosh_1-3`, `throw_1-2` | artisticdude Swishes: `swish-3/5/7/9` (pitched down) |
| `slash_1-3` | artisticdude Swishes `swish-9/4/10` + Kenney RPG Audio `knifeSlice`, `knifeSlice2`, `drawKnife2` |
| `walljump_1-2` | Kenney Impact Sounds `impactPlate_light_000/001` + Swishes `swish-9` |
| `punch_1-3` | Kenney Impact Sounds: `impactPunch_medium_000-002` |
| `hurt_1-2` | Kenney Impact Sounds: `impactPunch_medium_003`, `impactPunch_heavy_001` |
| `hit_1-3` | Kenney Impact Sounds: `impactTin_medium_000-002` |
| `headshot_1`, `kill_1` | Kenney Impact Sounds: `impactBell_heavy_002` (+ `impactPlate_heavy_000` for kill) |
| `pickup_1-2` | Kenney RPG Audio `metalLatch`, Kenney Impact Sounds `impactMetal_light_002` |
| `empty_1` | Kenney RPG Audio: `metalClick` |
| `beep_1`, `go_1`, `win_1`, `lose_1`, `click_1` | Kenney Interface Sounds: `select_001`, `confirmation_002`, `confirmation_004`, `error_001`, `click_001` |

Sounds without a sample (`bow`, `zap`, `pop`, `pad`, `harpoon`, `spin`) still use the synthesised fallback in `src/audio.js`.

## Music (`public/assets/music/`)

| File | Title | Author | License | Source |
| --- | --- | --- | --- | --- |
| `final-hour.mp3` | Final Hour | isaiah658 | CC0 | <https://opengameart.org/content/final-hour> |
| `hypnotic-chill.mp3` | Hypnotic Chill (Extended 4 minute mix), trimmed to 3:25 with a fade-out | cynicmusic (cynicmusic.com) | CC0 | <https://opengameart.org/content/hypnotic-chill-extended-4-minute-mix> |
| `bright-glitch.mp3` | bright glitch d'n'b theme piano | Gichco ("obscure music") | CC0 | <https://opengameart.org/content/bright-glitch-dnb-theme-piano> |
| `strange-piano.mp3` | Strange d'n'b piano theme | Gichco ("obscure music") | CC0 | <https://opengameart.org/content/strange-dnb-piano-theme> |
| `lucid-trigger.mp3` | Lucid Trigger | Liq_mmry (uploaded to OpenGameArt by khtlrpzvgm) | CC0 | <https://opengameart.org/content/lucid-trigger> |
