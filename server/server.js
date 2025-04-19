// server/server.js
// Added setTimeout for initial broadcast

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { v4: uuidv4 } = require('uuid');
const roomManager = require('./roomManager'); // Uses updated roomManager with mode handling
// Require specific game classes as needed
const Game_1v1 = require('./game/Game_1v1'); // Assuming renamed file
const Game_2v2 = require('./game/Game_2v2'); // Uses 2v2 class

const PORT = process.env.PORT || 3001;

const app = express();
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000", // Your React app's origin
    methods: ["GET", "POST"]
  }
});

// Server state storage
const activeGames = new Map(); // Key: roomId, Value: Game instance
const playersReadyForNextRound = new Map(); // Key: roomId, Value: Set<socketId>
const roomStartPreference = new Map(); // Key: roomId, Value: nextStartingPlayerIndex
const roomSettings = new Map(); // Key: roomId, Value: { winningScore: number, mode: string }

// Basic route for testing server status
app.get('/', (req, res) => {
  res.send('Chkobba Server is running!');
});

// Helper function to broadcast state to all players in a room
function broadcastGameState(roomId, gameInstance) {
    const playersInRoom = roomManager.getPlayersInRoom(roomId); // Gets [{id, name}]
    // Ensure gameInstance exists and has the required method
    if (!gameInstance || typeof gameInstance.getGameStateForPlayer !== 'function' || playersInRoom.length === 0) {
         console.warn(`[Broadcast] Skipping broadcast for room ${roomId} due to missing game instance, method, or players.`);
         return;
     }
    // console.log(`[Broadcast] Broadcasting state for room ${roomId}`); // Can be noisy
    playersInRoom.forEach(pInfo => {
        try {
             const playerSpecificState = gameInstance.getGameStateForPlayer(pInfo.id);
             if (playerSpecificState) {
                  io.to(pInfo.id).emit('gameStateUpdate', playerSpecificState);
             } else {
                  console.error(`[Broadcast] getGameStateForPlayer returned null/undefined for ${pInfo.name} in room ${roomId}`);
             }
         } catch (error) {
             console.error(`[Broadcast] Error during getGameStateForPlayer for ${pInfo.name} in room ${roomId}:`, error);
         }
    });
 }


