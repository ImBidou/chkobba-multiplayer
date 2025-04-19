// server/game/Game_1v1.js

const Deck = require('./Deck');
const Player = require('./Player'); // Assumes Player.js stores name
const {
    CARD_VALUES,
    DEAL_HAND_SIZE,
    DEAL_TABLE_SIZE,
    DINERI_SUIT,
    SEVEN_OF_DINERI_VALUE,
    POINTS_RULES
} = require('./constants');

// findSumCombinations helper function (remains same)
function findSumCombinations(targetValue, availableCards) {
    const validCombinations = [];
    function findCombosRecursive(startIndex, currentSum, currentCombo) {
        if (currentSum === targetValue) { validCombinations.push([...currentCombo]); }
        if (currentSum >= targetValue || startIndex >= availableCards.length) { return; }
        const currentCard = availableCards[startIndex];
        const cardValue = CARD_VALUES[currentCard.value];
        if (cardValue === undefined) { findCombosRecursive(startIndex + 1, currentSum, currentCombo); return; } // Skip invalid
        currentCombo.push(currentCard);
        findCombosRecursive(startIndex + 1, currentSum + cardValue, currentCombo);
        currentCombo.pop();
        findCombosRecursive(startIndex + 1, currentSum, currentCombo);
    }
    findCombosRecursive(0, 0, []);
    return validCombinations;
}


class Game_1v1 {
  // Accept array of 2 player objects {id, name} and winning score
  constructor(roomId, playersInfo, startingPlayerIndex = 0, initialWinningScore = 11) {
    this.roomId = roomId;
    this.playersInfo = playersInfo; // Store [{id, name}, {id, name}]
    this.playerIds = playersInfo.map(p => p.id); // Ordered IDs [p0, p1]
    this.players = new Map(); // Map socket.id -> Player instance
    this.deck = new Deck();
    this.tableCards = [];
    this.initialStartingPlayerIndex = startingPlayerIndex;
    this.currentPlayerIndex = undefined;
    this.roundResults = null; // Stores detailed results object when round ends
    this.matchScores = {}; // Store match scores per player ID
    this.lastCaptureBy = null; // Store playerId
    this.isRoundOver = false;
    this.isGameOver = false;
    this.winningScore = initialWinningScore === 21 ? 21 : 11; // Use parameter, validate/default
    this.awaitingTieDecision = false; // For 11-11 tie
    this.tieDecisions = {}; // Store player decisions {playerId: 'tie' | 'playTo21'}
    this.awaitingCaptureChoice = null; // Stores {playerId, playedCard, combinations}
    this.awaitingExactMatchChoice = null; // Stores {playerId, playedCard, options: [card, card]}

    this.initializeGame();
  }

  initializeGame() {
    console.log(`[Game ${this.roomId}] Initializing 1v1 game for players: ${this.playersInfo.map(p=>p.name).join(' vs ')}, playing to ${this.winningScore}`);
    this.playersInfo.forEach(pInfo => {
        this.players.set(pInfo.id, new Player(pInfo.id, pInfo.name)); // Create Player with name
        this.matchScores[pInfo.id] = 0; // Initialize match score per player ID
    });
    this.startNewRound();
  }

  startNewRound() {
    console.log(`[Game ${this.roomId}] Starting new round.`);
    this.deck = new Deck();
    this.tableCards = [];
    this.lastCaptureBy = null;
    this.isRoundOver = false;
    this.roundResults = null;
    this.awaitingTieDecision = false;
    this.tieDecisions = {};
    this.awaitingCaptureChoice = null;
    this.awaitingExactMatchChoice = null; // Reset new flag

    // Alternate starting player
    this.currentPlayerIndex = (this.currentPlayerIndex === undefined) ?
        (this.initialStartingPlayerIndex % this.playerIds.length) :
        (this.currentPlayerIndex + 1) % this.playerIds.length; // Cycles 0, 1 for 1v1

    this.players.forEach(player => player.resetForNewRound());

    this.tableCards.push(...this.deck.deal(DEAL_TABLE_SIZE));
    // Deal 3 cards to each of the 2 players
    this.playerIds.forEach(playerId => {
      const player = this.players.get(playerId);
      if (player) player.addCardsToHand(this.deck.deal(DEAL_HAND_SIZE));
    });
    const startingPlayer = this.players.get(this.getCurrentPlayerId());
    console.log(`[Game ${this.roomId}] New round deal complete. Starting player: ${startingPlayer?.name} (${startingPlayer?.id?.substring(0,4)})`);
  }

