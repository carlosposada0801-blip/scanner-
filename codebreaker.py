#!/usr/bin/env python3
"""
Code Breaker — a Mastermind-style guessing game.

The computer picks a secret 6-digit code. You guess. After each guess you get:
  - exact:   digits that are correct AND in the correct position
  - present: digits that exist in the code but in the wrong position

Crack the code in as few guesses as possible!
"""

import random


CODE_LENGTH = 6
MAX_TURNS = 10


def make_secret(length=CODE_LENGTH):
    """Pick a random code. Digits may repeat (0-9)."""
    return [random.randint(0, 9) for _ in range(length)]


def score(secret, guess):
    """Return (exact, present) counts in Mastermind style."""
    exact = sum(s == g for s, g in zip(secret, guess))

    # Count overlaps ignoring position, then subtract the exact matches.
    overlap = 0
    for digit in range(10):
        overlap += min(secret.count(digit), guess.count(digit))
    present = overlap - exact
    return exact, present


def parse_guess(text, length=CODE_LENGTH):
    """Validate user input -> list of ints, or None if invalid."""
    text = text.strip()
    if len(text) != length or not text.isdigit():
        return None
    return [int(c) for c in text]


def play():
    secret = make_secret()
    print(f"\n🔐  Code Breaker — crack the secret {CODE_LENGTH}-digit code!")
    print(f"You have {MAX_TURNS} guesses. Digits can repeat (0-9).\n")

    for turn in range(1, MAX_TURNS + 1):
        raw = input(f"Guess {turn}/{MAX_TURNS}: ")
        guess = parse_guess(raw)
        if guess is None:
            print(f"  ⚠️  Enter exactly {CODE_LENGTH} digits.\n")
            continue

        exact, present = score(secret, guess)
        if exact == CODE_LENGTH:
            print(f"\n🎉  Cracked it in {turn} guesses! The code was "
                  f"{''.join(map(str, secret))}.")
            return

        print(f"  ✅ {exact} right digit & place   "
              f"🔄 {present} right digit, wrong place\n")

    print(f"\n💥  Out of guesses! The code was "
          f"{''.join(map(str, secret))}.")


if __name__ == "__main__":
    try:
        play()
    except (KeyboardInterrupt, EOFError):
        print("\nBye!")
