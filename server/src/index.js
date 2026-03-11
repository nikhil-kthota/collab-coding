import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import RoomManager from './services/RoomManager.js';
import { applyOperation, transformOperation } from './services/OperationalTransform.js';
import CodeExecutor from './services/CodeExecutor.js';
import FileSystemManager from './services/FileSystemManager.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const httpServer = createServer(app);

// CORS configuration
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));

// Socket.IO server with CORS
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST']
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

const roomManager = new RoomManager();
const codeExecutor = new CodeExecutor();
const fileSystemManager = new FileSystemManager();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    rooms: roomManager.getRoomCount(),
    users: roomManager.getTotalUsers()
  });
});

// Serve frontend static files
const distPath = path.join(__dirname, '../../client/dist');
app.use(express.static(distPath));

// Fallback for React Router (Single Page Application)
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  
  // Join room
  socket.on('join-room', ({ roomId, userName, language, isCreating }) => {
    try {
      // If user is joining (not creating), verify the room exists
      if (!isCreating && !roomManager.roomExists(roomId)) {
        socket.emit('room-not-found', { roomId });
        return;
      }

      const room = roomManager.joinRoom(roomId, socket.id, userName);
      socket.join(roomId);
      
      // Send current document state to the new user
      socket.emit('room-joined', {
        roomId,
        content: room.content,
        language: room.language,
        users: room.users,
        version: room.version
      });
      
      // Notify others in the room
      socket.to(roomId).emit('user-joined', {
        userId: socket.id,
        userName,
        users: room.users
      });
      
      console.log(`User ${userName} (${socket.id}) joined room ${roomId}`);
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });
  
  // Handle code changes with operational transformation
  socket.on('code-change', ({ roomId, change, version }) => {
    try {
      const room = roomManager.getRoom(roomId);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }
      
      // Version check for conflict resolution
      if (version < room.version) {
        // Transform the operation against missed operations
        const transformedChange = roomManager.transformOperation(roomId, change, version);
        change = transformedChange;
      }
      
      // Apply the change
      room.content = applyOperation(room.content, change);
      room.version++;
      
      // Broadcast to all clients except sender
      socket.to(roomId).emit('code-update', {
        change,
        userId: socket.id,
        version: room.version
      });
      
      // Acknowledge to sender
      socket.emit('change-ack', { version: room.version });
      
    } catch (error) {
      console.error('Code change error:', error);
      socket.emit('error', { message: 'Failed to apply change' });
    }
  });
  
  // Language change
  socket.on('language-change', ({ roomId, language }) => {
    try {
      const room = roomManager.getRoom(roomId);
      if (room) {
        room.language = language;
        socket.to(roomId).emit('language-update', { language, userId: socket.id });
      }
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });
  
  // Cursor position updates
  socket.on('cursor-position', ({ roomId, position, selection }) => {
    socket.to(roomId).emit('cursor-update', {
      userId: socket.id,
      position,
      selection
    });
  });
  
  // User typing indicator
  socket.on('typing', ({ roomId }) => {
    socket.to(roomId).emit('user-typing', { userId: socket.id });
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    
    const userRooms = roomManager.getUserRooms(socket.id);
    userRooms.forEach(roomId => {
      const room = roomManager.leaveRoom(roomId, socket.id);
      
      if (room) {
        // Notify others
        socket.to(roomId).emit('user-left', {
          userId: socket.id,
          users: room.users
        });
      }
    });
  });
  
  // Explicit leave room
  socket.on('leave-room', ({ roomId }) => {
    const room = roomManager.leaveRoom(roomId, socket.id);
    socket.leave(roomId);
    
    if (room) {
      socket.to(roomId).emit('user-left', {
        userId: socket.id,
        users: room.users
      });
    }
  });
  
  // Execute code
  socket.on('execute-code', async ({ roomId, code, language, userName }) => {
    try {
      console.log(`Executing ${language} code for user ${socket.id} in room ${roomId}`);
      
      const result = await codeExecutor.executeCode(code, language);
      
      // Broadcast result to all users in the room
      io.to(roomId).emit('execution-result', {
        ...result,
        userId: socket.id,
        userName,
        timestamp: Date.now()
      });
      
    } catch (error) {
      console.error('Code execution error:', error);
      socket.emit('execution-result', {
        success: false,
        error: error.message,
        output: '',
        userId: socket.id,
        userName,
        timestamp: Date.now()
      });
    }
  });
  
  // File system operations
  socket.on('get-file-tree', async ({ roomId }) => {
    try {
      const tree = await fileSystemManager.getFileTree(roomId);
      socket.emit('file-tree-update', { tree });
    } catch (error) {
      socket.emit('error', { message: 'Failed to load file tree' });
    }
  });
  
  socket.on('get-folder-contents', async ({ roomId, path }) => {
    try {
      const contents = await fileSystemManager.getFileTree(roomId, path);
      socket.emit('folder-contents-update', { path, contents });
    } catch (error) {
      socket.emit('error', { message: 'Failed to load folder contents' });
    }
  });
  
  socket.on('open-file', async ({ roomId, path }) => {
    try {
      const result = await fileSystemManager.readFile(roomId, path);
      if (result.success) {
        socket.emit('file-opened', result);
      } else {
        socket.emit('error', { message: result.error });
      }
    } catch (error) {
      socket.emit('error', { message: 'Failed to open file' });
    }
  });
  
  socket.on('save-file', async ({ roomId, path, content }) => {
    try {
      const result = await fileSystemManager.writeFile(roomId, path, content);
      if (result.success) {
        // Notify the sender
        socket.emit('file-saved', { ...result, timestamp: Date.now() });
        // Notify all others in the room that file was updated
        socket.to(roomId).emit('file-updated', { path, userId: socket.id, timestamp: Date.now() });
        // Refresh file tree for everyone
        const tree = await fileSystemManager.getFileTree(roomId);
        io.to(roomId).emit('file-tree-update', { tree });
      } else {
        socket.emit('error', { message: result.error });
      }
    } catch (error) {
      socket.emit('error', { message: 'Failed to save file' });
    }
  });
  
  socket.on('create-file', async ({ roomId, path, content = '' }) => {
    try {
      const result = await fileSystemManager.createFile(roomId, path, content);
      if (result.success) {
        // Notify everyone in the room
        const tree = await fileSystemManager.getFileTree(roomId);
        io.to(roomId).emit('file-created', { ...result, timestamp: Date.now() });
        io.to(roomId).emit('file-tree-update', { tree });
      } else {
        socket.emit('error', { message: result.error });
      }
    } catch (error) {
      socket.emit('error', { message: 'Failed to create file' });
    }
  });
  
  socket.on('create-folder', async ({ roomId, path }) => {
    try {
      const result = await fileSystemManager.createDirectory(roomId, path);
      if (result.success) {
        // Notify everyone in the room
        const tree = await fileSystemManager.getFileTree(roomId);
        io.to(roomId).emit('folder-created', { ...result, timestamp: Date.now() });
        io.to(roomId).emit('file-tree-update', { tree });
      } else {
        socket.emit('error', { message: result.error });
      }
    } catch (error) {
      socket.emit('error', { message: 'Failed to create folder' });
    }
  });
  
  socket.on('delete-file', async ({ roomId, path }) => {
    try {
      const result = await fileSystemManager.delete(roomId, path);
      if (result.success) {
        // Notify everyone in the room
        const tree = await fileSystemManager.getFileTree(roomId);
        io.to(roomId).emit('file-deleted', { ...result, timestamp: Date.now() });
        io.to(roomId).emit('file-tree-update', { tree });
      } else {
        socket.emit('error', { message: result.error });
      }
    } catch (error) {
      socket.emit('error', { message: 'Failed to delete file' });
    }
  });

  // Terminal command execution
  socket.on('terminal-command', async ({ roomId, command }) => {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      const room = roomManager.getRoom(roomId);
      const user = room?.users.get(socket.id);

      try {
        const { stdout, stderr } = await execAsync(command, {
          timeout: 30000, // 30 second timeout
          maxBuffer: 1024 * 1024, // 1MB buffer
          cwd: fileSystemManager.workspaceDir
        });

        const output = stdout || stderr || 'Command completed with no output';
        io.to(roomId).emit('terminal-output', {
          output,
          command,
          user: user?.name || 'Unknown'
        });
      } catch (execError) {
        io.to(roomId).emit('terminal-error', {
          error: execError.message,
          command
        });
      }
    } catch (error) {
      socket.emit('terminal-error', {
        error: 'Failed to execute command',
        command
      });
    }
  });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 Collaborative Code Editor Server`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  httpServer.close(() => {
    console.log('HTTP server closed');
  });
});