  getCurrentPlayerId() {
    if (this.currentPlayerIndex === undefined || this.currentPlayerIndex >= this.playerIds.length) return null;
    return this.playerIds[this.currentPlayerIndex];
  }

  // --- playTurn includes exact match choice ---
  
  playTurn(playerId, cardId) {
    // 1. Initial Validations
    if (this.awaitingCaptureChoice) return { success: false, reason: "Waiting for sum capture choice" };
    if (this.awaitingExactMatchChoice) return { success: false, reason: "Waiting for exact match choice" };
    if (this.awaitingTieDecision) return { success: false, reason: "Waiting for tie decision" };
    if (this.isRoundOver || this.isGameOver) return { success: false, reason: "Game/Round is over" };
    if (playerId !== this.getCurrentPlayerId()) return { success: false, reason: "Not your turn" };

    const player = this.players.get(playerId);
    if (!player) return { success: false, reason: "Player not found" };
    const cardToPlay = player.hand.find(card => card.id === cardId);
    if (!cardToPlay) return { success: false, reason: "Card not found in hand" };

    console.log(`[Game ${this.roomId}] Player ${player.name} attempts to play ${cardId}`);
    player.removeCardFromHand(cardId);

    const isPotentiallyLastPlay = player.hand.length === 0 && this.deck.isEmpty();
    const isFaceCard = ['J', 'Q', 'K'].includes(cardToPlay.value);
    const playedCardValue = CARD_VALUES[cardToPlay.value];
    let capturedCards = [];
    let didCapture = false;

    // --- Corrected Capture Logic ---

    // 1. Check for PRIORITY Exact Match (Rank for Face, Value for Number)
    let exactMatches = [];
    if (isFaceCard) {
        exactMatches = this.tableCards.filter(tc => tc?.value === cardToPlay.value);
    } else {
        exactMatches = this.tableCards.filter(tc => tc && CARD_VALUES[tc.value] === playedCardValue);
    }
    console.log(`[Game ${this.roomId}] Found ${exactMatches.length} exact match(es) for ${cardToPlay.id}.`);

    // 2. Handle Matches
    if (exactMatches.length === 1) { // Exactly one exact match
        console.log(`[Game ${this.roomId}] Capturing single exact match: ${exactMatches[0].id}`);
        capturedCards = [exactMatches[0]];
        this.tableCards = this.tableCards.filter(tc => tc.id !== exactMatches[0].id);
        didCapture = true;
    } else if (exactMatches.length > 1) { // Multiple Exact Matches -> Await Choice
        console.log("DEBUG: Entering awaitingExactMatchChoice block."); // Log path
        this.awaitingExactMatchChoice = { playerId, playedCard: cardToPlay, options: exactMatches };
        return { success: true, awaitingExactMatchChoice: true, exactMatchOptions: exactMatches, playedCardData: cardToPlay, newState: this.getGameState() };
    } else { // No Exact Matches Found -> Check Sums
        console.log(`[Game ${this.roomId}] No exact match found. Checking sums for value ${playedCardValue}.`);
        const possibleCombinations = findSumCombinations(playedCardValue, this.tableCards);
        console.log(`DEBUG: Found ${possibleCombinations.length} sum combinations.`);

        // *** CORRECTED Conditional Logic for Sums ***
        if (possibleCombinations.length === 0) {
            // No Sum Match Found
            console.log(`[Game ${this.roomId}] No sum combinations found.`);
            didCapture = false;
        } else if (possibleCombinations.length === 1) {
            // Exactly ONE Sum Match Found - Capture it
            capturedCards = [...possibleCombinations[0]];
            console.log(`[Game ${this.roomId}] Single sum match found:`, capturedCards.map(c => c.id));
            const capturedIds = new Set(capturedCards.map(c => c.id));
            this.tableCards = this.tableCards.filter(tableCard => !capturedIds.has(tableCard.id));
            didCapture = true;
        } else {
            // --- Multiple Sum Combinations Found --- AWAIT CHOICE
            console.log("DEBUG: Entering awaitingCaptureChoice block."); // Log path
            this.awaitingCaptureChoice = {
                playerId: playerId,
                playedCard: cardToPlay,
                combinations: possibleCombinations
            };
            // Return special status object
            return {
                success: true,
                awaitingCaptureChoice: true, // Set flag
                captureOptions: possibleCombinations,
                playedCardData: cardToPlay,
                newState: this.getGameState()
            };
        }
        // *** END CORRECTED Conditional Logic ***
    } // End Capture Logic Checks

    // 3. Process Capture Result (Only runs if NOT awaiting choice)
    let chkobbaAchieved = false;
    if (didCapture) {
        player.addCapturedCards([cardToPlay, ...capturedCards]);
        this.lastCaptureBy = playerId;
        if (this.tableCards.length === 0) {
            console.log(`DEBUG Chk: Table cleared. isPotentiallyLastPlay = ${isPotentiallyLastPlay}`);
            if (!isPotentiallyLastPlay) {
                chkobbaAchieved = true; player.addChkobba(); console.log(`[Game ${this.roomId}] ${player.name} achieved CHKOBBA!`);
            } else { console.log(`[Game ${this.roomId}] ${player.name} cleared table on last play (No Chkobba point).`); }
        }
    } else {
        this.tableCards.push(cardToPlay);
        console.log(`[Game ${this.roomId}] Card ${cardToPlay.id} added to table.`);
    }

    // 4. Check game state & Advance turn
    this.checkAndAdvanceGameState();

    // 5. Return final state for this resolved turn
    console.log("DEBUG: Returning standard success object from playTurn.");
    return {
        success: true, didCapture, chkobbaAchieved,
        roundOver: this.isRoundOver, gameOver: this.isGameOver,
        awaitingTieDecision: this.awaitingTieDecision,
        awaitingCaptureChoice: false, awaitingExactMatchChoice: false, // Resolved or wasn't needed
        newState: this.getGameState()
    };
  } // End playTurn


