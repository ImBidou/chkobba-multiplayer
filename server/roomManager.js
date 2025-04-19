// server/roomManager.js
// Handles different room sizes based on mode stored in settings

// Store active rooms.
// Key: roomId
// Value: { players: Map<socketId, playerName>, settings: { mode: '1v1' | '2v2', winningScore: number } }
const activeRooms = new Map();

// --- MAX_PLAYERS_PER_ROOM constant REMOVED ---

// Accepts settings object { mode, winningScore }
function createRoom(roomId, settings) {
  if (activeRooms.has(roomId)) return false;

  // Validate settings during creation
  const mode = settings?.mode === '2v2' ? '2v2' : '1v1';
  const winningScore = settings?.winningScore === 21 ? 21 : 11;

  activeRooms.set(roomId, {
      players: new Map(), // Stores socketId -> playerName
      settings: { mode, winningScore } // Store validated settings
  });
  console.log(`[RoomManager] Room created: ${roomId}, Mode: ${mode}, Score: ${winningScore}`);
  return true;
}

// Helper to get max players for a specific room
function getMaxPlayers(roomId) {
    const room = activeRooms.get(roomId);
    if (!room) return 0; // Or maybe default to 2? Or throw error?
    return room.settings.mode === '2v2' ? 4 : 2;
}


function joinRoom(roomId, socketId, playerName) {
  const room = activeRooms.get(roomId);
  if (!room) return { success: false, reason: 'Room not found' };

  const maxPlayers = getMaxPlayers(roomId); // Get max players for this room's mode

  // Use the dynamic maxPlayers check
  if (room.players.size >= maxPlayers && !room.players.has(socketId)) {
      return { success: false, reason: 'Room is full' };
  }

  const alreadyInRoom = room.players.has(socketId);
  room.players.set(socketId, playerName); // Store/update player name

  if (!alreadyInRoom) {
      console.log(`[RoomManager] Player ${playerName}(${socketId.substring(0,4)}) joined room: ${roomId}. Players: ${room.players.size}/${maxPlayers}`);
  }
  // Return current player count regardless
  return { success: true, playerCount: room.players.size, alreadyInRoom };
}

function leaveRoom(roomId, socketId) {
  const room = activeRooms.get(roomId);
  // Check if room and player exist
  if (room?.players?.has(socketId)) {
    const playerName = room.players.get(socketId);
    room.players.delete(socketId);
    const maxPlayers = getMaxPlayers(roomId); // Get max for logging
    console.log(`[RoomManager] Player ${playerName}(${socketId.substring(0,4)}) left room: ${roomId}. Players: ${room.players.size}/${maxPlayers}`);
    // Delete room if empty
    if (room.players.size === 0) {
      activeRooms.delete(roomId);
      console.log(`[RoomManager] Room deleted (empty): ${roomId}`);
    }
    return true; // Indicate player was found and removed
  }
  return false; // Player or room wasn't found
}

// Returns the room object { players: Map<id, name>, settings: { mode, winningScore } }
function getRoom(roomId) {
    return activeRooms.get(roomId);
}

function findRoomBySocketId(socketId) {
    for (const [roomId, roomData] of activeRooms.entries()) {
        // Check if the players map exists and has the socketId
        if (roomData?.players?.has(socketId)) {
            return roomId;
        }
    }
    return null;
}

// Helper to get just the player info array [{id, name}] for a room
function getPlayersInRoom(roomId) {
    const room = activeRooms.get(roomId);
    // Check if room and players map exist
    if (!room?.players) return [];
    return Array.from(room.players.entries()).map(([id, name]) => ({ id, name }));
}


module.exports = {
  createRoom,
  joinRoom,
  leaveRoom,
  getRoom,
  findRoomBySocketId,
  getPlayersInRoom,
  getMaxPlayers // Export new helper
  // MAX_PLAYERS_PER_ROOM constant removed
};