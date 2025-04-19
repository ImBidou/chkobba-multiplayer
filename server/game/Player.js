// server/game/Player.js

class Player {
  constructor(id, name = 'Player') { // Accept and store name
    this.id = id; // socket.id
    this.name = name; // Player's chosen nickname
    this.hand = [];
    this.capturedCards = [];
    this.chkobbaCount = 0;
  }

  addCardsToHand(cards) {
    this.hand.push(...cards);
  }

  removeCardFromHand(cardId) {
    const index = this.hand.findIndex(card => card.id === cardId);
    if (index !== -1) {
      return this.hand.splice(index, 1)[0];
    }
    return null;
  }

  addCapturedCards(cards) {
    this.capturedCards.push(...cards);
  }

  addChkobba() {
      this.chkobbaCount++;
  }

  resetForNewRound() {
      this.hand = [];
      this.capturedCards = [];
      this.chkobbaCount = 0;
  }

  getHandState() {
      return this.hand;
  }
}

module.exports = Player;