  // --- resolveCaptureChoice method --- (Handles SUM choice)
  resolveCaptureChoice(playerId, chosenCombinationIds) {
      // ... (validation checks as before) ...
      if (!this.awaitingCaptureChoice || this.awaitingCaptureChoice.playerId !== playerId) return { success: false, reason: "Not awaiting sum choice." };
      const { playedCard, combinations } = this.awaitingCaptureChoice;
      const chosenCombination = combinations.find(combo => Array.isArray(combo) && combo.length === chosenCombinationIds.length && chosenCombinationIds.every(id => combo.some(card => card?.id === id)) && combo.every(card => card && chosenCombinationIds.includes(card.id)) );
      if (!chosenCombination) return { success: false, reason: "Invalid sum combination chosen." };
      const player = this.players.get(playerId);
      if (!player) return { success: false, reason: "Player not found." };

      const isPotentiallyLastPlay = player.hand.length === 0 && this.deck.isEmpty();
      console.log(`DEBUG Chk (Resolve Sum): Hand empty=${player.hand.length === 0}, Deck empty=${this.deck.isEmpty()}, Potential Last Play=${isPotentiallyLastPlay}`);

      // Perform Capture
      const capturedCards = [...chosenCombination];
      const capturedIds = new Set(capturedCards.map(c => c.id));
      this.tableCards = this.tableCards.filter(tableCard => !capturedIds.has(tableCard.id));
      player.addCapturedCards([playedCard, ...capturedCards]);
      this.lastCaptureBy = playerId;
      let chkobbaAchieved = false;
      if (this.tableCards.length === 0) {
           console.log(`DEBUG Chk (Resolve Sum): Table cleared. isPotentiallyLastPlay = ${isPotentiallyLastPlay}`);
           if (!isPotentiallyLastPlay) { chkobbaAchieved = true; player.addChkobba(); console.log(`[Game ${this.roomId}] Player ${player.name} achieved CHKOBBA via sum choice! (addChkobba called)`); }
           else { console.log(`[Game ${this.roomId}] Player ${player.name} cleared table via sum choice on last play.`); }
      }

      this.awaitingCaptureChoice = null; // Clear flag
      this.checkAndAdvanceGameState(); // Advance game

      return { success: true, didCapture: true, chkobbaAchieved, roundOver: this.isRoundOver, gameOver: this.isGameOver, awaitingTieDecision: this.awaitingTieDecision, awaitingCaptureChoice: false, awaitingExactMatchChoice: false, newState: this.getGameState() };
  } // End resolveCaptureChoice


