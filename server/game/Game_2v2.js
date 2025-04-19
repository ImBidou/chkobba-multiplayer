// server/game/Game_2v2.js
// Final version with correct playTurn, team scoring, 4p state

const Deck = require('./Deck');
const Player = require('./Player');
const {
    CARD_VALUES, DEAL_HAND_SIZE, DEAL_TABLE_SIZE, DINERI_SUIT,
    SEVEN_OF_DINERI_VALUE, POINTS_RULES
} = require('./constants');

function findSumCombinations(targetValue, availableCards) {
    const validCombinations = [];
    function findCombosRecursive(startIndex, currentSum, currentCombo) {
        if (currentSum === targetValue) { validCombinations.push([...currentCombo]); }
        if (currentSum >= targetValue || startIndex >= availableCards.length) { return; }
        const currentCard = availableCards[startIndex];
        const cardValue = CARD_VALUES[currentCard?.value];
        if (cardValue === undefined) { findCombosRecursive(startIndex + 1, currentSum, currentCombo); return; }
        currentCombo.push(currentCard);
        findCombosRecursive(startIndex + 1, currentSum + cardValue, currentCombo);
        currentCombo.pop();
        findCombosRecursive(startIndex + 1, currentSum, currentCombo);
    }
    findCombosRecursive(0, 0, []);
    return validCombinations;
}

class Game_2v2 {
  constructor(roomId, playersInfo, startingPlayerIndex = 0, initialWinningScore = 11) {
    this.roomId = roomId;
    this.playersInfo = playersInfo;
    this.playerIds = playersInfo.map(p => p.id);
    this.players = new Map();
    this.teams = { 'TeamA': [playersInfo[0].id, playersInfo[2].id], 'TeamB': [playersInfo[1].id, playersInfo[3].id] };
    this.playerToTeam = {};
    this.teams.TeamA.forEach(pid => this.playerToTeam[pid] = 'TeamA');
    this.teams.TeamB.forEach(pid => this.playerToTeam[pid] = 'TeamB');
    this.deck = new Deck();
    this.tableCards = [];
    this.initialStartingPlayerIndex = startingPlayerIndex;
    this.currentPlayerIndex = undefined;
    this.roundResults = null;
    this.matchScores = { 'TeamA': 0, 'TeamB': 0 }; // Team scores
    this.lastCaptureBy = null;
    this.isRoundOver = false;
    this.isGameOver = false;
    this.winningScore = initialWinningScore === 21 ? 21 : 11;
    this.awaitingTieDecision = false; // Disabled/revisit for 2v2
    this.tieDecisions = {};
    this.awaitingCaptureChoice = null;
    this.awaitingExactMatchChoice = null;
    this.initializeGame();
  }

  initializeGame() {
    console.log(`[Game ${this.roomId}] Initializing 2v2 game for teams: A=[${this.teams.TeamA.map(id => this.playersInfo.find(p=>p.id===id)?.name).join(',')}] B=[${this.teams.TeamB.map(id => this.playersInfo.find(p=>p.id===id)?.name).join(',')}]`);
    this.playersInfo.forEach(pInfo => { this.players.set(pInfo.id, new Player(pInfo.id, pInfo.name)); });
    this.startNewRound();
  }

  startNewRound() {
    console.log(`[Game ${this.roomId}] Starting new 2v2 round.`);
    this.deck = new Deck(); this.tableCards = []; this.lastCaptureBy = null; this.isRoundOver = false; this.roundResults = null; this.awaitingCaptureChoice = null; this.awaitingExactMatchChoice = null; this.awaitingTieDecision = false; this.tieDecisions = {};
    this.currentPlayerIndex = (this.currentPlayerIndex === undefined) ? (this.initialStartingPlayerIndex % this.playerIds.length) : (this.currentPlayerIndex + 1) % this.playerIds.length;
    this.players.forEach(player => player.resetForNewRound());
    this.tableCards.push(...this.deck.deal(DEAL_TABLE_SIZE));
    this.playerIds.forEach(playerId => { const player = this.players.get(playerId); if (player) player.addCardsToHand(this.deck.deal(DEAL_HAND_SIZE)); });
    const startingPlayer = this.players.get(this.getCurrentPlayerId());
    console.log(`[Game ${this.roomId}] New round deal complete. Starting player: ${startingPlayer?.name} (${startingPlayer?.id?.substring(0,4)})`);
  }

  getCurrentPlayerId() { return this.playerIds?.[this.currentPlayerIndex] ?? null; }

