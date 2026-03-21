import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import GroupManager from './services/GroupManager.js';
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

const groupManager = new GroupManager();
const codeExecutor = new CodeExecutor();
const fileSystemManager = new FileSystemManager();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    groups: groupManager.getGroupCount(),
    users: groupManager.getTotalUsers()
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
  
  // Join group
  socket.on('join-group', ({ groupId, userName, language, isCreating }) => {
    try {
      // If user is joining (not creating), verify the group exists
      if (!isCreating && !groupManager.groupExists(groupId)) {
        socket.emit('group-not-found', { groupId });
        return;
      }

      const group = groupManager.joinGroup(groupId, socket.id, userName);
      socket.join(groupId);
      
      // Send current document state to the new user
      socket.emit('group-joined', {
        groupId,
        content: group.content,
        language: group.language,
        users: Array.from(group.users.entries()),
        version: group.version
      });
      
      // Notify others in the group
      socket.to(groupId).emit('user-joined', {
        userId: socket.id,
        userName,
        users: Array.from(group.users.entries())
      });
      
      console.log(`User ${userName} (${socket.id}) joined group ${groupId}`);
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });
  
  // Handle code changes with operational transformation
  socket.on('code-change', ({ groupId, change, version }) => {
    try {
      const group = groupManager.getGroup(groupId);
      if (!group) {
        socket.emit('error', { message: 'Group not found' });
        return;
      }
      
      // Version check for conflict resolution
      if (version < group.version) {
        // Transform the operation against missed operations
        const transformedChange = groupManager.transformOperation(groupId, change, version);
        change = transformedChange;
      }
      
      // Apply the change
      group.content = applyOperation(group.content, change);
      group.version++;
      
      // Broadcast to all clients except sender
      socket.to(groupId).emit('code-update', {
        change,
        userId: socket.id,
        version: group.version
      });
      
      // Acknowledge to sender
      socket.emit('change-ack', { version: group.version });
      
    } catch (error) {
      console.error('Code change error:', error);
      socket.emit('error', { message: 'Failed to apply change' });
    }
  });
  
  // Language change
  socket.on('language-change', ({ groupId, language }) => {
    try {
      const group = groupManager.getGroup(groupId);
      if (group) {
        group.language = language;
        socket.to(groupId).emit('language-update', { language, userId: socket.id });
      }
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });
  
  // Cursor position updates
  socket.on('cursor-position', ({ groupId, position, selection }) => {
    socket.to(groupId).emit('cursor-update', {
      userId: socket.id,
      position,
      selection
    });
  });
  
  // User typing indicator
  socket.on('typing', ({ groupId }) => {
    socket.to(groupId).emit('user-typing', { userId: socket.id });
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    
    const userGroups = groupManager.getUserGroups(socket.id);
    userGroups.forEach(groupId => {
      const group = groupManager.leaveGroup(groupId, socket.id);
      
      if (group) {
        // Notify others
        socket.to(groupId).emit('user-left', {
          userId: socket.id,
          users: Array.from(group.users.entries())
        });
      }
    });
  });
  
  // Explicit leave group
  socket.on('leave-group', ({ groupId }) => {
    const group = groupManager.leaveGroup(groupId, socket.id);
    socket.leave(groupId);
    
    if (group) {
      socket.to(groupId).emit('user-left', {
        userId: socket.id,
        users: Array.from(group.users.entries())
      });
    }
  });
  
  // Handle client-side execution broadcasting
  socket.on('broadcast-execution', ({ groupId, result, userName }) => {
    // Broadcast result to all users in the group (including sender)
    io.to(groupId).emit('execution-result', {
      ...result,
      userId: socket.id,
      userName,
      timestamp: Date.now()
    });
  });
  
  // File system operations
  socket.on('get-file-tree', async ({ groupId }) => {
    try {
      const tree = await fileSystemManager.getFileTree(groupId);
      socket.emit('file-tree-update', { tree });
    } catch (error) {
      socket.emit('error', { message: 'Failed to load file tree' });
    }
  });
  
  socket.on('get-folder-contents', async ({ groupId, path }) => {
    try {
      const contents = await fileSystemManager.getFileTree(groupId, path);
      socket.emit('folder-contents-update', { path, contents });
    } catch (error) {
      socket.emit('error', { message: 'Failed to load folder contents' });
    }
  });
  
  socket.on('open-file', async ({ groupId, path }) => {
    try {
      const result = await fileSystemManager.readFile(groupId, path);
      if (result.success) {
        socket.emit('file-opened', result);
      } else {
        socket.emit('error', { message: result.error });
      }
    } catch (error) {
      socket.emit('error', { message: 'Failed to open file' });
    }
  });
  
  socket.on('save-file', async ({ groupId, path, content }) => {
    try {
      const result = await fileSystemManager.writeFile(groupId, path, content);
      if (result.success) {
        // Notify the sender
        socket.emit('file-saved', { ...result, timestamp: Date.now() });
        // Notify all others in the group that file was updated
        socket.to(groupId).emit('file-updated', { path, userId: socket.id, timestamp: Date.now() });
        // Refresh file tree for everyone
        const tree = await fileSystemManager.getFileTree(groupId);
        io.to(groupId).emit('file-tree-update', { tree });
      } else {
        socket.emit('error', { message: result.error });
      }
    } catch (error) {
      socket.emit('error', { message: 'Failed to save file' });
    }
  });
  
  socket.on('create-file', async ({ groupId, path, content = '' }) => {
    try {
      const result = await fileSystemManager.createFile(groupId, path, content);
      if (result.success) {
        // Notify everyone in the group
        const tree = await fileSystemManager.getFileTree(groupId);
        io.to(groupId).emit('file-created', { ...result, timestamp: Date.now() });
        io.to(groupId).emit('file-tree-update', { tree });
      } else {
        socket.emit('error', { message: result.error });
      }
    } catch (error) {
      socket.emit('error', { message: 'Failed to create file' });
    }
  });
  
  socket.on('create-folder', async ({ groupId, path }) => {
    try {
      const result = await fileSystemManager.createDirectory(groupId, path);
      if (result.success) {
        // Notify everyone in the group
        const tree = await fileSystemManager.getFileTree(groupId);
        io.to(groupId).emit('folder-created', { ...result, timestamp: Date.now() });
        io.to(groupId).emit('file-tree-update', { tree });
      } else {
        socket.emit('error', { message: result.error });
      }
    } catch (error) {
      socket.emit('error', { message: 'Failed to create folder' });
    }
  });
  
  socket.on('delete-file', async ({ groupId, path }) => {
    try {
      const result = await fileSystemManager.delete(groupId, path);
      if (result.success) {
        // Notify everyone in the group
        const tree = await fileSystemManager.getFileTree(groupId);
        io.to(groupId).emit('file-deleted', { ...result, timestamp: Date.now() });
        io.to(groupId).emit('file-tree-update', { tree });
      } else {
        socket.emit('error', { message: result.error });
      }
    } catch (error) {
      socket.emit('error', { message: 'Failed to delete file' });
    }
  });

  // Terminal command execution
  socket.on('terminal-command', async ({ groupId, command }) => {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      const group = groupManager.getGroup(groupId);
      const user = group?.users.get(socket.id);

      try {
        const { stdout, stderr } = await execAsync(command, {
          timeout: 30000, // 30 second timeout
          maxBuffer: 1024 * 1024, // 1MB buffer
          cwd: fileSystemManager.workspaceDir
        });

        const output = stdout || stderr || 'Command completed with no output';
        io.to(groupId).emit('terminal-output', {
          output,
          command,
          user: user?.name || 'Unknown'
        });
      } catch (execError) {
        io.to(groupId).emit('terminal-error', {
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