 // --- resolveExactMatchChoice method --- (Handles EXACT match choice)
 resolveExactMatchChoice(playerId, chosenCardId) {
      console.log(`DEBUG resolveExactMatchChoice: Player=${playerId.substring(0,4)} submitted choice ${chosenCardId}`);
      if (!this.awaitingExactMatchChoice || this.awaitingExactMatchChoice.playerId !== playerId) { return { success: false, reason: "Not awaiting exact match choice." }; }
      const { playedCard, options } = this.awaitingExactMatchChoice;
      const chosenCard = options.find(card => card && card.id === chosenCardId);
      if (!chosenCard) { return { success: false, reason: "Invalid exact match card chosen." }; }

      const player = this.players.get(playerId);
      if (!player) return { success: false, reason: "Player not found." };

      const isPotentiallyLastPlay = player.hand.length === 0 && this.deck.isEmpty();
      console.log(`DEBUG Chk (Resolve Exact): Hand empty=${player.hand.length === 0}, Deck empty=${this.deck.isEmpty()}, Potential Last Play=${isPotentiallyLastPlay}`);

      console.log(`[Game ${this.roomId}] Player ${playerId.substring(0,4)} chose exact match: ${chosenCard.id}`);
      // Perform Capture
      this.tableCards = this.tableCards.filter(tableCard => tableCard.id !== chosenCard.id); // Remove chosen card
      player.addCapturedCards([playedCard, chosenCard]);
      this.lastCaptureBy = playerId;
      let chkobbaAchieved = false;
      if (this.tableCards.length === 0) {
          console.log(`DEBUG Chk (Resolve Exact): Table cleared. isPotentiallyLastPlay = ${isPotentiallyLastPlay}`);
          if (!isPotentiallyLastPlay) { chkobbaAchieved = true; player.addChkobba(); console.log(`[Game ${this.roomId}] Player ${player.name} achieved CHKOBBA via exact choice! (addChkobba called)`);}
          else { console.log(`[Game ${this.roomId}] Player ${player.name} cleared table via exact choice on last play.`); }
      }

      this.awaitingExactMatchChoice = null; // Clear flag
      this.checkAndAdvanceGameState(); // Advance game

      return { success: true, didCapture: true, chkobbaAchieved, roundOver: this.isRoundOver, gameOver: this.isGameOver, awaitingTieDecision: this.awaitingTieDecision, awaitingCaptureChoice: false, awaitingExactMatchChoice: false, newState: this.getGameState() };
  } // End resolveExactMatchChoice


  // --- checkAndAdvanceGameState helper ---
  checkAndAdvanceGameState() {
       // Don't advance if waiting for ANY choice/decision
       if (this.awaitingTieDecision || this.awaitingCaptureChoice || this.awaitingExactMatchChoice) return;

       let allHandsEmpty = !Array.from(this.players.values()).some(p => p.hand.length > 0);
       if (allHandsEmpty && !this.deck.isEmpty()) { this.dealMoreCards(); allHandsEmpty = !Array.from(this.players.values()).some(p => p.hand.length > 0); }
       if (allHandsEmpty && this.deck.isEmpty()) { this.endRound(); }
       // Advance turn only if round/game didn't end
       if (!this.isRoundOver && !this.isGameOver) {
            this.advanceTurn();
       }
   }

