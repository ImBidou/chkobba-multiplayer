// client/src/socket.js

import { io } from 'socket.io-client';

// Ensure this matches the address/port your server is running on
const SERVER_URL = 'https://www.chkobba.io';

export const socket = io(SERVER_URL, {
  autoConnect: false // Important: connect manually when needed
});

// Helper functions
export const connectSocket = () => {
  if (!socket.connected) {
    socket.connect();
    console.log('Attempting to connect socket...');
  }
};

export const disconnectSocket = () => {
  if (socket.connected) {
    socket.disconnect();
    console.log('Socket disconnected.');
  }
};

// --- Basic Listeners (can add more specific ones here or in components) ---
socket.on("connect", () => {
  console.log("Socket connected (Client):", socket.id);
});

socket.on("disconnect", (reason) => {
  console.log("Socket disconnected (Client):", reason);
  // Optionally trigger UI update to show disconnected state
});

socket.on("connect_error", (err) => {
  console.error("Socket connection error (Client):", err.message);
  // Optionally trigger UI update to show connection error
});

// --- Game Event Emitters (optional helpers) ---
export const emitCreateRoom = (data, callback) => {
    socket.emit('createRoom', data, callback);
}

export const emitJoinRoom = (data, callback) => {
    socket.emit('joinRoom', data, callback);
}

export const emitPlayCard = (data) => {
    socket.emit('playCard', data);
}
