// client/src/GameScreen_1v1.js
// Includes logging to diagnose capture choice UI rendering

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Hand from './components/Hand';
import Table from './components/Table';
import Card from './components/Card';
import './App.css';
import { socket, connectSocket, emitPlayCard } from './socket';

function GameScreen_1v1() {
    const { roomId } = useParams();
    const navigate = useNavigate();

    // State variables
    const [isConnected, setIsConnected] = useState(socket.connected);
    const [myPlayerId, setMyPlayerId] = useState(null);
    const [myName, setMyName] = useState("You");
    const [playerHand, setPlayerHand] = useState([]);
    const [myGameData, setMyGameData] = useState({ capturedCount: 0, chkobbas: 0 });
    const [, setPartner] = useState(null);
    const [opponents, setOpponents] = useState([]);
    const [tableCards, setTableCards] = useState([]);
    const [currentPlayerId, setCurrentPlayerId] = useState(null);
    const [scores, setScores] = useState({});
    const [roundResults, setRoundResults] = useState(null);
    const [deckSize, setDeckSize] = useState(0);
    const [isRoundOver, setIsRoundOver] = useState(false);
    const [isGameOver, setIsGameOver] = useState(false);
    const [gameMessage, setGameMessage] = useState(`Joining room ${roomId}...`);
    const [awaitingTieDecision, setAwaitingTieDecision] = useState(false);
    const [myTieDecision, setMyTieDecision] = useState(null);
    const [selectedPlayerCardId, setSelectedPlayerCardId] = useState(null);
    const [imReadyForNextRound, setImReadyForNextRound] = useState(false);
    const [isAwaitingCaptureChoice, setIsAwaitingCaptureChoice] = useState(false);
    const [captureOptions, setCaptureOptions] = useState([]);
    const [isAwaitingExactMatchChoice, setIsAwaitingExactMatchChoice] = useState(false);
    const [exactMatchOptions, setExactMatchOptions] = useState([]);
    const [playedCardForChoice, setPlayedCardForChoice] = useState(null);
    const [hasLoadedInitialState, setHasLoadedInitialState] = useState(false);


    // Derived State
    const currentId = myPlayerId || socket.id;
    const canMyPlayerAct = currentId === currentPlayerId && !isRoundOver && !isGameOver && !awaitingTieDecision && !isAwaitingCaptureChoice && !isAwaitingExactMatchChoice;
    const myMatchScore = scores[currentId] ?? 0;
    const opponent = opponents.length > 0 ? opponents[0] : null;


    // State Update Helper
    const updateGameState = useCallback((state) => {
        console.log("CLIENT (1v1): Updating state with:", state);
        const currentMyIdForUpdate = myPlayerId || socket.id; // Use reliable ID

        setTableCards(state.tableCards || []);
        const incomingCurrentPlayerId = state.currentPlayerId || null;
        setCurrentPlayerId(incomingCurrentPlayerId);
        setScores(state.scores || {});
        setDeckSize(state.deckSize !== undefined ? state.deckSize : 0);
        const previousRoundOver = isRoundOver;
        setIsRoundOver(state.isRoundOver || false);
        setIsGameOver(state.isGameOver || false);
        setRoundResults(state.roundResults || null);
        setAwaitingTieDecision(state.awaitingTieDecision || false);
        setIsAwaitingCaptureChoice(state.awaitingCaptureChoice || false);
        setIsAwaitingExactMatchChoice(state.awaitingExactMatchChoice || false);

        // Update choice data ONLY if awaiting from THIS player
        setCaptureOptions(state.awaitingCaptureChoice && state.currentPlayerId === currentMyIdForUpdate ? (state.captureOptions || []) : []);
        setExactMatchOptions(state.awaitingExactMatchChoice && state.currentPlayerId === currentMyIdForUpdate ? (state.exactMatchOptions || []) : []);
        setPlayedCardForChoice((state.awaitingCaptureChoice || state.awaitingExactMatchChoice) && state.currentPlayerId === currentMyIdForUpdate ? (state.playedCardForChoice || null) : null);

        if (!state.awaitingTieDecision) setMyTieDecision(null);

        // Update self data if present in payload
        if (state.myId === currentMyIdForUpdate) {
             if (state.myHand !== undefined) setPlayerHand(Array.isArray(state.myHand) ? state.myHand : []);
             if (state.myPlayerData) {
                 setMyGameData({ capturedCount: state.myPlayerData.capturedCount ?? 0, chkobbas: state.myPlayerData.chkobbas ?? 0 });
                 setMyName(state.myPlayerData.name || "You");
             }
        }

        // Update opponents list (server sends filtered list for 1v1)
        setOpponents(state.opponents || []);
        setPartner(null);

        if (!state.isRoundOver && previousRoundOver) setImReadyForNextRound(false);

        // Update game message
         const oppData = state.opponents ? state.opponents[0] : null;
         const oppName = oppData?.name || 'Opponent';
         const isMyTurnCheck = incomingCurrentPlayerId === currentMyIdForUpdate;
         let message = "Waiting...";

         if (state.isGameOver) { message = "Game Over!"; /* gameEnd might update */ }
         else if (state.awaitingCaptureChoice && isMyTurnCheck) { message = `Choose SUM capture with your ${playedCardForChoice?.id || 'card'}`; }
         else if (state.awaitingExactMatchChoice && isMyTurnCheck) { message = `Choose EXACT match for your ${playedCardForChoice?.id || 'card'}`; }
         else if (state.awaitingTieDecision) { message = "Score is 11-11! Decide..."; }
         else if (state.isRoundOver) { message = "Round Over! Review scores..."; }
         else if (incomingCurrentPlayerId) {
             const oppChoosing = (state.awaitingCaptureChoice || state.awaitingExactMatchChoice) && !isMyTurnCheck;
             message = oppChoosing ? `Waiting for ${oppName} to choose...` : (isMyTurnCheck ? "** Your Turn **" : `${oppName}'s Turn`);
          }
          setGameMessage(message);

    }, [myPlayerId, isRoundOver, myName, playedCardForChoice?.id]); // Added playedCardForChoice?.id dependency


    // Effect for Socket Listeners
    useEffect(() => {
        const handleConnect = () => { console.log(`GameScreen_1v1: Socket connected, ID: ${socket.id}`); setIsConnected(true); setMyPlayerId(socket.id); };
        const handleDisconnect = (reason) => { setIsConnected(false); setHasLoadedInitialState(false); setTimeout(() => { navigate('/'); }, 3000); };
        const handleGameStart = (initialState) => { if (!initialState) return; console.log('Received gameStart'); updateGameState(initialState); setHasLoadedInitialState(true); console.log("CLIENT: Processed gameStart and set hasLoadedInitialState=true"); };
        const handleGameStateUpdate = (newState) => { if (!newState) return; console.log('Received gameStateUpdate'); updateGameState(newState); if(!hasLoadedInitialState) { setHasLoadedInitialState(true); console.log("CLIENT: Set hasLoadedInitialState=true via GameStateUpdate"); }};
        const handlePlayerJoined = (data) => { if (!hasLoadedInitialState && myPlayerId && data?.players) { setOpponents(data.players.filter(p => p.id !== myPlayerId)); } };
        const handlePlayerLeft = (data) => { setOpponents(currentOpponents => currentOpponents.filter(p => p.id !== data.socketId)); };
        const handleGameEnd = (data) => { setIsGameOver(true); setGameMessage(data.message || "Game Over!"); setHasLoadedInitialState(true); };
        const handleGameError = (data) => { console.error('Game Error:', data); setGameMessage(`Error: ${data.message}`); setSelectedPlayerCardId(null); setIsAwaitingCaptureChoice(false); setIsAwaitingExactMatchChoice(false); };
        const handleWaiting = () => { if (!awaitingTieDecision && !isAwaitingCaptureChoice && !isAwaitingExactMatchChoice) setGameMessage("Waiting for opponent..."); };
        const handleOpponentDecidedTie = (data) => { setGameMessage("Opponent decided...")};
        const handleTieDecisionAck = (data) => { setGameMessage(`You chose: ${data.decision}. Waiting...`) };
        const handleChooseCapture = (data) => { console.log("CLIENT: Received chooseCaptureCombination RAW DATA:", data); console.log("CLIENT: typeof data.captureOptions:", typeof data.captureOptions, "| isArray:", Array.isArray(data.captureOptions), "| length:", data.captureOptions?.length); console.log("CLIENT: typeof data.playedCardData:", typeof data.playedCardData, "| value:", data.playedCardData); if (data && Array.isArray(data.captureOptions) && data.captureOptions.length > 0 && data.playedCardData) { setIsAwaitingExactMatchChoice(false); setExactMatchOptions([]); setIsAwaitingCaptureChoice(true); setCaptureOptions(data.captureOptions); setPlayedCardForChoice(data.playedCardData); console.log("CLIENT: Set state for SUM capture choice."); } else { console.error("Invalid data structure for chooseCaptureCombination.", { hasData: !!data, optionsIsArray: Array.isArray(data?.captureOptions), optionsLength: data?.captureOptions?.length, hasPlayedCard: !!data?.playedCardData }); setGameMessage("Error receiving capture options."); setIsAwaitingCaptureChoice(false); setCaptureOptions([]); setPlayedCardForChoice(null); }};
        const handleChooseExactMatch = (data) => { console.log("CLIENT: Received chooseExactMatch RAW DATA:", data); console.log("CLIENT: typeof data.exactMatchOptions:", typeof data.exactMatchOptions, "| isArray:", Array.isArray(data.exactMatchOptions), "| length:", data.exactMatchOptions?.length); console.log("CLIENT: typeof data.playedCardData:", typeof data.playedCardData, "| value:", data.playedCardData); if (data && Array.isArray(data.exactMatchOptions) && data.exactMatchOptions.length > 0 && data.playedCardData) { setIsAwaitingCaptureChoice(false); setCaptureOptions([]); setIsAwaitingExactMatchChoice(true); setExactMatchOptions(data.exactMatchOptions); setPlayedCardForChoice(data.playedCardData); console.log("CLIENT: Set state for EXACT match choice."); } else { console.error("Invalid data structure received for chooseExactMatch.", { hasData: !!data, optionsIsArray: Array.isArray(data?.exactMatchOptions), optionsLength: data?.exactMatchOptions?.length, hasPlayedCard: !!data?.playedCardData }); setGameMessage("Error receiving exact match options."); setIsAwaitingExactMatchChoice(false); setExactMatchOptions([]); setPlayedCardForChoice(null); }};
        const handleRoomUpdate = (data) => { if (!hasLoadedInitialState && myPlayerId && data?.players) { setOpponents(data.players.filter(p => p.id !== myPlayerId)); setGameMessage(`Waiting... (${data.players.length}/2)`); }};

        // Setup listeners
        socket.on('connect', handleConnect); socket.on('disconnect', handleDisconnect); socket.on('gameStart', handleGameStart); socket.on('gameStateUpdate', handleGameStateUpdate); socket.on('playerJoined', handlePlayerJoined); socket.on('playerLeft', handlePlayerLeft); socket.on('gameEnd', handleGameEnd); socket.on('gameError', handleGameError); socket.on('waitingForOpponent', handleWaiting); socket.on('opponentDecidedTie', handleOpponentDecidedTie); socket.on('tieDecisionAcknowledged', handleTieDecisionAck);
        socket.on('chooseCaptureCombination', handleChooseCapture);
        socket.on('chooseExactMatch', handleChooseExactMatch);
        socket.on('roomUpdate', handleRoomUpdate);
        connectSocket();
        // Cleanup listeners
        return () => { socket.off('connect', handleConnect); socket.off('disconnect', handleDisconnect); socket.off('gameStart', handleGameStart); socket.off('gameStateUpdate', handleGameStateUpdate); socket.off('playerJoined', handlePlayerJoined); socket.off('playerLeft', handlePlayerLeft); socket.off('gameEnd', handleGameEnd); socket.off('gameError', handleGameError); socket.off('waitingForOpponent', handleWaiting); socket.off('opponentDecidedTie', handleOpponentDecidedTie); socket.off('tieDecisionAcknowledged', handleTieDecisionAck); socket.off('chooseCaptureCombination', handleChooseCapture); socket.off('chooseExactMatch', handleChooseExactMatch); socket.off('roomUpdate', handleRoomUpdate); };
    }, [roomId, navigate, updateGameState, awaitingTieDecision, isAwaitingCaptureChoice, isAwaitingExactMatchChoice, myPlayerId, hasLoadedInitialState]);


    // --- Action Handlers ---
    const handlePlayerCardSelect = (cardId) => { if (canMyPlayerAct) setSelectedPlayerCardId(cardId); };
    const handlePlaySelectedCard = () => { if (selectedPlayerCardId && canMyPlayerAct) { emitPlayCard({ roomId, cardId: selectedPlayerCardId }); setSelectedPlayerCardId(null); } };
    const handleReadyForNextRound = () => { if (isRoundOver && !isGameOver && !awaitingTieDecision && !imReadyForNextRound) { socket.emit('readyForNextRound', { roomId }); setImReadyForNextRound(true); } };
    const handleTieDecision = (decision) => { if (awaitingTieDecision && !myTieDecision) { socket.emit('handleTieDecision', { roomId, decision }); setMyTieDecision(decision); } };
    const handleSubmitCaptureChoice = (chosenCombination) => { if (isAwaitingCaptureChoice && chosenCombination) { const ids = chosenCombination.map(c => c.id); socket.emit('submitCaptureChoice', { roomId, chosenCombinationIds: ids }); setIsAwaitingCaptureChoice(false); setCaptureOptions([]); setPlayedCardForChoice(null); } };
    const handleSubmitExactMatchChoice = (chosenCard) => { if (isAwaitingExactMatchChoice && chosenCard) { socket.emit('submitExactMatchChoice', { roomId, chosenCardId: chosenCard.id }); setIsAwaitingExactMatchChoice(false); setExactMatchOptions([]); setPlayedCardForChoice(null); } };
    const [copySuccess, setCopySuccess] = useState(false);
    // --- getWinner helper ---
    const getWinner = () => { if (!isGameOver || !scores) return null; let winnerId = null; let highScore = -1; let isTie = false; const playerInfos = opponents.concat([{ id: myPlayerId, name: myName }]); const playerIds = Object.keys(scores); if (playerIds.length === 0) return "Game Over - No Scores"; playerIds.forEach(pid => { const score = scores[pid]; if (score === undefined) return; if (score > highScore) { highScore = score; winnerId = pid; isTie = false; } else if (score === highScore) { isTie = true; } }); if (isTie && playerIds.filter(pid => scores[pid] === highScore).length > 1) return "It's a Tie!"; if (winnerId === null) return "Game Over"; const winnerInfo = playerInfos.find(p => p.id === winnerId); const winnerName = winnerInfo ? winnerInfo.name : `P_${winnerId.substring(0,4)}`; if (winnerId === myPlayerId) return `You (${myName}) Win!`; return `${winnerName} Wins!`; };


    // --- Render Logic ---
    if (!isConnected && !isGameOver) { return <div className="game-layout"><p>{gameMessage}</p></div>;}
    
    // 2. Waiting for initial state
  if (!hasLoadedInitialState && !isGameOver) {
    // Clicking "Copy Code" writes the roomId to clipboard silently
    const handleCopyCode = () => {
      navigator.clipboard.writeText(roomId);
      setCopySuccess(true);
      
    };

    return (
      <div className="game-layout">
        <p>Connected, waiting for game details...</p>
        <p>Room Code: <strong>{roomId}</strong></p>
        <button onClick={handleCopyCode}>{copySuccess ? 'Copied!' : 'Copy Room Code'}
        </button>
      </div>
    );
  }

    const myNameOrDefault = myName || "You";
    const opponentNameOrDefault = opponent?.name || "Opponent";
    const scoreCategories = [ { key: 'mostCards', label: 'Most Cards', countKey: 'cards'}, { key: 'mostDineri', label: 'Most Dineri', countKey: 'dineri' }, { key: 'sevenOfDineri', label: '7 of Dineri (7aya)' }, { key: 'mostSevensOrSixes', label: 'Most 7s/6s (Bermila)', countKey: 'sevens', secondaryCountKey: 'sixes'} ];

    // --- Log state just before return for debugging render issues ---
    console.log(`CLIENT_RENDER Game: myId=${currentId} currentTurn=${currentPlayerId} canAct=${canMyPlayerAct} roundOver=${isRoundOver} gameOver=${isGameOver} awaitingTie=${awaitingTieDecision} awaitingSumChoice=${isAwaitingCaptureChoice} awaitingExactChoice=${isAwaitingExactMatchChoice}`);
    // ---

    return (
        <div className="game-layout-1v1">
             <>
                 {/* Opponent Area */}
                 <div className={`opponent-area ${currentPlayerId === opponent?.id && !isAwaitingCaptureChoice && !isAwaitingExactMatchChoice ? 'active-player' : ''}`}>
                     {opponent ? ( <div key={opponent.id}> <h3>{opponentNameOrDefault}</h3> <p>Cards: {opponent.handCount ?? '?'} | Score: {scores[opponent.id] ?? 0} </p> <p>Captured: {opponent.capturedCount ?? '?'} | Chkobbas: {opponent.chkobbas ?? '?'}</p> </div> ) : <h3>Waiting...</h3>}
                 </div>

                 {/* Table Area */}
                 <div className="table-area">
                      <h3>Table ({tableCards.length} cards)</h3>
                      <Table tableCards={tableCards} />
                      <p>Deck: {deckSize} cards left</p>
                      <div className="game-message" style={{minHeight: '2.5em'}}>
                          {isAwaitingExactMatchChoice && currentId === currentPlayerId ? <strong>Choose EXACT match for {playedCardForChoice?.id}</strong>
                           : isAwaitingCaptureChoice && currentId === currentPlayerId ? <strong>Choose SUM capture with {playedCardForChoice?.id}</strong>
                           : awaitingTieDecision ? <strong>Score is 11-11! Decide:</strong>
                           : isGameOver ? <strong>{getWinner()}</strong>
                           : isRoundOver ? gameMessage
                           : !currentPlayerId ? "Waiting..."
                           : canMyPlayerAct ? "** Your Turn **"
                           : `${opponentNameOrDefault}'s Turn`}
                      </div>

                      


                      {/* --- UPDATED Exact Match Choice UI --- */}
                      {isAwaitingExactMatchChoice && currentId === currentPlayerId && (
                          <div className="capture-choice-options exact-match-options">
                              <h4>Select Card to Capture:</h4>
                              <div className="capture-options-container">
                                  {exactMatchOptions.map((cardOpt) => (
                                      // Render the card inside a clickable div
                                      <div key={cardOpt.id} className="capture-option" title={`Capture ${cardOpt.id}`} onClick={() => handleSubmitExactMatchChoice(cardOpt)}>
                                          <Card card={cardOpt} />
                                      </div>
                                  ))}
                              </div>
                          </div>
                      )}
                      {/* --- END Exact Match Choice UI --- */}

                      {/* --- UPDATED Sum Capture Choice UI --- */}
                      {isAwaitingCaptureChoice && currentId === currentPlayerId && (
                          <div className="capture-choice-options sum-match-options">
                              <h4>Select Combination to Capture:</h4>
                               <div className="capture-options-container">
                                  {captureOptions.map((combo, index) => (
                                      // Render the combination of cards inside a clickable div
                                      <div key={index} className="capture-option" title={`Capture ${combo.map(c=>c.id).join(' + ')}`} onClick={() => handleSubmitCaptureChoice(combo)}>
                                          {combo.map(card => <Card key={card.id} card={card} />)}
                                      </div>
                                  ))}
                              </div>
                          </div>
                      )}
                      {/* --- END Sum Capture Choice UI --- */}

                      {/* Tie Decision Buttons */}
                      {awaitingTieDecision && !myTieDecision && ( <div className="tie-decision"> <button onClick={() => handleTieDecision('tie')}>Accept Tie</button> <button onClick={() => handleTieDecision('playTo21')}>Play to 21</button> </div> )}
                      {awaitingTieDecision && myTieDecision && ( <p><i>Decision: {myTieDecision}. Waiting...</i></p> )}

                      {/* Detailed Score Display */}
                      {isRoundOver && !isGameOver && !awaitingTieDecision && !isAwaitingCaptureChoice && !isAwaitingExactMatchChoice && roundResults && currentId && opponent?.id && (
                          <div className="round-scores-detailed">
                              {console.log("CLIENT_RENDER: Trying to render score table!")}
                              {/* Log state values right before table generation */}
                              {console.log("Score Table Render State:", { myId: currentId, opp: opponent, results: roundResults })}
                              {(() => { // Use IIFE to wrap try/catch
                                  try {
                                      return (<>
                                          <h4>Last Round Results:</h4>
                                          <table>
                                              <thead><tr><th>Category</th><th>{myNameOrDefault}</th><th>{opponentNameOrDefault}</th></tr></thead>
                                              <tbody>
                                                  {scoreCategories.map(cat => {
                                                      const winner = roundResults.winners?.[cat.key];
                                                      const oppId = opponent.id;
                                                      let myPts = 0; let oppPts = 0;
                                                      if (cat.key === 'sevenOfDineri') { if (winner === currentId) myPts = 1; else if (winner === oppId) oppPts = 1; } // Check sevenOfDineri key
                                                      else { if (winner === currentId) myPts = 1; else if (winner === oppId) oppPts = 1; }

                                                      let details = '';
                                                      let countKey = cat.countKey;
                                                      if (countKey && roundResults.counts?.[countKey]) {
                                                          const myCount = roundResults.counts[countKey][currentId]; // Use currentId
                                                          const oppCount = roundResults.counts[countKey][oppId];
                                                          console.log(`DEBUG Score Detail: Cat=${cat.label}, Key=${cat.countKey}, MyId=${currentId}, OppId=${oppId}, MyCount=${myCount}, OppCount=${oppCount}`);
                                                          details = ` (${myCount ?? '?'} vs ${oppCount ?? '?'})`;
                                                          if (cat.key === 'mostSevensOrSixes' && roundResults.winners?.mostSevensOrSixes === 'tie' && roundResults.counts?.sixes) {
                                                               const mySixCount = roundResults.counts.sixes[currentId]; // Use currentId
                                                               const oppSixCount = roundResults.counts.sixes[oppId];
                                                               console.log(`DEBUG Score Detail: Sixes Check - My6=${mySixCount}, Opp6=${oppSixCount}`);
                                                               details += `, 6s: ${mySixCount ?? '?'} vs ${oppSixCount ?? '?'}`;
                                                          }
                                                      } else if (cat.key === 'sevenOfDineri' && winner === null) { details = ' (N/A)'; }

                                                      return (<tr key={cat.key}><td>{cat.label}{details}</td><td className="score-pts">{winner === 'tie' ? '-' : myPts}</td><td className="score-pts">{winner === 'tie' ? '-' : oppPts}</td></tr>);
                                                  })}
                                                  {/* Chkobbas Row */}
                                                  <tr><td>Chkobbas</td><td className="score-pts">{roundResults.chkobbas?.[currentId] ?? 0}</td><td className="score-pts">{roundResults.chkobbas?.[opponent.id] ?? 0}</td></tr>
                                                  {/* Total Row */}
                                                  <tr className="score-total"><td>Round Total</td><td className="score-pts">{roundResults.points?.[currentId] ?? 0}</td><td className="score-pts">{roundResults.points?.[opponent.id] ?? 0}</td></tr>
                                              </tbody>
                                          </table>
                                          <button onClick={handleReadyForNextRound} disabled={imReadyForNextRound} style={{ marginTop: '10px' }}> {imReadyForNextRound ? "Waiting..." : "Start Next Round"} </button>
                                      </>);
                                  } catch (error) {
                                      console.error("!!! ERROR rendering score table:", error);
                                      return <p style={{color: 'red'}}>Error displaying scores.</p>; // Display error message
                                  }
                              })()}
                          </div>
                      )}

                     {/* Final Scores */}
                      {isGameOver && !awaitingTieDecision && ( <div className="final-scores"> <h4>Final Scores:</h4> {scores && Object.entries(scores).map(([id, score]) => { const name = id === currentId ? myNameOrDefault : opponents.find(op=>op.id === id)?.name || `P_${id.substring(0,4)}`; return ( <p key={id}>{name}: {score ?? 'N/A'}</p> ); })} <button onClick={() => navigate('/')}>Back to Home</button> </div> )}
                 </div>

                 {/* Player Area */}
                 <div className={`player-area ${canMyPlayerAct ? 'active-player' : ''}`}>
                     <h3>{myNameOrDefault} {canMyPlayerAct ? '(Your Turn!)' : ''}</h3>
                     <p>Score: {myMatchScore} | Chkobbas: {myGameData.chkobbas} | Captured: {myGameData.capturedCount}</p>
                     <Hand hand={playerHand} onCardSelect={handlePlayerCardSelect} selectedPlayerCardId={selectedPlayerCardId} isOpponent={false} />
                     <button onClick={handlePlaySelectedCard} disabled={!selectedPlayerCardId || !canMyPlayerAct}>
                         Play Card
                     </button>
                 </div>
             </>
        </div>
    );

} // End GameScreen_1v1 component

export default GameScreen_1v1;