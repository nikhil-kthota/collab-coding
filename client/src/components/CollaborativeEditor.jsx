import { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { io } from 'socket.io-client';
import UserPanel from './UserPanel';
import LanguageSelector from './LanguageSelector';
import OutputPanel from './OutputPanel';
import ThemeSwitcher from './ThemeSwitcher';
import './CollaborativeEditor.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

function CollaborativeEditor({ groupId, userName, userId, isCreating, onLeaveGroup }) {
  const [socket, setSocket] = useState(null);
  const [content, setContent] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [users, setUsers] = useState(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [version, setVersion] = useState(0);
  const [output, setOutput] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentFile, setCurrentFile] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // New feature states
  const [theme, setTheme] = useState('vs-dark');
  const [openTabs, setOpenTabs] = useState([]);
  const [activeTab, setActiveTab] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showExtensions, setShowExtensions] = useState(false);
  const [showInfoBanner, setShowInfoBanner] = useState(true);
  const [settings, setSettings] = useState({
    fontSize: 14,
    minimap: true,
    lineNumbers: true,
    wordWrap: true,
    autoSave: false,
    formatOnSave: false,
    tabSize: 2,
    bracketPairColorization: true,
    folding: true,
    renderWhitespace: false
  });
  const [extensions, setExtensions] = useState([
    {
      id: 'live-share',
      name: 'Live Share',
      description: 'Real-time collaborative editing',
      icon: '🤝',
      installed: true,
      enabled: true
    }
  ]);
  
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const isRemoteChange = useRef(false);
  const pendingChanges = useRef([]);
  const lastCursorPosition = useRef(null);
  
  const socketRef = useRef(null);
  const isConnectedRef = useRef(false);
  const versionRef = useRef(0);

  useEffect(() => {
    socketRef.current = socket;
    isConnectedRef.current = isConnected;
    versionRef.current = version;
  }, [socket, isConnected, version]);

  // Apply theme to Monaco editor when theme state changes
  useEffect(() => {
    if (monacoRef.current) {
      const themeMap = { 'vs-dark': 'custom-dark-green', 'vs': 'custom-light', 'hc-black': 'custom-hc-black' };
      monacoRef.current.editor.setTheme(themeMap[theme] || 'custom-dark-green');
    }
  }, [theme]);

  // Initialize Socket.IO connection
  useEffect(() => {
    const newSocket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    newSocket.on('connect', () => {
      console.log('Connected to server');
      setIsConnected(true);
      
      // Join group
      newSocket.emit('join-group', {
        groupId,
        userName,
        language,
        isCreating
      });
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
      setIsConnected(false);
    });

    // Group not found
    newSocket.on('group-not-found', ({ groupId }) => {
      alert(`Group "${groupId}" does not exist. Please check the Group ID or create a new group.`);
      newSocket.disconnect();
      onLeaveGroup();
    });

    // Group joined successfully
    newSocket.on('group-joined', ({ content, language, users, version }) => {
      console.log('Joined group successfully');
      isRemoteChange.current = true;
      setContent(content);
      setLanguage(language);
      setUsers(new Map(users));
      setVersion(version);
    });

    // User joined
    newSocket.on('user-joined', ({ userId, userName, users }) => {
      console.log(`User ${userName} joined`);
      setUsers(new Map(users));
    });

    // User left
    newSocket.on('user-left', ({ userId, users }) => {
      console.log(`User ${userId} left`);
      setUsers(new Map(users));
    });

    // Code update from other users
    newSocket.on('code-update', ({ change, userId: changeUserId, version: newVersion }) => {
      if (editorRef.current && monacoRef.current) {
        isRemoteChange.current = true;
        
        const model = editorRef.current.getModel();
        const { rangeOffset, rangeLength, text } = change;
        
        // Convert offset to position
        const startPos = model.getPositionAt(rangeOffset);
        const endPos = model.getPositionAt(rangeOffset + rangeLength);
        
        // Apply change
        model.applyEdits([{
          range: new monacoRef.current.Range(
            startPos.lineNumber,
            startPos.column,
            endPos.lineNumber,
            endPos.column
          ),
          text
        }]);
        
        setVersion(newVersion);
      }
    });

    // Change acknowledgment
    newSocket.on('change-ack', ({ version: newVersion }) => {
      setVersion(newVersion);
    });

    // Language update
    newSocket.on('language-update', ({ language }) => {
      setLanguage(language);
    });

    // Cursor updates from other users
    newSocket.on('cursor-update', ({ userId, position, selection }) => {
      // Could be used to show other users' cursors
      console.log(`User ${userId} cursor at`, position);
    });

    // Error handling
    newSocket.on('error', ({ message }) => {
      console.error('Socket error:', message);
      alert(`Error: ${message}`);
    });

    // Execution result
    newSocket.on('execution-result', (result) => {
      console.log('Execution result received:', result);
      setOutput(prev => [...prev, result]);
      setIsRunning(false);
    });

    // File operations
    newSocket.on('file-opened', ({ content, path }) => {
      isRemoteChange.current = true;
      setContent(content);
      setCurrentFile(path);
      setHasUnsavedChanges(false);
      
      // Detect language from file extension
      const ext = path.split('.').pop();
      const langMap = {
        'js': 'javascript',
        'jsx': 'javascript',
        'ts': 'typescript',
        'tsx': 'typescript',
        'py': 'python',
        'java': 'java',
        'cpp': 'cpp',
        'c': 'c',
        'go': 'go',
        'html': 'html',
        'css': 'css',
        'json': 'json',
        'md': 'markdown'
      };
      if (langMap[ext]) {
        setLanguage(langMap[ext]);
      }
    });

    newSocket.on('file-saved', ({ timestamp }) => {
      setHasUnsavedChanges(false);
      console.log('File saved successfully at', new Date(timestamp).toLocaleTimeString());
    });

    newSocket.on('file-updated', ({ path, userId, timestamp }) => {
      console.log(`File ${path} was updated by another user at`, new Date(timestamp).toLocaleTimeString());
      // If it's the current file, optionally reload it
      if (path === currentFile && userId !== socket?.id) {
        // Notify user that the file was updated by someone else
        if (confirm(`File "${path}" was updated by another user. Reload?`)) {
          newSocket.emit('open-file', { groupId, path });
        }
      }
    });

    newSocket.on('file-created', ({ path, timestamp }) => {
      console.log(`New file created: ${path} at`, new Date(timestamp).toLocaleTimeString());
    });

    newSocket.on('folder-created', ({ path, timestamp }) => {
      console.log(`New folder created: ${path} at`, new Date(timestamp).toLocaleTimeString());
    });

    newSocket.on('file-deleted', ({ path, timestamp }) => {
      console.log(`File deleted: ${path} at`, new Date(timestamp).toLocaleTimeString());
      // If current file was deleted, clear editor
      if (path === currentFile) {
        setCurrentFile(null);
        setContent('');
        setHasUnsavedChanges(false);
      }
    });

    setSocket(newSocket);

    return () => {
      newSocket.emit('leave-group', { groupId });
      newSocket.close();
    };
  }, [groupId, userName, language]);

  // Handle editor mount
  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Define custom dark theme
    monaco.editor.defineTheme('custom-dark-green', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#1e1e1e',
        'editorCursor.foreground': '#10b981',
        'editor.lineHighlightBackground': '#2a2d2e',
        'editor.selectionBackground': '#10b98155',
        'editor.inactiveSelectionBackground': '#10b98133'
      }
    });

    // Define custom light theme
    monaco.editor.defineTheme('custom-light', {
      base: 'vs',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#ffffff',
        'editorCursor.foreground': '#000000',
        'editor.lineHighlightBackground': '#f0f0f0',
        'editor.selectionBackground': '#add6ff',
        'editor.inactiveSelectionBackground': '#e5ebf1'
      }
    });

    // Define custom high contrast theme
    monaco.editor.defineTheme('custom-hc-black', {
      base: 'hc-black',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#000000',
        'editorCursor.foreground': '#ffffff',
        'editor.lineHighlightBackground': '#1a1a1a',
        'editor.selectionBackground': '#264f78',
        'editor.inactiveSelectionBackground': '#3a3d41'
      }
    });

    // Apply current theme
    const themeMap = { 'vs-dark': 'custom-dark-green', 'vs': 'custom-light', 'hc-black': 'custom-hc-black' };
    monaco.editor.setTheme(themeMap[theme] || 'custom-dark-green');

    // Listen to content changes
    editor.onDidChangeModelContent((event) => {
      if (isRemoteChange.current) {
        isRemoteChange.current = false;
        return;
      }

      // Send changes to server
      if (socketRef.current && isConnectedRef.current) {
        event.changes.forEach((change) => {
          const rangeOffset = editor.getModel().getOffsetAt({
            lineNumber: change.range.startLineNumber,
            column: change.range.startColumn
          });

          const operation = {
            rangeOffset,
            rangeLength: change.rangeLength,
            text: change.text
          };

          socketRef.current.emit('code-change', {
            groupId,
            change: operation,
            version: versionRef.current
          });
        });
      }
    });

    // Track cursor position
    editor.onDidChangeCursorPosition((event) => {
      const position = event.position;
      if (socketRef.current && isConnectedRef.current) {
        // Throttle cursor updates
        if (Date.now() - (lastCursorPosition.current || 0) > 100) {
          socketRef.current.emit('cursor-position', {
            groupId,
            position: {
              lineNumber: position.lineNumber,
              column: position.column
            },
            selection: editor.getSelection()
          });
          lastCursorPosition.current = Date.now();
        }
      }
    });

    // Set editor options
    editor.updateOptions({
      fontSize: settings.fontSize,
      minimap: { enabled: settings.minimap },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: settings.tabSize,
      wordWrap: settings.wordWrap ? 'on' : 'off',
      lineNumbers: settings.lineNumbers ? 'on' : 'off',
      folding: settings.folding,
      renderWhitespace: settings.renderWhitespace ? 'all' : 'none',
      'bracketPairColorization.enabled': settings.bracketPairColorization
    });

    // Add keyboard shortcut for running code (Ctrl+Enter)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      handleRunCode();
    });

    // Add keyboard shortcut for saving (Ctrl+S)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleSaveFile();
    });
  };

  // Handle code execution directly from browser to Piston API
  const handleRunCode = async () => {
    if (!socketRef.current || !isConnectedRef.current || isRunning || !editorRef.current) {
      return;
    }

    const code = editorRef.current.getValue();
    if (!code.trim()) {
      alert('Please write some code first!');
      return;
    }

    setIsRunning(true);
    // Tell users we started
    setOutput([{ 
      success: true, 
      output: `Executing ${language} code...`, 
      error: null, 
      userName: userName || 'System', 
      timestamp: Date.now() 
    }]);

    try {
      const langMap = {
        'javascript': 'javascript', 'js': 'javascript',
        'python': 'python', 'py': 'python',
        'java': 'java', 'cpp': 'c++', 'c++': 'c++',
        'c': 'c', 'go': 'go', 'typescript': 'typescript', 'ts': 'typescript'
      };

      const mappedLang = langMap[language.toLowerCase()];
      if (!mappedLang) {
        throw new Error(`Language "${language}" is not supported`);
      }

      let mainFileName = 'main.' + mappedLang;
      if (mappedLang === 'java') {
        const classNameMatch = code.match(/public\s+class\s+(\w+)/);
        mainFileName = classNameMatch ? classNameMatch[1] + '.java' : 'Main.java';
      }

      const startTime = Date.now();
      const response = await fetch('https://emkc.org/api/v2/piston/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: mappedLang,
          version: '*', // auto select latest available
          files: [{ name: mainFileName, content: code }]
        })
      });

      if (!response.ok) {
        throw new Error(`Execution Service Blocked: ${response.statusText}`);
      }

      const result = await response.json();
      const executionTime = Date.now() - startTime;

      let finalOutput = '';
      let isSuccess = false;
      let finalError = null;

      if (result.compile && result.compile.code !== 0) {
        finalError = 'Compilation Error:\n' + result.compile.output;
      } else if (result.run) {
        isSuccess = result.run.code === 0;
        finalOutput = result.run.output || (isSuccess ? 'Program executed successfully (no output)' : '');
        if (!isSuccess) {
          finalError = 'Runtime Error:\n' + (result.run.stderr || result.run.output);
        }
      }

      // Tell the server to broadcast this result
      socketRef.current.emit('broadcast-execution', {
        groupId,
        userName,
        result: {
          success: isSuccess,
          output: finalOutput,
          error: finalError,
          executionTime
        }
      });
      
    } catch (err) {
      socketRef.current.emit('broadcast-execution', {
        groupId,
        userName,
        result: {
          success: false,
          output: '',
          error: err.message,
          executionTime: 0
        }
      });
    }
  };

  // Clear output
  const handleClearOutput = () => {
    setOutput([]);
  };

  // Open file from local system
  const handleOpenFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.js,.jsx,.ts,.tsx,.py,.java,.cpp,.c,.go,.html,.css,.json,.md,.txt';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const fileContent = event.target.result;
          isRemoteChange.current = true;
          setContent(fileContent);
          setCurrentFile(file.name);
          
          // Detect language from extension
          const ext = file.name.split('.').pop().toLowerCase();
          const langMap = {
            'js': 'javascript', 'jsx': 'javascript',
            'ts': 'typescript', 'tsx': 'typescript',
            'py': 'python', 'java': 'java',
            'cpp': 'cpp', 'c': 'c', 'go': 'go',
            'html': 'html', 'css': 'css',
            'json': 'json', 'md': 'markdown'
          };
          if (langMap[ext]) {
            setLanguage(langMap[ext]);
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  // Create new file
  const handleNewFile = () => {
    const fileName = prompt('Enter file name (e.g., mycode.js, test.java):');
    if (fileName) {
      setCurrentFile(fileName);
      setContent('// Welcome to the collaborative code editor!\\n// Start coding together...\\n');
      setHasUnsavedChanges(false);
      
      // Detect language from extension
      const ext = fileName.split('.').pop().toLowerCase();
      const langMap = {
        'js': 'javascript', 'jsx': 'javascript',
        'ts': 'typescript', 'tsx': 'typescript',
        'py': 'python', 'java': 'java',
        'cpp': 'cpp', 'c': 'c', 'go': 'go',
        'html': 'html', 'css': 'css',
        'json': 'json', 'md': 'markdown'
      };
      if (langMap[ext]) {
        setLanguage(langMap[ext]);
      }
    }
  };

  // Download current file
  const handleDownloadFile = () => {
    if (!editorRef.current) return;
    
    const code = editorRef.current.getValue();
    const fileName = currentFile || `code.${language === 'javascript' ? 'js' : language}`;
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Save file
  const handleSaveFile = () => {
    if (!socket || !currentFile || !editorRef.current) return;

    const content = editorRef.current.getValue();
    socket.emit('save-file', {
      groupId,
      path: currentFile,
      content
    });
  };

  // Handle file select from explorer
  const handleFileSelect = (file) => {
    if (hasUnsavedChanges && currentFile) {
      if (!confirm('You have unsaved changes. Open new file anyway?')) {
        return;
      }
    }
    
    // Add to tabs if not already open
    const existingTab = openTabs.find(tab => tab.path === file.path);
    if (existingTab) {
      setActiveTab(existingTab.id);
    } else {
      const newTab = {
        id: Date.now(),
        filename: file.name,
        path: file.path,
        unsaved: false
      };
      setOpenTabs(prev => [...prev, newTab]);
      setActiveTab(newTab.id);
    }
    // File will be opened via socket event
  };

  // Handle tab change
  const handleTabChange = (tabId) => {
    const tab = openTabs.find(t => t.id === tabId);
    if (tab && socket) {
      socket.emit('open-file', { groupId, path: tab.path });
      setActiveTab(tabId);
    }
  };

  // Handle tab close
  const handleTabClose = (tabId) => {
    const tab = openTabs.find(t => t.id === tabId);
    if (tab?.unsaved) {
      if (!confirm('File has unsaved changes. Close anyway?')) {
        return;
      }
    }
    
    const newTabs = openTabs.filter(t => t.id !== tabId);
    setOpenTabs(newTabs);
    
    if (activeTab === tabId && newTabs.length > 0) {
      setActiveTab(newTabs[newTabs.length - 1].id);
    } else if (newTabs.length === 0) {
      setActiveTab(null);
      setCurrentFile(null);
      setContent('');
    }
  };

  // Handle search
  const handleSearch = (searchOptions) => {
    if (!editorRef.current) return [];
    
    const model = editorRef.current.getModel();
    const content = model.getValue();
    
    if (searchOptions.replace || searchOptions.replaceAll) {
      // Handle replace
      let newContent = content;
      if (searchOptions.replaceAll) {
        const regex = searchOptions.useRegex 
          ? new RegExp(searchOptions.searchTerm, searchOptions.caseSensitive ? 'g' : 'gi')
          : new RegExp(searchOptions.searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), searchOptions.caseSensitive ? 'g' : 'gi');
        newContent = content.replace(regex, searchOptions.replaceTerm);
      } else {
        const regex = searchOptions.useRegex 
          ? new RegExp(searchOptions.searchTerm, searchOptions.caseSensitive ? '' : 'i')
          : new RegExp(searchOptions.searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), searchOptions.caseSensitive ? '' : 'i');
        newContent = content.replace(regex, searchOptions.replaceTerm);
      }
      model.setValue(newContent);
      return [];
    }
    
    // Search and return results
    const lines = content.split('\n');
    const results = [];
    lines.forEach((line, index) => {
      if (line.toLowerCase().includes(searchOptions.searchTerm.toLowerCase())) {
        results.push({
          file: currentFile || 'Untitled',
          line: index + 1,
          text: line.trim()
        });
      }
    });
    return results;
  };

  // Handle extension install
  const handleExtensionInstall = (extension) => {
    setExtensions(prev => [...prev, { ...extension, installed: true, enabled: true }]);
    alert(`${extension.name} installed successfully!`);
  };

  // Handle extension uninstall
  const handleExtensionUninstall = (extensionId) => {
    setExtensions(prev => prev.filter(ext => ext.id !== extensionId));
    alert('Extension uninstalled successfully!');
  };

  // Handle extension toggle
  const handleExtensionToggle = (extensionId) => {
    setExtensions(prev => prev.map(ext => 
      ext.id === extensionId ? { ...ext, enabled: !ext.enabled } : ext
    ));
  };

  // Update settings and apply to editor
  const handleSettingsChange = (newSettings) => {
    setSettings(newSettings);
    if (editorRef.current) {
      editorRef.current.updateOptions({
        fontSize: newSettings.fontSize,
        minimap: { enabled: newSettings.minimap },
        tabSize: newSettings.tabSize,
        wordWrap: newSettings.wordWrap ? 'on' : 'off',
        lineNumbers: newSettings.lineNumbers ? 'on' : 'off',
        folding: newSettings.folding,
        renderWhitespace: newSettings.renderWhitespace ? 'all' : 'none',
        'bracketPairColorization.enabled': newSettings.bracketPairColorization
      });
    }
  };

  // Auto-save effect
  useEffect(() => {
    if (settings.autoSave && hasUnsavedChanges && currentFile) {
      const timer = setTimeout(() => {
        handleSaveFile();
      }, 2000); // Auto-save after 2 seconds of inactivity
      return () => clearTimeout(timer);
    }
  }, [settings.autoSave, hasUnsavedChanges, content, currentFile]);

  // Track unsaved changes in tabs
  useEffect(() => {
    if (activeTab && !isRemoteChange.current) {
      setOpenTabs(prev => prev.map(tab => 
        tab.id === activeTab ? { ...tab, unsaved: true } : tab
      ));
    }
  }, [content, activeTab]);

  // Track unsaved changes
  useEffect(() => {
    if (currentFile && !isRemoteChange.current) {
      setHasUnsavedChanges(true);
    }
  }, [content, currentFile]);

  // Handle language change
  const handleLanguageChange = (newLanguage) => {
    setLanguage(newLanguage);
    if (socket && isConnected) {
      socket.emit('language-change', {
        groupId,
        language: newLanguage
      });
    }
  };



  return (
    <div className={`collaborative-editor theme-${theme}`}>
      <div className="editor-header">
        <div className="header-left">
          <h2>Collaborative Code Editor</h2>
          <div className="group-info">
            <span className="group-id">Group: {groupId}</span>
          </div>
          <div className="file-menu">
            <button onClick={handleNewFile} className="btn-file" title="New File">
              📝 New
            </button>
            <button onClick={handleOpenFile} className="btn-file" title="Open File from Computer">
              📂 Open
            </button>
            <button onClick={handleDownloadFile} className="btn-file" title="Download Current File">
              💾 Download
            </button>
            {currentFile && (
              <span className="current-file">📄 {currentFile}</span>
            )}
          </div>
        </div>
        
        <div className="header-center">
          <LanguageSelector
            currentLanguage={language}
            onLanguageChange={handleLanguageChange}
          />
        </div>

        <div className="header-right">
          <ThemeSwitcher
            currentTheme={theme}
            onThemeChange={setTheme}
          />
          <div className="header-divider"></div>
          <div className="connection-status">
            <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}></span>
            {isConnected ? 'Connected' : 'Disconnected'}
          </div>
          <button onClick={onLeaveGroup} className="btn-leave">
            Leave Group
          </button>
        </div>
      </div>

      {showInfoBanner && (
        <div className="info-banner">
          <div className="info-content">
            <span className="info-icon">ℹ️</span>
            <span className="info-text">
              <strong>Persistent Storage:</strong> All files and folders in this group are automatically saved. 
              Everyone in the group can access, edit, and create files. Changes are synced in real-time!
            </span>
          </div>
          <button className="info-close" onClick={() => setShowInfoBanner(false)} title="Close">
            ✖
          </button>
        </div>
      )}

      {openTabs.length > 0 && (
        <FileTabs
          tabs={openTabs}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onTabClose={handleTabClose}
        />
      )}

      <div className="editor-main">
        <div className="editor-wrapper-full">
          <Editor
            height="100%"
            language={language}
            value={content}
            theme={theme === 'vs' ? 'custom-light' : theme === 'hc-black' ? 'custom-hc-black' : 'custom-dark-green'}
            onMount={handleEditorDidMount}
            options={{
              selectOnLineNumbers: true,
              roundedSelection: false,
              readOnly: false,
              cursorStyle: 'line',
              automaticLayout: true,
            }}
          />
        </div>

        <UserPanel users={users} currentUserId={userId} />
      </div>

      <OutputPanel
        output={output}
        isRunning={isRunning}
        onRun={handleRunCode}
        onClear={handleClearOutput}
      />
    </div>
  );
}

export default CollaborativeEditor;