  // --- dealMoreCards method ---
  dealMoreCards() {
       if (this.deck.isEmpty()) return false;
       let cardsDealt = false;
       this.playerIds.forEach(playerId => { // Deals to both players
            const player = this.players.get(playerId);
            if (player && player.hand.length === 0) {
                const cardsToDeal = Math.min(DEAL_HAND_SIZE, this.deck.cardsLeft());
                if (cardsToDeal > 0) { player.addCardsToHand(this.deck.deal(cardsToDeal)); cardsDealt = true; }
            }
       });
        if (cardsDealt) console.log(`[Game ${this.roomId}] Dealt more cards. Deck size: ${this.deck.cardsLeft()}`);
       return cardsDealt;
   }

   // --- endRound method --- (Includes tie check)
   endRound() {
       console.log(`[Game ${this.roomId}] Round Over.`);
       this.isRoundOver = true;
       this.awaitingTieDecision = false; this.tieDecisions = {}; // Reset tie state
       // Award remaining cards
       if (this.lastCaptureBy && this.tableCards.length > 0) { const lastCapturer = this.players.get(this.lastCaptureBy); if (lastCapturer) lastCapturer.addCapturedCards(this.tableCards); }
       this.tableCards = [];
       this.calculateRoundScore(); // Calculate detailed 1v1 scores

       // Check Game End / Tie Decision for 1v1
       const p1Score = this.matchScores[this.playerIds[0]] || 0;
       const p2Score = this.matchScores[this.playerIds[1]] || 0;
       if (this.winningScore === 11 && p1Score === 11 && p2Score === 11) { this.awaitingTieDecision = true; this.isGameOver = false; console.log(`Score is 11-11! Awaiting decision.`); }
       else if (p1Score >= this.winningScore || p2Score >= this.winningScore) { this.isGameOver = true; this.awaitingTieDecision = false; console.log(`Game Over! Scores:`, this.matchScores); }
       else { this.isGameOver = false; this.awaitingTieDecision = false; console.log(`Round finished. Scores:`, this.matchScores); }
  }

   // --- processTieDecision method --- (Handles 11-11 tie)
   processTieDecision(playerId, decision) {
       if (!this.awaitingTieDecision || this.tieDecisions[playerId]) return { success: false, reason: "Not awaiting/already decided." };
       if (decision !== 'tie' && decision !== 'playTo21') return { success: false, reason: "Invalid decision." };
       this.tieDecisions[playerId] = decision;
       const player = this.players.get(playerId);
       console.log(`Player ${player?.name} decided: ${decision}`);
       if (Object.keys(this.tieDecisions).length === this.playerIds.length) {
           const decisions = Object.values(this.tieDecisions);
           this.awaitingTieDecision = false;
           if (decisions.every(d => d === 'playTo21')) { this.winningScore = 21; return { success: true, status: 'continueTo21' }; }
           else { this.isGameOver = true; return { success: true, status: 'tieAgreed' }; }
       } else { return { success: true, status: 'waitingForOpponentDecision' }; }
   }

  // --- advanceTurn method --- (Handles 1v1)
  advanceTurn() {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.playerIds.length; // Modulo 2
      const nextPlayer = this.players.get(this.getCurrentPlayerId());
      console.log(`[Game ${this.roomId}] Turn advanced to ${nextPlayer?.name} (${this.getCurrentPlayerId()?.substring(0,4)})`);
  }

