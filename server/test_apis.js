async function testPiston() {
  try {
    const response = await fetch('https://emkc.org/api/v2/piston/runtimes', {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    console.log('Piston Status:', response.status, response.statusText);
    if (!response.ok) return;
    const runtimes = await response.json();
    console.log('Java runtimes:', runtimes.filter(r => r.language === 'java').map(r => r.version));
  } catch (e) {
    console.error('Piston Error:', e.message);
  }
}

async function testJDoodle() {
  // JDoodle is 100% auth required, skip.
}

async function testWandbox() {
  try {
    const response = await fetch('https://wandbox.org/api/compile.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      body: JSON.stringify({
        code: `public class Main { public static void main(String[] args) { System.out.println("Hello from Wandbox!"); } }`,
        compiler: 'openjdk-jdk-15.0.2',
        save: false
      })
    });
    console.log('Wandbox Status:', response.status, response.statusText);
    const data = await response.json();
    console.log('Wandbox Output:', data.program_output || data.compiler_error);
  } catch (e) {
    console.error('Wandbox Error:', e.message);
  }
}

async function testJudge0() {
  // official judge0 extra api
  try {
    const response = await fetch('https://judge0-extra.p.rapidapi.com/submissions?wait=true', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      body: JSON.stringify({
        source_code: 'print("hello")',
        language_id: 71
      })
    });
    console.log('Judge0 Status:', response.status);
  } catch (e) {
    console.log('Judge0 Error');
  }
}

testPiston().then(testWandbox).then(testJudge0);
