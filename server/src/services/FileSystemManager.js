import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * File System Manager
 * Manages file and folder operations for collaborative editing
 */
class FileSystemManager {
  constructor() {
    this.workspaceRoot = path.join(__dirname, '../../workspace');
    this.maxFileSize = 1024 * 1024; // 1MB
    this.allowedExtensions = [
      '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.cpp', '.c', '.go',
      '.html', '.css', '.json', '.md', '.txt', '.yml', '.yaml', '.xml',
      '.sh', '.bat', '.sql', '.rs', '.rb', '.php', '.vue', '.svelte'
    ];
    this.ensureWorkspace();
  }

  /**
   * Get group-specific workspace path
   */
  getGroupWorkspace(groupId) {
    return path.join(this.workspaceRoot, groupId);
  }

  async ensureWorkspace() {
    try {
      await fs.access(this.workspaceRoot);
    } catch {
      await fs.mkdir(this.workspaceRoot, { recursive: true });
    }
  }

  /**
   * Ensure group workspace exists
   */
  async ensureGroupWorkspace(groupId) {
    const groupWorkspace = this.getGroupWorkspace(groupId);
    try {
      await fs.access(groupWorkspace);
    } catch {
      await fs.mkdir(groupWorkspace, { recursive: true });
      await this.createDefaultStructure(groupId);
    }
  }

  async createDefaultStructure(groupId) {
    const groupWorkspace = this.getGroupWorkspace(groupId);
    const defaultFolders = ['src', 'tests', 'docs'];
    for (const folder of defaultFolders) {
      await fs.mkdir(path.join(groupWorkspace, folder), { recursive: true });
    }
    
    // Create a welcome file
    const welcomeContent = `// Welcome to Collaborative Code Editor!
// Group: ${groupId}
// Start coding together in real-time
// All files are saved automatically and shared with everyone in this group

console.log("Hello, World!");
`;
    await fs.writeFile(
      path.join(groupWorkspace, 'index.js'),
      welcomeContent
    );
  }

  /**
   * Get workspace structure for a group
   */
  async getFileTree(groupId, relativePath = '') {
    try {
      await this.ensureGroupWorkspace(groupId);
      const groupWorkspace = this.getGroupWorkspace(groupId);
      const fullPath = path.join(groupWorkspace, relativePath);
      const items = await fs.readdir(fullPath, { withFileTypes: true });

      const tree = [];

      for (const item of items) {
        const itemPath = path.join(relativePath, item.name);
        
        if (item.isDirectory()) {
          tree.push({
            name: item.name,
            type: 'directory',
            path: itemPath,
            children: []
          });
        } else if (item.isFile()) {
          const ext = path.extname(item.name);
          if (this.allowedExtensions.includes(ext) || ext === '') {
            const stats = await fs.stat(path.join(fullPath, item.name));
            tree.push({
              name: item.name,
              type: 'file',
              path: itemPath,
              size: stats.size,
              extension: ext
            });
          }
        }
      }

      // Sort: directories first, then files alphabetically
      tree.sort((a, b) => {
        if (a.type === b.type) {
          return a.name.localeCompare(b.name);
        }
        return a.type === 'directory' ? -1 : 1;
      });

      return tree;
    } catch (error) {
      console.error('Error reading file tree:', error);
      return [];
    }
  }

  /**
   * Read file content from group workspace
   */
  async readFile(groupId, relativePath) {
    try {
      const groupWorkspace = this.getGroupWorkspace(groupId);
      const fullPath = path.join(groupWorkspace, relativePath);
      const ext = path.extname(fullPath);

      if (!this.allowedExtensions.includes(ext) && ext !== '') {
        throw new Error('File type not allowed');
      }

      const stats = await fs.stat(fullPath);
      if (stats.size > this.maxFileSize) {
        throw new Error('File too large');
      }

      const content = await fs.readFile(fullPath, 'utf-8');
      return {
        success: true,
        content,
        path: relativePath,
        size: stats.size
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Write file content to group workspace
   */
  async writeFile(groupId, relativePath, content) {
    try {
      const groupWorkspace = this.getGroupWorkspace(groupId);
      const fullPath = path.join(groupWorkspace, relativePath);
      const ext = path.extname(fullPath);

      if (!this.allowedExtensions.includes(ext) && ext !== '') {
        throw new Error('File type not allowed');
      }

      // Ensure directory exists
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, 'utf-8');

      return {
        success: true,
        path: relativePath
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create new file in group workspace
   */
  async createFile(groupId, relativePath, content = '') {
    try {
      const groupWorkspace = this.getGroupWorkspace(groupId);
      const fullPath = path.join(groupWorkspace, relativePath);
      
      // Check if file already exists
      try {
        await fs.access(fullPath);
        throw new Error('File already exists');
      } catch (err) {
        if (err.message === 'File already exists') throw err;
      }

      const ext = path.extname(fullPath);
      if (!this.allowedExtensions.includes(ext) && ext !== '') {
        throw new Error('File type not allowed');
      }

      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, 'utf-8');

      return {
        success: true,
        path: relativePath
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create new directory in group workspace
   */
  async createDirectory(groupId, relativePath) {
    try {
      const groupWorkspace = this.getGroupWorkspace(groupId);
      const fullPath = path.join(groupWorkspace, relativePath);
      await fs.mkdir(fullPath, { recursive: true });

      return {
        success: true,
        path: relativePath
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete file or directory from group workspace
   */
  async delete(groupId, relativePath) {
    try {
      const groupWorkspace = this.getGroupWorkspace(groupId);
      const fullPath = path.join(groupWorkspace, relativePath);
      const stats = await fs.stat(fullPath);

      if (stats.isDirectory()) {
        await fs.rm(fullPath, { recursive: true });
      } else {
        await fs.unlink(fullPath);
      }

      return {
        success: true,
        path: relativePath
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Rename file or directory in group workspace
   */
  async rename(groupId, oldPath, newPath) {
    try {
      const groupWorkspace = this.getGroupWorkspace(groupId);
      const fullOldPath = path.join(groupWorkspace, oldPath);
      const fullNewPath = path.join(groupWorkspace, newPath);

      await fs.rename(fullOldPath, fullNewPath);

      return {
        success: true,
        oldPath,
        newPath
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Validate path (prevent directory traversal)
   */
  isValidPath(groupId, relativePath) {
    const groupWorkspace = this.getGroupWorkspace(groupId);
    const fullPath = path.join(groupWorkspace, relativePath);
    return fullPath.startsWith(groupWorkspace);
  }
}

export default FileSystemManager;