  // --- Corrected playTurn for 2v2 ---
  playTurn(playerId, cardId) {
    if (this.awaitingCaptureChoice || this.awaitingExactMatchChoice || this.awaitingTieDecision || this.isRoundOver || this.isGameOver) return { success: false, reason: "Waiting for input or game/round over" };
    if (playerId !== this.getCurrentPlayerId()) return { success: false, reason: "Not your turn" };
    const player = this.players.get(playerId); if (!player) return { success: false, reason: "Player not found" };
    const cardToPlay = player.hand.find(card => card.id === cardId); if (!cardToPlay) return { success: false, reason: "Card not found" };

    console.log(`[Game ${this.roomId}] Player ${player.name} attempts to play ${cardId}`);
    player.removeCardFromHand(cardId);
    const isPotentiallyLastPlay = player.hand.length === 0 && this.deck.isEmpty();
    const isFaceCard = ['J', 'Q', 'K'].includes(cardToPlay.value);
    const playedCardValue = CARD_VALUES[cardToPlay.value];
    let capturedCards = []; let didCapture = false;

    // 1. Check Exact Match (Rank for Face, Value for Number)
    let exactMatches = [];
    if (isFaceCard) { exactMatches = this.tableCards.filter(tc => tc?.value === cardToPlay.value); }
    else { exactMatches = this.tableCards.filter(tc => tc && CARD_VALUES[tc.value] === playedCardValue); }
    console.log(`[Game ${this.roomId}] Found ${exactMatches.length} exact match(es) for ${cardToPlay.id}.`);

    // 2. Handle Matches
    if (exactMatches.length === 1) { // Single Exact Match
        capturedCards = [exactMatches[0]]; this.tableCards = this.tableCards.filter(tc => tc.id !== exactMatches[0].id); didCapture = true;
    } else if (exactMatches.length > 1) { // Multiple Exact Matches -> Await Choice
        this.awaitingExactMatchChoice = { playerId, playedCard: cardToPlay, options: exactMatches };
        return { success: true, awaitingExactMatchChoice: true, exactMatchOptions: exactMatches, playedCardData: cardToPlay, newState: this.getGameState() };
    } else { // No Exact Match -> Check Sums
        const possibleCombinations = findSumCombinations(playedCardValue, this.tableCards);
        console.log(`DEBUG: Found ${possibleCombinations.length} sum combinations.`);
        if (possibleCombinations.length === 0) { didCapture = false; }
        else if (possibleCombinations.length === 1) { // Single Sum Match
            capturedCards = [...possibleCombinations[0]]; const capturedIds = new Set(capturedCards.map(c => c.id)); this.tableCards = this.tableCards.filter(tc => !capturedIds.has(tc.id)); didCapture = true;
        } else { // Multiple Sum Matches -> Await Choice (Applies to Face OR Number if exact match failed)
            console.log("DEBUG: Entering awaitingCaptureChoice block.");
            this.awaitingCaptureChoice = { playerId, playedCard: cardToPlay, combinations: possibleCombinations };
            return { success: true, awaitingCaptureChoice: true, captureOptions: possibleCombinations, playedCardData: cardToPlay, newState: this.getGameState() };
        }
    } // End Capture Logic Checks

    // Process Capture Result (if not awaiting choice)
    let chkobbaAchieved = false;
    if (didCapture) {
        player.addCapturedCards([cardToPlay, ...capturedCards]); this.lastCaptureBy = playerId;
        if (this.tableCards.length === 0 && !isPotentiallyLastPlay) { chkobbaAchieved = true; player.addChkobba(); console.log(`[Game ${this.roomId}] ${player.name} got Chkobba!`);}
    } else { this.tableCards.push(cardToPlay); }

    this.checkAndAdvanceGameState();

    return { success: true, didCapture, chkobbaAchieved, roundOver: this.isRoundOver, gameOver: this.isGameOver, awaitingTieDecision: this.awaitingTieDecision, awaitingCaptureChoice: false, awaitingExactMatchChoice: false, newState: this.getGameState() };
  } // End playTurn