  // --- calculateRoundScore method --- (Detailed 1v1 scoring)
  calculateRoundScore() {
       if (this.playerIds.length !== 2) { this.roundResults = { points: {}, winners: {}, chkobbas: {}, counts: {} }; return; }
       const [p1Id, p2Id] = this.playerIds;
       const player1 = this.players.get(p1Id);
       const player2 = this.players.get(p2Id);
       if (!player1 || !player2) { this.roundResults = { points: {}, winners: {}, chkobbas: {}, counts: {} }; return; }

       const results = { points: { [p1Id]: 0, [p2Id]: 0 }, winners: { mostCards: null, mostDineri: null, sevenOfDineri: null, mostSevensOrSixes: null }, chkobbas: { [p1Id]: player1.chkobbaCount, [p2Id]: player2.chkobbaCount }, counts: { cards: {}, dineri: {}, sevens: {}, sixes: {} }};
       let p1RoundTotal = 0; let p2RoundTotal = 0;
       // Comparisons (Most Cards, Dineri, 7-Dineri, 7s/6s) - logic remains same, populates results.winners for p1Id/p2Id/tie
        const p1CardCount = player1.capturedCards.length; const p2CardCount = player2.capturedCards.length; results.counts.cards[p1Id] = p1CardCount; results.counts.cards[p2Id] = p2CardCount; if (p1CardCount > p2CardCount) { results.winners.mostCards = p1Id; p1RoundTotal += 1; } else if (p2CardCount > p1CardCount) { results.winners.mostCards = p2Id; p2RoundTotal += 1; } else { results.winners.mostCards = 'tie'; }
        const p1DineriCards = player1.capturedCards.filter(c => c.suit === DINERI_SUIT); const p2DineriCards = player2.capturedCards.filter(c => c.suit === DINERI_SUIT); results.counts.dineri[p1Id] = p1DineriCards.length; results.counts.dineri[p2Id] = p2DineriCards.length; if (p1DineriCards.length > p2DineriCards.length) { results.winners.mostDineri = p1Id; p1RoundTotal += 1; } else if (p2DineriCards.length > p1DineriCards.length) { results.winners.mostDineri = p2Id; p2RoundTotal += 1; } else { results.winners.mostDineri = 'tie'; }
        if (p1DineriCards.some(c => c.value === SEVEN_OF_DINERI_VALUE)) { results.winners.sevenOfDineri = p1Id; p1RoundTotal += 1; } else if (p2DineriCards.some(c => c.value === SEVEN_OF_DINERI_VALUE)) { results.winners.sevenOfDineri = p2Id; p2RoundTotal += 1; }
        const p1Sevens = player1.capturedCards.filter(c => c.value === '7').length; const p2Sevens = player2.capturedCards.filter(c => c.value === '7').length; results.counts.sevens[p1Id] = p1Sevens; results.counts.sevens[p2Id] = p2Sevens; if (p1Sevens > p2Sevens) { results.winners.mostSevensOrSixes = p1Id; p1RoundTotal += 1; } else if (p2Sevens > p1Sevens) { results.winners.mostSevensOrSixes = p2Id; p2RoundTotal += 1; } else { const p1Sixes = player1.capturedCards.filter(c => c.value === '6').length; const p2Sixes = player2.capturedCards.filter(c => c.value === '6').length; results.counts.sixes[p1Id] = p1Sixes; results.counts.sixes[p2Id] = p2Sixes; if (p1Sixes > p2Sixes) { results.winners.mostSevensOrSixes = p1Id; p1RoundTotal += 1; } else if (p2Sixes > p1Sixes) { results.winners.mostSevensOrSixes = p2Id; p2RoundTotal += 1; } else { results.winners.mostSevensOrSixes = 'tie'; } }
       // Chkobbas
       p1RoundTotal += results.chkobbas[p1Id] * POINTS_RULES.CHKOBBA;
       p2RoundTotal += results.chkobbas[p2Id] * POINTS_RULES.CHKOBBA;
       // Store totals and update match scores
       results.points[p1Id] = p1RoundTotal; results.points[p2Id] = p2RoundTotal;
       this.matchScores[p1Id] = (this.matchScores[p1Id] || 0) + p1RoundTotal;
       this.matchScores[p2Id] = (this.matchScores[p2Id] || 0) + p2RoundTotal;
       this.roundResults = results; // Store detailed results
       console.log(`[Game ${this.roomId}] Round Score Calculated. Details:`, JSON.stringify(this.roundResults));
       console.log(`[Game ${this.roomId}] Match Scores Updated:`, this.matchScores);
  }


