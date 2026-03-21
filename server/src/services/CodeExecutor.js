import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Code Executor Service using Piston API
 * Executes code in various languages without needing local compilers
 */
class CodeExecutor {
  constructor() {
    this.timeout = 10000; // 10 seconds
  }

  /**
   * Execute code based on language via Piston API
   */
  async executeCode(code, language, input = '') {
    try {
      const startTime = Date.now();
      
      const pistonLangMap = {
        'javascript': 'javascript',
        'js': 'javascript',
        'python': 'python',
        'py': 'python',
        'java': 'java',
        'cpp': 'c++',
        'c++': 'c++',
        'c': 'c',
        'go': 'go',
        'typescript': 'typescript',
        'ts': 'typescript'
      };

      const mappedLang = pistonLangMap[language.toLowerCase()];

      if (!mappedLang) {
        return {
          success: false,
          error: `Language "${language}" is not supported for execution yet.`,
          output: '',
          executionTime: 0
        };
      }

      // Special case for Java: determine class name or fallback
      let mainFileName = 'main.' + mappedLang;
      if (mappedLang === 'java') {
        const classNameMatch = code.match(/public\s+class\s+(\w+)/);
        if (classNameMatch) {
          mainFileName = classNameMatch[1] + '.java';
        } else {
          mainFileName = 'Main.java'; // fallback
        }
      }

      // Call Piston API
      const response = await fetch('https://emkc.org/api/v2/piston/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          language: mappedLang,
          version: '*', // auto-select latest
          files: [
            {
              name: mainFileName,
              content: code
            }
          ],
          stdin: input,
          compile_timeout: this.timeout,
          run_timeout: this.timeout
        })
      });

      if (!response.ok) {
        throw new Error(`Piston API Error: ${response.statusText}`);
      }

      const result = await response.json();
      
      const executionTime = Date.now() - startTime;
      
      if (result.compile && result.compile.code !== 0) {
        return {
          success: false,
          output: '',
          error: 'Compilation Error:\n' + result.compile.output,
          executionTime
        };
      }
      
      if (result.run && result.run.code !== 0) {
        return {
          success: false,
          output: result.run.stdout || '',
          error: 'Runtime Error:\n' + (result.run.stderr || result.run.output),
          executionTime
        };
      }

      return {
        success: true,
        output: result.run ? result.run.output : 'Execution failed',
        error: null,
        executionTime
      };

    } catch (error) {
      return {
        success: false,
        error: error.message || 'Execution failed',
        output: '',
        executionTime: 0
      };
    }
  }
}

export default CodeExecutor;