  // resolveCaptureChoice method (Handles SUM choice)
  resolveCaptureChoice(playerId, chosenCombinationIds) {
      if (!this.awaitingCaptureChoice || this.awaitingCaptureChoice.playerId !== playerId) return { success: false, reason: "Not awaiting sum choice." };
      const { playedCard, combinations } = this.awaitingCaptureChoice;
      const chosenCombination = combinations.find(combo => Array.isArray(combo) && combo.length === chosenCombinationIds.length && chosenCombinationIds.every(id => combo.some(card => card?.id === id)) && combo.every(card => card && chosenCombinationIds.includes(card.id)) );
      if (!chosenCombination) return { success: false, reason: "Invalid sum choice." };
      const player = this.players.get(playerId); if (!player) return { success: false, reason: "Player missing." };
      const isPotentiallyLastPlay = player.hand.length === 0 && this.deck.isEmpty();

      // Perform Capture
      const capturedCards = [...chosenCombination]; const capturedIds = new Set(capturedCards.map(c => c.id)); this.tableCards = this.tableCards.filter(tc => !capturedIds.has(tc.id)); player.addCapturedCards([playedCard, ...capturedCards]); this.lastCaptureBy = playerId;
      let chkobbaAchieved = false; if (this.tableCards.length === 0 && !isPotentiallyLastPlay) { chkobbaAchieved = true; player.addChkobba(); }

      this.awaitingCaptureChoice = null; this.checkAndAdvanceGameState();
      return { success: true, didCapture: true, chkobbaAchieved, roundOver: this.isRoundOver, gameOver: this.isGameOver, awaitingTieDecision: this.awaitingTieDecision, awaitingCaptureChoice: false, awaitingExactMatchChoice: false, newState: this.getGameState() };
  }

 // resolveExactMatchChoice method (Handles EXACT match choice)
 resolveExactMatchChoice(playerId, chosenCardId) {
      if (!this.awaitingExactMatchChoice || this.awaitingExactMatchChoice.playerId !== playerId) return { success: false, reason: "Not awaiting exact match choice." };
      const { playedCard, options } = this.awaitingExactMatchChoice;
      const chosenCard = options.find(card => card?.id === chosenCardId);
      if (!chosenCard) return { success: false, reason: "Invalid exact match choice." };
      const player = this.players.get(playerId); if (!player) return { success: false, reason: "Player missing." };
      const isPotentiallyLastPlay = player.hand.length === 0 && this.deck.isEmpty();

      // Perform Capture
      this.tableCards = this.tableCards.filter(tc => tc.id !== chosenCard.id); player.addCapturedCards([playedCard, chosenCard]); this.lastCaptureBy = playerId;
      let chkobbaAchieved = false; if (this.tableCards.length === 0 && !isPotentiallyLastPlay) { chkobbaAchieved = true; player.addChkobba(); }

      this.awaitingExactMatchChoice = null; this.checkAndAdvanceGameState();
      return { success: true, didCapture: true, chkobbaAchieved, roundOver: this.isRoundOver, gameOver: this.isGameOver, awaitingTieDecision: this.awaitingTieDecision, awaitingCaptureChoice: false, awaitingExactMatchChoice: false, newState: this.getGameState() };
  }

  // checkAndAdvanceGameState helper (checks all flags)
  checkAndAdvanceGameState() {
       if (this.awaitingTieDecision || this.awaitingCaptureChoice || this.awaitingExactMatchChoice) return;
       let allHandsEmpty = !Array.from(this.players.values()).some(p => p.hand.length > 0);
       if (allHandsEmpty && !this.deck.isEmpty()) { this.dealMoreCards(); allHandsEmpty = !Array.from(this.players.values()).some(p => p.hand.length > 0); }
       if (allHandsEmpty && this.deck.isEmpty()) { this.endRound(); }
       if (!this.isRoundOver && !this.isGameOver) { this.advanceTurn(); }
   }

  // dealMoreCards method (deals to 4 players)
  dealMoreCards() {
       if (this.deck.isEmpty()) return false; let cardsDealt = false;
       this.playerIds.forEach(playerId => { const player = this.players.get(playerId); if (player && player.hand.length === 0) { const cardsToDeal = Math.min(DEAL_HAND_SIZE, this.deck.cardsLeft()); if (cardsToDeal > 0) { player.addCardsToHand(this.deck.deal(cardsToDeal)); cardsDealt = true; } } });
       if (cardsDealt) console.log(`[Game ${this.roomId}] Dealt more cards.`);
       return cardsDealt;
   }

   // endRound method (uses team scoring)
   endRound() {
       console.log(`[Game ${this.roomId}] 2v2 Round Over.`); this.isRoundOver = true; this.awaitingTieDecision = false; this.tieDecisions = {};
       if (this.lastCaptureBy && this.tableCards.length > 0) { const capturer = this.players.get(this.lastCaptureBy); if (capturer) capturer.addCapturedCards(this.tableCards); } this.tableCards = [];
       this.calculateRoundScore(); // Calculate TEAM scores
       const teamAScore = this.matchScores['TeamA'] || 0; const teamBScore = this.matchScores['TeamB'] || 0;
       if (teamAScore >= this.winningScore || teamBScore >= this.winningScore) { this.isGameOver = true; console.log(`Game Over! Team Scores: A=${teamAScore}, B=${teamBScore}`); }
       else { this.isGameOver = false; console.log(`Round finished. Team Scores: A=${teamAScore}, B=${teamBScore}`); }
  }

