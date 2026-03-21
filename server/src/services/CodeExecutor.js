import fetch from 'node-fetch'; // if node > 18, native fetch is used, but we'll use native fetch safely

/**
 * Code Executor Service using JDoodle API
 * Executes code securely over remote compilation
 */
class CodeExecutor {
  constructor() {
    this.clientId = process.env.JDOODLE_CLIENT_ID || 'f0cb76d7a379d0cc07c24faf34d67bdb';
    this.clientSecret = process.env.JDOODLE_CLIENT_SECRET || '75cfe99c9038bc8c894b9ea61a5f8f7a4e99e076a1aa1ecad9485b98c1256fcc';
  }

  /**
   * Execute code based on language via JDoodle API
   */
  async executeCode(code, language, input = '') {
    try {
      const startTime = Date.now();

      const jdoodleLangMap = {
        'javascript': { language: 'nodejs', versionIndex: '4' },
        'js': { language: 'nodejs', versionIndex: '4' },
        'python': { language: 'python3', versionIndex: '4' },
        'py': { language: 'python3', versionIndex: '4' },
        'java': { language: 'java', versionIndex: '4' },
        'cpp': { language: 'cpp17', versionIndex: '0' },
        'c++': { language: 'cpp17', versionIndex: '0' },
        'c': { language: 'c', versionIndex: '5' },
        'go': { language: 'go', versionIndex: '4' },
        'typescript': { language: 'nodejs', versionIndex: '4' }, // JDoodle uses nodejs, we might need a workaround for TS, but let's map to JS
        'ts': { language: 'nodejs', versionIndex: '4' }
      };

      const mappedLang = jdoodleLangMap[language.toLowerCase()];

      if (!mappedLang) {
        return {
          success: false,
          error: `Language "${language}" is not supported for execution yet.`,
          output: '',
          executionTime: 0
        };
      }

      // JDoodle API Request
      const response = await fetch('https://api.jdoodle.com/v1/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          script: code,
          language: mappedLang.language,
          versionIndex: mappedLang.versionIndex,
          stdin: input,
          clientId: this.clientId,
          clientSecret: this.clientSecret
        })
      });

      if (!response.ok) {
        throw new Error(`Execution Service Blocked or Failed: ${response.statusText}`);
      }

      const result = await response.json();
      const executionTime = Date.now() - startTime;

      // JDoodle gives { output, statusCode, memory, cpuTime, error }
      // If error occurs, it is usually provided in output or error field
      if (result.error) {
        return {
          success: false,
          output: '',
          error: result.error,
          executionTime
        };
      }

      // Check if compilation failed or if there was a runtime error
      const isSuccess = result.statusCode === 200;
      let finalOutput = result.output;
      let finalError = null;

      if (!isSuccess || finalOutput === null) {
        finalError = result.output || 'Execution failed';
        finalOutput = '';
      } else {
        if (finalOutput === '\\n' || finalOutput.trim() === '') {
          finalOutput = 'Program executed successfully (no output)';
        }
      }

      return {
        success: isSuccess,
        output: finalOutput,
        error: finalError,
        executionTime: Math.max(parseFloat(result.cpuTime) * 1000 || executionTime, 0)
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
