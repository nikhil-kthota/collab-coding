import React, { useState, useEffect, useRef } from 'react';
import './Terminal.css';

const Terminal = ({ socket, groupId }) => {
  const [output, setOutput] = useState([]);
  const [command, setCommand] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const terminalEndRef = useRef(null);

  useEffect(() => {
    if (!socket) return;

    socket.on('terminal-output', (data) => {
      setOutput(prev => [...prev, {
        type: 'output',
        text: data.output,
        timestamp: new Date().toLocaleTimeString(),
        user: data.user
      }]);
    });

    socket.on('terminal-error', (data) => {
      setOutput(prev => [...prev, {
        type: 'error',
        text: data.error,
        timestamp: new Date().toLocaleTimeString()
      }]);
    });

    return () => {
      socket.off('terminal-output');
      socket.off('terminal-error');
    };
  }, [socket]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [output]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!command.trim() || !socket) return;

    setOutput(prev => [...prev, {
      type: 'command',
      text: command,
      timestamp: new Date().toLocaleTimeString()
    }]);

    socket.emit('terminal-command', {
      groupId,
      command: command.trim()
    });

    setCommand('');
  };

  const handleClear = () => {
    setOutput([]);
  };

  return (
    <div className={`terminal-container ${isExpanded ? 'expanded' : ''}`}>
      <div className="terminal-header">
        <div className="terminal-title">
          <span>💻 Terminal</span>
        </div>
        <div className="terminal-controls">
          <button onClick={handleClear} title="Clear">🗑️</button>
          <button 
            onClick={() => setIsExpanded(!isExpanded)} 
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? '⬇️' : '⬆️'}
          </button>
        </div>
      </div>

      {isExpanded && (
        <>
          <div className="terminal-output">
            {output.length === 0 ? (
              <div className="terminal-welcome">
                Welcome to integrated terminal. Type commands to execute.
              </div>
            ) : (
              output.map((item, index) => (
                <div key={index} className={`terminal-line ${item.type}`}>
                  <span className="terminal-timestamp">[{item.timestamp}]</span>
                  {item.type === 'command' && <span className="terminal-prompt">$</span>}
                  {item.user && <span className="terminal-user">{item.user}:</span>}
                  <span className="terminal-text">{item.text}</span>
                </div>
              ))
            )}
            <div ref={terminalEndRef} />
          </div>

          <form className="terminal-input-container" onSubmit={handleSubmit}>
            <span className="terminal-prompt">$</span>
            <input
              type="text"
              className="terminal-input"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="Enter command..."
              autoComplete="off"
            />
          </form>
        </>
      )}
    </div>
  );
};

export default Terminal;