  // advanceTurn method (cycles through 4 players)
  advanceTurn() {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.playerIds.length;
      const nextPlayer = this.players.get(this.getCurrentPlayerId());
      console.log(`[Game ${this.roomId}] Turn advanced to ${nextPlayer?.name} (${this.getCurrentPlayerId()?.substring(0,4)})`);
  }

  // --- FULL IMPLEMENTATION FOR TEAM SCORING ---
  calculateRoundScore() {
        console.log(`[Game ${this.roomId}] Calculating TEAM SCORES...`);
        const results = { points: { 'TeamA': 0, 'TeamB': 0 }, winners: { mostCards: null, mostDineri: null, sevenOfDineriTeam: null, mostSevensOrSixes: null }, chkobbas: { }, counts: { cards: {}, dineri: {}, sevens: {}, sixes: {} }};
        let teamARoundPoints = 0; let teamBRoundPoints = 0;

        // Pool cards and find 7-Dineri capturer
        const teamACaptured = []; const teamBCaptured = []; let pIdWith7Dineri = null;
        this.playerIds.forEach(pid => { const player = this.players.get(pid); const playerTeam = this.playerToTeam[pid]; if (player && playerTeam) { results.chkobbas[pid] = player.chkobbaCount; if (!pIdWith7Dineri && player.capturedCards.some(c => c.value === SEVEN_OF_DINERI_VALUE && c.suit === DINERI_SUIT)) { pIdWith7Dineri = pid; } if (playerTeam === 'TeamA') teamACaptured.push(...player.capturedCards); else teamBCaptured.push(...player.capturedCards); }});

        // Store counts
        results.counts.cards['TeamA'] = teamACaptured.length; results.counts.cards['TeamB'] = teamBCaptured.length;
        const teamADineriCount = teamACaptured.filter(c => c.suit === DINERI_SUIT).length; const teamBDineriCount = teamBCaptured.filter(c => c.suit === DINERI_SUIT).length; results.counts.dineri['TeamA'] = teamADineriCount; results.counts.dineri['TeamB'] = teamBDineriCount;
        const teamASevens = teamACaptured.filter(c => c.value === '7').length; const teamBSevens = teamBCaptured.filter(c => c.value === '7').length; results.counts.sevens['TeamA'] = teamASevens; results.counts.sevens['TeamB'] = teamBSevens;

        // Most Cards
        if (results.counts.cards['TeamA'] > results.counts.cards['TeamB']) { results.winners.mostCards = 'TeamA'; teamARoundPoints += 1; } else if (results.counts.cards['TeamB'] > results.counts.cards['TeamA']) { results.winners.mostCards = 'TeamB'; teamBRoundPoints += 1; } else { results.winners.mostCards = 'tie'; }

        // Most Dineri
        if (teamADineriCount > teamBDineriCount) { results.winners.mostDineri = 'TeamA'; teamARoundPoints += 1; } else if (teamBDineriCount > teamADineriCount) { results.winners.mostDineri = 'TeamB'; teamBRoundPoints += 1; } else { results.winners.mostDineri = 'tie'; }

        // Seven of Dineri
        if (pIdWith7Dineri) { const winningTeam = this.playerToTeam[pIdWith7Dineri]; results.winners.sevenOfDineriTeam = winningTeam; if (winningTeam === 'TeamA') teamARoundPoints += 1; else teamBRoundPoints += 1; } else { results.winners.sevenOfDineriTeam = null; }

        // Most 7s/6s
        if (teamASevens > teamBSevens) { results.winners.mostSevensOrSixes = 'TeamA'; teamARoundPoints += 1; }
        else if (teamBSevens > teamASevens) { results.winners.mostSevensOrSixes = 'TeamB'; teamBRoundPoints += 1; }
        else { const teamASixes = teamACaptured.filter(c => c.value === '6').length; const teamBSixes = teamBCaptured.filter(c => c.value === '6').length; results.counts.sixes['TeamA'] = teamASixes; results.counts.sixes['TeamB'] = teamBSixes; if (teamASixes > teamBSixes) { results.winners.mostSevensOrSixes = 'TeamA'; teamARoundPoints += 1; } else if (teamBSixes > teamASixes) { results.winners.mostSevensOrSixes = 'TeamB'; teamBRoundPoints += 1; } else { results.winners.mostSevensOrSixes = 'tie'; } }

        // Chkobbas
        this.teams.TeamA.forEach(pid => { teamARoundPoints += (results.chkobbas[pid] || 0) * POINTS_RULES.CHKOBBA; });
        this.teams.TeamB.forEach(pid => { teamBRoundPoints += (results.chkobbas[pid] || 0) * POINTS_RULES.CHKOBBA; });

        // Store/Update scores
        results.points['TeamA'] = teamARoundPoints; results.points['TeamB'] = teamBRoundPoints;
        this.matchScores['TeamA'] = (this.matchScores['TeamA'] || 0) + teamARoundPoints; this.matchScores['TeamB'] = (this.matchScores['TeamB'] || 0) + teamBRoundPoints;
        this.roundResults = results;
        console.log(`[Game ${this.roomId}] Team Score Calculation Complete. Details:`, JSON.stringify(this.roundResults));
        console.log(`[Game ${this.roomId}] Match Scores Updated (Team):`, this.matchScores);
  }


