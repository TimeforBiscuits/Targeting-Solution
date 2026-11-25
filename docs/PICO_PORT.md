# Targeting Solution: From App to Hardware

This document explains what the Targeting Solution web app does and how to rebuild it as a handheld device running on a **Raspberry Pi Pico 2**. The device would have physical buttons, a small screen, a speaker and a Li-ion battery, all in a 3D-printed case.

The web app is the proof of concept. Its rules engine, behaviour and timings are settled and tested, so the hardware project is mostly a matter of moving those onto new inputs and outputs. The game logic doesn't need to be invented again.

**Contents**

1. [What the app does](#1-what-the-app-does)
2. [How the app is built](#2-how-the-app-is-built)
3. [What carries over and what has to change](#3-what-carries-over-and-what-has-to-change)
4. [The Pico 2 platform](#4-the-pico-2-platform)
5. [Choosing a language](#5-choosing-a-language)
6. [Inputs: buttons](#6-inputs-buttons)
7. [Output: the display](#7-output-the-display)
8. [Output: sound](#8-output-sound)
9. [Power: battery, charging, sleep](#9-power-battery-charging-sleep)
10. [Randomness: keeping the dice honest](#10-randomness-keeping-the-dice-honest)
11. [Program structure: the state machine](#11-program-structure-the-state-machine)
12. [Settings storage](#12-settings-storage)
13. [Notes for the case design](#13-notes-for-the-case-design)
14. [Example parts list](#14-example-parts-list)
15. [Suggested build order](#15-suggested-build-order)
16. [Decisions to make](#16-decisions-to-make)
17. [Reference: rules, tables and constants](#17-reference-rules-tables-and-constants)

---

## 1. What the app does

Targeting Solution resolves attacks in **BattleTech: Alpha Strike** (Commander's Edition), using the optional **Multiple Attack Rolls (MAR)** rule: one 2D6 attack roll for each point of damage the attacker can deal at that range.

### 1.1 Controls

| Control | Values | Default | Effect on the target number (TN) |
|---|---|---|---|
| SKILL | 0–5 | 4 | Base TN |
| RNG | SHT / MED / LNG | MED | +0 / +2 / +4 |
| TMM | 0–5 | 1 | +TMM |
| JUMP? | YOU:N TGT:N → YOU:Y TGT:N → YOU:N TGT:Y → YOU:Y TGT:Y, then back to the start | N/N | Attacker jumped +2, target jumped +1 |
| COVER | +0 to +3 | +0 | +cover |
| OTHER | −4 to +6 | 0 | Anything else (heat, standstill −1, secondary target +1, indirect fire…) |
| DICE | 1–15 | 1 | Number of attack rolls |

Each control has an up and a down key. Holding a key repeats it after 420 ms, every 110 ms, except RNG and JUMP?, which step once per press. JUMP? is the only control that loops round; the others stop at their limits.

The top of the screen is a status line showing the TN, the chance that one roll hits, and the expected number of hits, for example `TN 7  P/SHOT 58%  EXP 0.6 HIT  READY`.

### 1.2 Keys

- **FIRE** rolls the attack. Pressing it during the animation skips to the result. Pressing it afterwards re-rolls with the same settings.
- **RESET** puts every control back to its default.
- **CRIT** rolls on the Determining Critical Hits table at any time. It strobes amber after an attack that included a natural-12 hit.
- **CFG** opens the options: housing colour, display colour scheme, sound on/off.
- **VIC?** appears only on the crit screen. It re-reads the same crit roll from the Vehicle table instead of the 'Mech table.

### 1.3 Screens

1. **Setup.** The status line, then the seven values in columns that line up with the keys below them.
2. **Firing.** `TN=9 DICE=4` across the top, then the pairs of dice: one row for up to 8, two rows for 9–15. Each pair animates in turn, then shows its total. Hits are highlighted and misses dimmed. The right-hand panel counts **HIT** up as pairs land and shows "/N". On a natural-12 hit, **CRIT** and **CHK** flash in vertical bars either side of the hit count.
3. **No shot.** If TN > 12, FIRE shows a flashing `NO SHOT`, `TN 13 > 12 · AUTOMATIC MISS`, and doesn't roll.
4. **Crit check.** One animated pair of dice and its total, then the result as a short code with the table's full wording beneath (`ENG` / `ENGINE HIT`). The right-hand panel has the VIC? button and the name of the table in use.
5. **Config.** Colour swatches and the sound toggle.

### 1.4 Feedback

- **Status light:** yellow flicker while rolling, green after any hits (or NO CRIT), red for no hits, no shot, or a real crit.
- **Sounds,** all generated in code: key chirps, a heavier clunk for the big keys, a rising "fire" sweep, the dice chatter, a different tone for a hit and a miss, an end jingle, a crit warble and an error buzz. Section 8 has the details.

---

## 2. How the app is built

| File | Job | Carries over to the Pico? |
|---|---|---|
| `js/dice.js` | Rules: TN calculation, dice, hit/miss, crit tables, hit chance | **Yes, nearly line for line** |
| `js/app.js` | Interface: screens, key handling, animation timing | The **logic** carries over; the drawing is rewritten |
| `js/audio.js` | Sound effects built in the browser's audio engine | The **recipes** carry over; the sound engine is new |
| `css/style.css` | The hardware look on screen | No. That look becomes the physical case. |
| `tests/dice.test.mjs` | Tests for the rules and the dice distribution | **Yes:** port them and run them on the device or a PC |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline and home-screen support for the web app | No |

The web app *pretends* to be hardware: rubber keys, screws, a speaker grille and an LCD drawn in CSS. On the real device all of that becomes physical, so the screen only has to show what's *inside* the green LCD area of the app.

---

## 3. What carries over and what has to change

### Carries over unchanged
- The TN formula, the ranges and defaults, MAR, the auto-miss rule, natural-12 crits and both crit tables.
- How each screen behaves and what it contains (Section 11 spells it out as a state machine).
- The animation timings, including fast-forward and hold-to-repeat.
- The order and character of the sounds.

### Has to change
| In the app | On the device |
|---|---|
| Touch events | Scanning physical keys, with debouncing |
| An 874×402 screen drawn in HTML and CSS | A small screen, about 320×170, drawn with bitmap fonts and sprites |
| CSS colour themes | Colour schemes for the screen; the housing colour comes from the filament |
| The browser's audio engine | A speaker driven by PWM or an I²S amplifier, with a simpler synth |
| The browser's secure random numbers | The RP2350's hardware random number generator |
| Settings saved in the browser | A small settings file in flash |
| `async`/`await` with `setTimeout` | A main loop that never blocks, or `asyncio` |
| Always plugged in | A battery: charging, a battery gauge, sleep when idle |

### Gets simpler
- No iOS audio unlocking, no safe areas, no rotation, no service worker, no browser caching.
- The housing colour picker goes away; you choose the filament once.

---

## 4. The Pico 2 platform

The **Raspberry Pi Pico 2** uses the RP2350 chip:

- Two Arm Cortex-M33 cores at 150 MHz (or two RISC-V cores, selected in software).
- 520 KB of RAM and 4 MB of flash: plenty for this program, fonts and a few graphics.
- 26 usable general-purpose pins (GPIO), three of which can read analogue voltages.
- Hardware SPI and I²C (for the screen and a key-expander chip), PWM and PIO (for sound), and a built-in **true random number generator**.
- It runs on anything from 1.8 V to 5.5 V on its `VSYS` pin, which suits a single Li-ion cell (about 3.0–4.2 V).

> ⚠️ **Wire the buttons active-low.** The RP2350 has a known chip bug (erratum RP2350-E9) that makes its *internal pull-down resistors* unreliable on inputs. Connect each button between its pin and ground, and use the pin's internal pull-up, so the pin reads 0 when the button is pressed. This is the usual way to wire buttons anyway.

The **Pico 2 W** adds Wi-Fi and Bluetooth. You don't need them, but they'd allow extras later, such as sending roll results to a phone.

---

## 5. Choosing a language

| Option | Strengths | Weaknesses |
|---|---|---|
| **CircuitPython** (recommended to start) | Close to the JavaScript in feel; built-in display library (`displayio`) and bitmap font support; built-in synth (`synthio`); live editing over USB with no compile step; Adafruit's guides cover nearly every part listed here | Slower than C (fine for this program); saving settings needs a little setup (Section 12) |
| **MicroPython** | Similar to CircuitPython, with good `asyncio` support and easy file writes | Display and sound drivers are less built-in |
| **C/C++ (Pico SDK, or the Arduino-Pico core)** | Fastest, lowest power, full control of sleep modes | Slower to develop and harder for a first project |

**Recommendation:** build the first working device in **CircuitPython**. `dice.js` translates to Python almost word for word, `displayio` handles the screen, and `synthio` can reproduce the sound recipes. If you later need better battery life or faster drawing, port the finished, proven design to C.

---

## 6. Inputs: buttons

### 6.1 Key count

| Group | Keys |
|---|---|
| Big keys | FIRE, RESET, CRIT, CFG |
| Control keys | 7 controls × up/down = 14 |
| VIC? | 1 (see below) |
| **Total** | **19** |

### 6.2 Wiring options

Wiring 19 keys directly would use 19 of the 26 pins, leaving too few for the screen, sound and battery. Two common ways round that:

1. **A key matrix (recommended).** Arrange the keys in a 4×5 grid of rows and columns: 20 positions on 9 pins. Put a diode on each key if two keys pressed together must both register; for this device, reading one key at a time is enough. The code scans the grid every few milliseconds.
2. **An I²C key-expander chip (MCP23017).** One small chip gives 16 inputs on just 2 pins (plus an optional interrupt pin). It's simpler to wire, at the cost of one more part.

### 6.3 How the keys should behave in code
- **Debounce:** only accept a change after the key has read the same for about 10–20 ms.
- **Act on press, not release.** The app does this, and it's what makes it feel responsive.
- **Hold-to-repeat:** start repeating after 420 ms, then every 110 ms, on SKILL, TMM, COVER, OTHER and DICE only.
- In the app, FIRE and CRIT act on press and their visual "pressed" state clears on release. Physical keys don't need that visual state.

### 6.4 VIC? on the device
On the touchscreen, VIC? is a button drawn on the LCD. A physical device needs one of these:
- **A small dedicated VIC key** beside the screen (recommended; matches the app most closely).
- **Reusing a key while the crit screen is showing,** for example either JUMP? arrow. That's free, but it isn't obvious to the user.
- **Long-pressing CRIT** to toggle the table instead of rolling again.

### 6.5 The CFG menu on the device
With no touchscreen, CFG becomes a short menu: the up/down keys move between items, FIRE selects and CFG exits. If you build a monochrome display (Section 7), the colour options disappear, leaving only sound on/off (and perhaps volume and brightness).

---

## 7. Output: the display

The app's LCD area is wide and shallow, about **2.2:1**. Pick a screen with a similar shape and enough resolution for 15 pairs of dice.

| Display type | Example | Look | Fit for this design |
|---|---|---|---|
| **Colour TFT, wide** (recommended) | 1.9" ST7789, 320×170 | Can reproduce every colour scheme exactly | **Best.** Similar shape; dice and text fit (see below) |
| Colour TFT, 4:3 | 2.0–2.4" ST7789/ILI9341, 320×240 | Same as above, taller | Fine; leaves room for a bigger hit count |
| Monochrome OLED, wide | 3.12" SSD1322, 256×64 (16 grey levels) | Very "military kit", glows like the amber/green schemes | Good, but needs a two-line layout; only one colour |
| Character LCD | HD44780 16×2 / 20×4 | The most authentic LCD | **Poor.** Can't draw dice pips; numbers only |
| Real transflective LCD | Sharp Memory LCD 400×240 | Readable in sunlight, very low power | Interesting but monochrome; more expensive |

### 7.1 Pixel budget on a 320×170 screen

```
┌──────────────────────────────────────────────┐  320 px
│ TN=9  DICE=4                    ON TARGET    │  16 px status line
├────────────────────────────────┬─────────────┤
│  ⚃ ⚅  ⚀ ⚄  ...  (≤8 per row)   │   HIT       │
│  11   7   ...                  │ C  12   C   │  ~150 px
│  ⚂ ⚂  ⚅ ⚅  ...  (2nd row)      │ R       H   │
│  6    12  ...                  │ I  /15  K   │
│                                │ T           │
└────────────────────────────────┴─────────────┘
          ~240 px                    ~80 px
```

- **15 dice in two rows:** 8 pairs per row is 30 px per pair, so each die is about 13 px square with 2 px pips. That's legible.
- **1–8 dice in one row:** the dice can be about 26 px.
- **Setup screen:** 7 columns of about 45 px, with values in a pixel font 24–32 px tall. "MED" and the two-line "YOU:N / TGT:N" both fit.

### 7.2 Fonts and graphics
- The app uses **VT323** (the LCD text) and **Silkscreen** (the panel labels). Both are released under the SIL Open Font License, which allows embedding them in a device. Convert them to bitmap fonts (BDF or PCF) at the sizes you need. On the device, Silkscreen becomes the printed or embossed panel labels.
- Draw the dice from sprites: six faces, plus a "hit" version with an inverted background. A 3×3 grid of pip positions covers every face (`PIPS` in `app.js`).
- **Redraw only what changes,** such as one pair of dice or the hit count. Redrawing the whole screen every animation frame would be too slow over SPI.

### 7.3 Colour schemes
On a colour TFT, keep the app's seven schemes (foreground / background):

| Name | Foreground | Background |
|---|---|---|
| WHT/RED | `#fff1ea` | `#b0221c` |
| BLK/ORG | `#1a0d04` | `#ff8a1e` |
| WHT/ORG | `#fff7ea` | `#d9661a` |
| AMB/BLK | `#ffb000` | `#140c04` |
| GRN/BLK | `#62ff7e` | `#08120a` |
| BLK/GRN | `#1d2913` | `#9db278` |
| CYN/BLU | `#a8ecff` | `#0b2a6a` |

The app's glow, pixel grid and scanlines were there to imitate a real screen, so on a real screen you can skip them. A thin dark grid drawn over the display can still look good if you want it.

The **housing colours** (olive drab, navy, desert tan, gunmetal, black) become filament choices.

---

## 8. Output: sound

### 8.1 Hardware
- **Simplest:** a piezo buzzer or small speaker on one PWM pin. Square-wave chirps, which is most of the app's sounds, come out well.
- **Better:** an **I²S amplifier board (MAX98357A)** with a small 8 Ω speaker of 1–2 W. It takes 3 pins and gives proper volume and smoother envelopes. CircuitPython's `synthio` can drive it directly.
- Add a **volume setting** to CFG, or a physical mute switch. A device on a gaming table needs one.

### 8.2 Sound recipes (from `js/audio.js`)

| Sound | When | Recipe |
|---|---|---|
| Key chirp | Any control key | Short high-passed noise click (12 ms) + square sweep 2400→1500 Hz over 35 ms. Pitch ×1.12 for up, ×0.9 for down, ×0.6 at a limit |
| Big key | FIRE, RESET, CRIT | Noise burst (30 ms, ~1.8 kHz) + triangle 320→140 Hz over 70 ms + square chirp 1700→2600 Hz |
| Fire | Start of a roll | Sawtooth sweep 180→1400 Hz over 220 ms, then a 2200 Hz blip |
| Tick | Every 42 ms while a die tumbles | 12 ms square blip at a random 1800–4400 Hz + 8 ms narrow noise |
| Land: hit | A pair lands as a hit | Noise click + 1320 Hz then 1980 Hz blips (50 ms + 70 ms) |
| Land: miss | A pair lands as a miss | Noise click + square 330→220 Hz over 80 ms |
| Done | End of the roll | 0 hits: 196 Hz then 147 Hz (sad). Some hits: 1047, 1568 Hz. All hits: 1047, 1319, 1568, 2093 Hz arpeggio |
| Crit | A natural-12 hit | Six 40 ms blips alternating 3200/2600 Hz, starting 350 ms after the end jingle |
| Error | NO SHOT, or a KILL crit | Two 110 Hz sawtooth buzzes (140 ms, 220 ms) |

The noise in these recipes can come from a cheap linear-feedback shift register (a few lines of code). It doesn't need the hardware random generator.

---

## 9. Power: battery, charging, sleep

### 9.1 Recommended setup
```
USB-C ──► charger + protection board ──► switch ──► Schottky diode ──► Pico VSYS
                    │
               1S Li-ion cell (protected), JST-PH connector
```
- **Charger:** a single-cell Li-ion charger with protection, such as a TP4056 board *with* the protection chips (often sold as "TP4056 with DW01"), or Adafruit's or SparkFun's LiPo charger boards. Charge from USB-C through the case.
- **Feeding the Pico:** put the battery on `VSYS` through a Schottky diode (or the ideal-diode arrangement in the Pico datasheet) so USB and battery can both be connected safely. The Pico's on-board regulator turns 3.0–4.2 V into a steady 3.3 V.
- **Power switch:** a physical slide switch on the battery line. It's simple, and it stops the battery draining slowly in storage.
- **Battery gauge:** on Pico boards, an analogue input reads `VSYS` divided by 3 (GPIO29). Convert the reading to a rough percentage and show a small battery icon on the status line.

> ⚠️ **Li-ion safety:** use a *protected* cell, and check the JST connector's polarity before plugging it in, because the red and black wires are not standardised between suppliers. Don't charge unattended until you trust the build, and leave room in the case so the cell isn't squashed.

### 9.2 Battery life (rough estimate)
| Load | Current |
|---|---|
| Pico 2, CPU running | ~20–25 mA |
| 1.9" TFT including backlight | ~20–40 mA |
| Speaker while sounding | short peaks of 100+ mA, small on average |
| **Typical total** | **~50–70 mA** |

A 1000 mAh cell gives roughly **15–20 hours of use**. A 500 mAh cell gives about half that.

### 9.3 Sleep
- After about 2 minutes idle, dim the backlight (PWM on the backlight pin). After about 10 minutes, turn the screen off and put the Pico into a low-power wait that any key wakes from.
- Save settings before sleeping, not on every key press (Section 12).

---

## 10. Randomness: keeping the dice honest

The app takes each die from the browser's secure random generator and uses **rejection sampling**:

```text
repeat:
    x = random byte (0–255)
until x < 252            # 252 = 6 × 42, so every face gets the same share
face = (x mod 6) + 1
```

Taking `x mod 6` without rejecting 252–255 would make 1–4 very slightly more likely than 5 and 6. Rejecting those values makes each face exactly 1/6. Two independent dice added together give the real 2D6 bell curve.

On the device:
- Use the RP2350's **hardware random generator** as the source. In CircuitPython or MicroPython, `os.urandom()` is the usual way in. Check that your firmware version backs it with the hardware generator; if not, use it to seed a good software generator once at startup.
- Keep the rejection sampling exactly as above.
- Port the **chi-square test** from `tests/dice.test.mjs`: roll several hundred thousand pairs on the device and check that the totals match the 2D6 distribution. That's the evidence that the device's dice are fair.

---

## 11. Program structure: the state machine

This is the app's behaviour written out so it can be rebuilt on any platform. On the Pico, run it from one main loop that never blocks (or with `asyncio`). Each pass of the loop:
1. Scans the keys and turns presses into events.
2. Advances any animation that's due (using a millisecond clock, never `sleep()` for long stretches).
3. Redraws whatever changed.

### 11.1 States

| State | Screen | Notes |
|---|---|---|
| `SETUP` | Status line + seven values | Starting state |
| `ROLLING` | Firing screen, animating | Has `skip` (fast-forward) |
| `RESULT` | Firing screen, final | May have `crit_pending` (CRIT strobes) |
| `NO_SHOT` | NO SHOT message | |
| `CRIT_ROLLING` | Crit screen, animating | |
| `CRIT_RESULT` | Crit screen, final | Has `table` = MECH or VEHICLE |
| `CONFIG` | Options menu | Returns to the previous state |

### 11.2 Events and transitions

| Event | From | Do this | To |
|---|---|---|---|
| Control key (up/down) | any except CONFIG | Change the value (clamped; JUMP? loops). Cancel any roll. Clear `crit_pending` | `SETUP` |
| RESET | any except CONFIG | All controls back to defaults. Cancel any roll. Clear `crit_pending` | `SETUP` |
| FIRE | `ROLLING` or `CRIT_ROLLING` | Set `skip` | (same) |
| FIRE | otherwise, TN > 12 | Error sound | `NO_SHOT` |
| FIRE | otherwise | Clear `crit_pending`. Roll all the dice now, then animate | `ROLLING` |
| Animation finishes | `ROLLING` | Show hits; if any natural-12 hit, set `crit_pending` | `RESULT` |
| CRIT | `ROLLING` or `CRIT_ROLLING` | Set `skip` | (same) |
| CRIT | otherwise | Clear `crit_pending`. `table = MECH`. Roll 2D6, then animate | `CRIT_ROLLING` |
| Animation finishes | `CRIT_ROLLING` | Look up the result in `table` | `CRIT_RESULT` |
| VIC | `CRIT_ROLLING` or `CRIT_RESULT` | Switch `table`; redisplay the same roll if it has finished | (same) |
| CFG | any | Open the menu | `CONFIG` |

**Important:** the dice are rolled *before* the animation starts. The animation only reveals results that are already decided, so fast-forwarding, or the speed of the animation, can never change an outcome. Keep it that way on the device.

### 11.3 Animation timing (from `js/app.js`)
- **Attack:** a 180 ms "fire" lead-in. Then for each pair in turn, spin for `clamp(2200 / dice, 150, 420)` ms, showing new random faces every 42 ms with a tick sound. The pair lands, then there's a 70 ms pause before the next.
  - So 1 die takes about 0.7 s, 4 dice about 2.1 s, and 15 dice about 3.5 s.
- **Crit:** spin for 900 ms (42 ms frames), then land.
- **Fast-forward:** when `skip` is set, stop spinning, show every remaining result at once, and play no more landing sounds.
- **Flashing** (full on/off cycle): CRIT/CHK bars 400 ms; CRIT key strobe 500 ms; KILL, NO SHOT and the natural-12 total 300 ms; the status-line warning 500 ms; the status light while rolling 140 ms.

### 11.4 Strobing CRIT key
The app makes the CRIT *key* strobe. A physical keycap can't do that by itself; options are:
- An **LED inside a translucent amber keycap,** driven from a pin or one LED of the key-expander chip. This is the most satisfying option and suits a 3D-printed keycap in clear filament.
- A **separate panel LED** beside the CRIT key.
- Strobing an icon on the screen only (no extra parts, much less dramatic).

The status light (green, yellow, red) can be one **RGB LED** behind a small window in the case.

---

## 12. Settings storage

Save: display scheme, sound on/off, volume, brightness, and (optionally) the last control values.

- Keep them in a small JSON file in flash, for example `settings.json`.
- **Write only when something changes, and only when leaving CFG or before sleeping.** Flash wears out with repeated writes, and an untimely write can be corrupted if the battery dies part-way.
- **CircuitPython:** by default the code can't write to its own storage while USB is connected. The common approach is a `boot.py` that makes the storage writable unless a particular key is held at startup. Then, for example, holding RESET while plugging in lets you edit files from the computer.
- **MicroPython:** ordinary file writes work.

---

## 13. Notes for the case design

These are requirements for the 3D-printed case. The case itself is a separate piece of work.

- **Front panel layout** (as in the app):
  - Top row: FIRE (hazard-stripe guard), RESET, CRIT (amber, hazard-stripe guard), a title plate, the status light, a speaker grille, CFG.
  - Middle: the display window with a bezel.
  - Bottom: seven pairs of up/down keys with labels above them (SKILL, RNG, TMM, JUMP?, COVER, OTHER, DICE), lined up under the matching values on the screen.
  - A small VIC key near the right-hand end of the display, if you choose that option.
- **Key switches:** 6×6 mm or 12×12 mm tactile switches on perfboard or a small custom board, with printed keycaps. Chunky rubber-key feel: printed caps over 12 mm tactiles, or silicone keycaps.
- **Labels:** embossed or engraved text in the print (Silkscreen-style lettering), or a printed decal over the panel. Hazard stripes: a multi-colour print, paint masking, or yellow/black decal tape.
- **Sizing:** with 7 key columns about 14–16 mm apart, the front face is roughly 130–150 mm wide. The 1.9" display's active area is about 43×23 mm. Plan for a case around 150 × 80 × 30 mm, and confirm once the parts are chosen.
- **Inside:** a battery bay with a strap or clip; a USB-C opening lined up with the charger board; an opening for the power switch; speaker mount holes behind the grille; brass heat-set inserts for the screws; screw bosses you can reach from the back.
- **Look:** the app's details translate directly: screws in the corners, bevelled edges, a recessed title plate, a slotted grille. Print the body in the filament colour you want (olive drab, desert tan…).

---

## 14. Example parts list

These are indicative; exact parts depend on the decisions in Section 16.

| Part | Example | Approx. qty |
|---|---|---|
| Microcontroller board | Raspberry Pi Pico 2 (with headers) | 1 |
| Display | 1.9" 320×170 ST7789 SPI TFT | 1 |
| Tactile switches | 12×12 mm tactile + caps (or 6×6 mm) | 19–20 |
| Diodes (for the key matrix) | 1N4148 | 20 |
| or key-expander chip | MCP23017 breakout | 1–2 |
| Amplifier | MAX98357A I²S breakout | 1 |
| Speaker | 8 Ω 1 W, 20–28 mm | 1 |
| Battery | 1S protected Li-ion/LiPo, 500–1000 mAh, JST-PH | 1 |
| Charger | Li-ion charger + protection, USB-C | 1 |
| Schottky diode | 1N5817 or similar (for VSYS) | 1 |
| Power switch | SPDT slide switch | 1 |
| Status light | RGB LED (+ resistors), or a WS2812 | 1 |
| CRIT keycap LED | Amber LED (+ resistor) | 1 |
| Build materials | Perfboard, wire, M2/M2.5 screws, heat-set inserts | — |
| Tools | Soldering iron, solder, flush cutters, multimeter, breadboard and jumper wires | — |

---

## 15. Suggested build order

Each stage gives you something that works before the next adds more.

1. **"Hello, screen."** Put the Pico 2 and the display on a breadboard. Install CircuitPython and draw the setup screen with fixed values.
2. **Rules and dice.** Translate `dice.js` to Python and port the tests, including the chi-square test, until they pass on the board.
3. **A few keys.** Wire FIRE, RESET and one pair of up/down keys. Get the setup screen and an animated roll working.
4. **The full key set.** Wire the matrix or the key-expander chip, add hold-to-repeat, and build the CRIT and VIC behaviour.
5. **Sound.** Add the amplifier and speaker, and reproduce the sound recipes.
6. **Battery.** Add the charger, cell, switch and diode, then the battery gauge, dimming and sleep.
7. **Case, first draft.** Print a test front panel to check the key spacing and display window *before* soldering anything permanent.
8. **Permanent build.** Move from breadboard to perfboard, or a small custom board, solder it up, and fit everything into the case.
9. **Polish.** The lit CRIT keycap, labels, decals and finishing.

Good learning resources: the Raspberry Pi Pico 2 documentation and datasheet, Adafruit's CircuitPython guides (displayio, synthio, keypad and LiPo charging), and any beginner soldering guide.

---

## 16. Decisions to make

1. **Display:** colour TFT (keeps the colour schemes), or monochrome OLED or real LCD (more authentic, one colour)?
2. **Key wiring:** a key matrix (cheaper, more wiring) or an MCP23017 (simpler wiring, one more part)?
3. **VIC:** a dedicated key, reusing a key on the crit screen, or a long press on CRIT?
4. **CRIT strobe:** an LED-lit amber keycap, a panel LED, or on screen only?
5. **Sound:** piezo on PWM (simplest) or an I²S amplifier and speaker (louder, nicer)?
6. **Language:** CircuitPython (recommended to start) or C/C++?
7. **Battery size:** 500 mAh (thinner case) or 1000+ mAh (longer use)?
8. **Settings:** should the device remember the last control values when switched off, or always start from the defaults?

---

## 17. Reference: rules, tables and constants

### 17.1 Target number
```
TN = SKILL + RANGE + TMM + JUMP + COVER + OTHER

RANGE: SHT 0, MED 2, LNG 4
JUMP:  N/N 0, YOU 2, TGT 1, BOTH 3
```
- A roll **hits** if `d1 + d2 >= TN` and `TN <= 12`.
- If `TN > 12`: automatic miss (NO SHOT). A 12 is *not* an automatic hit.
- If `TN <= 2`, every roll hits. The app shows the TN as at least 2.
- **Natural 12:** a hit where both dice are 6. Under MAR, at most one critical hit per target.
- **Chance per roll** = (number of 2D6 combinations ≥ TN) / 36. **Expected hits** = chance × dice.

| TN | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13+ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Chance per roll | 100% | 97% | 92% | 83% | 72% | 58% | 42% | 28% | 17% | 8% | 3% | 0% |

### 17.2 Determining Critical Hits table (as used)

| 2D6 | 'Mech | Code | Vehicle | Code |
|---|---|---|---|---|
| 2 | Ammo Hit | AMMO | Ammo Hit | AMMO |
| 3 | Engine Hit | ENG | Crew Stunned | STUN |
| 4 | Fire Control Hit | FIRE | Fire Control Hit | FIRE |
| 5 | No Critical Hit | NO CRIT | Fire Control Hit | FIRE |
| 6 | Weapon Hit | WEPS | No Critical Hit | NO CRIT |
| 7 | MP Hit | MP | No Critical Hit | NO CRIT |
| 8 | Weapon Hit | WEPS | No Critical Hit | NO CRIT |
| 9 | No Critical Hit | NO CRIT | Weapon Hit | WEPS |
| 10 | Fire Control Hit | FIRE | Weapon Hit | WEPS |
| 11 | Engine Hit | ENG | Crew Killed | CREW KIA |
| 12 | Unit Destroyed | KILL | Engine Hit | ENG |

KILL and CREW KIA flash and play the error buzz. NO CRIT is shown dimmed.

### 17.3 Limits and defaults
```
skill 0..5   default 4
range 0..2   default 1 (MED)
tmm   0..5   default 1
jump  0..3   default 0 (N/N), loops round
cover 0..3   default 0
other -4..6  default 0
dice  1..15  default 1
```

### 17.4 Rules engine, in Python (starting point)

A direct translation of `js/dice.js`:

```python
import os

RANGE_MOD = (0, 2, 4)            # SHT, MED, LNG
JUMP_MOD = (0, 2, 1, 3)          # N/N, YOU, TGT, BOTH

def compute_tn(s):
    return (s["skill"] + RANGE_MOD[s["range"]] + s["tmm"]
            + JUMP_MOD[s["jump"]] + s["cover"] + s["other"])

def roll_d6():
    while True:
        x = os.urandom(1)[0]
        if x < 252:              # rejection sampling: each face exactly 1/6
            return x % 6 + 1

def resolve_shot(d1, d2, tn):
    total = d1 + d2
    hit = tn <= 12 and total >= tn
    return {"d1": d1, "d2": d2, "sum": total, "hit": hit,
            "natural12": hit and total == 12}

def roll_attack(tn, dice):
    shots = [resolve_shot(roll_d6(), roll_d6(), tn) for _ in range(dice)]
    return {"tn": tn, "shots": shots,
            "hits": sum(1 for s in shots if s["hit"]),
            "crit": any(s["natural12"] for s in shots)}

def hit_chance(tn):
    if tn > 12:
        return 0.0
    ways = sum(1 for a in range(1, 7) for b in range(1, 7) if a + b >= tn)
    return ways / 36
```

The crit tables in 17.2 become two tuples of 11 `(code, full name)` pairs, indexed by `sum - 2`.
