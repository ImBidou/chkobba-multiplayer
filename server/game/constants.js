// server/game/constants.js

const CARD_VALUES = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7,
  "J": 9, "Q": 8, "K": 10, "A": 1
};

// --- UPDATED SUITS ---
const SUITS = ["diamonds", "hearts", "clubs", "spades"]; // Use lowercase 'diamonds'
// --- Use internal values consistent with CARD_VALUES ---
const VALUES = ["2", "3", "4", "5", "6", "7", "J", "Q", "K", "A"];

// --- UPDATED DINERI CONSTANT ---
const DINERI_SUIT = "diamonds"; // Use lowercase 'diamonds'
const SEVEN_OF_DINERI_VALUE = "7"; // Value remains '7'

const POINTS_RULES = {
  MOST_CARDS: 1,
  MOST_DINERI: 1,
  SEVEN_OF_DINERI: 1,
  MOST_SEVENS_OR_SIXES: 1,
  CHKOBBA: 1,
};

const DEAL_HAND_SIZE = 3;
const DEAL_TABLE_SIZE = 4;
const DECK_SIZE = 40;

module.exports = {
  CARD_VALUES,
  SUITS, // Now contains 'diamonds'
  VALUES,
  DINERI_SUIT, // Now 'diamonds'
  SEVEN_OF_DINERI_VALUE,
  POINTS_RULES,
  DEAL_HAND_SIZE,
  DEAL_TABLE_SIZE,
  DECK_SIZE,
};