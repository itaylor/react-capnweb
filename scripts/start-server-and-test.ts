#!/usr/bin/env deno run --allow-all

const [startCommand, testCommand] = Deno.args;

// Parse command string into program and args
function parseCommand(command: string): [string, string[]] {
  const parts = command.trim().split(/\s+/);
  return [parts[0], parts.slice(1)];
}

const [startProgram, startArgs] = parseCommand(startCommand);
const [testProgram, testArgs] = parseCommand(testCommand);

// Start both processes
const serverProcess = new Deno.Command(startProgram, {
  args: startArgs,
  stdout: 'inherit',
  stderr: 'inherit',
}).spawn();

const testProcess = new Deno.Command(testProgram, {
  args: testArgs,
  stdout: 'inherit',
  stderr: 'inherit',
}).spawn();

let finished = false;

// When server exits, kill test
serverProcess.status.then((result) => {
  if (!finished) {
    finished = true;
    testProcess.kill('SIGTERM');
    Deno.exit(result.code);
  }
});

// When test exits, kill server
testProcess.status.then((result) => {
  if (!finished) {
    finished = true;
    serverProcess.kill('SIGTERM');
    Deno.exit(result.code);
  }
});

// Handle ctrl-c
Deno.addSignalListener('SIGINT', () => {
  if (!finished) {
    finished = true;
    serverProcess.kill('SIGTERM');
    testProcess.kill('SIGTERM');
    Deno.exit(130);
  }
});