  // --- getGameState method --- (Sends general state including flags)
  getGameState() {
       const playersState = {};
        this.playerIds.forEach(pid => { const p = this.players.get(pid); if(p) playersState[pid] = { id: pid, name: p.name, handCount: p.hand.length, capturedCount: p.capturedCards.length, chkobbas: p.chkobbaCount };});
      return {
          roomId: this.roomId, playersInfo: playersState, tableCards: this.tableCards,
          currentPlayerId: this.getCurrentPlayerId(), scores: this.matchScores,
          lastCaptureBy: this.lastCaptureBy, deckSize: this.deck.cardsLeft(),
          isRoundOver: this.isRoundOver, isGameOver: this.isGameOver,
          awaitingTieDecision: this.awaitingTieDecision, winningScore: this.winningScore,
          roundResults: this.isRoundOver ? this.roundResults : null,
          awaitingCaptureChoice: !!this.awaitingCaptureChoice, // Send boolean flag
          awaitingExactMatchChoice: !!this.awaitingExactMatchChoice // Send boolean flag
      };
  }

  // --- getGameStateForPlayer method --- (Sends personalized state including options)
  getGameStateForPlayer(playerId) {
      const generalState = this.getGameState();
      const player = this.players.get(playerId);
      const personalizedState = { // Start with necessary general state fields
            roomId: generalState.roomId, tableCards: generalState.tableCards,
            currentPlayerId: generalState.currentPlayerId, scores: generalState.scores,
            lastCaptureBy: generalState.lastCaptureBy, deckSize: generalState.deckSize,
            isRoundOver: generalState.isRoundOver, isGameOver: generalState.isGameOver,
            awaitingTieDecision: generalState.awaitingTieDecision, winningScore: generalState.winningScore,
            roundResults: generalState.roundResults,
            awaitingCaptureChoice: generalState.awaitingCaptureChoice,
            awaitingExactMatchChoice: generalState.awaitingExactMatchChoice,
            myId: playerId // Explicitly tell client their ID
      };

      if (player) { // Add own specific data
          personalizedState.myHand = player.getHandState();
          personalizedState.myPlayerData = { id: player.id, name: player.name, capturedCount: player.capturedCards.length, chkobbas: player.chkobbaCount };
      } else {
          personalizedState.myHand = []; personalizedState.myPlayerData = { id: playerId, name: 'Error', capturedCount: 0, chkobbas: 0 };
      }

      // Add opponent data for 1v1
      personalizedState.opponents = this.playerIds
          .filter(pid => pid !== playerId)
          .map(oppId => generalState.playersInfo[oppId] || {id: oppId, name: 'Opponent'}); // Get opponent info
      personalizedState.partner = null; // No partner in 1v1

      // Add capture choice data ONLY if awaiting from THIS player
      if (this.awaitingCaptureChoice && this.awaitingCaptureChoice.playerId === playerId) {
          personalizedState.captureOptions = this.awaitingCaptureChoice.combinations;
          personalizedState.playedCardForChoice = this.awaitingCaptureChoice.playedCard;
      } else if (this.awaitingExactMatchChoice && this.awaitingExactMatchChoice.playerId === playerId) {
          personalizedState.exactMatchOptions = this.awaitingExactMatchChoice.options;
          personalizedState.playedCardForChoice = this.awaitingExactMatchChoice.playedCard;
      } else { // Ensure options are null if not awaiting choice from this player
           personalizedState.captureOptions = null;
           personalizedState.exactMatchOptions = null;
           personalizedState.playedCardForChoice = null;
      }

      // Remove playersInfo map if client only needs specific opponent/partner data
      // delete personalizedState.playersInfo;

      // console.log(`DEBUG getGameStateForPlayer [${playerId.substring(0,4)}]: Returning state keys: [${Object.keys(personalizedState).join(', ')}]`);
      return personalizedState;
  }


} // End Class Game_1v1

module.exports = Game_1v1; // Export correct class name