io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // --- Room Management Handlers ---
    socket.on('createRoom', (data, callback) => {
        const { playerName = `Player_${socket.id.substring(0,4)}`, mode = '1v1', winningScore = 11 } = data;
        const roomId = uuidv4().substring(0, 6);
        const settings = {
             mode: mode === '2v2' ? '2v2' : '1v1',
             winningScore: winningScore === 21 ? 21 : 11
        };

        if (roomManager.createRoom(roomId, settings)) { // Pass settings obj
            socket.join(roomId);
            roomManager.joinRoom(roomId, socket.id, playerName);
            roomSettings.set(roomId, settings); // Keep separate settings map for now
            console.log(`Player ${playerName}(${socket.id.substring(0,4)}) created room ${roomId} (Mode: ${settings.mode}, Score: ${settings.winningScore})`);
            if (callback) callback({ success: true, roomId: roomId });
        } else {
            if (callback) callback({ success: false, message: 'Failed to create room' });
        }
    });

    socket.on('joinRoom', (data, callback) => {
        const { roomId, playerName = `Player_${socket.id.substring(0,4)}` } = data;
        const currentRoomData = roomManager.getRoom(roomId); // Get { players: Map, settings: {...} }

        if (!currentRoomData) { if (callback) callback({ success: false, message: 'Room not found' }); return; }

        const currentRoomSettings = currentRoomData.settings;
        const maxPlayers = roomManager.getMaxPlayers(roomId);

        if (currentRoomData.players.size >= maxPlayers && !currentRoomData.players.has(socket.id)) {
             if (callback) callback({ success: false, message: 'Room is full' }); return;
        }

        const result = roomManager.joinRoom(roomId, socket.id, playerName);

        if (result.success) {
            socket.join(roomId);
            console.log(`Player ${playerName}(${socket.id.substring(0,4)}) joined room ${roomId}`);
            const playersInRoom = roomManager.getPlayersInRoom(roomId); // [{id, name}] list

            if (callback) callback({ success: true, roomId: roomId, players: playersInRoom });
            socket.to(roomId).emit('playerJoined', { socketId: socket.id, name: playerName, players: playersInRoom });
            socket.emit('roomUpdate', { players: playersInRoom });

            // Start game if room is now full AND not already started
            if (!result.alreadyInRoom && playersInRoom.length === maxPlayers && !activeGames.has(roomId)) {

                const gameWinningScore = currentRoomSettings.winningScore;
                console.log(`[Game Start] Room ${roomId} is full (${maxPlayers} players). Starting ${currentRoomSettings.mode} game to ${gameWinningScore}...`);

                let startGameWithIndex;
                if (roomStartPreference.has(roomId)) { startGameWithIndex = roomStartPreference.get(roomId); }
                else { startGameWithIndex = Math.floor(Math.random() * playersInRoom.length); }
                roomStartPreference.set(roomId, (startGameWithIndex + 1) % playersInRoom.length);
                console.log(`[Game Start] Starter index: ${startGameWithIndex} (${playersInRoom[startGameWithIndex]?.name})`);

                let game = null;
                try {
                    if (currentRoomSettings.mode === '1v1') {
                         console.log("[Game Start] Instantiating Game_1v1...");
                         game = new Game_1v1(roomId, playersInRoom, startGameWithIndex, gameWinningScore);
                    } else if (currentRoomSettings.mode === '2v2') {
                         console.log("[Game Start] Instantiating Game_2v2...");
                         game = new Game_2v2(roomId, playersInRoom, startGameWithIndex, gameWinningScore);
                    } else { throw new Error(`Unsupported mode: ${currentRoomSettings.mode}`); }
                } catch (error) { console.error(`[Game Start] Error instantiating game class:`, error); io.to(roomId).emit('gameError', { message: `Server error starting game.` }); }

                if (game) {
                    activeGames.set(roomId, game);
                    playersReadyForNextRound.set(roomId, new Set());

                    // --- USE setTimeout before initial broadcast ---
                    console.log(`[Game Start] Scheduling initial broadcast for room ${roomId} shortly...`);
                    setTimeout(() => {
                         // Verify game still exists before broadcasting (might have been removed by immediate disconnect)
                         const currentGame = activeGames.get(roomId);
                         if(currentGame) {
                            console.log(`[Game Start] Broadcasting initial gameStateUpdate now for room ${roomId}`);
                            broadcastGameState(roomId, currentGame); // Call inside timeout
                         } else {
                             console.log(`[Game Start] Broadcast cancelled for room ${roomId}, game no longer active.`);
                         }
                    }, 150); // 150ms delay - adjust if needed
                    // --- End setTimeout change ---

                } else { console.log(`[Game Start] Game object FAILED to create for mode ${currentRoomSettings.mode}`); }

            } else if (!activeGames.has(roomId) && playersInRoom.length < maxPlayers) {
                 io.to(roomId).emit('roomUpdate', { players: playersInRoom }); // Update waiting players
            }
        } else {
            console.warn(`Player ${playerName}(${socket.id.substring(0,4)}) failed to join room ${roomId}: ${result.reason}`);
            if (callback) callback({ success: false, message: result.reason });
        }
    }); // End joinRoom


    // --- Game Action Handlers ---
    socket.on('playCard', (data) => {
        const { roomId, cardId } = data;
        const game = activeGames.get(roomId);
        const playerId = socket.id;
        const roomData = roomManager.getRoom(roomId);
        const playersMap = roomData?.players;

        if (game && playersMap?.has(playerId)) {
            const result = game.playTurn(playerId, cardId);
            if (result.success) {
                if (result.awaitingExactMatchChoice) { // Handle exact match choice first
                     const playerName = playersMap.get(playerId);
                     console.log(`[Game ${roomId}] Action required: Player ${playerName} needs to choose EXACT MATCH capture.`);
                     socket.emit('chooseExactMatch', { playedCardData: result.playedCardData, exactMatchOptions: result.exactMatchOptions, currentState: result.newState });
                     console.log(`>>> SERVER: Emitted chooseExactMatch event to ${playerName} (${playerId.substring(0,4)})`);
                     socket.to(roomId).emit('gameStateUpdate', { ...result.newState, gameMessage: `Waiting for ${playerName} to choose capture...` });
                } else if (result.awaitingCaptureChoice) { // Handle sum capture choice
                     const playerName = playersMap.get(playerId);
                     console.log(`[Game ${roomId}] Action required: Player ${playerName} needs to choose SUM capture.`);
                     socket.emit('chooseCaptureCombination', { playedCardData: result.playedCardData, captureOptions: result.captureOptions, currentState: result.newState });
                     console.log(`>>> SERVER: Emitted chooseCaptureCombination event to ${playerName} (${playerId.substring(0,4)})`);
                     socket.to(roomId).emit('gameStateUpdate', { ...result.newState, gameMessage: `Waiting for ${playerName} to choose capture...` });
                } else { // Normal turn / round end / game end
                    broadcastGameState(roomId, game);
                    // Cleanup logic
                    if (result.gameOver && !result.awaitingTieDecision) { console.log(`[Game ${roomId}] Cleaning up finished game.`); activeGames.delete(roomId); playersReadyForNextRound.delete(roomId); roomStartPreference.delete(roomId); roomSettings.delete(roomId); }
                    else if (result.roundOver && !result.awaitingTieDecision) { console.log(`[Game ${roomId}] Round ended.`); playersReadyForNextRound.set(roomId, new Set()); }
                    else if (result.awaitingTieDecision) { console.log(`[Game ${roomId}] Round ended in 11-11 tie.`); }
                }
            } else { socket.emit('gameError', { message: result.reason }); }
        } else { socket.emit('gameError', { message: 'Invalid game action or not in room.' }); }
    });

    socket.on('submitCaptureChoice', (data) => {
        const { roomId, chosenCombinationIds } = data;
        const game = activeGames.get(roomId);
        const playerId = socket.id;
        const roomData = roomManager.getRoom(roomId);
        const playersMap = roomData?.players;

        if (game && game.awaitingCaptureChoice?.playerId === playerId && playersMap?.has(playerId)) {
            const result = game.resolveCaptureChoice(playerId, chosenCombinationIds);
            if (result.success) { broadcastGameState(roomId, game); /* Cleanup checks */ if (result.gameOver && !result.awaitingTieDecision) { /* ... */ } else if (result.roundOver && !result.awaitingTieDecision) { /* ... */ } else if (result.awaitingTieDecision) { /* ... */ } }
            else { socket.emit('gameError', { message: result.reason }); }
        } else { socket.emit('gameError', { message: 'Cannot submit sum choice now.' }); }
    });

     socket.on('submitExactMatchChoice', (data) => {
        const { roomId, chosenCardId } = data;
        const game = activeGames.get(roomId);
        const playerId = socket.id;
        const roomData = roomManager.getRoom(roomId);
        const playersMap = roomData?.players;

        if (game && game.awaitingExactMatchChoice?.playerId === playerId && playersMap?.has(playerId)) {
            const result = game.resolveExactMatchChoice(playerId, chosenCardId);
            if (result.success) { broadcastGameState(roomId, game); /* Cleanup checks */ if (result.gameOver && !result.awaitingTieDecision) { /* ... */ } else if (result.roundOver && !result.awaitingTieDecision) { /* ... */ } else if (result.awaitingTieDecision) { /* ... */ } }
            else { socket.emit('gameError', { message: result.reason }); }
        } else { socket.emit('gameError', { message: 'Cannot submit exact match choice now.' }); }
    });


     socket.on('readyForNextRound', (data) => {
        const { roomId } = data;
        const playerId = socket.id;
        const game = activeGames.get(roomId);
        const readySet = playersReadyForNextRound.get(roomId);
        const roomData = roomManager.getRoom(roomId);
        const playersMap = roomData?.players;
        const maxPlayers = roomManager.getMaxPlayers(roomId);

        if (game && !game.isGameOver && game.isRoundOver && !game.awaitingTieDecision && readySet && playersMap?.has(playerId)) {
             const playerName = playersMap.get(playerId);
             readySet.add(playerId);
             socket.emit('waitingForOpponent');
             if (readySet.size === playersMap.size && playersMap.size === maxPlayers) {
                 console.log(`[Next Round] All players ready. Starting next round...`);
                 game.startNewRound();
                 playersReadyForNextRound.set(roomId, new Set());
                 broadcastGameState(roomId, game);
                 console.log(`[Next Round] Sent new round state.`);
             }
         } else { socket.emit('gameError', { message: 'Cannot ready up now.' }); }
    });

     socket.on('handleTieDecision', (data) => {
          const { roomId, decision } = data;
          const playerId = socket.id;
          const game = activeGames.get(roomId);
          const roomData = roomManager.getRoom(roomId);
          const playersMap = roomData?.players;

          if (game && game.awaitingTieDecision && playersMap?.has(playerId)) {
              const result = game.processTieDecision(playerId, decision);
              if (result.success) {
                  socket.emit('tieDecisionAcknowledged', { decision });
                 if (result.status === 'waitingForOpponentDecision') { socket.to(roomId).emit('opponentDecidedTie', { playerId }); }
                 else if (result.status === 'continueTo21') { game.startNewRound(); playersReadyForNextRound.set(roomId, new Set()); broadcastGameState(roomId, game); }
                 else if (result.status === 'tieAgreed') { broadcastGameState(roomId, game); activeGames.delete(roomId); playersReadyForNextRound.delete(roomId); roomStartPreference.delete(roomId); roomSettings.delete(roomId); }
              } else { socket.emit('gameError', { message: result.reason || "Could not process tie." }); }
          } else { socket.emit('gameError', { message: "Not time to decide." }); }
      });


    // Handler for client requesting room info (used by GameRouter)
    socket.on('getRoomInfo', (data, callback) => {
        const { roomId } = data;
        const roomData = roomManager.getRoom(roomId);
        if (roomData?.settings) {
            if (callback) callback({ success: true, roomId: roomId, mode: roomData.settings.mode });
            else socket.emit('roomInfoResponse', { roomId: roomId, mode: roomData.settings.mode });
        } else {
             if (callback) callback({ success: false, error: 'Room not found' });
             else socket.emit('roomInfoResponse', { roomId: roomId, error: 'Room not found' });
        }
    });

    // --- Disconnect Handling ---
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        const roomId = roomManager.findRoomBySocketId(socket.id);
        if (roomId) {
            const game = activeGames.get(roomId);
            const roomData = roomManager.getRoom(roomId);
            const playerName = roomData?.players?.get(socket.id) || `P_${socket.id.substring(0,4)}`;
            const wasInRoom = roomManager.leaveRoom(roomId, socket.id); // Handles activeRooms deletion

            if (wasInRoom && roomData) {
                 const currentPlayers = roomManager.getPlayersInRoom(roomId); // Get remaining players
                 socket.to(roomId).emit('playerLeft', { socketId: socket.id, name: playerName, players: currentPlayers });
                 const readySet = playersReadyForNextRound.get(roomId);
                 if (readySet) readySet.delete(socket.id);
                 if (!roomManager.getRoom(roomId)) { // Room became empty
                     playersReadyForNextRound.delete(roomId); roomStartPreference.delete(roomId); roomSettings.delete(roomId);
                     console.log(`[Cleanup] Cleared maps for empty room ${roomId}`);
                 }
            }
            if (game) {
                 console.log(`[Game ${roomId}] Player ${playerName} disconnected during game.`);
                 io.to(roomId).emit('gameEnd', { message: `Game over: Player ${playerName} disconnected.` });
                 activeGames.delete(roomId); playersReadyForNextRound.delete(roomId); roomStartPreference.delete(roomId); roomSettings.delete(roomId);
                 console.log(`[Game ${roomId}] Game instance and associated maps removed.`);
            }
        }
    }); // End disconnect

}); // End io.on('connection')

httpServer.listen(PORT, () => {
    console.log(`Chkobba server listening on *:${PORT}`);
});