  // getGameState method (Sends team scores, team structure)
  getGameState() {
       const playersState = {}; this.playerIds.forEach(pid => { const p = this.players.get(pid); if(p) playersState[pid] = { id: pid, name: p.name, handCount: p.hand.length, capturedCount: p.capturedCards.length, chkobbas: p.chkobbaCount };});
      return {
          roomId: this.roomId, playerIds: this.playerIds, playersInfo: playersState, teams: this.teams, playerToTeam: this.playerToTeam, tableCards: this.tableCards, currentPlayerId: this.getCurrentPlayerId(),
          scores: this.matchScores, // Team scores
          lastCaptureBy: this.lastCaptureBy, deckSize: this.deck.cardsLeft(), isRoundOver: this.isRoundOver, isGameOver: this.isGameOver,
          awaitingTieDecision: false, // Disabled
          winningScore: this.winningScore, roundResults: this.isRoundOver ? this.roundResults : null, // Detailed TEAM results
          awaitingCaptureChoice: !!this.awaitingCaptureChoice, awaitingExactMatchChoice: !!this.awaitingExactMatchChoice,
      };
  }

  // getGameStateForPlayer method (Sends partner/opponent data)
  getGameStateForPlayer(playerId) {
      const generalState = this.getGameState(); const player = this.players.get(playerId);
      const myTeamName = this.playerToTeam[playerId]; const partnerId = this.teams[myTeamName]?.find(pid => pid !== playerId); const opponentTeamName = myTeamName === 'TeamA' ? 'TeamB' : 'TeamA'; const opponentIds = this.teams[opponentTeamName] || [];
      const partnerData = partnerId ? generalState.playersInfo[partnerId] : null; const opponentsData = opponentIds.map(oid => generalState.playersInfo[oid] || {id: oid, name: 'Unknown'});
      const personalizedState = {
          roomId: generalState.roomId, tableCards: generalState.tableCards, currentPlayerId: generalState.currentPlayerId, scores: generalState.scores, lastCaptureBy: generalState.lastCaptureBy, deckSize: generalState.deckSize, isRoundOver: generalState.isRoundOver, isGameOver: generalState.isGameOver, awaitingTieDecision: generalState.awaitingTieDecision, winningScore: generalState.winningScore, roundResults: generalState.roundResults, awaitingCaptureChoice: generalState.awaitingCaptureChoice, awaitingExactMatchChoice: generalState.awaitingExactMatchChoice,
          myId: playerId, myName: player?.name, myTeamName: myTeamName, myHand: player ? player.getHandState() : [],
          partner: partnerData, opponents: opponentsData
      };
      if (player) { personalizedState.myPlayerData = { id: player.id, name: player.name, capturedCount: player.capturedCards.length, chkobbas: player.chkobbaCount }; }
      else { personalizedState.myPlayerData = { id: playerId, name: 'Error', capturedCount: 0, chkobbas: 0 }; }
      if (this.awaitingCaptureChoice?.playerId === playerId) { personalizedState.captureOptions = this.awaitingCaptureChoice.combinations; personalizedState.playedCardForChoice = this.awaitingCaptureChoice.playedCard; } else { personalizedState.captureOptions = null; personalizedState.playedCardForChoice = null; }
      if (this.awaitingExactMatchChoice?.playerId === playerId) { personalizedState.exactMatchOptions = this.awaitingExactMatchChoice.options; personalizedState.playedCardForChoice = this.awaitingExactMatchChoice.playedCard; } else { personalizedState.exactMatchOptions = null; }
      return personalizedState;
  }

} // End Class Game_2v2

module.exports = Game_2v2;