// client/src/GameScreen_2v2.js
// Final version for 2v2 structure, placeholders for some UI details

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Hand from './components/Hand';
import Table from './components/Table';
import Card from './components/Card'
import './App.css';
import { socket, connectSocket, emitPlayCard } from './socket';

function GameScreen_2v2() {
    const { roomId } = useParams();
    const navigate = useNavigate();

    // --- State Variables ---
    const [isConnected, setIsConnected] = useState(socket.connected);
    const [myPlayerId, setMyPlayerId] = useState(null);
    const [myName, setMyName] = useState("You");
    const [myTeamName, setMyTeamName] = useState(null);
    const [playerHand, setPlayerHand] = useState([]);
    const [myGameData, setMyGameData] = useState({ capturedCount: 0, chkobbas: 0 });
    const [partner, setPartner] = useState(null);
    const [opponents, setOpponents] = useState([]); // Expect array of 2 {id, name, handCount, ...}
    const [tableCards, setTableCards] = useState([]);
    const [currentPlayerId, setCurrentPlayerId] = useState(null);
    const [scores, setScores] = useState({}); // Expecting { TeamA: score, TeamB: score }
    const [roundResults, setRoundResults] = useState(null);
    const [deckSize, setDeckSize] = useState(0);
    const [isRoundOver, setIsRoundOver] = useState(false);
    const [isGameOver, setIsGameOver] = useState(false);
    const [gameMessage, setGameMessage] = useState(`Joining room ${roomId}...`);
    const [awaitingTieDecision, setAwaitingTieDecision] = useState(false);
    const [, setMyTieDecision] = useState(null);
    const [selectedPlayerCardId, setSelectedPlayerCardId] = useState(null);
    const [imReadyForNextRound, setImReadyForNextRound] = useState(false);
    const [isAwaitingCaptureChoice, setIsAwaitingCaptureChoice] = useState(false);
    const [captureOptions, setCaptureOptions] = useState([]);
    const [isAwaitingExactMatchChoice, setIsAwaitingExactMatchChoice] = useState(false);
    const [exactMatchOptions, setExactMatchOptions] = useState([]);
    const [playedCardForChoice, setPlayedCardForChoice] = useState(null);
    const [hasLoadedInitialState, setHasLoadedInitialState] = useState(false);


    // --- State Update Helper ---
    const updateGameState = useCallback((state) => {
        // console.log("CLIENT (2v2): Updating state with:", state);
        const currentMyIdForUpdate = myPlayerId || socket.id;
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
        setCaptureOptions(state.awaitingCaptureChoice && incomingCurrentPlayerId === currentMyIdForUpdate ? (state.captureOptions || []) : []);
        setExactMatchOptions(state.awaitingExactMatchChoice && incomingCurrentPlayerId === currentMyIdForUpdate ? (state.exactMatchOptions || []) : []);
        setPlayedCardForChoice((state.awaitingCaptureChoice || state.awaitingExactMatchChoice) && incomingCurrentPlayerId === currentMyIdForUpdate ? (state.playedCardForChoice || null) : null);
        if (!state.awaitingTieDecision) setMyTieDecision(null);
        if (state.myId === currentMyIdForUpdate) { if (state.myHand !== undefined) setPlayerHand(Array.isArray(state.myHand) ? state.myHand : []); if (state.myPlayerData) { setMyGameData({ capturedCount: state.myPlayerData.capturedCount ?? 0, chkobbas: state.myPlayerData.chkobbas ?? 0 }); setMyName(state.myPlayerData.name || "You"); } setMyTeamName(state.myTeamName || null); }
        setPartner(state.partner || null);
        setOpponents(state.opponents || []);
        if (!state.isRoundOver && previousRoundOver) setImReadyForNextRound(false);
        // Update game message
         const updatedPartner = state.partner; const updatedOpponents = state.opponents || []; const currentTurnPlayerId = state.currentPlayerId; const amICurrent = currentTurnPlayerId === currentMyIdForUpdate;
         let message = "Waiting...";
         if (state.isGameOver) { /* gameEnd */ }
         else if (state.awaitingCaptureChoice && amICurrent) { message = `Choose SUM capture...`; }
         else if (state.awaitingExactMatchChoice && amICurrent) { message = `Choose EXACT match...`; }
         else if (state.awaitingTieDecision) { message = "11-11 Tie! Decide..."; }
         else if (state.isRoundOver) { message = "Round Over! Ready up..."; }
         else if (currentTurnPlayerId) { let turnPlayerName = 'Opponent'; if (amICurrent) turnPlayerName = state.myPlayerData?.name || 'You'; else if (currentTurnPlayerId === updatedPartner?.id) turnPlayerName = updatedPartner?.name || 'Partner'; else turnPlayerName = updatedOpponents.find(op => op.id === currentTurnPlayerId)?.name || 'Opponent'; const oppChoosing = (state.awaitingCaptureChoice || state.awaitingExactMatchChoice) && !amICurrent; message = oppChoosing ? `Waiting for ${turnPlayerName} to choose...` : (amICurrent ? "** Your Turn **" : `${turnPlayerName}'s Turn`); }
         setGameMessage(message);
    }, [myPlayerId, isRoundOver, myName, partner]); // Dependencies reviewed


    // --- Effect for Socket Listeners ---
    useEffect(() => {
        const handleConnect = () => { console.log(`GameScreen_2v2: Socket connected, ID: ${socket.id}`); setIsConnected(true); setMyPlayerId(socket.id); };
        const handleDisconnect = (reason) => { setIsConnected(false); setHasLoadedInitialState(false); setTimeout(() => { navigate('/'); }, 3000); };
        const handleGameStart = (initialState) => { if (!initialState) return; console.log('Received gameStart (2v2)'); updateGameState(initialState); setHasLoadedInitialState(true); };
        const handleGameStateUpdate = (newState) => { if (!newState) return; console.log('Received gameStateUpdate (2v2)'); updateGameState(newState); if(!hasLoadedInitialState) setHasLoadedInitialState(true); };
        const handlePlayerJoined = (data) => { if (!hasLoadedInitialState && myPlayerId && data?.players);};
        const handlePlayerLeft = (data) => { setOpponents(o => o.filter(p => p.id !== data.socketId)); setPartner(p => p?.id === data.socketId ? null : p); };
        const handleGameEnd = (data) => { setIsGameOver(true); setGameMessage(data.message || "Game Over!"); setHasLoadedInitialState(true); };
        const handleGameError = (data) => { console.error('Game Error:', data); setGameMessage(`Error: ${data.message}`); setSelectedPlayerCardId(null); setIsAwaitingCaptureChoice(false); setIsAwaitingExactMatchChoice(false); };
        const handleWaiting = () => { if (!awaitingTieDecision && !isAwaitingCaptureChoice && !isAwaitingExactMatchChoice) setGameMessage("Waiting for opponent..."); };
        const handleOpponentDecidedTie = (data) => { /* ... */ }; const handleTieDecisionAck = (data) => { /* ... */ };
        const handleChooseCapture = (data) => { if (data?.captureOptions?.length > 0 && data.playedCardData) { setIsAwaitingExactMatchChoice(false); setIsAwaitingCaptureChoice(true); setCaptureOptions(data.captureOptions); setPlayedCardForChoice(data.playedCardData); console.log("Set state for SUM choice."); } else { console.error("Invalid chooseCaptureCombination data", data); }};
        const handleChooseExactMatch = (data) => { if (data?.exactMatchOptions?.length > 0 && data.playedCardData) { setIsAwaitingCaptureChoice(false); setIsAwaitingExactMatchChoice(true); setExactMatchOptions(data.exactMatchOptions); setPlayedCardForChoice(data.playedCardData); console.log("Set state for EXACT choice."); } else { console.error("Invalid chooseExactMatch data", data); }};
        const handleRoomUpdate = (data) => { if (!hasLoadedInitialState && myPlayerId && data?.players) { /* Needs logic to set partner/opponents based on teams */ setGameMessage(`Waiting... (${data.players.length}/4)`); }};

        socket.on('connect', handleConnect); socket.on('disconnect', handleDisconnect); socket.on('gameStart', handleGameStart); socket.on('gameStateUpdate', handleGameStateUpdate); socket.on('playerJoined', handlePlayerJoined); socket.on('playerLeft', handlePlayerLeft); socket.on('gameEnd', handleGameEnd); socket.on('gameError', handleGameError); socket.on('waitingForOpponent', handleWaiting); socket.on('opponentDecidedTie', handleOpponentDecidedTie); socket.on('tieDecisionAcknowledged', handleTieDecisionAck); socket.on('chooseCaptureCombination', handleChooseCapture); socket.on('chooseExactMatch', handleChooseExactMatch); socket.on('roomUpdate', handleRoomUpdate);
        connectSocket();
        return () => { socket.off('connect', handleConnect); socket.off('disconnect', handleDisconnect); socket.off('gameStart', handleGameStart); socket.off('gameStateUpdate', handleGameStateUpdate); socket.off('playerJoined', handlePlayerJoined); socket.off('playerLeft', handlePlayerLeft); socket.off('gameEnd', handleGameEnd); socket.off('gameError', handleGameError); socket.off('waitingForOpponent', handleWaiting); socket.off('opponentDecidedTie', handleOpponentDecidedTie); socket.off('tieDecisionAcknowledged', handleTieDecisionAck); socket.off('chooseCaptureCombination', handleChooseCapture); socket.off('chooseExactMatch', handleChooseExactMatch); socket.off('roomUpdate', handleRoomUpdate); };
    }, [roomId, navigate, updateGameState, myPlayerId, hasLoadedInitialState, awaitingTieDecision, isAwaitingCaptureChoice, isAwaitingExactMatchChoice]); // Added myPlayerId/hasLoaded


    // --- Action Handlers ---
    const handlePlayerCardSelect = (cardId) => { if (canMyPlayerAct) setSelectedPlayerCardId(cardId); };
    const handlePlaySelectedCard = () => { if (selectedPlayerCardId && canMyPlayerAct) { emitPlayCard({ roomId, cardId: selectedPlayerCardId }); setSelectedPlayerCardId(null); } };
    const handleReadyForNextRound = () => { if (isRoundOver && !isGameOver && !awaitingTieDecision && !imReadyForNextRound) { socket.emit('readyForNextRound', { roomId }); setImReadyForNextRound(true); } };
    const handleSubmitCaptureChoice = (chosenCombination) => { if (isAwaitingCaptureChoice && chosenCombination) { const ids = chosenCombination.map(c => c.id); socket.emit('submitCaptureChoice', { roomId, chosenCombinationIds: ids }); setIsAwaitingCaptureChoice(false); setCaptureOptions([]); setPlayedCardForChoice(null); } };
    const handleSubmitExactMatchChoice = (chosenCard) => { if (isAwaitingExactMatchChoice && chosenCard) { socket.emit('submitExactMatchChoice', { roomId, chosenCardId: chosenCard.id }); setIsAwaitingExactMatchChoice(false); setExactMatchOptions([]); setPlayedCardForChoice(null); } };
    const [copySuccess, setCopySuccess] = useState(false);
    // --- getWinner helper (Needs update for teams) ---
    const getWinner = () => { if (!isGameOver || !scores) return null; const teamAScore = scores['TeamA'] ?? 0; const teamBScore = scores['TeamB'] ?? 0; if (teamAScore === teamBScore) return "It's a Tie!"; const winningTeam = teamAScore > teamBScore ? 'TeamA' : 'TeamB'; return myTeamName === winningTeam ? `Your Team (${myTeamName}) Wins!` : `Team ${winningTeam} Wins!`; };


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

    // *** Declare derived variables HERE, before return ***
    const currentId = myPlayerId || socket.id;
    const canMyPlayerAct = currentId === currentPlayerId && !isRoundOver && !isGameOver && !awaitingTieDecision && !isAwaitingCaptureChoice && !isAwaitingExactMatchChoice;
    const myTeamScore = myTeamName ? (scores[myTeamName] ?? 0) : 0;
    const opponentTeamName = myTeamName === 'TeamA' ? 'TeamB' : 'TeamA';
    const opponentTeamScore = scores[opponentTeamName] ?? 0;
    const myNameOrDefault = myName || "You";
    const partnerNameOrDefault = partner?.name || "Partner";
    const opponent1 = opponents.length > 0 ? opponents[0] : null;
    const opponent2 = opponents.length > 1 ? opponents[1] : null;
    const opponent1NameOrDefault = opponent1?.name || "Opponent 1";
    const opponent2NameOrDefault = opponent2?.name || "Opponent 2";
    const scoreCategories = [
        { key: 'mostCards', label: 'Most Cards', countKey: 'cards'},
        { key: 'mostDineri', label: 'Most Dineri', countKey: 'dineri' },
        { key: 'sevenOfDineriTeam', label: '7 of Dineri (7aya)' }, // Winner is Team Name
        { key: 'mostSevensOrSixes', label: 'Most 7s/6s (Bermila)', countKey: 'sevens', secondaryCountKey: 'sixes'}
    ];

    return (
        // Use 2v2 Grid Layout
        <div className="game-screen-grid">

            {/* Partner Area (Top) */}
            <div className={`game-player-area partner-area ${currentPlayerId === partner?.id && !isAwaitingCaptureChoice && !isAwaitingExactMatchChoice ? 'active-player' : ''}`}>
                 {partner ? (<><h3>{partnerNameOrDefault} (Partner)</h3><p>Cards: {partner.handCount ?? '?'}</p><p>Capt: {partner.capturedCount ?? '?'} | Chk: {partner.chkobbas ?? '?'}</p></>) : (<h3>...</h3>)}
            </div>

            {/* Left Opponent Area */}
            <div className={`game-player-area left-opponent-area ${currentPlayerId === opponent1?.id && !isAwaitingCaptureChoice && !isAwaitingExactMatchChoice ? 'active-player' : ''}`}>
                 {opponent1 ? (<><h3>{opponent1NameOrDefault}</h3><p>Cards: {opponent1.handCount ?? '?'}</p><p>Capt: {opponent1.capturedCount ?? '?'} | Chk: {opponent1.chkobbas ?? '?'}</p></>) : (<h3>...</h3>)}
            </div>

            {/* Table Area (Center) */}
            <div className="table-area-grid">
                <h3>Table ({tableCards.length} cards)</h3>
                <Table tableCards={tableCards} />
                <p>Deck: {deckSize} cards left</p>
                <div className="game-message" style={{minHeight: '2.5em'}}>
                      {/* Message Logic */}
                      {isAwaitingExactMatchChoice && currentId === currentPlayerId ? <strong>Choose EXACT match for {playedCardForChoice?.id}</strong>
                       : isAwaitingCaptureChoice && currentId === currentPlayerId ? <strong>Choose SUM capture with {playedCardForChoice?.id}</strong>
                       // : awaitingTieDecision ? <strong>11-11 Tie! Decide...</strong> // Disabled for 2v2
                       : isGameOver ? <strong>{getWinner()}</strong> // getWinner needs update for teams
                       : isRoundOver ? gameMessage
                       : !currentPlayerId ? "Waiting..."
                       : canMyPlayerAct ? "** Your Turn **"
                       : `${opponents.find(op=>op.id === currentPlayerId)?.name || partner?.name || 'Player'}'s Turn`}
                 </div>

                 {/* Team Scores Display */}
                <div className="team-scores">
                    <span>Your Team ({myTeamName}): {myTeamScore}</span>
                    <span>Opponent Team ({opponentTeamName}): {opponentTeamScore}</span>
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
                 {/* Tie Decision UI (Disabled for 2v2 currently) */}


                 {/* --- UPDATED Detailed Score Display for TEAMS --- */}
                 {isRoundOver && !isGameOver && !awaitingTieDecision && !isAwaitingCaptureChoice && !isAwaitingExactMatchChoice && roundResults && myTeamName && (
                     <div className="round-scores-detailed">
                         {console.log("CLIENT_RENDER: Rendering TEAM score table!", roundResults)}
                         <h4>Last Round Results:</h4>
                         <table>
                             <thead>
                                 <tr>
                                     <th>Category</th>
                                     <th>Your Team ({myTeamName})</th>
                                     <th>Opponent Team ({opponentTeamName})</th>
                                 </tr>
                             </thead>
                             <tbody>
                                 {/* Map over point categories */}
                                 {scoreCategories.map(cat => {
                                     const winner = roundResults.winners?.[cat.key]; // Winner is TeamA/TeamB or tie/null
                                     const myTeamPts = winner === myTeamName ? 1 : 0;
                                     const oppTeamPts = winner === opponentTeamName ? 1 : 0;
                                     let details = '';
                                     // Display team counts for relevant categories
                                     if (cat.countKey && roundResults.counts?.[cat.countKey]) {
                                         const myTeamCount = roundResults.counts[cat.countKey]?.[myTeamName] ?? '?';
                                         const oppTeamCount = roundResults.counts[cat.countKey]?.[opponentTeamName] ?? '?';
                                         details = ` (${myTeamCount} vs ${oppTeamCount})`;
                                         // Add sixes details if applicable
                                         if (cat.key === 'mostSevensOrSixes' && winner === 'tie' && roundResults.counts?.sixes) {
                                              const mySixCount = roundResults.counts.sixes?.[myTeamName] ?? '?';
                                              const oppSixCount = roundResults.counts.sixes?.[opponentTeamName] ?? '?';
                                              details += `, 6s: ${mySixCount} vs ${oppSixCount}`;
                                         }
                                     } else if (cat.key === 'sevenOfDineriTeam' && winner === null) {
                                         details = ' (N/A)';
                                     }
                                     return ( <tr key={cat.key}> <td>{cat.label}{details}</td> <td className="score-pts">{winner === 'tie' ? '-' : myTeamPts}</td> <td className="score-pts">{winner === 'tie' ? '-' : oppTeamPts}</td> </tr> );
                                 })}
                                 {/* Chkobbas Row (Sum team counts) */}
                                 <tr>
                                     <td>Chkobbas</td>
                                     <td className="score-pts">{roundResults.points?.[myTeamName] - (roundResults.winners?.mostCards === myTeamName ? 1:0) - (roundResults.winners?.mostDineri === myTeamName ? 1:0) - (roundResults.winners?.sevenOfDineriTeam === myTeamName ? 1:0) - (roundResults.winners?.mostSevensOrSixes === myTeamName ? 1:0) || 0}</td>
                                     <td className="score-pts">{roundResults.points?.[opponentTeamName] - (roundResults.winners?.mostCards === opponentTeamName ? 1:0) - (roundResults.winners?.mostDineri === opponentTeamName ? 1:0) - (roundResults.winners?.sevenOfDineriTeam === opponentTeamName ? 1:0) - (roundResults.winners?.mostSevensOrSixes === opponentTeamName ? 1:0) || 0}</td>
                                     {/* Note: Displaying chkobba points by subtracting other points is a temporary hack. It's better if server sends chkobba points per team directly */}
                                 </tr>
                                 {/* Total Row */}
                                 <tr className="score-total">
                                     <td>Round Total</td>
                                     <td className="score-pts">{roundResults.points?.[myTeamName] ?? 0}</td>
                                     <td className="score-pts">{roundResults.points?.[opponentTeamName] ?? 0}</td>
                                 </tr>
                             </tbody>
                         </table>
                         <button onClick={handleReadyForNextRound} disabled={imReadyForNextRound} style={{marginTop: '10px'}}> {imReadyForNextRound ? "Waiting..." : "Start Next Round"} </button>
                     </div>
                 )}
                 {/* --- END Detailed Score Display --- */}


                 {isGameOver && !awaitingTieDecision && ( <div className="final-scores"><h4>Final Scores</h4><p>Team A: {scores['TeamA'] ?? 0}</p><p>Team B: {scores['TeamB'] ?? 0}</p><strong>{getWinner()}</strong><button onClick={() => navigate('/')}>Back to Home</button></div> )}

            </div>

            {/* Right Opponent Area */}
             <div className={`game-player-area right-opponent-area ${currentPlayerId === opponent2?.id && !isAwaitingCaptureChoice && !isAwaitingExactMatchChoice ? 'active-player' : ''}`}>
                 {opponent2 ? (<><h3>{opponent2NameOrDefault}</h3><p>Cards: {opponent2.handCount ?? '?'}</p><p>Capt: {opponent2.capturedCount ?? '?'} | Chk: {opponent2.chkobbas ?? '?'}</p></>) : (opponents.length < 2 && partner) ? <h3>Waiting...</h3> : null }
            </div>

            {/* Player Area (Bottom - You) */}
            <div className={`game-player-area player-area-grid ${canMyPlayerAct ? 'active-player' : ''}`}>
                 <h3>{myNameOrDefault} (You) {canMyPlayerAct ? '(Your Turn!)' : ''}</h3>
                 {/* Display individual stats */}
                 <p>Chkobbas: {myGameData.chkobbas} | Captured: {myGameData.capturedCount}</p>
                 <Hand hand={playerHand} onCardSelect={handlePlayerCardSelect} selectedPlayerCardId={selectedPlayerCardId} isOpponent={false} />
                 <button onClick={handlePlaySelectedCard} disabled={!selectedPlayerCardId || !canMyPlayerAct}> Play Card </button>
            </div>
        </div> // End game-screen-grid
    );

} // End GameScreen_2v2 component

export default GameScreen_2v2;