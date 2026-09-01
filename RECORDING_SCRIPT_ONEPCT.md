# 🎙️ The 1% Challenge — Host Voice Recording Script

Record these and the game's splash screens use **your voice** as the game-show
host instead of the computer voice. Same drill as the spelling words: one
continuous recording, drop the file in the OneDrive Sound Recordings folder,
and Claude splits it into clips. Anything not recorded yet simply falls back
to the computer voice, so partial recordings are fine.

**How it works:** each host line has a number in the middle ("Here comes the
**45** percent question!"). You record every line ONCE (with "fifty" as the
stand-in number) plus the fifteen numbers separately — the game stitches
`line-start + number + line-end` together at play time.

**Delivery:** BIG game-show host energy — think Lee Mack warming up the
audience. Smile while you say them; it comes through.

---

## Part 1 — the fifteen numbers

Say the item number quietly as a marker, short pause, then the number word
with energy, **as if it were the middle of a sentence** (keep the pitch UP at
the end — don't let it fall like the end of a sentence):

1. ninety
2. eighty
3. seventy
4. sixty
5. fifty
6. forty-five
7. forty
8. thirty-five
9. thirty
10. twenty-five
11. twenty
12. fifteen
13. ten
14. five
15. one

## Part 2 — the fourteen host lines

Same drill: quiet marker number, pause, then the full line with showtime
energy. Say "fifty" wherever the number goes — it gets swapped for the real
number by the game.

16. Let's warm up! Here's the fifty percent question.
17. Nice and easy to start. The fifty percent question!
18. Off we go! This is the fifty percent question.
19. Here's one to get you going. The fifty percent question.
20. Here comes the fifty percent question!
21. Next up. The fifty percent question.
22. Ready? This is the fifty percent question.
23. Let's see how you do with the fifty percent question.
24. On we go! The fifty percent question.
25. Ooh, this is a tough one. Only fifty percent of people get this right!
26. Deep breath! Here's the fifty percent question.
27. It's getting serious now. The fifty percent question!
28. Just fifty percent of grown-ups can do this one. Ready?
29. This is where champions are made. The fifty percent question!

---

That's it — 29 items, about three minutes at the mic. When the recording is in
OneDrive, tell Claude "split the 1% host recording" and the clips land in
`audio/onepct/` on the next deploy.

*(Technical note for the split: files are `num_<stage>.mp3` for Part 1 —
stages 90, 80, 70, 60, 50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 1 — and
`lead_<id>_a.mp3` / `lead_<id>_b.mp3` for each Part 2 line cut around the
placeholder number, ids e1–e4, m1–m5, h1–h5 in the order above. A full
single-line recording can also be dropped in as `lead_<id>_<stage>.mp3` and
takes priority over stitching.)*
