// server/game/Deck.js

const { SUITS, VALUES } = require('./constants');

// Simple card representation for the server
function createCard(value, suit) {
  // Use a consistent ID format, maybe simpler than on client
  return { value, suit, id: `${value}-${suit}` };
}

class Deck {
  constructor() {
    this.cards = this.generate();
    this.shuffle();
  }

  generate() {
    const deck = [];
    for (const suit of SUITS) {
      for (const value of VALUES) {
        deck.push(createCard(value, suit));
      }
    }
    return deck;
  }

  shuffle() {
    // Fisher-Yates shuffle
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  deal(count) {
    // Deals 'count' cards from the top (end of array)
    if (count > this.cards.length) {
        console.warn(`Deck Warning: Trying to deal ${count} cards, but only ${this.cards.length} remain.`);
        count = this.cards.length;
    }
    return this.cards.splice(-count, count); // Removes cards from deck
  }

  isEmpty() {
    return this.cards.length === 0;
  }

  cardsLeft() {
      return this.cards.length;
  }
}

module.exports = Deck;